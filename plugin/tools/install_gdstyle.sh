#!/usr/bin/env bash
# tools/install_gdstyle.sh — install the gdstyle Godot editor plugin (pinned) into
# THIS game's addons/. gdstyle is the in-editor GDScript linter (live, fixable
# diagnostics in the bottom panel), config = gdstyle.toml at the project root.
#
# gdstyle is ADVISORY. The blocking gate stays gdformat + gdlint via
# tools/validate.sh. See the godot-code-rules skill and
# library/tools/gdscript-linter.md for the full rationale and limitations.
#
# Works on Godot 4.6 and Redot 4.6 (native editor panel). On Blazium (4.3) only the
# CLI backend runs. Run from the game project root: tools/install_gdstyle.sh
set -euo pipefail

VERSION="v0.1.7"
URL="https://github.com/atelico/gdstyle/releases/download/${VERSION}/gdstyle-godot-plugin.zip"

if [ ! -f project.godot ]; then
	echo "install_gdstyle: run from the game project root (no project.godot here)." >&2
	exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "gdstyle: downloading editor plugin ${VERSION}…"
curl -fsSL --retry 3 -o "$TMP/plugin.zip" "$URL"
unzip -oq "$TMP/plugin.zip" -d "$TMP/x"

mkdir -p addons
rm -rf addons/gdstyle
cp -R "$TMP/x/addons/gdstyle" addons/gdstyle

echo "gdstyle: installed at addons/gdstyle (${VERSION})."
if [ ! -f gdstyle.toml ] && [ ! -f .gdstyle.toml ]; then
	echo "gdstyle: NOTE no gdstyle.toml found — the starter ships one; copy it to the project root."
fi
echo "gdstyle: enable it once in Godot — Project > Project Settings > Plugins > gdstyle (or add"
echo "         enabled=PackedStringArray(\"res://addons/gdstyle/plugin.cfg\") under [editor_plugins])."
