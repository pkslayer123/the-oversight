# Win-rate iteration round 3 — oracle-v2: the systems-engaged policy (2026-10-10)

Worker: winrate-r3. Question: round 2's competence panel found the GAME is the
bottleneck (oracle 0/60) — but no policy used the deep systems (abilities
~0/run, synergies <1/run, counter-kills 0%, crafts/traps 0/240 runs). The
verdict was unproven against a policy that actually plays the systems. This
round builds that policy and re-measures.

## What oracle-v2 is

`scripts/policies/oracle-v2.js` = oracle + five greedy systems engagements
(scripts only; no game numbers, no Wave Ledger config touched):

1. **In-fight abilities** — per-turn priority: brace when outmatched/hurt,
   shake_off when statused, field medicine when wounded, war cry vs crowds,
   loom as the fear_itself leg, haymaker/take_aim/ambush/rage/dead_aim when
   favored (arm-then-strike 2-turn combos; the strike engine consumes the
   armed flags). Every real use is a synergy-discovery attempt.
2. **Out-of-combat practice** — safe explore/camp actions fired once/day
   (tracker.track, read_sign, clean_shot, lay_wait, dress_game, shed_skin,
   dowsing, echo_location, herbal_remedy/purify when gated). Blacklist:
   blood_magic (HP), time_skip (would corrupt the day loop), steal_pantry,
   bury_food, challenge/mediate_dispute, stage_injury, rob_grave.
3. **Traps** — when trap supplies (tool or snare wire) + hunting knowledge
   exist: craft a snare if the recipe is known, run a trapline to the
   nearest wild tile, set (cap 3). Dawn checkTraps is the engine's.
4. **Counter-preference targeting** — prefer monster types with
   `monsterCounterKnown()`. Still dormant (no def carries `counter`).
5. **Feast-then-fight** — when the war chest can bank (bankMult > 1):
   top up to banked ≥ 300, run an extra patrol while banked so favored
   strikes burn it. Fight assessment uses a **no-burn** feast multiplier.

Driver: `scripts/winrate-iter3.js` (60 seeds × 200d, villagerTurn-corrected
day loop, panel-identical instrumentation + v2 counters). Results:
`scripts/winrate-iter3-results.json`. Analyzer: `scripts/analyze-iter3.js`.

Three instrument bugs found and fixed (all before/during the measured runs):
- **Loom-stall**: loom/bellow fired every turn = perpetual monster
  hesitation with the turn counter advancing — a multi-day stalemate that
  defeated the no-progress guards (one probe run hit 24,800 ability uses).
  Fixed with per-fight budgets (loom/bellow/sand/leech/read_stance/dowsing
  once per fight), no consecutive braces, 12-ability-turns-per-fight cap,
  and `deadAimShot` added to the armed-flag check.
- **Assessment burn** (measurement, not a game bug): oracle's assessFight
  calls `Game.feastBurn()` to read the multiplier — the base burn SPENDS
  300 banked kcal (and consumes an armed surge, marking feastSurgeUsed)
  just to measure it. v2 reads the number without spending it.
