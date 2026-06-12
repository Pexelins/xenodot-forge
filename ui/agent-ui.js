/* Xenodot Forge — live client.
   Structure & styling by design (agent-ui.css); this file wires the real
   WebSocket protocol (see PROTOCOL.md). No build step, no dependencies. */

(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------- Per-agent color ----------
     Hash picks ONLY the hue; saturation/lightness come from the
     --agent-s / --agent-l tokens in :root, so agents stay on-palette. */
  function agentColor(name) {
    if (name === "main") return "var(--accent-text)";
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return "hsl(" + (h % 360) + " var(--agent-s) var(--agent-l))";
  }
  function paint(node, agent) {
    node.dataset.agent = agent;
    node.style.setProperty("--agent-color", agentColor(agent));
    return node;
  }

  /* ---------- Panel resize (drag the seams; widths persist) ---------- */
  const rootStyle = document.documentElement.style;
  const LS_KEY = "xenodot-panel-widths";
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (saved.sidebar) rootStyle.setProperty("--sidebar-w", saved.sidebar + "px");
    if (saved.activity) rootStyle.setProperty("--activity-w", saved.activity + "px");
  } catch (e) {}
  function persistWidths() {
    const cs = getComputedStyle(document.documentElement);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        sidebar: parseInt(cs.getPropertyValue("--sidebar-w")) || 252,
        activity: parseInt(cs.getPropertyValue("--activity-w")) || 356,
      }));
    } catch (e) {}
  }
  function setupResizer(id, cssVar, side, min, max) {
    const node = $(id);
    if (!node) return;
    node.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      document.body.classList.add("resizing");
      const onMove = (ev) => {
        const w = side === "left" ? ev.clientX : window.innerWidth - ev.clientX;
        rootStyle.setProperty(cssVar, Math.max(min, Math.min(max, w)) + "px");
      };
      const onUp = (ev) => {
        node.releasePointerCapture(ev.pointerId);
        document.body.classList.remove("resizing");
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);
        persistWidths();
      };
      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
    });
  }
  setupResizer("resize-sidebar", "--sidebar-w", "left", 180, 420);
  setupResizer("resize-activity", "--activity-w", "right", 260, 560);

  /* ---------- Activity log ---------- */
  const VERB_KIND = {
    Read: "read", Glob: "read", Grep: "read",
    Write: "write", Edit: "edit", MultiEdit: "edit", NotebookEdit: "edit",
    Bash: "bash", Task: "task", Agent: "task", Skill: "task",
  };
  const FILTERS = {
    all: () => true,
    tools: (row) => ["task", "bash", "session", "spawn"].includes(row.dataset.kind),
    files: (row) => ["read", "edit", "write"].includes(row.dataset.kind),
  };
  const activeFilterFn = () => {
    const chip = document.querySelector(".filter-chip.on");
    return FILTERS[(chip && chip.dataset.filter) || "all"];
  };
  function nowStr() {
    const d = new Date();
    let h = d.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")} ${ampm}`;
  }
  // The project dir is constant noise in paths and commands — strip it.
  let projectDir = "";
  const shorten = (t) =>
    projectDir && t ? t.replaceAll(projectDir + "/", "").replaceAll(projectDir, ".") : t;

  function addLog(entry) {
    entry.detail = shorten(entry.detail);
    const row = el("div", "log-row is-new" + (entry.kind === "say" ? " say" : "") + (entry.kind === "spawn" ? " spawn" : ""));
    row.dataset.kind = entry.kind;
    row.append(el("span", "log-time", nowStr()));
    if (entry.kind === "spawn") {
      const who = el("span", "log-agent");
      who.append(paint(el("span", "", entry.agent), entry.agent));
      who.append(el("span", "arrow", " ▸ "));
      who.append(paint(el("span", "", entry.child), entry.child));
      row.append(who);
    } else {
      row.append(paint(el("span", "log-agent", entry.agent), entry.agent));
    }
    if (entry.kind === "say") {
      row.append(el("span", "log-text", entry.text));
    } else {
      row.append(el("span", `verb-pill verb-${entry.kind}`, entry.verb));
      const detail = el("span", "log-detail");
      detail.append(Object.assign(document.createElement("bdo"), { textContent: entry.detail ?? "" }));
      row.append(detail);
    }
    if (!activeFilterFn()(row)) row.style.display = "none";
    $("log-scroll").prepend(row);
  }
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      const fn = FILTERS[chip.dataset.filter] || FILTERS.all;
      document.querySelectorAll(".log-row").forEach((row) => {
        row.style.display = fn(row) ? "" : "none";
      });
    });
  });
  $("clear-log").onclick = () => $("log-scroll").replaceChildren();

  /* ---------- Chat ---------- */
  const chatScroll = $("chat-scroll");
  const scrollChat = () => (chatScroll.scrollTop = chatScroll.scrollHeight);
  function addBanner(text) {
    $("chat-inner").append(el("div", "session-banner", text));
    scrollChat();
  }
  function addUser(text) {
    $("chat-inner").append(el("div", "msg-user", text));
    scrollChat();
  }
  function addAgentMsg(who, text) {
    const wrap = el("div", "msg-agent");
    const head = el("span", "who");
    head.append(paint(el("span", "agent-avatar", who[0].toUpperCase()), who));
    head.append(` ${who}`);
    const copy = el("button", "copy-btn", "⧉");
    copy.title = "Copy message";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "✓";
        setTimeout(() => (copy.textContent = "⧉"), 1200);
      } catch (e) {
        copy.textContent = "✕";
      }
    };
    const body = el("div", "body", text);
    wrap.append(head, copy, body);
    $("chat-inner").append(wrap);
    scrollChat();
  }

  /* ---------- Todo / progress card (driven by TodoWrite) ---------- */
  function renderTodos(todos) {
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
      const row = el("div", "todo" + (t.status === "completed" ? " done" : t.status === "in_progress" ? " running" : ""));
      row.append(el("span", "tick", t.status === "completed" ? "✓" : ""), el("span", "", t.content));
      list.append(row);
    });
    card.append(head, track, list);
    scrollChat();
  }

  /* ---------- Questions & approvals ----------
     The interactive card lives IN THE CHAT (where the user is looking);
     the right panel keeps a mini indicator. Both settle together. */
  const pendingCards = new Map(); // id -> { chatCard, panelCard }
  const updateBadges = () => {
    const n = pendingCards.size;
    $("approvals-badge").textContent = n;
    $("pill-badge").textContent = n;
    $("approvals-pill").style.display = n ? "" : "none";
    $("approvals-empty").style.display = n ? "none" : "";
  };
  function registerPending(id, chatCard, panelCard) {
    pendingCards.set(id, { chatCard, panelCard });
    $("chat-inner").append(chatCard);
    $("approvals-list").append(panelCard);
    updateBadges();
    scrollChat();
  }
  function settle(id, note, denied) {
    const p = pendingCards.get(id);
    if (!p) return;
    pendingCards.delete(id);
    p.panelCard.remove();
    p.chatCard.classList.add("resolved");
    const resolved = p.chatCard.querySelector(".approval-resolved");
    if (resolved) {
      resolved.textContent = note;
      if (denied) resolved.style.color = "var(--red)";
    }
    p.chatCard.querySelectorAll("button, input, textarea").forEach((n) => (n.disabled = true));
    updateBadges();
  }

  const permissionCmd = (input) =>
    shorten(input?.command ? stripEnvPrefix(input.command) : input?.file_path ?? JSON.stringify(input ?? {}).slice(0, 200));

  function renderPermission(m) {
    const kind = VERB_KIND[m.toolName] ?? "task";
    const act = (payload, note, denied) => () => {
      send({ type: "reply", id: m.id, payload });
      settle(m.id, note, denied);
    };
    const mkActions = () => {
      const actions = el("div", "approval-actions");
      const mk = (label, cls, payload, note, denied) => {
        const b = el("button", `btn ${cls}`, label);
        b.onclick = act(payload, note, denied);
        return b;
      };
      actions.append(
        mk("Allow once", "primary", { allow: true }, "✓ Approved — running"),
        mk("Always", "", { allow: true, always: true }, "✓ Approved for this session"),
        mk("Deny", "ghost", { allow: false }, "✕ Denied — not run", true),
      );
      return actions;
    };
    const mkCmd = () => {
      const cmd = el("div", "cmd");
      cmd.append(el("span", "prompt", "$ "), permissionCmd(m.input));
      return cmd;
    };

    // Inline chat card (interactive, primary)
    const chatCard = el("div", "card approval");
    const head = el("div", "card-head");
    head.append(el("span", `verb-pill verb-${kind}`, m.toolName), ` waiting for your approval`);
    const body = el("div", "approval-body");
    body.append(mkCmd(), mkActions());
    chatCard.append(head, body, el("div", "approval-resolved"));

    // Panel mini (interactive too — both resolve together)
    const panelCard = el("div", "approval-mini");
    const row = el("div", "approval-mini-row");
    row.append(el("span", `verb-pill verb-${kind}`, m.toolName));
    panelCard.append(row, mkCmd(), mkActions());

    registerPending(m.id, chatCard, panelCard);
  }

  function renderAsk(m) {
    const questions = m.input?.questions ?? [];
    const picked = questions.map(() => new Set());

    // Inline chat card holds the form (selection state lives in one place)
    const chatCard = el("div", "card approval");
    const head = el("div", "card-head", "Question for you");
    const body = el("div", "approval-body");
    questions.forEach((q, qi) => {
      body.append(el("div", "approval-mini-row", q.question));
      (q.options ?? []).forEach((opt) => {
        const label = typeof opt === "string" ? opt : opt.label;
        const b = el("button", "btn", label);
        if (typeof opt === "object" && opt.description) b.title = opt.description;
        b.dataset.q = qi;
        b.onclick = () => {
          if (q.multiSelect) {
            b.classList.toggle("primary");
            picked[qi].has(label) ? picked[qi].delete(label) : picked[qi].add(label);
          } else {
            body.querySelectorAll(`[data-q="${qi}"]`).forEach((x) => x.classList.remove("primary"));
            b.classList.add("primary");
            picked[qi] = new Set([label]);
          }
        };
        body.append(b);
      });
      const custom = el("input");
      custom.type = "text";
      custom.placeholder = "or type your own answer…";
      custom.className = "cmd";
      custom.dataset.custom = qi;
      body.append(custom);
    });
    const actions = el("div", "approval-actions");
    const submit = el("button", "btn primary", "Answer");
    submit.onclick = () => {
      const answers = {};
      questions.forEach((q, qi) => {
        const custom = body.querySelector(`[data-custom="${qi}"]`).value.trim();
        answers[q.question] = custom || [...picked[qi]].join(", ") || "";
      });
      send({ type: "reply", id: m.id, payload: { answers } });
      settle(m.id, "✓ Answered");
    };
    actions.append(submit);
    body.append(actions);
    chatCard.append(head, body, el("div", "approval-resolved"));

    // Panel mini: passive pointer to the chat card
    const panelCard = el("div", "approval-mini");
    panelCard.append(el("div", "approval-mini-row", `❓ ${questions[0]?.question?.slice(0, 60) ?? "question"}`));
    const jump = el("button", "btn", "Answer in chat →");
    jump.onclick = () => chatCard.scrollIntoView({ behavior: "smooth", block: "center" });
    panelCard.append(jump);

    registerPending(m.id, chatCard, panelCard);
  }

  /* mcp__ui__form: typed form composed by the agent (see PROTOCOL.md).
     Same lifecycle as renderAsk — card in chat, mini in panel, one reply. */
  function renderForm(m) {
    const form = m.input ?? {};
    const fields = form.fields ?? [];

    const chatCard = el("div", "card approval");
    const head = el("div", "card-head", form.title || "Form");
    const body = el("div", "approval-body");
    if (form.description) body.append(el("div", "form-desc", form.description));

    const readers = []; // per field: { f, wrap, read: () => current value }
    fields.forEach((f) => {
      const wrap = el("div", "form-field");
      const clearInvalid = () => wrap.classList.remove("invalid");

      if (f.type === "checkbox") {
        const lab = el("label", "form-check");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = f.value === true;
        box.onchange = clearInvalid;
        lab.append(box, f.label ?? f.id);
        wrap.append(lab);
        readers.push({ f, wrap, read: () => box.checked });
      } else {
        const lab = el("label", "form-label", f.label ?? f.id);
        if (f.required) lab.append(el("span", "req", " *"));
        wrap.append(lab);

        if (f.type === "select" || f.type === "multiselect") {
          const row = el("div", "form-options");
          const picked = new Set(
            [].concat(f.value ?? []).map(String)
              .filter((v) => (f.options ?? []).some((o) => o.label === v)),
          );
          (f.options ?? []).forEach((opt) => {
            const b = el("button", "btn" + (picked.has(opt.label) ? " primary" : ""), opt.label);
            if (opt.description) b.title = opt.description;
            b.onclick = () => {
              clearInvalid();
              if (f.type === "multiselect") {
                b.classList.toggle("primary");
                picked.has(opt.label) ? picked.delete(opt.label) : picked.add(opt.label);
              } else {
                row.querySelectorAll(".btn").forEach((x) => x.classList.remove("primary"));
                b.classList.add("primary");
                picked.clear();
                picked.add(opt.label);
              }
            };
            row.append(b);
          });
          wrap.append(row);
          readers.push({
            f, wrap,
            read: () => (f.type === "multiselect" ? [...picked] : [...picked][0] ?? ""),
          });
        } else {
          const input = document.createElement(f.type === "textarea" ? "textarea" : "input");
          input.className = "form-input";
          if (f.type === "textarea") input.rows = 3;
          else input.type = f.type === "number" ? "number" : "text";
          if (f.placeholder) input.placeholder = f.placeholder;
          if (f.value != null) input.value = f.value;
          input.oninput = clearInvalid;
          wrap.append(input);
          readers.push({
            f, wrap,
            read: () => {
              const v = input.value.trim();
              return f.type === "number" && v !== "" ? Number(v) : v;
            },
          });
        }
      }
      body.append(wrap);
    });

    const actions = el("div", "approval-actions");
    const submit = el("button", "btn primary", form.submitLabel || "Submit");
    submit.onclick = () => {
      const missing = readers.filter(({ f, read }) => {
        if (!f.required) return false;
        const v = read();
        return v === "" || v === false || (Array.isArray(v) && !v.length);
      });
      if (missing.length) {
        missing.forEach(({ wrap }) => wrap.classList.add("invalid"));
        missing[0].wrap.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const values = {};
      readers.forEach(({ f, read }) => (values[f.id] = read()));
      send({ type: "reply", id: m.id, payload: { values } });
      settle(m.id, "✓ Submitted");
    };
    const skip = el("button", "btn ghost", "Skip");
    skip.onclick = () => {
      send({ type: "reply", id: m.id, payload: { cancelled: true } });
      settle(m.id, "✕ Skipped", true);
    };
    actions.append(submit, skip);
    body.append(actions);
    chatCard.append(head, body, el("div", "approval-resolved"));

    // Panel mini: passive pointer to the chat card
    const panelCard = el("div", "approval-mini");
    panelCard.append(el("div", "approval-mini-row", `📋 ${(form.title ?? "form").slice(0, 60)}`));
    const jump = el("button", "btn", "Fill in chat →");
    jump.onclick = () => chatCard.scrollIntoView({ behavior: "smooth", block: "center" });
    panelCard.append(jump);

    registerPending(m.id, chatCard, panelCard);
  }

  // Topbar pill jumps to the oldest pending card in the chat
  $("approvals-pill").onclick = () => {
    const first = pendingCards.values().next().value;
    if (first) first.chatCard.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /* ---------- Running-agent status bar ---------- */
  let elapsedTimer = null;
  function showRunning(agent, target) {
    paint($("status-agent"), agent).textContent = agent;
    $("status-target").textContent = target ?? "";
    $("status-bar").style.display = "";
    let seconds = 0;
    clearInterval(elapsedTimer);
    $("status-elapsed").textContent = "0s";
    elapsedTimer = setInterval(() => {
      seconds++;
      const mm = Math.floor(seconds / 60);
      $("status-elapsed").textContent = mm ? `${mm}m ${seconds % 60}s` : `${seconds}s`;
    }, 1000);
  }
  function hideRunning() {
    clearInterval(elapsedTimer);
    $("status-bar").style.display = "none";
  }

  /* ---------- Project state ---------- */
  const COLLAPSE_KEY = "xenodot-collapsed";
  const collapsed = (() => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}"); }
    catch (e) { return {}; }
  })();
  async function loadState() {
    const s = await (await fetch("/api/state")).json();
    projectDir = s.dir;
    $("proj-name").textContent = s.name;
    $("proj-path").textContent = s.dir.replace(/^\/Users\/[^/]+/, "~");
    const tree = $("project-tree");
    tree.replaceChildren();
    const group = (label, items, render) => {
      const g = el("div", "tree-group");
      if (collapsed[label] ?? true) g.classList.add("collapsed"); // collapsed by default
      const head = el("div", "tree-group-head");
      head.append(el("span", "chev", "▾"), ` ${label} `, el("span", "count", String(items.length)));
      head.onclick = () => {
        g.classList.toggle("collapsed");
        collapsed[label] = g.classList.contains("collapsed");
        try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch (e) {}
      };
      g.append(head);
      if (!items.length) g.append(el("div", "tree-empty", "none yet"));
      else items.forEach((it) => g.append(render(it)));
      tree.append(g);
    };
    group("Design docs", s.designDocs, (d) => {
      const item = el("div", "tree-item", d.path + " ");
      item.append(el("span", "desc", `— ${d.title}`));
      return item;
    });
    group("Addon library", s.library ?? [], (d) => {
      const item = el("div", "tree-item");
      if (d.verdict) {
        const v = d.verdict.toLowerCase();
        const dot = el("span", "verdict-dot", "●");
        dot.style.color = v.startsWith("adopted") ? "var(--green)"
          : v.startsWith("rejected") ? "var(--red)" : "var(--amber)";
        dot.title = d.verdict;
        item.append(dot, " ");
      }
      item.append(d.title + " ", el("span", "desc", `— ${d.verdict ?? "researching…"}`));
      return item;
    });
    group("Scenes", s.scenes, (f) => el("div", "tree-item", f));
    group("Scripts", s.scripts, (f) => el("div", "tree-item", f));
    group("Agents", s.agents, (a) => {
      const item = el("div", "tree-item", a.name + " ");
      if (a.model) item.append(el("span", "desc", `(${a.model})`));
      return item;
    });
    group("Skills", s.skills, (f) => el("div", "tree-item", f));
  }
  $("refresh").onclick = loadState;
  loadState();

  /* ---------- Recent sessions (resumable) ---------- */
  const resumeId = new URLSearchParams(location.search).get("resume");
  async function loadSessions() {
    const sessions = await (await fetch("/api/sessions")).json();
    const box = $("recent-sessions");
    box.replaceChildren();
    sessions
      .filter((s) => s.id !== resumeId)
      .slice(0, 8)
      .forEach((s) => {
        const card = el("div", "session-card");
        card.style.cursor = "pointer";
        card.title = "Resume this session";
        card.append(el("span", "name", s.title));
        card.append(el("span", "meta", s.when.replace("T", " · ")));
        card.onclick = () => {
          card.classList.add("loading");
          card.querySelector(".meta").textContent = "resuming…";
          location.href = `${location.pathname}?resume=${encodeURIComponent(s.id)}`;
        };
        box.append(card);
      });
  }
  loadSessions();

  /* ---------- WebSocket session ---------- */
  const ws = new WebSocket(`ws://${location.host}${resumeId ? `?resume=${encodeURIComponent(resumeId)}` : ""}`);
  const send = (o) => ws.send(JSON.stringify(o));
  const subagents = new Map(); // spawn tool_use id -> agent name
  let totalCost = 0;
  let totalTokens = 0;

  ws.onopen = () => $("conn-dot").classList.add("pulse");
  ws.onclose = () => {
    $("conn-dot").classList.remove("pulse");
    $("model-name").textContent = "disconnected";
    $("session-dot").classList.remove("pulse");
    $("session-meta").textContent = "ended — refresh for a new session";
  };

  // Display-only: drop leading VAR=value && assignments from commands —
  // the meaning starts after them (logs keep the full command).
  const stripEnvPrefix = (t) => t.replace(/^(?:\w+=\S+\s*&&\s*)+/, "");
  const toolDetail = (input) =>
    input?.file_path ??
    (input?.command ? stripEnvPrefix(input.command) : null) ??
    input?.pattern ?? input?.skill ?? input?.title ??
    (input ? JSON.stringify(input).slice(0, 120) : "");

  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);

    if (m.type === "history") {
      for (const item of m.items ?? []) {
        if (item.role === "user") addUser(item.text);
        else addAgentMsg("main", item.text);
      }
      return;
    }
    if (m.type === "status") { addBanner(m.text); return; }
    if (m.type === "policy") { $("mode-select").value = m.value; return; }
    if (m.type === "ask") { renderAsk(m); return; }
    if (m.type === "form") { renderForm(m); return; }
    if (m.type === "permission") { renderPermission(m); return; }
    if (m.type !== "event") return;

    const msg = m.message;
    if (msg.type === "system" && msg.subtype === "init") {
      $("model-name").textContent = msg.model;
      $("session-model").textContent = msg.model;
      $("session-dot").classList.add("pulse");
      $("session-meta").textContent = "running";
      addLog({ kind: "session", verb: "Sess", agent: "main", detail: msg.model });
      return;
    }

    if (msg.type === "assistant") {
      const who = subagents.get(msg.parent_tool_use_id) ?? "main";
      for (const b of msg.message?.content ?? []) {
        if (b.type === "text" && b.text.trim()) {
          if (who === "main") addAgentMsg("main", b.text);
          else addLog({ kind: "say", agent: who, text: b.text.trim().slice(0, 200) });
        }
        if (b.type === "tool_use") {
          if (b.name === "Task" || b.name === "Agent") {
            const label = b.input?.subagent_type ?? "agent";
            subagents.set(b.id, label);
            addLog({ kind: "spawn", agent: who, child: label, detail: b.input?.description ?? "" });
            showRunning(label, b.input?.description ?? "");
          } else if (b.name === "TodoWrite" && Array.isArray(b.input?.todos)) {
            renderTodos(b.input.todos);
          } else {
            const verb = b.name === "mcp__ui__form" ? "Form" : b.name;
            addLog({ kind: VERB_KIND[b.name] ?? "task", verb, agent: who, detail: toolDetail(b.input) });
          }
        }
      }
      return;
    }

    if (msg.type === "result") {
      hideRunning();
      totalCost += msg.total_cost_usd ?? 0;
      const u = msg.usage ?? {};
      totalTokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
      $("usage").textContent =
        `$${totalCost.toFixed(2)} · ${(totalTokens / 1000).toFixed(1)}k tok`;
      $("session-meta").textContent = `idle · last turn ${((msg.duration_ms ?? 0) / 1000).toFixed(0)}s`;
      addLog({ kind: "session", verb: "Sess", agent: "main", detail: `turn ${msg.subtype} — $${(msg.total_cost_usd ?? 0).toFixed(3)}` });
      loadState(); // agents may have created files
    }
  };

  $("mode-select").onchange = () => send({ type: "policy", value: $("mode-select").value });
  $("new-session").onclick = () => (location.href = location.pathname);

  /* ---------- Composer ---------- */
  const textarea = $("composer-input");
  function autoGrow() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }
  textarea.addEventListener("input", autoGrow);
  function sendMessage() {
    const text = textarea.value.trim();
    if (!text) return;
    addUser(text);
    send({ type: "user_input", text });
    $("session-meta").textContent = "running";
    textarea.value = "";
    autoGrow();
  }
  $("send-btn").addEventListener("click", sendMessage);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.querySelectorAll(".chip[data-fill]").forEach((chip) => {
    chip.addEventListener("click", () => {
      textarea.value = chip.getAttribute("data-fill");
      autoGrow();
      textarea.focus();
    });
  });
})();
