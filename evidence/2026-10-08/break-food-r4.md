# BREAK-IT: food economy — round 4 (2026-10-08, ~22:10 CDT, worker break-food-r4)

Hostile-player audit, fourth pass. Prior rounds: `break-food.md` (r1+r2),
`break-food-r3.md`. This round attacked only fresh surfaces — no re-litigation
of r3 unless a fix regressed (none did).
Proof: `scripts/test-break-food-r4.js` — 33 asserts, green × 5 seeds (1–5);
red pre-fix demonstrated (5 FAILs on stashed src).

## Assigned lead: blood_magic per-day gate (memory said "NO per-day gate, +21,600 kcal/day")

**The lead is STALE — resolved in an earlier round.** `blood_magic` now has
three stacked gates (2/daypart cap, wound +10/use with ~10 knit/night and
refusal at 50, maxHealth ratchet while the wound is open). Measured in-proof
(W1, most generous to the attacker — free perfect healing between uses):
- 2/daypart cap fires exactly (3rd use refused, rule named in the refusal).
- Wound refuses at ≥50 → ≤5 uses before the body refuses.
- 6-day simulation with the real nightly knit: daily gains
  [2500, 500, 500, 500, 500, 500] — sustained ≈1 use/day (+500 kcal), total
  <6,000 over 6 days. The +21,600/day measurement is dead. **HELD** (fixed
  earlier; gates verified, not assumed).

## EXPLOIT — attacked

