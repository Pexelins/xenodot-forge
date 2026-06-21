// skill-setup — CLI fallback for skill allowlist configuration. If .xenomoon/skill-setup.json
// already exists (written by the UI wizard), applies it immediately and exits. Otherwise,
// runs interactive prompts, writes skill-setup.json, and applies overrides directly.
//
// Usage: node ui/server/cli/skill-setup.js [/path/to/game]
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { BUILTIN_SKILLS, getWorkspaceSkills } from "../features/skills/skill-catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

const argv = process.argv.slice(2);
const target = path.resolve(
  argv.find((a) => !a.startsWith("--")) ?? path.join(FRAMEWORK_DIR, "..", "game"),
);

const SETTINGS_FILE = path.join(target, ".claude", "settings.json");
const SETUP_FILE = path.join(target, ".xenomoon", "skill-setup.json");

// If the UI wizard already wrote a skill-setup.json, apply it and exit.
if (existsSync(SETUP_FILE)) {
  const data = /** @type {{ overrides?: Record<string, string> }} */ (
    parseJSON(readFileSync(SETUP_FILE, "utf8"))
  );
  if (data.overrides) {
    /** @type {Record<string, unknown>} */
    let saved = {};
    try {
      saved = /** @type {Record<string, unknown>} */ (
        parseJSON(readFileSync(SETTINGS_FILE, "utf8"))
      );
    } catch {
      /* ok */
    }
    writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({ ...saved, skillOverrides: data.overrides }, null, 2) + "\n",
    );
    console.log(
      `skills: applied ${Object.keys(data.overrides).length} override(s) from .xenomoon/skill-setup.json`,
    );
  }
  process.exit(0);
}

/** @param {import("node:readline").Interface} rl @param {string} question @returns {Promise<string>} */
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`\nSkill setup for: ${target}`);
console.log("Framework (xenomoon) skills are always on — not listed here.");
console.log("Answer y/n for each skill. Enter = keep default (n = off).\n");

const workspaceSkills = getWorkspaceSkills();

/** @type {Record<string, string>} */
const overrides = {};

if (workspaceSkills.length) {
  console.log("── Workspace skills (~/.claude/commands/) ──");
  for (const skill of workspaceSkills) {
    const label = skill.description ? `${skill.name}  (${skill.description})` : skill.name;
    const answer = await ask(rl, `  Keep ${label}? [y/N] `);
    overrides[skill.name] = answer.trim().toLowerCase() === "y" ? "on" : "off";
  }
  console.log("");
}

const workspaceNames = new Set(workspaceSkills.map((s) => s.name));

console.log("── Built-in Claude Code skills ──");
for (const name of BUILTIN_SKILLS.filter((n) => !workspaceNames.has(n))) {
  const answer = await ask(rl, `  Keep ${name}? [y/N] `);
  overrides[name] = answer.trim().toLowerCase() === "y" ? "on" : "off";
}

rl.close();

// Merge into existing settings, preserving permissions and everything else.
/** @type {Record<string, unknown>} */
let saved = {};
try {
  saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(SETTINGS_FILE, "utf8")));
} catch {
  /* absent — start fresh */
}

writeFileSync(
  SETTINGS_FILE,
  JSON.stringify({ ...saved, skillOverrides: overrides }, null, 2) + "\n",
);
writeFileSync(SETUP_FILE, JSON.stringify({ context: "cli", overrides }, null, 2) + "\n");

const kept = Object.entries(overrides)
  .filter(([, v]) => v === "on")
  .map(([k]) => k);
const off = Object.entries(overrides).filter(([, v]) => v === "off").length;
console.log(
  `\nDone. ${off} skill(s) disabled, ${kept.length} kept on${kept.length ? `: ${kept.join(", ")}` : ""}.`,
);
console.log(`Written to ${SETTINGS_FILE}`);
