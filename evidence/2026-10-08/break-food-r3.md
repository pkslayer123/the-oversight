# BREAK-IT: food economy — round 3 (2026-10-08, ~21:00 CDT, worker break-food-3)

Hostile-player audit, third pass. Prior rounds' evidence: `break-food.md` (rounds 1+2 —
blood engine, phantom pantry, merges, pantry cap, time_skip, spoilage boundary).
This round attacked only fresh surfaces: the blood wound gate (bc2bf4f), the water
economy (60deda1/5d5ed03), never-attacked food flows, honesty, dead code.
Proof: `scripts/test-break-food-r3.js` — 19 asserts, green × 5 seeds (1–5);
red pre-fix demonstrated (6 FAILs on reverted game.js).

## EXPLOIT — broke + fixed (3)

**R1. Blood Price mid-combat: the HP cost was erasable (REAL).**
`_activateAbilityInner('blood_magic')` had no combat guard and writes `s.health`
directly — but mid-fight the fighter's `p.hp` is the live value and `tbEnd` does
`s.health = Math.max(0, p.hp)`. A mid-fight Price (console-reachable; the combat
ability bar filters it, so the UI never offers it) kept the +500 kcal AND opened
the wound (maxHealth drop persists) while the −10 HP cost was silently erased at
fight end — strictly better than the intended price. Fix (design call): refused
mid-combat — "the Price needs a steady hand, and a cut opened now would never
close right" — same pattern as time_skip's combat refusal. Proof W1a/b/c.

