# First non-game trial — onboarding the `app` / `webapp` domain

The first real test of the framework against an **existing** codebase in a **non-game** domain:
an existing, non-greenfield **Node/TypeScript** app (`<project>`). The goal was **not** to ship
features in that project — it was to find where the **spine** holds and where it leaks game/Godot
assumptions, so we know how to onboard a non-greenfield project with least friction.

> Archived record (generalized). Project-specific names have been replaced with `<project>`. The
> reusable value here is the onboarding-trial template (Phases 0–4) and the **Seams found** log
> (S1–S7). The `webapp` domain is the same shape as `app`, so these findings apply to both.

> What this actually tested: the `app` domain (like its `webapp` sibling) is a **bare** pack —
> `domains/app/plugin/` has only `plugin.json` (zero agents, zero skills, zero library) and
> `domains/app/orchestrator.md` is a 10-line stub. So this trial exercises the **spine** (init →
> session → orchestrator → agent dispatch → integrations) with an empty domain, not the Godot
> capability set. Every gap hit is a candidate entry for `docs/whitelabel/SEAMS.md`.

## How to use this doc

Run phases top-to-bottom (each phase's preconditions are satisfied by the previous one). For each
step, record the verdict in-line: **PASS** / **FAIL** / **PARTIAL** + a one-line note. Anything
Godot-specific that breaks goes in the **Seams found** log at the bottom, then into `SEAMS.md`.

Mapping to the requested areas: **Phase 1** = "init framework + Orchestrator start", **Phase 2** =
"agent", **Phase 3** = "Hermes setup", **Phase 4** = "Codex setup". Phase 0 is prep/safety.

---

## Phase 0 — Prep & safety (don't skip)

**Objective:** start from a clean, reversible state; keep the target project pristine.

| #   | Step                                                   | Command / action                                                                                                                  | Expected                 | Verdict |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------- |
| 0.1 | Confirm sibling layout (no move, no nesting)           | `ls ..` shows `xenomoon/` and `<project>/` as siblings                                                                            | both present             |         |
| 0.2 | Snapshot the project so the trial is reversible        | in `<project>`: `git status` clean, note current `HEAD`                                                                           | clean tree, recorded SHA |         |
| 0.3 | Keep the project pure — pre-ignore framework artifacts | in `<project>` `.gitignore` add: `.xenomoon-project.json`, `library` (symlink), and `tools/` **only if** materialize writes there | lines added              |         |
| 0.4 | Decide framework instance                              | shared checkout for one project. Promote to a sibling **git worktree** only once you start editing the framework for this domain  | decision recorded        |         |
| 0.5 | Baseline framework health                              | in xenomoon: `npm run validate`                                                                                                   | tsc + eslint clean       |         |

---

## Phase 1 — Init framework + Orchestrator start

**Objective:** bind the framework to `<project>` under the `app` (or `webapp`) domain and confirm a
session boots with the **app/webapp** orchestrator (not the Godot one).

### 1A. Install / bind

```bash
cd <xenomoon>
npm run new -- <project> --domain=app    # or --domain=webapp
```

| Check                               | Expected                                                                                                                                                                 | Verdict |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Domain binding written              | `app`/`webapp` are `materializeIntoProject:false` → no `.xenomoon-project.json` in the project; the binding lands in xenomoon `.xenomoon.json` (`projectDir` + `domain`) |         |
| No scaffold dumped into the project | `populated:false` with no `starter` → the project tree is untouched                                                                                                      |         |
| Existing project detected           | `package.json` present → wired **in place**, not scaffolded                                                                                                              |         |
| `setup` saved the path              | xenomoon `.xenomoon.json` has `projectDir` → `<project>` (abs)                                                                                                           |         |
| `materialize` ran                   | note **exactly what it wrote into the project** (for these domains: nothing)                                                                                             |         |
| `doctor` verdict                    | runs **soft** checks for `populated:false` (no hard fail on missing agents)                                                                                              |         |

**Likely seams:** `materialize` / `doctor` were written for Godot (copy `tools/`, symlink `library/`,
expect `validate.sh`, resolve a Godot engine binary). Record any step that errors or assumes
`project.godot`. The Godot engine-bin resolution in `config.js` may try to resolve a Godot path even
in a Node domain — note if it warns. _(Fixed: see S2.)_

### 1B. Start a session

```bash
npm start <project>     # cwd of the SDK session = <project>
```

| Check                      | Expected                                                                                                                                      | Verdict |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Server boots, UI reachable | web UI loads, no crash on boot                                                                                                                |         |
| Active domain = app/webapp | logs/UI show the domain and plugin dir `domains/<name>/plugin`                                                                                |         |
| Orchestrator source        | system prompt append = `domains/<name>/orchestrator.md` (the stub), **not** `ui/orchestrator.md`                                              |         |
| Project name resolves      | shows a sensible name from `package.json` (**watch:** `project-state.js` historically read Godot's `config/name=` regex — see S3)             |         |
| Inventory panel            | inventory scans `.js/.ts/.jsx/.tsx`; "scenes" should be empty. Note any Godot field labels ("scenes"/"scripts") leaking in the UI             |         |
| Manifest                   | `gen-manifest.js` parses `project.godot` INI for godot; for a Node domain expect empty/null render config or an error — record which (see S4) |         |

### 1C. Orchestrator first turn

| Check                                               | Expected                                                                                                                       | Verdict |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------- | --- |
| Orchestrator is **not** auto-started                | nothing runs until the first user message (it's a system-prompt append)                                                        |         |
| Send a first message (e.g. "what is this project?") | orchestrator responds using the project tree as cwd; should **not** invoke `xenomoon:*` agents (none exist in an empty domain) |         |
| Human-gated loop holds                              | it asks/cuts a slice/verifies with `npm run build                                                                              | lint    | test --if-present` rather than guessing |     |

**Phase 1 verdict:** ✅ **PASS** (2026-06-20). `npm ci` (216 pkgs) → `npm run new -- <project>
--domain=app` (locked, wired in place, doctor OK) → `npm start` boots on `http://localhost:3117`,
HTTP 200, title "Xenomoon Forge", `/api/state` → `{name:"<project>", found:true, scenes:0}`. The
**spine installs and runs on a non-greenfield Node project.** · **Seams:** S1, S2, S3 below.

---

## Phase 2 — Agent system

**Objective:** confirm how agent dispatch behaves with an **empty** domain pack, and that authoring a
**project-local** agent works (the intended path for a learning domain).

### 2A. Confirm the empty-pack behavior (expected, not a bug)

| Check                                   | Expected                                                                                               | Verdict |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| No framework agents load                | `domains/<name>/plugin/agents/` doesn't exist → zero `xenomoon:*` agents available                     |         |
| Orchestrator doesn't hallucinate agents | it should route work itself, not call a missing `xenomoon:godot-dev` etc.                              |         |
| Negative test                           | explicitly ask it to "use the godot-dev agent" → should report no such agent rather than fail opaquely |         |

### 2B. Author a project-local agent (the real workflow for an empty domain)

The empty-domain orchestrator says capabilities are "authored project-locally first." Test that loop:

| Step | Action                                                                               | Expected                                                                                   | Verdict |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| 2B.1 | Create `<project>/.claude/agents/ts-dev.md` (a minimal TS/Node implementer agent)    | file created in the project's `.claude/`                                                   |         |
| 2B.2 | Restart/refresh session (session loads `settingSources: ["user","project","local"]`) | the project's `.claude/` agents are honored                                                |         |
| 2B.3 | Ask the orchestrator to delegate a tiny task to `ts-dev`                             | subagent spawns with the project as cwd, edits gated by the project's own permission hooks |         |
| 2B.4 | Confirm purity                                                                       | the new agent lives in the project's `.claude/`, **not** in the framework `plugin/`        |         |

**Open question:** for a non-greenfield app, do project-local `.claude/agents` give enough leverage,
or do we want a shared **capability pack** (`domains/<name>/plugin/agents/*`) with generic
dev/review/test agents? Record the friction; this decides whether the domain stays a stub or gets
populated.

**Phase 2 verdict:** **\_\_** · **Seams / decisions:** **\_\_**

---

## Phase 3 — Hermes setup (optional external researcher)

**Objective:** confirm the Hermes seam is domain-agnostic and reachable from a non-game session.
Hermes is a **separate program with its own model + billing**; no hosted endpoint. Off by default.

> Cost: ~$0.25–$2.50 per deep run on whatever provider you pick. Only run 3.7 if you want to spend it.

| Step | Command / action                        | Expected                                                                                     | Verdict                                                                                                                                                                                       |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 3.1  | Guided setup                            | `npm run hermes:setup` (or `-- --yes`)                                                       | installs `hermes` if missing; writes `~/.hermes/.env` (`API_SERVER_*`), sets `platform_toolsets.api_server: [web,search,memory,skills]`, installs SOUL, wires `.xenomoon.json` `hermes` block |     |
| 3.2  | **De-Godot the SOUL**                   | inspect `~/.hermes/SOUL.md` — the installed persona is Godot-flavored                        | for a non-game project, delete it (use Hermes' default) or edit to a generic/TS framing. **Seam:** SOUL template is game-specific (S7)                                                        |     |
| 3.3  | Provider auth                           | `hermes portal open` (Nous) or `hermes auth add` (other)                                     | one-time browser/API auth                                                                                                                                                                     |     |
| 3.4  | Run gateway                             | `hermes gateway` in its own terminal                                                         | serves `http://localhost:8642`                                                                                                                                                                |     |
| 3.5  | Verify toolset safety                   | `npm run hermes:check`                                                                       | "no machine-access tools" — Hermes can't touch the project's code                                                                                                                             |     |
| 3.6  | Point Xenomoon at it                    | ⚙ Settings → enable, URL + server key → **Test connection** (probes `/v1/models`, no charge) | green                                                                                                                                                                                         |     |
| 3.7  | (optional, billable) Real research task | ask the Hive a capability/knowledge-gap question; approve the `mcp__ui__hermes` gate         | fire-and-forget; watcher streams Hermes lines; result returns as a message                                                                                                                    |     |

**Likely seams:** SOUL persona (3.2). Also: with an empty domain there's no `*-researcher` agent to
hand Hermes findings to (the Godot flow does researcher → `library/` → promote). Record what happens
to results when there's no researcher to adopt them.

**Phase 3 verdict:** **\_\_** · **Seams:** **\_\_**

---

## Phase 4 — Codex setup (optional on-demand reviewer)

**Objective:** confirm Codex review works on the project's TS code. Off by default, gated, vendored
locally. **Billed to your ChatGPT/OpenAI account**, not Anthropic.

| Step | Command / action   | Expected                                                                                                                  | Verdict                                                                                                              |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --- |
| 4.1  | Prereq             | Node ≥ 18.18; `@openai/codex` CLI                                                                                         |                                                                                                                      |
| 4.2  | Setup              | `npm run codex:setup`                                                                                                     | checks/install CLI, clones `codex-plugin-cc` into gitignored `vendor/`, sets `.xenomoon.json` `codex:{enabled:true}` |     |
| 4.3  | Login              | `codex login` (or `! codex login` in-session)                                                                             | one-time auth                                                                                                        |     |
| 4.4  | **Model gotcha**   | if ChatGPT login: set `model = "gpt-5.5"` in `~/.codex/config.toml` (the `*-codex` variants are rejected on ChatGPT auth) | routable model                                                                                                       |     |
| 4.5  | Readiness          | `npm run codex:check`                                                                                                     | CLI present, logged in, plugin vendored, model routable                                                              |     |
| 4.6  | Session wiring     | confirm `session.js` appended the Codex plugin (only when `enabled` **and** vendored)                                     | plugin in the SDK `plugins` array                                                                                    |     |
| 4.7  | Review the project | in a session type `/codex:review --base main` (slash commands run only when **you** type them)                            | Codex posts findings on the TS diff; advisory only                                                                   |     |

**Domain check:** Codex review is language-agnostic, so this should be the **cleanest** of the four —
a good signal of "what onboarding looks like when nothing is game-coupled." Caveat: the
`codex:codex-rescue` subagent delegation assumes an orchestrator with domain knowledge (empty for a
stub domain); plain `/codex:review` doesn't.

**Phase 4 verdict:** **\_\_** · **Seams:** **\_\_**

---

## Exit criteria

- [x] Framework binds to an existing project with one command and **zero moves/nesting**.
- [x] A session boots in the `app` domain with the correct (stub) orchestrator and the project as cwd.
- [ ] The empty-pack agent behavior is understood; a project-local agent works end-to-end.
- [ ] Hermes and Codex are reachable from a non-game session (or cleanly skippable).
- [ ] Every game/Godot assumption hit is logged below and triaged into `SEAMS.md`.
- [ ] We can answer: **does the empty domain stay a stub (project-local capabilities) or get a shared pack?**

## Seams found (→ promote to docs/whitelabel/SEAMS.md)

Status: ✅ **FIXED** on our trunk · ⏳ predicted (not yet hit) · severity in **bold**.

| #      | Status       | Where                                                                                | Godot assumption                                                                                                                           | Impact / verification                                                                                          | Fix applied                                                                                                                                      |
| ------ | ------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S1** | ✅ **FIXED** | `project-state.js` `walk()` + `domain.json` `inventory.ignore` (+ resolver typedefs) | recursive scan, no ignore list                                                                                                             | was **7,749 scripts (7,659 node_modules)**; **now 90, 0 node_modules**                                         | `walk()` skips `inventory.ignore` dirs; Node domains declare `["node_modules","dist","build","out","coverage"]`, godot `[]` (behavior preserved) |
| **S2** | ✅ **FIXED** | `engine-bin.js` + `config.js` + `doctor.js`                                          | macOS Godot bundle hardcoded in `resolveEngineBin` → returned for **any** engine name (incl. `node`); persisted `$GODOT` for a Node domain | doctor now: "**Node toolchain via package scripts (no engine binary needed)**"; no `$GODOT` exported/persisted | new `engineNeedsBinary()` gates probe/export/persist to the godot family (godot/redot/blazium); stale bin removed                                |
| **S3** | ✅ **FIXED** | `project-state.js` name                                                              | reads Godot `config/name="…"` regex only                                                                                                   | name now resolves from `package.json` (not basename fallback)                                                  | extract by `projectFile` ext: `.json` → `pkg.name`, else INI regex                                                                               |
| S4     | ⏳           | `gen-manifest.js`                                                                    | parses `project.godot` INI, lists `*.gd`, renderer/main_scene                                                                              | manifest tiny/empty for a Node domain (763 B, no leak) — **did not break**                                     | route `commands`/manifest through domain pack                                                                                                    |
| S5     | ⏳           | `onboarding.check.js`                                                                | Godot headless boot, asserts `project.godot` / `validate.sh`                                                                               | tier-2 checks N/A (not run this trial)                                                                         | gate behind `populated`/domain                                                                                                                   |
| S6     | ⏳           | `ui/orchestrator.md` + plugin agent set                                              | names Godot agents                                                                                                                         | an empty domain ships none (by design) — Phase 2                                                               | shared core pack vs project-local — decide in Phase 2                                                                                            |
| S7     | ⏳           | hermes SOUL template                                                                 | Godot/GDScript persona                                                                                                                     | wrong framing for a non-game project — Phase 3                                                                 | neutral default for non-game domains                                                                                                             |

## Notes / running log (technical, generalized)

- **Install:** `npm ci` (216 pkgs) → `npm run new -- <project> --domain=app` → `npm start` boots
  `:3117`, UI 200, `/api/state` ok. **Phase 1 PASS.**
- **Gotcha:** launching `npm start` _through `rtk`_ swallows server stdout (rtk buffers until exit);
  run the server raw, not via `rtk`.
- **Seams confirmed:** S1 (node_modules inventory bloat, HIGH), S2 (`$GODOT` label on a Node domain),
  S3 (name = basename). S1 is the one that actually hurts onboarding a real Node repo.
- **Fixed S1/S2/S3.** Files touched: `engine-bin.js` (new `engineNeedsBinary`), `config.js`,
  `doctor.js`, `domain-resolver.js` (`inventory.ignore` typed), `project-state.js` (`walk()` ignore +
  name extractor), `domains/{app,godot}/domain.json`. `npm run validate` green (tsc + eslint 0-warn +
  structure). Verified live: `/api/state` 90 scripts / 0 node_modules, name from `package.json`;
  doctor "Node toolchain via package scripts". Godot domain unchanged (`ignore: []`).
- These are **general spine fixes** — they belong upstream, not project-specific.
