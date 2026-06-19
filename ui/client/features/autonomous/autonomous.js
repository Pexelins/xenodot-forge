// Autonomous Mode — the header flag + the goal modal. The badge is a pure store
// subscriber (like statusbar.js): the server owns `autonomousMode` state and
// broadcasts it, so ON/OFF here can't desync from what the hive is actually doing.
// Start/Stop send a control message; the server flips the state and the badge
// follows on the echoed snapshot.
import { $, $input } from "../../core/dom.js";
import { subscribe, getState } from "../../core/store.js";
import { send } from "../../core/websocket.js";

/** @param {import("../../../lib/types.js").Autonomous} a */
function trimGoal(a) {
  const g = a.goal.trim();
  return g.length > 32 ? g.slice(0, 31) + "…" : g;
}

/** Paint the top-bar badge from the autonomousMode slice.
 * @param {import("../../../lib/types.js").Autonomous} a */
function renderBadge(a) {
  const pill = $("autonomous-btn");
  const label = $("autonomous-label");
  pill.classList.toggle("on", a.active);
  if (a.active) {
    label.textContent = `Autonomous: ${trimGoal(a) || "on"}`;
    const note = a.status && a.status !== "running" ? ` · ${a.status}` : "";
    pill.title = `Autonomous Mode ON — goal: ${a.goal}\nchecks: ${a.checks}${note}\nClick to view / stop`;
  } else {
    label.textContent = "Autonomous: off";
    pill.title = "Autonomous Mode — set a Main Goal the hive self-drives toward";
  }
}

/** Reflect current state inside the modal (state line + prefilled goal). */
function paintModal() {
  const a = getState().autonomousMode;
  const line = $("autonomous-state");
  $("autonomous-error").textContent = "";
  if (a.active) {
    line.className = "auto-state on";
    line.textContent = `● Running · ${a.checks} check${a.checks === 1 ? "" : "s"}${a.status && a.status !== "running" ? ` · ${a.status}` : ""}`;
  } else if (a.status === "complete") {
    line.className = "auto-state";
    line.textContent = "✓ Last goal completed.";
  } else {
    line.className = "auto-state";
    line.textContent = "○ Off";
  }
  $input("autonomous-goal").value = a.goal;
  $input("autonomous-goal").disabled = a.active;
  $("autonomous-stop").style.display = a.active ? "" : "none";
  $("autonomous-start").textContent = a.active ? "Restart" : "Start";
}

function open() {
  paintModal();
  $("autonomous-modal").style.display = "";
  if (!getState().autonomousMode.active) $input("autonomous-goal").focus();
}

function close() {
  $("autonomous-modal").style.display = "none";
}

function start() {
  const goal = $input("autonomous-goal").value.trim();
  if (!goal) {
    $("autonomous-error").textContent = "Set a goal first.";
    return;
  }
  send({ type: "autonomous_mode", action: "start", goal });
  close();
}

function stop() {
  send({ type: "autonomous_mode", action: "stop" });
  close();
}

export function initAutonomous() {
  subscribe("autonomousMode", renderBadge);
  $("autonomous-btn").onclick = open;
  $("autonomous-cancel").onclick = close;
  $("autonomous-start").onclick = start;
  $("autonomous-stop").onclick = stop;
  // Click the dimmed backdrop (not the panel) to dismiss.
  $("autonomous-modal").addEventListener("click", (e) => {
    if (e.target === $("autonomous-modal")) close();
  });
}
