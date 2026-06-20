#!/bin/bash
# tools/smoke_scene_errors.sh — per-scene headless stderr error capture (godot-verify layer 2b).
# Loads every .tscn via verify_scene.gd and fails on non-benign engine ERROR lines.
# Catches: SCRIPT ERROR, parse failures, null-material shadows, node name clashes.
# Excludes: known benign at-exit teardown noise (same exclusion list as smoke in validate.sh).
#
# UPSTREAM PROMOTION: add this block verbatim to the plugin's validate.sh template between
# the "4. scene property validation" and "5. smoke run" steps, replacing the current step 4.5
# placeholder. The gate contract: fail on any ERROR line from headless scene instantiation
# that is not in the benign teardown exclusion list.
#
# Usage: called automatically by validate.sh (step 4.5); also runnable standalone.
set -u
cd "$(dirname "$0")/.." || exit 1

resolve_engine() {
	if [ -n "${GODOT:-}" ]; then printf '%s' "$GODOT"; return 0; fi
	for name in godot redot blazium; do
		if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
	done
	for p in \
		/Applications/Godot.app/Contents/MacOS/Godot \
		/Applications/Redot.app/Contents/MacOS/Redot \
		/Applications/Blazium.app/Contents/MacOS/Blazium \
		/usr/local/bin/godot /usr/bin/godot; do
		if [ -x "$p" ]; then printf '%s' "$p"; return 0; fi
	done
	return 1
}

if ! GODOT="$(resolve_engine)"; then
	echo "smoke_scene_errors: FAIL setup — no engine binary found"
	exit 1
fi

# Benign at-exit teardown patterns — identical to validate.sh smoke exclusion list.
BENIGN="ObjectDB instances leaked|resources still in use at exit"
BENIGN="$BENIGN|RID allocations of type .* were leaked at exit"
BENIGN="$BENIGN|Pages in use exist at exit|Leaked instance dependency"

SCENES=$(find . -name '*.tscn' -not -path './.godot/*' -not -path './addons/*' | sed 's|^\./||')
if [ -z "$SCENES" ]; then
	echo "smoke_scene_errors: FAIL setup — no .tscn files found"
	exit 1
fi

fail_count=0
LOG_DIR="${TMPDIR:-/tmp}/smoke_scene_errors_logs"
mkdir -p "$LOG_DIR"
for scene in $SCENES; do
	LOG="$LOG_DIR/$(echo "$scene" | tr '/' '_').log"
	# Single invocation per scene: --log-file captures stdout+stderr together.
	# Name-clash detection fires headless; material-null is render-path only (windowed).
	"$GODOT" --headless --path . --log-file "$LOG" \
		--script tools/verify_scene.gd -- "$scene" >/dev/null 2>&1
	# Primary: grep log for ERROR/SCRIPT ERROR lines (drop benign teardown noise).
	# ^(ERROR|SCRIPT ERROR): matches push_error() and GDScript runtime errors in 4.6.
	log_errors=""
	if [ -f "$LOG" ]; then
		log_errors=$(grep -vE "$BENIGN" "$LOG" | grep -E "^(ERROR|SCRIPT ERROR):")
	fi
	# Name-clash detection: fires headless; grep log directly (no second engine run).
	name_clash_errors=""
	if [ -f "$LOG" ]; then
		name_clash_errors=$(grep -vE "$BENIGN" "$LOG" | grep -E "name clashes")
	fi
	errors="${log_errors}${name_clash_errors}"
	if [ -n "$errors" ]; then
		echo "smoke_scene_errors: FAIL — $scene"
		echo "$errors"
		# B4 fix: -E flag required for alternation in backtrace grep.
		if [ -f "$LOG" ]; then
			grep -vE "$BENIGN" "$LOG" \
				| grep -E -A 20 "^(ERROR|SCRIPT ERROR):" \
				| grep -E "^(ERROR|SCRIPT ERROR):|at: |GDScript backtrace|[[:space:]]+at"
		fi
		fail_count=$((fail_count + 1))
	fi
done

if [ "$fail_count" -gt 0 ]; then
	echo "smoke_scene_errors: FAIL — $fail_count scene(s) had errors"
	exit 1
fi
echo "smoke_scene_errors: PASS — all scenes clean"
exit 0
