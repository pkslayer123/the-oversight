# Survivalist Playtest — water / fire / shelter / rest (2026-10-04)

**Archetype:** survivalist (rotation 3). **Method:** 7-day needs-management bot
(`scripts/test-survivalist.js`) + targeted unit tests. Build `2594e11`.

## Bugs found & fixed

1. **`takeFromPantryBulk` double-counted weight** (from the 2026-10-04 survival-feel
   note, still present). The loop rescanned the mutating inventory while `totalKg`
   accumulated in parallel → food+water in one pack silently blocked the water;
   later food items got short-changed. Fix: snapshot base carry weight before the
   loop. Test: `scripts/test-pantry-bulk-weight.js` (10 pass).
2. **Same function spliced fully-taken items mid-loop**, invalidating later
   selection indexes (second food item silently skipped). Fix: process food
   indexes descending. Same test file.
3. **Cooking drained the village well even when cooking at a field camp**
   (no distance check), and never touched the player's carried bottles — the
   "spend water, get safe calories" tradeoff was invisible to the player.
   Fix: `cleanWaterForCooking()` / `spendCleanWater()` — bottles first, haven
   well only as backup AT haven. Test: `scripts/test-cook-water.js` (23 pass).
4. **UI "Fill water" minted free clean water at haven**, bypassing the cistern
   entirely — while a food.js wrapper blocked ALL fills when the cistern was
   FULL (even at creeks; backwards). Fix: haven fills draw 1L from the cistern
   (dry → clear message pointing at creek/water-duty); wrapper removed; hauler
   deposits respect the cap, reported honestly. Wild fills are risky, not clean.
   Test: `test-cook-water.js` §8 + `test-food-reality.js` updated (90 pass).

## Feel verdicts

- **Water is now a real managed resource** — the survivalist fantasy works.
  Cistern 25L → ~10L over 7 days with no haulers (player fills ~1L/day + meal
  1L/day + cooking). One hauler-day every 1–2 days sustains the player; the
  dry-cistern message teaches the fix (creek run or water duty). No soft-lock:
  creek → risky → boil at haven fire always closes the loop.
- **The boil loop works end-to-end** (creek 3L risky → haven fire → all clean,
  30 kcal). Fire is haven/camp-gated; the wrapper's "Need a fire to cook" gate
  is correct and tested.
- **Sleep quality tiers are reachable**: hall at haven (+20), tent on grounds
  (+25), bunk inside (+35). Interrupted sleep (night encounters) doesn't restore
  energy — correct, and `rest` (+30 energy, 96 ticks) covers daytime recovery.
- **Cooking water cost is now felt in the pack**, not the invisible well —
  hauling water for beans is a real decision, as the food-reality design intends.
- Open (not changed, needs Steve's eye): `treat` action and
  `fillWaterFromVillage` are dead code; `villageAction('water')` (+4 free
  bottles) is unwired legacy. Recommend wire-or-remove pass.

## Numbers
- Suites: bulk-weight 10/10, cook-water 23/23 (×6 runs), food-reality 90/90 (×3),
  pantry-real 16/16, action-feedback 70/70, storage 59/59, day-night 42/42.
- Live: version.json `2594e11-20261004-235600` verified on GitHub Pages.
- Note: sibling commit `1faf9ff` (18:45 CDT) swept this run's game.js fixes via
  shared-tree `git add -A`; this run's own commits: `2594e11` (water economy),
  `f9f927c` (build tag), plus sim tweaks.
