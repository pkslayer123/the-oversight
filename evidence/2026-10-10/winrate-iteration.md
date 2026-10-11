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
| 3 | oracle-v2 systems-engaged | oracle + greedy deep-systems play: in-fight abilities, daily ability practice, traplines, counter-preference targeting, feast-then-fight banking (scripts/policies/oracle-v2.js; scripts only); 200d cap | 0/60 | 41 | 43/60 | 0/60 | 0/60 | 2% (1/60; oracle's 80% was the assessment burning the surge) |
| 3-rep | oracleV2 independent replication | second implementation (scripts/policies/oracleV2.js): blow-by-blow ability ladder (all held kits), counter probing, traps/crafting, feast-then-fight, quest completion (harness-side only); 200d cap | 0/60 | 48 | 46/60 | 0/60 | 0/60 | 0/60 (honest) |
| 4b | scale on-ramp: winseek + oracle-v2 measurement | unified driver scripts/winrate-iter4.js (day loop verbatim from iter3) + vest-event tracker; 120 runs × 120d cap per Steve's protocol; exploit audit (deed-priced trust, boundary proof green ×3) | 0/60 winseek, 0/60 oracle-v2 (0/120) | 32 / 41 | 36/60 / 44/60 | 0/60 both | 0/60 both | 0/60 winseek, 2/60 oracle-v2 |
| 4 | scale on-ramp tune | BELONG bar in hierarchy.js `polityOf()`: trust ≥60→50, link age 21d→14d (arrears-0 + realm-4 kept; other roads + Wave Ledger untouched); oracleV2, 60 seeds 1–60 × **120d cap** (DAY-CAP PROTOCOL) | 0/60 | 50 | 47/60 | 0/60 | 0/60 | 0/60 |

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

Result: **0/60 wins, median 41d** — identical to oracle. Ability uses 2.4×
(2.9/run), 111 practice firings, 24 banked feast patrols, 1 trap set / 2
catches, counter-kills still 0% (mechanic dormant). The 15 runs that
engaged ≥1 deep system survived med 32d vs 42d for the rest. Three
instrument findings: (1) a loom-every-turn stall (24.8k ability uses in one
probe run) fixed with per-fight ability budgets before the measured run;
(2) oracle's 80% "feast used" was the fight-start assessment burning 300
banked kcal (and the armed surge) just to read the multiplier — v2's
no-burn assessment gives the honest rate, ~2%; (3) the opener missed
backgroundAbilities (occupation-granted); fixed to scan both lists.

Cross-check: a concurrent sibling worker independently implemented its own
oracleV2 and swept the same 60 seeds: also **0/60, median 48d**. Two
independent systems-engaged implementations, same verdict.

Verdict: the game is the bottleneck, confirmed against policies that play
the systems. The deep systems change a run's texture, not its destination —
no policy has reached tier 2 / national / the table in 360 combined runs.
Binding constraints are upstream: villages die ~day 41 to combat/the night,
wave-3+ deed bars never fill, scale stalls at regional. Full writeup:
evidence/2026-10-10/winrate-iter3-oracle-v2.md.

NOTE: untracked sibling files (scripts/policies/oracleV2.js,
scripts/sweep-oraclev2-*.js/json) were written into this worktree by the
concurrent worker — not committed here, left for their owner.

## Round 4 notes (2026-10-10, worker winrate-r4) — scale on-ramp tune

**The on-ramp did NOT move: 0/60 wins, 0/60 national, 0/60 table** (oracleV2,
same 60 seeds, 120d cap per the DAY-CAP PROTOCOL). Median survival 50d,
tier1 47/60, wave2 35/60, wave3 0/60, regional 60/60 — no national by any of
the six roads (nationalShape 0/60, nationalAnswered 0/60), endReason
village-lost 60/60.

The change: BELONG good-standing bar in `hierarchy.js` `polityOf()` —
trust ≥60 → **50**, link age 21d → **14d**. Arrears-0 and the 4-village realm
requirement kept (the "earned" parts); other five roads and Wave Ledger bars
untouched. Design call (figure-it-out-yourself, Steve can overrule): 14 days
is still two weeks of upkeep/tribute/deeds — a real waiting cost, not a
day-trip — and trust 50 is +20 above the fresh-link 30, so courting still
earns it.

A 60-seed daily vesting probe shows the tuned bar IS reachable but vesting
never happened: 7/60 runs reached trust ≥50 on a subordinate link, 12/60 had
a link aged ≥14d, arrears ≈ never blocked — but **foreign realms never
reached 4 fires (0/60)**, so `_belongPolity()` vested 0/60 days. The
constraint moved one layer deeper: the bar's precondition. The foreign sim's
math: one action/week at 30%/wk → pair at ~3.3 wk, then ~5.1 wk/grow × 2
grows ≈ **95 days to a 4-realm vs median run life 50d** (the code comment
claimed ~2 months — it is really ~3). Worse, Haven's own diplomacy starves
the sim: linked villages are excluded from its candidate pool, and the
policy proposes ~7 links/run. LEAD is policy-unreachable too (oracleV2 never
forms Haven-primary links: max 0/12 probed). Combat remains the upstream tax:
53% of 605 deaths (player combat 184 + villager combat 136 + the night 113).

Exploit check: no degenerate path — fresh links still start at trust 30
(+20 via deeds), arrears still block, the realm-4 gate held 60/60 (it is
what blocked every run). Proof test scripts/test-scale-onramp-20261010.js:
vests at exactly 14d/trust 50, NOT at 13d / trust 49 / arrears>0 / 3-fire
realm; green ×3 seeds (11, 222, 3333). Regressions: test-scale-ladder-20261010
ALL GREEN; test-hierarchy.js 40 passed + 2 pre-existing fails (identical on
pristine HEAD — tribute engine); test-hierarchy-20261007.js pre-existing
harness error (identical on pristine HEAD).

Recommended round-5 lever (design decision, not taken): the foreign-realm
cadence, not the BELONG bar — e.g. faster pair formation, grows off the pair,
or letting Haven-linked villages stay in the sim's candidacy. Canon-adjacent
(Steve: "take seasons"; SCALE.md documents ~day-80 reachability), so it needs
his call. Second: combat death share (~53%). Full writeup:
evidence/2026-10-10/winrate-iter4-scale.md.

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

### Independent replication + deeper diagnosis (second worker, same worktree) — winseek + oracle-v2 measurement

Change: BELONG bar 21d/60 → 14d/50 (hierarchy.js `polityOf` gate only;
arrears-0 + 4-village realm kept; `kingdomEndingEligible` 70/21 untouched;
six roads' structure, regional, and wave-ledger untouched). Measurement: unified driver `scripts/winrate-iter4.js` (POLICY=winseek /
oracle-v2; day loop + utilization verbatim from iter3; adds vest-event
tracking + winDay + binding-blocker decomposition), 60 seeds × 120d,
`Game.doAction('wait')` per part. Analyzer `scripts/analyze-iter4.js`.
**Result: 0/120 wins, 0/120 national+** (winseek: 0/60, med 32d, max 73d;
oracle-v2: 0/60, med 41d, max 78d; binding blocker `scale` 120/120; vest
events 0). Sibling oracleV2 replication on the same tuned code: 0/60, med
50d, 60/60 regional (their files, not committed here).

Diagnosis (one level deeper): the bar is no longer binding — **link
fragility is**. Probe `scripts/probe-linkstates-20261010.js` re-ran the 8
winseek runs that held links: subordinate links form at trust 30 and
**58/58 broken links broke via 'succession'** — the catch-up sim kills the
other village's designated speaker regularly; each death is trust −15 and
snaps any link under trust 20 (`theirLeaderDied` → `successionCrisis`). A
fresh link dies on the first speaker death (30−15=15 < 20). Reaching trust 50
needs ~7 weeks of perfect tribute with no deaths — structurally
near-impossible. Observed lifecycle: form → snap → re-form churn. Even a
met realm-4 (seed 55, village_3) didn't vest — succession killed the links
first. Recommended round-5 lever: the succession snap mechanics, not the bar.
Full writeup: evidence/2026-10-10/winrate-iter4-scale-onramp.md.

Process notes: (1) inline `VAR="1-60"` env prefixes get mangled by
backgrounded exec (literal quotes preserved → NaN seed → 1-row sweep); use
the tool's `env` parameter for background runs and always verify the
driver's seed-count header before a long sweep. (2) `muse.write` content is
literal — a `\\d` regex in the write body lands as double-backslash in the
file and never matches; write `\d`. (3) A concurrent sibling worker shares
this worktree (their `scripts/sweep-r4-scale-*` files are untracked and NOT
committed here — left for their owner).
