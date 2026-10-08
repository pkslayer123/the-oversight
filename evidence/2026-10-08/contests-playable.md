# Contests: played, not RNG (Steve 2026-10-08)

Steve's law: "No, contests are to be played, not as RNG."

## What was wrong (verified before fix)

`_contestVerdict` (watch mode) and `_contestResolveOthers` (villagers taken
alongside the player) rolled every contestant's fate from flat risk-tier
tables: die {low:0, medium:0.03, high:0.10, extreme:0.20}, win
{low:0.70, medium:0.55, high:0.40, extreme:0.25}. Contestant stats never
entered. A 60-bravery spear-fighter and a trembling 15-year-old had identical
odds. Casting was uniform-random (notability computed and ignored).
Scheduling was a flat 30%/day.

## What changed

### 1. contestEngine.js (new) — real off-screen resolution for villager contestants

`contestResolveVillager(pid, contest, opts)` → `{outcome:'won'|'lost'|'died', detail, log[]}`.
Every category resolves through a real process with the contestant's real
stats. Never a single outcome table.

**Blood** — real fights:
- `pit`: `fieldFight()` vs a System-matched beast (HP closest to the
  villager's — the System wants a fair fight for ratings). vKill/mFlee → won;
  vFlee/standoff → lost; vDie → died. Wounds applied via hurtVillager.
- `gauntlet`/`siege`: 3 waves, escalating beasts; wounds persist between waves
  (read from state.village.health each round). Death ends it.
- `duel`: new `duelFight(a,b)` — villager-vs-villager, same round structure
  as fieldFight (tactical strike formula both sides, morale breaks). "To the
  yield, not the death": hitting 0 = yield (lost) unless massive overkill
  (one blow ≥ 60% maxHp) → died ("accidents happen").
- `tithe`/`price`: the altar demands measures (10% maxHp each; high:4,
  extreme:6). They give what they can while staying above 1 HP. Met → won.
  Short → lost ("found wanting"). Bold + extreme: they give until collapse →
  died ("it kept the rest"). Temperament + demand, never a roll.

**Moot** — social rounds, real social stats:
- `caseScore(pid)` = notability×2 + trust/10 + bravery/10 + temperament
  (bold/earnest +2, anxious/cautious −1, prickly/intense/mischievous +1).
- p1 (`moot`,`oath`,`quiet`): vs demand {low:6, medium:9, high:12,
  extreme:15}. ≥demand → won; ≥60% → lost; below → died on high/extreme
  (the binding takes its due), else lost.
- p2 (`lies`): head-to-head, higher case wins; tiebreaks: trust, then
  notability (the System prefers the famous — documented).

**Endurance** — honest ordeals, costs paid from real reserves:
- `starve` (p4): 3 days × 15 health. Most days survived wins; ties → bravery.
- `drop` (p3): 3 legs; speed = 1 + survival/25; 10 health/leg; collapse <20 →
  lost. Fastest finisher wins.
- `maw` (p1): 5 stages; nerve (bravery) vs escalating demand (8+i×4);
  holding costs half the demand. 3 pauses → died ("it counts your pauses").
- `vigil` (p1): 4 watches; fear 10+i×8 vs bravery (wears −5/watch).
  Abandon → lost; bravery 0 → died.
- `exchange` (p3): team relay vs 3 generated rival villagers; most leg-wins
  takes it; losers each tithe 15 health.

**Other categories** — stat-driven, documented honestly:
- Forage: yield = tracking + survival (+knowledge where it exists); highest wins.
- Detective: tracking + trust/5 vs risk difficulty.
- Puzzle: clever potential (15) + survival/2 + tracking/2 vs difficulty.
- Weird: cookfight/impress → survival/2 + showmanship; hide → 3 evasion
  rounds vs a wave-2 seeker using fieldFight's real awareness formula, caught
  → real fight; beastmaster → fieldFight where mFlee = won (dominance);
  guest/fetch → trust/temperament or speed.
- Chance: rigged theater, documented. The System is a TV producer: ratings
  declining → the famous win; ratings rising → dark horse wins; flat →
  highest trust. Deterministic from real state, never a fair lottery (there
  are no fair lotteries on television). Auction: everyone bids min(hp−20,
  10+bravery/2+nota×3); highest wins and pays; all pay half (everyone pays).

### 2. Rewired verdicts (contests.js)

- `_contestVerdict`: per-participant rolls deleted. Each contestant resolves
  via `contestResolveVillager`. Kept: cheer (now a real modifier — steadies
  the arm in blood, lifts the case in moot, capped as before), bet payout,
  comfort, alien-player interference hooks, gossip, notability, kill path,
  drama beats, verdict UI.
- `_contestResolveOthers`: same replacement. "While you fought your fight,
  they fought theirs" is now true.

### 3. Selection — the System wants ratings (fireContest)

Picks after the first are notability-weighted (weight = 1 + notes×2), not
uniform. Player-first 90% kept (the System is interested in you). The 10%
whim stays as the documented dark-horse path — uniform random, announced as
"The System's whim." When the weighted picks are all notable, it's said out
loud: the System wants its stars.

### 4. Scheduling — ratings and drama (contestTick)

30%/day → driven: base 0.25; viewership declining week-over-week +0.15 (the
System gets desperate); ratings high and rising −0.10 (it coasts); recent
death or fracture +0.10 (it smells a story). Clamped 0.05–0.60. Budget
2/week kept. Contest-vs-show ratio shifts to 75% contests when ratings dip
(bigger TV for bad numbers). Countdown dread, unavoidability, recast —
untouched.

### 5. Player Blood → the real tactical fight

Blood contests where the player is taken (`pit`, `gauntlet`, `siege`) now
send the player into a REAL tb combat:
- The "choose your weapon" phase grants a REAL arena weapon (a real item,
  equipped; yours to keep — the System doesn't reclaim props).
- Choosing to fight: the contest modal suspends (`arenaSuspended`, app.js
  render gate), `state.arenaContest` records the waves, `startCombat(beast)`
  runs the real grid fight — your stats, your equipment, the beast's real
  behaviors.
- `tbEnd` resumes: won → next wave or contest WIN; lost → death already
  processed by tbEnd→playerDeath, contest closes as a death; fled/routed →
  contest LOSE with the shame said out loud.
- `duel` (player vs villager — tb has no villager-enemies) and `tithe`
  (a bleeding ritual, not a fight) keep their phase engines. Documented.

## Design calls (Steve can overrule)

1. fieldFight gained `opts.braveryBonus` (cheer steadies the arm). Minimal
   touch to fieldFights.js.
2. System matchmaking for pit beasts (HP-matched) — fair fights rate better.
3. Chance contests are rigged by design — documented in code and here.
4. Deterministic stat comparison for off-screen villagers (no hidden rolls):
   the same villager in the same contest gets the same fate. The player can't
   see the stats anyway (knowledge-gating); what matters is that the process
   is real.
5. Watch-mode cheer is now a real performance modifier, not win-odds.

## Proofs — scripts/test-contests-playable-20261008.js

- Verify-before: old `_contestVerdict` (from git HEAD) run 200× on a strong
  vs a weak villager — outcome distributions statistically identical
  (stats don't matter). New engine: strong beats weak relentlessly.
- Blood: villager pit = real fieldFight (rounds>0, wounds applied, gossip
  sentence describes the real fight).
- Duel: 60-bravery vs 10-bravery over 100 duels — stronger wins the
  overwhelming majority; no table.
- Moot: high-trust/notable beats unknown.
- Selection: 100 castings — notable picked ~3× more often; whim still fires.
- Scheduling: budget respected; declining ratings raise the rate.
- Arena: `_contestArenaAfter` outcomes (won→WIN/next wave, lost→death close,
  fled→LOSE); tbEnd hook wired (code).
- Regressions: existing contest suites (list) green.

## LANDED (2026-10-08, this worktree)

Everything above is built, proven, and committed. What changed since the design:

### Player Blood: arena fights are real

pit/gauntlet/siege now route through `_contestArena`:
- Weapon choice grants a REAL item (hunting_spear/stone_knife), equipped, kept.
- "Enter the pit" suspends the modal (`arenaSuspended`), `startCombat(beast)`.
- `tbEnd` hook → `_contestArenaAfter`: won→next wave/WIN, lost→death close
  (no double-kill), fled→LOSE+shame.
- Gauntlet/siege chain 3 waves; health carries (no rest).

**Duel/tithe stay phase-engine** (documented): tb has no villager enemies;
synthetic monsters would fight with monster AI (dishonest). Tithe is a ritual.

### Player Moot: rhetorical standing

Climax no longer hardcodes WIN/LOSE. Base = trust/10 + notability×2; choices
grant `sway` (+1 to +5, -3 for walking out); `MOOT_JUDGE` vs demand
(8/12/16/20 by risk). Deterministic.

### Player Maw: pursuit

`die:` rolls gone. Distance 3; sprint +1, steady 0, slow -1, rest -2.
Distance 0 = caught = death. `MAW_JUDGE`: still ahead = walk out.

### All 50 `die:` rolls removed

Flat death chances gone from every phase. Where `dmg` existed, `die:` was
redundant (lethal damage already kills via `_contestDie`). Where `die:` stood
alone, replaced with honest consequences (trauma, damage, shame). The
`dieWounds`/Gauntlet-closer mechanic is dead (`_contestCloserOdds` removed).
The benevolent lifeline now guards the real killing blow.

### Selection & scheduling (as designed)

Notability-weighted casting (1+notes×2, 10% whim). Ratings-driven scheduling
(0.25 base, +0.15 declining, -0.10 high/rising, +0.10 death/fracture,
clamp 0.05–0.60, 2/week budget).

### Proof results

`scripts/test-contests-playable-20261008.js`: **29 passed, 0 failed**
- Verify-before: strong 37.0% win / 10.0% die vs weak 37.5% / 9.1% (identical).
- Player pit end-to-end: spear granted → arena → fight → WIN.
- Villager duel: strong beats weak 6-0 over 20 runs (real mechanics).
- Selection: 85/100 famous picked.
- Scheduling: 61/200 fired, budget blocks.
- Moot deterministic; Maw: 3 pauses = caught.

**Regressions green:**
- test-contest-beats-20261008.js: 1117 passed
- test-contest-play-20261008.js: 550 passed
- test-contest-fear-20261008.js: 19 passed
- test-contest-newstyles-20261006.js: 53 passed

**Ontology:** 50 systems validated. Release permitted.

### Files

- `src/js/contestEngine.js` (new)
- `src/js/contests.js` (verdict, selection, scheduling, arena, moot, maw, die: removal)
- `src/js/fieldFights.js` (braveryBonus)
- `src/js/game.js` (tbEnd arena hook)
- `src/js/app.js` (arenaSuspended gate)
- `index.html` (script tag)
- `scripts/test-contests-playable-20261008.js` (new)
- 3 existing test scripts updated for arena/judged flows
