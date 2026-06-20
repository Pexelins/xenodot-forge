# Upstream sync — how we bring xenodot-forge changes into our fork

We track **`upstream` = `arthur0n/xenodot-forge`** while shipping a white-labeled **xenomoon**
trunk. This file is the runbook; the rationale is in `SEAMS.md`.

## Branch model

| Branch  | Role                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`  | **Pristine mirror** of `upstream/main` (xenodot vocab). Never hand-commit white-label changes here; `git merge --ff-only upstream/main` always succeeds. |
| `forge` | **Our trunk, fully rebranded to xenomoon.** What we develop, run, and publish; `xenomoon/main` on GitHub mirrors it.                                     |

Remotes:

```
origin    https://github.com/Pexelins/xenodot-forge.git   (our fork)
upstream  https://github.com/arthur0n/xenodot-forge.git    (read-only source)
xenomoon  https://github.com/arthur0n/xenomoon.git         (our published product)
```

> The trunk is rebranded (xenomoon) and the rebrand is **committed**. `scripts/rebrand.mjs` is no
> longer a publish-time step — it's a **post-merge fixer**: after merging upstream's xenodot into
> our xenomoon trunk, re-run it to rebrand the newly-arrived xenodot, then resolve the overlaps.

## Routine sync

```bash
# 1. Fast-forward the xenodot mirror to upstream.
git fetch upstream
git checkout main
git merge --ff-only upstream/main

# 2. Bring upstream's changes into the xenomoon trunk.
git checkout forge
git merge main                       # conflicts only where upstream touched a line we changed/rebranded

# 3. Rebrand upstream's newly-arrived "xenodot", prove idempotent, validate.
node scripts/rebrand.mjs
node scripts/rebrand.mjs --check     # exits 0
npm install && npm run test:onboarding   # 7/7

# 4. Publish.
gh auth switch --user Pexelins && git push xenomoon forge:main   # force if the tip diverged
```

## Conflicts

A merge conflict appears where upstream edited a line we also changed (a rebranded identifier, or a
seam listed in `SEAMS.md`). Resolve to keep our xenomoon version **plus** upstream's real change,
then re-run the codemod so nothing is left half-xenodot. The denylist (`arthur0n` lines,
`docs/whitelabel/**`, `scripts/` machinery) is preserved automatically.
