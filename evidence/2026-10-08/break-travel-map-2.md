# Break-it: travel & map, round 2 (2026-10-08)

Hostile-player attack on the travel & map system, round 2. Round 1 (fe22fb4) closed
travel-spam, animal-continuity, and stale-clamp breaks. This round went after the
remaining surface: committed-walk cost honesty, combat barrier exits, arrival damage,
blockage-card labels, dead code, fog, save/load, and scout stacking.

Verdict: **BROKE + FIXED — 4 real breaks** (1 honesty double-charge with a failing
project test, 1 combat-exit honesty lie, 1 arrival-death softlock, 1 cost-label gap).
Everything else held.

## BREAK 1 — HONESTY: committed walks double-charged kcal (FIXED)

**Attack:** `beginPathWalk` prepays 10 kcal/square and announces "Walking N squares
(C kcal)". `pathStep` then charged 2 kcal/step on top — a 5-square walk cost 60 while
the UI promised 50. The header comment ("The kcal cost was prepaid by beginPathWalk"),
the original commit message ("beginPathWalk (10 kcal/sq prepaid) + pathStep (1 tick)"),
AND the project's own `scripts/test-movement.js` ("pathStep: no double kcal charge")
all say the kcal is prepaid. The code disagreed — and test-movement.js was FAILING
47/48, unnoticed.

