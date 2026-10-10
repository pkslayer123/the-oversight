# Completion-path sweep (2026-10-09)

Steve's question: no sim has ever reached game completion (Arc IV → the table → won=true). 240 cheap long-horizon runs (60 seeds × 4 policies, 200-day horizon) to see where runs land when shooting for completion.

Script: `scripts/sweep-completion.js` (new, wraps sim-harness — shared infra untouched). Supplementary death-cause probe: `scripts/sweep-deathcauses.js`.

## Headline

**Zero runs completed. Zero reached Arc 3. Zero reached the table. All 240 ended village-lost.**

| policy | n | median days | max days | max arc | table | won |
|---|---|---|---|---|---|---|
| competent | 60 | 30 | 58 | 2 (60/60) | 0 | 0 |
| mvc | 60 | 17 | 24 | 2 (60/60) | 0 | 0 |
| leader | 60 | 14 | 22 | 2 (60/60) | 0 | 0 |
| zero (control) | 60 | 14 | 23 | 2 (60/60) | 0 | 0 |

Arc II fires on day 9 in every run. Nothing ever advances past it.

## The hard break: Arc 3 is unreachable by construction

`checkArc` (src/js/progression.js:274) gates Arc 3 on:

```
stage >= 2 && breadth >= 12 && crises >= 1
```

`noteCrisis(kind)` (progression.js:254) is the only writer of `pg.crises` — **and it has zero callers anywhere in the codebase.** Grep over all of src/js confirms: the function is defined, never invoked. `crises >= 1` can never be true, so Arc 3 can never fire, which means Arc 4 (`tableWaiting = true`) and the table scene can never fire either. The finale content (table scene, earned frames, final choice, won=true) is fully built and the dawn trigger is wired (ledger.js:1266) — but the road to it has a gate with no key.

This is not a tuning problem. It is a dead gate: the crisis-recording half of the design was never built.

## The death wall (even past the gate, the climb is brutal)

- All 240 runs: `village-lost`. Causes (15-run probe): monsters, combat, "the night", sickness, wounds that wouldn't close, starvation/thirst. The mid-game kills villages faster than they can compound.
- Arc IV gates vs observed values (competent, n=60):
  - breadth ≥ 25: **met** — mean 25.3, max 40. Knowledge compounds fine.
  - integration stage ≥ 3 (integ ≥ 80): **2/60**. Observed integration at death: 32–67. The 80 line is nearly unreachable in runs that die by day ~58.
  - sentimentTaught: **2/60**.
  - feastSurgeUsed: **0/60** (requires channeled keepsake → feastBurn; deep chain off sentiment).
- So even with crises wired, a run would need to survive roughly twice as long as the current max, push integration past 80, and complete the sentiment→keepsake→feast-surge chain — none of which any policy approaches.

## What this means

1. **Wire the crisis gate** (design call, not tuning): decide what counts as a crisis — famine winter? a villager death? a lost fight? — and call `noteCrisis` from those events. Until then, Arcs 3–4 and the table do not exist at runtime.
2. **Then re-run this sweep**: with crises wired, the binding constraint becomes survival time + integration rate + the sentiment/feast chain. Expect the next wall at stage 3.
3. Contests are firing (competent: 5.7/run) and Arc II lands day 9 — the early/mid show content is reachable. The cliff is purely the Arc 3+ progression.

## Method notes

- 240 runs, ~0.5–1s each (~2 min total). Seeds 1–60, deterministic (mulberry32).
- Per-run: endReason, days, max arc + first-day-per-arc (policy daily-hook wrapper), final breadth/stage/sentiment/feast/table/won, contest-ish telemetry count, max wave.
- Measurement only — no game code changed.
