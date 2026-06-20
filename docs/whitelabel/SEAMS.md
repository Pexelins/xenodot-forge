# Seams — our conflict-surface contract with upstream

To stay mergeable with a fast-moving upstream, **~95% of our white-label work lives
in NEW files/dirs upstream never touches.** This file is the audited list of the few
exceptions: upstream-owned files we edit, and the rename map the rebrand codemod
applies. If a rebase conflict appears in a file *not* listed here, our discipline
slipped — investigate before resolving.

## Additive-only areas (no conflict risk — upstream owns none of these)

- `docs/whitelabel/**` — this contract, the sync runbook.
- `scripts/rebrand.mjs`, `scripts/sync-upstream.sh` — our build/sync machinery.
- `domains/**` — *(Phase 2+)* the domain packs (godot pointer, salesforce POC, …).
- `ui/server/core/domain-resolver.*` — *(Phase 2)* the single module the spine asks
  for domain-specific values. New file → no conflict.

## Upstream files we are allowed to edit (keep this list SHORT)

Each entry = the smallest possible change, ideally a one-line hook into our additive
code, plus why it's unavoidable.

| File | Edit | Why it can't be additive |
|---|---|---|
| `package.json` | Add one `scripts` entry: `"rebrand": "node scripts/rebrand.mjs"`. | npm scripts must live in the manifest. One line, low churn. |

*(Phase 2 will add a few more — `config.js`, `gen-manifest.js`, `project-state.js`,
`session.js`, `new.js`, `orchestrator.md` — each as a minimal "ask the
domain-resolver" hook. They are NOT touched in Phase 1; add them here when they are.)*

## Rebrand rename map (applied by `scripts/rebrand.mjs`, case-preserving)

| From | To |
|---|---|
| `xenodot` | `xenomoon` |
| `Xenodot` | `Xenomoon` |
| `XENODOT_` (env prefix) | `XENOMOON_` |
| `xenodot:` (plugin namespace) | `xenomoon:` |
| `.xenodot.json` / `.xenodot/` | `.xenomoon.json` / `.xenomoon/` |
| `xenodots` | `xenomoons` |

A single case-preserving `/xenodot/gi` pass covers every form above.

## Rebrand denylist (must NOT be rewritten)

- **Any line containing `arthur0n`** — upstream provenance URLs
  (`github.com/arthur0n/xenodot-forge`, `raw.githubusercontent.com/arthur0n/...`,
  clone/marketplace instructions). Rewriting these would break the `upstream` remote
  references and point forkers at a repo that doesn't exist.
- **`docs/whitelabel/**` and the two `scripts/` machinery files** — they intentionally
  mention the literal `xenodot` to document the rename; the codemod skips them.
- **Binary assets** (images, fonts, models, archives) — skipped by extension and by
  null-byte detection.

## Invariant

After `node scripts/rebrand.mjs`, `git grep -i xenodot` returns **only** the
denylisted `arthur0n` provenance lines and the skipped `docs/whitelabel` + `scripts`
machinery. Anything else means the rename map or denylist needs updating.
