# break-it: camps & structures (2026-10-08)

Worker: break-camps worktree. Commit `1a81271`. Proof: `scripts/test-camp-phantom-20261008.js` (22 checks, ALL GREEN × 3 seeds).

## Attack surface
Camp system lives in `src/js/game.js` (no dedicated module): `pitchTent` / `makeFire` /
`setUpCamp` / `breakCamp` / `packTent` / `hasTentNearby` / `hasCampfireNearby` /
`atPlayerCamp`, plus `destroyCell` (monster terrain destruction) and the exile
haven-founding project in `src/js/betrayal.js`. A camp's ONLY mechanical effects:
`atCamp()` (food.js) → the sort-the-bag ritual + prep-stash counter UI. Everything
else (rest, cook, warm hands) keys off the tent/fire cells themselves.

## CATCH 1 — PHANTOM CAMP (softlock + honesty) — BROKE, FIXED
**Attack:** the Bulldozer's lane calls `destroyCell()`, and `'tent'` is in
`beamBlockingCells()` — so a bulldozer could flatten the player's pitched tent.
`destroyCell` cleared the cell but never told the camp system.
**Result:** `state.camp` pointed at bare dirt. `atCamp()` stayed true → the
sort ritual and prep-stash counter kept working on an empty patch; "Set up camp"
refused ("You already have a camp"); and there is NO player-facing "abandon
camp" action (only `packTent`, which needs the tent, or a random storm). A ghost
camp with no exit.
**Fix:** `destroyCell` now captures (pre-clear) whether the smashed cell was the
player's tent on the camp's tile, and calls `breakCamp('a bulldozer flattened
it')` — its tent-sweep is idempotent. Stranger tents and far-tile tents don't
trigger it. Proof section A/B/D.

## CATCH 2 — PLAYER CAMPFIRES HELD LIKE HAVENS (honesty) — BROKE, FIXED
**Attack:** `'fire'` sat in `destroyCell`'s unbreakable list, so a bulldozer
flattening your campfire was told "The fire holds. Havens do not break." The
list conflated the haven hearth with player-made campfires — violating Steve's
rule that havens are the ONLY unbreakable human structures.
**Fix:** carve-out — a player-made fire (`playerFireAt()`, tracked in
`state.fires`) is breakable; haven/map fires still hold.
**Sibling (same class):** smashing the fire left its `state.fires` entry behind
→ `playerFireAt()` true for a null cell (grid/list split-brain). `destroyCell`
now purges matching entries. Proof section C.

## CATCH 3 — DEAD 'campfire' BRANCH (dead code) — FIXED
`hasCampfireNearby` also accepted `'campfire'` cells, but no generator ever
emits a `'campfire'` cell (cell_defs.json uses it only as a fire *size*
descriptor). Branch removed.

## Held (attacked, resisted)
- **EXPLOIT — tent dup / camp cycling:** pitch→pack→pitch loop costs 48+16
  ticks + 50 kcal each cycle, net negative; `setUpCamp` grants no resources;
  storm-wreck destroys the tent (no reclaim). No dup path found.
- **EXPLOIT — exile cache:** `cacheFood` moves real pack kcal into
  `stockpileKcal`; founding consumes the cache by design ("the scarcity starts
  now" — documented in `_forkNewHaven`). Not a dup.
- **SOFTLOCK — breakCamp while standing in it:** player just stands on dirt;
  no stuck state. Storm paths (both branches) call `breakCamp` correctly.
- **SOFTLOCK — fire expiry:** camp survives a burned-down fire (tent leg
  intact); relightable. Held by design — the tent is the camp's body.
- **HONESTY — unbreakable rule:** after the fire carve-out, the list
  (`hall/bunk/door/haven/sanct/base`) is haven buildings + alien structures
  only. `'base'` has no generator yet — pre-emptive, honest.
- **DEAD-CODE:** every camp function is wired — 'Set up camp' (app.js:768),
  'Pack up tent' (app.js:767), `breakCamp` from packTent + 2 storm paths +
  now `destroyCell`. `state.camp` persists via `state.run.map` serialization.
  Minor dead data left in place: `camp.condition`/`setUpDay` written, never
  read (forward-looking; harmless).

## Sibling sweep
Same bug class (grid object destroyed without notifying its owner): swept
`tbTerraform` (fight-scoped overlay, never touches the detail grid — clean),
`sweepDeadFires` (grid and list stay consistent — clean), all `detail=`
overwrites (map-gen, pickups, regrow — none destroy player tents/fires).
`destroyCell` has exactly one caller (bulldozer lane); the new `breakCamp`
hook cannot fire from any other path.
