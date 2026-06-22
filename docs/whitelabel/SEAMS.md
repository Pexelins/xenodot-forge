# Seams — our conflict-surface contract with upstream

To stay mergeable with a fast-moving upstream, **~95% of our white-label work lives
in NEW files/dirs upstream never touches.** This file is the audited list of the few
exceptions: upstream-owned files we edit, and the rename map the rebrand codemod
applies.

> **The trunk is rebranded (committed).** Our `main` trunk is xenomoon end-to-end, so the rebrand modifies
> _most_ upstream files — not just the behavioral seam edits in the table below. On an upstream
> merge, expect conflicts on rebranded identifier lines too; resolve them and re-run
> `scripts/rebrand.mjs` (see `SYNC.md`). The table below still tracks our **behavioral** seam edits
> — the ones to re-apply with care — separate from the blanket rename.

## Additive-only areas (no conflict risk — upstream owns none of these)

- `docs/whitelabel/**` — this contract, the sync runbook.
- `scripts/rebrand.mjs`, `scripts/sync-upstream.sh` — our build/sync machinery.
- `domains/**` — the domain packs. `domains/godot/` (upstream reference) ships now; our own
  packs `domains/app/` and `domains/webapp/` (Node / React, empty starters) live here too.
- `ui/server/core/domain-resolver.js` — the single module the spine asks for
  domain-specific values. New file → no conflict.

## Upstream files we are allowed to edit (keep this list SHORT)

Each entry = the smallest possible change, ideally a one-line hook into our additive
code, plus why it's unavoidable.

| File                                   | Edit                                                                                                                                                                | Why it can't be additive                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `package.json`                         | Add one `scripts` entry: `"rebrand": "node scripts/rebrand.mjs"`.                                                                                                   | npm scripts must live in the manifest. One line, low churn.                                  |
| `ui/server/core/config.js`             | Import the resolver; resolve + export `DOMAIN`; source the `ENGINE` name/projectFile **defaults** from `DOMAIN.engine` (env / `.xenodot.json` overrides unchanged). | `ENGINE` is the central resolved config the spine shares; the domain must feed its defaults. |
| `ui/server/core/http/project-state.js` | Import `DOMAIN`; scan `DOMAIN.inventory.scenes` / `.scripts` instead of literal `.tscn` / `.gd`.                                                                    | The live inventory is computed here; extensions are per-domain.                              |
| `ui/server/cli/new.js`                 | Resolve the domain; detect `DOMAIN.engine.projectFile` and scaffold `DOMAIN.starter` instead of hardcoded `project.godot` / `starter`.                              | Scaffolding picks the project marker + starter, which are per-domain.                        |

| `ui/server/cli/doctor.js` | Capability + `validate.sh` checks are HARD only when `DOMAIN.populated`; an empty domain installs/runs cleanly. | Doctor gates `new`/CI; emptiness is a legal starting state for a learning domain. |
| `ui/server/cli/gen-manifest.js` | The manifest `commands` block ← `DOMAIN.commands`. | Build/verify commands are per-domain. |
| `README.md` | **Fully replaced** with a xenomoon front page (what it is / what we're trying to do / where we are). Upstream-name refs kept on `arthur0n` lines so the rebrand codemod preserves them. | Our product's front page — fully diverged. Expect conflicts on upstream README changes; resolve by keeping ours. |
| `ui/server/features/skills/skill-registry.js` | Replace the hardcoded `BUILDERS` list with a read of the reference domain's `builders` (via the side-effect-free `domain-resolver`). `domains/godot/domain.json` now declares `builders` (additive). | The `builders` skill-audience token (upstream's skills subsystem) must resolve per-domain, not bake godot's builder agents into the spine. |

For the default `godot` domain every value above equals the old literal, so behavior is
byte-for-byte unchanged (the onboarding gate proves it). The `config.js` and `new.js` rows have
since grown: `config.js` also resolves `DOMAIN` from the **project lock** (`.xenodot-project.json`,
authoritative, mismatch-refused) and sources `FRAMEWORK_PLUGIN_DIR` + `ORCHESTRATOR_PROMPT` from
it; `new.js` is now the deterministic `--domain` install (writes the lock, wires non-greenfield).

### Deferred seams (still Godot-flavored; degrade harmlessly, route later)

