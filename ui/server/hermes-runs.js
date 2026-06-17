// Correlation registry for fire-and-forget Hermes runs.
//
// When the Hive fires a run (hermes-tool.js) we mint a one-off TOKEN and stash the wiring the
// run needs to report back: `onUpdate`/`onFindings` closures that capture this connection's
// `send` (the activity feed) and `inbox` (to message the Hive). Hermes, inside its own agent
// loop, calls our MCP callback tools (mcp-callback.js) and passes that token; the callback
// looks the run up here and routes the update to the right session.
//
// Why a token (not run_id): Hermes passes NOTHING about the calling run to an MCP tool handler
// (only the model's args; transport headers are static) — so the run must carry its own
// correlator, injected into the run's `instructions` and echoed back as a tool arg.
//
// Module-level (process-global) on purpose: the MCP server lives at the HTTP layer (index.js)
// while runs are registered from a per-WebSocket session (session.js) — they share this map.

/** @typedef {{
 *   onUpdate: (text: string) => void,
 *   onFindings: (text: string) => void,
 *   persona: string,
 *   runId: string,
 * }} HermesRun */

/** Live runs keyed by their callback token. @type {Map<string, HermesRun>} */
const runs = new Map();

/** Register a fired run under its callback token. @param {string} token @param {HermesRun} run */
export function registerRun(token, run) {
  runs.set(token, run);
}

/** Look up a run by token; undefined if unknown or already cleared. @param {string} token @returns {HermesRun | undefined} */
export function getRun(token) {
  return runs.get(token);
}

/** Forget a run (after it delivers findings, or on session teardown). @param {string} token */
export function clearRun(token) {
  runs.delete(token);
}
