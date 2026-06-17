// Hermes personas (the "per-call brief" design): ONE read-only gateway; personas differ only
// by their instructions-brief + UI name/color — they all share the gateway's api_server toolset
// [web, search, memory]. The persona `id` flows from the tool input into the activity relay; the
// server picks `brief`, and the client shows `name` and colors the pill from `color` (applied
// inline by the activity log, so no per-persona CSS).
//
// CONVENTION — one persona per FOLDER under ui/lib/personas/<id>/persona.js, each exporting a
// HermesPersona. To add a persona: create the folder + module, then register it here with ONE
// import line + an entry in PERSONA_LIST. Nothing else (no CSS, no type edits). To give a persona
// its OWN model / toolset / memory, don't add it here — graduate to a Hermes *profile*
// (`hermes -p <name>`, its own gateway), the heavier native path.
//
// Pure data + helpers, no browser/node globals — safe to import from the server tool, the client
// reducer, and the node-run reducer.check.js alike.
import { researcher } from "./personas/researcher/persona.js";
import { critic } from "./personas/critic/persona.js";

/** @typedef {{ id: string, name: string, color: string, brief: string }} HermesPersona */

/** Registered personas — add a new one here (one line) after creating its folder.
 * @type {HermesPersona[]} */
const PERSONA_LIST = [researcher, critic];

/** All personas, keyed by id. @type {Record<string, HermesPersona>} */
export const HERMES_PERSONAS = Object.fromEntries(PERSONA_LIST.map((p) => [p.id, p]));

/** The persona used when none is requested. */
export const DEFAULT_PERSONA = researcher.id;

/** Valid persona ids — for the tool's enum and any UI list. @type {string[]} */
export const PERSONA_IDS = PERSONA_LIST.map((p) => p.id);

/** Resolve a persona by id, falling back to the default (never undefined).
 * @param {string} [id] @returns {HermesPersona} */
export function getPersona(id) {
  return (id !== undefined ? HERMES_PERSONAS[id] : undefined) ?? researcher;
}
