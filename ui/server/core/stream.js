// Best-effort context-meter helper for the session message stream. Split out of
// session.js to keep that file under its length cap.

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */

/** Read the session's live context-window usage and push it to the UI meter.
 * Best-effort: getContextUsage is a streaming-mode control request and can throw if the
 * turn raced the session teardown — a missing meter update is harmless, so swallow errors
 * rather than killing the message loop.
 * @param {{ getContextUsage?: () => Promise<{ totalTokens: number, maxTokens: number, percentage: number }> }} q
 * @param {(obj: OutMsg) => void} send */
export async function emitContextUsage(q, send) {
  try {
    const u = await q.getContextUsage?.();
    if (!u) return;
    send({
      type: "context",
      percentage: u.percentage,
      totalTokens: u.totalTokens,
      maxTokens: u.maxTokens,
    });
  } catch {
    // session ended or control request unsupported — skip this meter update
  }
}
