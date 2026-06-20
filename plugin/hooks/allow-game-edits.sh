#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit) grant — let a SUB-AGENT edit game
# content + framework library without an interactive prompt. This is the lever that
# reaches a BACKGROUNDED (headless) sub-agent: it has no interactive approver, so the
# SDK auto-denies any edit that isn't pre-granted (SDKPermissionDeniedMessage,
# decision_reason_type "asyncAgent" — "Permission prompts are not available in this
# context"). A PreToolUse decision bypasses the whole permission layer (canUseTool,
# permissionMode, allow rules) for ALL callers — see block-destructive-shell.sh — so an
# "allow" here lands even when the SDK refuses a plugin's `permission-mode: acceptEdits`
# (the CLI drops escalating modes from a repo/plugin trust tier; see
# filterEscalatingDefaultMode), which is what silently broke background edits.
#
# Scope (kept deliberately narrow):
#   * Sub-agents ONLY — gated on `agent_id` (present only inside an AgentTool worker,
#     absent on the main thread; same field caveman-reminder.sh uses). The orchestrator
#     keeps its interactive approval policy untouched.
#   * `.claude/` stays gated — never granted here; config-dir authoring (skills/agents/
#     CLAUDE.md) remains a foreground, human-approved act (it falls through to the normal
#     layer → prompts foreground, auto-denies in background, as documented).
#   * Writes only under the game project (cwd), the framework library, or the shared
#     asset library ($XENOMOON_LIBRARY / $XENOMOON_ASSET_LIBRARY). Anything else falls
#     through to the normal layer rather than being broadened.
#
# Reads the PreToolUse payload on stdin; emits an allow decision (exit 0) only on a match,
# otherwise exits silently so the normal permission layer decides.
payload="$(cat)"

# Sub-agent only — the main orchestrator is never auto-granted here.
agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
[ -z "$agent_id" ] && exit 0

# Target path (file_path for Edit/Write/MultiEdit, notebook_path for NotebookEdit).
fp="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)"
[ -z "$fp" ] && exit 0

# Never grant config-dir edits — keep `.claude/` foreground/human-approved.
case "$fp" in
  .claude/* | */.claude/*) exit 0 ;;
esac

# Only grant writes under known-good roots: relative paths resolve under the game cwd;
# absolute paths must sit under the project, the framework library, or the asset library.
# Empty env roots are skipped so an unset var can't widen the match to all of "/".
allowed=0
case "$fp" in
  /*) ;;
  *) allowed=1 ;; # relative → under the game project cwd
esac
if [ "$allowed" -eq 0 ]; then
  for root in "$PWD" "$XENOMOON_LIBRARY" "$XENOMOON_ASSET_LIBRARY"; do
    [ -n "$root" ] || continue
    case "$fp" in "$root"/*) allowed=1; break ;; esac
  done
fi
[ "$allowed" -eq 1 ] || exit 0

jq -cn '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"xenomoon: sub-agent game/library edit (background-safe grant)"}}'
exit 0
