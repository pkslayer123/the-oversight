# Playtest loop run — drifter archetype (2026-10-06 ~21:35 CDT)

Archetype 8/9: drifter run 4 — "the exile's haven". Fresh territory: the full
exile → drift → founding project → foundHaven hard-reset fork → new-haven
day-one → strangers arc, played as a player in-engine
(`scripts/play-feel-20261007-drifter.js`).

## Bug found and fixed: the exile/drifter food economy ran on phantom food

`packKcal(this.villagerId)` / `packSpend(this.villagerId)` generate the NPC
abstract pack (800–1300 kcal re-rolled daily) — completely disconnected from the
player's real inventory (`s.inventory`). Seven player-facing call sites in
betrayal.js used it:

- `cacheFood()` — filled the 10,000 kcal haven cache from the phantom while the
  real pack never shrank. Worse, inverted: a player holding 10,000 kcal of REAL
  foraged food was told "Your pack is empty. The cache waits."
- `villageShareFood()` (drifter gift) / `petitionVillage()` gift — villages ate
  a fiction; the player's food stayed.
- `canAffordBribe()` / `payBribe()` — bribes paid in ghost food.
- village card hints — "You carry ~N kcal" displayed the phantom number.

Fix: new `Game.playerPackKcal()` / `Game.playerPackSpend(kcal)` in betrayal.js —
read and spend REAL finished food (`isFinishedFood`), whole-unit spends like
the rest of the codebase, returning ACTUAL kcal removed; all callers say the
actual ("You bury and hang 3200 kcal…", "lay out 800 kcal of food"). Same
pattern `traderPay` already used. All 7 call sites migrated; NPC abstract packs
untouched (`stealFrom` already excludes the player).
Proof test: `scripts/test-player-pack-spend-20261007.js` — 35/35, stable ×6.

## Bug found and fixed: founding never made the ground a haven

`_forkNewHaven()` planted the new village at the player's CURRENT map position
(not the claimed site — while the say line claims "the spot you claimed weeks
ago") and never converted the tile. Consequences: `pantryInReach()` (tile type
`'haven'`) never fired at the new haven — the founder could never eat from
their own pantry via villageMeal, and the map never showed home.

Fix: `claimSite()` records `claimX/claimY`; `_forkNewHaven()` founds on the
claimed site, walks the player back there, and converts the tile
(`type='haven'`, `isHaven`, stock 0). Verified: fork → tile haven →
pantryInReach true → founder gets the village meal (+1200, half ration at trust
15). 9 new asserts in the proof test.

## Feel: cacheFood now warns before you starve yourself

Caching is allowed to take your last calorie (your call), but the game now says
so: "Your pack is light now — N kcal of finished food left. The cache doesn't
feed you tonight; keep enough to eat." (No-silent-actions rule.)

## Played (post-fix, full arc)

- Exile beat lands (extra bowl, pantry no longer yours). Drift ticks: all
  branches fire; 10 unrigged days survivable on pack + drift luck (honest).
- Founding project: claim → 4× timber (31 wood) → lean-to (8) → hut (16) →
  cache 12,000 real kcal (4 actions, whole units) → fork → "Emberwake".
- Hard reset verified: new object, archived old (pastVillages=1), trust 12→1,
  gossip 0, solo roster, codex kept (5 plants), pack kept, foundedHaven flag,
  journal "Founded Emberwake — hard reset. Haven continues without you."
- Strangers arrive at the new haven (trader, fleeing family); welcome works.
- Mantle-transfer sanity: founder who starves with no successor = game over
  by design ("the village is the protagonist"); with a village, the mantle
  passes (observed in a side trace — new face, codex kept, trust discounted).

## Open design questions (for Steve, not fixed)

1. The 10,000 kcal founding cache VANISHES into the requirement — the new
   pantry is the fixed founder's cache (~7k), not the stockpile. Code comment
   says deliberate ("the scarcity starts now"); the say line "The cache is
   full" implies it transfers. Flag, don't change.
2. Drift survival is tight-but-fair; dehydration nearly killed the test
   character again (honest needs system).

## Test state

- New: `test-player-pack-spend-20261007` 35/0 (×6 stable).
- Updated (were encoding the phantom): `test-exile-haven-struggle` 40/0,
  `test-exile-routes` 34/0.
- Existing: `test-betrayal` 81/0, `test-drifter-fixes` 9/0,
  `test-drifter-journey` 17/0, `test-drifter-grab-20261006` 11/0.
- Pre-existing failures, identical on HEAD (not mine): `test-drifter-joinstay`
  3, `test-drifter-presence` 2, `test-betrayal-aftermath` crash (tbFighter
  undefined at line 146).
- Ontology validator: 41/41, release permitted.
