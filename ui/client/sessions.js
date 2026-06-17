// Recent sessions (resumable) — the rows under the live session in the Session
// rail section that link to ?resume=<id>. The section is height-capped and
// scrolls, so the list just renders (newest first) and the scroll handles overflow.
import { $, el } from "./dom.js";
import { fetchJSON } from "../lib/json.js";
import { resumeId } from "./state.js";

const MAX = 12; // hard cap on rows rendered

/** @param {import("../lib/types.js").RecentSession} s @returns {HTMLElement} */
function sessionCard(s) {
  const card = el("div", "session-card");
  card.style.cursor = "pointer";
  card.title = "Resume this session";

  const nameRow = el("span", "name");
  nameRow.append(s.title);
  const delBtn = el("button", "session-del-btn", "×");
  delBtn.title = "Delete session";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (delBtn.classList.contains("confirm")) {
      void fetch(`/api/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" }).then(() =>
        loadSessions(),
      );
    } else {
      delBtn.classList.add("confirm");
      delBtn.textContent = "del?";
      setTimeout(() => {
        delBtn.classList.remove("confirm");
        delBtn.textContent = "×";
      }, 2000);
    }
  };
  nameRow.append(delBtn);
  card.append(nameRow);
  card.append(el("span", "meta", s.when.replace("T", " · ")));

  card.onclick = () => {
    card.classList.add("loading");
    const meta = card.querySelector(".meta");
    if (meta) meta.textContent = "resuming…";
    location.href = `${location.pathname}?resume=${encodeURIComponent(s.id)}`;
  };
  return card;
}

export async function loadSessions() {
  const sessions = /** @type {import("../lib/types.js").RecentSession[]} */ (
    await fetchJSON("/api/sessions")
  );
  const box = $("recent-sessions");
  box.replaceChildren();
  const items = sessions.filter((s) => s.id !== resumeId).slice(0, MAX);
  items.forEach((s) => {
    box.append(sessionCard(s));
  });
}
