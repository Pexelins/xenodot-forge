# Handoff — Hermes as a research sub-agent (BUILT, + self-improvement turned on)

> **Status: built and in use.** The POC shipped. This doc is now the as-built record plus the
> reasoning behind the latest change: Hermes' **self-improvement** (its own skills + memory) is now
> turned on, while the hard rule — _Hermes never touches the game or this framework_ — is unchanged.
>
> **Goal (unchanged):** let the human-gated Xenodot **Hive** delegate the heavy investigation half
> of research to a [Hermes Agent](https://hermes-agent.nousresearch.com/) instance, **without**
> giving up the human-in-the-loop gate. Hermes investigates; humans (via the `*-researcher` agents)
> adopt.

## Decisions that still hold

- **Sub-agent, not orchestrator-on-top.** The Hive stays the boss; Hermes is a subordinate worker
  invoked per task. No unattended autonomy on top.
- **Hive-only dispatch.** Only the Hive calls `mcp__ui__hermes` (gated allow/deny per call). The
  researcher agents _consume_ Hermes findings but never call it themselves.
- **Advisory only.** Hermes' output is input to a Xenodot agent, never a final action. The
  adopt/reject verdict still goes to the human; the researcher writes the `plugin/library/` entry;
  `promote` globalizes it. Hermes writes nothing in our repo.
- **Graceful absence.** With Hermes off/unconfigured, the framework runs exactly as before; the tool
  reports "not configured" and the Hive dispatches a researcher directly.

## As-built architecture

```
Xenodot Hive (human-gated)
   └─ mcp__ui__hermes  ──POST /v1/runs──▶  Hermes API server (platform: api_server)
        (Hive-only, gated)                   toolset: web · search · memory · skills
        └─ background watcher                 (memory + skills = Hermes' OWN brain, ~/.hermes)
             polls GET /v1/runs/{id}
             (+ best-effort SSE events) ◀──── reads `output` when status=completed
        └─ pushes findingsTurn()  → Hive → hands to xenodot:*-researcher → HUMAN verdict
        └─ on fail/timeout/approval-stall: pushes fallbackTurn() → Hive dispatches researcher itself
```

There is **no MCP callback** (the old `mcp_servers.xenodot` / `/mcp` / `deliver_findings`
subsystem was deleted). Hermes' runs API has no webhook; findings are **read** from
`GET /v1/runs/{id}`. See `memory/hermes-integration.md` for the runs-API facts.

### Where it lives in the codebase

- **Bridge tool:** `ui/server/mcp-tools/hermes-tool.js` — `makeHermesTool(send, push)`.
  `createRun()` POSTs `/v1/runs`; `watchRun()` polls + streams; `findingsTurn()` / `fallbackTurn()`
  re-enter the session as synthetic user turns; `buildInstructions()` composes the run instructions.
- **Registration:** `ui/server/core/session.js` (the `createSdkMcpServer({ name: "ui" })` tools
  array) → callable as `mcp__ui__hermes`.
- **Config:** `ui/server/core/config.js` (`getHermesConfig` / `saveHermesConfig` /
  `hermesPublicConfig`). Env `HERMES_ENABLED|API_URL|API_KEY|MODEL`, else `.xenodot.json` `hermes`
  block. No-op (advisory string) when unconfigured.
- **Setup / probe / gateway:** `ui/server/integrations/hermes/{hermes-setup,hermes-check,
hermes-gateway}.js`; persona text in `hermes-soul.md` + `ui/lib/hermes-personas.js`.
- **Researchers that consume findings:** `plugin/agents/{cli,skill,addon}-researcher.md`.
- **User docs:** `HERMES.md`. **Orchestrator routing:** `ui/orchestrator.md`.

## The self-improvement change (this update)

**Why:** Hermes Agent's headline feature is a self-improvement loop — after a non-trivial task it
writes/updates its own reusable **skills** (`skill_manage` → `~/.hermes/skills/`) and a background
review refreshes its **memory** (`MEMORY.md`/`USER.md`). The original POC parked this ("two-brain
drift"), so our runs ran one-shot with the `skills` toolset off and **never** self-improved — the
user correctly noticed "no skills, no self-improvement."

**What changed:**

1. `hermes-setup.js` default toolset `web,search,memory` → **`web,search,memory,skills`**
   (writes `platform_toolsets.api_server`). `memory` was already on; adding `skills` is what lets
   Hermes create/load its own skills on our `api_server` runs.
2. `hermes-tool.js` `buildInstructions()` now **invites** Hermes to grow its own skills/memory _and_
   restates the guardrail ("you NEVER edit the caller's game or codebase").
3. `hermes-tool.js` `extractProgress()` now surfaces `🧠 Hermes is updating its own skills/memory`
   in the activity feed (via `describeSelfImprovement()`), so the learning is **visible**.
4. `HERMES.md` gained a "Self-improvement: Hermes' own brain, not your code" section; its stale
   MCP-callback references were removed.

**The guardrail (the reason this is safe — two different spheres):**

| Sphere            | What                                                                       | Who writes it                                                    |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Hermes' brain** | `~/.hermes/skills`, `~/.hermes/MEMORY.md` — its procedural/episodic memory | Hermes, freely                                                   |
| **Our project**   | the game + this framework                                                  | only a `*-researcher` after the **human** approves; never Hermes |

Hermes physically cannot touch our files because the machine-access toolsets
(`terminal`/`file`/`code_execution`/`browser`) stay **off** on the `api_server` path. Adoption into
our repo is still the gated researcher → `plugin/library/` → `promote` loop. **Two-brain drift is
accepted on purpose**: Hermes investigates and gets smarter at it; humans adopt.

## Human-in-the-loop guarantees (must hold — acceptance gate)

1. Every Hermes dispatch passes the existing tool-approval gate (no silent network call).
2. The adopt/reject verdict still goes to the human; Hermes never adopts a skill/tool, never writes
   under `.claude/`, `plugin/`, `tools/`, or the game.
3. Hermes output is advisory input to a Xenodot agent, not a final action.
4. Framework runs unchanged when Hermes is not configured.
5. **New:** Hermes self-improves only its **own** `~/.hermes` brain; machine-access toolsets stay off
   so it cannot change the game or framework.

## Out of scope (still parked)

- `terminal`/`file`/`code_execution`/`browser` on the API path — off by default, always.
- Routing `godot-dev` / code authoring to Hermes (would bypass `godot-verify` — the moat).
- Auto-importing Hermes' learned skills into `plugin/library` — adoption stays human-gated.
- `previous_response_id` multi-turn chaining — unneeded: self-improvement already persists
  server-side in `~/.hermes` across one-shot runs.

## Verify

- `npm run hermes:setup -- --reset && npm run hermes:setup -- --yes` → `config.yaml` shows
  `platform_toolsets.api_server: [web, search, memory, skills]`.
- `npm run hermes:check` → lists `skills` + `memory` as enabled, **not** flagged as machine-access.
- Real research task → watch the feed for `🧠 Hermes is updating its own skills`; confirm a new
  `~/.hermes/skills/<name>/SKILL.md` exists and **no** game/framework file was touched by Hermes.
- Re-run a similar task later → Hermes loads its saved skill (self-improvement across runs).

## References

- MCP tool pattern: `ui/server/core/session.js`, `ui/server/mcp-tools/{form,ask,promote}-tool.js`.
- Hermes docs: [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
  · [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/)
  · [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)
  · [Configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration).
- Memory note: `memory/hermes-integration.md` (runs-API facts; no callback).
