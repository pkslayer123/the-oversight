# Break-it: socialite r9 (2026-10-09, playtest loop)

Hostile run against the trust/gift/apology economy. Proof script:
scripts/test-socialite-r9.js (E1/E2/E3/S1/H1) — ALL GREEN x3 seeds
(20261009/777/424242).

Standing canon: docs/CANON.md ("Trust != reputation"), "words only go so
far" (talk trust caps at 40; above 40 from real acts), docs/CONVERSATIONS.md.

## KILL 1 — trivial-gift farm (EXPLOIT)
`giveFood`'s live path (carexplore.js override) paid FIXED trust per portion
(bite +4 / meal +10 / full +16, x1.5 private) — the gift's kcal NEVER entered.
Measured BEFORE: a 1-kcal crumb-bite paid +6 (private), identical to a
400-kcal steak-bite; 29 crumb-bites took trust 15 -> 90 for 29 kcal + 87
ticks. The r4 design intent ("crumbs earn little, a real meal earns more")
was implemented in the BASE giveFood but never in the live override — words
wearing a food disguise.
Fix (design call, Steve can overrule): the portion sets the CEILING, the kcal
fills it. `substance = min(1, takenKcal / refKcal)` with refKcal 100/300/500
(bite/meal/full — real food units run 120-800 kcal); trust = round(base *
substance). A 1-kcal bite now pays 0; a real 120+ kcal bite pays full 4.
Measured AFTER: 50 crumb-bites hold trust at 15; 400-kcal steak-bite still +6.
Coherence fix in the same edit: the starving-bite "sting" fired 40% on ANY
bite (a real 400-kcal bite could "sting"); now only when substance < 0.5 —
a real bite to a starving person is a gift, not a slight. Sting now pays 0
(was 1) with the same say + 'stingy_gift' memory.

## KILL 2 — theft->apology loop (EXPLOIT)
Measured BEFORE: steal 10x (5-6 caught at -35 trust each, rest unnoticed)
-> trust 40 -> 0, ~1350-1800 kcal kept; then 10-11 back-to-back makeAmends
(+4 trust each, talk-capped) -> trust 0 -> 40. Net: trust-neutral, goods kept,
~32 ticks. Eleven "I'm sorry"s erased six caught thefts in one sitting.
The rep gate (worst axis <= -15) didn't stop it: deep rep damage (-100 honest)
fueled one amends per +12 repair, each paying +4 trust.
Fix (design call, Steve can overrule): ONE amends per villager per day —
"you've already said your piece today, let it sit" (same shape as rally's
once-per-day-part gate). Engine returns null + honest say; the person-card
amends button hides after one use that day. Measured AFTER: 10 amends in one
sitting -> 1 lands, 9 refused; trust 40 -> 4. The 11-day repair now costs what
contrition should cost.
Verified: apology trust IS talk-capped at 40 (pre-existing, held); theft
penalty sticks (trust -> 0, rep -> -100, crime record, suspect memories,
gossip — all pre-existing, held).

## HELD — and why
- E3 group N x farm: rallyVillage is once per day-part and routes through the
  resolver (40 words-cap, r5 fix). Measured the rally's OWN applied trust
  across 12 day-parts: never positive starting >= 40, total +26/+27 (10->40
  climb). No other group-trust faucet exists (only rally loops the roster).
  Test-precision note: rallyVillage advances 2 ticks, which can cross a part
  boundary and run real NPC life — a companion-travel +1 trust (a real act,
  bumpTrust, not words) landed D at 41 on seed 777. That's ambient life, not
  the rally; the rally's own deltas are capped.
- S1 softlock sweep: gift with no food / non-roster target, apology with no
  offense, deal with no food, appeal with unknown goal — all return null with
  an honest said line. Nothing throws, nothing strands.
- H1 honesty: gift UI copy promises no trust numbers ("Small. Enough to
  notice, not enough to matter"). Deal/appeal buttons render ONLY inside the
  refused branch (app.js), and only with food in pack / known goal.
- Engine/UI agreement fix: appealToGoal's comment always said "requires
  knowing their goal" and the UI gates on goalKnown — but the engine never
  checked. Added the engine gate (3 lines); UI flow unaffected (only caller).

## Design calls made (Steve: decide + document, he can overrule)
- Gift trust = portion ceiling x kcal substance (refKcal 100/300/500).
  A 1-kcal crumb is words, not a deed: it pays 0.
- Sting only fires on insultingly small bites (substance < 0.5), pays 0.
- One amends per villager per day. Contrition takes time.
- Engine enforces goalKnown for appealToGoal (was UI-only).

## Regressions
- test-socialite-r9.js: ALL GREEN x3 seeds (20261009/777/424242)
- test-socialite-r8-residue.js / r8-deadends.js: ALL GREEN
- test-social-r7-trustbleed.js / r7-promises.js: ALL GREEN
- test-social-breakit-r2.js: 7/7; test-socialite-hostile-20261008.js: DONE
- test-social-progressive-trust-20261008.js: 9/9
- test-carexplore.js: 32/33 (1 pre-existing: "examineCell records depth",
  fails on pristine HEAD too)
- playtests/test_social_actions.js: 31/32 (1 pre-existing: "promise stored",
  fails on pristine HEAD too)
- test-break-food-r4.js: 30/33 (3 pre-existing W3a/b/c, fail on pristine too)
- validate-ontology.js: 52/52, release permitted

## Files changed
- src/js/carexplore.js: giveFood substance scaling + sting coherence
- src/js/game.js: makeAmends one-per-day gate; appealToGoal goalKnown engine gate
- src/js/app.js: amends button hides after one use per day
- scripts/test-socialite-r9.js: new proof (E1/E2/E3/S1/H1)
- evidence/2026-10-09/socialite-r9.md: this note

## Overlap note
flesh-out loop's break-social tree is active (not touched, not read). No
overlap observed with its trust-farming/gossip/moot work beyond the shared
canon; my amends gate and gift-substance rules are new ground (r8 covered
residue/choke-points, not gifts or amends pacing).