- `ui/server/core/session.js` — loads the single `plugin/` (already domain-routed via
  `config.js` `FRAMEWORK_PLUGIN_DIR`); a domain may later load a shared core **plus** its own
  pack (a multi-plugin decision, not a path swap).
- `ui/server/core/engine-bin.js` / `$GODOT` — engine-binary probing is Godot-specific; a
  non-godot project still gets `$GODOT` set (harmless, unused). Make it domain-aware.
- `gen-manifest.js` render block + `project.godot` INI parsing — Godot-specific; yields empty
  facts for other domains (fine for now).
- Inventory field **labels** (`scenes` / `scripts`) in `project-state.js` + the client.
- Per-project **library** isolation — `materialize` symlinks the shared plugin library; full
  per-project independence (two app projects → separate learned libraries) is a later increment.

### Intentional upstream divergences (re-apply on every sync)

These are upstream additions we deliberately do NOT carry. Each merge that re-introduces them must
re-drop them (the merge brings them back because lineage is preserved — that's by design).

- **godot-docs (upstream `000f4b7`) — NOT carried.** The opt-in Godot-docs MCP + `godot-docs-evangelist`
  agent is godot-specific and pulls the `@nuskey8/godot-docs-mcp` dependency — no value for our
  app/salesforce domains. On every merge that re-introduces it, re-run the drop:
  - delete `plugin/agents/godot-docs-evangelist.md`, `plugin/skills/godot-docs/`, `ui/docs-block.md`;
  - back out the `DOCS_*` / `getDocsConfig` / `docsPublicConfig` / `saveDocsConfig` / `mcp__godot-docs__*`
    wiring in `config.js`, `session.js`, `index.js`, `types.js`, `settings.js`, `index.html`,
    `project-state.js`, and the `godot-docs` tools + skill from the six builder agents;
  - drop the `@nuskey8/godot-docs-mcp` dep (`package.json`) and regenerate the lock (`npm install`);
  - **KEEP** `ui/server/mcp-tools/ui-server.js` (the domain-agnostic `buildUiServer` the merge depends on).
  - Sweep: `git grep -i 'godot-docs\|nuskey8\|DOCS_BLOCK'` must be clean (outside this doc).
    Revisit only if a domain wants its own docs-MCP — then generalize it into a per-domain seam.
- **FEATURES.md — NOT carried.** Upstream's godot-feature catalog (un-curated for xenomoon); re-curate
  on its own terms if ever wanted.

## Rebrand rename map (applied by `scripts/rebrand.mjs`, case-preserving)

| From                          | To                              |
| ----------------------------- | ------------------------------- |
| `xenodot`                     | `xenomoon`                      |
| `Xenodot`                     | `Xenomoon`                      |
| `XENODOT_` (env prefix)       | `XENOMOON_`                     |
| `xenodot:` (plugin namespace) | `xenomoon:`                     |
| `.xenodot.json` / `.xenodot/` | `.xenomoon.json` / `.xenomoon/` |
| `xenodots`                    | `xenomoons`                     |

A single case-preserving `/xenodot/gi` pass covers every form above.

## Rebrand denylist (must NOT be rewritten)

- **Any line containing `arthur0n`** — upstream provenance URLs
  (`github.com/arthur0n/xenodot-forge`, `raw.githubusercontent.com/arthur0n/...`,
  clone/marketplace instructions). Rewriting these would break the `upstream` remote
  references and point forkers at a repo that doesn't exist.
- **Untracked / gitignored files** — the codemod runs over `git ls-files` only, so local
  state (`.xenodot.json`, `logs/`, `node_modules/`, `vendor/`, a nested game dir, materialized
  `tools/`) is never read or rewritten.
- The codemod's **own machinery** — `scripts/rebrand.mjs`, `scripts/sync-upstream.sh`, and
  everything under the `docs/whitelabel/` folder — intentionally mentions the literal `xenodot`
  to document the rename, so it is skipped.
- **Binary assets** (images, fonts, models, archives) — skipped by extension and null-byte detection.

## Invariant

After `node scripts/rebrand.mjs`, `git grep -i xenodot` returns **only** the
denylisted `arthur0n` provenance lines and the skipped `docs/whitelabel` + `scripts`
machinery. Anything else means the rename map or denylist needs updating.
