// Pure display formatters shared by the reducer, the activity log, and the
// approval cards. No DOM and no browser globals — safe to import anywhere,
// including the node-run reducer.check.js. (Lives apart from activity-log.js,
// which pulls in browser-only modules, so the reducer can stay node-runnable.)

/** Tool name -> log "kind" (drives the verb-pill color and the filter chips).
 * @type {Record<string, string>} */
export const VERB_KIND = {
  Read: "read",
  Glob: "read",
  Grep: "read",
  Write: "write",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Bash: "bash",
  Task: "task",
  Agent: "task",
  Skill: "task",
};

// Display-only: drop leading VAR=value && assignments from commands — the
// meaning starts after them (logs keep the full command).
/** @param {string} t @returns {string} */
export const stripEnvPrefix = (t) => t.replace(/^(?:\w+=\S+\s*&&\s*)+/, "");

/** The single most informative field of a tool call, for the activity log.
 * @param {import("../../lib/types.js").ToolInput} [input] @returns {string} */
export const toolDetail = (input) =>
  input?.file_path ??
  (input?.command ? stripEnvPrefix(input.command) : null) ??
  input?.pattern ??
  input?.skill ??
  input?.title ??
  (input ? JSON.stringify(input).slice(0, 120) : "");
