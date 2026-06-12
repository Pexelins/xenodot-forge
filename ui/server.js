// POC web UI server for the Godot agent workflow.
// Bridges a browser (WebSocket) to a Claude Code session (Agent SDK).
//
// Usage: node ui/server.js /path/to/your/godot/project
//
// Requires Claude Code installed and authenticated on this machine —
// the SDK drives the same local Claude Code the terminal uses.

import http from "node:http";
import { readFileSync, readdirSync, existsSync, mkdirSync, createWriteStream, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const PROJECT_DIR = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const PORT = Number(process.env.PORT ?? 3117);

// Default permission policy for new sessions: ask | edits | all.
// Override per session from the UI header. AskUserQuestion always prompts.
const POLICIES = ["ask", "edits", "all"];
const DEFAULT_POLICY = args.find((a) => a.startsWith("--allow="))?.split("=")[1] ?? "ask";
if (!POLICIES.includes(DEFAULT_POLICY)) {
  console.error(`--allow must be one of: ${POLICIES.join(", ")}`);
  process.exit(1);
}
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// In-process MCP tool the main agent calls to put a typed form in front of
// the user (see makeFormTool). Like AskUserQuestion, the form IS the user
// interaction, so it bypasses the permission policy.
const FORM_TOOL = "mcp__ui__form";

// The main loop is an orchestrator: pinned model (not the user's default)
// and a routing-focused system prompt, editable in ui/orchestrator.md.
const MODEL = args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? "claude-sonnet-4-6";
const ORCHESTRATOR_PROMPT = readFileSync(
  path.join(__dirname, "orchestrator.md"),
  "utf8",
);

// Live project inventory — scanned on every request so it never drifts.
function walk(dir, exts, out = [], base = dir) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out, base);
    else if (exts.some((e) => entry.name.endsWith(e)))
      out.push(path.relative(base, full));
  }
  return out;
}

function firstHeading(file) {
  try {
    const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("# "));
    return line ? line.slice(2).trim() : path.basename(file);
  } catch {
    return path.basename(file);
  }
}

function projectState() {
  const dir = PROJECT_DIR;
  let name = path.basename(dir);
  try {
    const match = readFileSync(path.join(dir, "project.godot"), "utf8")
      .match(/config\/name="([^"]+)"/);
    if (match) name = match[1];
  } catch {}
  const agentsDir = path.join(dir, ".claude", "agents");
  const skillsDir = path.join(dir, ".claude", "skills");
  return {
    name,
    dir,
    designDocs: walk(path.join(dir, "design"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md"))
      .map((f) => ({ path: f, title: firstHeading(path.join(dir, f)) })),
    // Addon research catalog (written by addon-researcher) — the verdict
    // line makes adopt/reject visible from the sidebar without opening docs.
    library: walk(path.join(dir, "library"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md"))
      .map((f) => {
        const full = path.join(dir, f);
        let verdict = null;
        try {
          verdict = readFileSync(full, "utf8").match(/^\*\*Verdict\*\*\s*[—-]\s*(.+)$/m)?.[1].trim() ?? null;
        } catch {}
        return { path: f, title: firstHeading(full), verdict };
      }),
    scenes: walk(dir, [".tscn"], [], dir),
    scripts: walk(dir, [".gd"], [], dir),
    agents: existsSync(agentsDir)
      ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => {
          const model = readFileSync(path.join(agentsDir, f), "utf8")
            .match(/^model:\s*(\S+)/m)?.[1];
          return { name: f.replace(/\.md$/, ""), model: model ?? null };
        })
      : [],
    skills: existsSync(skillsDir)
      ? readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [],
  };
}

// Sessions come from Claude Code's own transcript store, so EVERY session
// in this project is listed and resumable — terminal ones included, not
// just sessions started through this UI. (agent-*.jsonl = sub-agent
// transcripts, skipped.)
const TRANSCRIPT_DIR = path.join(
  homedir(), ".claude", "projects", PROJECT_DIR.replace(/[/.]/g, "-"),
);

function transcriptText(entry) {
  // message.content is a string or an array of blocks; meta/command
  // wrappers start with "<" and are not conversation.
  const c = entry.message?.content;
  const text = typeof c === "string"
    ? c
    : (c ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const t = (text ?? "").trim();
  return t && !t.startsWith("<") && !t.startsWith("Caveat:") ? t : null;
}

function recentSessions() {
  if (!existsSync(TRANSCRIPT_DIR)) return [];
  return readdirSync(TRANSCRIPT_DIR)
    .filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
    .map((f) => ({ f, mtime: statSync(path.join(TRANSCRIPT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15)
    .map(({ f, mtime }) => {
      let title = null;
      for (const line of readFileSync(path.join(TRANSCRIPT_DIR, f), "utf8").split("\n").slice(0, 80)) {
        if (!line) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "user" && !e.isSidechain) {
          title = transcriptText(e);
          if (title) break;
        }
      }
      const d = new Date(mtime);
      const pad = (n) => String(n).padStart(2, "0");
      return title
        ? {
            id: f.replace(/\.jsonl$/, ""),
            title: title.slice(0, 80),
            when: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
          }
        : null;
    })
    .filter(Boolean);
}

// Chat history (main-loop messages only) for replay when resuming.
// Tool calls and sub-agent chatter are skipped — the activity log is
// live-only; the chat is what gives continuity.
function sessionHistory(id) {
  const file = path.join(TRANSCRIPT_DIR, `${id}.jsonl`);
  if (!/^[\w-]+$/.test(id) || !existsSync(file)) return [];
  const items = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.isSidechain || (e.type !== "user" && e.type !== "assistant")) continue;
    const text = transcriptText(e);
    if (text) items.push({ role: e.type, text });
  }
  return items.slice(-100);
}

// Static files are re-read per request — edit and refresh, no restart.
const STATIC = {
  "/": ["index.html", "text/html"],
  "/agent-ui.css": ["agent-ui.css", "text/css"],
  "/agent-ui.js": ["agent-ui.js", "text/javascript"],
};

const server = http.createServer((req, res) => {
  if (req.url === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(projectState()));
    return;
  }
  if (req.url === "/api/sessions") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recentSessions()));
    return;
  }
  const [file, type] = STATIC[req.url] ?? STATIC["/"];
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(path.join(__dirname, file)));
});

