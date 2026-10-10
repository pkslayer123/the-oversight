# Break-it: TRAVEL & MAP — run 2026-10-10

**Target index:** 10 (travel & map). **Verdict: BROKE + FIXED** (2 catches).
**Canon:** No dedicated travel/map canon doc exists (per brief: docs/TIME-ECONOMY.md
travel-cost section + docs/DESIGN.md are the closest references; Steve's fog law
"If you don't know, it doesn't show" and "node travel is FREE (Steve 2026-10-05)"
were the governing rules). Nothing invented.

## Attack surface
`Game.travelTo` / `travelTargets` / `travelBlockage` / `travelTimeStep` /
`tryNodeExit` / `edgeExit` (game.js), `renderMap` + map overlay/minimap taps
(app.js), `villageCard` fog gate (betrayal.js), `toWildNode` (debug-scenarios.js),
`reveal()`/`markSeen()`/`mapSeen()`/`compareMaps()`/`villageMapKnown()` fog
machinery, committed-walk billing (`beginPathWalk`/`pathStep`), blockage card
labels vs engine charges, `hive_mind`/`dowsing`/`echo_location` reveal abilities.

## CATCH 1 — EXPLOIT: diagonal blockage bypass (FIXED)
**Attack:** hostile player with code knowledge calls `travelTo()` on a diagonal
destination (travelTargets offers Manhattan d=2). Blockages generate
orthogonal-only (`blockFrom: {dx,dy}` with one zero axis), and `travelBlockage`
required the exact anti-match `bf.dx===-dx && bf.dy===-dy`. Approaching a
west-approach fallen tree from the **northwest** failed the dy check → `null`
→ `travelTo` walked straight through: no blockage card, no clearing cost, no
work. Every fallen_tree/rubble/washed_out in the game was avoidable by
zig-zagging diagonally.
**Fix (game.js `travelBlockage`):** a blockage guards its SIDE of the tile —
blocked if `(bf.dx!==0 && bf.dx===-dx) || (bf.dy!==0 && bf.dy===-dy)`. Any entry
with a component from the blocked side is stopped, orthogonal or diagonal.
(Honest UI paths are orthogonal-only today; this is engine armor for direct
calls, same class as the insideTent travel armor.) No softlock: a tile keeps
5 of 8 approaches open, and cut/clear/bridge/swim/go-around all still work.
**Proof:** scripts/test-travel-break-20261010.js — 27/27. Diagonal entry
stopped + says why; orthogonal still stopped; cleared tile re-opens; blockage
still clearable by work with the promised +2 wood.

## CATCH 2 — HONESTY: hive_mind's map promise was empty (FIXED)
**Attack (copy vs engine):** `hive_mind` description: "You know what all
villagers are doing (map reveals). But they know what YOU'RE doing too.
(-10 trust.)" Acquire line: "HIVE MIND: the map is open. Every tile,
revealed." Engine: only set `tile.revealed` (the TRAVEL flag) + `trustAll(-10)`.
The 🗺️ overlay the player actually reads is `seenTiles`-gated → stayed dark.
Nothing anywhere showed villagers or their doings. -10 trust + 200 kcal/day
metabolic paid for an empty promise.
**Fix:**
- `Game.hiveSight()` (game.js, +@ontology entries): true while hive_mind is
  held — derived, so losing the ability (pact) closes the sight; no stale flag.
- `renderMap` (app.js) honors it: every tile renders at **'shared' level**
  (biome color, never detail — "visited earns detail" holds). **Display-only:**
  nothing is written to `seenTiles`, so the `compareMaps` social gate and the
  codex MAPS gate (`villageMapKnown`) stay clean — sensed ground is not walked
  ground and not village knowledge. Depletion/wanderer markers stay fog-gated.
- `villageCard` fog gate (betrayal.js) passes hive sight — the ability's whole
  promise is "(map reveals)" — but every card action still gates on
  face-to-face proximity.
- Overlay/minimap tap handlers read hive-sensed tiles (terrain named + the
  limit named: "sensed by the hive — terrain only"); header shows "hive sight".
- Copy rewritten honestly: description → "The hive opens: every tile on the
  map lies revealed — terrain-sense, never detail; walk a tile to truly know
  it. They feel you watching. (-10 trust.)" Acquire line names the limit.
