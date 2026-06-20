# Upstream sync — how we bring xenodot-forge changes into our fork

We track **`upstream` = `arthur0n/xenodot-forge`** closely while shipping a
white-labeled **xenomoon** product. This file is the runbook. The design rationale
lives in `SEAMS.md`.

## Branch model

| Branch | Role | Rule |
|---|---|---|
| `main` | **Pristine mirror** of `upstream/main`. | Never hand-commit white-label changes here. `git merge --ff-only upstream/main` must always succeed. |
| `forge` | **Our integration trunk.** `main` + our *additive* files + *minimal* seam edits, written in upstream's `xenodot` vocabulary so it keeps rebasing cleanly. | This is where we work. |
| (artifact) | `forge` with `node scripts/rebrand.mjs` applied at the tip → the shipped **xenomoon** tree. | Regenerated, never committed onto `forge`. |

Remotes:

```
origin    https://github.com/Pexelins/xenodot-forge.git   (our fork)
upstream  https://github.com/arthur0n/xenodot-forge.git    (read-only source)
```

## Routine sync (run `scripts/sync-upstream.sh`, or do it by hand)

```bash
# 1. Fast-forward our mirror to upstream.
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main          # optional: keep the fork's main current

# 2. Replay our thin additive layer on top.
git checkout forge
git rebase main               # conflicts only where a seam touched a changed line

# 3. Prove nothing broke (upstream's own onboarding gate).
npm install
npm run test:onboarding

# 4. Regenerate the branded artifact and prove the rebrand is clean + idempotent.
node scripts/rebrand.mjs
npm run test:onboarding       # green on the branded tree too
node scripts/rebrand.mjs --check   # exits 0 → idempotent
git restore .                 # drop the rebrand mutations; forge stays in xenodot vocab
```

## Why the rebrand is NOT committed onto `forge`

A hand-edited rebrand touches ~70 upstream files (the `ui/` spine is upstream's
churn hotspot). Committing that guarantees a merge conflict on almost every pull.
The codemod keeps our committed conflict surface ~empty: the rebrand is data
(`scripts/rebrand.mjs`), re-applied after each sync, so upstream's *new* `xenodot`
occurrences get rebranded automatically with zero 3-way merge.

## When a rebase conflict does happen

It can only happen on a file listed in `SEAMS.md` (the only upstream files we
edit). Resolve by re-applying our small seam hook onto upstream's new version, then
update `SEAMS.md` if the surrounding code moved. If a conflict shows up in a file
**not** in `SEAMS.md`, that's a bug in our discipline — investigate before resolving.
