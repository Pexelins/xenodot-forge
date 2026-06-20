# <Your game> — game conventions

This repo is the **game**. The AI framework that builds it — agents, `godot-*` skills, the
verify/gen tools, and the design→build→verify pipeline — loads from the **xenomoon** Claude Code
plugin (the single source of truth); it is **not** in this repo. Its working files appear here
only as gitignored, generated paths: `tools/` (copied from the plugin) and `library/` (a symlink
to the plugin's knowledge base). Game-specific skills/agents you author live in this repo's
`.claude/` until you promote them to the framework (`npm run promote -- …`).

Record only **this game's** conventions below — keep it thin (decisions here, not in chat). Run the
`godot-project-conventions` skill first to establish the renderer, window, folder layout, naming
and input map.

## Project conventions

_(empty — the `godot-project-conventions` skill fills this in on first setup.)_
