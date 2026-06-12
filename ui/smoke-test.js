// Scripted browser: connects to the UI server, sends one prompt,
// auto-answers questions and auto-allows permissions, prints the session.
// Usage: node ui/smoke-test.js ["prompt"]

import WebSocket from "ws";

const resume = process.argv[3]; // optional session id to resume
const PORT = Number(process.env.PORT ?? 3117);
const ws = new WebSocket(`ws://localhost:${PORT}${resume ? `?resume=${resume}` : ""}`);
const send = (o) => ws.send(JSON.stringify(o));
const prompt =
  process.argv[2] ?? "Reply with exactly: POC-OK. Do not use any tools.";

ws.on("open", () => {
  console.log("[client] connected, sending prompt");
  send({ type: "user_input", text: prompt });
});

ws.on("message", (data) => {
  const m = JSON.parse(data);
  if (m.type === "status") console.log("[status]", m.text);
  if (m.type === "history") console.log("[history]", (m.items ?? []).length, "items replayed");

  if (m.type === "event") {
    const msg = m.message;
    if (msg.type === "system") console.log("[system]", msg.subtype, msg.model ?? "");
    if (msg.type === "assistant") {
      for (const b of msg.message?.content ?? []) {
        if (b.type === "text") console.log("[assistant]", b.text);
        if (b.type === "tool_use") console.log("[tool_use]", b.name);
      }
    }
    if (msg.type === "result") {
      console.log("[result]", msg.subtype, `$${(msg.total_cost_usd ?? 0).toFixed(4)}`);
      process.exit(msg.subtype === "success" ? 0 : 1);
    }
  }

  if (m.type === "permission") {
    console.log("[permission]", m.toolName, "→ allowing");
    send({ type: "reply", id: m.id, payload: { allow: true } });
  }

  if (m.type === "form") {
    const values = {};
    for (const f of m.input?.fields ?? []) {
      values[f.id] =
        f.type === "checkbox" ? true
        : f.type === "multiselect" ? [f.options?.[0]?.label].filter(Boolean)
        : f.type === "select" ? f.options?.[0]?.label ?? ""
        : f.type === "number" ? 1
        : "smoke";
      console.log("[form]", f.id, "→", JSON.stringify(values[f.id]));
    }
    send({ type: "reply", id: m.id, payload: { values } });
  }

  if (m.type === "ask") {
    const questions = m.input?.questions ?? [];
    const answers = {};
    for (const q of questions) {
      const first = q.options?.[0];
      answers[q.question] = typeof first === "string" ? first : first?.label ?? "yes";
      console.log("[ask]", q.question, "→", answers[q.question]);
    }
    send({ type: "reply", id: m.id, payload: { answers } });
  }
});

ws.on("error", (e) => { console.error("[client] error:", e.message); process.exit(1); });
setTimeout(() => { console.error("[client] timeout"); process.exit(1); }, Number(process.env.SMOKE_TIMEOUT_MS ?? 180000));