**Fix (`game.js`):** removed the 2 kcal charge from `pathStep` (1 tick of time only,
as designed). Also applied `travel.cost_mult` (wanderer/second-skin "-10% travel
cost") to the prepay — the modifier's promise previously didn't cover the most
expensive travel in the game, and on 2-kcal microMove steps `Math.round` ate the
discount anyway. The announced cost uses the discounted number, so the label stays
honest.

**Proof:** `scripts/test-travel-break2-doublecharge-20261008.js` — BEFORE: extra 6 kcal
on a 3-square walk (bug demonstrated); AFTER: 0 extra, announced == charged, wanderer
discount verified. `test-movement.js` now 48/48 (was 47/48).

## BREAK 2 — HONESTY: tbBarrierExit lied when the far node was blocked (FIXED)

**Attack:** pushing through the grid-edge barrier mid-combat calls `travelTo(nx, ny)`
on the next node. If that node is blocked (fallen tree / rubble / fast creek),
`travelTo` refuses and returns the blockage object — but `tbBarrierExit` ignored the
return:
- fled branch (50% roll): said "you crash through the treeline to a new area...
  They lose your trail" and ended the fight as fled — while map.px/py never moved
  and the monster was still on the tile.
- fight-continues branch: said "you stumble into a new area", then scrambled the
  fighter grid positions on the node you never left (player 8,4 -> 7,4).

**Fix (`game.js`, `tbBarrierExit`):** attempt the crossing FIRST; on blockage say the
honest line (travelTo already named the blockage), spend the push, keep the fight
going — no `tbEnd('fled')`, no repositioning. The alienPlayers stasis-field wrapper
delegates by signature and is unaffected.

**Proof:** `scripts/test-travel-break2-barrierblock-20261008.js` — BEFORE: both lies
demonstrated; AFTER: no false "new area" claims, no position scrambling, fight
continues on blocked push, and an unblocked flee still moves + ends the fight.

## BREAK 3 — SOFTLOCK: own pit trap kills on arrival, no death flow (FIXED)

**Attack:** `travelTo` checks your own old pit traps on the arrival tile (50%,
15–25 dmg). A lethal hit set health to 0 with NO death processing — no
`maybeCheatDeath` (second_wind/molt/phoenix never triggered), no `playerDeath`,
`over=false`. The 0-HP scholar kept wandering until endDay blamed "the night".
Zombie state, misattributed death, stolen cheat-death triggers.

**Fix (`game.js`, `travelTo`):** after pit damage, if health <= 0 → `maybeCheatDeath()`
else `playerDeath('your own pit trap')`, then return — travelTo does not continue on
a corpse. `playerDeath` is self-contained (corpse, memorial, mantle pass, save).

**Proof:** `scripts/test-travel-break2-pitdeath-20261008.js` — BEFORE: health 0, no
death announced (bug demonstrated); AFTER: death flow runs, cause named "your own
pit trap", successor alive at haven; second_wind triggers honestly at 1 HP.

## BREAK 4 — HONESTY: bridge button didn't name the 60 kcal (FIXED)

**Attack:** the blockage card's "🌉 Build bridge (4 wood — you have N)" button
charged 4 wood + 60 kcal + 96 ticks. Sibling buttons (cut: "60 kcal", clear: "40 kcal")
name their kcal; the bridge button didn't. "Expensive buttons name their cost."

**Fix (`app.js`):** label → "🌉 Build bridge (4 wood, 60 kcal — you have N)".

## HELD (attacked, resisted)

- **Fog of war:** map display is `seenTiles`-only; the rim-tap popup names an adjacent
  node's biome via `tile.revealed`, but the tile is one step away and visible — you
  are looking at it. Compass beast/village markers remain earned (proximity
  generation). NPC scout reports are bounded (5×5 around haven, 50%/tile) and never
  mark visited — the arrival moment is preserved. Ability reveals (hive_mind,
  dowsing, echo_location) are explicit, costed, and honestly labeled.
- **Blocked-travel bypass:** `force=true` only via the swim button (20 kcal, honest,
  creek/washed_out only) and debug scenarios. All other `travelTo` callers either
  pre-check `travelBlockage` (tryNodeExit) or handle the blockage return (blockage
  card, rim tap, tbBarrierExit now). No path skips the guard.
- **Node teleport/warp:** no free warps exist. `returnToVillage` only pins position on
  haven arrival and death-respawn (village-as-protagonist, by design). `phoenix_clause`
  haven-respawn is an explicit once-per-run ability. Save/load: travel is atomic —
  there is no in-flight travel state to duplicate or orphan.
- **Mid-walk purge:** `findPath` and `pathStep` share the same deterministic
  `genDetail`/`cellProps` walkability, so a committed walk cannot be blocked by
  terrain mid-walk; the purge path is defensive. No refund machinery added (no live
  path loses prepaid kcal).
- **Dead code:** all 48 src/js modules load in index.html (no Alien-Players repeat).
  Every travel/map function has live call sites: travelTo/Targets/Blockage,
  clearBlockage, buildBridge, findWalkableEntry, edgeExit, tryNodeExit, microMove,
  pathStep, beginPathWalk, npcNodeTravel, npcSetNode, reveal, markSeen, mapSeen,
  compareMaps, seedVillagerMaps, backfillSeen, checkVillageProximity, returnToVillage,
  noteTrailUse, touchTileScene, arrivalPoolFor/TextFor, debugToWildNode (test hook).
- **Exile/contest vs travel:** exile is social-state (justice.js); no map-state
  desync surface in the travel system. Contests never write map.px/py (round 1).

## Sibling sweep

- Double-charge class: `moveBurn` has no remaining callers; no other prepay+charge
  pairs in travel. Clean.
- Ignored-travelTo-return class: all callers audited (above) — clean after the
  tbBarrierExit fix.
- **Out-of-scope flag (not fixed — different systems' break-it runs):** other
  environmental damage sources also skip the death pipeline (creek drink -10 at
  game.js:16625, disease ticks at 16317–16332, 13144). Same zombie-class as BREAK 3's
  pre-fix state, but they live in food/water/disease code, not travel. Flagging for
  the food/persistence loops rather than fixing cross-system here.

## Files changed

- `src/js/game.js` — pathStep no double kcal charge; beginPathWalk honors
  travel.cost_mult; tbBarrierExit blocked-far-side honesty; travelTo pit-death
  pipeline
- `src/js/app.js` — bridge button names the 60 kcal
- `scripts/test-travel-break2-doublecharge-20261008.js`,
  `scripts/test-travel-break2-barrierblock-20261008.js`,
  `scripts/test-travel-break2-pitdeath-20261008.js` — new proof tests
  (BEFORE=1 runs pre-fix code from git HEAD, seeded)
- `docs/ONTOLOGY.md` — regenerated by validate-ontology.js (48/48)

## Verification

- `node --check` on game.js + app.js: OK
- `scripts/validate-ontology.js`: 48/48 systems validated, release permitted
- All 3 proof tests: BEFORE demonstrates the bug, AFTER passes (seeds default;
  double-charge also ran under SEED default 424242)
- Regressions: test-movement.js 48/48 (was 47/48), test-action-clock.js 18/18,
  round-1 travel proofs (spam 5/5, animal 5/5, clamps 4/4, sib-clamps ALL CHECKS PASSED)
