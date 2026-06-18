# Xenodot Forge — framework spine rules

Rules for working **on the framework itself** (the Node/TS web UI and tooling under
`ui/`). The game's own rules live in the game project, not here — see `plugin/`, the
**xenodot** Claude Code plugin the framework loads into every game session.

> Scaffold — expand with your own conventions. The essentials below match what the repo
> already enforces.

## Always

- Prefix shell commands with `rtk` (a PreToolUse hook enforces it; see `.claude/settings.json`).
- Plain JS + JSDoc only — no `.ts` files. Types are checked via tsconfig `checkJs`.
- Node/CLI scripts live in `ui/server/` so eslint's node group + tsconfig type-check them.

## Before committing

- `npm run validate` (tsc + eslint, zero warnings) must pass.
- `npx prettier --write` keeps formatting clean (lint-staged also runs it on commit).

## Layout

- `ui/server/` — Node server + CLI scripts, grouped by domain: `core/` (+ `core/http/`),
  `integrations/{hermes,codex}/`, `features/{tasks,assets,levels,promotions,transcripts}/`,
  `mcp-tools/` (the in-process `makeXTool` SDK tools), and `cli/` (`setup`, `new`, `promote`,
  `doctor`, `materialize`, `update-badges`, `release-*`). New files go in the matching domain.
- `ui/client/` — browser modules, grouped by domain: `core/` (state, transport, dom/render
  helpers, `main.js` entry) and `features/{chat,activity,tasks,approvals,agents,settings,
sessions,promotions,project,level-editor,assets}/`. `ui/lib/` — shared JSDoc typedefs + helpers.
- `plugin/` — the **xenodot** Claude Code plugin: the framework's agents, skills, tools, hooks
  and knowledge base (`library/`). The single source of truth, loaded into every game session
  via the SDK `plugins` option (`session.js`) so games need no copies; terminal use installs it
  once (`.claude-plugin/marketplace.json`). Capabilities namespace as `xenodot:<name>`.
- `starter/` — the minimal Godot project + thin templates `forge new` scaffolds into a new game.
- Never put game-specific files in the framework; it points at an external game (default
  `../game`), reads it in place, and the game stays pure game.
