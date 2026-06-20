# Domain packs

A **domain pack** is what retargets this framework from one kind of work to another
(Godot games today; Salesforce development next) without forking the spine. The spine
(`ui/`, `.claude/`) stays domain-agnostic and reads per-domain values from the active
pack via `ui/server/core/domain-resolver.js`. This whole directory is **additive** —
upstream owns nothing here, so it never causes a merge conflict on a sync.

## Selecting the active domain

First hit wins: `XENODOT_DOMAIN` env → `.xenodot.json` `"domain"` key → `godot` (default).

## What a pack declares (`domains/<name>/domain.json`)

| Field                                    | Used by                | Meaning                                                     |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `engine.name` / `engine.projectFile`     | `config.js` (`ENGINE`) | runtime name + on-disk project marker                       |
| `inventory.scenes` / `inventory.scripts` | `project-state.js`     | file extensions the live inventory scans                    |
| `starter`                                | `new.js`               | starter folder to scaffold (relative to the framework root) |

`domains/godot/` reproduces the framework's original hardcoded values, so it is
behavior-for-behavior identical to pre-domain-seam. It currently points at the existing
top-level `plugin/` and `starter/` (the reference Godot pack).

## Not yet routed through the pack (intentionally deferred)

These stay Godot-specific in the spine until the first non-Godot domain needs them
(then they get added here and logged in `docs/whitelabel/SEAMS.md`):

- **Build/verify commands** (`gen-manifest.js` `commands` block — Godot CLI).
- **Orchestrator prompt** (`ui/orchestrator.md` — names the Godot agents).
- **The capability plugin set** (`session.js` loads the single `plugin/`; a domain will
  likely load a shared core **plus** its own pack).
- **Inventory field labels** (`scenes`/`scripts` naming in the UI).
