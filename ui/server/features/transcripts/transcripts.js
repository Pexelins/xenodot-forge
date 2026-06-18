// Session listing & replay, read from Claude Code's own .jsonl transcript
// store — so EVERY session in this project is resumable, terminal ones
// included (agent-*.jsonl = sub-agent transcripts, skipped).
import { readFileSync, readdirSync, existsSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { TRANSCRIPT_DIR } from "../../core/config.js";

/** @param {import("../../../lib/types.js").TranscriptEntry} entry @returns {string | null} */
function transcriptText(entry) {
  // message.content is a string or an array of blocks; meta/command wrappers
  // start with "<" and are not conversation.
  const c = entry.message?.content;
  const text =
    typeof c === "string"
      ? c
      : (c ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
  const t = (text ?? "").trim();
  return t && !t.startsWith("<") && !t.startsWith("Caveat:") ? t : null;
}

/** @returns {import("../../../lib/types.js").RecentSession[]} */
export function recentSessions() {
  if (!existsSync(TRANSCRIPT_DIR)) return [];
  return readdirSync(TRANSCRIPT_DIR)
    .filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
    .map((f) => ({ f, mtime: statSync(path.join(TRANSCRIPT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15)
    .map(({ f, mtime }) => {
      /** @type {string | null} */
      let title = null;
      for (const line of readFileSync(path.join(TRANSCRIPT_DIR, f), "utf8")
        .split("\n")
        .slice(0, 80)) {
        if (!line) continue;
        /** @type {import("../../../lib/types.js").TranscriptEntry} */
        let e;
        try {
          e = /** @type {import("../../../lib/types.js").TranscriptEntry} */ (parseJSON(line));
        } catch {
          continue;
        }
        if (e.type === "user" && !e.isSidechain) {
          title = transcriptText(e);
          if (title) break;
        }
      }
      const d = new Date(mtime);
      /** @param {number} n */
      const pad = (n) => String(n).padStart(2, "0");
      return title
        ? {
            id: f.replace(/\.jsonl$/, ""),
            title: title.slice(0, 80),
            when: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
          }
        : null;
    })
    .filter((s) => s !== null);
}

/** Delete a session transcript. Returns false if the id is invalid or the file
 * does not exist.
 * @param {string} id @returns {boolean} */
export function deleteSession(id) {
  if (!/^[\w-]+$/.test(id)) return false;
  const file = path.join(TRANSCRIPT_DIR, `${id}.jsonl`);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

// Chat history (main-loop messages only) for replay when resuming. Tool calls
// and sub-agent chatter are skipped — the activity log is live-only; the chat
// is what gives continuity.
/** @param {string} id @returns {import("../../../lib/types.js").HistoryItem[]} */
export function sessionHistory(id) {
  const file = path.join(TRANSCRIPT_DIR, `${id}.jsonl`);
  if (!/^[\w-]+$/.test(id) || !existsSync(file)) return [];
  /** @type {import("../../../lib/types.js").HistoryItem[]} */
  const items = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    /** @type {import("../../../lib/types.js").TranscriptEntry} */
    let e;
    try {
      e = /** @type {import("../../../lib/types.js").TranscriptEntry} */ (parseJSON(line));
    } catch {
      continue;
    }
    if (e.isSidechain || (e.type !== "user" && e.type !== "assistant")) continue;
    const text = transcriptText(e);
    if (text) items.push({ role: e.type === "user" ? "user" : "assistant", text });
  }
  return items.slice(-100);
}
