# Break-it: food economy, round 3 (2026-10-10, ~14:00 CDT)

Target index 1 (food economy), third attack today. Canon read first:
docs/CANON.md + docs/PRESERVATION.md. Prior runs today: r1 (E1 cooking
resurrection, E2 askSpecialist, H-label blind-cook, 6c9874b3) and r2 (T1
trichinosis laundering, T2 whoOptions label). 2026-10-09 layers 1–4
documented in evidence/2026-10-09/break-food*.md — not re-litigated.

Proof: `scripts/test-break-food-20261010d.js` — 16/16 AFTER × seeds
20261010/7/99; BEFORE (git HEAD) mode fails 10/16, confirming each kill.

## KILLS (broke, fixed, proven)

### U1. EXPLOIT — fractional-unit phantom kcal (the big one)
Four engines fractionated food units, violating Steve's standing "no
fractionating" law (pantryDraw ceils; the player's draw ceils — proved
behavior):

- `Game._removePantryKcal` (hierarchy.js) — tribute / aid-debt /
  system-favor / bribe payments did `units = take / kcalEach`
- `Game._evTakePantryKcal` (game.js) — river-trader feed/trade takes
- `Game._evTakePlayerFoodKcal` (game.js) — river-trader + system-demo
  takes from the player's pack
- `Game._evTakeRawPlantKcal` (game.js) — system cooking-demo takes

A 0.5-unit crumb of 500-kcal food is 250 kcal of real value — but `eatOne`
grants a full 500 per bite (units 0.5 → −0.5, spliced), and
`takeFromPantry`'s miser coercion inflated sub-1 crumbs back to whole
units (`Math.max(1, Math.floor(0.4))` = 1 @ full kcalEach). Measured
BEFORE: 500 in → taken 250 + eaten 500 = 750 (+50% phantom); pantry path
1000 in → paid 700 + eaten 500 = 1200. The `_ev` comment justifying
fractions ("a 5000-kcal sack to feed one trader") is stale — stockPantry
granulates to ≤500-kcal pieces since 2026-10-08.

Fix: all four take whole units only (ceil), over-removing honestly;
callers report actuals. The three miser coercions (takeFromPantry,
takeFromCache, buryCache) now collapse legacy fractional stacks
value-preservingly — one whole unit carrying the fractional value
(0.4u×500 → 1u×200) — instead of inflating sub-1 crumbs (phantom) or
flooring larger ones (sink). Corrupt (NaN/missing) entries still collapse
to one honest unit (miser doctrine intact).

### U2. HONESTY — justice fine food vanished into a phantom call
`justiceRespond('pay')` consumed real pack food, then called
`this.addPantryKcal(...)` — a function NEVER defined anywhere in the
tree. The existence guard made it a silent no-op: the fiction says "X
takes it. Counts it." but the village got nothing (measured: pack −1500,
pantry +0). Fix: the paid kcal enters the pantry as real items
(`stockPantry(paid, 'Restitution')`). Deliberately NOT recorded in the
gives ledger — seizure isn't a gift, and the take-back penalty must never
misfire on fine food.

### U3. HONESTY — feast button label overstated the cost
app.js priced `max(1500, 400 × rosterN)` on the FULL roster; the engine
(`hostFeast`) charges `max(1500, 400 × (present+1))` where present
excludes villagers away from Haven. Measured: 2 away → label 4800,
engine 4000 (800 high). Fix: the label mirrors the engine formula
exactly (roster minus `v.away`).

### D3. DEAD-CODE — `addPantryKcal` referenced but never defined
Static scan: the only reference was the justice.js phantom call (now
removed). No other undefined-but-called food helpers found (sweep below).

## SIBLING SWEEP (same bug classes)
- Fraction class: grepped every `.units =` assignment in src/js — the 4
  fixed engines were the only fractional-unit creators. Remaining
  assignments are integer (whole-unit takes, ±1, Math.round/floor/ceil).
  `alienPlayers.js` pantry lift uses ceil (whole). `playerPackSpend`
  uses ceil (whole, the honest pattern the fixes mirror).
- Phantom-reference class: swept guarded `this.X ? this.X()` calls in
  food.js/storage.js/justice.js/hierarchy.js — all remaining ones are
  read/query methods with real fallbacks (occupationLabel,
  encAnimalLabel, fmtKcal, blendKcalQuality). `pantryAdd` defined and
  wired (alienPlayers, contests, put-away).
- Label class: cookAll states and charges 16 ticks (honest); spoil
  clocks agree with isSpoiled at boundaries (held, layer 1); feast label
  fixed (U3).

## STALE-TEST FIXES (test-only, engine behavior is current canon)
- `scripts/test-break-food3-20261009.js`: two assertions pinned the OLD
  1.8 knowledgeFactor cap. Steve's 2026-10-09 food-early-balance pass
  (d40a314a, after layer 3) deliberately moved it to 2.0 — updated to
  `kf <= 2.0` / `=== 2.0`. (Layer 3's "held: kf capped 1.8" note is
  superseded; the bound is now ~3.0x after a 30-day mentorship.)
