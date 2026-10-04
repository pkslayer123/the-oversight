# Regression Hunt — 2026-10-04

Systematic engine-level regression test of recent features. 8/8 full runs clean.

## Bugs found

### 1. `Game.stateSnapshot()` crash in pantry popup — FIXED
**Severity:** Critical (crashed the pantry UI)
**Location:** `src/js/app.js` `pantryPopup()` called `Game.stateSnapshot()`, which doesn't exist.
**Status:** Already fixed in commit `8e7c0a1` ("save management") — now uses `Game.status()`.
This was likely why Steve reported "taking from pantry seems to be broken."

## Non-bugs (verified working)

### 2. `clearBlockage` on washed_out without 4 wood
Returns `false`, blockage remains. **Not a bug** — the UI disables the bridge button when wood < 4 and offers "Go around." The engine-level `clearBlockage → buildBridge` path is defensive; UI never hits it without wood.

### 3. Terraforming adjacency requirement
`cutTree`/`clearBrush` refuse when player is >1 cell away ("Too far. Step closer."). **Not a bug** — the contextual strip only surfaces these for adjacent cells. Verified 10/10 cutTree and 10/10 clearBrush when adjacent: wood yields, cell changes permanent.

### 4. Save ordering changed
`listSaves()` now sorts newest-first (by `lastPlayed`). Old test expected append-order. Game is correct; test updated.

## Coverage

All passing across 8 runs:
- **Pantry:** starting food (>50k kcal), village water, personal 2L, bulk take food-only/water-only/both, independence (food doesn't touch water), over-weight graceful, invalid idx no-throw, donate, legacy single-take
- **Fire:** nearFire, cookAll, boilWater (risky→clean), cookFood, fillWater, drinkWater
- **Doors:** starts inside → exit → enter → double exit/enter no-throw
- **Villagers:** roster, info, talkTo (valid + invalid), giveFood, all 7 villageAction kinds + invalid
- **cellActions:** all 10 labels across cell types (Cut down, Clear brush, Drink, Examine, Fight, Fill water, Forage, Rest, Step outside, Warm hands); Talk verified with positioned villagers
- **Travel:** targets non-empty, unblocked travel moves player, blocked returns blockage without moving, edgeExit directions correct on 9x9
- **Terraforming:** cutTree (wood+, cell→dirt), clearBrush (cell→grass), wood add/spend roundtrip, overdraft refuses, buildBridge with/without wood
- **Abilities:** system arrival fires day 7, 3 choices offered, chooseAbility grants, invalid no-throw, activatables list + activate each, gainAbilityXP, slots number
- **Save/load:** save, hasSave, listSaves, roundtrip preserves day + map position, invalid key returns false
- **Movement:** microMove adjacent, movePath multi-tile, findPath sane
- **Day loop:** all doAction kinds, endDayPart, endDay, 7-day sim no crash
- **Combat:** startCombat + 20 rounds + flee, no crash (5 runs)
- **Relics:** offer + choose enhancement, no crash (3 runs)
- **Drink:** doAction('drink') 40→90 hydration, "Drank clean water."

Content gate: OK (25 plants, 63 abilities, 90 items, 12 synergies, 0 errors).
`node --check` clean on app.js and game.js.

## Notes
- During testing, another agent committed `8e7c0a1` (save management: expedition naming, save list UI). The `stateSnapshot` fix was already in that commit.
- `takeFromPantryBulk` signature is `{0: qty, 1: qty, water: liters}` — object keyed by pantry index + 'water', not `{items: [...], waterL: ...}`.
- Scholar water is an array of `{liters, quality, source}` bottles, not a number.
- `Game.map` (not `Game.state.map`) holds `{tiles, px, py}` for the 7x7 world map.
- Detail grids are 9x9 string arrays from `Game.genDetail(x, y)`; player micro-position is `scholar.mx/my`.
