# UI conventions & protocol

## Conventions

- **No build step.** The UI is three static files — `index.html` (structure), `agent-ui.css` (all styling), `agent-ui.js` (all behavior) — plus `server.js`. If a change needs a bundler, it's out of scope for this POC. Static files are re-read per request: edit and refresh.
- **Design tokens** live as CSS variables in `:root` of `agent-ui.css` (`--accent`, `--bg`, `--panel*`, `--border*`, `--text*`, `--green`, `--amber`, `--red`, `--blue`, `--purple`, layout `--sidebar-w`/`--activity-w`). Use them; don't hardcode colors.
- **Agent colors**: the name hash picks only the hue; saturation/lightness come from `--agent-s`/`--agent-l` (52%/72%) so agent tags stay muted relative to semantic verb pills.
- **One session per WebSocket connection.** Refresh = new Claude Code session. Sessions run in the project directory passed to `server.js` and load its `.claude/` (agents, skills, CLAUDE.md).
- **Resume**: connect with `ws://host?resume=<session-id>` (the page does this via `/?resume=<id>`, used by the sidebar's recent-sessions list) to continue a previous session with full context.
- **The server holds no state.** Project inventory is scanned from disk per request; the browser holds per-session chat state only.

## HTTP

| Route | Returns |
|---|---|
| `GET /` | the UI page |
| `GET /api/state` | live project inventory (JSON, scanned on every call — never cached, never stale) |
| `GET /api/sessions` | recent sessions from the NDJSON logs: `[{ id, title, when }]` — `id` is the Claude Code session id |

`/api/state` shape:

```json
{
  "name": "...",            // from project.godot config/name
  "dir": "/abs/path",
  "designDocs": [{ "path": "design/x.md", "title": "first # heading" }],
  "library":  [{ "path": "library/x.md", "title": "first # heading", "verdict": "adopted <name> | rejected — … | parked | null" }],
  "scenes":  ["scenes/main.tscn"],
  "scripts": ["tools/verify_scene.gd"],
  "agents":  [{ "name": "godot-dev", "model": "sonnet" }],  // model from agent frontmatter
  "skills":  ["godot-verify", "..."]
}
```

## WebSocket messages

### Server → browser

| `type` | Payload | Meaning |
|---|---|---|
| `status` | `text` | lifecycle/info line |
| `event` | `message` (raw Agent SDK message: `system`/`assistant`/`result`/…) | session stream |
| `ask` | `id`, `input` (AskUserQuestion input: `questions[]` with `question`, `options[]`, `multiSelect`) | agent is interviewing the user; **session is paused until replied** |
| `form` | `id`, `input` (form tool input: `title`, `description?`, `submitLabel?`, `fields[]` — each `{ id, label, type, options?, placeholder?, required?, value? }`, `type` ∈ text \| textarea \| number \| checkbox \| select \| multiselect) | main agent composed a typed form (`mcp__ui__form`); **session is paused until replied** |
| `permission` | `id`, `toolName`, `input` | tool call awaiting approval; **session is paused until replied** |
| `policy` | `value` | current permission policy (sent at session start and on change) |

### Browser → server

| `type` | Payload | Meaning |
|---|---|---|
| `user_input` | `text` | user message into the session |
| `reply` | `id`, `payload` | answer to an `ask` (`{ answers: { [question]: "label" } }`), a `form` (`{ values: { [fieldId]: string \| number \| boolean \| string[] } }`, or `{ cancelled: true }` for Skip), or a `permission` (`{ allow: boolean, always?: boolean }` — `always` auto-allows that tool for the rest of the session) |
| `policy` | `value`: `ask` \| `edits` \| `all` | set this session's permission policy |

Notes:

- `permission` cards only appear for tools not already allowed by the project/user settings — an allowlisted Bash command never prompts.
- Custom free-text answers to `ask` are sent the same way as option labels.
- `mcp__ui__form` is an in-process MCP tool defined in `server.js` (`makeFormTool`); its handler waits for the `reply` and returns the values as the tool result (JSON keyed by field id).

## Permission policy

Per-session, switchable live from the header dropdown:

| Policy | Behavior |
|---|---|
| `ask` (default) | every un-allowlisted tool call shows an Allow/Deny card |
| `edits` | Edit/Write/MultiEdit/NotebookEdit auto-allowed; everything else asks |
| `all` | every tool auto-allowed |

`AskUserQuestion` and the `mcp__ui__form` form tool always reach the user regardless of policy — questions are the product, not a permission.

Server default for all new sessions: `node ui/server.js <project> --allow=edits` (or `all`).

## Logs

- One NDJSON file per session in `logs/` (gitignored): every message in both directions plus auto-allowed permissions, timestamped. `{ts, dir: "in"|"out"|"auto", ...message}`.
- Compact per-event lines on the server's stdout.
- Full agent transcripts: UI sessions are real Claude Code sessions — `claude --resume` in the project dir lists them.
