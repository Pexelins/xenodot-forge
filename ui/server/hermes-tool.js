// Hermes tool: the ONE bridge from the Xenodot Hive to an external Hermes Agent
// (https://hermes-agent.nousresearch.com/) running as a subordinate researcher coworker. Only the
// Hive (orchestrator main loop) calls it — no sub-agent frontmatter grants it, and it has no
// auto-allow branch in canUseTool, so every dispatch passes the per-call permission gate.
//
// FIRE-AND-FORGET. Hermes runs its OWN agent loop server-side, so we never block on it: we POST
// the run and return immediately. Hermes reports back on its own by calling our MCP callback tools
// (see mcp-callback.js): `post_update` streams progress to the activity feed, `deliver_findings`
// hands the final findings to the Hive — pushed into the session inbox as a new turn, exactly like
// a user message, so the Hive resumes with them without anything having been held open.
//
// Correlation: Hermes passes NO caller context to an MCP tool, so each run carries a one-off
// `token` we mint here, inject into the run's `instructions`, and register against this session's
// feed+inbox (hermes-runs.js). Hermes echoes the token on every callback so we route it back.
//
// Hermes "runs" API (docs/user-guide/features/api-server):
//   POST /v1/runs {input, instructions?} -> {run_id, status}   (returns at once; loop runs server-side)
//   Auth: Authorization: Bearer <API_SERVER_KEY>
// The request `model` is server-side/cosmetic on a single-profile Hermes, so we don't send it.
//
// Graceful absence: if Hermes is off/unconfigured the handler returns a plain advisory string
// (never throws), so the framework runs exactly as today and the Hive dispatches a researcher itself.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { parseJSON } from "../lib/json.js";
import { getHermesConfig } from "./config.js";
import { getPersona, PERSONA_IDS } from "../lib/hermes-personas.js";
import { registerRun } from "./hermes-runs.js";

/** @typedef {(obj: import("../lib/types.js").OutMsg) => void} Send */
/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */
/** @typedef {(msg: SDKUserMessage) => void} Push */
/** @typedef {import("../lib/hermes-personas.js").HermesPersona} HermesPersona */

/** A tool text result, in the shape the agent SDK expects. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

/** Push a Hermes activity line to the UI feed; `persona` names + colors the pill.
 * @param {Send} send @param {string} persona @param {"start" | "progress" | "done"} phase
 * @param {string} text @param {string} [runId] */
function relay(send, persona, phase, text, runId) {
  send({ type: "hermes", phase, runId, text, persona });
}

/** Parse a JSON payload, or null if it isn't JSON. @param {string} data @returns {unknown} */
function parseAs(data) {
  try {
    return parseJSON(data);
  } catch {
    return null;
  }
}

const authHeaders = (/** @type {string} */ key) => ({ authorization: `Bearer ${key}` });
const baseOf = (/** @type {string} */ url) => url.replace(/\/+$/, "");

/** Compose a run's `instructions`: the persona's standing brief, the callback protocol (HOW to
 * report back, carrying the run's token), and the Hive's task `context`. Hermes appends all of this
 * to its own SOUL/base persona. @param {HermesPersona} persona @param {string} token
 * @param {string} [context] @returns {string} */
function buildInstructions(persona, token, context) {
  const protocol =
    "\n\n--- Reporting back (REQUIRED) ---\n" +
    "You run headless; your ONLY channel to your human is these Xenodot MCP tools:\n" +
    "• mcp_xenodot_post_update(token, text) — call as you work, to stream progress they watch live.\n" +
    "• mcp_xenodot_deliver_findings(token, text) — call EXACTLY ONCE at the very end, with your full findings.\n" +
    `ALWAYS pass token="${token}". If you finish WITHOUT calling mcp_xenodot_deliver_findings, your work is lost.`;
  const extra = context?.trim();
  return persona.brief + protocol + (extra ? `\n\n--- Task context ---\n${extra}` : "");
}

/** Create a run and return its id. The POST returns immediately; the agent loops server-side.
 * @param {string} base @param {string} key @param {string} task @param {string} instructions
 * @param {AbortSignal} signal @returns {Promise<string>} */
