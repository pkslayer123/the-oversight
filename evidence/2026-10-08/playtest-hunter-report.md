# Hunter adversarial playtest — 2026-10-08b (worktree playtest-hunter)

Hostile player, hunting verbs. Harness: full src/js list in index.html order
(minus app/sprites/tile-scenes/move-anim/drama, plus statusEffects),
mulberry32 seeded BEFORE eval, window stubbed for eval then deleted.
Proofs run ×3 seeds (20261008, 7, 99).

## BREAKS FOUND (all fixed, proofs green)

### B1. Refused Field Dress tap eats 30 min + 40 kcal, then double-narrates
- **Break:** `Game.useAbility('field_dressing','dress_game')` with no carcass
  in the pack paid the action cost (time_min 30, kcal 40) BEFORE the
  no-carcass refusal fired inside the impl — then said BOTH "No game to
  dress..." AND "Nothing happened. (Field Dress fizzled.)". Same class as
  the brawler-loop refused-tap fix (second_wind XP farm).
- **Fix:** `ABILITY_ACTION_PRECHECKS['field_dressing.dress_game']` refuses
  before costs (no unprocessed carcass → `{ok:false}`); useAbility's fizzle
  fallback now only speaks when the impl said nothing (say-count guard),
  honoring the documented contract.
- **Proof:** scripts/test-hunter-dress-refusal-20261008b.js — FAIL on old
  code (delta=-40 kcal, 2 msgs), PASS on new, ×3 seeds.

### B2. Trap catches never got the hunter's meat_yield skill bonus
- **Break:** strike kills bake `hunt.meat_yield` (×1.3 w/ Field Dressing)
  into the carcass at the kill; trap catches used raw `animal.calories`.
  Meanwhile dress_game's text claimed "(Field Dressing ×1.3 — your skill
  kept more of the carcass.)" — a lie in both directions: for strike kills
  the bonus was already earned (dress re-claimed it), for trapped game it
  never applied at all. Measured: rabbit carcass hiddenKcal=800 vs
  expected 1040 with the skill.
- **Fix:** checkTraps bakes `hunt.meat_yield` into trapped carcasses at
  catch time (same rule as kills); catch message reports the baked number;
  dress_game text drops the ×1.3 claim (dress converts, never multiplies).
  Judgment call for Steve's overrule: trapping = hunting, skill applies.
- **Proof:** same proof test (checks 3–4) — FAIL old / PASS new ×3 seeds.

## ATTACKS THAT HELD (genuine attempts, no break)
- **Trap supply consumption:** craft('snare') consumes vine+stick behaviorally;
  setTrap removes the tool from the tool row; catches bounded by trap uses
  (10-use snare broke on schedule over 15 seeded dawns; carcasses banked ==
  catches). No multi-catch per dawn per trap (setDay reset gates it).
- **Trap with undefined uses = infinite catches:** REAL code path
  (`trap.uses -= 1` → NaN, `NaN <= 0` false, trap never breaks; 2 catches /
  6 dawns, still set) — but NO reachable in-game path found: every trap
  recipe has uses, craft stamps them, the snare-wire shortcut stamps 2.
  Defensive backfill (like nets' `uses == null → 12`) noted, not applied —
  no reachable exploit, minimal-diff rule.
- **Corpse double-dip:** dress_game splices the carcass out (2nd tap:
  "No game to dress"); cleanCarcass re-clean of same slot: "No carcasses
  to clean."; lootCorpse across decay stages (fresh→bones): each stage
  yields only remaining units, nothing regenerates. All held.
- **Meat rot off-corpse:** field corpses carry no meat (animal corpses:
  hide only; monster: trophies; person: dried meat spoilDay 9999 — dried,
  correct); meat travels as inventory carcass with spoilDay=day+2, and rot
  is past saving (cleanCarcass drops rotten). Design "meat left on the
  corpse rots" holds via the carcass spoil clock.
- **Trap vs monster:** no interaction anywhere (movement, combat, checkTraps
  all prey-only); all trap recipes catch animal ids only, no monster
  promises in text. Honest pass-through, by design.
- **Butcher honesty:** knifeless cleanCarcass fails honestly ("need a knife"
  + recipe pointer); blind clean yields 30% vs 40% known — honest, not
  gated (matches "button honest" doctrine). Slow-animal miss verbs fixed
  2026-10-07 (turtle tucks, gila holds ground — verified in code).
- **Softlocks:** pit trap on flee-by-barrier edge tile — sets on playerTile,
  checkTraps iterates 0..8, no crash; dress_game mid-combat refused by
  camp context ("needs calm and time — not in the middle of a fight");
  corpse tile + trap coexist, no interaction; villagers don't trigger traps.
- **Trap recipe text honesty:** all recipes catch animals only, no monster
  promises. Held.

## INCONSISTENCY NOTED (not fixed — needs Steve's call)
- lootCorpse applies trauma per visit (0→3→6 over 3 searches); corpseTakeItem
  applies once per corpse (first-touch idempotent, 6→9→9). Module header says
  "once per corpse". Not exploitable (it's a cost), so left as a design call.

## PRE-EXISTING STALE TEST (not mine)
- scripts/test-hunter-wiring-fixes-20261007.js: "stealth.move_silent = 0.3
  with stalk held — got 0.15" FAILs on HEAD too. Steve's decided Stalk nerf
  (0.3→0.15, 2026-10-07) — the test expectation was never updated.

## Suites run (sequential, script harnesses)
- test-hunter-dress-refusal-20261008b.js: PASS ×3 seeds (new), FAIL ×3 (old)
- test-hunter-traps-20261007.js: 26 pass, 0 fail
- test-animals-hunt-20261008.js: 29 pass, 0 fail
- test-hunter-wiring-fixes-20261007.js: 38 ok, 1 pre-existing FAIL (above)
- test-hunter-ecology-20261008.js: 20 pass, 0 fail
- test-xp-attempts-20261008.js: 5 pass, 0 fail
- test-hunter-fixes.js: 17 pass, 0 fail
- test-trapline.js: 6 pass, 0 fail
- validate-ontology.js: all 50 systems validated, release permitted

## Files
- src/js/abilityActions.js (precheck + fizzle guard + dress text)
- src/js/game.js (trap-catch meat_yield bake)
- scripts/test-hunter-dress-refusal-20261008b.js (proof)
