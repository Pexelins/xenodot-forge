---
name: agent-report
agents: [builders]
description: The agent→orchestrator handoff protocol. A backgrounded worker's relayed result string truncates on long, tool-heavy turns, so the handoff is an artifact, not a string — the worker Writes its full report to a file, and a cheap summarizer distills it. Load this whenever a task asks you to hand off a structured report to another agent, or when you are the agent distilling one. Any agent doing background work that must be handed off uses it — not only builders. Defines both sides of the contract.
---

# Handoff Report

A long background worker's relayed `result` gets clipped (the tail is lost) — so **the handoff is a FILE, not your result string**. Write the report to disk; the orchestrator reads a tiny summary of it, never your raw result.

`caveman` applies to everything here — the report file and the summary. Compress; fragments OK; identifiers/paths/errors exact.

## Producer — you built something, now hand off

Your **last action** is to **Write your full report** to the handoff path the orchestrator gave you (e.g. `.xenodot/handoffs/<slug>.md`). If no path was given, use `.xenodot/handoffs/<task-slug>.md` (kebab from the task) and name it in your result. Write it **last** so it reflects final state — if you die before writing, the summarizer reports the absence (graceful, not silent-wrong).

Report fields — **`gate` FIRST** (the tail can clip; lead with the load-bearing fact):

```
gate: PASS | FAIL <layer/why>   — tools/validate.sh (+ godot-verify) output, or why you couldn't run it
files: <path — one-line reason>   (created/modified, repo-relative; one per line)
done: <what works now, one line>
caveats: <gotchas the caller must know, or none>
friction: <improvised pattern / first-attempt verify fail / scope creep / ambiguous skill — one line each, or none>
blocked: <exactly what is missing, or omit>
```

(Refactor variant: `gate` carries BEFORE-baseline + AFTER output; `friction`/`caveats` collapse to a `stopped:` line for judgment calls you halted on.)

**Your relayed result = just `<path> — gate PASS|FAIL`.** Nothing more. The path is short, so it survives even a clipped result; the file is the real handoff. Never dump the report into the result.

## Consumer — you are the handoff-summarizer

Read the one file at the path given. Emit a **≤5-line caveman digest and nothing else** — distill, never echo:

```
gate: PASS | FAIL <one-line why>
files: <count> — <names>
done: <one line>
open: <unfinished/blocked, one line> | none
```

`gate` leads. No extra fields or commentary — full detail stays in the file; the orchestrator reads it directly if it needs more.

**Missing/empty file → say so, never invent:**

```
NO HANDOFF at <path> — worker likely died before writing. Verify via git/grep + redispatch.
```
