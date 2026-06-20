#!/usr/bin/env bash
# PreToolUse(*) caveman nudge — NON-BLOCKING. Before EVERY sub-agent tool call, re-inject the
# terse-output rule and the `[cvmn]` marker convention so caveman can't decay over a long,
# tool-heavy turn. Also inspects the PREVIOUS assistant message (observe-only) to escalate the
# wording and log a deterministic compliance trace. NEVER blocks, denies, or emits a
# permissionDecision — only additionalContext (exit 0 always).
#
# Scoped to sub-agents ONLY via `agent_id` (present only inside an AgentTool worker, absent on
# the main thread). The main orchestrator session is never nudged — not a caveman context.
#
# The log (logs/caveman-gate.log under the framework dir) is the evaluation record: per-call
# rows of marker-presence + terseness scores so the user can judge whether the nudge alone is
# enough before considering anything stronger. Heuristic is deterministic — no LLM.
payload="$(cat)"
agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
[ -z "$agent_id" ] && exit 0

session_id="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)"

base="caveman mode active: load the caveman skill. Terse output — compress ALL prose you emit, INCLUDING running commentary between tool calls and mid-task status, not just final reports. Drop articles/filler/pleasantries; fragments OK. Code, errors and identifiers stay exact. Full prose ONLY for mcp__ui__form field labels/descriptions and destructive-action warnings. END every message with the marker [cvmn]."

# --- observe-only inspection of the previous assistant message (best-effort, never fatal) ---
marker=false
verbose=false
W=0
fillerDensity=0
articleDensity=0
avgSentLen=0
flag=""

if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  # Last assistant message → concatenated text blocks. Tolerate malformed lines.
  text="$(jq -rs '
      map(select(type=="object" and .type=="assistant"))
      | last
      | (.message.content // [])
      | map(select(.type=="text") | .text) | join("\n")
    ' "$transcript" 2>/dev/null)"
  [ "$text" = "null" ] && text=""

  if [ -n "$text" ]; then
    # marker check on the raw text (before code-stripping)
    case "$text" in *"[cvmn]"*) marker=true ;; esac

    # strip fenced ``` blocks and inline `code` so code is exempt from terseness scoring
    prose="$(printf '%s' "$text" \
      | awk 'BEGIN{f=0} /^[[:space:]]*```/{f=!f; next} f==0{print}' \
      | sed 's/`[^`]*`//g')"

    read -r W fillerDensity articleDensity avgSentLen verbose <<EOF
$(printf '%s' "$prose" | awk '
  BEGIN{ IGNORECASE=1; w=0; fill=0; art=0; sent=0 }
  {
    n=split($0, toks, /[^A-Za-z0-9_'"'"']+/)
    for(i=1;i<=n;i++){
      t=tolower(toks[i]); if(t=="") continue; w++
      if(t=="just"||t=="really"||t=="basically"||t=="actually"||t=="simply"||t=="essentially"||t=="very"||t=="quite"||t=="definitely") fill++
      if(t=="a"||t=="an"||t=="the") art++
    }
    s=gsub(/[.!?]+/, "&"); sent+=s
  }
  END{
    if(w<1){ print 0, 0, 0, 0, "false"; exit }
    if(sent<1) sent=1
    fd=fill/w; ad=art/w; asl=w/sent
    vb="false"
    if(w>=25 && ((fd>0.04 && ad>0.10) || asl>28)) vb="true"
    printf "%d %.4f %.4f %.2f %s\n", w, fd, ad, asl, vb
  }')
EOF
    [ -z "$W" ] && W=0
    [ -z "$verbose" ] && verbose=false

    if [ "$marker" != "true" ] || [ "$verbose" = "true" ]; then
      flag="⚠ last reply missed [cvmn] / too verbose — reload caveman, compress, tag [cvmn]. "
    fi
  fi
fi

# --- log the evaluation record (best-effort; never fail the hook) ---
log_dir="${XENOMOON_PLUGIN%/plugin}/logs"
[ -n "${XENOMOON_PLUGIN:-}" ] || log_dir="${TMPDIR:-/tmp}"
{
  mkdir -p "$log_dir" 2>/dev/null && \
  jq -cn \
    --arg s "$session_id" --argjson m "$marker" --argjson v "$verbose" \
    --argjson w "$W" --argjson fd "$fillerDensity" --argjson ad "$articleDensity" \
    --argjson asl "$avgSentLen" \
    '{session_id:$s, marker:$m, verbose:$v, W:$w, fillerDensity:$fd, articleDensity:$ad, avgSentLen:$asl}' \
    >> "$log_dir/caveman-gate.log"
} 2>/dev/null

# --- emit the non-blocking nudge ---
jq -cn --arg c "$flag$base" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'
exit 0
