# Break-it: food economy, layer 4 — 2026-10-09

Target: fresh food-economy surfaces layers 1–3 didn't cover (cannibal path,
starting stock, prep-counter bites, specialist plant cooking, dead UI copy,
meat mastery). Proof: `scripts/test-break-food4-20261009.js` (30/30 × seeds
20261009, 7, 99 AFTER; 20/20 BEFORE confirms the kills).

Layers 1–3 (break-food.md, break-food-layer2.md, break-food-layer3.md) are
not re-proven here.

## KILLS (broke, fixed, proven)

### K1. eatCannibal skipped the spoilage gate (EXPLOIT/HONESTY)
`eatOne` routes `meat_human` → `eatCannibal` BEFORE its own rot check, and
`eatCannibal` (corruption.js) never checked `isSpoiled` — rotten human meat
ate at full 550 kcal/portion via the Pack menu. The bulk-eat path was already
safe (its findIndex skips spoiled items). Fix: bonus-aware `isSpoiled` gate
at the top of `eatCannibal`, mirroring eatOne (refuse + say, rot left for the
dawn sweep). BEFORE: rot eaten (meals+1, +550 kcal). AFTER: refused, units
intact, fresh meat still eats.

### K2. Immortal staples (SPOILAGE BYPASS — the big one)
`spoilDay: 9999` on food the sweep can never clear:
- the **~47k-kcal STARTING PANTRY** (game.js newGame): dried beans, rice,
  canned soup, dried meat, peanuts — a hoarder could sit on the opening stock
  for months, contradicting the "scarcity comes fast" design;
- the player's starting **trail mix** (immortal, while the dried meat right
  below it honestly said 30 days);
- the exile **founder's cache** (betrayal.js `_forkNewHaven`);
- corpse-looted **dried meat** (corpses.js `generatePossessions` practical pool).
Fix: honest long clocks — dried/smoked-class day+30 (PRESERVATION.md), dry
staples/cans day+365, trail mix/peanuts day+60. The two-week design window is
untouched; only indefinite hoarding dies. BEFORE: all 9999. AFTER: finite,
bonus-aware boundary honored.

### K3. Counter bites skipped worm + poison rolls (EXPLOIT/HONESTY)
`eatStashOne` (prep-counter "raw now") rolled `diseaseRisk` ONLY — raw bear
meat off the counter skipped the trichinosis roll AND the poison roll that
`eatOne` performs, and lacked the shellgut guard on the disease roll. Fix
(food.js): mirror eatOne's parasite + poison rolls with the shellgut guard.
Also the copy always said "You eat it raw" even for cooked/smoked/pemmican
bites — now honest by foodState. BEFORE: 0 worm/poison rolls. AFTER: both
roll at forced p=1 in-test.

### K4. Specialist plant-cook granted zero digestibility (HONESTY)
`askSpecialist` 'cook' for `needsCooking` plants just cleared the risk and
left `kcalEach` untouched — while the copy promised "better than you could
do" (the player's own fire runs `cookTransform` and gains real net kcal).
Fix (food.js): the branch runs the same `cookTransform` (knows:true,
+5%/skill), day+5 clock, honest prep. BEFORE: 100 → 100. AFTER: 100 → 263
(tuber, skilled).

### K5. whoOptions smoke-time lie in the dead branch (HONESTY/DEAD-CODE)
The unwired `whoOptions` 'preserver'/'you' branch said "8 ticks" — smoking
costs 16 (Steve 2026-10-09). Only 'butcher' is rendered today; the copy must
be true if the rest ever gets wired. Fix: 16 ticks.

### K6. Meat mastery paid +10 health/bite vs the +5 promise (HONESTY)
At mastery, `deepKnown` (+5/bite) and `masterKnown` (+5/bite) both fired —
+10/bite, but the mastery copy promises "+5 health every time you eat it"
(which deep-known already delivers). Fix (game.js eatOne): elif — mastery
keeps the +5, doesn't stack a second. BEFORE: +10. AFTER: +5.

