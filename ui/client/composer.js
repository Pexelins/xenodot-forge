// Composer — the message input box, its auto-grow, send, and quick-fill chips.
import { $, $$, $input, fillComposer } from "./dom.js";
import { addUser, showThinking } from "./chat.js";
import { send } from "./websocket.js";
import { subscribe, update } from "./store.js";

const textarea = $input("composer-input");

function autoGrow() {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

/** Reflect the hive's turn state on the send button: while a foreground turn
 * holds the session, a new message only QUEUES (delivered when the turn ends),
 * so say so in gray. When idle (or only background workers run) it sends now.
 * @param {boolean} busy */
function updateSendBtn(busy) {
  const btn = $("send-btn");
  btn.textContent = busy ? "Queue Message" : "Send";
  btn.classList.toggle("queued", busy);
}

function sendMessage() {
  const text = textarea.value.trim();
  if (!text) return;
  addUser(text);
  showThinking();
  send({ type: "user_input", text });
  // Optimistically mark the hive busy + running; statusbar renders the line and
  // the button below reads `busy`.
  update((s) => ({ ...s, busy: true, session: { ...s.session, status: "running" } }));
  textarea.value = "";
  autoGrow();
}

/** Wire the composer input, send button, Enter-to-send and the quick chips. */
export function initComposer() {
  textarea.addEventListener("input", autoGrow);
  $("send-btn").addEventListener("click", sendMessage);
  subscribe("busy", updateSendBtn);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $$(".chip[data-fill]").forEach((chip) => {
    chip.addEventListener("click", () => {
      fillComposer(chip.getAttribute("data-fill") ?? "");
    });
  });
}
