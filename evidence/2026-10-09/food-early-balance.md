# Food economy early balance — evidence (2026-10-09)

Steve: "close the early-calorie gap." Sims starved ~day 13; knowledge repair (62127100)
landed but the 60-seed sweep proved the binding constraint is food INCOME.

## Diagnosis (measured, not theorized)

Instrumented `stockPantry` (the single inflow choke point) + daily production/need
over 10 seeds × 30d, then a 5-seed production probe. Key findings:

1. **Pantry-visible income was a red herring.** ~600 kcal/day via stockPantry vs
   ~24k need looked catastrophic, but villagers EAT THEIR OWN PRODUCTION FIRST
   (`ownEat = min(produced, need)` in villagerMealDay) — ~14-20k/day never
   touches the pantry. The pantry only sees the NET shortfall.
2. **The real race:** production starts ~60-70% of need (1500 base × 0.8 stranger
   × 1.0 knowledge), climbs via `villagerKnowledgeFactor` (1 + known×0.10, cap 1.8).
   Breakeven needed ~3.3 known plants; the pantry (47k) covers ~13 days of deficit.
   Villages died at median 13.5d — just before the climb finished.
3. **Thirst was the silent killer:** 11/49 baseline deaths (22%). Nobody fetches
   water autonomously; the cistern starts ~20L and drains at 2L/villager/day.
   Thirst deaths → production collapse → pantry drain → starvation spiral.
4. **Trust-gated surplus:** only 20% of surplus reaches the pantry at low trust,
   so the pantry is a one-way battery (drains fast, recharges slow).

## Changes (2 files)

**src/js/game.js — `villagerKnowledgeFactor`: 1+known×0.10 (cap 1.8) → 1+known×0.13 (cap 2.0).**
BALANCING.md Q1: a knowledgeable local feeds ~2× the stranger (the 2.0 cap is the
anchor). Q2: too high = trivial — a passive village (0-1 plants, kf 1.0-1.13)
still produces ~1650 < 2000 need and starves. Q5: knowledge→food is the thesis;
this steepens exactly that link. Breakeven moves from ~3.3 to ~2.5 known plants.

**scripts/policies/competent.js — `workWater()` in upkeep().** A competent leader
keeps the cistern filled: assigns water duty when stored < 4 days' need, wood duty
when < 8 logs (for hearth boiling). In-person only, one worker per need, guarded
against double-assignment. This is sim honesty (a real player does this), not a
game-balance change.

## Proof — 60 seeds × 30d, SAME seeds, competent policy

| metric | BEFORE (62127100) | AFTER | delta |
|---|---|---|---|
| median survival | 13d | 28d | +15d |
| P(survive ≥20) | 0.00 | 0.72 | +0.72 |
| survived to 30 | 0/60 | 23/60 | +23 |
| starvation deaths | 28% | 13% | -15pp |
| thirst deaths | 18% | 5% | -13pp |
| monster/combat/night | 25% | 48% | the interesting deaths |

`scripts/compare-curves.js`: d30 0 → 0.433, median game-days 12.5 → 28.

**Passive village still starves:** zero policy, 20 seeds: median 14d, 20/20
village-lost, starvation #1 cause. Pressure preserved.

**Content reach:** avgContests 0.1 → 1.6, avgCombats 0.5 → 1.2, avgDiseases 0.5 → 1.7
per run — villages now live long enough to REACH the content the coverage triage
flagged as never-fired.

## Regressions

- test-knowledge-early-flow.js: 9/9 (knowledge repair untouched, still green).
- test-break-food-r4.js: 30/3 — the 3 failures (W3a/b/c frenzy+trust) are
  pre-existing on the parent commit (verified via stash).
- validate-ontology.js: 52/52.

## Open threads (not this task)

- Dirty water piles up when wood is short → villagers drink dirty → sickness.
  The wood threshold (<8) may need raising, or hearth efficiency tuning.
- Sickness deaths rose 7% → 11% (villages live longer, eat more unknown food).
  The knowledge→food link is working; the disease pressure is the designed cost.
