#!/usr/bin/env bash
# sync-upstream.sh — pull upstream into our fork the disciplined way.
# See docs/whitelabel/SYNC.md for the full rationale.
#
#   main  = pristine mirror of upstream/main (never hand-edited)
#   forge = our additive integration trunk, rebased on main
#
# Flags:
#   --push     also push the fast-forwarded main to origin
#   --no-test  skip `npm run test:onboarding` (faster, less safe)
set -euo pipefail
cd "$(dirname "$0")/.."

PUSH=0
RUN_TEST=1
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    --no-test) RUN_TEST=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

echo "==> fetching upstream"
git fetch upstream

echo "==> fast-forwarding main to upstream/main"
git checkout main
git merge --ff-only upstream/main
[ "$PUSH" = 1 ] && { echo "==> pushing main to origin"; git push origin main; }

echo "==> rebasing forge onto main"
git checkout forge
git rebase main

if [ "$RUN_TEST" = 1 ]; then
  echo "==> onboarding gate (xenodot vocab)"
  npm install --silent
  npm run test:onboarding
fi

echo
echo "Done. forge is rebased on upstream."
echo "To produce the branded artifact:"
echo "    node scripts/rebrand.mjs && npm run test:onboarding && node scripts/rebrand.mjs --check"
echo "    git restore .   # then drop the rebrand mutations to keep forge in xenodot vocab"
