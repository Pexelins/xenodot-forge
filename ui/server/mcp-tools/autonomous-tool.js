// Autonomous tool: the orchestrator's control surface over the standing Main Goal
// (see autonomous-store.js). Like the tasks tool it does NOT pause the session — it
// mutates the store, broadcasts the new state to the browser (the header flag), and
// returns immediately. "complete"/"pause" also call onComplete() so the session can
// tear down the recurring 5-minute check loop.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  setProgress,
  completeAutonomous,
  stopAutonomous,
} from "../features/autonomous/autonomous-store.js";

/** @param {(obj: import("../../lib/types.js").OutMsg) => void} send
 *  @param {() => void} onComplete called when the goal is finished/paused, so the
 *  caller can clear the check-loop timer. */
export function makeAutonomousTool(send, onComplete) {
  return tool(
    "autonomous",
    'Report on the standing Main Goal (Autonomous Mode). Call op "progress" once per ' +
      "autonomous check with a one-line status of what you just dispatched or assessed. " +
      'When the goal is achieved AND the user has confirmed wrap-up, call op "complete" ' +
      "with a final report — this stops the 5-minute check loop and clears the header flag. " +
      'Use op "pause" to stop the loop without declaring success. It does NOT pause the session.',
    {
      op: z
        .enum(["progress", "complete", "pause"])
        .describe(
          '"progress" = one-line status; "complete" = goal met (needs report); "pause" = stop the loop',
        ),
      note: z.string().optional().describe("progress: one-line status of this check"),
      report: z
        .string()
        .optional()
        .describe("complete: the final report (what was built, verified, open)"),
    },
    async (input) => {
      const now = new Date().toISOString();
      if (input.op === "progress") {
        const state = setProgress(input.note ?? "", now);
        send({ type: "autonomousMode", payload: state });
        return { content: [{ type: "text", text: `Progress recorded (check ${state.checks}).` }] };
      }
      if (input.op === "complete") {
        send({ type: "autonomousMode", payload: completeAutonomous(input.report ?? "", now) });
        onComplete();
        return {
          content: [{ type: "text", text: "Main Goal marked complete — check loop stopped." }],
        };
      }
      send({ type: "autonomousMode", payload: stopAutonomous(now) });
      onComplete();
      return { content: [{ type: "text", text: "Autonomous Mode paused — check loop stopped." }] };
    },
  );
}
