# Meals like people (2026-10-08)

Steve's direction: "I think our village meal mechanic is off too. Villagers should eat and act like people." Then the correction: "Yes villagers definitely suffer consequences of what they eat, but we shouldn't assume that everyone gets together for a big communal meal every day."

## Verify-before-fix

`/tmp/verify-before.js` against the old code: one `villageEats()` pass produced a single aggregate `v.lastEat = 6333`, zero per-villager meal records, zero preference/social traces — 12 villagers of 4 temperaments ate as one synchronized abstract drain. The mechanic was off, as Steve said.

## What changed (src/js/game.js, src/js/villager-objectives.js)

**Tore out:** the collective drain. `villageEats()` no longer loops the roster computing abstract produced/needed into one pantry burn. Rewrote it as a per-villager day: `villagerMealDay()` per person, with the honest burn clock (`lastEat`/`lastGive`/`lastProviders`/`burnHistory` + player `lastPlayerMeal`) kept — the haven "about N days" still runs on measured eating.

**Kept (landed food work, not regressed):** granular pieces, best-fit draws, villager food poisoning (raw/unsafe/poison/spoiled/monster-weirdness), desperation spoiled path, `villagerMonsterWeirdness` (restored after my splice accidentally dropped it — caught by the granularity suite).

**New: how villagers eat like people**
- **Real items, one draw per day** (`pantryDraw` extracted from `villageMeal`'s inline loop and shared): best-fit smallest-first, spoiled skipped. The day's food is drawn ONCE per villager — one rounding, the same honest accounting the old pass had. (First attempt did a ceil per sitting; the compounded overdraw starved the last eater. Fixed.)
- **Rounding that acts like people** (`round:'floor1'`): villagers eat to their need and stop — no forced extra 400-kcal piece for 55 kcal. Only an indivisible piece smaller than the want gets eaten whole (no fractionating, per Steve). The player's `villageMeal` keeps its proved ceil.
- **Desperation is honest** (`shortOfFresh`): spoiled stores are eaten only when the fresh candidates genuinely can't cover the want — tested via remaining fresh kcal, not via rounding residue. Two earlier attempts got this wrong (first: `taken < want` fired on floor residue; second: single-stack loops never reached the crumb-break). The granularity suite's "spoiled skipped when fresh exists" now passes for the right reason.
- **Rhythms** (`mealRhythm`, from temperament, stable): gorge (bold/intense/prickly/mischievous/earnest — one big meal, sometimes fasts), grazer (restless/fidgety/anxious — 3-4 small), dawn-dusk (everyone else — 2). No synchronized village.
- **Tastes** (`foodPrefs`, two axes from temperament): meat-likers vs plant-likers vs neutrals. Favorites lift social + remembered; disliked food gets complained about (memory + occasional said line).
- **Company is organic, not scheduled** (`logSitting` + `v.mealLog`): no daily feast event. When rhythms land villagers at the same fire at the same part of day, some linger — small social bump, remembered both ways, occasional line. Away villagers eat alone from the pack (no log entry).
- **The cook matters** (`villageCookId` = home villager who knows most about food): credit when someone loves the meal, blame when the cooking sickens someone — through memory + said lines, never silent.
- **Consequences** (`villagerFoodPoisoning`, per-person refactor of the old village-level roll): same dice as the player. Also fixed a quiet bug the old code had — village-cooked monster meat rolled the RAW weirdness chance; now cooked counts as cooked.
- **Away villagers** eat from real pack rations: `packKcal` reseed now draws real pantry items at dawn (not phantom kcal); risks ride in `p.risks`, claimed once per day (`packMeal`).
- **Starvation has a face**: ate < 60% of need → −8 health + occasional "went to sleep hungry". Famine (bare pantry) → −5 all, +2 recovery, scattering countdown kept.
- **Hunger is a real need now**: accumulates through the day, eased by actual eating (replaces the old end-of-day clamp that pinned hunger ≤ 15 whenever the pantry wasn't empty).
- **Objectives hook**: EAT is now an indoor objective kind — hungry villagers visibly go to the hall and eat (60/60 picks when hungry with food available). Flavor line in the indoor tick. Ontology header updated.

## Design calls (Steve can overrule)
1. Floor-rounding for villagers vs ceil for the player — villagers stop at enough; the player's proved behavior untouched.
2. Cook = most food-knowledgeable villager home, not a fixed role. Knowledge is the credential.
3. Poisoning rolls once per day per villager (over the day's food), not per sitting.
4. Consumption stays at the day boundary (endDay sim); the EAT objective is the visible behavior. A mid-day pantry drain would double-count against the day sim.

## Proofs — scripts/test-meals-like-people-20261008.js: 20/20
- per-villager mealLog across ≥2 dayparts; pantry burned real items; burn clock ticks
- tastes: meat-lover remembers loving, plant-lover complains, social moves
- away villager: no co-eating entry, real pack ration drawn from pantry
- shared part+place happens organically; records are per-person, never one feast
- desperation: spoiled-only pantry → eaten + spoiled-gut cases
- cook blamed (poison p=1) and credited (forced appreciation)
- 30 village-days in 15ms
- ≥2 rhythms per village

## Regressions
- test-food-granularity-20261008: 14/14 ✓
- test-food-reality: 90/90 ✓
- test-cooking-model-20261008: ALL CHECKS PASSED ✓
- test-parity-food-20261008: 2/2 ✓
- test-villager-objectives-20261008: 16/16 ✓
- validate-ontology.js: 48/48, release permitted ✓
- test-village-share-food: 16/15 — IDENTICAL on base HEAD (pre-existing, not mine)
- 10-day endDay smoke: 0 errors; village starves honestly when food runs out (2 deaths on a 60k-kcal start); 9 villagers hold meal memories

## Files
- src/js/game.js: +~450/−~230 — pantryDraw/trackMealExposure/freshExposure/mealRhythm/foodPrefs/villageCookId/stockSurplus/drawSpoiled/packMeal/villagerMealDay/logSitting/seasonMeal; villageEats rewritten; villageFoodPoisoning → per-person villagerFoodPoisoning; villageMeal uses pantryDraw; packKcal honest rations
- src/js/villager-objectives.js: EAT objective kind + indoor flavor + header
- scripts/test-meals-like-people-20261008.js (new)
