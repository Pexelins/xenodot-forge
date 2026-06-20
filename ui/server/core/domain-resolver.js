// Domain resolver — the seam that lets the (domain-agnostic) spine ask for the values
// that change per target domain instead of hardcoding them. A "domain pack" lives at
// domains/<name>/ and declares those values in domain.json. The spine never branches on
// the domain name; it reads the resolved descriptor. The default domain is "godot", whose
// descriptor reproduces the framework's original hardcoded values, so behavior is
// unchanged until a different domain is selected.
//
// A domain is bound to a project DETERMINISTICALLY at install time: `forge new --domain <name>`
// writes a project lock (PROJECT_LOCK_FILE) into the project. At runtime the spine reads that
// lock as AUTHORITATIVE — an explicit override (env / framework config) that disagrees is
// refused, never silently applied. Resolution when no lock exists: env XENOMOON_DOMAIN ->
// framework .xenomoon.json "domain" -> "godot".
//
// This module is ADDITIVE (no upstream file owns it), so it never conflicts on an upstream
// pull. The few spine files that consult it are listed in docs/whitelabel/SEAMS.md.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

/** Default domain — its descriptor mirrors the framework's original Godot behavior. */
export const DEFAULT_DOMAIN = "godot";

/** A project's domain lock, written into the project by install — DISTINCT from the framework's
 *  own `.xenomoon.json` (which lives at the framework root). Committed with the project so the
 *  binding travels. Shape: `{ "domain": "<name>" }`. */
export const PROJECT_LOCK_FILE = ".xenomoon-project.json";

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url)); // ui/server/core
const SELF_FRAMEWORK_DIR = path.join(SELF_DIR, "..", "..", "..");

/**
 * @typedef {Object} DomainDescriptor
 * @property {string} name      the domain's id (matches its domains/<name>/ folder)
 * @property {string} label     human label for UI/CLI copy
 * @property {boolean} populated whether the domain ships pre-baked capabilities (godot) or
 *           starts empty and learns the project (new domains). Drives whether `doctor`'s
 *           agent/skill/tool checks are hard or informational.
 * @property {{ name: string, projectFile: string }} engine
 *           on-disk project marker + engine/runtime name
 * @property {{ scenes: string[], scripts: string[] }} inventory
 *           file extensions the live project inventory scans for
 * @property {string|null} starter starter folder to scaffold (relative to the framework dir),
 *           or null for an install-into-existing domain that never scaffolds
 * @property {string} plugin    capability plugin dir, relative to the framework dir
 * @property {string} orchestrator routing-prompt file, relative to the framework dir
 * @property {Record<string,string>} commands build/verify commands written into the manifest
 */

/** Raw parsed domain.json — every leaf is `unknown` until validated. */
/** @typedef {{ name?: unknown, label?: unknown, populated?: unknown, engine?: { name?: unknown, projectFile?: unknown }, inventory?: { scenes?: unknown, scripts?: unknown }, starter?: unknown, plugin?: unknown, orchestrator?: unknown, commands?: unknown }} RawDomain */

/** @param {unknown} v @returns {boolean} */
const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;
/** @param {unknown} v @param {string} fallback @returns {string} */
const strOr = (v, fallback) => (typeof v === "string" && v ? v : fallback);
/** A plain object (commands map) or absent — rejects arrays/primitives. @param {unknown} v @returns {boolean} */
const isObjectOrAbsent = (v) => v == null || (typeof v === "object" && !Array.isArray(v));

/** Read a `domain` string from a JSON file, or null if the file/key is absent or invalid.
 *  @param {string} file @returns {string|null} */
function readDomainKey(file) {
  try {
    const saved = /** @type {{ domain?: unknown }} */ (parseJSON(readFileSync(file, "utf8")));
    const d = saved?.domain;
    return typeof d === "string" && d ? d : null;
  } catch {
    return null;
  }
}

/** Validate parsed domain.json and return the normalized descriptor. Throws listing every
 *  missing/invalid field at once. @param {RawDomain} raw @param {string} name
 *  @returns {DomainDescriptor} */
