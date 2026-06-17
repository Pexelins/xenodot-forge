# Hermes — the optional external researcher

Hermes is an **optional** external agent the **Hive** can delegate deep research to. It is
**off by default** — the framework runs fully without it. Turn it on only if you want to test
whether its web-search + memory + skills produce better capability/tooling research than the
built-in Xenodot researchers.

> **The one thing that trips everyone up:** Hermes is a **separate program with its own model
> and its own billing**. Your Anthropic plan does **not** cover it, and there is **no hosted
> Hermes endpoint** — you install and run it on your own machine, then point Xenodot at it.

## Two keys, one URL (read this first)

| Thing                               | What it is                                           | Where it comes from                                                                                                          |
| ----------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Provider key** (billable)         | The LLM key that powers Hermes' brain                | You sign up (Nous Portal / OpenRouter / Anthropic) and paste it **inside Hermes** via `hermes setup`. Xenodot never sees it. |
| **`API_SERVER_KEY`** (not billable) | A password **you invent** to lock your local gateway | You make it up, put it in `~/.hermes/.env`, and paste the same value into Xenodot's ⚙ Settings → "Server key".               |
| **Server URL**                      | Your **local** gateway                               | `http://localhost:8642` — exists only while `hermes gateway` is running.                                                     |

## Fastest path — one guided command

```bash
npm run hermes:setup
```

This installs Hermes if it's missing, turns the local API server on in `~/.hermes/.env`
(generating the `API_SERVER_KEY` for you), **sets the provider and restricts the toolset
directly** via `hermes config set`, registers the Hive-side **MCP callback** so Hermes can report
progress + findings back to your UI (`mcp_servers.xenodot`), installs the Xenodot "partner" persona
into `~/.hermes/SOUL.md` (only if it's absent or the stock template — a customized SOUL is never
overwritten; source: `ui/server/hermes-soul.md`), echoes what Hermes persisted, and wires
Xenodot's config.
It **never launches an interactive Hermes command** (`hermes setup`/`model`/`tools`) — those
pickers are exactly what trap you. Flags:

```bash
npm run hermes:setup -- --yes                              # no prompts (auto-install)
npm run hermes:setup -- --provider=anthropic --model=anthropic/claude-opus-4.6
npm run hermes:setup -- --toolsets=web,search,memory       # override the tool allowlist
npm run hermes:setup -- --no-portal                        # don't print the Nous Portal note
npm run hermes:setup -- --reset                            # undo the setup (test the flow from scratch)
```

`--reset` removes Xenodot's `hermes` block, the `API_SERVER_*` lines from `~/.hermes/.env`,
and the toolset edits in `config.yaml` (back to `hermes-cli`). It leaves Hermes itself, your
model/provider and Portal auth untouched — so you can re-run setup on a clean slate.

Defaults: **Nous via Portal**, toolset `web, search, memory` — read-only research with **no machine
access** (no `terminal`/`file`/`code_execution`/`skills`; see "Restrict the toolset" below for why
this one line is the whole guardrail). Two things it leaves to you: the Nous Portal sign-in (a
browser OAuth — run `hermes portal open`, _not_ the wizard) and leaving `hermes gateway` running.

> **Got stuck in `hermes setup` (or `--portal`) before?** Hit **Ctrl+C**. You never need that
> wizard — the script sets every value non-interactively. For Portal auth use `hermes portal`,
> and to pick an exact model use `hermes model`. See "Choosing model & tools" below.

Prefer to do it by hand, or it didn't work? The manual steps are below.

## Step 1 — install & run Hermes (on your machine, one time)

```bash
# Installs python/node/ripgrep + the global `hermes` command
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
# reload your shell

# Pick a model + provider (see "Choosing model & tools" below). For Nous models:
hermes portal open           # one-time Portal sign-in (NOT `hermes setup` — that's the wizard)

# Turn the local API server on — add to ~/.hermes/.env :
#   API_SERVER_ENABLED=true
#   API_SERVER_KEY=pick-any-secret      # you invent this; it's the "Server key" in Xenodot
#   (API_SERVER_PORT defaults to 8642)

# Run it — serves http://localhost:8642
hermes gateway
```

Leave `hermes gateway` running in its own terminal. Cost is roughly **$0.25–$2.50 per deep run**,
billed by whatever provider you chose.

## Choosing model & tools (no wizard needed)

`npm run hermes:setup` does all of this. To do it by hand: **scalars** go through
`hermes config set`; **lists** (the toolset) must be edited in `config.yaml` directly —
`hermes config set` stores a list as a broken quoted string. Inspect state with
`hermes config show` (note: there is **no** `hermes config get`), or edit with
`hermes config edit`. The file lives at `hermes config path`.

**Model / provider** — scalars, so `config set` works:

```bash
hermes config set model.provider nous     # or: anthropic | openrouter | openai | gemini | custom
hermes config set model.default <model-id>
```