**R2. Mantle transfer inherited the dead bearer's blood wound (REAL).**
`playerDeath` (ledger.js) reset statuses/diseases/poisons ("new body, no old
afflictions") but not `bloodPriceWound` — the successor woke with the old body's
missing mass: reduced maxHealth and an immediate "more scar than skin" refusal on
a body that never bled. (Also ordered wrong: `s.health = maxHealth()` ran with
the wound still applied, so the new bearer started at 70, not 100.) Fix: reset
`bloodPriceWound`/`bloodPriceDayPart`/`bloodPriceUses` on transfer, before the
health set. Proof W2a–d.

**R3. lootCorpse merged by plantId alone — round-2 F1's 9th site (REAL).**
`takeOne` folded looted meat into the pack stack on plantId match, keeping the
pack's `kcalEach` — looted 50-kcal venison into a 200-kcal stack laundered value
(same class as the pantry/theft merges). Fix: `stacksMatch` fungibility gate;
unlike stacks land as separate entries. Bonus (round-3 combat lesson): the rot
disease damage wrote `s.health` directly — now routed through `addHealth`.
Proof W3a/b.

## HONESTY — broke + fixed (3)

**R4. kcalCap sibling sweep (round-1 E1's class): 9 unclamped kcal sources.**
"no kcal source bypasses the bank cap" was enforced for blood/cannibal/
photosynthesis/cold_blooded/eat — but missed: field-dressing meat yield
(abilityActions.js), alien-player care packages ×4 (alienPlayers.js), contest
kcal effects incl. negative deltas (contests.js), contest bet payouts
(contests.js), villageMeal home + joined-village paths (game.js — hardcoded
`3000` let a 2400-cap bank overfill to 3000), driftTick gains (betrayal.js),
betrayal joined-village meal (betrayal.js — also 3000). All now clamp to
`kcalCap()`. Proof W4a–f. (The `Math.min(cap, Math.max(0, ...))` form preserves
the negative-delta floor for contest costs.)

**R5. villageEats' honestNet counted self-caught food as pantry burn.**
`honestNet = totalEat − totalGive` included `ownEat` — food villagers caught
themselves that never touched the pantry — inflating the burn and shortening
the haven screen's "about N days" estimate. Fix: `villagerMealDay` returns
`drawn` (real pantry outflow: best-fit draws + away rations); the clock runs
on `totalDrawn − totalGive`. Proof W6a–c.

**R6. DEAD CODE: `fillWaterFromVillage` deleted.**
Zero callers anywhere (live path is `fillWater()`, hardened by the survivalist
loop) and it skipped fillWater's 10-kcal hauling cost — a cheap-water hole if
anyone ever wired it. `drinkWild`/`drinkTreated` are also callerless but
explicitly marked legacy/kept-for-reference by a sibling — left alone.

## HELD (attacked, resisted — documented, not failures)

- **Wound gate economics**: knit is endDay-only (~10/night, no acceleration path —
  rest/sleep/heal don't touch the wound); refusal at ≥50 is a clean say+return
  (no phantom state); max wound 59 → maxHealth floor holds, no death-by-wound,
  no softlock. Sustainable ≈1 use/day (+500 kcal) — the design intent.
- **Water duty loops**: duties resolve once per endDayPart and the assignment is
  deleted ("one part per assignment — reassign to continue") — no infinite haul;
  10–14L dirty/daypart into a 40L cistern, villagers drink 2L/day each.
- **hearthBoil math**: `ceil(canBoil/6)` wood, total-preserving dirty→clean.
- **Cistern hoarding**: the player CAN drain the cistern into bottles while
  villagers die of thirst — but this matches the established pattern
  (takeWood is equally unattributed; theft is punished only when observed).
  Held by design consistency, not an oversight.
- **Cooking re-cook loops**: every cook path nulls rawKcal or flips foodState;
  cookTransform caps at gross; specialist meat bonus is skill-bounded.
- **Trader arbitrage**: selling fair-appraised food for credit and buying
  underpriced wares compounds across visitors, but wares are one-shot and
  visitors are finite events — a value engine, not a printer. Scam risk rides
  along. Held.
- **giveFood→trust→meal**: flat +12 trust per gift (cap 100) buys bigger
  villageMeal shares — strong payback, but it's the designed social contract
  ("sharing is the social contract"), paid in real food, losable via trust
  hits. Held.
- **Care packages**: 1-per-4-days gate holds (round 1); grants now cap-respecting.
- **Corpse rot clocks**: meat rots on the corpse (spoilDay runs via sweepSpoiled);
  looting is deliberate, weight/trauma/disease-gated, witness-observed.
- **Blood listing honesty**: abilityActions.js desc uses the live `bc` cost
  (10, or 7 with crimson_circuit), names the 2/daypart cap + wound refusal;
  `available` matches the engine's three gates exactly.

## Sibling sweep
All other `.kcal +=` / `.kcal = (` grant sites swept: eat() clamps, sleep
conservation can't exceed cap (refund ≤ burned ≤ cap), migrateReserve already
capped, contest telemetry reads only. `s.health` direct writes in food paths
checked for combat-erasure class — corpses.js was the only straggler (fixed).

## Proof results
- `scripts/test-break-food-r3.js` — 19/19 green × 5 seeds (1,2,3,4,5).
- Red pre-fix: 6 FAILs on reverted game.js (W1b, W1c, W4c, W4d-cascade, W5, W6a)
  — the test catches the breaks.
- Regressions green: forager-adversarial 26/26, break-food merges/spoilage/
  pantrycap, water-fire 19/19, food-reality 90/90, blood-engine 7/7,
  pantry-phantoms 11/11.
- `test-break-contests.js`: updated one stale source-regex ("engine pays 2x
  stake" → bank-capped form). Two remaining failures (MOOT_JUDGE terminal,
  cheer winOdds regex) are PRE-EXISTING on HEAD — contest loop's, untouched.
- `validate-ontology.js`: 50/50 valid.

## Design calls (Steve can overrule)
1. Blood Price refused mid-combat (fighter/scholar HP desync made the cost
   erasable; fiction: the cut needs a steady hand).
2. Mantle transfer clears the wound (the wound is the old body's missing mass).
3. Deleted dead `fillWaterFromVillage` rather than wiring it.
4. `kcalCap()` replaces every `3000` literal and unclamped grant — "the one number."
5. Burn clock measures pantry outflow, not total eating.

## Files changed
- src/js/game.js (combat refusal, fillWaterFromVillage deletion, meal 3000→cap ×3, honestNet)
- src/js/ledger.js (mantle wound reset)
- src/js/corpses.js (loot merge gate, addHealth routing)
- src/js/betrayal.js (driftTick + joined-meal cap)
- src/js/contests.js (kcal effect + bet payout cap)
- src/js/alienPlayers.js (4 care-package caps)
- src/js/abilityActions.js (field-dressing cap)
- scripts/test-break-food-r3.js (new, 19 asserts)
- scripts/test-break-contests.js (stale regex updated)
- evidence/2026-10-08/break-food-r3.md (this file)

## Observed, out of scope
- `lootCorpse(takeAll=true)` takes ONE unit per stack entry, not the whole
  stack — "take all" under-delivers. Pre-existing corpse-system UX, not a food
  exploit; left for the corpse loop.
- game.js's `activatableAbilities()` remains shadowed dead code (abilityActions.js
  overwrites it; round 2 noted). Its stale time_skip "Ages you 1 day" copy lives
  on there — dead, but a future reader could be misled.