## HELD (attacked, resisted — with numbers)
- **giveFood trust economy**: every gift consumes real edible units; trust
  gains are progressive (trustGainProgressive) + public/private beats;
  stolen-food recognition denies the gain. No free-trust loop.
- **donate/take-back revoke ledgers**: giveTrust/giveXP unwound on take-back
  (both single and bulk paths) — re-verified intact.
- **stacksMatch merging**: name+kcalEach+spoilDay+kg+hiddenKcal+rawKcal+
  safe/edible+kind+state+risks all compared — cross-clock merges refused;
  pantryAdd/takeFromPantry/digUpCache/buryCache all carry the full field
  contract.
- **lump split/identify**: splitLumpOut conserves units exactly
  (comp entry deleted, lump.units decremented, empty lump spliced).
- **prionRisk**: decorative on the item but rolled inline in eatCannibal at
  the item's stated 0.15 — consistent, not dead.
- **eatStashOne fullness**: kcal clamped to kcalCap (no overfill); raw
  cleaned meat grants the honest cleaned net (matches the howFarOptions "Eat
  raw now" promise: full portion kcal, 35% sick risk).

## SIBLING SWEEP
- Immortal-food class: starting pantry, starting pack, founder's cache,
  corpse loot all fixed; fan packages (alienPlayers/contests) already clocked
  (pday+9); trader wares carry spoilDay through purchase; debug-scenarios
  canned soup is debug-only.
- Spoilage-gate class: eatOne, bulk-eat, eatStashOne, eatCannibal, preserve/
  cook/render/specialist paths all refuse rot; sweepSpoiled covers pack,
  counter, pantry, corpses.
- Risk-roll class: eatOne (disease/parasite/poison + shellgut), eatStashOne
  (now same), eatCannibal (prion inline). No other eat path found.

## DEAD CODE
No dead food modules; all six fixed functions are live (verified wired:
eatCannibal via eatOne routing, eatStashOne via data-stash-raw, askSpecialist
via data-stash-ask*, whoOptions via 'butcher' render, generatePossessions via
corpse creation, _forkNewHaven via exile flow; corruption.js + food.js in
index.html). whoOptions' cook/preserver/shell branches remain unwired from
the UI (only 'butcher' renders) — copy fixed for the day they're wired.

## Regressions
- New proof: scripts/test-break-food4-20261009.js — 30/30 × seeds 20261009,
  7, 99 (AFTER); BEFORE mode 20/20 confirms kills. (Seed-7 note: the scholar
  can start with preservation_instinct; K1's rot setup uses the live
  spoilBonusDays() — the bonus-aware boundary is the design, not a bug.)
- Prior suites: layer-1 115/116, layer-2 41/42, layer-3 44/46, villager-grit
  21/22 — the 5 failures are IDENTICAL on pristine HEAD (verified via
  git-stash A/B): pre-existing, unrelated to this change (F3b re-cook RNG
  undercooked-allowed re-cook; G6 fan-package 25%/day RNG; food3 + grit
  knowledgeFactor cap drift at 2.0 vs 1.8 — sibling-side, flagged for the
  owner loop).
- Ontology: 52/52 validated (bodies only, no header changes).

## Files changed
- src/js/corruption.js — eatCannibal spoilage gate
- src/js/game.js — starting pantry + pack honest clocks; mastery +5 elif
- src/js/betrayal.js — founder's cache honest clocks (also fixed a const-
  inside-object-literal syntax slip before it shipped)
- src/js/corpses.js — corpse-loot dried meat honest clock (gear stays 9999)
- src/js/food.js — eatStashOne parasite/poison/shellgut + honest copy;
  specialist plant-cook digestibility; whoOptions smoke 16 ticks
- scripts/test-break-food4-20261009.js — new proof test
- evidence/2026-10-09/break-food-layer4.md — this file
