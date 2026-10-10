# Deed gate retune — every wave 1-5, ~100-day target (Steve 2026-10-10)

## The correction
Steve: "No your requirements are off. We are targeting 100 days and having
to progress through every monster wave etc." The previous gate (3+ distinct
wave-3+ fought, >=1 wave-4) was too lax — the r3 sweep's day-47 weak winner
(regional, wave-2 max) could reach it.

## The new deed set (`deedGateReady()`, src/js/progression.js)
Per-wave DISTINCT blow-by-blow fight bars — demanding but reachable:
- wave 1: 5+ distinct (of 15)
- wave 2: 5+ distinct (of 15)
- wave 3: 4+ distinct (of 9)
- wave 4: 3+ distinct (of 9)
- wave 5: 2+ distinct (of 8) — The Producers must be faced; the show's immune
  system is the narrative climax before the table
- 3+ contests SURVIVED (player taken and lived)
- scaleRank >= 'national'
- 3+ distinct crises weathered
- kept: sentimentTaught, feastSurgeUsed (food-thesis deeds), stage >= 3
- knowledge NEVER gates (Steve's rule — unchanged)

`recordDeedFight()` now records ALL waves (was wave-3+ only). Feeds unchanged:
real startCombat / recordWaveKill / fieldFight wraps. Arc IV beat copy updated
to name every draft fought.

## Pacing audit (`scripts/sim-wave-pacing-20261010.js`)
Models kill accumulation with the REAL unlock-gate shape and REAL spawn ratios
from game.js (200 runs/seed, kill prob 0.75 for a strong build):

| fight rate | w3 unlock | w4 unlock | w5 unlock | 2+ distinct w5 |
|---|---|---|---|---|
| 0.6/day (aggressive) | day 39 | day 58 | day 77 | day 83 |
| 0.5/day (strong) | day 47 | day 70 | day 93 | day 99 |
| 0.35/day (casual) | day 65 | day 98 | day 129 | day 139 |

A strong run wins ~day 90-115: inside the 80-120 window, no kill-gate changes
needed. The binding constraints are the kill counts (reactive), not the day
floors (day 8 / day 25 were already floors). Casual fighters slip later —
reactive pacing, per Steve's standing rule. National-day assumption (55-75)
barely moves w5 unlock: kills are the long pole, not scale.

## Proof (`scripts/test-deed-gate-20261010.js`, updated in place)
68/68 x 3 seeds (1, 2, 3):
- Feed mechanics: all 19 wave-fight starts (w1-w5) record with correct wave;
  double-tap refusal records nothing; recordWaveKill feeds; wave-1 kill now
  recorded (was excluded).
- Contest classification: won/lost-lived +1; villager/refuse/die/arena-lost +0.
- Scenario A (day-47 winner SHARPENED: 5+5 distinct w1/w2 fought, no w3+):
  reaches Arc III, gate fails on waves, NO tableWaiting.
- Scenario B (breadth 60, no deeds): Arc III, no table.
- Scenario C (powerhouse: all five waves at the bars via real startCombat,
  3 contests, national, 3 crises, sentiment+surge, breadth 15): Arc IV,
  tableWaiting fires, tableScene fires, final choice wins.
- Scenario D: stale tableWaiting withdrawn ALOUD (RESCHEDULE); full deed set
  re-fires the invitation via checkArc.

Regressions: test-wave3-5-20261010.js 211/211 x1 seed; sweep-deedgate (4 seeds
x 150d competent) — see background result below.

## Design calls made (flag for Steve)
1. Per-wave bars (5/5/4/3/2) are my call — demanding but reachable per the
   pacing sim. Tune up/down if the loops say otherwise.
2. w5 bar is 2 distinct, not "face The Finale specifically" — specific-monster
   requirements would be spawn-RNG hostage (55% w5, 8 monsters). The climax is
   "faced the Producers," not one named monster.
3. Kill gates (8 w2 / 5 w3 / 5 w4) UNCHANGED — the pacing sim shows they land
   a strong run at 90-115 days already. Changing them would be tuning without
   evidence.
4. Fleeing a wave-5 fight still counts as "faced" (you stood on the grid) —
   kept from the original design; the bar is breadth of experience, and the
   kill-gated unlocks already prove lethality.