// Form tool: AskUserQuestion's pattern (pause, render, reply resumes)
// generalized to typed fields. The agent composes the form; the browser
// renders it; the submitted values return as the tool result.
const FIELD = z.object({
  id: z.string().describe("Result key for this field (snake_case)"),
  label: z.string().describe("Label shown above the field"),
  type: z.enum(["text", "textarea", "number", "checkbox", "select", "multiselect"]),
  options: z.array(z.object({
    label: z.string(),
    description: z.string().optional().describe("Shown as a tooltip on the option"),
  })).optional().describe("Choices — required for select/multiselect, ignored otherwise"),
  placeholder: z.string().optional().describe("Hint text for text/textarea/number fields"),
  required: z.boolean().optional().describe("Block submission until answered"),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional()
    .describe("Pre-filled value; array of option labels for multiselect"),
});

function makeFormTool(waitFor) {
  return tool(
    "form",
    "Show the user a form and wait for their answers. Use it over AskUserQuestion when you " +
      "need typed input (free text, numbers, toggles) or several answers in one go. The " +
      "session pauses until they submit; answers come back as JSON keyed by field id. " +
      "Keep forms short — ask only what you need to proceed.",
    {
      title: z.string().describe("Card header, a few words"),
      description: z.string().optional().describe("One line of context under the title"),
      fields: z.array(FIELD).min(1).max(10).describe("Fields in display order"),
      submitLabel: z.string().optional().describe('Submit button label, default "Submit"'),
    },
    async (input) => {
      const reply = await waitFor("form", { input });
      return {
        content: [{
          type: "text",
          text: reply?.cancelled
            ? "User dismissed the form without answering."
            : JSON.stringify(reply?.values ?? {}, null, 2),
        }],
      };
    },
  );
}

const wss = new WebSocketServer({ server });

const LOG_DIR = path.join(__dirname, "..", "logs");
mkdirSync(LOG_DIR, { recursive: true });