Nous (Portal) models need a one-time browser sign-in — use the dedicated auth command, **not**
the wizard: `hermes portal open` (then `hermes portal status` to confirm). Pick the exact model
with `hermes model` (it only lists models for a provider you're already authed to — that's why
nothing showed before sign-in). Other providers just need their key (`hermes auth add`).

**Restrict the toolset.** ⚠️ Critical: the API server runs as its **own platform, `api_server`**,
and per the gateway's `/v1/capabilities`, **its tools execute on _your machine_** (`tool_execution:
server`, no sandbox). It does **not** read `platform_toolsets.cli` or the top-level `toolsets:` —
it reads **`platform_toolsets.api_server`**, and with no entry there it defaults to **everything on**
(terminal, file, code_execution, browser …). So this is the key that matters for the Xenodot bridge:

```yaml
platform_toolsets:
  api_server: [web, search, memory, xenodot] # read-only research + the `xenodot` report-back MCP
  # server (an RPC to your UI, NOT machine access); still NO terminal/file/code on your machine
```

`npm run hermes:setup` writes exactly this (default `web, search, memory`). Widen only if you
knowingly want machine access: `--toolsets=web,search,memory,terminal,file`. Individual toolsets:
`web, search, terminal, file, browser, vision, image_gen, skills, todo, tts, cronjob, moa`.

**Confirm what's actually live** (the only sure check) — `npm run hermes:check` queries the
gateway's `GET /v1/toolsets` and prints the enabled tools, loudly flagging any machine-access ones:

```
API-path tools enabled: web, memory
✓ no machine-access tools (terminal/file/code) on the API path.
```

Avoid `agent.disabled_toolsets` — a known bug
([#33924](https://github.com/NousResearch/hermes-agent/issues/33924)) can make a bundle name
there silently kill _all_ tools on the gateway path.

## Step 2 — point Xenodot at it

**From the UI (recommended):** `npm start` → ⚙ **Settings** →

1. Expand "First time?" for these same steps.
2. Enable Hermes · URL `http://localhost:8642` · Server key = the `API_SERVER_KEY` you invented.
3. Click **Test connection** — it probes `GET /v1/models` (no model run, no charge) and tells you
   if the gateway is reachable and the key is accepted.
4. **Save.** Takes effect immediately — no server restart.

**From the CLI (equivalent):**

```bash
npm run hermes -- --hermes --hermes-url=http://localhost:8642 --hermes-key=pick-any-secret
npm run hermes:check     # probes the saved config, prints a one-line verdict
npm run hermes -- --hermes-off   # turn it back off
```

## Step 3 — try it

Start a session and give the Hive a **capability / tooling / knowledge-gap** task
(e.g. _"research the best Godot 4 approach for X"_) — optionally naming a persona ("have the
**critic** stress-test …"). When the Hive calls `mcp__ui__hermes`, **approve it in the permission
gate**. It's **fire-and-forget**: the call returns at once and you keep working — Hermes runs in
the background, streams progress to the feed (the **Hermes** lines, colored per persona), and when
it's done **calls back** to deliver its findings as a new message. The Hive then hands those to the
matching `xenodot:*-researcher` → your adopt/reject verdict. If Hermes is off or unreachable, the
Hive just dispatches the researcher itself — same result, no Hermes.

> **Startup order matters.** Hermes discovers MCP servers (its report-back channel) at gateway
> startup, and that channel is served by the UI. So bring the **UI up first**: `npm start` serves
> `/mcp` _and_ auto-starts the gateway in the right order. If you run `hermes gateway` yourself,
> (re)start it **after** `npm start` is up, or the report-back tools won't be available to the run.

## Can I install Hermes from the UI?

Not fully — and on purpose. Installation is a `curl … | bash`, and choosing a billable provider
(esp. the Nous Portal OAuth) belongs in your terminal, not a web form. The closest to one-click
is the CLI `npm run hermes:setup`, which now sets the model, provider and toolset for you
non-interactively. The UI gives you the copy-paste runbook (⚙ Settings → "First time?") and the
**Test connection** button for instant feedback once the gateway is up.

> **Note on the UI "model" field:** it's a **label only** — it records which model you pointed
> Hermes at, it does **not** change Hermes' actual model. The real model lives in Hermes'
> `config.yaml` (`hermes config set model.default …`, or `npm run hermes:setup`). Changing the
> dropdown alone does nothing on the Hermes side.

## Troubleshooting

- **"No response within 8s — is `hermes gateway` running?"** → the gateway isn't up, or the URL/port
  is wrong. Confirm `hermes gateway` is running and the port matches `API_SERVER_PORT`.
- **"server key was rejected"** → the Xenodot "Server key" ≠ the `API_SERVER_KEY` in `~/.hermes/.env`.
- **Hive says "Hermes is off or not configured"** → enable it in ⚙ Settings (or `npm run hermes -- --hermes`).
- **It works but research isn't better** → that's the real question this POC answers. Compare on a
  real gap task against the native researcher before widening the seam.
