// Autonomous Mode state — a standing "Main Goal" the hive self-drives toward,
// persisted next to the game project (like tasks-store.js) so the ON/OFF flag and
// the goal survive a session resume. Pure disk module: no per-connection state,
// re-read/written on each mutation. The control messages (session.js) funnel here.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { PROJECT_DIR } from "../../core/config.js";

/** @typedef {import("../../../lib/types.js").Autonomous} Autonomous */

/** Default check cadence — the "cron/5-minute timeout" from the design. */
export const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/** @returns {string} */
const dir = () => path.join(PROJECT_DIR, ".xenomoon");
/** @returns {string} */
const filePath = () => path.join(dir(), "autonomous.json");

/** The OFF state — a fresh, inactive goal. @returns {Autonomous} */
function blank() {
  return {
    active: false,
    goal: "",
    intervalMs: DEFAULT_INTERVAL_MS,
    startedAt: null,
    lastCheckAt: null,
    checks: 0,
    status: null,
    report: null,
  };
}

/** Read persisted state; an absent or corrupt file is the OFF state.
 * @returns {Autonomous} */
export function readAutonomous() {
  try {
    const parsed = parseJSON(readFileSync(filePath(), "utf8"));
    return parsed && typeof parsed === "object"
      ? { ...blank(), .../** @type {Autonomous} */ (parsed) }
      : blank();
  } catch {
    return blank();
  }
}

/** @param {Autonomous} state @returns {Autonomous} */
function write(state) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(state, null, 2) + "\n");
  return state;
}

/** Turn autonomous mode ON with a goal. Resets the check counters.
 * @param {string} goal @param {string} now ISO timestamp
 * @param {number} [intervalMs] @returns {Autonomous} */
export function startAutonomous(goal, now, intervalMs = DEFAULT_INTERVAL_MS) {
  return write({
    ...blank(),
    active: true,
    goal: String(goal ?? "").slice(0, 2000),
    intervalMs,
    startedAt: now,
    status: "running",
  });
}

/** Turn it OFF (user hit Stop). Keeps the goal text for reference but clears active.
 * @param {string} now @returns {Autonomous} */
export function stopAutonomous(now) {
  const prev = readAutonomous();
  return write({ ...prev, active: false, status: "paused", lastCheckAt: now });
}

/** Record one check tick (advances the counter the badge tooltip shows).
 * @param {string} now @returns {Autonomous} */
export function recordCheck(now) {
  const prev = readAutonomous();
  if (!prev.active) return prev;
  return write({ ...prev, checks: prev.checks + 1, lastCheckAt: now });
}

/** Stamp the latest one-line progress note (mcp__ui__autonomous op:"progress").
 * @param {string} note @param {string} now @returns {Autonomous} */
export function setProgress(note, now) {
  const prev = readAutonomous();
  if (!prev.active) return prev;
  return write({ ...prev, status: String(note ?? "").slice(0, 300), lastCheckAt: now });
}

/** Goal achieved — file the final report and turn OFF.
 * @param {string} report @param {string} now @returns {Autonomous} */
export function completeAutonomous(report, now) {
  const prev = readAutonomous();
  return write({
    ...prev,
    active: false,
    status: "complete",
    report: String(report ?? "").slice(0, 4000),
    lastCheckAt: now,
  });
}
