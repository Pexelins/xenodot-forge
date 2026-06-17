# Handoff — POC: Hermes as a research sub-agent

> **Status: not started — design handoff.** Everything below is decided context plus a build
> plan for a fresh agent/developer to pick up. No code has been written for this yet.
>
> **Goal:** let a Xenodot _researcher_ agent delegate the heavy investigation half of its job to a
> [Hermes Agent](https://hermes-agent.nousresearch.com/) instance running as a sub-agent (a worker
> the Hive dispatches to), **without** giving up the human-in-the-loop gate. One thin bridge, one
> researcher, one approval flow — prove the seam, then decide whether to widen it.

## Why this shape (decisions already made)

These were settled in discussion; don't relitigate them, build on them.

- **Sub-agent, not orchestrator-on-top.** The human-gated Xenodot Hive stays the boss. Hermes is a
  subordinate worker invoked per-task. Putting Hermes _on top_ as an autonomous conductor was
  rejected: it reintroduces the unattended autonomy we explicitly don't want.
- **Researcher first, because it's the lowest-risk seam.** The researcher agents
  (`cli-researcher`, `skill-researcher`, `addon-researcher`, `transcript-researcher`) are
  **advisory** — they investigate and recommend; they never write game code and never adopt without
  human approval (see `plugin/agents/*-researcher.md`). So routing their _investigation_ to Hermes
  produces no Godot engine artifacts to mis-trust, and the human verdict gate stays exactly where it
  is. This sidesteps the verification problem entirely for v1.
- **Human in the loop is the one rule that doesn't bend.** Every Hermes dispatch is a tool call, so
  it already passes the framework's `canUseTool` / PreToolUse approval gate (allow/deny in the web
  UI). The adopt/reject verdict still goes to the human via the existing `mcp__ui__form` / `ask`
  flow. The bridge adds no new way to act without the human.

## What Hermes actually exposes (constraints on the build)

Researched June 2026 — verify against current docs before building:

- Hermes is a **separate runtime with its own model** (Hermes family). It **cannot** be a Claude
  Agent SDK `AgentDefinition` (`plugin/agents/*.md`) — those run on the same Claude loop. Integrate
  over the network instead.
