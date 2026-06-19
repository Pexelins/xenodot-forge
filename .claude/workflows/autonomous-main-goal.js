// Autonomous Mode / Main Goal — CONCEPTION as a Workflow script.
//
// This is the same loop the in-session server timer drives (see
// .claude/plans/snuggly-watching-crescent.md), expressed as an explicit Workflow
// so the control flow is easy to SEE:
//
//   kickoff (evaluate → clarify → plan)
//      │
//      ▼
//   ┌──────────────── check loop (every cycle, until goal met or budget out) ─────────────┐
//   │  assess progress vs goal  →  dispatch next slice  →  record one-line progress         │
//   └──────────────────────────────────────────────────────────────────────────────────────┘
//      │  (orchestrator judges goal achieved)
//      ▼
//   confirm with user  →  final report
//
// In the REAL feature each "cycle" is a 5-min timer tick that pushes an
// `[Autonomous check #N]` turn into the live orchestrator session — NOT a fresh
// agent like below. This script is the conceptual twin: one agent() call per role
// the orchestrator would otherwise route to. Runnable as a prototype, but the
// shipped loop lives in session.js, not here.

export const meta = {
  name: "autonomous-main-goal",
  description:
    "Conception of the Autonomous Mode loop: evaluate a Main Goal, then check/dispatch each cycle until done",
  whenToUse: "Visualize or prototype how the hive self-drives toward a standing Main Goal",
  phases: [
    {
      title: "Kickoff",
      detail: "evaluate the goal, ask blocking questions, break into a task list",
    },
    {
      title: "Check loop",
      detail: "each cycle: assess progress, dispatch the next slice, record status",
    },
    { title: "Wrap up", detail: "confirm with the user, then write the final report" },
  ],
};

// The Main Goal — in the real feature this comes from the header modal /
// .xenodot/autonomous.json. Here it's passed via args so the workflow is reusable.
const GOAL = (args && args.goal) || "Add a pause menu to the game";
const MAX_CYCLES = (args && args.maxCycles) || 6; // stand-in for "until the user stops / budget out"

// ── Schemas: force the orchestrator-stand-in agents to return structured data ──
const PLAN_SCHEMA = {
  type: "object",
  required: ["understood", "blockingQuestions", "tasks"],
  properties: {
    understood: { type: "string", description: "one-line restatement of the goal" },
    blockingQuestions: {
      type: "array",
      items: { type: "string" },
      description: "only truly blocking clarifications",
    },
    tasks: {
      type: "array",
      items: { type: "string" },
      description: "the slices the goal breaks into, in order",
    },
  },
};

const CYCLE_SCHEMA = {
  type: "object",
  required: ["progressNote", "goalMet", "dispatched"],
  properties: {
    progressNote: {
      type: "string",
      description: 'one-line status, like mcp__ui__autonomous {op:"progress"}',
    },
    dispatched: {
      type: "string",
      description: 'the slice handed to godot-dev this cycle (or "none — blocked")',
    },
    blocked: { type: "string", description: "if blocked, what the user must decide (else empty)" },
    goalMet: { type: "boolean", description: "true once the task board satisfies the goal" },
  },
};

// ── Phase 1: Kickoff — evaluate the goal up front (the kickoff turn) ──
phase("Kickoff");
const plan = await agent(
  `You are the Xenodot orchestrator. A standing Main Goal was just set: "${GOAL}".\n` +
    `Evaluate it the way the kickoff turn would: restate it in one line, list ONLY blocking ` +
    `clarifying questions (keep minimal — most goals need none), and break it into an ordered ` +
    `list of small implementation slices a single xenodot:godot-dev task could each own.`,
  { label: "kickoff:evaluate", phase: "Kickoff", schema: PLAN_SCHEMA },
);

if (plan && plan.blockingQuestions.length) {
  // In the real feature these go to the user via mcp__ui__form / AskUserQuestion and
  // the loop waits. In conception we just surface them so they're visible.
  log(
    `Kickoff raised ${plan.blockingQuestions.length} blocking question(s): ${plan.blockingQuestions.join(" | ")}`,
  );
}
log(
  `Goal understood as: ${plan ? plan.understood : "(kickoff failed)"} — ${plan ? plan.tasks.length : 0} slice(s) planned`,
);

// ── Phase 2: Check loop — one iteration per 5-min tick, until goal met ──
phase("Check loop");
const history = [];
let goalMet = false;
let cycle = 0;
while (!goalMet && cycle < MAX_CYCLES) {
  cycle += 1;
  // Each cycle mirrors an `[Autonomous check #N]` turn: read where we are, dispatch
  // the next slice, emit a one-line progress note. `history` stands in for the task board.
  const result = await agent(
    `You are the Xenodot orchestrator on autonomous check #${cycle}.\n` +
      `Main Goal: "${GOAL}".\n` +
      `Planned slices: ${plan ? JSON.stringify(plan.tasks) : "[]"}.\n` +
      `Progress so far: ${history.length ? JSON.stringify(history) : "(nothing yet)"}.\n` +
      `Assess progress vs the goal, decide the SINGLE next slice to dispatch to a background ` +
      `xenodot:godot-dev (or report blocked), and report goalMet=true only once the board ` +
      `would satisfy the whole goal.`,
    { label: `check#${cycle}`, phase: "Check loop", schema: CYCLE_SCHEMA },
  );
  if (!result) break; // agent died — treat like a missed tick
  history.push({ cycle, note: result.progressNote, dispatched: result.dispatched });
  log(
    `check #${cycle}: ${result.progressNote}${result.blocked ? `  ⚠ blocked: ${result.blocked}` : ""}`,
  );
  if (result.blocked) {
    // Real feature: mcp__ui__ask the user and keep the loop alive. Conception: stop here.
    log("Loop would pause for a user decision (mcp__ui__ask) and resume next tick.");
    break;
  }
  goalMet = result.goalMet;
}

// ── Phase 3: Wrap up — self-judge done, confirm, then report ──
phase("Wrap up");
if (goalMet) {
  // Real feature: orchestrator files this report and mcp__ui__ask's the user to confirm
  // wrap-up; only on confirmation does it call mcp__ui__autonomous {op:"complete"}.
  const report = await agent(
    `The Main Goal "${GOAL}" now looks achieved after ${cycle} cycle(s).\n` +
      `Progress log: ${JSON.stringify(history)}.\n` +
      `Write the final report the orchestrator would show before asking the user to confirm wrap-up: ` +
      `what was built, what was verified, anything still open.`,
    { label: "wrapup:report", phase: "Wrap up" },
  );
  log('Goal met — awaiting user confirmation before op:"complete" clears the header flag.');
  return { goal: GOAL, cycles: cycle, goalMet: true, history, report };
}

log(
  `Loop ended without completing (cycles=${cycle}). In the real feature the timer keeps ticking until the user stops it or the goal is met.`,
);
return { goal: GOAL, cycles: cycle, goalMet: false, history };
