#!/usr/bin/env node
// rebrand.mjs — idempotent "xenodot" -> "xenomoon" codemod.
//
// WHY THIS EXISTS (read docs/whitelabel/SYNC.md for the full strategy):
//   We track upstream (arthur0n/xenodot-forge) closely AND want a full xenomoon
//   rebrand. Hand-editing ~70 upstream files would conflict on nearly every pull.
//   Instead the rebrand is a deterministic, re-runnable transform. It is COMMITTED
//   on our `main` trunk (xenomoon end-to-end). After each upstream pull, re-run it
//   as a post-merge fixer to rebrand the newly-arrived "xenodot", then resolve any
//   overlaps; `--check` asserts idempotency.
//
// USAGE:
//   node scripts/rebrand.mjs           apply in place, print a summary
//   node scripts/rebrand.mjs --check   dry run; exit 1 if anything WOULD change
//                                       (used to assert idempotency / in CI)
//
// GUARANTEES:
//   - Case-preserving: XENODOT_->XENOMOON_, Xenodot->Xenomoon, xenodot->xenomoon,
//     xenodot:->xenomoon:, xenodots->xenomoons.
//   - Idempotent: a second run produces no changes.
//   - Denylist: any LINE referencing the upstream repo (contains "arthur0n") is
//     left verbatim, so upstream URLs / clone instructions keep pointing at the
//     real source.
//   - Skips this codemod's own machinery + the whitelabel docs, which intentionally
//     mention the literal "xenodot" and must not be rewritten.

/* global process, console */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const CHECK_ONLY = process.argv.includes("--check");

// Files/paths whose literal "xenodot" must be preserved (our own machinery + docs
// that describe the rename). Relative to repo root, POSIX-style.
const SKIP_FILES = new Set(["scripts/rebrand.mjs", "scripts/sync-upstream.sh"]);
const SKIP_PREFIXES = ["docs/whitelabel/"];

// Binary / non-text extensions we never read as text.
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".glb",
  ".gltf",
  ".bin",
  ".wasm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".mov",
  ".zip",
  ".gz",
  ".tar",
  ".pdf",
]);

// A LINE is left untouched if it references the upstream repo. Keeps provenance
// URLs (github.com/arthur0n/xenodot-forge, raw.githubusercontent.com/...) intact.
const DENYLIST_LINE = /arthur0n/i;

function casePreserve(match) {
  if (match === match.toUpperCase()) return "XENOMOON";
  if (match[0] === match[0].toUpperCase()) return "Xenomoon";
  return "xenomoon";
}

function transform(text) {
  let changed = false;
  const out = text
    .split("\n")
    .map((line) => {
      if (DENYLIST_LINE.test(line)) return line;
      const next = line.replace(/xenodot/gi, casePreserve);
      if (next !== line) changed = true;
      return next;
    })
    .join("\n");
  return { out, changed };
}

function isSkipped(rel) {
  if (SKIP_FILES.has(rel)) return true;
  return SKIP_PREFIXES.some((p) => rel.startsWith(p));
}

/** Files that SHIP — git-tracked only, so gitignored local state (.xenodot.json, logs/,
 *  node_modules/, vendor/, a nested game dir, materialized tools) is never touched. The
 *  codemod always runs at the tip of a git branch, so git is available. @returns {string[]} */
function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

const changedFiles = [];
const pathWarnings = [];

for (const rel of trackedFiles()) {
  if (isSkipped(rel)) continue;

  // We never rename file PATHS here (none are expected); warn if a tracked path ever
  // carries "xenodot" so a human renames it, instead of leaving a half-rebrand.
  if (/xenodot/i.test(rel)) pathWarnings.push(rel);

  if (BINARY_EXT.has(extname(rel).toLowerCase())) continue;

  const abs = join(ROOT, rel);
  const buf = readFileSync(abs);
  if (buf.includes(0)) continue; // null byte => binary, skip
  const text = buf.toString("utf8");
  if (!/xenodot/i.test(text)) continue;

  const { out, changed } = transform(text);
  if (!changed) continue;

  changedFiles.push(rel);
  if (!CHECK_ONLY) writeFileSync(abs, out);
}

if (pathWarnings.length) {
  console.warn("⚠ tracked paths contain 'xenodot' (rename by hand, not auto-renamed):");
  for (const p of pathWarnings) console.warn("   " + p);
}

if (CHECK_ONLY) {
  if (changedFiles.length) {
    console.error(`✗ rebrand --check: ${changedFiles.length} file(s) would change:`);
    for (const f of changedFiles) console.error("   " + f);
    process.exit(1);
  }
  console.log("✓ rebrand --check: tree already fully rebranded (idempotent).");
} else {
  console.log(`✓ rebrand: rewrote ${changedFiles.length} file(s).`);
  for (const f of changedFiles) console.log("   " + f);
}
