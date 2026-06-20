// Domain resolver — the seam that lets the (domain-agnostic) spine ask for the values
// that change per target domain instead of hardcoding them. A "domain pack" lives at
// domains/<name>/ and declares those values in domain.json. The spine never branches on
// the domain name; it reads the resolved descriptor. The default domain is "godot", whose
// descriptor reproduces the framework's original hardcoded values, so behavior is
// unchanged until a different domain is selected.
//
// Selection (first hit wins): env XENODOT_DOMAIN -> .xenodot.json "domain" -> "godot".
//
// This module is ADDITIVE (no upstream file owns it), so it never conflicts on an upstream
// pull. The few spine files that consult it are listed in docs/whitelabel/SEAMS.md.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

/** Default domain — its descriptor mirrors the framework's original Godot behavior. */
export const DEFAULT_DOMAIN = "godot";

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
 * @property {string} starter   starter folder to scaffold, relative to the framework dir
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
  if (!isNonEmptyString(starter)) errs.push("starter");
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
    starter: /** @type {string} */ (starter),
    plugin: /** @type {string} */ (plugin),
    orchestrator: /** @type {string} */ (orchestrator),
    commands: /** @type {Record<string,string>} */ (commands ?? {}),
  };
}

/** Resolve the active domain NAME (not the descriptor). First hit wins:
 *  env XENODOT_DOMAIN -> .xenodot.json "domain" -> DEFAULT_DOMAIN.
 *  @param {string} [frameworkDir]
 *  @returns {string} */
export function resolveDomainName(frameworkDir = SELF_FRAMEWORK_DIR) {
  if (process.env.XENODOT_DOMAIN) return process.env.XENODOT_DOMAIN;
  try {
    const saved = /** @type {{ domain?: unknown }} */ (
      parseJSON(readFileSync(path.join(frameworkDir, ".xenodot.json"), "utf8"))
    );
    const domain = saved?.domain;
    if (typeof domain === "string" && domain) return domain;
  } catch {
    /* absent/invalid — fall through to the default */
  }
  return DEFAULT_DOMAIN;
}

/** Load + validate a domain descriptor from domains/<name>/domain.json. Throws a clear
 *  error (listing available domains) if it's missing or malformed — a bad domain selection
 *  should fail loudly at startup, not silently fall back to Godot.
 *  @param {string} name
 *  @param {string} [frameworkDir]
 *  @returns {DomainDescriptor} */
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

/** Convenience: resolve the active domain name and load its descriptor in one call.
 *  @param {string} [frameworkDir]
 *  @returns {DomainDescriptor} */
export function resolveActiveDomain(frameworkDir = SELF_FRAMEWORK_DIR) {
  return loadDomain(resolveDomainName(frameworkDir), frameworkDir);
}