- Hermes ships an **OpenAI-compatible HTTP API**: `POST /v1/chat/completions`, `POST /v1/responses`
  (stateful, `previous_response_id` chaining), and a **`runs` API** for long-form sessions with
  subscribable progress events. Enabled via `API_SERVER_ENABLED=true` + `API_SERVER_KEY`. The agent
  answers with its full toolset (terminal, files, web search, memory, skills).
  → docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- Hermes is an **MCP client, not (yet) an MCP server** — exposing Hermes _as_ an MCP server is an
  open feature request (NousResearch/hermes-agent#342). So **do not** plan to mount Hermes as an MCP
  server; wrap its HTTP API ourselves.

## Architecture

```
Xenodot Hive (human-gated orchestrator)
   └─ dispatches → cli-researcher  (Xenodot agent, owns verdict + human gate)
                      └─ calls tool → mcp__ui__hermes  ──HTTP──▶  Hermes API server
                                       (the bridge)               (web search · memory · skills)
                      ◀── findings ───────────────────────────────┘
                      └─ surfaces adopt/reject → mcp__ui__form → HUMAN
```

The bridge is **one new in-process SDK MCP tool**, built exactly like the existing ones.

### Where it plugs into the codebase

- **Tool factory:** add `ui/server/hermes-tool.js` exporting `makeHermesTool(...)`, mirroring
  `ui/server/form-tool.js` / `ask-tool.js` / `promote-tool.js`.
- **Register it:** add `makeHermesTool(...)` to the `mcpServers.ui.tools` array at
  `ui/server/session.js:411` (the `createSdkMcpServer({ name: "ui", … })` block). It becomes
  callable as `mcp__ui__hermes`.
- **Config:** read Hermes base URL + API key from env (e.g. `HERMES_API_URL`, `HERMES_API_KEY`) in
  `ui/server/config.js`; if unset, the tool should be a no-op that reports "Hermes not configured"
  rather than erroring — the framework must run unchanged when Hermes is absent.
- **Grant it to ONE agent:** add `mcp__ui__hermes` to the `tools:` frontmatter of the chosen
  researcher (recommend `cli-researcher` — it already does web research and has `WebSearch`/
  `WebFetch`, so Hermes is a natural heavier alternative). Add a short prompt section telling it
  _when_ to delegate to Hermes vs. use its own `WebSearch` (delegate for multi-step / memory-backed
  investigations; keep quick lookups local).

### Tool contract (suggested)

`mcp__ui__hermes` input: `{ task: string, context?: string, timeout_s?: number }`.
Behavior: POST to Hermes `/v1/responses` (or open a `runs` session and relay progress events to the
UI feed via the same `send(...)` channel the other tools use), return Hermes's final text as the
tool result. Keep it stateless per call for v1 (no `previous_response_id` chaining) — simpler to
reason about and to gate.

## Milestones (each independently demoable)

- **M0 — Hermes reachable.** Stand up Hermes locally (`API_SERVER_ENABLED=true`), `curl
/v1/responses` with a trivial prompt, confirm a tool-equipped answer. _Done when: a shell curl
  returns a real Hermes response._
- **M1 — Bridge tool.** `ui/server/hermes-tool.js` + registration in `session.js`. _Done when:
  invoking `mcp__ui__hermes` from a session returns Hermes output, and the call shows up in the
  approval gate (allow/deny) and the live event feed._
- **M2 — One researcher delegates.** Grant the tool to `cli-researcher` and add the delegate-vs-local
  prompt rule. _Done when: a real capability-gap research task is investigated by Hermes, and
  `cli-researcher` returns its normal verdict + `library/tools/<slug>.md` draft, decision still
  surfaced to the human._
- **M3 — Graceful absence.** With `HERMES_API_URL` unset, the whole framework runs exactly as today
  and the tool reports "not configured". _Done when: onboarding + a normal session pass with Hermes
  off._

## Human-in-the-loop guarantees (must hold — acceptance gate)

1. Every Hermes dispatch passes the existing tool-approval gate (no silent network call).
2. The adopt/reject verdict still goes to the human via `mcp__ui__form` / `ask` — Hermes never
   adopts a skill/tool, never writes under `.claude/` or `tools/`, never touches game files.
3. Hermes output is **advisory input to a Xenodot agent**, not a final action. The researcher's
   existing "never adopt without human yes" rule is unchanged.
4. Framework runs unchanged when Hermes is not configured.

## Out of scope for this POC

- Routing **`godot-dev`** or any code/scene authoring to Hermes (would bypass `godot-verify` — that's
  the whole moat; not now).
- Hermes writing files, adopting skills, or committing anything.
- Persistent Hermes memory shared as a source of truth (the "two brains" problem — park it; see
  README "Honest limitations").
- `previous_response_id` / multi-turn Hermes sessions, multi-channel (Telegram/Slack) reach, and
  always-on operation.

## Risks & open questions

- **Quality:** Hermes runs its own model — is its research _better_ than `cli-researcher`'s native
  `WebSearch`/`WebFetch` for our gaps, or just heavier? M2 must compare on a real task, not assume.
- **Two-brain drift:** Hermes has its own skills/memory; ours live in the plugin + `promote`. Keep
  Hermes purely advisory in v1 so nothing it "learns" leaks in unreviewed.
- **Latency/cost:** the `runs` API is long-form; decide a sane `timeout_s` and surface progress so a
  slow Hermes call doesn't look hung in the UI.
- **Which researcher** beyond `cli-researcher` benefits most later — `skill-researcher` (external
  skill-library evaluation) is the obvious next candidate, but it writes under `.claude/` on adopt,
  so keep the write on our side (Hermes investigates, Xenodot writes).

## References

- This framework's MCP tool pattern: `ui/server/session.js:407` (`createSdkMcpServer`),
  `ui/server/form-tool.js`, `ui/server/ask-tool.js`, `ui/server/promote-tool.js`.
- Researcher agents: `plugin/agents/cli-researcher.md`, `plugin/agents/skill-researcher.md`
  (note their foreground-write vs background-investigate split — Hermes slots into the
  _investigate_ half).
- README sections "Not a competitor, a conductor" and "Honest limitations (and where they're going)".
- Hermes: [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) ·
  [MCP (client)](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) ·
  [issue #342 — Hermes as MCP server](https://github.com/NousResearch/hermes-agent/issues/342).
