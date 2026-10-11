# Wave Ledger — build note 2026-10-10

Steve's order: "It doesn't sound like this will scale for a 100 day game.
But write the system and we can turn the rest of the levers." Build the
system with EXPLICIT TUNABLE LEVERS. Do NOT retune — calibration comes later
via sims.

## Design (settled law)

Wave unlocks run on **KILLS ONLY** — a per-wave, per-village, per-run point
ledger, cumulative across player deaths (lives on `state`, not the scholar;
a new adventurer inherits the village's ledger).

- Kill = `pointsPerKill` (1). Counter-kill = `pointsPerCounterKill` (2,
  mastery bonus) — fires only when `state.monsterCounters[id] === true` AND
  the monster def carries a `counter` field (the convention for the parallel
  signature-mechanics loop; **no monster def has counter data yet — the bonus
  is dormant**; kills never score less than 1).
- Per monster-type cap `perTypeCap` (2) per wave — breadth, not farming.
  The 3rd kill of the same type scores 0.
- Bars `barsPerWave` = {"1":5,"2":5,"3":4,"4":3,"5":2} — point thresholds the
  ledger for wave N must reach to unlock wave N+1. **The pacing dial Steve
  will turn.**
- Day floors: wave 2 needs day >= `wave2DayFloor` (8); waves 3+ need day >=
  `dayFloor` (25). Scale gates unchanged: w4 regional, w5 national.
- The System televises progress: `sysSay` beats at 50% and 100% of each
  wave's bar (idempotent via `state._ledgerAnn50/_ledgerAnnFull`), honest
  copy ("kills only, not near-misses"); one persistent progress line in
  `beatsRowHTML()` ("kills only; counter kills +1" when the bonus is live).

## Reversal of 8730921c (2026-10-10, Steve's call)

The morning's bal-waves engagement lanes are **reversed for unlocks**:
villager wave experiences no longer count toward unlocking waves.
Engagements (faced/fled) score ZERO on the ledger. Villager **kills** still
count — the village is the protagonist, but only through kills.

Untouched: the endgame deed gate (`deedState().wavesFaced`,
`deedGateReady()` — the 5/5/4/3/2 distinct-faced bars, 3+ contests, crises,
national+, etc.). Engagements still feed the deed bars; they just don't
unlock waves. `waveEngaged()`/`waveUnlockEngage()` are kept (engine-unused
for unlocks) so the deed-adjacent helpers/tests don't break.

## Files

- `src/js/waveLedger.js` (new) — self-attaching module (loads after
  progression.js): `waveLedgerCfg()` (reads `this.data.waveLedger` with
  in-code defaults), `ledgerState()` (defensive init on state),
  `monsterCounterKnown()` (the convention), `scoreLedgerKill()` (the scorer,
  fed ONLY by `recordWaveKill`), `waveLedgerPoints()`,
  `ledgerProgressLine()`, idempotent `_ledgerAnnounce()`. @ontology header.
- `src/data/wave-ledger.json` (new) — the levers, one obvious config object.
  Loaded via `Game.init`'s fetch list into `this.data.waveLedger`.
- `src/js/game.js` — `unlockedWave()` rewritten ledger-only (old comment
  block replaced; reversal recorded); `recordWaveKill()` calls
  `scoreLedgerKill()` (the `state.waveKills` increment is KEPT — the harness
  telemetry and debug-scenarios readers use it); `checkWaveUnlockBeat`
  comment updated; `waveEngaged`/`waveUnlockEngage` marked engine-unused.
- `src/js/app.js` — `beatsRowHTML()` gains the persistent ledger line.
- `src/js/debug-scenarios.js` — alienEncounter seeds the ledger (5 w1
  points) instead of `waveKills = {1:4}`.
- `src/js/progression.js` — comment-only fix (the deed feed fires the beat,
  it no longer feeds the gates).
- `index.html` — `src/js/waveLedger.js` after progression.js (new line 58;
  the node harness derives order from index.html automatically).
- `docs/PROGRESSION.md` — section 12 (settled law + every lever with what
  turning it does + the reversal record); supersede notes on item 3.
- `docs/MONSTER-WAVES.md` — wave 3/4/5 headers + Implementation gate
  paragraphs updated to ledger gates; history note on the reversed lanes.

## Levers (pointer: docs/PROGRESSION.md §12)

`pointsPerKill` (kill throughput) · `pointsPerCounterKill` (mastery reward
weight; dormant) · `perTypeCap` (breadth vs farming) · `barsPerWave` (THE
pacing dial) · `dayFloor` / `wave2DayFloor` (calendar floors) ·
`counterBonusEnabled` (per-wave kill-switch for the mastery bonus).

## Proof results (scripts/test-wave-ledger-20261010.js)

31 checks, green × 3 seeds (SEED=1/2/3): kill=1pt; 2nd same-type scores;
3rd scores 0; counter bonus 2 only with counterKnown AND mdef.counter (1
otherwise — never punished); engagements score 0 (startCombat feed =
recordDeedFight, real fieldFight vFlee — and raw fieldFight vKill, whose
CALLERS feed recordWaveKill) while wavesFaced is still fed (endgame feed
untouched); recordWaveKill (villager path) scores; day floor holds (ledger
full at day 10 → no wave 3; day 25 → wave 3); ledger survives scholar swap;
50%/100% announces fire once each with honest copy; UI line honest.

## Regressions

- `test-bal-waves-20261010.js` (gating section rewritten ledger-only): 30/30.
- `test-villager-wave-xp-20261010.js` (§8 rewritten: villager-only KILLS
  unlock; engagements score zero): 20/20 × 3 seeds.
- `test-wave3-5-20261010.js` (gating section rewritten ledger-only):
  214/214.

## Pacing sim (scripts/wave-ledger-pacing-20261010.js — REPORT ONLY)

12 seeds × 60 days, competent policy (same seeds/policy as
villager-wave-pacing-20261010.js). Old-system numbers for comparison
(evidence/2026-10-10/villager-wave-xp.md): player-only 4/12 wave-3 unlocks
by day 60 (days 25–28); villager-inclusive 9/12 (days 25–27).

Results (ledger system):

- **wave-3 unlocks: 0/12 by day 60** (old system: 4/12 player-only,
  9/12 villager-inclusive — all unlocked days 25–27).
- **wave-2 ledger points at cap: 0 in all 12 seeds** (wave-2 kills: 0 in
  all 12). The kill funnel never fills: competent play flees bad fights by
  design (the bal-waves sweep r4 finding: wave-2 kills median 0), and the
  ledger needs 5 wave-2 kills — the bar is unreachable, not just slow.
- Wave-1 ledger reached 5+ in 5/12 seeds → **wave 2 unlocked in 6/12**
  (seeds 1, 2, 4, 10, 11, 12); the other 6 never filled wave 1's bar either.
- All 12 seeds ended "village-lost" at days 21–43 (the competent/greedy-bot
  policy is fragile — same as the old sim's population).

Steve's intuition ("It doesn't sound like this will scale for a 100 day
game") is confirmed by the numbers: the old engagement lanes unlocked wave
3 because ENGAGEMENTS are what reactive play produces; kills are not.
Calibration (bars, per-type cap, points, or a new unlock lane) is an open
lever-turn for a later sim pass — explicitly NOT done here per the brief.
