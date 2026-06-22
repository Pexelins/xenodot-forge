# Upstream sync — pull framework changes in, never push back

This repo is a **fork** of the framework **`arthur0n/xenodot-forge`**. The relationship is
**one-way**: we **only ever fetch** from the source to pull its improvements into our own product,
**xenomoon**. We **never push to the fork source** — a `pre-push` hook (`.husky/pre-push`)
hard-blocks any push whose target is `arthur0n/xenodot-forge`.

## Branch & repo model

| Branch | Role                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `main` | **Our xenomoon trunk** — branded end-to-end; what we develop, run, and publish. The `scripts/rebrand.mjs` codemod is **committed** here. |

We keep **no** local upstream-mirror branch (the old `forge` trunk + pristine-`main` split is
retired — `main` is now the trunk). When syncing, `upstream/main` is read directly.

Remotes:

```
xenomoon  https://github.com/arthur0n/xenomoon.git        OUR repo — we publish here
origin    https://github.com/Pexelins/xenodot-forge.git   our GitHub fork of the source (backup)
upstream  https://github.com/arthur0n/xenodot-forge.git   the forked source — FETCH ONLY, never push
```

> Pushes from this repo go out as **Pexelins** via a repo-local credential pin in `.git/config`
> (it overrides the machine keychain, which may hold another account's token). The pre-push hook is
> the backstop that keeps any push off the `upstream` source.

> The trunk is rebranded (xenomoon) and the rebrand is **committed**. `scripts/rebrand.mjs` is a
> **post-merge fixer**: after merging upstream's xenodot into our xenomoon trunk, re-run it to
> rebrand the newly-arrived xenodot, then resolve the overlaps.

## Routine sync (pull upstream improvements in)

```bash
# 1. Fetch the source. (We never modify or push to it.)
git fetch upstream

# 2. Merge upstream's changes into our xenomoon trunk.
git checkout main
git merge --no-ff upstream/main      # conflicts only where upstream touched a line we changed/rebranded

# 3. Rebrand upstream's newly-arrived "xenodot", prove idempotent, validate.
node scripts/rebrand.mjs
git commit -am 'rebrand: re-flip merged upstream'
node scripts/rebrand.mjs --check     # exits 0
npm install && npm run test:onboarding   # 7/7

# 4. Publish to OUR repo.
git push xenomoon main               # the pre-push hook blocks this only if the target is the fork source
```

`scripts/sync-upstream.sh` automates steps 1–2 (+ the onboarding gate).

## Conflicts

A merge conflict appears where upstream edited a line we also changed (a rebranded identifier, or a
seam listed in `SEAMS.md`). Resolve to keep our xenomoon version **plus** upstream's real change,
then re-run the codemod so nothing is left half-xenodot. The denylist (`arthur0n` lines,
`docs/whitelabel/**`, `scripts/` machinery) is preserved automatically.
