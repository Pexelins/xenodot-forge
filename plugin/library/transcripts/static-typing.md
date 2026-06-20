# Better, faster GDScript through Static Typing — transcript digest

**Source** — `static-typing.md` (raw now in `transcripts/archive/static-typing.md`). YouTube "Better, faster GDScript through Static Typing".
**Why harvested** — building/benchmarking code-quality best practices; feeds the internal code-quality evaluator agent (4 axes: clean architecture / reusable systems / proper state management / optimized code; descriptive rubric, split Godot-4-only + general sub-rubrics). Static typing sits in Godot-4-only / optimized-code and overlaps the existing `validate.sh` gate.

**Quality of source** — beginner 101, thin. Two technical claims are WRONG (flag, do not propagate): "integers use 16 bits" (GDScript `int` = 64-bit), "a bool only allocates 1 bit". GDScript `Variant` is a fixed-size tagged union — a dynamic var does not literally "delete + reallocate 16 bits" on retype. The _direction_ of the perf claim (typed = faster, skips Variant boxing/type-checks) holds; the mechanism as told is folk-level. Take techniques, discard the bit-counting rationale.

**Points**

| #   | Point (technique/claim)                                                                                                 | Valid for our stack? | Already learned? | Where / gap                                                                                                                                                                                                               | Verdict                                    | Axis / sub-rubric                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| 1   | **Statically type every var** — `var x: bool = ...` (or `:=`) so a var cannot silently retype (bool→int "rounds down"). | holds                | covered          | godot-code-rules `untyped_declaration=2` (warnings→error via `project.godot [debug]`); enforced by `validate.sh` step 3 parse. `:=` encouraged when RHS obvious.                                                          | Covered — no action                        | optimized code + clean architecture / **Godot-4 sub-rubric** |
| 2   | **Typed function return** — `func add(...) -> int:` so the return cannot drift to float.                                | holds                | covered          | godot-code-rules "explicit return types `-> Type` on **every** func, incl `-> void`"; `untyped_declaration=2`.                                                                                                            | Covered — no action                        | optimized code + clean architecture / **Godot-4 sub-rubric** |
| 3   | **Typed function params** — `func add(n: int, m: int)`.                                                                 | holds                | covered          | same rule ("every param typed"); `unsafe_*=2` catches downstream.                                                                                                                                                         | Covered — no action                        | optimized code / **Godot-4 sub-rubric**                      |
| 4   | **Perf claim: typed code is faster** — avoids runtime retype / Variant boxing → less CPU.                               | holds with caveat    | partial          | godot-code-rules frames typing as _correctness_ (TS-strict equiv), NOT perf; no recorded perf rationale, no benchmark. Real Godot benefit = typed-instruction VM path + fewer dynamic lookups, not the video's bit story. | Partial — rubric nuance + benchmark fodder | optimized code / **Godot-4 sub-rubric**                      |

**Already-learned tally** — covered 3 (#1–#3), partial 1 (#4), gap 0, conflicts 0.

**Conflicts** — none. Every technique is already mandated and gated; the video is strictly a _subset_ of what `validate.sh` enforces. Notably the gate is STRICTER than the video: untyped is an error (not a style nudge), plus `unsafe_*`, `shadowed_*`, `integer_division`, unused-var all error. The video teaches none of that depth.

**What sharpens/extends validate.sh** — nothing new to enforce. The one _extension_ is rationale, not rule: record the **perf** justification for typing (typed VM path / no Variant boxing) so the evaluator can score "optimized code", separate from the existing correctness framing. A micro-benchmark (typed vs untyped hot loop) would substantiate it — that is the "benchmark" half of the harvest brief, currently unproven.

**Rubric items for the evaluator agent**

- **Checklist (Godot-4, hard):** every `var`/param/return typed; `:=` only when RHS makes type obvious. Mirror of `untyped_declaration=2`. (axis: optimized code + clean architecture)
- **Smell (Godot-4):** a var that retypes across its life (bool→int), reliance on implicit Variant coercion, or a float silently returned where int intended → untyped/loose-typed code. (axis: optimized code)
- **Principle (Godot-4):** static typing is an _optimization_ axis, not only correctness — typed code takes the typed VM path / skips Variant boxing & dynamic lookups. Justify hot-path code is typed. DESCRIPTIVE: score against "is the type explicit and is the choice defensible", not "did they add a colon". (axis: optimized code)
- **Anti-claim to NOT encode:** the "int=16 bits / bool=1 bit / delete-and-reallocate" mechanism is wrong; rubric must not cite it. The benefit is real, the bit story is not.
- **Boundary note:** this axis already has a blocking gate (`validate.sh`). Evaluator should _credit the gate_ and grade what the gate can't — perf-appropriateness of typed choices, `@warning_ignore`/`# SEAM:` discipline — not re-flag what the gate already fails. (axis: optimized code, scoping)

**Recommended next** — nothing to dispatch. All techniques covered + gated; no build gap, no skill/addon/design need. Pure rubric fodder → hand the items above to the evaluator-agent author (existing rubric task), NOT skill-researcher.

**Later**

- #4 perf rationale → if a code-quality _benchmark_ is actually built (harvest brief mentions "benchmark"), add a typed-vs-untyped micro-bench to substantiate the optimized-code axis. Not a skill — a one-off measurement for the evaluator's evidence base.
