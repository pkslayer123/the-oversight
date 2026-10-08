# Break-it: travel & map (2026-10-08)

Hostile-player attack on the travel & map system. Verdict: **BROKE + FIXED — 3 real breaks**, plus 1 stale test repaired. Everything else held.

## BREAK 1 — EXPLOIT: travel-spam zeroes NPC fear / maxes energy+hunger for free (FIXED)

**Attack:** Node travel is free (no kcal, no ticks — Steve 2026-10-05). `travelTo()` calls `travelTimeStep()` on *every* crossing, which ran `tickNeeds()` + `spreadGossip()` unconditionally. Pacing back and forth between two adjacent tiles delivered unlimited "portions of the day" at zero player cost.

**Measured (pre-fix, seeded):** 30 free crossings moved one NPC fear 80→0, energy 10→100, hunger 10→100, grief 5→0 — while `dayTicks` stayed 0 and kcal stayed 2000. Consequences: fear-gated behaviors (flee/scared/morale) trivially bypassed; exhaustion gating bypassed; hunger 100 drives mass foraging departures on the next `advancePart` → pantry food (indirect infinite-food loop); gossip fast-forwarded village-wide.

**Fix (`game.js`, `travelTimeStep`):** the world-advance now runs only when the player's clock (`dayTicks`) has moved since the last travel step. The first crossing of a journey still advances the world one portion (by design — "moving between nodes is a BIG time step"); crossings 2..N with no time spent advance it zero further. Real travel after real actions is unaffected.

**Proof:** `scripts/test-break-travel-spam-20261008.js` — 5/5 AFTER, 5/5 BEFORE (demonstrating the exploit), ×3 seeds.

## BREAK 2 — animal continuity: stalked animal teleported to the arrival tile (FIXED)

**Attack:** `travelTo()` parked `scholar.animal` (the live animal on your grid) via `tileAt(this.map.px, this.map.py)` *after* the position update — i.e. on the ARRIVAL tile, not the tile left. Two breaks in one block: (a) the animal you were stalking followed you to the new node (continuity lie — "they stay where you left them" was false); (b) the arrival-pickup of a parked animal was instantly undone (re-parked, live set to null) — the "collect the waiting animal" feature was dead code in practice.

**Fix (`game.js`, `travelTo`):** park on `tileAt(fromX, fromY)` *before* the position update; deleted the post-update block. Arrival pickup now works as designed.

**Proof:** `scripts/test-break-travel-animal-20261008.js` — 5/5 AFTER, 3/3 BEFORE (demonstrating both halves), ×3 seeds.

## BREAK 3 — stale 7×7 world clamps: NPCs locked out of rim nodes; debug spawn-rule violation (FIXED)

**Attack:** the world grew to 9×9 on 2026-10-07, but three paths still clamped to 0..6:
- `npcSetNode()` — NPCs could never occupy nodes 7–8 (a third of the map NPC-free); away-drift silently swallowed at the clamp.
- `npcNodeTravel()` adjacent-step duplicated the stale clamp.
- `toWildNode()` (`debug-scenarios.js`) scanned only the 0..6 corner *and* measured "≥2 from Haven" from (3,3) instead of Haven (4,4) — tiles like (4,5) passed the filter while ADJACENT to Haven (violates "out in the wild, not the haven grounds"), and rim rows/cols 7–8 were never scanned.

**Fix:** clamps to 0..8; `toWildNode` scans 0..8 measured from the real Haven tile (`v.px ?? 4, v.py ?? 4`), marks the arrival seen, refuses (returns false) when no valid wild tile exists; added `Game.debugToWildNode` test hook.

**Proof:** `scripts/test-break-travel-clamps-20261008.js` — 4/4 AFTER, 4/4 BEFORE (demonstrating all three), ×3 seeds.

## Repaired: stale test assertion

`scripts/test-action-clock.js` still asserted the pre-2026-10-05 rule ("travel = 32 ticks"). Updated to the standing rule (node travel costs 0 ticks; the world-advance is throttled by `travelTimeStep`, not the player clock). 18/18 green.

## HELD (attacked, resisted)

