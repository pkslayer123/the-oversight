# Completion sweep r4 — every-wave deed gate, current master (2026-10-10)

HEAD: `cc7882f4` (post all 7 build-2 items: hierarchy.js, havenGrowth.js,
partyTactics.js, depletion, comms.js, villageAgency.js). 60 seeds (1–60,
deterministic) × 3 policies × 200-day cap. Read-only sims; no game code
changed. Runner + reconstructed progress policy in
`~/workspace/sweep-r4-scratch/` (repo untouched): `sweep-r4.js`,
`progress-policy.js`, `analyze-r4.js`; raw JSON `results-r4.json`.

Progress-policy note: the r3 policy file was lost when /tmp was wiped; it was
reconstructed from the r3 report's description (competent base + 5 roads:
channel keepsakes, tellbeast/namebeast + back leading name, explorer lessons,
study bites, villager quests, answer the table). Road engagement looks
faithful: 1027 channels (31/60 runs), 216 lessons, 168 backings, ~0 system
quests — same shape as r3's 29.5 channels/engaged-run, 10.6 lessons/run,
0.07 quests/run.

## Headline

**Zero Arc IV, zero table, zero wins in 180 runs.** The every-wave deed gate
fired correctly (no false positives, no stale tableWaiting), but no organic
run got anywhere near it: maxWave 2 in ALL 180 runs, wave-3 never unlocked,
and the whole run population dies by ~day 44. The gate's wave-2 bar alone
(5 distinct fought) was reached 0/180.

| policy | Arc II | Arc III | Arc IV | table | wins | med days | max days |
|---|---|---|---|---|---|---|---|
| competent | 60/60 | 55/60 | 0 | 0 | 0 | 24 | 42 |
| progress | 60/60 | 53/60 | 0 | 0 | 0 | 24 | 44 |
| mvc | 59/60 | 33/60 | 0 | 0 | 0 | 16 | 30 |

Village-lost (day of death): p10 14, p25 15, p50 20, p75 26, p90 31. Nine out
of ten villages are gone by day 31. Arc II median day 9, Arc III median day
16–18 — early progression is actually FASTER than r3; everything after is a
wall.

## Deed-gate assembly: nobody reaches wave 5, or wave 3

Every-wave distinct fights (bar: 5/5/4/3/2), max distinct fought per policy:

| policy | w1 max (mean) | w2 max (mean) | w3+ max | w1≥5 | w2≥5 | w3≥4 | w4≥3 | w5≥2 |
|---|---|---|---|---|---|---|---|---|
| competent | 7 (3.33) | 2 (0.17) | 0 | 12/60 | 0/60 | 0 | 0 | 0 |
| progress | 7 (3.43) | 3 (0.22) | 0 | 16/60 | 0/60 | 0 | 0 | 0 |
| mvc | 5 (2.28) | 1 (0.02) | 0 | 1/60 | 0/60 | 0 | 0 | 0 |

Closest runs (best of 180): progress seed 38 — 7 w1 distinct, 0 w2+; competent
seed 46 — 5 w1 + 2 w2 distinct. The full deed set (waves 5/5/4/3/2,
3+ contests, national+, 3+ crises, sentiment, feast, stage 3+) was assembled
0/180. Closest non-wave deeds: crises≥3 at 39–46/60, contests survived≥3 at
9–10/60 (max 4), sentiment 30–32/60, stage3+ only 4–12/60, feast 0/180,
scale rank 'village' in all 180 runs ('national' never approached — the
hierarchy.js shapes were not exercised at all).

Median win day: unobserved. PROGRESSION.md target (~day 100, 90–115 for strong
runs) cannot be evaluated — no run lives past day 44.

## The binding stack, in order

1. **Survival — the wall moved closer, not further.** Median 24 days for the
   strong policies (r3: 29), max 42 (r3: 105). 58/60 villages lost per policy.
   Death causes, competent (706 villager deaths / 60 runs): combat 3.6/run,
   villager combat 1.45, monster 1.4, the night 1.3, **starvation 1.1**,
   sickness 1.0. Progress: starvation 1.4/run — the honest forager policy is
   starving. That is new: r3's win-shape cohort died of violence and
   attrition, not food. Prime suspect: today's **depletion build** (grounds
   thin with harvest pressure; vigor-gated regrow over weeks). Supporting:
   havenGrowth.js growing 12→24 tiers adds mouths under the same strained
   grounds. The policy feeds itself (competentEat, cookPack, forage trips)
   yet villages starve mid-run — the world got poorer.
