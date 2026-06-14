// Activity log — the right-hand stream of tool/agent events, plus the small
// display formatters (shorten / stripEnvPrefix / toolDetail) shared with the
// approval cards and the websocket dispatcher.
import { $, $$, el } from "./dom.js";
import { paint, agentLabel } from "./agents.js";
import { view } from "./state.js";
import { subscribe, getState } from "./store.js";

// The pure formatters now live in format.js (DOM-free, so the reducer can share
// them); re-exported here for approvals.js, which reads them alongside `shorten`.
export { VERB_KIND, stripEnvPrefix } from "./format.js";

/** @typedef {(row: HTMLElement) => boolean} FilterFn */
/** @type {Record<string, FilterFn>} */
const FILTERS = {
  all: () => true,
  tools: (row) => ["task", "bash", "session", "spawn"].includes(row.dataset.kind ?? ""),
  files: (row) => ["read", "edit", "write"].includes(row.dataset.kind ?? ""),
};
/** @param {string | null | undefined} key @returns {FilterFn} */
const filterFor = (key) => FILTERS[key ?? "all"] ?? FILTERS.all ?? (() => true);

/** The kind filter from the active chip (All / Tools / Files). @returns {FilterFn} */
const activeKindFn = () => {
  const chip = /** @type {HTMLElement | null} */ (document.querySelector(".filter-chip.on"));
  return filterFor(chip?.dataset.filter);
};

/** The agent picked in the dropdown ("" = all agents). @returns {string} */
const selectedAgent = () =>
  /** @type {HTMLSelectElement | null} */ (document.getElementById("agent-filter"))?.value ?? "";

/** A row matches when the kind chip AND the agent picklist both accept it. A
 * row carries every agent it involves (parent + spawned child) in data-agents.
 * @param {HTMLElement} row @returns {boolean} */
const rowVisible = (row) => {
  if (!activeKindFn()(row)) return false;
  const agent = selectedAgent();
  return !agent || (row.dataset.agents ?? "").split(" ").includes(agent);
};

/** Re-run both filters across every row. */
const applyFilters = () => {
  $$(".log-row").forEach((row) => {
    row.style.display = rowVisible(row) ? "" : "none";
  });
};

/** Agents already offered in the dropdown, in first-seen order. @type {Set<string>} */
const seenAgents = new Set();

/** Add an agent to the picklist the first time it shows up in the stream.
 * @param {string | undefined} agent */
function ensureAgentOption(agent) {
  if (!agent || seenAgents.has(agent)) return;
  seenAgents.add(agent);
  const sel = $("agent-filter");
  if (!sel) return;
  const opt = /** @type {HTMLOptionElement} */ (el("option", "", agentLabel(agent)));
  opt.value = agent;
  sel.append(opt);
}

function nowStr() {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")} ${ampm}`;
}

// The project dir is constant noise in paths and commands — strip it.
/** @param {string} [t] @returns {string} */
export const shorten = (t) =>
  view.projectDir && t
    ? t.replaceAll(view.projectDir + "/", "").replaceAll(view.projectDir, ".")
    : (t ?? "");

/** Build (but don't mount) one log row from a store entry. Pure: never mutates
 * the entry (paths are shortened into a local). @param {import("../lib/types.js").LogEntry} entry @returns {HTMLElement} */
function buildLogRow(entry) {
  const detail = shorten(entry.detail);
  const row = el(
    "div",
    "log-row is-new" +
      (entry.kind === "say" ? " say" : "") +
      (entry.kind === "spawn" ? " spawn" : ""),
  );
  row.dataset.kind = entry.kind;
  // Every agent the row involves — parent plus any spawned child — so the
  // agent picklist can match either side of a "main ▸ child" spawn row.
  row.dataset.agents = [entry.agent, entry.child].filter(Boolean).join(" ");
  ensureAgentOption(entry.agent);
  ensureAgentOption(entry.child);
  row.append(el("span", "log-time", nowStr()));
  if (entry.kind === "spawn") {
    const who = el("span", "log-agent");
    who.append(paint(el("span", "", agentLabel(entry.agent)), entry.agent));
    who.append(el("span", "arrow", " ▸ "));
    who.append(paint(el("span", "", agentLabel(entry.child ?? "")), entry.child ?? ""));
    row.append(who);
  } else {
    row.append(paint(el("span", "log-agent", agentLabel(entry.agent)), entry.agent));
  }
  if (entry.kind === "say") {
    row.append(el("span", "log-text", entry.text));
  } else {
    row.append(el("span", `verb-pill verb-${entry.kind}`, entry.verb));
    const detailEl = el("span", "log-detail");
    detailEl.append(Object.assign(document.createElement("bdo"), { textContent: detail }));
    row.append(detailEl);
  }
  if (!rowVisible(row)) row.style.display = "none";
  return row;
}

/** Append-only: how many of state.activity are already in the DOM. */
let rendered = 0;

/** Prepend every entry the store gained since the last paint (newest ends on
 * top). @param {readonly import("../lib/types.js").LogEntry[]} log */
function onActivity(log) {
  const box = $("log-scroll");
  for (const entry of log.slice(rendered)) box.prepend(buildLogRow(entry));
  rendered = log.length;
}

/** Wire the filter chips, the clear button, and the store subscription. */
export function initActivityLog() {
  $$(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".filter-chip").forEach((c) => {
        c.classList.remove("on");
      });
      chip.classList.add("on");
      applyFilters();
    });
  });
  $("agent-filter")?.addEventListener("change", applyFilters);
  $("clear-log").onclick = () => {
    $("log-scroll").replaceChildren();
    rendered = getState().activity.length; // keep the index aligned after a manual clear
  };
  subscribe("activity", onActivity);
}
