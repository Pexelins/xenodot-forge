---
name: tasks-mcp
description: Use mcp__ui__tasks as a plan and scratchpad inside any agent run. Add tasks at start, update status as you work, use note as scratchpad. Visible in the UI right rail and persistent across sessions.
metadata:
  type: utility
---

# Tasks MCP — Plan & Scratchpad

`mcp__ui__tasks` is a persistent task board (`.xenodot/tasks.json`, shown in the UI right rail).
Calling it never pauses the session — call it freely between other tool calls.

**Every run:** at START add your full plan as one batch; set each task `in_progress` before its
step and `done` after; leave nothing `pending`/`in_progress` when you return.

```jsonc
{ "op": "add", "tasks": [ { "title": "Build scene", "owner": "agent" } ] } // batch at start
{ "op": "update", "title": "Build scene", "status": "in_progress", "note": "scratchpad" }
{ "op": "update", "title": "Build scene", "status": "done" }
{ "op": "remove", "title": "Build scene" }                                  // step turned out unneeded
```

- `title` (required) is the key for `update`/`remove`. `status`: `pending` → `in_progress` → `done`.
- `owner`: `"agent"` (default), or `"user"` only for things the human must supply (an asset, a
  decision) — `user` tasks surface in the task / Get Assets modal. `note` is free-text scratchpad.

## Self-gate (before any handoff or return)

Before calling any handoff tool or ending your run, read `.xenodot/tasks.json` directly:

```bash
cat .xenodot/tasks.json
```

Confirm every task you own has `status: "done"`. If any are `pending` or `in_progress`, mark them done (or remove them if they turned out unneeded) **before** the handoff call — not after. A server reset between your last task-update and your handoff leaves ghost tasks the orchestrator must clean up manually. Closing tasks is the last thing you do before returning. Keep the open-task window small: mark a task `done` the moment its step finishes, not in a batch at the end — an unclosed task is only exposed to a reset for as long as you leave it open. Prefer one `in_progress` task at a time.
