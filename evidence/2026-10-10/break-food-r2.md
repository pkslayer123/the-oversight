# Break-it: food economy, round 2 (2026-10-10, ~02:30 CDT)

Target index 1. Hostile player, full code knowledge. Canon read first:
docs/CANON.md + docs/PRESERVATION.md. Prior run (6c9874b3, 02:08) fixed
K1/K2/K3 — re-proofed still green (16/16); this run attacks NEW vectors.

## Catches (2 fixed, both with proof)

### T1. EXPLOIT — trichinosis laundering via storage round-trips
Bear/boar/javelina meat carries `parasiteRisk {trichinosis}` until cooked
through — canon: only a real cooking kills it (DISEASES.md; smoking doesn't,
the pantry doesn't, the earth doesn't). Every subset-push that rebuilds a
food stack DROPPED the field — the same toxin-laundering class as F1
(2026-10-09), one field further down the contract:

- `takeFromPantry` / `takeFromPantryBulk` takenStacks (game.js) — donate kept
  the worms (`{...item}` spread), the take washed them
- `pantryAdd` / putAwayFinished (food.js) — washed on the way IN
- homecoming + returnToOldVillage pantry pools (game.js) — washed on the way IN
- light-fingers pantry lift (abilityActions.js) — washed
- `buryCache` (storage.js) — the earth "cured" worms; dig-up returned clean meat
- `stacksMatch` never compared parasiteRisk — wormy merged into clean, and
  the merge target's fields win, so the worms vanished into the stack

Net effect, demonstrated: clean bear carcass → clean → donate → take →
eat RAW with zero worm roll (only the generic raw-meat roll fired).

Fix: `parasiteRisk` added to all 7 subset-push field contracts (buried copy
uses riskCopy, not alias — a partial bury leaves a pack stack behind) and to
`stacksMatch` (`id|p` comparison: wormy never merges into clean, wormy still
merges into wormy).

Proof: scripts/test-break-food-20261010b.js — BEFORE (HEAD): 10 FAIL
(T1c/T1d/T1f/T1h/T1j/T1k/T1m/T1l + T2b/T2c); AFTER: 19/19 green, seeds
20261010/7/42/99. T1f drives the real eat path with forced rolls and asserts
`contractDisease('trichinosis')` fires on the round-tripped stack.

Note for the record: the first dig-up in the test was honestly weight-refused
("Too heavy to carry it all", cache intact — no loss), so the cache block
does a partial bury (alias check) then a FULL bury for the unambiguous
dig-up assertion. Also found while debugging: in BEFORE mode the dig-up merge
masked the wash (clean dug units absorbed into the wormy leftover) — the test
now buries the full stack for T1l.

### T2. HONESTY (K3 class) — whoOptions cook label hardcoded "32 ticks"
The delegation decision hardcoded 32 for cook; the engine charges the class
time (monster 40, tuber 40, grain/legume 48, fruit/greens 12). Same class as
K3 (howFarOptions, fixed last run). These branches are unwired from the UI
today (only 'butcher' renders) — the copy is now true if they ever get wired:
the label mirrors cookFood's dispatch exactly (meat cleaned/undercooked →
cls.time||32; needsCooking plants → cls.time||16; legacy rawKcal → flat 32).
T2e cross-checks label vs engine by spying tickAction (40 monster, 32 deer).

### F3b stale assertion (prior suite, test-only fix)
Characterization confirmed: F3b failed on default seed (passes SEED=7)
because the first cook rolled undercooked — and undercooked re-cook is the
DELIBERATE disease-r10 feature, so the second cook was SUPPOSED to fire.
The assertion ("cooked meat refuses re-cook") never pinned the first outcome.
Fix: pin first cook to perfect; F3b now tests the real invariant.
scripts/test-break-food-20261009.js: 116/116 on seeds 20261010/7/42/99
(was 115/116 on default seed).

## Held (attacked, resisted — with evidence)

- **Undercooked re-cook inflation**: re-cook re-derives gross from the
  undercooked total (`gross = cooked1/cls.raw`), which smells like a printer.
  Checked the numbers: per undercooked cycle the multiplier is
  (cooked/raw)×0.7 — meat 0.85/0.6 → 0.9917 (decays), monster 0.8/0.55 →
  1.018 but the chain continues only on undercooked (p=0.4 unskilled, ~0
  skilled) and ends on decent (×1.16) or burnt (×0.58); expected log-drift
  per cycle is negative (-0.11). Self-limiting by the class table, not by a
  guard — worth re-checking if class numbers ever change.
- **compost_king rot loop**: buries 1 unit of food for +10% forage on the
  tile — consumes the unit honestly, no calorie loop (buff is forage chance,
  not kcal).
- **feastBurn**: burns real banked kcal (300/400) for the multiplier; the
  say line names the burn and the mult honestly.
- **sortBag / splitLumpOut**: lump units decrement honestly; spoilDay
  recomputed as min over REMAINING components; empty lump spliced.
- **Dead code (D2)**: all 18 food.js @ontology provides have ≥2 call sites
  across src/js — nothing orphaned.

## Regression checks
- test-break-food-20261010.js (K1–K4): 16/16
- test-break-food-20261009.js (F1–F4/H1/D1): 116/116 × 4 seeds (F3b fixed)
- test-break-food4-20261009.js: 30/30
- disease suites (break-20261010, breaks-20261009, pools, rework, monster-diseases): all green
- test-break-food-r3/r4 failures (1 + 3) reproduced IDENTICAL on pristine
  HEAD copies — pre-existing, not caused by this run
- validate-ontology.js: 52/52 green (no new Game methods; headers untouched)

## Files
- src/js/food.js — pantryAdd + stacksMatch + whoOptions label
- src/js/game.js — 2 takenStacks + homecoming pool + exile pool
- src/js/storage.js — buryCache riskCopy
- src/js/abilityActions.js — light-fingers takenStack
- scripts/test-break-food-20261010b.js — new proof (19 × 4 seeds)
- scripts/test-break-food-20261009.js — F3b stale-assertion fix
- evidence/2026-10-10/break-food-r2.md — this file

No UI/copy changes a player would feel (risk fields are invisible until the
worm roll fires); no [needs-eyes] flag.