- **Fog of war:** map display is `seenTiles`-only (visited = full detail, shared = biome color, else fog). `tile.revealed` (radius-2 diamond) drives *travel mechanics* only, never the map. Compass beast/village markers are earned (proximity ≤2 generation, "you see smoke"). No leak found. The ~10044 "learn it without ever talking to them" is NPC *names* via overheard gossip, not map fog.
- **Blocked-travel bypass:** `force=true` only via the swim button (pays 20 kcal, honest) and debug scenarios. `travelTo` always re-validates against `travelTargets()`; OOB/nonsense/self targets return null with no state change (probed).
- **Softlocks:** blocked mid-move → blockage card with reasons; world edge → one-time message, no travel; dead ends impossible (every node has exits); phantom destinations impossible (targets derived from live tiles, revalidated); map UI is view-only for travel (Steve 2026-10-06: "no travel from the map").
- **Dead code:** all 19 travel functions wired (travelTo/TimeStep/Targets/Blockage/clearBlockage/buildBridge/findWalkableEntry/edgeExit/tryNodeExit/microMove/npcNodeTravel/npcSetNode/npcsOnNode/reveal/markSeen/mapSeen/compareMaps/seedVillagerMaps/backfillSeen/toWildNode/pathStep). `TIME.TRAVEL_TICKS` intentionally kept for old saves (documented). `seedVillagerMaps`' `min(6,)` clamp is redundant but harmless (range is ±2 by design) — left alone.
- **kcal-free travel double-count:** `travel.cost_mult` applies only to `microMove`/`pathStep` (2 kcal/step, honest); node travel is free *by Steve's rule*, and the spam vector is now throttled.
- **Contest/teleport vs travel:** contests never write `map.px/py` — they're UI sequences, no map teleport exists; no interaction surface.
- **Honesty:** "Travel N tiles" uses Manhattan distance (honest); blockage reasons named; no silent actions on blocked/edge travel.

## Files changed
- `src/js/game.js` — travelTimeStep anti-spam gate; travelTo animal parking fix; npcSetNode + npcNodeTravel 0..8 clamps
- `src/js/debug-scenarios.js` — toWildNode 9×9 + real-Haven measurement + markSeen + debugToWildNode hook
- `scripts/test-action-clock.js` — stale "travel = 32 ticks" assertion → free-travel rule
- `scripts/test-break-travel-spam-20261008.js`, `test-break-travel-animal-20261008.js`, `test-break-travel-clamps-20261008.js` — new proof tests (BEFORE=1 runs pre-fix code from git HEAD)

## Sibling sweep: stale 7×7 clamps (break-travel-sib, commit 7bb1288)

Repo-wide grep for coordinate `Math.min(6` found exactly three more instances of the stale-clamp class the main run fixed (non-coordinate hits — hierarchy.js:382 influence gain, ledger.js:763 viewership — left alone):

1. **`src/js/villager-agency.js` `startExpedition`** — expedition target `tx/ty` clamp 0..6 → 0..8. Before: villagers could never target rim nodes 7-8 (a third of the map expedition-free by construction).
2. **`src/js/villager-agency.js` `expeditionLeg`** — per-leg `nx/ny` clamp 0..6 → 0..8. Softlock analysis: not a true livelock (expeditions terminate on duration when the base loop clears `v.away`), but a 7-8 target would clamp the villager at (6,6) forever with legs++ burning and the destination never reached. Now converges.
3. **`src/js/game.js` `seedVillagerMaps`** — villager map-seed scatter clamp 0..6 → 0..8 (supersedes the "redundant but harmless" note above — matters for off-center havens; see design flag below).

**Proof:** `scripts/test-break-travel-sib-clamps-20261008.js` (BEFORE=1 runs pre-fix code from git HEAD, seeded mulberry32). BEFORE: expedition targets max coord 6 (0/400 rim targets); legs clamp at (6,6) 39/40 legs, never reach (8,8); off-center-haven seeds yield 0 rim tiles. AFTER: 162/400 expedition targets on rim nodes; legs reach (8,8) in 4 legs, stay arrived, no drift; off-center seeds produce 11 rim tiles; COMPARE MAPS merges a forced rim tile. ALL CHECKS PASSED in both modes; main clamp test still 4/4. `npcMaxDist` verified coherent (explorer 6 ≥ world radius 4 from haven) — no change.

**DESIGN FLAG for Steve (not changed — out of bug class):** with the standard centered haven (4,4), `seedVillagerMaps`' scatter radius is only ±2, so seeds land on 2..6 regardless of the clamp — rim tiles are structurally excluded from villager map knowledge even after this fix. The clamp fix only matters for off-center havens. Widening the scatter radius is a design call.

## Verification
- `node --check` on both changed source files: OK
- `scripts/validate-ontology.js`: 47/47 systems validated, release permitted
- All proof tests green BEFORE (exploit demonstrated) and AFTER (fixed) across seeds 1, 999, 123456 (+defaults)
- `test-action-clock.js`: 18/18