- `scripts/test-break-food2-20261009.js` (G6): the test wrote the legacy
  `ap.favor = 60` field directly — favor is per-lane since audit-shows
  2026-10-09, so `apFavor()` ignored it and the package never fired.
  Now uses the real API (`apAdjustFavor(60, …, 'showbiz')`).

## HELD (attacked, resisted — with numbers)
- **kcal conservation, full chain**: cook/smoke/render/pemmican all cap at
  gross with ~95/90/97% retention (canon rates); `cookTransform`'s
  `Math.max(1, …)` floor can only lift sub-0.5/unit crumbs toward (never
  above) rawTotal — bounded <1 kcal, one-time, not amplifiable (re-cook
  of cooked meat/plants refuses).
- **eatOne vs bulk eat()**: both grant exactly kcalEach/unit, both clamp
  at kcalCap; deepening +50 "nourished" grants are once-per-tier flags.
- **pantryDraw**: whole units, player path ceils (honest over-spend,
  reported via `drawn.taken`); spoiled skipped.
- **hostFeast**: spends real pantry items via pantryDraw; trust/bonds are
  the designed food→social conversion, no kcal created.
- **feastBurn**: burns real banked kcal (300/400), say line honest.
- **contest prizes**: cap-clamped (contests.js, break-it food r3 2026-10-08).
- **softlock (hunger/death)**: starving players rest for energy but never
  heal without fuel (deliberate anti-softlock — "rest up for the walk to
  food"); eatOne refuses spoiled/full honestly, no state change; `over`
  guards all eat paths.
- **trader loops**: G5 (layer 2) still holds — credit≠food, sell-back
  capped; `traderPay` two-pass leaves pack untouched on failure.
- **corpse paths**: G1/G2 (layer 2) still hold; corpseEatItem moves 1
  unit then eatOnes it — refusal leaves the unit in the pack, no dupe.
- **blood_magic**: 2/daypart gate intact (layer 3).
- **Dead code**: all food.js @ontology provides have ≥2 call sites (r2);
  `_ev*` helpers all called (river trader, system demo); no orphaned
  food modules.

## PRE-EXISTING FAILURES (verified identical on pristine HEAD, not mine)
- test-break-food-r3.js: 1 (W4b field-dressing bank cap)
- test-break-food-r4.js: 3 (W3a/b/c frenzy-starving/trust/memory)
- (test-break-food2/3-20261009 failures were the stale tests above —
  fixed, now 42/42 and 46/46.)

## Regressions
- New: test-break-food-20261010d.js 16/16 × seeds 20261010/7/99
- Prior: 20261009 116/116 · 20261010 16/16 · 20261010b 19/19 ·
  20261010c 25/25 · spoilage/merges/pantrycap ALL PASSED · engines ok ·
  food2 42/42 · food3 46/46 · food4 30/30 · ontology 55/55

## Files changed
- src/js/hierarchy.js — _removePantryKcal whole-unit takes
- src/js/game.js — _evTakePantryKcal/_evTakePlayerFoodKcal/_evTakeRawPlantKcal whole-unit; takeFromPantry coercion value-preserving
- src/js/storage.js — takeFromCache/buryCache coercions value-preserving
- src/js/justice.js — fine food → stockPantry('Restitution'); phantom call removed
- src/js/app.js — feast label mirrors hostFeast cost formula
- scripts/test-break-food-20261010d.js — new proof (16/16 ×3 seeds; BEFORE fails 10/16)
- scripts/test-break-food2-20261009.js, scripts/test-break-food3-20261009.js — stale-assertion fixes (test-only)

## ATTACK LIST FOR THE NEXT RUN (do not re-litigate)
U1 fractional-unit class (4 engines + 3 coercions) · U2 justice fine
sink · U3 feast label · D3 phantom ref · stale kf 2.0 / favor-lane tests.
Prior today: r1 (cookTransform meat formula, askSpecialist, blind-cook
label) · r2 (trichinosis laundering ×7 contracts + stacksMatch, whoOptions
label). 2026-10-09 layers 1–4: immortal staples, cannibal spoilage,
counter-bite rolls, specialist plant-cook, meat mastery, takes/gives
ledger, haven-credit double-count, alien-kill phantom eaters, prepStash
wiring, freeloader gate, blood_magic, trap EV.
FRESH ANGLES STILL OPEN: portion-split rounding accumulation across
cook→split→merge cycles (bounded <1 kcal today, re-check if unit model
changes); `mealQuality`/kcalQ blending edge values; villageMeal "serves N"
copy on the haven panel; fire-fuel honesty on tent vs map hearths; gift→
steal-back→re-gift trust velocity (take-back revoke holds — stress the
timing); away-ration returns on expedition cancel.
