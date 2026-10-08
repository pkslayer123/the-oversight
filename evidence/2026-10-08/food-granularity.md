# Food granularity + villager food poisoning (2026-10-08)

Steve's direction: "Address both those. Idk if we want to fractionate individual food items. When in doubt, a source should drop more granular pieces vs one master slab of meat."

## BUG 1 — villageMeal ate whole slabs

**Verify-before-fix (fail-before run):** `stockPantry(3000, 'Weregild')` created one `{kcalEach: 3000, units: 1}` slab; `villageMeal` with a 2000-kcal need ate it whole (scholar.kcal=3000 — 1000 kcal over the trust-scaled share, 1000 pantry kcal wasted).

**Fix at the source (no fractionating at eat time), two parts:**
1. `stockPantry(kcal, name, opts)` now splits into pieces of at most `opts.pieceKcal` (default 500), merging into a matching stack via the existing `stacksMatch` fungibility gate. 3000-kcal Weregild → 6×500. Totals conserved; caller say-lines ("+3000 kcal") stay true.
2. `villageMeal` is now best-fit: smallest-kcalEach pieces first (spoilDay tiebreak), covering the need. A legacy/donated giant slab rides last — eaten only when nothing smaller covers the need (a fed village beats a wasted slab; starvation is never the "honest" alternative to eating available food).

**Deliberate tradeoff (Steve's call stands):** best-fit beats perishable-first. A soon-spoiling giant slab may rot uneaten while small pieces are eaten. That's the honest consequence of his "waste must be impossible" rule.

**Scope check:** both cleaning paths (player self-clean, specialist butcher) already emit 4 portions — the slabs came only from `stockPantry` and donations. `villageEats` (collective pot) unchanged — its need is village-scale and it already takes partial units.

## BUG 2 — villagers couldn't get food-poisoned

**Verify-before-fix:** feeding the communal pot raw cleaned meat with `diseaseRisk.p = 1` sickened zero villagers; spoiled-only pantry left everyone healthy (they just starved).

**Fix:** `villageEats` now tracks meal exposure per item consumed (raw diseaseRisk not village-cooked, unsafe `safe===false`, poisonRisk, monster-meat id). After the meal, `villageFoodPoisoning(v, exposure)` rolls per villager, mirroring the player's exact dice:
- raw meat → same `diseaseRisk.p` (rawMeat 0.35) → "food poisoning (raw meat)"
- unsafe food → 0.2 (player's suspect-food chance) → "bad belly"
- poison → item's `poisonRisk.p` → "poisoned"
- spoiled → **desperation path only**: spoiled stacks are still skipped when fresh food exists; a starving village eats them and rolls 0.5 → "spoiled gut" (severity 2). Announced, never silent.
- new cases capped at 3/meal — one bad pot can't wipe the village.

Sick villagers reuse the existing `v.sick` pipeline (stay home, drain, recover-or-die via `hurtVillager`).

**Monster-meat weirdness — design call (Steve can overrule):** YES, villagers get the full table. `villagerMonsterWeirdness(vid, item, chanceOverride)` mirrors `maybeMonsterWeirdness` with the same chances (raw 35% / cooked 20%), applies the status to the villager's own status list via `applyStatus` (silent engine apply + villager-voiced say line), records `meatDisease` in the Codex (the village saw what happened — knowledge earned, not given), and `remember`s it. Statuses tick down on the same dayPart clock as the player's (4 ticks per daily `villageSicknessTick` pass — these statuses have no tick damage, so it's purely duration). Signature beat: howlbelly + night → the watch hears the howling, narrated + remembered. Kept cheap: no mechanical hooks into villager combat/movement, just the story.

## Proofs

`scripts/test-food-granularity-20261008.js` — 14/14 (seeded mulberry32):
- stockPantry(3000) → no piece > 600, total conserved, divisible units
- villageMeal best-fit: 2000 need takes 5×400 strips, legacy 3000 slab untouched even when more perishable; slab eaten as last resort
- raw meat (p=1) → villagers sick with food poisoning; clean cooked → nobody sick
- spoiled skipped when fresh food exists; starving village eats it and gets sick
- villagerMonsterWeirdness: fires on forced roll, applies howlbelly to the villager, no double-apply

**Regressions:** test-food-reality 90/90, test-cooking-model-20261008 all pass, test-parity-food 2/2, test-food-break-pantry-phantoms 11/11, test-food-break-blood-engine 7/7, test-break-food-spoilage/pantrycap/merges/timeskip all pass, ontology 48/48.
**Pre-existing (not mine):** test-village-share-food 16/15-fail is identical on the base commit.

## Files
- `src/js/game.js` (+230/−16): stockPantry granularity, villageMeal best-fit, villageEats exposure + desperation path, new `villageFoodPoisoning`, new `villagerMonsterWeirdness`, villageSicknessTick status ticks + howlbelly night beat.
- `scripts/test-food-granularity-20261008.js` (new): the proof suite.