wss.on("connection", (ws, req) => {
  const resumeId = new URL(req.url, "http://localhost").searchParams.get("resume");
  // Full raw log: one JSON line per message, both directions.
  const sessionTag = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(LOG_DIR, `session-${sessionTag}.ndjson`);
  const logStream = createWriteStream(logFile, { flags: "a" });
  const log = (dir, obj) => {
    logStream.write(JSON.stringify({ ts: new Date().toISOString(), dir, ...obj }) + "\n");
    const brief =
      obj.type === "event"
        ? `${obj.message?.type}${obj.message?.subtype ? "/" + obj.message.subtype : ""}`
        : obj.type;
    console.log(`[${sessionTag}] ${dir} ${brief}`);
  };
  console.log(`session log: ${logFile}`);

  const send = (obj) => {
    log("out", obj);
    return ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));
  };

  // Inbox: async iterable the SDK consumes as the user side of the session.
  const queue = [];
  let wake = null;
  let closed = false;
  const inbox = (async function* () {
    while (!closed) {
      while (queue.length) yield queue.shift();
      await new Promise((r) => (wake = r));
    }
  })();

  // Pending interactions: question/permission/form id -> { type, resolve }.
  const pending = new Map();
  let nextId = 1;
  const waitFor = (type, payload) => {
    const id = nextId++;
    send({ type, id, ...payload });
    return new Promise((resolve) => pending.set(id, { type, resolve }));
  };

  let policy = DEFAULT_POLICY;
  const sessionAllowed = new Set(); // tools approved with "Always" this session
  const abort = new AbortController(); // tears the CLI down on disconnect

  async function canUseTool(toolName, input) {
    if (toolName === "AskUserQuestion") {
      const answers = await waitFor("ask", { input });
      return { behavior: "allow", updatedInput: { ...input, ...answers } };
    }
    if (toolName === FORM_TOOL) {
      // The tool handler does the waiting; nothing to gate here.
      return { behavior: "allow", updatedInput: input };
    }
    if (
      policy === "all" ||
      (policy === "edits" && EDIT_TOOLS.has(toolName)) ||
      sessionAllowed.has(toolName)
    ) {
      log("auto", { type: "permission", toolName, policy });
      return { behavior: "allow", updatedInput: input };
    }
    const { allow, always } = await waitFor("permission", { toolName, input });
    if (allow && always) sessionAllowed.add(toolName);
    return allow
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "Denied from the web UI" };
  }

  (async () => {
    try {
      send({ type: "policy", value: policy });
      if (resumeId) {
        send({ type: "history", items: sessionHistory(resumeId) });
        send({ type: "status", text: `resumed session ${resumeId.slice(0, 8)}…` });
      } else {
        send({ type: "status", text: `session starting in ${PROJECT_DIR}` });
      }
      for await (const message of query({
        prompt: inbox,
        options: {
          ...(resumeId ? { resume: resumeId } : {}),
          cwd: PROJECT_DIR,
          // Pick up the project's .claude/ (agents, skills) and CLAUDE.md.
          settingSources: ["user", "project", "local"],
          model: MODEL,
          // Keep Claude Code's tooling behavior, append the orchestrator role.
          systemPrompt: { type: "preset", preset: "claude_code", append: ORCHESTRATOR_PROMPT },
          canUseTool,
          abortController: abort,
          mcpServers: {
            ui: createSdkMcpServer({ name: "ui", version: "0.1.0", tools: [makeFormTool(waitFor)] }),
          },
        },
      })) {
        send({ type: "event", message });
      }
      send({ type: "status", text: "session ended" });
    } catch (err) {
      send({ type: "status", text: `session error: ${err.message}` });
    }
  })();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    log("in", msg);
    if (msg.type === "user_input") {
      queue.push({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: msg.text }] },
      });
      wake?.();
    } else if (msg.type === "reply" && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg.payload);
      pending.delete(msg.id);
    } else if (msg.type === "policy" && POLICIES.includes(msg.value)) {
      policy = msg.value;
    }
  });

  ws.on("close", () => {
    closed = true;
    wake?.();
    // Settle every pending interaction so canUseTool / the form handler
    // return and the CLI can finish its turn — an unresolved promise here
    // leaves an orphaned process holding the session, and its transcript
    // ends mid-tool_use (which 400s any later resume).
    for (const { type, resolve } of pending.values()) {
      resolve(type === "permission" ? { allow: false } : { cancelled: true });
    }
    pending.clear();
    abort.abort(); // then stop the session outright
    logStream.end();
  });
});

server.listen(PORT, () => {
  console.log(`UI on http://localhost:${PORT} — project: ${PROJECT_DIR}`);
});
