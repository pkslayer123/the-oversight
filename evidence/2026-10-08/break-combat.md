# BREAK-IT: combat engine (2026-10-08, run target #0)

Hostile-player audit of the combat engine. Verdict per attack below.
Proof tests: `scripts/test-combat-break-xp-20261008.js`,
`scripts/test-combat-break-honesty-20261008.js`,
`scripts/test-combat-break-softlock-20261008.js`,
`scripts/test-combat-break-deadcode-20261008.js`,
shared harness `scripts/combat-break-harness.js` (full module list, seeded RNG pre-eval).

## EXPLOIT — broke + fixed

**E1. Free-XP loop via failed activations (BROKE, fixed).** `activateAbility()`
called `gainAbilityXP(id, 1)` BEFORE any failure check, so every failed
activation (blood_magic too weak, echo already used today, field medicine
already used / too hungry, herbal not sick, purify not poisoned, nothing to
bury, red hunger asleep — 10 failure paths) granted 1 XP + 1 synergy attempt
+ 1 use-log entry at zero cost. Spamming blood_magic at 5 HP leveled it to L3
in 35 free calls. Unknown ids also logged uses.
Fix: split into `activateAbility` (wrapper: grants XP only if the inner
dispatch reports the activation fired) + `_activateAbilityInner` (returns
boolean; real-but-branchless abilities still count as practice, truly unknown
ids say so and grant nothing). Proof: test A/A2/A3 fail pre-fix, pass post.

**E2. Dead "Bury Food" button (BROKE, fixed).** `compost_king` was listed in
the ability bar but had NO branch in `activateAbility` — silent no-op that
granted free XP (via E1). Worse, `purify`'s branch had swallowed
compost_king's whole body: curing poison ALSO buried a food item, and "No
food to bury" failed AFTER the cure. Fix: purify cures only; new
`compost_king` branch buries. Proof: test B/C.

**E3. Door-flee damage reset (BROKE, fixed).** Door-flee stashed each
monster's HP (`monsterPositions`), but re-engage called
`startCombat(first.id)` and never consumed the stash — beat a monster to
1 HP, duck inside, heal for free (pantry/field medicine), walk out to a
full-HP monster. Zero-cost full reset of your damage. Fix: `exitBuilding`
restores stashed HP onto the re-engaged fighter. Proof: test S1.

**E4. Unwired combat actions ate your turn (BROKE, fixed).** 4 combat-context
data actions (pocket_sand.throw_sand, scream_cheese.scream, leech.leech_stance,
peacemaker.walk_in) have no impl. `useAbility` paid costs (incl. `turn` →
`spendCombatAction`) BEFORE the impl-existence check — tapping one spent your
combat turn, then said "isn't wired up yet". Fix: wiring check moved before
`payActionCost` — fails fast, nothing spent, honest message. Proof: D2.

**XP double-count re-verification (HELD).** Commit 70aa6aa's fix holds:
`test-xp-doublecount-20261008` (12 checks) and `test-ability-xp-use-20261008`
green; one activation = 1 use-log = 1 synergy attempt = 1 XP on both paths.
Composite-id routing (`tracker.track` → `useAbility`) was already fixed by
the unified dispatcher — verified, not re-broken.

## SOFTLOCK — held

tbEndCheck/tbEnd/tbAdvance probed: all-fighters-dead → ends; player-dead →
'lost' with tbfight cleared (no stuck UI); dead monsters never take a turn;
pending-pack ordering analyzed safe (no fighting monsters ⇒ player state
can't change between checks). 9/9 green.

## HONESTY — broke + fixed (2)

**H1. Strike number lied (BROKE, fixed).** "You STRIKE for ${d}" was said
BEFORE heckler-shame / scarred-brace (-3) / understudy-steal (halve)
reductions — displayed up to 3+ over actual (measured: said 2, dealt 1).
Fix: the number is now stated after all reductions, right at the tbDamage
call site. Villager strikes state no numbers — clean.

**H2. FeastBurn surge was silent (BROKE, fixed).** progression.js wraps
`feastBurn()`: base said "×1.5", wrapper multiplied by feastSurge (1.5x) /
arc4burn without a word (measured: said ×1.5, applied ×2.25). Fix: wrapper
states the surge and the true total when its multiplier applies.

## DEAD-CODE — held

All combat modules in index.html (combat.js, monsterBehaviors.js,
abilityActions.js, statusEffects.js); monsterBehaviors wired via mbRunPreTurn;
all 13 tbPlayer* verbs have app.js call sites; 28 impls ↔ data actions mapped
— 16 data actions lack impls (4 combat, now fail-fast per E4; 12 non-combat
flagged for content runs, not dead buttons in a fight).

## Sibling sweep

Same bug classes hunted: all other `gainAbilityXP` call sites are
post-success (diplomat/camp_cook/generous/tracker/scrounger/green_thumb) —
clean. Villager strike/harry state no numbers — clean. practice() capped at
stat 10 — no farm. resetPerFightFlags thorough.

## HANDOFF LEAD (food-economy run, target #1)

Blood-magic/field-medicine kcal engine (NOT fixed — design call, out of
combat scope): blood_magic has no per-day gate; loop = 9× blood_magic
(-90 HP, +4500 kcal) → field_medicine (+20 HP, -100 kcal, 1/daypart) → 2×
more → net **+5,400 kcal per day-part from 100 HP, ≈ +21,600 kcal/day**
(measured). The code comment claims the 100-kcal heal cost "prevents Blood
Magic infinite loop" — it bounds it per daypart but the engine is real.
Needs a design gate (e.g. blood_magic per-daypart cap) — food run's call.
