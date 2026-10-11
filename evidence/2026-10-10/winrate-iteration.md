# Win-rate iteration log (2026-10-10)

Coordinator: win-rate iteration loop. Each round appends one row + notes.
Baseline (pre-iteration, from scripts/sweep-survival-validation-results.json,
60 seeds x 200d winseek): **0/60 wins, median 34d, tier1 40/60, wave3 0/60,
national 0/60, feast 13/60**.

| Iter | Focus | Change | Wins | Med d | Tier1 | Wave3 | National | Feast used |
|---|---|---|---|---|---|---|---|---|
| 0 | baseline | — | 0/60 | 34 | 40/60 | 0/60 | 0/60 | 13/60 |
| 1 | feast-surge regression | dry-burn consumption fix (progression.js: surge spent only by a real feastburn, r>0) + diagnosis | 0/60* | 34* | 40/60* | 0/60* | 0/60* | see notes |
| 2 | policy-competence panel | 4 policies × 60 seeds (competent/progress-r4/winseek/oracle); oracle = winseek + win-probability assessment + arm-up/openers + aid-when-struggling | 0/60 all | 45/46/32/41 | 54/54/37/42 | 1/1/0/0 | 0/60 all | 15% (oracle, honest post-fix) |
| 3 | oracle-v2 systems-engaged | oracle + greedy deep-systems play: in-fight abilities, daily ability practice, traplines, counter-preference targeting, feast-then-fight banking (scripts/policies/oracle-v2.js; scripts only) | 0/60 | 41 | 43/60 | 0/60 | 0/60 | 2% (1/60; oracle's 80% was the assessment burning the surge) |
| 3-rep | oracleV2 independent replication | second implementation (scripts/policies/oracleV2.js): blow-by-blow ability ladder (all held kits), counter probing, traps/crafting, feast-then-fight, quest completion (harness-side only) | 0/60 | 48 | 46/60 | 0/60 | 0/60 | 0/60 (honest) |

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
struck stayed 6. Flee-reason instrumentation (3 seeds x 80d) shows
**fledFilled dominates** (31/53/2 vs bad 1, known 0): once the wave-1 deed
bar (5 distinct) fills, every all-wave-1 fight is fled on turn 1 — no
strike, no consumption, surge stays armed (49 end-armed vs 36). Accelerants:
5f6f06ce (villager field fights now feed wavesFaced, which is what the
flee-once-bar-filled check reads) and the live doAction('wait') day loop
(more villager agency -> more villager fights), on top of longer survival
itself (24 -> 34d -> more encounters per run).

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

## Round 2 notes (2026-10-10, worker winrate-iter) — the competence panel

**Oracle bound: the GAME is the bottleneck — with a caveat.** All four policies won
0/60 (competent, progress-r4, winseek, hand-tuned oracle). Oracle bought +10d median
survival (41 vs 32) and max 109d, but never reached t2, national scale, or the endgame.
Only 2/240 runs survived the 200-day cap at all.

**Caveat:** NO policy used the deep systems — abilities ~0 uses/run, synergy
discoveries <1/run, counter-kill rate 0.0% everywhere, crafts/traps 0 across all 240
runs. The oracle added fight assessment, arm-up openers, and aid-acceptance but never
touched abilities, traps, counters, or synergies. So "game is the bottleneck" is proven
only against policies that fight with basics. Round 3 tests whether a systems-engaged
policy (oracle-v2) changes the verdict. Full panel: evidence/2026-10-10/policy-competence-panel.md.

Other findings: winseek survives WORSE than competent (median 32d vs 45d) — it chases
objectives and dies; competent turtles. ~60% of deaths are combat (player + villager).
"The night" kills 11-18%. Feasts are the only deep system touched (winseek arms 80%,
uses 15%; oracle arms 78%, uses 80%).

## Round 3 notes (2026-10-10, worker winrate-r3)

Built oracle-v2 (scripts/policies/oracle-v2.js): oracle + greedy
in-fight abilities (brace/shake_off/field_medicine/war_cry/loom/haymaker/
take_aim/ambush/rage/dead_aim), daily out-of-combat ability practice for
synergy attempts, traplines when supplies + hunting knowledge exist,
counter-preference targeting, feast-then-fight banking with a no-burn fight
assessment. Measured on the same 60 seeds × 200d
(scripts/winrate-iter3.js → scripts/winrate-iter3-results.json).

Result: **0/60 wins, median 41d** — identical to oracle. Ability uses 2×'d
(2.5/run), 104 practice firings, 24 banked feast patrols, 1 trap set / 2
catches, counter-kills still 0% (mechanic dormant). The 15 runs that
engaged ≥1 deep system survived med 32d vs 42d for the rest. Two instrument
findings: (1) a loom-every-turn stall (24.8k ability uses in one probe run)
fixed with per-fight ability budgets before the measured run; (2) oracle's
80% "feast used" was the fight-start assessment burning 300 banked kcal
(and the armed surge) just to read the multiplier — v2's no-burn
assessment gives the honest rate, ~2%.

Verdict: the game is the bottleneck, confirmed against a policy that plays
the systems. The deep systems change a run's texture, not its destination —
no policy has reached tier 2 / national / the table in 300 combined runs.
Binding constraints are upstream: villages die ~day 41 to combat/the night,
wave-3+ deed bars never fill, scale stalls at regional. Full writeup:
evidence/2026-10-10/winrate-iter3-oracle-v2.md.

### Independent replication (second worker, same worktree)

A second worker independently implemented round 3 as
`scripts/policies/oracleV2.js` (blow-by-blow ability ladder over System AND
background abilities, counter probing, trap/craft roads, feast-then-fight
surge override, aid+system quest completion) with its own sweep
(`scripts/sweep-oraclev2-20261010.js`, same 60 seeds × 200d, same day loop;
`scripts/analyze-oraclev2.js` → `scripts/sweep-oraclev2-results.json`).
Result: **0/60 wins, median 48d, max 116d, t1 46/60, w2 36/60, national+ 0/60**
— convergent with the primary round-3 finding. Utilization: 2.8 ability
uses/run (2.3× round-2 oracle), 4.3 abilities held, 0.52 synergies, surge armed
93% / used 0% (honest), aid quests 2.8 accepted / 0.3 handed in, counter-kills
0.0% (0/399 — verified structural zero: no monster def carries a `counter`
field), crafts/traps 0 (trap recipe knowledge never acquired in 60 runs:
studied villages don't teach trap recipes, no books found). Deed-gate blocker:
**scale 60/60** (regional 60/60, national+ 0/60) despite 81 codex studies and
~7 link proposals per run — the on-ramp (hierarchy.js link-age 21d/trust 60)
is the recommended first lever, then combat death share (~51%). Full writeup:
evidence/2026-10-10/winrate-iter3-oraclev2.md. (Note: this worker briefly
duplicated the round-3 table row; consolidated to the 3-rep row above. The
other worker's `scripts/policies/oracle.js` export change is theirs.)
