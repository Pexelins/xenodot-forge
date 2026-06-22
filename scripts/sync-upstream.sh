#!/usr/bin/env bash
# sync-upstream.sh — pull upstream improvements INTO our fork. One-way: we only
# ever FETCH from the source and NEVER push back to it (a pre-push hook enforces
# this). See docs/whitelabel/SYNC.md for the full rationale.
#
#   main = OUR xenomoon trunk — branded end-to-end, rebrand COMMITTED. Upstream is
#          MERGED in (NOT rebased), then the xenomoon rebrand is re-run + committed.
#   We keep no local upstream-mirror branch; upstream/main is read directly.
#
# Flags:
#   --no-test  skip `npm run test:onboarding` (faster, less safe)
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_TEST=1
for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TEST=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

echo "==> fetching upstream (read-only source; we never push to it)"
git fetch upstream

echo "==> merging upstream/main into our trunk 'main' (rebrand is committed; expect conflicts on rebranded lines)"
git checkout main
if ! git merge --no-ff upstream/main; then
  echo
  echo "Merge conflicts — resolve them, then finish the sync by hand:"
  echo "  - keep README ours; keep the DOMAIN seam in ui/server/core/config.js"
  echo "  - re-drop the intentional divergences (godot-docs, FEATURES.md) per docs/whitelabel/SEAMS.md"
  echo "  - git add -u && git commit            # complete the merge"
  echo "  - node scripts/rebrand.mjs && git commit -am 'rebrand: re-flip merged upstream'"
  echo "  - node scripts/rebrand.mjs --check && npm run validate && npm run test:onboarding"
  exit 1
fi

if [ "$RUN_TEST" = 1 ]; then
  echo "==> onboarding gate"
  npm install --silent
  npm run test:onboarding
fi

echo
echo "Done. upstream/main merged into our 'main' trunk. Re-brand the merged-in upstream strings:"
echo "    node scripts/rebrand.mjs && git commit -am 'rebrand: re-flip merged upstream'"
echo "    node scripts/rebrand.mjs --check   # only arthur0n + docs/whitelabel + scripts keep 'xenodot'"
echo "Publish to our repo:  git push xenomoon main"
