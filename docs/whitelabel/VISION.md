# Xenomoon — direction (experimental)

> Status: early experiment. Shapes and names will change. This doc is intentionally short.

## What we're trying

White-label the upstream framework (a Godot game-dev pipeline) into a **domain-neutral** one
that drives the same human-gated loop (designer → dev → verify → you) for _any_ kind of work.
Godot is what we forked from — it stays as the upstream reference, not one of our products.

Two ideas anchor it:

1. **Per-project, deterministic install.** You `install --domain <name>` into a project. The
   choice is written to a committed lock (`.xenodot-project.json`) and read literally — no agent
   inference, no "what are you building?" prompt. One install per project; each is **independent**
   and **learns that project**. Works on existing (non-greenfield) projects, additively.

2. **Packages are portable.** A domain package is an **agentskills.io `SKILL.md` / `SOUL.md`
   bundle** — the same standard our framework, OpenClaw, and Hermes already speak. Authored once,
   it can run on Claude Code today and (later) be installed _on top of_ OpenClaw or Hermes. Each
   package starts **empty (0)** and accumulates as it learns the project.

## Use, don't compete

We are not building a rival agent runtime. We want to **use** OpenClaw and Hermes where useful:

- **Orchestrate them as workers** — drive them via their agentic APIs (OpenClaw `/v1/responses`,
  Hermes `/v1/runs`) or MCP, and gate results through their human-approval endpoints. This is the
  same pattern the framework already uses to dispatch to Hermes.
- **Distribute our packages onto them** — both install skills via the open `SKILL.md` standard
  (Hermes git-"taps"; OpenClaw ClawHub/bundles). Neither has an incumbent proprietary marketplace
  today, so a curated domain-package marketplace is an open lane, not a fight.

## Pointers (research, June 2026; sourced from live repos/docs)

- **OpenClaw** — `github.com/openclaw/openclaw`, `docs.openclaw.ai`. Config-first agent runtime
  (Gateway + `SOUL.md`/`SKILL.md`); surfaces: OpenAI-compat, `/v1/responses`, Gateway WebSocket,
  MCP (both directions), ACP (can host Claude Code/Codex). Packages via ClawHub + a plugin SDK.
- **Hermes Agent** — `github.com/NousResearch/hermes-agent`. Self-improving runtime; OpenAI-compat
  - `/v1/runs` with human-in-the-loop `approval`; skills are `agentskills.io` `SKILL.md` folders
    distributed by git tap; MCP client and server.

## What this is NOT (yet)

No real package content (app/salesforce start empty). No OpenClaw/Hermes adapters built. No
marketplace yet. No per-project _library_ isolation yet (today: domain-level isolation —
app ≠ godot). These are later increments; see `docs/whitelabel/SEAMS.md` and the plan.
