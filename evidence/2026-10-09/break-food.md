# Break-it: food economy — 2026-10-09

Target index 1. Hostile pass over the eating/cooking/preserving pipeline,
pantry/haven stores, hidden caches, spoilage clocks, the ONE-kcal economy,
and corpse-meat rot. Proof: `scripts/test-break-food-20261009.js`
(116/116 × 3 seeds AFTER; BEFORE mode demonstrates the two kills).

## KILLS (broke, fixed, proven)

### F1. pantryAdd field-laundering → toxin wash (EXPLOIT)
`pantryAdd()` (food.js, the putAwayFinished choke point) rebuilt the pantry
stack from a SUBSET of fields — dropped `poisonRisk`, `hiddenKcal`, `rawKcal`,
`burnt`, `cookedKcal`. Payoff chain, proven in-test:
- poisoned belltoad-style meat → put away → pantry copy has no poisonRisk
- `trackMealExposure(pantryItem)` → 0 poison exposures → **villagers eat the
  toxin risk-free** (the meal engine reads `item.poisonRisk`)
- take-back via takeFromPantry → clean stack (poison gone)
- `hiddenKcal` loss also broke the cautious-test reveal math downstream

Fix: pantryAdd now carries the full processing-state contract, same field set
as takeFromPantry's takenStack (poisonRisk, hiddenKcal, rawKcal, cookedKcal,
burnt). BEFORE: 6/7 F1 assertions fail. AFTER: all pass.

### F2. caches ignore preservation_instinct (HONESTY)
`digUpCache` and `takeFromCache` (storage.js) used a raw `spoilDay <= today`
check instead of the bonus-aware `isSpoiled()`. A scholar with
preservation_instinct (+2d/level) had buried food **destroyed underground that
their own pack would still call edible** — the pack rule and the cache rule
disagreed on the same item. Fix: both paths call `this.isSpoiled(it)` — one
boundary everywhere. True rot (past the bonus window) is still destroyed,
proven by control assertions. BEFORE: F2d/F2e/F2h fail. AFTER: pass.

## SIBLING SWEEP (same bug classes, hunted and fixed)

- **SIB-A. Old-village pantry push** (game.js `returnToOldVillage`): same
  subset-push laundering as pantryAdd (dropped poisonRisk/diseaseRisk/etc.).
  Now carries the full field contract.
- **SIB-B. New-village pooling push** (game.js, "we pool food here"): same
  class — dropped poisonRisk/wellMade/burnt. Fixed to the full contract.
- **SIB-C. Trader appraisal** (betrayal.js `traderAppraise`): raw spoil check
  made the merchant refuse bonus-alive food your pack calls edible. Now uses
  `this.isSpoiled(it)` (guarded fallback preserved). Proven: refuses true rot,
  accepts bonus-alive meat.
- **SIB-D. Car-explore edibleStacks** (carexplore.js): raw check hid
  bonus-alive food from the edible list → `Game.isSpoiled(i)`. Also removed a
  dead `spillDay` clause (typo'd field, could never be set).
- **SIB-E. Immortal gift food** (game.js): the downriver trader's "Smoked fish"
  gift had **no spoilDay** — 200 kcal of immortal food. Now `spoilDay: day+30`
  (smoked keeps ~a month, like everything else smoked).

## HELD (attacked, resisted — documented)

- **H-recook**: re-cooking cooked meat refuses (wrapper needs `foodState
  'cleaned'`, orig needs `rawKcal` — neither survives a real cook);
  re-preserving refused outright; undercooked finishing cook still works
  (intended). kcal can never exceed the class gross (`min()` caps in
  cookTransform). Note: the wrapper's meat branch never nulls rawKcal, but no
  real meat item carries rawKcal (cleanCarcass doesn't set it), so the
  wrapper→orig double-cook is unreachable with real items.
- **H-clocks**: spoilClockShort/stashClock agree with isSpoiled at every
  boundary across spoilDay offsets −3..+4 and bonus 0/+2 (pack clock speaks
  only when urgent, stash clock shows the full range — intentional).
- **H-one-economy**: every kcal source clamps to kcalCap (eatOne, blood_magic,
  cannibal_frenzy); feastBurn spends exactly the stated banked amount, returns
  0 under 300 banked; overnight leak is exactly 20% of banked.
- **H-softlock**: eatOne on spoiled food refuses with an honest say, no state
  change; wrong-node digUpCache refuses with the cache intact.
- **H-carcass**: cleanCarcass yields 4×(gross×0.40/4) ≤ gross, refuses rot,
  requires a knife; re-cleaning impossible (foodState gate).
- **H-corpse-rot**: sweepSpoiled rots meat on unlooted corpses (Steve's rule
  holds — verified by prior suite test-break-food-spoilage S5).

## DEAD CODE

Static scan: all 50 food-pipeline APIs (food.js, storage.js, corpses.js,
engine/calories.js, engine/forage.js, villager meal chain) are referenced at
call sites; runtime smoke of foodMarker/mealQuality/resolveDay/registerDeath/
lootCorpse/forage engine passes. No dead modules (the Alien Players lesson
applied: every food module is in index.html and called).

## Regressions

Ontology: 50/50 validated. Prior suites green: test-break-food-spoilage,
-merges, -pantrycap, -engines, -r3 (19), -r4 (33), -timeskip, miser stash
village (19). playtest-miser-caches.js is flaky pre-existing (unseeded RNG +
short module list missing statusEffects.js → `seTickFighter` crash on random
combat); unrelated to this change, crashes identically on HEAD.

## Files changed

- src/js/food.js — pantryAdd carries full processing state
- src/js/storage.js — digUpCache/takeFromCache bonus-aware via isSpoiled()
- src/js/betrayal.js — traderAppraise bonus-aware via isSpoiled()
- src/js/carexplore.js — edibleStacks bonus-aware; dead spillDay clause removed
- src/js/game.js — two village-pantry subset-pushes carry full state; downriver
  smoked-fish gift gets spoilDay day+30
- scripts/test-break-food-20261009.js — new proof test (116 asserts)
