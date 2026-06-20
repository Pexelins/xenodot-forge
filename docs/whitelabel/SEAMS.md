# Seams — our conflict-surface contract with upstream

To stay mergeable with a fast-moving upstream, **~95% of our white-label work lives
in NEW files/dirs upstream never touches.** This file is the audited list of the few
exceptions: upstream-owned files we edit, and the rename map the rebrand codemod
applies. If a rebase conflict appears in a file _not_ listed here, our discipline
slipped — investigate before resolving.

## Additive-only areas (no conflict risk — upstream owns none of these)

- `docs/whitelabel/**` — this contract, the sync runbook.
- `scripts/rebrand.mjs`, `scripts/sync-upstream.sh` — our build/sync machinery.
- `domains/**` — the domain packs. `domains/godot/` (reference, mirrors today) ships now;
  `domains/salesforce/` (POC) lands in Phase 3.
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

For the default `godot` domain every value above equals the old literal, so behavior is
byte-for-byte unchanged (the onboarding gate proves it).

### Deferred seams (still Godot-specific in the spine; route them in Phase 3)

Add to the table above when the first non-Godot domain needs them:

- `ui/server/cli/gen-manifest.js` — the `commands` block (Godot CLI) + `project.godot` INI parsing.
- `ui/orchestrator.md` (via `config.js` `ORCHESTRATOR_PROMPT`) — names the Godot agents.
- `ui/server/core/session.js` — loads the single `plugin/`; a domain will likely load a
  shared core **plus** its own pack (a multi-plugin decision, not a path swap).
- Inventory field **labels** (`scenes` / `scripts`) in `project-state.js` + the client.

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
- **`docs/whitelabel/**`and the two`scripts/`machinery files** — they intentionally
mention the literal`xenodot` to document the rename; the codemod skips them.
- **Binary assets** (images, fonts, models, archives) — skipped by extension and by
  null-byte detection.

## Invariant

After `node scripts/rebrand.mjs`, `git grep -i xenodot` returns **only** the
denylisted `arthur0n` provenance lines and the skipped `docs/whitelabel` + `scripts`
machinery. Anything else means the rename map or denylist needs updating.