**Proof:** same script — sight off→on→off; seenTiles count unchanged;
`villageCard` refuses unseen-without-hive / names with-hive; hive ground
excluded from `villageMapKnown`; description no longer claims villager sense.
RenderMap itself is DOM-only (app.js) — asserted by source check in the test.

## Sibling sweep (same bug classes)
- **Direction-guard class:** `blockFrom` consumers audited — `clearBlockage`,
  `buildBridge`, `smashBridge`, `showBlockage` all operate on the dest tile
  directly (no direction check to bypass). `tryNodeExit`/exit-tap are
  orthogonal-only. `travelTo(force)` (swim) is offered by the UI only for
  creek/washed_out — no smuggling force past a fallen tree from honest UI.
- **Copy-vs-engine class:** blockage card labels re-verified against engine
  charges — fallen_tree 60 kcal/+2 wood ✓, rubble 40 ✓, bridge 4 wood/60 ✓,
  swim 20 kcal charged only after a successful crossing ✓, "Walking N squares
  (C kcal)" = walkCost = Σ pathStep charges ✓, "Travel N tiles" claims no cost
  (free by canon) ✓, dowsing "70% accurate" = `Math.random()<0.7` ✓.
- **Dangling-promise fix (app.js):** the map overlay said "tap again to visit"
  on other villages, but `el.dataset.village` was never read — dead promise,
  and it contradicted Steve's law (no travel from the map). Copy now says
  "walk to the edge of the map and head out to get there" (matches the
  villageCard hint).

## HELD (attacked, resisted)
- **Fog:** `renderMap` depletion/wanderer/village markers all `seenTiles`-gated;
  overlay + minimap taps show "Unexplored" on fogged tiles (incl. generated
  villages by name); `depletionClass` gates on `mapSeen` not `revealed`;
  `isHavenTile`'s `tl.village` branch is dead code (never assigned anywhere —
  effectively (4,4)-only, no live leak).
- **Guards:** `travelTo` refuses mid-combat (no free flee), `this.over`
  (corpse travels nothing), pit-trap death mid-travel named honestly;
  `travelTimeStep` proportional banking (r7) intact — zero-tick ping-pong and
  1-tick re-arm buy nothing; committed walks validate affordability up front
  and bill per landed square (interrupted walks never over-bill); starving
  players can't start walks they can't afford.
- **toWildNode:** in-bounds, skips haven/ruin, d≥2 from haven, marks the
  landing tile visited+seen (debug-only hook, no UI path).
- **Dead code:** every travel/map function has live call sites —
  `travelTo`/`travelTargets`/`travelBlockage`/`travelTimeStep`/`reveal`/
  `markSeen`/`mapSeen`/`compareMaps`/`villageMapKnown`/`seedVillagerMaps`/
  `edgeExit`/`tryNodeExit`/`findWalkableEntry`/`clearBlockage`/`buildBridge`/
  `smashBridge`/`beginPathWalk`/`pathStep`/`walkCost`/`walkStepKcal`/
  `debugToWildNode`/`renderMap` all reachable. No dead module (the Alien
  Players lesson) — index.html loads game.js et al in order.

## Notes / open questions
- Pre-existing flake (NOT this run): `scripts/test-blocked-travel-feedback.js`
  fails 2 assertions ~1-in-8 on **pristine** code too (verified via stash) —
  it doesn't seed RNG, so the random map occasionally breaks its `plain`-tile
  assumption. Unrelated to this run's changes (5/5 clean with changes, 7/8
  clean pristine).
- `renderMap`'s hive branches couldn't run in the node harness (app.js is
  DOM-only, excluded per convention) — covered by source assertions in the
  proof test; needs eyes on a real device. Commit flagged [needs-eyes].
- Ontology: `scripts/validate-ontology.js` → 52 systems validated, release
  permitted. docs/ONTOLOGY.md regenerated (auto-generated, committed).

## Files changed
- src/js/game.js — travelBlockage diagonal armor; hiveSight() + acquire-line
  honesty; @ontology entries (provides + rule)
- src/js/app.js — renderMap hive rendering; overlay/minimap tap honesty;
  "tap again to visit" dangling-promise copy fix
- src/js/betrayal.js — villageCard fog gate passes hive sight
- src/data/abilities.json — hive_mind description rewritten honestly
- docs/ONTOLOGY.md — regenerated by validator
- scripts/test-travel-break-20261010.js — 27/27 proof (new)
