# Playtest forager 2026-10-10: hostile attack on the COMMUNAL MEAL

Target: the player's `villageMeal` (game.js). Villagers draw the pantry with
`{cook:true}` + exposure -> villagerFoodPoisoning / villagerMonsterWeirdness.
The PLAYER drew `pantryDraw(v, want, {})` — no cook transform, no exposure
ledger, no consequence rolls at all.

## Catches (fixed, with proof)

### M1. EXPLOIT — communal-meal monster-weirdness immunity
Cooked hushwolf meat in the pantry (foodState 'cooked', worms dead): eating
it yourself rolls maybeMonsterWeirdness at 20% (cooking does NOT cure
howlbelly — DISEASES.md: alien effects are permanent warping). Eating it via
the communal meal rolled NOTHING — the player laundered weird meat through
the pantry for free calories while villagers rolled 20%.

Fix: the communal draw now runs `{cook:true, exposure}` (the village cook
actually cooks it) and the new `playerMealConsequences(items)` applies the
player's own cooked-food contract: weirdness at cooked chance (mirrors
trackMealExposure's cooked flag exactly), poison rolls, unsafe rolls.
Parasites/raw disease die at the village fire — no roll, same as the
villagers. shellgut still blocks poison/unsafe; weirdness applies regardless
(parity with villagerFoodPoisoning, which rolls weirdness first).

### M2. HONESTY — rawKcal staples shortchanged at the communal meal
Rice {rawKcal:200, cookedKcal:350}: the villager draw applies the perfect
cook transform (350/unit); the player's draw took raw value (200/unit).
Same pantry, same village cook, different math — the player lost ~43% of
the staple. Now the player draws cook:true like everyone else (want 2200 ->
7 units x 350 = 2450, was 11 x 200 = 2200).

### M4. HONESTY — village-cooked needsCooking counts as cooked-safe
The player's own fire sets safe=true on cooked rawKcal items ("cooking
kills the risk (mostly)"); the village abstraction never did, so cooked
beans/rice rolled bad-belly forever — for villagers (trackMealExposure) and
would have for the player (new path). trackMealExposure now excludes
village-cooked rawKcal/needsCooking items from exposure.unsafe; the player
path mirrors the rule. Genuinely suspect food (safe:false, not
needsCooking) still rolls.

## Held (attacked, resisted)
- M3. The village "cooking" the drawn units does NOT wash the pantry stack:
  leftover wormy cleaned meat keeps parasiteRisk after the meal
  (cookTransform is pure — no T1-class laundering), and the meal itself
  gives no trichinosis (fiction: the village fire killed the drawn worms).
- M5. preserveFood(999) / renderFat(-1): null, no throw, no tick burn.

## Player-facing note [needs-eyes]
Communal meals now carry the same risks as cooking the food yourself:
weird monster meat in the pantry can howlbelly/gristlefit YOU at the
cooked 20% (codex warns after first taste, same as self-cooked), and
rice/beans now pay their cooked value at the communal meal. Villagers stop
rolling bad-belly on village-cooked beans/rice.

## Proof / regressions
- scripts/test-forager-meal-20261010.js: BEFORE (HEAD) 5 FAIL (M1b, M1c,
  M2a, M2b, M4b); AFTER 14/14 x seeds 20261010/7/42/99.
- test-break-food-20261010c (E1/E2): 25/25; test-break-food-20261010b
  (T1/T2): 19/19; test-food-reality: 91/91; test-break-food-20261009:
  116/116; test-break-food-r3: 18/19 — W4b fails IDENTICAL on pristine
  HEAD (pre-existing, not this run).
- validate-ontology.js: 52/52 green.
