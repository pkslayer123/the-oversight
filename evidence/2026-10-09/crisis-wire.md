# Crisis wire — Arc III unblocked (2026-10-09)

Steve approved the crisis roster ("great start"). `checkArc()` gated Arc 3 on
`crises>=1` but `noteCrisis()` had zero callers — the finale was unreachable by
construction. Five crises now have keys. No new systems: 1–3 line hooks at
existing event sites. `fireCrisis(kind, ctx)` (progression.js) owns the loud
beat + ledger moment + `noteCrisis`; dedupe lives there (once per kind per run).

## Hooks

| crisis | hook site | trigger |
|---|---|---|
| hunger-winter | game.js `villageEats()` | actual intake <60% of need (`anyStarving`), 3 consecutive days; counter in `progState.hungryStreak`, resets when fed. Genuine hunger, not voluntary fasting — the signal is what villagers ate. |
| first-grave | corpses.js `registerDeath()` | first `person`/`villager` death whose id isn't the player's |
| breach | game.js `startCombat()` | hostile combat starts while `playerAtHaven()` |
| schism | betrayal.js `removeVillager()` (`how==='exiled'`) + `exilePlayer()` (`how==='moot'`) | the village casts one out — moot exile and freeloader vote-out both land in the removal choke point; player exile via the moot path |
| blood-on-air | contests.js `_contestResolveOthers()` | a villager contestant's outcome is `'died'` on camera |

Beats: `◈ CRISIS — <NAME>` + one earnest System line (only after the System
arrives). No audience care-package layer yet — later.

## Proof

`scripts/test-crisis-20261009.js` — 16/16 × 3 seeds (20261009, 7, 99):
- hunger-winter fires on 3 genuinely hungry days, exactly once
- first-grave fires on villager death, not on player death, not twice
- breach fires at-haven, not in the wild, not twice
- schism fires on exile, not on killed removal, not twice
- blood-on-air fires on a contest death (stubbed engine fate)
- C6: with the other Arc-3 gates forced open, a crisis flips arc 2→3 —
  the crisis was the missing gate

Ontology: 52/52 validated. Commit `d7d5ba01` (+ this evidence file).

## Sweep — before vs after (200-day horizon)

Before (240 runs): 0/240 reached Arc 3. Arc II fired day 9 in every run;
nothing ever advanced.

After — full sweep 60 seeds × 4 policies:

| policy | median days | Arc 3 reach |
|---|---|---|
| competent | 29 | 48/60 (80%) |
| mvc | 16 | 26/60 (43%) |
| leader | 14 | 20/60 (33%) |
| zero | 14 | 13/60 (22%) |

Crisis detail (30 seeds × 4 policies): median first-crisis day 12–15.

| crisis | competent | mvc | leader | zero |
|---|---|---|---|---|
| first-grave | 30 | 30 | 27 | 30 |
| breach | 22 | 9 | 0 | 0 |
| hunger-winter | 22 | 25 | 19 | 17 |
| schism | 4 | 1 | 0 | 1 |
| blood-on-air | 0 | 0 | 0 | 0 |

## Notes / next walls

- **first-grave dominates**: a villager dies in nearly every run by ~day 13, so
  the crisis gate is now the easy one — Arc 3 binds on stage≥2 + breadth≥12.
  As designed (crisis is one ingredient), but the gate no longer differentiates.
- **blood-on-air never fired** in 120 runs: villager contest deaths are rare or
  unreachable in sims. The hook is proven by unit test; reachability is an open
  question for the contest loop.
- **Arc 4 still unreached** (0/240 table, 0 won): next walls are integration
  stage 3, sentiment taught, feast surge — as the first sweep predicted.
- Median Arc-3 day for competent ≈ 18 (arcDay sample: 1→9→18).