2. **Wave 3 never unlocks.** Gate: day 25+ AND 8 wave-2 kills. Wave-2 kills:
   median 0, max 1 across 180 runs. The kill funnel is empty — fights are
   rare (policies flee bad ones by design: totalMhp > 2.5×pmax or wave-2 at
   <70% HP), and w1 kills are only median 3. The deed-gate pacing audit
   (0.35–0.6 fights/day reaching w5 ~day 83–139) assumed kill throughput that
   organic reactive play doesn't produce. Even the w2 deed bar (5 distinct
   FOUGHT, no kills needed) maxed at 3 distinct — wave-2 spawns don't arrive
   often enough in a ~24-day life.
3. **The feast-surge gate never arms.** 0/180 (r3: 2/60 by day 17/44). The
   pacing build's 3+-mastered gate is easier than all-maxed, but scholar death
   ~day 20–24 kills the L3 grind before it completes. Seed-55-style <3-ability
   scholars remain gate-locked forever.
4. **Scale: nobody leaves 'village'.** 180/180 'village' rank. Wave 4 needs
   regional, wave 5 + table need national; the six national shapes landed
   today are unexercised by any organic run. The scale grind has no organic
   on-ramp inside a ~24-day life.
5. **The plant-L3 lane is still dead.** 6 study bites / 60 progress runs, 0.02
   system quests/run. No L2 plants produced → system_teach offers never fire.
   (Mechanic exists; pacing doesn't produce it.)
6. **Integration 80 slowed.** stage3+: 4/60 competent, 12/60 progress, 1/60
   mvc (r3: 15–16/60 for the strong policies). Shorter lives + unchanged
   offer cadence (15%/day) = fewer 40+ quest windows.

## Regression vs r3 (HEAD a24f0146 → cc7882f4)

| metric | r3 | r4 | Δ |
|---|---|---|---|
| competent Arc III | 51/60 (85%) | 55/60 (92%) | + (early game faster) |
| competent med/max days | 29 / 105 | 24 / 42 | **tail crushed** |
| progress wins | 1/60 (day 47) | 0/60 | gate now blocks (by design) |
| stage-3 (strong policies) | 15–16/60 | 4–12/60 | worse |
| starvation (progress) | not a top killer | 84/60 runs = 1.4/run | **new** |
| progress road engagement | channels 29.5/engaged-run, lessons 10.6/run | channels 33/engaged-run, lessons 3.6/run | channels faithful; lessons lower |

r3's day-47 winner (weak scholar, maxWave 2) would NOT reach Arc IV under the
new deed gate — Scenario A of test-deed-gate confirmed the same. That is the
gate working as Steve ordered. The concerning regression is the survival
collapse: the build-2 bundle made the world deadlier faster than it made
completion deeper, and most of today's 7 items (national shapes, call-for-help
chain, village agency, wave-3/4/5 monsters, switchboard) are unreachable
inside a 24-day life. The content ladder is: win shape needs ~90–115 days;
the world ends at ~24.

## Design warts found

1. **The deed-gate pacing audit's fight-rate assumption (0.35–0.6/day) doesn't
   match organic play.** Wave-2 kills median 0 — the unlock gates (8/5/5
   kills) and the per-wave deed bars assume an aggression level the sim's
   competent player never reaches. Either the unlock gates need a second,
   time-based lane (Steve: reactive pacing, not timers — but the current
   reactive lane is kill-throughput, which the flee-heavy player never
   fills), or encounter pressure has to rise with the waves regardless of
   player aggression.
2. **Depletion vs. policy hunger.** The progress policy does everything right
   (forage trips, cooks, donates, water assignments) and still starves 1.4
   villagers/run. If the depletion numbers are intentional, the player-side
   counter-play (garden plots, fishing ecology, neighbor deals) needs to be
   reachable inside the same ~20-day window — today it isn't (no run showed
   meaningful garden/deal use; gardens weren't instrumented in the snapshot).
3. **Feast surge is now gated on a scholar living long enough to master 3
   abilities, in a world where scholars die at day 20.** The gate and the
   mortality curve are tuned for different games.
4. Progress-policy fidelity caveat: reconstructed from prose; absolute
   numbers (esp. naming/lesson effects) may shift ±noise vs r3. Relative
   policy ordering (competent ≈ progress ≫ mvc) held.

## Read

The gate is correctly assembled and correctly closed — but the game beneath
it got shorter, not longer. r4's headline is a regression report: 7 build
items landed, the completion tail (105-day runs, 1 organic win) vanished,
and the entire build-2 payoff layer (national play, wave-3+ monsters, agency
diplomacy) sits behind a survival wall no policy climbs. Next unit of work is
the survival regression (depletion tuning + villager combat/monster lethality
audit), not the arc gates.

Runner: `~/workspace/sweep-r4-scratch/sweep-r4.js` (+ progress-policy.js,
analyze-r4.js); raw: `~/workspace/sweep-r4-scratch/results-r4.json` (180
rows). Suggested follow-up: re-run this exact sweep after the survival
regression is addressed; the comparison will be apples-to-apples (seeds
1–60 deterministic).
