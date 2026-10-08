# break-it: camps & structures, round 3 steering pass (2026-10-08)

Worker: break-camps worktree. Proof: `scripts/test-camps4-breakit-20261008.js`
(19 checks, ALL GREEN × 4 seeds: 20261008, 1, 777, 20261009).
Before-fix run: 6 FAILURES — every catch below demonstrated red, then green
(verified by stashing the src changes and re-running).

Surfaces attacked per the steering note: hidden caches (theft rules, burial
exploits, save/load), destroyCell secret hygiene, found tents, sleep paths
(read-verified), tent-room honesty (read-verified), multi-tile edges
(read-verified), alien-structure carve-out (read-verified).

## CATCH 1 — INFINITE BURY (exploit, miser class) — BROKE, FIXED
**Attack:** `buryCache('food')` with a unit-less item: `qty = Math.min(qty,
it.units || 1)` buries 1 honest unit, then `it.units -= qty` → NaN, and
`NaN <= 0` is false so the item stays. Every later bury reads `NaN || 1`
→ 1 again: one phantom item mints 1 cache per bury action, FOREVER.
(The miser run proved corrupt unit-less entries reach inventories;
takeFromCache got the coercion, buryCache didn't.)
**Fix (storage.js buryCache):** the identical miser coercion —
`it.units = Math.max(1, Math.floor(it.units || 1))` before the take. A corrupt
entry collapses to exactly one honest unit, never an infinite.
**Sibling (same class):** `compost_king`'s bury-food branch had the same
`it.units -= 1` → NaN → never consumed. Same one-line coercion (game.js).

## CATCH 2 — STALE TENT SECRETS (phantom objects) — BROKE, FIXED
**Attack:** `destroyCell` clears a smashed tent's cell to null but never
deletes `t.secrets[cx,cy]`. The stale `{yours, condition}` secret outlives the
tent on the tile object — a later detail regen pairing it with a fresh 'tent'
cell would resurrect ownership of a tent never pitched (enter/pack actions on
it).
**Fix (game.js destroyCell):** delete the secret with the cell, like
wreckTent/packTent/breakCamp's sweep already do.
**Sibling (same class):** the found-tent take branch (`_cellInteract`,
"packable") set the cell to 'dirt' without deleting the secret. Same fix.

## Held (attacked, resisted / verified)
- **CACHES — save/load:** bury → save → load → dig round-trips exactly: no
  duplication, no loss, node intact (proof section F).
- **CACHES — theft:** `resolveCacheRobbery` marks found + empties items but
  keeps the cache until the player digs and discovers (designed discovery
  flow); robber is a real roster villager; suspicion plants through gossip.
  `pickCacheRobber` excludes the live bearer (uses the synced villagerId).
- **CACHES — exile:** caches live on the scholar, travel with the founder;
  nodes stay where buried, location-gated on dig. Same person, same caches —
  not broken.
- **SLEEP:** the `woke` path returns before dawn accounting (no double-apply);
  `_sleeping` cleared on both paths; smoke inhalation reads live post-sleep
  state; sealed-sleep numbers match labels (-10 health, energy ≤ 50).
- **TENT-ROOM HONESTY:** vent labels match mechanics (open: no smoke ever,
  1.25x draft burn; sealed + lit: smoke builds, coughing fit at 100 → -3
  energy, warning at 60); cook is honestly slow (24 ticks).
- **MULTI-TILE:** camp tile recorded at setup; travel desyncs `atPlayerCamp`
  honestly; no straddling state.
- **ALIEN CARVE-OUT:** `destroyCell`'s unbreakable list unchanged
  (haven buildings + pre-emptive alien 'base'); the bulldoze lane is the only
  destroyCell caller and can't target bridge/alien cells. No new destruction
  path since round 2.
- **DEAD-CODE:** no functions added/renamed; buryCache/compost_king were
  already wired. Ontology untouched.
- **Unit-mutation sweep:** every other `units -=` site checked — spendMaterial
  variants, pantry take, quest turn-in all either clamp with `|| 0` (take = 0
  on corrupt) or filter NaN out. Only buryCache and compost_king could mint
  from NaN.

## Regressions
Green: test-camps3 (37), test-camp-phantom, test-camp-storm-break,
test-camps2-breakit, test-tent-breach, test-tent-rooms, test-make-fire (26).
Ontology 50/50 validated.

## Files
- `src/js/storage.js` — buryCache unit coercion
- `src/js/game.js` — destroyCell tent-secret purge; found-tent-take
  secret purge; compost_king unit coercion
- `scripts/test-camps4-breakit-20261008.js` — 19-check proof
