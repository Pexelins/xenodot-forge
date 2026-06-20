#!/usr/bin/env bash
# PreToolUse(Bash) guard: block catastrophic, irreversible shell for ALL callers
# (subagents AND the main session). This is the HARD FLOOR — PreToolUse hook denies
# bypass the SDK's whole permission layer (canUseTool, permissionMode, allow rules),
# so it holds even under acceptEdits / bypassPermissions and for cheaper models.
# Git-specific destruction has its own guard (block-destructive-git.sh); this covers
# the rest. Keep the patterns high-signal so ordinary work (builds, tools/validate.sh,
# $GODOT --headless …) is never blocked.
#
# Blocks:  rm -rf/-fr (recursive+force), dd of=…, mkfs…, shred, truncate, `> /dev/…`
# Reads the PreToolUse payload on stdin; emits a deny decision (exit 0) only on a match.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"

deny() {
  printf '%s' "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"$1\"}}"
  exit 0
}

# rm with BOTH recursive and force (any flag bundling/order, or the long options).
# `rm -f` (force, not recursive) and `rm -r` (recursive, not force) alone are allowed.
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])rm([[:space:]]+-[[:alnum:]]*[rR][[:alnum:]]*[fF]|[[:space:]]+-[[:alnum:]]*[fF][[:alnum:]]*[rR]|[[:space:]].*-[rR]([[:space:]]).*-[fF]|[[:space:]].*-[fF]([[:space:]]).*-[rR]|[[:space:]].*--recursive.*--force|[[:space:]].*--force.*--recursive)'; then
  deny "Recursive forced delete (rm -rf) is blocked by Xenomoon Forge safety policy — it irreversibly wipes trees and has destroyed uncommitted work before. Delete specific files explicitly, or ask the human to run it."
fi

# Other irreversible disk/file destroyers.
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])(dd[[:space:]]+[^|]*of=|mkfs([.][[:alnum:]]+)?[[:space:]]|shred[[:space:]]|truncate[[:space:]])'; then
  deny "Irreversible disk/file operation (dd of=, mkfs, shred, truncate) is blocked by Xenomoon Forge safety policy. Ask the human if you truly need it."
fi

# Redirecting output onto a device node.
if printf '%s' "$cmd" | grep -Eq '>[[:space:]]*/dev/[[:alnum:]]'; then
  deny "Redirecting output onto a device node (> /dev/…) is blocked by Xenomoon Forge safety policy."
fi

exit 0
