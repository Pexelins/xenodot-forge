// Hermes tool: the ONE bridge from the Xenodot Hive to an external Hermes Agent
// (https://hermes-agent.nousresearch.com/) running as a subordinate researcher. Only
// the Hive (orchestrator main loop) calls it — no sub-agent frontmatter grants it, and
// it has no auto-allow branch in canUseTool, so every dispatch passes the per-call
// permission gate (allow/deny in the web UI). Hermes investigates; it never writes
// files or adopts anything — its findings come back as the tool result, which the Hive
// hands to a Xenodot researcher for the human verdict + the in-convention library write.
//
// Graceful absence: if Hermes is off/unconfigured the handler returns a plain advisory
// string (never throws), so the framework runs exactly as today and the Hive falls back
// to dispatching the researcher sub-agents itself.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { parseJSON } from "../lib/json.js";
import { getHermesConfig } from "./config.js";

/** The Hermes `runs` event fields we read (everything else is ignored).
 * @typedef {{ run_id?: string, id?: string, output_text?: string, delta?: string, text?: string, message?: string, status?: string }} HermesEvent */
/** @typedef {(obj: import("../lib/types.js").OutMsg) => void} Send */

/** A single relayed progress line, pushed to the UI activity log via `send`.
 * @param {Send} send @param {"start" | "progress" | "done"} phase @param {string} text @param {string} [runId] */
function relay(send, phase, text, runId) {
  send({ type: "hermes", phase, runId, text });
}

/** The most useful text on one event. @param {HermesEvent} e @returns {string} */
function eventText(e) {
  return e.output_text ?? e.delta ?? e.text ?? e.message ?? e.status ?? "";
}

/** Join the `data:` lines of one raw SSE block ("" for a keepalive/comment).
 * @param {string} block @returns {string} */
function sseData(block) {
  return block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
}

/** Parse one SSE data payload into a typed event, or null if it isn't JSON.
 * @param {string} data @returns {HermesEvent | null} */
function parseEvent(data) {
  try {
    return /** @type {HermesEvent} */ (parseJSON(data));
  } catch {
    return null;
  }
}

/** Read a streamed (SSE) Hermes run: relay each progress event, return the final text.
 * @param {ReadableStream<Uint8Array>} body @param {Send} send @returns {Promise<string>} */
async function readStream(body, send) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let last = "";
  /** @type {string | undefined} */
  let runId;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line.
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const data = sseData(buf.slice(0, sep));
      buf = buf.slice(sep + 2);
      if (!data || data === "[DONE]") continue;
      const evt = parseEvent(data);
      if (!evt) continue;
      runId ??= evt.run_id ?? evt.id;
      if (evt.output_text) last = evt.output_text;
      const text = eventText(evt).trim();
      if (text) relay(send, "progress", text.slice(0, 240), runId);
    }
  }
  return last || "(Hermes returned no final text)";
}

/** Read a non-streamed JSON response and return its final text.
 * @param {Response} res @returns {Promise<string>} */
async function readWhole(res) {
  const body = parseEvent(await res.text().catch(() => "{}")) ?? {};
  return body.output_text ?? body.text ?? "(Hermes returned no final text)";
}

/** Open a Hermes `runs` session, relay progress to the UI, return the final findings.
 * @param {{ apiUrl: string, apiKey: string, model: string }} cfg
 * @param {{ task: string, context?: string }} input @param {Send} send @param {AbortSignal} signal
 * @returns {Promise<string>} */
async function runHermes(cfg, input, send, signal) {
  const prompt = input.context ? `${input.task}\n\n## Context\n${input.context}` : input.task;
  const res = await fetch(`${cfg.apiUrl.replace(/\/+$/, "")}/v1/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
      accept: "text/event-stream",
    },
    body: JSON.stringify({ model: cfg.model, input: prompt, stream: true }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Hermes ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }
  return res.body && typeof res.body.getReader === "function"
    ? readStream(res.body, send)
    : readWhole(res);
}

/** @param {Send} send */
export function makeHermesTool(send) {
  return tool(
    "hermes",
    "Delegate a heavy, multi-step research/investigation to the external Hermes Agent " +
      "(the main researcher). Use for capability-gap, tooling, or knowledge-gap research that " +
      "benefits from Hermes' web search + memory + skills; keep quick lookups local. ONLY the " +
      "Hive calls this — sub-agents never do. Hermes is advisory: it investigates and returns " +
      "findings; it NEVER writes files or adopts anything. Hand the returned findings to the " +
      "matching xenodot:*-researcher, which owns the human adopt/reject verdict and the library " +
      "write. Every call is gated (allow/deny) in the UI. If it reports Hermes is off/unconfigured, " +
      "dispatch the researcher sub-agent yourself instead.",
    {
      task: z.string().describe("The single research question / investigation to delegate."),
      context: z
        .string()
        .optional()
        .describe(
          "Optional background: what we already know, constraints, what a good answer looks like.",
        ),
      timeout_s: z
        .number()
        .optional()
        .describe("Max seconds to wait for Hermes before giving up (default 300)."),
    },
    async (input) => {
      const cfg = getHermesConfig();
      if (!cfg.enabled || !cfg.apiUrl || !cfg.apiKey) {
        return {
          content: [
            {
              type: "text",
              text:
                "Hermes is off or not configured (enable it + set the API key in Settings, or via " +
                "`npm run hermes`). Fall back to dispatching the matching xenodot:*-researcher to " +
                "investigate this yourself.",
            },
          ],
        };
      }
      const ctrl = new AbortController();
      const ms = Math.max(1, input.timeout_s ?? 300) * 1000;
      const timer = setTimeout(() => {
        ctrl.abort();
      }, ms);
      relay(send, "start", input.task.slice(0, 240));
      try {
        // cfg.apiUrl/apiKey are non-null past the guard; pass a narrowed copy.
        const findings = await runHermes(
          { apiUrl: cfg.apiUrl, apiKey: cfg.apiKey, model: cfg.model },
          input,
          send,
          ctrl.signal,
        );
        relay(send, "done", "Hermes finished.");
        return { content: [{ type: "text", text: findings }] };
      } catch (err) {
        const msg = ctrl.signal.aborted
          ? `Hermes timed out after ${Math.round(ms / 1000)}s.`
          : `Hermes call failed: ${err instanceof Error ? err.message : String(err)}`;
        relay(send, "done", msg);
        return {
          content: [
            {
              type: "text",
              text: `${msg} Treat this as no Hermes result — fall back to a xenodot:*-researcher for this investigation.`,
            },
          ],
        };
      } finally {
        clearTimeout(timer);
      }
    },
  );
}
