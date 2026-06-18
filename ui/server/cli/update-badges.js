// Keep the README's "Skills" / "Agents" badges in sync with what the framework actually
// ships — the xenodot plugin (the single source of truth). Counts skill folders and agent
// files in plugin/, rewrites the badges in README.md, and re-stages it. Wired into
// .husky/pre-commit so the counts can never drift. Run manually with: npm run badges
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { FRAMEWORK_DIR, FRAMEWORK_PLUGIN_DIR } from "../core/config.js";

/** @param {string} dir @param {(d: import("node:fs").Dirent) => boolean} keep @returns {number | null} */
function count(dir, keep) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(keep).length;
  } catch {
    return null;
  }
}

/** Replace the count in both the alt text and the shields.io URL for one badge.
 * @param {string} text @param {string} label @param {number} n @returns {string} */
function setBadge(text, label, n) {
  const re = new RegExp(
    `(!\\[${label}: )\\d+(\\]\\(https://img\\.shields\\.io/badge/${label}-)\\d+`,
  );
  return text.replace(re, `$1${n}$2${n}`);
}

const skills = count(path.join(FRAMEWORK_PLUGIN_DIR, "skills"), (d) => d.isDirectory());
const agents = count(
  path.join(FRAMEWORK_PLUGIN_DIR, "agents"),
  (d) => d.isFile() && d.name.endsWith(".md"),
);
if (skills === null || agents === null) {
  console.warn("update-badges: plugin/{skills,agents} not found — skipping.");
  process.exit(0);
}

const readmePath = path.join(FRAMEWORK_DIR, "README.md");
const before = readFileSync(readmePath, "utf8");
const after = setBadge(setBadge(before, "Skills", skills), "Agents", agents);

if (after === before) {
  console.log(`update-badges: already current (Skills: ${skills}, Agents: ${agents}).`);
  process.exit(0);
}

writeFileSync(readmePath, after);
execFileSync("git", ["add", readmePath], { stdio: "ignore" });
console.log(`update-badges: README updated → Skills: ${skills}, Agents: ${agents} (re-staged).`);