- **E1. cannibal_frenzy → gift-repair loop.** The trust −30 IS repairable via
  gifts, so I measured the loop instead of assuming it prints. Finding: the
  LIVE giveFood is carexplore.js's progressive override (bite 4 / meal 10 /
  full 16, ×1.5 private, then trustGainProgressive: full rate <50, half
  50–75, quarter 75–90, ~1pt 90–100) — NOT the dead flat +12 in game.js:2733
  that r3 analyzed (r3's "held" conclusion stands, stronger than stated).
  Repairing −30/villager through the live path costs on the order of 10+
  gifts ≈ more food-kcal than the frenzy's +1000 grants. **The loop is not a
  practical printer** — the issue was honesty, not economy (see H2).
- **E2. stockPantry pantry-cap bypass.** stockPantry() doesn't check
  pantryCapKcal — but only system grants use it (expedition hauls, weregild,
  genesis fruit, NPC duty resolutions); every PLAYER path (donateToPantry
  wrapper, pantryAdd/putAwayFinished) enforces the cap. Not player-farmable.
  **HELD** by path separation — documented, not changed.

## HONESTY — broke + fixed (3)

**H1. Bulk eat() never granted the L3 "+5 health when eaten" benefit (REAL).**
`eatOne()` (per-item path) grants +5 health per bite at plant level≥3;
`eat()` (the live Eat-button path, app.js:964) granted nothing — while its
own level-up message promises "(+5 health when eaten)". The message lied on
the main path. Fix: per-bite +5 at pre-call L3 in the loop, plus a one-time
+5 on the 2→3 transition (matching eatOne, whose post-transition check
grants it for the level-up bite). Proof W2a/b.
*Observed, out of scope:* bulk eat() doesn't advance MEAT tastings/benefits
at all (meat knowledge only moves via eatOne). No promise is broken on the
bulk path, so this is a knowledge-progression gap, not an economy lie —
left for the knowledge loop.

**H2. cannibal_frenzy "Trust -30, permanently" was false (REAL).** The trust
number is fully repairable (see E1). Fix: the copy no longer claims
permanence for the number — instead every witness gets a permanent
`saw_cannibalism` memory (`remember()`, which the memory system never
forgets). "They will not forget what they saw" is now the honest permanent
part: the trust hit is expensive to repair, the memory is forever. Engine
message (game.js) + live listing (abilityActions.js) updated. The game.js:14903
copy lives in the DEAD `activatableAbilities()` (shadowed, kept-not-deleted
per the sibling's decision) — left stale deliberately, noted here. Proof
W3a–d.

**H3. howFarOptions 'raw' detail understated shelf life (REAL).** It used raw
`spoilDay − day` while `stashClock`/`isSpoiled`/`spoilClockShort` are all
bonus-aware (`spoilBonusDays()`, preservation_instinct). One boundary,
everywhere — the label now adds the bonus. Proof W4a.
*Sibling sweep:* grepped all other `spoilDay − day` labels — none others miss
the bonus; grepped all remaining "permanently" copy — only the dead
frenzy copy (above).

## SOFTLOCK — attacked, held

- Starvation: `engine/calories.js resolveDay` — bounded spiral (≤25
  health/day from starvation, slow by Steve's design), floors at 0, death via
  the normal health gate. No dodge (sleep can't erase it — the crisis check
  halves shelter healing), no instant-death trap. **HELD.**
- Pantry UI: `donateToPantry` refuses over cap with the item kept (W8a);
  `pantryKcal` compat counter re-derived from items after every mutation;
  `pantryDays` readers use the r3-fixed honestNet outflow. **HELD.**

## DEAD CODE — checked, held

- index.html loads food.js, storage.js, corpses.js, engine/calories.js (W5a).
- All 12 probed food.js methods reachable as Game methods (W5b); the
  remaining food.js functions are internal helpers with in-module callers
  (verified by grep: plantFieldClick, lumpFormOf, whoKnowsLump,
  seedBackgroundPlantKnowledge, migrateLumps, testMonsterMeat, watchFauna,
  askSystemAbout, sortBag all have callers). The known legacy exceptions
  (`drinkWild`/`drinkTreated`, dead `activatableAbilities()`) are explicitly
  marked kept-for-reference by siblings — untouched.

## Also verified held (attacked, resisted)

- **W6. Save/load:** spoilDay round-trips through JSON serialization;
  `isSpoiled` boundary identical before/after. No spoilage reset via save/load.
- **W7. feastBurn:** burns exactly the stated 300/400 banked kcal, returns the
  stated multiplier, never eats below the fed line. No kcal creation.
  (Note: baseline bank is 0 by design — feastBurn needs skillset bank
  expansion; the test stubs bankMult×2.)
- **W8. Pantry cap:** player entry points enforce; system grants bypass but
  aren't player-triggerable.
- Spoilage is consistent across pack / prep stash / pantry / buried caches /
  corpses (absolute spoilDay everywhere; caches rot underground — "the earth
  doesn't stop time").
- Cook/preserve/clean/shell are all single-fire state machines
  (foodState flips block re-processing); cookTransform caps at gross.
- Villager expedition/duty hauls are NPC-sim abstractions (expeditionCache
  300–1200 kcal RNG, duty forage depletes REAL tiles via villagerDepleteTiles)
  — not player-triggerable, not an exploit surface.

## Proof results

- `scripts/test-break-food-r4.js` — 33/33 green × 5 seeds (1,2,3,4,5).
- Red pre-fix: 5 FAILs on stashed src (W2a, W2b, W3c, W3d, W4a) — the test
  catches exactly the three breaks, nothing else.
- Regressions green: break-food-r3 19/19, forager-adversarial 26/26,
  break-food merges/spoilage/pantrycap ALL CHECKS PASSED, blood-engine 7/7,
  pantry-phantoms 11/11, break-food-engines ALL CHECKS PASSED,
  break-food-timeskip ALL CHECKS PASSED, cache-spoilage 19/19.
- `test-food-reality.js`: 90/90 in 14 of 16 runs (2 early runs showed 1–2
  failures in "shelling known by all" / "villageEats tolerates carcass
  pantry"); pristine tree ALSO flakes 2/10 — pre-existing test flakiness,
  unrelated to this round's changes (no mechanism: the changed code paths
  aren't read by those asserts).
- `test-pantry-days.js`: 6/3 fail identically on pristine — pre-existing,
  not mine.
- `validate-ontology.js`: 50/50 valid.

## Design calls (Steve can overrule)

1. Bulk eat() now honors the L3 "+5 health when eaten" promise (per-bite at
   L3 + one-time on the level-up bite) — engine matches its own copy.
2. Frenzy: dropped the false "permanently" for the trust number; added a
   permanent witness memory instead. The permanent thing is that they
   remember, not the number.
3. howFarOptions spoil label is bonus-aware (one spoilage boundary everywhere).
4. Blood lead closed as stale: gates verified by measurement, ~1 use/day
   sustainable (+500 kcal) — min-max edge, not dinner, as designed.

## Files changed

- src/js/game.js (bulk eat() L3 benefit ×2 sites; frenzy memory + message)
- src/js/food.js (howFarOptions bonus-aware spoil label)
- src/js/abilityActions.js (frenzy listing desc)
- scripts/test-break-food-r4.js (new, 33 asserts)
- evidence/2026-10-08/break-food-r4.md (this file)
