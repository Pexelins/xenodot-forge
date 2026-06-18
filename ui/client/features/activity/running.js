// Running-agents panel — one colored chip per in-flight sub-agent, rendered
// from the store's `running` slice (the reducer folds spawn / tool_result /
// task events into it). The elapsed ticker reads each chip's `started` off the
// DOM every second, so it never holds a stale node reference; the chips are
// rebuilt only when the slice itself changes.
import { $, el } from "../../core/dom.js";
import { paint, agentLabel } from "../agents/agents.js";
import { send } from "../../core/websocket.js";
import { subscribe, update } from "../../core/store.js";

/** @typedef {import("../../core/store.js").RunningAgent} RunningAgent */

// How long to wait for the server's task_notification after a ✕ before the chip
// removes itself — an already-exited worker emits none, so without this the chip
// would sit on "stopping…" forever. Idempotent with the real notification.
const STOP_FALLBACK_MS = 4000;

// Last-resort backstop: a chip older than this is force-dropped even with the
// socket still open, for the one gap the server settle + `idle` + onclose don't
// cover — a single worker that dies without the SDK emitting its task_notification
// while the session lives on. Deliberately generous so it never culls a real
// long-running build; the server-side settle clears legitimate work far sooner.
const MAX_CHIP_AGE_MS = 30 * 60 * 1000;

/** @type {ReturnType<typeof setInterval> | undefined} */
let timer;

/** @param {number} seconds @returns {string} */
function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  return m ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

/** Drop any chip past the backstop age. Identity-preserving when nothing is stale,
 * so it never forces a redundant repaint. */
function sweepStale() {
  const now = Date.now();
  update((s) => {
    const kept = s.running.filter((r) => now - r.started < MAX_CHIP_AGE_MS);
    return kept.length === s.running.length ? s : { ...s, running: kept };
  });
}

/** Update every visible chip's elapsed label from its `data-started`, and run the
 * staleness backstop. */
function tick() {
  sweepStale();
  const now = Date.now();
  for (const node of $("running-agents").querySelectorAll(".running-agent")) {
    const started = Number(/** @type {HTMLElement} */ (node).dataset.started);
    const elapsed = node.querySelector(".elapsed");
    if (elapsed && started) elapsed.textContent = fmt(Math.floor((now - started) / 1000));
  }
}

/** Ask the server to stop a backgrounded worker and mark its chip "stopping…".
 * @param {RunningAgent} r */
function requestStop(r) {
  if (r.stopping || !r.taskId) return;
  const taskId = r.taskId;
  send({ type: "stop_task", taskId });
  update((s) => ({
    ...s,
    running: s.running.map((x) => (x.id === r.id ? { ...x, stopping: true } : x)),
  }));
  setTimeout(() => {
    update((s) =>
      s.running.some((x) => x.taskId === taskId)
        ? { ...s, running: s.running.filter((x) => x.taskId !== taskId) }
        : s,
    );
  }, STOP_FALLBACK_MS);
}

/** @param {RunningAgent} r @returns {HTMLElement} */
function chip(r) {
  const node = paint(el("div", "running-agent"), r.label);
  node.dataset.started = String(r.started);
  node.append(el("span", "status-dot"), el("span", "agent-name", agentLabel(r.label)));
  if (r.desc) node.append(el("span", "running-target", r.desc));
  node.append(el("span", "elapsed", "0s"));
  // A backgrounded worker outlives the hive turn, so it gets its own stop
  // (stop_task → query.stopTask), distinct from the group interrupt.
  if (r.stopping) {
    node.classList.add("stopping");
    node.append(el("span", "running-target", "stopping…"));
  } else if (r.background && r.taskId) {
    const x = el("button", "chip-stop", "✕");
    x.title = "Stop this background agent";
    x.onclick = () => {
      requestStop(r);
    };
    node.append(x);
  }
  return node;
}

/** @param {readonly RunningAgent[]} list */
function render(list) {
  const box = $("running-agents");
  box.replaceChildren();
  if (!list.length) {
    box.style.display = "none";
    clearInterval(timer);
    timer = undefined;
    return;
  }
  for (const r of list) box.append(chip(r));
  const stop = el("button", "running-stop", "■ Stop");
  stop.title = "Stop the hive — interrupt the current turn (background agents have their own ✕)";
  stop.onclick = () => {
    send({ type: "stop" });
  };
  box.append(stop);
  box.style.display = "";
  timer ??= setInterval(tick, 1000);
  tick();
}

export function initRunning() {
  subscribe("running", render);
}
