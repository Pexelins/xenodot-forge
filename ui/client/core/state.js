// Shared mutable view state. The IIFE that used to wrap the whole client gave
// these a common closure; as ES modules we keep the few genuinely-shared bits
// here so any module can read/update them without circular imports.

/** Mutable view context. `projectDir` is set once `/api/state` loads and read
 * by the activity log to strip the (noisy, constant) project path from output.
 * @type {{ projectDir: string }} */
export const view = { projectDir: "" };

/** Session id to resume, from `?resume=<id>` — null for a fresh session. */
export const resumeId = new URLSearchParams(location.search).get("resume");
