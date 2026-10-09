# Break-it: travel & map, round 6 (2026-10-09)

Hostile-player attack on the travel & map system, round 6. Rounds 1–5 closed
travel-spam, fog render leaks, codex MAPS gating, mid-combat engine guards,
pit-death, cost-label lies, the teleport audit, examine farming, post-death
examine, and phantom monster aliases. This round attacked the remaining
surface: post-death movement (the round-5 examineCell fix's missed siblings),
committed-walk billing honesty, haven detail-regen determinism,
monster-continuity anti-farm, and a dead-code re-sweep.

Canon: no TRAVEL.md / MAP.md / EXPLORATION.md exists in docs/ (stated, not
invented). Travel canon was read from docs/TIME-ECONOMY.md (node travel is
free; TRAVEL_TICKS deprecated), docs/DESIGN.md (adjacent-node travel = 1 AP
major action), and the in-code design comments. Worktree: `break-travel`.

Verdict: **BROKE + FIXED — 2 real breaks** (1 post-death movement class
across 6 functions, 1 prepaid-walk billing lie). Haven regen, monster
continuity, tryNodeExit refusal, and the dead-code sweep HELD.

## BREAK 1 — SOFTLOCK/HONESTY: the corpse walks (6 functions, FIXED)

**Attack:** round 5 fixed `examineCell` with an `if (this.over) return null`
guard (travelTo's precedent) but the sibling sweep missed every movement
function. Hostile engine-level calls with `Game.over = true`:
- `beginPathWalk` — started a walk AND charged the full path kcal
- `pathStep` — stepped, advanced `dayTicks` (world ticks for a corpse)
- `microMove` — stepped, charged 2 kcal, advanced the world
- `_cellInteract` — ran monsterTurn + animalTurn + villagerTurn for a corpse
- `exitBuilding` / `enterBuilding` — repositioned the corpse through doors,
  flipping `insideHaven`

**Measured (pre-fix, seeded):** all 9 hostile assertions demonstrated the
break (walk started, kcal charged, steps landed, world turns ran, doors moved
the body).

**Fix (`game.js`):** `if (this.over) return null/false` at the top of all six
— same one-liner class as the round-5 examineCell fix. `exitBuilding` keeps
its mid-combat door-flee path (combat ≠ dead); the guard only blocks corpses.

**Proof:** `scripts/test-travel-r6.js` T1 — BEFORE: 9/9 breaks demonstrated;
AFTER: 14/14 refusals (no charge, no movement, no world ticks, no state
change). ×3 seeds.

## BREAK 2 — HONESTY: prepaid walks billed squares never walked (FIXED)

**Attack:** `beginPathWalk` charged the FULL path kcal up front ("Walking 8
squares (80 kcal)…"). Combat starting mid-walk — `monsterTurn` inside
`pathStep` can `startCombat` — makes the next `pathStep` refuse (guard
exists), the UI purges the rest, and the kcal for untraveled squares was
forfeited. The label promised N squares for C kcal; an interrupted walk paid
for squares it never walked.

**Measured (pre-fix, seeded):** 8-square walk, combat forced after 2 landed
steps → 60 kcal lost for 6 unwalked squares.

**Fix (`game.js`):**
- New `walkStepKcal()` — the honest price of ONE square (10, with
  `travel.cost_mult` applied).
- `walkCost(n)` is now exactly `n * walkStepKcal()` — the "Walk here"
  quote and the sum of step charges agree by construction, even under
  fractional mults (the old `Math.max(n, round(n*10*mult))` form disagreed
  with the per-step sum at 0.85/0.92: ±2–4 kcal on 8 squares).
- `beginPathWalk` validates affordability + announces the quote, charges
  nothing. `pathStep` levies `walkStepKcal()` per LANDED square.
- Ontology header updated (`walkStepKcal` added, two new rules:
  `dead_dont_move`, `walk_bills_landed_squares`); validator 50/50 green.

**Design call (Steve-overridable):** the walk now bills as-you-go instead of
prepaid. A walk interrupted by combat bills exactly the squares landed.

**Proof:** `scripts/test-travel-r6.js` T2 — BEFORE: full charge up front,
interruption forfeits; AFTER: 0 up front, 2 landed steps bill exactly
2×stepCost, `walkCost(n) === n*walkStepKcal()`. ×3 seeds.

**Test-contract updates (same run, not silent):** the prepaid model was
asserted by `scripts/test-travel-fog4.js` T5, `scripts/test-movement.js`,
and `scripts/attack-explorer-20261009.js` H2 — all updated to the new
per-step contract (upfront 0, full walk bills exactly the quote).
`scripts/test-movement-actions.js` had 4 stale failures predating this run
(pathStep "2 kcal" assertion never matched the prepaid model; haven section
ran on tile 3,3 so the enterBuilding haven-gate refused; lodge coordinate
(4,1) predates the 2026-10-07 centered grounds; cached hall detail not
invalidated) — fixed, now 9/9 ×4 runs.

## HELD (attacked, resisted)

- **Haven detail regen (T3):** `travelTo` clears haven `tile.detail` on every
  arrival. `genDetail` is seed-deterministic — regen is byte-identical, so
  the garden corner can't re-roll. No infinite-forage surface.
- **Monster-continuity anti-farm (T5):** leaving a tile with a live
  non-follower (gallowdeer) keeps it there; returning finds the SAME monster
  object — ping-pong spawns nothing new (the `!monsterAt` guard in
  `checkEncounter` + continuity). Farming encounters requires winning real
  fights: min-maxing, not an exploit. (Note: followers like the bulldozer DO
  chase through the boundary onto the haven tile — narrated "It followed
  you", and the barrier code's "don't bring it back to camp" acknowledges
  the hazard. Held as designed.)
- **tryNodeExit dead-refusal (T6, round-5 regression):** `moved:false` when
  over. Still green.
- **Dead-code sweep (T4):** all 32 travel/map functions
  (`travelTo`, `travelTargets`, `findWalkableEntry`, `edgeExit`,
  `tryNodeExit`, `walkCost`, `walkStepKcal`, `beginPathWalk`, `pathStep`,
  `microMove`, `travelTimeStep`, `travelBlockage`, `clearBlockage`,
  `buildBridge`, `smashBridge`, `exitBuilding`, `enterBuilding`,
  `returnToVillage`, `returnToOldVillage`, `reveal`, `markSeen`, `mapSeen`,
  `compareMaps`, `villageMapKnown`, `seedVillagerMaps`, `backfillSeen`,
  `noteTrailUse`, `checkEncounter`, `findPath`, `cellProps`, `genDetail`,
  `tileAt`, `playerTile`, `monsterAt`) have live callers.
- **Blockage stranding:** `blockFrom` is single-direction per tile, never on
  haven, always go-around-able; washed-out scrambles through without wood;
  storm-smashed bridges restore the honest pre-bridge state. No stranding
  path found.

## Regression
- test-travel-r6.js: 30/30 ×3 seeds (BEFORE mode: 23/23 breaks demonstrated)
- test-travel-fog4.js: 34/34 (its BEFORE mode is stale — it snapshots HEAD,
  which already contains rounds 4–5; AFTER is the valid signal)
- test-travel-village5.js: 13/13; test-movement.js: 49/49;
  test-movement-actions.js: 9/9 ×4; attack-explorer-20261009.js: 9/9 held;
  test-explorer-attack-20261009.js: 6/6 held
- validate-ontology.js: 50/50, release permitted

## Landing addendum (coordinator, 2026-10-09 ~09:05 CDT)
- Sibling's miser break-it (9f251e4) landed on master while the worker ran —
  master had moved, so the branch was rebased onto 9242b35 (no file overlap:
  sibling touched storage.js + test-miser file; worker touched game.js + travel
  tests; diff verified sibling content intact) and merged --ff-only as c0e3b15.
- Landing verification caught a 4th break the worker's suite missed:
  T6 (tryNodeExit dead-refusal) was SEED-FLAKY — a blocked exit returned
  {blocked} to a corpse before ever reaching travelTo's over-guard (seeds 1–2
  failed, seed 3 passed). Fix: over-guard at the top of tryNodeExit returning
  {moved:false, dir} in the round-5 refusal shape, every seed. One-line,
  same bug class.
- Landing verification also caught a flaky proof test:
  test-movement-actions.js never seeded Math.random — hardcoded targets (4,5)/
  (4,6) are blocking cells on some seeds and refused moves cost nothing
  (5 pass / 4 fail ~1 run in 6). Fixed in the test, not the game: mulberry32
  + SEED env (repo convention) and runtime walkable-neighbor selection.
  Now 12/12 ×8 seeds (1, 2, 3, 7, 42, 99, 123, 2026).
- Post-landing suite state: test-travel-r6.js 34/34 ×3 seeds; test-travel-fog4
  34/34; test-movement.js 49/49; test-movement-actions.js 12/12 ×8 seeds;
  attack-explorer 9/9 held; test-explorer-attack 6/6 held; validate-ontology
  release permitted.
