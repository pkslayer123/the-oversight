# Survivalist-5 playtest notes — 2026-10-07 10:30 CDT run (archetype 3)

## What was played
The haven needs economy, for real, seeded (SEED=11): cistern draws (fill ×3),
cooking water spend + refusal path, hauler refill + cap-40 overflow, fire
make/feed/lasts-till-dawn at a wild camp, the full sleep matrix (hall normal,
hall crisis, cold ground, cold fireside fed, cold fireside died), both boil
paths, rest honesty. Script: `scripts/play-feel-20261007-survivalist5.js`
(46/46 green). Regression: `scripts/test-survivalist-honesty-20261007.js`
(15/15 green).

## Bugs found and fixed (commit b1c0597, version bump 9d2c594, both pushed)
1. **Meal water lie** — `villageMeal` said "+1L water" with a DRY cistern while
   no bottle was added (`vw.clean >= 0` is always true after the decrement).
   Now tracks the gift with a `gotWater` boolean. The empty-pantry path also
   gave the bottle silently — now names it ("You still get your 1L water.").
2. **Sleep wake line vs health bar** — crisis sleep: midnight spiral took -32,
   sleep healed +10, net -22, but the wake line said "(+10 health)". The
   player compares the number to their bar. Wake line now reports NET health
   across the whole night (midnight warnings + nightmare note still narrated).
   Normal sleep unchanged ("(+20 health, energy restored...)"); maxHealth cap
   now reports honestly too (was "+20" at 95→100).
3. **Silent boil tax** — `boilWater` charged 30 kcal with the cost living only
   in a code comment. Now named: "-30 kcal tending the fire." / "-30 kcal
   coaxing your moss-tinder hot enough." (beard_moss path).

## Feel verdicts (no change — economy is sound)
- Cistern: hauler brings R(2,4)×competence (1–4L, honestly narrated); village
  drinks ~1L/day via the meal + player fills + cooking. Roughly balances with
  one hauler; cap-40 overflow reported ("only holds NL more"). Not a chore.
- Fire: lighter still spends fuel (correct — fuel is the fire's body);
  feedFire extends burn; `fireLastsTillDawn` math verified (branch fire
  128 ticks from dusk exactly reaches dawn — feeding matters on cold nights).
- Cold-night matrix all honest: fed fireside = full heal, dead fire = -18
  with "feed the fire" coaching, ground = -18 with the preview warning
  matching. sleepPreview never lied in any tested condition.
- Drink at 90 hydration wastes 40 points of a liter; the >=95 gate only stops
  the last sliver. Player's choice — acceptable, noted.
- Rest: +30 energy, -40 kcal, 96 ticks, all named. Fine.

## Test notes
- `test-drifter.js` F3 "return announced" fails identically on pristine HEAD
  (unseeded RNG, pre-existing — not from this run's changes).
- `scripts/test-midnight-burn-honest-20261007.js` is broken at load (sibling's
  new file, missing `document` stub → ReferenceError before any game code).
  Flagged, not fixed (sibling WIP).

## Tree note
Extremely hot run: HEAD moved 4× under me (14a49fc → 62f21da → 98041cc →
0b41376). Private-index commit recipe aborted cleanly twice, landed third
try. Pushed sibling's unpushed 0b41376 (contest-pool JSON migration) as part
of the fast-forward — it was on shared master.