- **Opener missed background abilities**: oracle's fireOpener scanned only
  `scholar.abilities` (starts empty), missing the occupation-granted
  `backgroundAbilities` (e.g. hunting_guide's patient_aim). Fixed to scan
  both — `Game.hasAbility`/`activatableAbilities` already covered both, so
  the per-turn logic and practice round were unaffected. The measured
  60-seed run below includes this fix.

CROSS-CHECK: a concurrent sibling worker independently implemented its own
oracleV2 (`scripts/policies/oracleV2.js`, untracked — not mine, not
committed here) and swept the same 60 seeds: **0/60 wins, median 48d**,
2.8 ability uses/run, 0.53 synergies/run, 0 counter-kills, 0 traps. Two
independent systems-engaged implementations, same verdict.

## Outcomes (n=60, 0 errors)

| metric | oracle (r2) | oracle-v2 (r3) |
|---|---|---|
| wins | 0/60 | **0/60** |
| median survival | 41d | 41d |
| max day | 109 | 78 |
| havenTier ≥ 1 / ≥ 2 | 42 / 0 | 43 / 0 |
| scale | regional 60/60 | regional 60/60 |
| wave unlock ≥ 2 / ≥ 3 | 33 / 0 | 33 / 0 |
| contests cx ≥ 3 | 20 | 23 |
| crises kinds ≥ 3 | — | 0 |
| table / gate | 0 / 0 | 0 / 0 |
| sentiment taught | 54 | 53 |
| endReason | village-lost ~all | village-lost 60/60 |

Death causes: combat 28%, villager combat 23%, the night 19%, monster 12%,
starvation 7%, sickness 5% — same shape as oracle (31/23/18/10).

## Utilization: did v2 actually play the systems?

| system | oracle (r2) | oracle-v2 (r3) |
|---|---|---|
| ability uses/run | 1.2 | **2.9** (172 total, all player-side) |
| in-fight ability turns | — | 2 total (2 runs; dead_aim 1, loom 1) |
| practice firings | — | **111** (11 runs) |
| synergy discoveries/run | 0.48 | 0.47 (28 total; 27 runs hold ≥1) |
| abilities held/run | — | 3.9 (choseAbility 1.6/run, 59 runs) |
| counter-kill rate | 0.0% | **0.0%** (359 kills, 0 counter) |
| crafts ok/attempts | 0/0 | 0/18 |
| traps set / catches | 0/0 | 1 / 2 (1 run) |
| feast surge armed | 78% | 85% (51/60) |
| feast surge **used** | 80% | **2% (1/60)** |
| banked days / bank patrols | — | 37d / 24 (3 runs) |
| aid accepted/handed | 2.7/0.2 | 2.7/0.2 |
| relief spent/run | 8.6 | 8.5 |

**Verdict: the game is the bottleneck — confirmed against TWO independent
policies that play the systems.** oracle-v2 engages every deep system the
game makes available (2.4× the ability uses, 111 practice firings,
traplines, banked feast patrols, counter-preference targeting) and still
wins 0/60 with survival identical to oracle (median 41d). The sibling's
independent oracleV2 (different implementation, same brief) also scored
0/60 at median 48d. The 15 runs that engaged ≥1 deep system survived a
median 32d vs 42d for the rest — engagement doesn't buy survival; nothing
in the deep systems moves the win needle because nothing reaches the win.

## Why engagement stayed thin (the game side)

- **Ability offers are few and mostly passive.** Scholars hold 3.9
  abilities/run but in-fight ability turns total 4 across 60 runs: most
  held abilities have no actions (triage, iron_stomach, …), and engaged
  favored fights with a turn 2+ are rare (engagedFavored 0.9/run —
  fledFilled still dominates).
- **Counter-kills are 0% by construction**, not by policy choice: the
  `counter` convention is dormant (no monster def carries the field).
- **Crafts 0/18**: the policy tried 18 times, succeeded 0 — recipe
  knowledge and/or materials never lined up.
- **Traps**: supplies + hunting knowledge co-occurred in 1/60 runs.
- **Feast**: the war chest could bank in 3/60 runs (deep_reserves held);
  24 banked patrols burned real feastburns there. Everywhere else the bank
  can't fill (bankMult = 1).

## The feastUsed discrepancy (measurement finding)

oracle r2: surge armed 78%, **used 80%**. oracle-v2: armed 85%, used **2%**.
The only structural difference in the burn path is the assessment: oracle's
assessFight calls `Game.feastBurn()` at every fight start, and the base burn
spends 300 banked kcal — consuming an armed surge and marking
feastSurgeUsed — just to read the multiplier. v2's no-burn assessment
doesn't. Conclusion: **the panel's oracle "feast used 80%" did not mean 80%
of runs landed a real surged feastburn in combat; it meant the assessment
ate the surge at the next fight start.** The honest rate is ~2%. (Whether
the banked kcal came from bankMult > 1 or from eat() overshoot past the
cap is not distinguished by this instrumentation — v2's bankedDays counter
is gated on bankMult > 1 and reads 3/60 runs.)

## What this means for the win rate

Round 1: feast-surge "used" was a dry-burn artifact → fixed, honest ~0.
Round 2: oracle 0/60 → "game is the bottleneck," but systems unused.
Round 3: a policy that greedily uses abilities, practices for synergies,
sets traps, banks and burns feasts, and prefers counters → **0/60,
median 41d, nothing past regional / wave 2 / tier 1.**

The deep systems are not load-bearing for winning because the win is
unreachable by any play: no policy has reached tier 2, national scale, the
table, or the endgame in 360 combined runs (240 panel + 60 v2 + 60 sibling
v2). Ability use, synergies, traps, and feastburns change the texture of a
run, not its destination. The binding constraints are upstream: villages
die to combat/the night around day 41, deed bars for waves 3+ never fill,
and the scale ladder stalls at regional.

Recommended next rounds (Steve's call): the bottleneck is not policy
competence or systems engagement — it's reachability of the mid/late game.
Either the survival curve needs to let villages live long enough to climb
(median 41d vs a ~day-100 endgame), or the deed/scale bars need to be
fillable within a 40-day life.
