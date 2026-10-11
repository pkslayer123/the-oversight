# Win-rate iteration log (2026-10-10)

Coordinator: win-rate iteration loop. Each round appends one row + notes.
Baseline (pre-iteration, from scripts/sweep-survival-validation-results.json,
60 seeds x 200d winseek): **0/60 wins, median 34d, tier1 40/60, wave3 0/60,
national 0/60, feast 13/60**.

| Iter | Focus | Change | Wins | Med d | Tier1 | Wave3 | National | Feast used |
|---|---|---|---|---|---|---|---|---|
| 0 | baseline | — | 0/60 | 34 | 40/60 | 0/60 | 0/60 | 13/60 |
| 1 | feast-surge regression | dry-burn consumption fix (progression.js: surge spent only by a real feastburn, r>0) + diagnosis | 0/60* | 34* | 40/60* | 0/60* | 0/60* | see notes |

\* Not re-swept this round (diagnostic round; numbers are the validation
baseline). The fix makes `feastSurgeUsed` honest: it now requires an actual
feastburn (banked >= 300 at a strike while armed). In the winseek policy the
war chest never reaches 300 (see notes), so the honest metric would read
~0/60 — the metric was previously counting dry strikes, not real surges.

## Round 1 notes (2026-10-10, worker winrate-feast)

Verdict: the 35% -> 22% drop is **behavioral, not an arming/consumption bug**.
Arming IMPROVED (end-armed 36/60 -> 49/60; surgeResonance>=35: 40 -> 51;
sentiment taught 45 -> 55) because the rebalance keeps villages alive longer
(median 24 -> 34d) -> more keepsake channels -> devotion lane reached more
often. "Used" = at least one player strike while armed (feastBurn is called
on every strike; the wrap marked feastSurgeUsed unconditionally). Post-
rebalance the policy strikes less after arming: median fled 9 -> 25.5 while
struck stayed 6. Mechanism: longer runs -> more encounters -> wave-1 deed
bar (5 distinct) fills and monsters become known -> the policy's flee-once-
known / flee-once-bar-filled triggers fire on turn 1 -> no strikes -> surge
stays armed (49 end-armed vs 36). Accelerants: 5f6f06ce (villager field
fights now feed wavesFaced, so bars/known-sets fill faster) and the live
doAction('wait') day loop (more villager agency -> more villager fights).

Adjacent genuine bug found and fixed: the surge was consumed (silently, no
narration, no damage) by ANY strike, even with an empty war chest where the
base burn returns 0. `feastSurgeUsed` — an Arc IV deed-gate requirement —
could be earned without any actual surge. Fix: consume only when a real
burn fires (r > 0). Proof: scripts/test-feast-surge-20261010.js Part 1,
9/9 green (2 red before fix). Regressions: test-bal-waves 30/30,
test-pacing 39/39, test-deed-gate 68/68, combat-break-honesty 2/2,
channeling-gap 41/42 (1 pre-existing, identical on pristine), ontology 62/62.

Design consequence for Steve (lever-turn, not taken): a real feastburn
needs banked >= 300, and banked = kcal - 2400*metabolicMult with bankMult=1
unless deep_reserves (x5) or war_chest (x1.5) — the winseek scholar never
banks 300 (16-seed instrumentation: 0 real burns, banked@arm=0 every run).
So the honest surge is currently near-unreachable in this policy; the old
metric was masking that. Levers: lower the 300 threshold, make feasts bank
more, teach the policy to feast-then-fight, or accept the surge as a
late-game engine piece. Full writeup: evidence/2026-10-10/winrate-iter1-feast.md.
