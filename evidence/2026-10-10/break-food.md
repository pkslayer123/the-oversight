# Break-it: food economy (target 1) — run 2026-10-10

Hostile-player attack on the food economy: infinite calories, duplication,
pantry/cache exploits, spoilage bypass, label honesty, dead code.
Canon read first: docs/CANON.md, docs/PRESERVATION.md, docs/ITEMS.md.

## CATCHES (fixed this run)

### E1 — cooking resurrected butchered-away calories (exploit + honesty + canon)
`cookTransform` derived meat's "gross" as `cleaned/cls.raw` (1/0.6 = 1.67x)
and cooked at `gross x cls.cooked` — a perfect cook delivered **1.42x the
cleaned value** (400-kcal portion → 567; 800 total → 1133). This contradicted:
- canon docs/PRESERVATION.md (cooked = 100% known yield),
- the howFarOptions decision label ("~400/portion"),
- the COOK PRESERVES comment (hunter loop 2026-10-08),
- the eat path (eatOne/eatStashOne grant cleaned kcalEach in full, so raw
  digestibility is 1.0 in practice — the 0.6 was invented),
- the village-meals path (game.js cooks cleaned meat at kcalEach = 100%),
- the specialist-preserver no-creation cap (capped at 1.00x).

The 2026-10-09 break-it run had "fixed" a 2.5x phantom (hiddenKcal gross)
by replacing it with the 1.42x model — still phantom, now canon-conflicting.

**Fix** (src/js/food.js, cookTransform): for meat, gross = the cleaned total;
perfect = 100% (outcome mults: decent 0.8, undercooked 0.7, burnt 0.4). The
ladder's reward is shelf life + safety, never new calories. Plants keep the
raw-digestibility model (their kcalEach is the raw NET; tubers 100 → 229
perfect is the canon design).

### E2 — sibling: askSpecialist meat-cook duplicated the old formula (same bug class)
The specialist branch inlined `gross = cleaned/cls.raw` **plus** the
+5%/level mult on top (~1.77x; the min(gross) cap caught it at 1.67x —
measured 667 on a 400 portion). Its whoOptions label promised "+5%/level".

**Fix**: the branch now calls the fixed cookTransform with a guaranteed
perfect outcome — skill buys reliability (never burnt/undercooked, worms
dead), never phantom energy. Label now reads "guaranteed perfect, safer".
Kept the unknown-flesh gate (kcalEach 0, hiddenKcal preserved) and the
no-class graceful fallback.

### H-label — howFarOptions blind-cook label promised the unreachable
`cookOutcome(knows=false)` can never roll perfect; blind ceiling is decent
(0.8x). Label said 0.85x (~340/portion on 400) — more than the engine can
ever deliver. Now 0.8x (~320/portion).

### Stale test blessing the bug (safety net)
scripts/test-food-reality.js had 6 stale assertions failing on HEAD too —
two predated the 2026-10-09 portion law (messy/skilled/specialist clean
units), three blessed the old 1.42x cook model ("1200 cleaned -> 1700
cooked — fire unlocks the gross"), one read the wrong inventory index. All
updated to canon engine behavior. 91/91 green now.

## Proof
- scripts/test-break-food-20261010c.js (new): 25/25 x 4 seeds
  (20261010, 7, 42, 99). **9 FAIL on HEAD** (567/1133/453/397/227/436,
  specialist 667, both labels), 25/25 green after.
- Prior suites (no regressions): test-cooking-model-20261008 ALL PASS;
  test-forager-pipeline-20261008 23/23; test-break-food-20261010 16/16;
  test-break-food-20261010b 19/19; test-break-food-20261009 116/116;
  test-break-food4-20261009 30/30; test-forager-cookall-fuel-20261009 18/18;
  test-food-break-blood-engine 7/7; test-food-granularity-20261008 14/14;
  test-food-reality 91/91 (after stale-assertion repair).
- Pre-existing failures unchanged by this run (identical on HEAD):
  test-food-break-pantry-phantoms 10/11 ("legacy Red Hunger" stale);
  test-food-reality had 84/90 before the stale repair above.

## SIBLING SWEEP (same bug class: phantom kcal / duplicated math)
- Corpses (corpses.js): no phantom yields — non-food parts kcalEach 0,
  "Dried meat" 400x2 honest.
- Pantry entries: every player-driven path enforces the cap
  (donateToPantry wrapper, putAwayFinished→pantryAdd, contests→pantryAdd).
  Direct pushes are world grants by design (stockPantry: genesis/weregild/
  quest/NPC-forage; tribute; homecoming/exile pools with the full field
  contract incl. parasiteRisk) — one-shot/sim income, not player loops.
- Donate→take round trip: conserves kcal exactly (proof E3).
- Gill net: uses stamped at set (12), item consumed, pre-fix backfill,
  ecology-limited species-honest catches (proof E4).
- BEANS can (mislabeled_beans): 350 kcal, baseEffect "350 kcal, honestly
  edible" — the old catch stays fixed (proof E5).

## HELD (attacked, resisted — design, not bugs)
- **hunt.meat_yield stacking** (ability x1.3 x synergy x1.5 x relic x1.15 =
  up to 2.24x carcass gross): earned bonuses on a depleting resource (tile
  ecology empties; trap shyness declines). Prior hunter runs blessed the
  "your skill kept more of the carcass" fiction. Documented, unchanged.
- **tidecaller fishing.yield x1.5** on netted fish: single source, 3
  requirements + minLevel 2, tile stock depletes. Same doctrine.
- **Dead code**: all 18 food.js ontology-provided exports have ≥2 call
  sites (proof D1). food.js is in index.html's script list and its methods
  attach to Game (verified by the harness eval).

## Note for Steve
Cooked meat portions are now worth what the labels always promised (perfect
= 100% of cleaned). If your pantry math felt generous lately, this is why —
the whole meat economy was running ~42% hot. No feel/mechanic change beyond
the numbers matching the copy; no [needs-eyes] (numbers-only fix, proof-
tested, no UI/behavior change).
