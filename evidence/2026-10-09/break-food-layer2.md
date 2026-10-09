# Break-it: food economy, layer 2 — 2026-10-09

Target index 1 (second layer). Layer 1 (same day) killed F1 pantryAdd toxin
laundering and F2 cache preservation_instinct — see break-food.md; not re-proven
here. Proof: `scripts/test-break-food2-20261009.js` (42/42 × 3 seeds AFTER;
BEFORE mode fails exactly the two fixed assertions).

## KILLS (broke, fixed, proven)

### G3b. _deathCorpse phantom across save/load (EXPLOIT-adjacent, meat loss)
`syncRun` JSON-round-trips the fighter list, so a mid-fight save turns
`fighter._deathCorpse` into a DETACHED snapshot. On `load()` it was restored
verbatim — and `corpseForKill` prefers `mf._deathCorpse`, so when the reloaded
fight ended, `tbEnd`'s per-kill reward loop pushed the carcass `meatEntry` onto
a phantom corpse no UI can ever render or loot, while the REAL corpse in
`state.corpses` stayed meatless. The say line still promised "the carcass is
there on the ground — search the body." The kill's food vanished.

Fix (game.js `load()`): reattach `ft._deathCorpse` to the real corpse by id;
if the real body is gone, delete the snapshot so `corpseForKill` falls back to
its node+species search and the meat lands on a lootable body.
BEFORE: detached snapshot (proven). AFTER: `===` the state corpse.

### G7. preserveFood prep lies when unskilled (HONESTY)
Unskilled smoking stamps `spoilDay = day+15` but the item copy always said
"Smoked. Keeps ~a month." The decision UI (`smokeKcal` detail: "keeps ~15d")
was already honest — the item itself lied. Fix (food.js): unskilled smoke now
reads "Smoked (rough job). Keeps ~two weeks — a real preserver could do
better." Skilled smoke keeps the month claim (day+30, honest).
BEFORE: prep="Smoked. Keeps ~a month." + spoilDay day+15. AFTER: honest both ways.

## SIBLING SWEEP
- Prep-copy class: every other duration claim checked against its stamp —
  cleanCarcass "~2 days" (day+2), specialist smoke "well over a month"
  (day+30+5·skill), cook decision UI "~5d"/"~30/15d", reveal-path "~2 days"
  (state-class description; live clocks carry the countdown). No other lies.
- Phantom class: `_deathCorpse` is the only identity-sensitive fighter field
  that survives the save round-trip (`_pendingPack` rebuilds from id+count).
  No other phantom-push sites.

## HELD (attacked, resisted — documented)

- **G1 corpse rot laundering**: lootCorpse/corpseTakeItem/corpseUseItem copy
  items as-is — NO spoilDay re-stamp anywhere. Monster carcass meat carries a
  real spoilDay (day+3); sweepSpoiled rots it on the body with the raw
  boundary; cleanCarcass refuses rot and re-stamps to day+2 (intended
  processing, not laundering).
- **G2 late-loot**: past the clock, the meat is gone from the corpse before
  you can loot it. corpseEatItem on rot moves a copy to the pack but eatOne
  refuses — zero kcal granted.
- **G3a save/load dupe**: corpses persist in state with mutated units; a looted
  corpse yields nothing after a JSON round-trip. No regeneration path in load().
- **G4 blood_magic gate**: 2/daypart enforced via `day-dayPart` key; resets
  honestly on daypart change AND day rollover; survives save/load; wound
  accumulates (+10/use), maxHealth drops by the wound, body refuses at ≥50,
  ~10 knits/night in endDay (proven behaviorally); menu availability mirrors
  the gate; +500 kcal clamped to kcalCap. The `_activateAbilityInner` trailing
  `return true` keeps the earned-XP contract intact (checked — not a bug).
- **G5 trader arbitrage**: no infinite loop. Credit ≠ food; wares are sold-once;
  traderPay consumes real food (two-pass, failed payment leaves the pack
  untouched). Bounded faucet noted (not a kill): trail rations cost 400–700
  food-kcal for 1050 kcal of food — a good deal per trader, finite cart, one
  trader at a time. Sell-back appraises 'cautious' (140/unit when the trader
  doesn't know the item), capping the buy→sell credit loop at ~+20/trader.
- **G6 fan packages**: apCarePackage 1/4 days (favor≥20, 25%/day), apDeadDrop
  1/3 days, apPersonaPackage 1/6 days — all kcalCap-clamped, cooldowns persist
  in apState across save/load. Not farmable.
- **G8 meal-chain softlocks**: villageMeal with empty pantry (honest "No food
  in the pantry", no crash); pantryDraw skips 0-kcal/0-unit items; villagerMealDay
  with empty pantry returns a result; feedRiverTrader famine path takes the
  honest shortfall ("scrape together") branch. No stuck states, no phantom
  promises (feed promises are per-person, kept on the handoff).
- **G9 dead code**: stashClock/spoilClockShort re-render from live spoilDay
  (proven by mutation); app.js calls Game.stashClock per row. The dead
  game.js giveFood(vid) flat+12 is fully shadowed by carexplore's progressive
  2-arg giveFood (Game.giveFood.length === 2).

## Regressions
- Ontology: 50/50 validated (docs/ONTOLOGY.md regenerated, no content change).
- Layer-1 suite scripts/test-break-food-20261009.js: 116/116 still green.
- New proof scripts/test-break-food2-20261009.js: 42/42 × seeds 20261009, 7, 99.

## Files changed
- src/js/game.js — load() reattaches _deathCorpse by id (phantom fix)
- src/js/food.js — preserveFood unskilled prep honesty
- scripts/test-break-food2-20261009.js — new proof test