function normalizeDescriptor(raw, name) {
  const engineName = raw.engine?.name;
  const projectFile = raw.engine?.projectFile;
  const scenes = raw.inventory?.scenes;
  const scripts = raw.inventory?.scripts;
  const starter = raw.starter;
  const plugin = raw.plugin;
  const orchestrator = raw.orchestrator;
  const commands = raw.commands;

  const errs = [];
  if (!isNonEmptyString(engineName)) errs.push("engine.name");
  if (!isNonEmptyString(projectFile)) errs.push("engine.projectFile");
  if (!Array.isArray(scenes)) errs.push("inventory.scenes[]");
  if (!Array.isArray(scripts)) errs.push("inventory.scripts[]");
  if (!isNonEmptyString(plugin)) errs.push("plugin");
  if (!isNonEmptyString(orchestrator)) errs.push("orchestrator");
  if (!isObjectOrAbsent(commands)) errs.push("commands (object)");
  if (errs.length) {
    throw new Error(`domain "${name}": domain.json missing/invalid fields: ${errs.join(", ")}`);
  }

  return {
    name: strOr(raw.name, name),
    label: strOr(raw.label, name.charAt(0).toUpperCase() + name.slice(1)),
    // Empty (learning) domains default to NOT populated; only a domain that ships pre-baked
    // capabilities (godot) declares populated:true and so stays under doctor's hard checks.
    populated: raw.populated === true,
    engine: {
      name: /** @type {string} */ (engineName),
      projectFile: /** @type {string} */ (projectFile),
    },
    inventory: {
      scenes: /** @type {string[]} */ (scenes),
      scripts: /** @type {string[]} */ (scripts),
    },
    // Optional: a domain that only installs into existing projects (e.g. app) declares no starter.
    starter: isNonEmptyString(starter) ? /** @type {string} */ (starter) : null,
    plugin: /** @type {string} */ (plugin),
    orchestrator: /** @type {string} */ (orchestrator),
    commands: /** @type {Record<string,string>} */ (commands ?? {}),
  };
}

/** Read a project's locked domain (PROJECT_LOCK_FILE), or null if unlocked/absent.
 *  @param {string} projectDir @returns {string|null} */
export function readProjectLock(projectDir) {
  return readDomainKey(path.join(projectDir, PROJECT_LOCK_FILE));
}

/** Write/refresh a project's domain lock (deterministic, install-time). The lock is the project's
 *  binding to a domain; the spine reads it as authoritative thereafter.
 *  @param {string} projectDir @param {string} domain */
export function writeProjectLock(projectDir, domain) {
  writeFileSync(
    path.join(projectDir, PROJECT_LOCK_FILE),
    JSON.stringify({ domain }, null, 2) + "\n",
  );
}

/** The domain a caller explicitly REQUESTED (an override), or null — env XENOMOON_DOMAIN, then the
 *  framework's own `.xenomoon.json` `domain`. Absence is null (NOT the default).
 *  @param {string} frameworkDir @returns {string|null} */
function readRequestedDomain(frameworkDir) {
  if (process.env.XENOMOON_DOMAIN) return process.env.XENOMOON_DOMAIN;
  return readDomainKey(path.join(frameworkDir, ".xenomoon.json"));
}

/** Resolve the active domain NAME for a project. The project's lock is AUTHORITATIVE; an explicit
 *  override that disagrees is REFUSED (no silent override). With no lock: override -> DEFAULT_DOMAIN.
 *  @param {string} projectDir @param {string} [frameworkDir] @returns {string} */
export function resolveDomainName(projectDir, frameworkDir = SELF_FRAMEWORK_DIR) {
  const locked = readProjectLock(projectDir);
  const requested = readRequestedDomain(frameworkDir);
  if (locked && requested && locked !== requested) {
    throw new Error(
      `domain mismatch: this project is locked to "${locked}" but "${requested}" was requested ` +
        `(via env XENOMOON_DOMAIN or .xenomoon.json). The project lock wins — drop the override, or ` +
        `re-install the project for "${requested}".`,
    );
  }
  return locked ?? requested ?? DEFAULT_DOMAIN;
}

/** Load + validate a domain descriptor from domains/<name>/domain.json. Throws a clear error
 *  (listing available domains) if it's missing or malformed — a bad domain selection should fail
 *  loudly at startup, not silently fall back to Godot.
 *  @param {string} name @param {string} [frameworkDir] @returns {DomainDescriptor} */
export function loadDomain(name, frameworkDir = SELF_FRAMEWORK_DIR) {
  const domainsDir = path.join(frameworkDir, "domains");
  const file = path.join(domainsDir, name, "domain.json");
  if (!existsSync(file)) {
    const available = existsSync(domainsDir)
      ? readdirSync(domainsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];
    throw new Error(
      `domain "${name}": no descriptor at ${path.relative(frameworkDir, file)}` +
        (available.length ? ` (available: ${available.join(", ")})` : ""),
    );
  }
  let raw;
  try {
    raw = /** @type {RawDomain} */ (parseJSON(readFileSync(file, "utf8")));
  } catch (e) {
    throw new Error(`domain "${name}": invalid domain.json`, { cause: e });
  }
  return normalizeDescriptor(raw, name);
}

/** Convenience: resolve the active domain for a project and load its descriptor in one call.
 *  @param {string} projectDir @param {string} [frameworkDir] @returns {DomainDescriptor} */
export function resolveActiveDomain(projectDir, frameworkDir = SELF_FRAMEWORK_DIR) {
  return loadDomain(resolveDomainName(projectDir, frameworkDir), frameworkDir);
}
