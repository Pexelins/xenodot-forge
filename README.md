# Xenodot Forge (POC)

A small framework/workflow for building Godot games with [Claude Code](https://claude.com/claude-code) — **structure, not vibe coding**.

Naming, around here:

- **Xenodot** — the ecosystem
- **Xenodot Forge** — this framework (the web UI + the workflow)
- **Xenodots** — the individual agents (designer, dev, refactor, researchers, triage)
- **Xenodot Hive** — the multi-agent coordination (the orchestrator main loop)

It gives you a deliberate pipeline instead of a free-form chat box:

```
idea → game-designer agent  (interviews you, cuts scope, writes a one-page design doc)
     → godot-dev agent      (implements exactly that doc)
     → godot-verify         (headless engine checks — catches what Godot silently drops)
     → you                  (one look in the editor)
```

The point is to **speed up your process without taking it over**. The designer agent is expected to push back on big or vague requests until the scope is one small, verifiable slice. Nothing gets built that wasn't agreed first, and nothing gets reported "done" without passing real engine checks.

## Status

⚠️ **Proof of concept.** Shared so you can fork it and experiment with your own game. APIs, file layouts, and agent prompts will change without notice.

**Not accepting contributions for now** — issues and PRs are unlikely to be reviewed. Fork freely instead; it's MIT.

## What's inside

```
ui/                 web UI (Node) — drive sessions from a browser:
                    chat pane, agent questions as clickable forms,
                    tool approvals as allow/deny buttons, live event feed
game/               your Godot project mounts here (gitignored — it has its
                    own repo; the framework tracks only the folder)
```

There is **no template**. The agents, skills, and verification tools live *inside the game project* (`game/.claude/`, `game/tools/`) and evolve with it through the framework's own loops (bug triage, skill research, friction reports). One copy, the live one — the framework uses what is there. The reference project during the POC is [dicefate](https://github.com/Coghatch-ai/dicefate).

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and authenticated
- Godot 4.x (the skills target 4.x APIs; verified against 4.6)
- Node.js 18+ (only for the web UI)

## Quickstart

1. Put a Godot project with a `.claude/` setup into `game/` (clone one that has it, e.g. dicefate, or your own):

   ```bash
   git clone <your-godot-project> game
   ```

2. Start Claude Code **from the project directory** (that's what makes the agents and skills discoverable):

   ```bash
   cd game && claude
   ```

3. Ask for something. If it's small, `godot-dev` builds and verifies it. If it's big or vague, `game-designer` will interview you — one question at a time, with a recommended answer each — until the scope is one buildable slice. That's a feature, not a bug.

### Optional: web UI

```bash
npm install
node ui/server.js game   # or any path to a Godot project
# open http://localhost:3117
```

The designer's questions render as clickable forms, and tool permissions become allow/deny buttons.

## Design principles

- **Small slices.** A design doc is done when one agent task can implement it and verification plus one human look can confirm it.
- **Push-back is the product.** The framework should refuse to silently fill gaps in a vague brief with its own assumptions.
- **Verification is mandatory.** Godot exits 0 even on script parse errors and silently drops unknown `.tscn` properties. `tools/verify_scene.gd` exists because of bugs that shipped "verified" without it.
- **The framework does not do everything.** You stay the designer of your game; it keeps the loop fast and honest.

## License

[MIT](LICENSE)
