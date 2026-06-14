// Todo / progress card, rendered from the store's `todos` slice (the reducer
// folds the agent's TodoWrite calls into it). The card is created once in the
// chat column and its contents rebuilt on each change.
import { $, el } from "./dom.js";
import { scrollChat } from "./chat.js";
import { subscribe } from "./store.js";

/** @param {readonly import("../lib/types.js").Todo[]} todos */
function render(todos) {
  if (!todos.length) return; // no card until the first TodoWrite
  let card = $("todo-card");
  if (!card) {
    card = el("div", "card");
    card.id = "todo-card";
    $("chat-inner").append(card);
  }
  card.replaceChildren();
  const done = todos.filter((t) => t.status === "completed").length;
  const head = el("div", "card-head", "Plan");
  head.append(el("span", "spacer"), el("span", "progress-frac", `${done} / ${todos.length}`));
  const track = el("div", "progress-track");
  const fill = el("div", "progress-fill");
  fill.style.width = `${todos.length ? (done / todos.length) * 100 : 0}%`;
  track.append(fill);
  const list = el("div", "todo-list");
  todos.forEach((t) => {
    const row = el(
      "div",
      "todo" + (t.status === "completed" ? " done" : t.status === "in_progress" ? " running" : ""),
    );
    row.append(el("span", "tick", t.status === "completed" ? "✓" : ""), el("span", "", t.content));
    list.append(row);
  });
  card.append(head, track, list);
  scrollChat();
}

export function initTodos() {
  subscribe("todos", render);
}
