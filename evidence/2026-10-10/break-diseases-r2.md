# Break-it: diseases, round 2 (2026-10-10)

Target: disease system, deeper layers. Round 1 (commit 9b791347: tick-escalation
lie, legacy mirror desync, rattlesnake phantom mirror, dead chronic/tickRolled;
persistence r8 a985b247: _seSeq save/load collision) is NOT re-litigated —
regression-verified green (53/53) and left alone.

Canon read first: docs/CANON.md + docs/DISEASES.md. Two pools, never mix.
Eurika/East Nile/Lemons are ALIEN (giant-mosquito / alien-tick monster fights),
permanent warping, never touched by mundane medicine. Min-maxing welcome.

## CATCHES (3 — all fixed, proof below)

### 1. EURIKA-SENSE TENT-BREACH GAP (honesty) — src/js/game.js
The eurika def promises "ambushes announce themselves first". The map-wanderer
contact path honored it (worldTick: flap-catch, "no ambush"), and eyes_in_back
got the same treatment in wandererTentBreach — but the tent breach itself had
NO eurika branch. A eurika carrier asleep in a tent got the full silent breach:
tent wrecked, -5 health, monster inside, zero warning. The breach IS an ambush.
Fix: eurika branch in wandererTentBreach mirroring eyes_in_back — sensory
hairs catch it at the flap, you're out the other side before it gets inside,
still a real fight (pendingEncounter set).

### 2. SHELLGUT UNSAFE-FOOD LIE (honesty) — src/js/game.js (eat + eatOne)
Shellgut promises "immune to ingested poison and food-borne disease" /
"nothing ingested can touch you". diseaseRisk/parasiteRisk/poisonRisk were all
gated on the quirk — but the suspect-food roll (safe===false, 20%/-5 health via
food.poison_chance) was not. A shellgut carrier eating dubious food still took
the hit. Fix: gate the unsafe roll on shellgut in both eat() and eatOne().

### 3. SIBLING SWEEP — villagerFoodPoisoning (same bug class)
A villager carrying shellgut (via villagerMonsterWeirdness) could still be
sickened by the RAW / UNSAFE / POISON meal-sim branches — same promise, same
lie, different file region. Fix: armored villagers skip those three branches.
SPOILED deliberately NOT gated: "the rot always collects" is an explicit
design statement (desperation), and rot is neither poison nor disease.

## HELD (attacked, resisted — documented, not fixed)

- **Permanence**: eurika/east_nile/lemons have no duration; 200 dayPart ticks
  leave them held while ticks still bite (1/2/1 HP per part). No cure/ease
  path reaches them (treatDisease, useMedicine, folkRemedy, villagerTreatTick
  all iterate sickDiseases() = mundane only). Respawn is a new body ("no old
  afflictions", ledger.js). Death cheats don't wipe statuses. contractDisease
  refuses all 9 alien ids.
- **Torch/re-latch lemons farm**: each latch is a new 50% roll; a torch
  releases before feeding, so a seeker can roll ~50%/turn at ~8 HP latch
  damage. Real costs (wave-2 fight, latch damage, torch in hand); canon says
  min-max is welcome. Not a break.
- **East Nile crow warnings** fire only for the map wanderer — the tent breach
  is the SAME wanderer already announced. No second warning needed.
- **mosquitoBiteVirus**: 50/50 among unheld per landed bite; held never
  re-rolled (round-1 verified, still true).
- **eatOne/eat bulk** never double-apply lemons engorge (separate paths).
- **Fever's End** ("you end sickness") does not cure alien — correct per canon
  (alien never touched by mundane medicine; the synergy is mundane medicine
  perfected). Flavor is broad but makes no alien promise.
- **Alien quirks** (howlbelly/gristlefit/croakbelly/shellgut/witness_maw/
  flockmind) DO expire after 8–12 dayParts per their defs — canon reserves
  "permanent" for eurika/east_nile/lemons only. Their promised abilities are
  all wired (gristlefit +25%, lemons engorge +20% / blood-sense +2,
  shellgut immunity, howlbelly fear check, kin-recognition passes,
  witness_maw night vision, eurika-sense, crow warnings).
- **Dead code**: giant_mosquito + alien_tick are wave-2 defs, named plainly
  "mosquito"/"tick" per canon; meat-quirk table maps to real monster ids;
  tbMosquitoTurn/tbTickTurn/mosquitoBiteVirus/removeTick/villagerTickTeachTick
  all reachable; ambient vectors honest (1.5% fever mosquitoes, 2%/step tick
  attach, escalating tick fever).

## Proof
scripts/test-disease-break2-20261010.js — 28/28 × 3 seeds (20261010, 7,
424242). Pre-fix run: exactly the 9 fix-surface assertions fail; post-fix:
all green. Round-1 script: 53/53 (no regression).

## Judgment calls (Steve can overrule)
- SPOILED not gated by shellgut (rot ≠ poison/disease; desperation design).
- Fever's End flavor left broad ("you end sickness") — no alien promise made.
- Torch/re-latch lemons farm left as legitimate min-max.
