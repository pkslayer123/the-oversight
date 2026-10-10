# Hunter adversarial playtest — 2026-10-10 r2 (run: oversight-playtest-loop, archetype 5)

Fresh angles (this morning's run covered trap yield stacking, population
double-spend, travel continuity, edge-bolt exit, box-trap rattlesnake,
dress_game refusals, net yield, cleanShotReady, pit-trapline EV).

## Attacks attempted (hostile player)
- **E13 EXPLOIT — active fishing ignores ecology**: BROKE. `Game.fish()` paid a
  flat 500–900 kcal (known) / 150–350 (blind) ×1.3 from a fake `{id:'fish'}`
  animal — no population check, no decrement. 200 casts on a FISHLESS creek:
  **154 catches, 143,172 kcal conjured from empty water.** Same bug class as
  the gill-net print fixed 2026-10-09; the 2026-10-08 ecology fixes fixed
  traps/nets/encounters but missed the active action. FIXED (see below).
- **E13b — per-catch honesty**: BROKE pre-fix. maxGross 1165 (honest max:
  200-chub kcal × 1.3 line = 260), generic "fish" names, zero stock
  decrements. Post-fix: gross ≤ 260, real species names, exactly 1 stock
  decrement per catch. FIXED.
- **E14 SOFTLOCK — chase to winded at grid edge**: HELD. Rabbit bolted to the
  edge, went winded; walking up and striking resolves the encounter, no
  throw, no phantom. (First draft of this probe looked like a phantom —
  the harness never walked the player adjacent. Real play resolves.)
- **E15 HONESTY — pond "Small fish, maybe"**: BROKE pre-fix. Pond paid 896
  avg vs creek 917 — the copy promised small fish, the engine paid creek
  fish. Post-fix: pond = 0.6× chance and yield (137 avg vs 220). FIXED.
- **E16 HONESTY — fish() without tackle**: HELD. Honest refusal, no cost.

## The break (E13/E13b/E15) and the fix
- **Break**: `fish()` in src/js/game.js conjured kcal from thin air — flat
  yields up to 6× a bluegill's real 150 kcal, from water with zero fish,
  while the gill net on the same tile honestly reported "fished out."
- **Fix** (src/js/game.js, `fish()`): the hand line now fishes the tile's
  real stock — creek_chub/bluegill via the same FISH_IDS + backfill as
  checkNets (ponds backfilled as creek). One fish per catch, species-honest
  kcal (species × 1.3 tackle bonus), stock decrements, `encIdentifyAnimal`
  on catch (body-in-hand teaching, like traps/nets). Fishless water: honest
  "fished out" line, no carcass, still costs the 32 ticks + 60 kcal. Still
  water: 0.6× chance and yield — the "Small fish, maybe" copy is now true.
  Tool gate, knowledge-gated chance, blind fishWise teaching, tele, and the
  carcass-not-food reality all unchanged.
- **Proof**: scripts/test-hunter-activefishing-20261010.js — E13/E13b/E15
  FAIL pre-fix (143k conjured kcal, 1165 gross, pond==creek), ALL GREEN
  post-fix × 3 seeds (20261010, 7, 99).
- **Build note**: prepended pending-ship entry to src/data/build-notes.json
  (player-facing; fishing yields are player-visible).

## Regressions
- attack-hunter-20261010.js (morning suite): ALL GREEN.
- test-hunter-ecology-20261008.js: 20/20.
- test-hunter-net-print-20261009.js: 2 failures — VERIFIED PRE-EXISTING on
  pristine HEAD (identical with the fix stashed; net-path, untouched).

## Test-harness notes (for future runs)
- Long cast loops advance days: the world keeps living. An early draft of
  this probe watched its fisherman die of thirst on day 7 and mistook the
  mantle-passing inventory wipe for a silent theft bug. sustain() (kcal,
  health, hydration, water, re-grant line) each cast.
- A fishing line CAN vanish mid-run via playerDeath mantle-passing — not a
  bug; re-grant in the probe.

## Fun notes
- The winded chase beat works: rabbit blows itself out at the treeline,
  pants, you walk up. Catchable-but-doomed, not stuck.
- Active fishing is now a real foraging decision: ~220 kcal/catch on a good
  creek, depleting — worth the 32 ticks while the stock lasts, then move
  on. The printer is dead; the pastime survives.
