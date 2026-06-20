// Agent-skill recalibration — the WRITE side of the registry. Assign/unassign a framework skill to an
// agent by editing the skill's `agents:` tag (the source of truth) and re-projecting the affected
// agent's frontmatter `skills:` so the two stay in sync (what gen-skill-scope validates). Used by the
// `mcp__ui__set_skill` tool and the `/api/agent-skills` UI endpoint. Edits framework plugin files, so a
// change applies on the NEXT session (the SDK loads agent frontmatter at session start).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  SKILLS_DIR,
  AGENTS_DIR,
  ORCH,
  readSkills,
  readAgents,
  expandToken,
  expectedByAudience,
} from "./skill-registry.js";

/** The tag token for an audience id (the ORCH sentinel writes as `orchestrator`). @param {string} id */
const tokenFor = (id) => (id === ORCH ? "orchestrator" : id);

const CORE_ALIASES = ["all", "workers", "builders", "orchestrator"];

/** Agents + their projected skills (with the always-on CORE subset marked) + every framework skill —
 * for the recalibration UI. A skill is "core" for an agent when it reaches the agent via an ALIAS tag
 * (all/workers/builders) instead of being named explicitly — i.e. always-on (caveman, tasks-mcp, the
 * builder core), not a per-agent choice. The UI locks those and lists them so you can SEE them.
 * @returns {{ agents: {name:string, model:string|null, skills:string[], core:string[]}[], allSkills: string[] }} */
export function listAgentSkills() {
  const skills = readSkills();
  const agents = readAgents();
  const agentNames = [...agents.keys()].sort();
  const workers = agentNames.filter((n) => agents.get(n)?.tools.includes("mcp__ui__tasks"));
  const expected = expectedByAudience(skills, agentNames, workers);
  return {
    agents: agentNames.map((name) => {
      const list = [...(expected.get(name) ?? new Set())].sort();
      const core = list.filter((s) => {
        const tokens = skills.get(s) ?? [];
        return (
          !tokens.includes(name) &&
          tokens.some(
            (t) => CORE_ALIASES.includes(t) && expandToken(t, agentNames, workers).includes(name),
          )
        );
      });
      return { name, model: agents.get(name)?.model ?? null, skills: list, core };
    }),
    allSkills: [...skills.keys()].sort(),
  };
}

/** Add `agent` to a skill's audience tokens (no-op if already covered, directly or via an alias).
 * @param {string[]} tokens @param {string} agent @param {string[]} agentNames @param {string[]} workers
 * @returns {string[]} */
function addAgent(tokens, agent, agentNames, workers) {
  const covered = tokens.some((t) => expandToken(t, agentNames, workers).includes(agent));
  return covered ? tokens : [...tokens, agent];
}

/** Remove `agent` from a skill's audience tokens — dropping an explicit token, or expanding any alias
 * (all/workers/builders) that covers it to its explicit members minus `agent`.
 * @param {string[]} tokens @param {string} agent @param {string[]} agentNames @param {string[]} workers
 * @returns {string[]} */
function removeAgent(tokens, agent, agentNames, workers) {
  /** @type {string[]} */
  const out = [];
  for (const t of tokens) {
    if (t === agent) continue; // explicit — drop it
    const ids = expandToken(t, agentNames, workers);
    if (ids.includes(agent))
      for (const id of ids) out.push(tokenFor(id)); // expand alias…
    else out.push(t); // …or keep the token as-is
  }
  return [...new Set(out.filter((t) => t !== agent))];
}

/** Replace a skill's `agents: [...]` line. @param {string} skill @param {string[]} agents */
function writeSkillTag(skill, agents) {
  const file = path.join(SKILLS_DIR, skill, "SKILL.md");
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(/^agents:\s*\[[^\]]*\]/m, `agents: [${agents.join(", ")}]`));
}

/** Replace an agent's `skills:` YAML block with `skills` (sorted). @param {string} agent @param {string[]} skills */
function writeAgentSkills(agent, skills) {
  const file = path.join(AGENTS_DIR, `${agent}.md`);
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => /^skills:/.test(l));
  if (start < 0) throw new Error(`no skills: block in ${agent}.md`);
  let end = start + 1;
  while (end < lines.length && /^\s*-\s/.test(lines[end] ?? "")) end++;
  lines.splice(start, end - start, "skills:", ...skills.map((s) => `  - ${s}`));
  writeFileSync(file, lines.join("\n"));
}

/** Assign (on) or unassign (off) a framework skill to an agent: edit the skill's `agents:` tag, then
 * re-project the agent's frontmatter `skills:` from the updated tags. Applies next session.
 * @param {string} agent @param {string} skill @param {boolean} on
 * @returns {{ ok: true, skills: string[] } | { error: string }} */
export function applyAssignment(agent, skill, on) {
  const skills = readSkills();
  const agents = readAgents();
  if (agent === "orchestrator" || agent === ORCH)
    return {
      error:
        "the hive's skills are the framework floor (ORCHESTRATOR_FRAMEWORK_SKILLS), not recalibrated here",
    };
  if (!agents.has(agent)) return { error: `unknown agent: ${agent}` };
  if (!skills.has(skill)) return { error: `unknown framework skill: ${skill}` };

  const agentNames = [...agents.keys()].sort();
  const workers = agentNames.filter((n) => agents.get(n)?.tools.includes("mcp__ui__tasks"));
  const tokens = skills.get(skill) ?? [];
  const next = on
    ? addAgent(tokens, agent, agentNames, workers)
    : removeAgent(tokens, agent, agentNames, workers);

  writeSkillTag(skill, next);
  skills.set(skill, next); // reflect the edit, then re-project this agent's full skill set
  const expected = expectedByAudience(skills, agentNames, workers);
  const agentSkills = [...(expected.get(agent) ?? new Set())].sort();
  writeAgentSkills(agent, agentSkills);
  return { ok: true, skills: agentSkills };
}
