// The session-side glue for Autonomous Mode: turn the browser's start/stop control
// message into persisted state + a broadcast, push the kickoff turn (start) so the
// orchestrator evaluates the Main Goal immediately, and drive the recurring 5-minute
// CHECK LOOP — a server-side timer that pushes an `[Autonomous check #N]` turn into the
// session whenever it's idle, the same turn-injection mechanism Hermes findings and
// answered questions use. Kept out of session.js so that file stays under its size cap.
import {
  startAutonomous,
  stopAutonomous,
  readAutonomous,
  recordCheck,
} from "./autonomous-store.js";

/** @typedef {import("@anthropic-ai/claude-agent-sdk").SDKUserMessage} SDKUserMessage */

/** The synthetic user turn that kicks off Autonomous Mode: hands the orchestrator the
 * standing Main Goal with the evaluate→clarify→plan→dispatch instruction. Same shape as
 * a real user message. This is the up-front evaluation the user asked for ("evaluate the
 * goal beforehand, ask questions if necessary").
 * @param {string} goal @returns {SDKUserMessage} */
function kickoffTurn(goal) {
  return userTurn(
    `[Autonomous Mode started — Main Goal: "${goal}"]\n\n` +
      "Evaluate this goal now: restate it in one line, ask ONLY truly blocking " +
      "clarifications (via mcp__ui__form / AskUserQuestion — keep it minimal), then break " +
      "it into ordered board tasks (mcp__ui__tasks) and dispatch the first slice to the " +
      "right Xenodot. You are self-driving toward this goal; pause only when genuinely " +
      "blocked. When you judge it achieved, report and confirm with the user before stopping.",
  );
}

/** The recurring check turn (one per 5-minute tick): assess progress and move the goal
 * forward. @param {number} n the check number @param {string} goal @returns {SDKUserMessage} */
function checkTurn(n, goal) {
  return userTurn(
    `[Autonomous check #${n} — Main Goal: "${goal}"]\n\n` +
      "Assess progress against the goal using the task board. If a slice is still running, " +
      "let it finish — don't re-dispatch it. If the goal is achieved, report it and confirm " +
      'wrap-up with the user before calling mcp__ui__autonomous {op:"complete"}. Otherwise ' +
      'dispatch the next slice (background) and call mcp__ui__autonomous {op:"progress"} with ' +
      "a one-line status. Don't re-ask questions already open on the board (one-channel rule).",
  );
}

/** @param {string} text @returns {SDKUserMessage} */
function userTurn(text) {
  return {
    type: "user",
    parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

/** Build the check-loop controller. Holds the interval handle; arm() starts it from the
 * persisted cadence, disarm() clears it. Each tick fires ONLY when the session is idle
 * (isBusy() false) so check turns never stack on a turn already in flight.
 * @param {{ push: (m: SDKUserMessage) => void, send: (obj: import("../../../lib/types.js").OutMsg) => void, isBusy: () => boolean }} deps
 * @returns {{ arm: (fireNow?: boolean) => void, disarm: () => void }} */
export function makeCheckLoop({ push, send, isBusy }) {
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  const disarm = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    const state = readAutonomous();
    if (!state.active) {
      disarm(); // turned off elsewhere — stop ticking
      return;
    }
    if (isBusy()) return; // a turn is in flight — skip this tick, don't stack
    const next = recordCheck(new Date().toISOString());
    send({ type: "autonomousMode", payload: next });
    push(checkTurn(next.checks, next.goal));
  };
  const arm = (fireNow = false) => {
    disarm();
    const state = readAutonomous();
    if (!state.active) return;
    timer = setInterval(tick, state.intervalMs);
    // setInterval keeps the event loop alive; unref so it never blocks process exit.
    timer.unref?.();
    if (fireNow) tick();
  };
  return { arm, disarm };
}

/** Handle an `autonomous_mode` control message. Start: persist ON, broadcast the flag,
 * push the kickoff turn, arm the check loop. Stop: persist OFF, broadcast, disarm the
 * loop. Returns true if it handled the message (so the caller can stop dispatching).
 * @param {{ type: string, action?: string, goal?: string }} msg
 * @param {{ send: (obj: import("../../../lib/types.js").OutMsg) => void, push: (m: SDKUserMessage) => void, loop: { arm: () => void, disarm: () => void } }} deps
 * @returns {boolean} */
export function handleAutonomousControl(msg, { send, push, loop }) {
  if (msg.type !== "autonomous_mode") return false;
  const now = new Date().toISOString();
  if (msg.action === "start" && msg.goal) {
    const state = startAutonomous(msg.goal, now);
    send({ type: "autonomousMode", payload: state });
    send({ type: "status", text: `Autonomous Mode on — goal: ${state.goal}` });
    push(kickoffTurn(state.goal));
    loop.arm();
  } else if (msg.action === "stop") {
    send({ type: "autonomousMode", payload: stopAutonomous(now) });
    send({ type: "status", text: "Autonomous Mode off." });
    loop.disarm();
  }
  return true;
}