async function createRun(base, key, task, instructions, signal) {
  const res = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(key) },
    body: JSON.stringify({ input: task, instructions }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Hermes ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }
  const body = /** @type {{ run_id?: string } | null} */ (
    parseAs(await res.text().catch(() => "{}"))
  );
  const runId = body?.run_id;
  if (!runId) throw new Error("Hermes did not return a run_id");
  return runId;
}

/** The synthetic user turn that delivers Hermes' findings back to the Hive (same shape as a real
 * user message — see session.js inbox.push). @param {string} runId @param {HermesPersona} persona
 * @param {string} findings @returns {SDKUserMessage} */
function findingsTurn(runId, persona, findings) {
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `[Hermes · ${persona.name} — run ${runId} delivered its findings]\n\n${findings}\n\n` +
            "Hand these to the matching xenodot:*-researcher for the human verdict + library write.",
        },
      ],
    },
  };
}

/** Build the Hermes start tool. Fire-and-forget: POST the run, register a callback token, return
 * at once. Hermes reports back via the MCP callback tools (mcp-callback.js).
 * @param {Send} send @param {Push} push the session inbox.push — how findings re-enter the Hive */
export function makeHermesTool(send, push) {
  return tool(
    "hermes",
    "Delegate a heavy, multi-step research/investigation to your external Hermes coworker " +
      "(web search + memory). FIRE-AND-FORGET: this returns immediately; Hermes works in the " +
      "background, streams progress to the feed, and delivers its findings to you LATER as a new " +
      "message — so DO NOT wait on it; continue or wrap up the turn. Pick a `persona`: 'researcher' " +
      "(default — cited investigation) or 'critic' (adversarially stress-test a claim/plan/findings). " +
      "ONLY the Hive calls this. Hermes is advisory — it never writes files or adopts anything; when " +
      "its findings arrive, hand them to the matching xenodot:*-researcher for the verdict + library " +
      "write. Gated (allow/deny) per call. If it reports Hermes is off/unconfigured, dispatch the " +
      "researcher sub-agent yourself instead.",
    {
      task: z.string().describe("The single research question / investigation to delegate."),
      persona: z
        .enum(/** @type {[string, ...string[]]} */ (PERSONA_IDS))
        .optional()
        .describe(
          "Which coworker persona to delegate as: 'researcher' (default — deep, cited investigation) or 'critic' (adversarially stress-test a claim, plan, or set of findings).",
        ),
      context: z
        .string()
        .optional()
        .describe(
          "Optional background woven into Hermes' instructions: what we know, constraints, what a good answer looks like.",
        ),
    },
    async (input) => {
      const cfg = getHermesConfig();
      if (!cfg.enabled || !cfg.apiUrl || !cfg.apiKey) {
        return ok(
          "Hermes is off or not configured (enable it + set the API key in Settings, or via " +
            "`npm run hermes`). Fall back to dispatching the matching xenodot:*-researcher yourself.",
        );
      }
      const persona = getPersona(input.persona);
      const token = randomBytes(16).toString("hex");
      const instructions = buildInstructions(persona, token, input.context);
      // Short timeout for the POST only — it returns fast; we never hold the run open.
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        ctrl.abort();
      }, 30_000);
      try {
        const runId = await createRun(
          baseOf(cfg.apiUrl),
          cfg.apiKey,
          input.task,
          instructions,
          ctrl.signal,
        );
        registerRun(token, {
          persona: persona.id,
          runId,
          onUpdate: (text) => {
            relay(send, persona.id, "progress", text, runId);
          },
          onFindings: (text) => {
            relay(send, persona.id, "done", "Hermes delivered its findings.", runId);
            try {
              push(findingsTurn(runId, persona, text));
            } catch {
              /* session gone — nothing to deliver to */
            }
          },
        });
        relay(send, persona.id, "start", input.task.slice(0, 240), runId);
        return ok(
          `Hermes ${persona.name} run started (id ${runId}) — working in the background. It will ` +
            "stream progress to the feed and deliver its findings to you as a new message. Do not " +
            "wait; continue or wrap up this turn.",
        );
      } catch (err) {
        const msg = ctrl.signal.aborted
          ? "Hermes did not accept the run within 30s."
          : `Hermes call failed: ${err instanceof Error ? err.message : String(err)}`;
        relay(send, persona.id, "done", msg);
        return ok(
          `${msg} Treat this as no Hermes result — dispatch a xenodot:*-researcher instead.`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  );
}
