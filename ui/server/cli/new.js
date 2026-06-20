// forge new — install the framework for a project in one step: lock the project to a domain,
// scaffold a starter ONLY when the domain ships one and the folder is empty (otherwise wire an
// existing project in place — never scaffolding over your code), remember the path, materialize
// the domain's per-project files, then health-check.
//
// The framework's agents/skills are NOT copied into the project — they load from the domain's
// plugin: automatically in the web UI, and in terminal Claude Code after a one-time
// `/plugin install` (printed by doctor). The committed project stays pure.
//
// Usage:
//   npm run new -- ../mygame                 (godot by default; scaffold or wire in place)
//   npm run new -- ../myapp --domain=app     (install the `app` domain into an existing project)
//
// The chosen domain is written as a project-owned lock (.xenomoon-project.json), committed with
// the project so the binding travels and the framework can't later drive it as the wrong domain.
import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDomain,
  readProjectLock,
  writeProjectLock,
  PROJECT_LOCK_FILE,
  DEFAULT_DOMAIN,
} from "../core/domain-resolver.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

// Parse argv: a positional target path + an optional `--domain=<name>` / `--domain <name>`.
const argv = process.argv.slice(2);
let domainFlag = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === undefined) continue;
  if (a.startsWith("--domain=")) domainFlag = a.slice("--domain=".length);
  else if (a === "--domain") domainFlag = argv[++i] ?? null;
  else if (!a.startsWith("--")) positional.push(a);
}
const target = path.resolve(positional[0] ?? path.join(FRAMEWORK_DIR, "..", "game"));

// Determine the install domain: explicit flag wins; else an existing lock (re-install); else the
// default. A flag that contradicts an existing lock is refused — re-domaining is deliberate.
const existingLock = readProjectLock(target);
if (domainFlag && existingLock && domainFlag !== existingLock) {
  console.error(
    `new: ${target} is already installed for domain "${existingLock}"; refusing to re-domain to ` +
      `"${domainFlag}". Remove ${path.join(target, PROJECT_LOCK_FILE)} first to override.`,
  );
  process.exit(1);
}
const domainName = domainFlag ?? existingLock ?? DEFAULT_DOMAIN;
const DOMAIN = loadDomain(domainName, FRAMEWORK_DIR);
// Propagate to the spawned child steps so they resolve the same domain (they also read the lock).
process.env.XENOMOON_DOMAIN = domainName;

/** Run a child step, inheriting stdio so its output streams through. @param {string[]} args */
const node = (...args) => execFileSync("node", args, { stdio: "inherit" });

/** Make sure the project ignores the framework's generated/working paths, so they're never
 * committed (the scaffolded starter already lists these; this covers an existing project). The
 * domain lock itself is intentionally NOT ignored — it is committed with the project. @param {string} dir */
function ensureIgnores(dir) {
  const file = path.join(dir, ".gitignore");
  const need = [
    "/tools/",
    "/library",
    "/x-shared-assets",
    "/transcripts/",
    ".xenomoon/",
    ".claude/projects/",
  ];
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    /* no .gitignore yet */
  }
  const lines = cur.split(/\r?\n/);
  const missing = need.filter((p) => !lines.includes(p));
  if (!missing.length) return;
  const block =
    "\n# Xenomoon Forge generated/working files — not repo content\n" + missing.join("\n") + "\n";
  if (cur) appendFileSync(file, block);
  else writeFileSync(file, block.trimStart());
  console.log(`new: added ${missing.length} ignore rule(s) to ${file}`);
}

// 0. Ensure the target exists, then lock it to its domain (deterministic, committed). Written
//    first so the child steps below resolve the same domain from the lock.
mkdirSync(target, { recursive: true });
writeProjectLock(target, domainName);
console.log(`new: locked ${target} to domain "${domainName}" (${PROJECT_LOCK_FILE}).`);

// 1. Scaffold the domain's starter into an empty/new target — ONLY if the domain ships one. An
//    existing project (marker present) or a starterless domain is wired in place, never overwritten.
const marker = path.join(target, DOMAIN.engine.projectFile);
if (existsSync(marker)) {
  console.log(`new: ${target} already has a ${DOMAIN.engine.projectFile} — wiring it in place.`);
} else if (DOMAIN.starter) {
  cpSync(path.join(FRAMEWORK_DIR, DOMAIN.starter), target, { recursive: true });
  console.log(`new: scaffolded ${DOMAIN.label} starter → ${target}`);
} else {
  console.log(
    `new: ${target} has no ${DOMAIN.engine.projectFile} and the ${DOMAIN.label} domain ships no ` +
      `starter — installing into it as-is (bring your own project).`,
  );
}
ensureIgnores(target);

// 2. Remember the path (writes .xenomoon.json).
node(path.join(here, "setup.js"), target);

// 3. Materialize the domain's per-project files: tools/ copied, library/ symlinked (if any).
node(path.join(here, "materialize.js"), target);

// 4. Health check — fails loudly if anything didn't land.
node(path.join(here, "doctor.js"), target);

console.log(
  `\nnew: done (domain "${domainName}"). Next:\n    npm start ${target}      # web UI — loads the domain plugin automatically\n  or open ${target} in terminal Claude Code after the one-time /plugin install above.`,
);
