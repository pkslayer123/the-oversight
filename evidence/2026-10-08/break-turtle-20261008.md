# Break-it: speedbump turtle stuck fight (2026-10-08)

Report: Steve's girlfriend got stuck in a fight with the speedbump turtle (or a regular turtle), unsure how.

## The stuck (confirmed in harness)

Walking away from the turtle never ends the fight. `tbEndCheck` had no
disengage: the only exits were killing it or the barrier flee. Killing it
is impractical (spear does 1 dmg/hit vs armor 15 + 0.5 physical resist;
60 HP = 60+ hits), and the barrier flee is a hidden 50% mechanic. A player
who walks out of snap range (radius 1) and doesn't know about barrier
fleeing is in a permanent fight against a rock.

Secondary: a failed barrier flee said "they're right behind you" and
teleported the immobile turtle next to the player for a free snap — a lie
(the turtle cannot chase) and a punishment.

## Fixes (src/js/game.js, commit c73695b)

1. **Disengage** in `tbEndCheck`: if every living monster is 3+ tiles
   (chebyshev) from the player and none chases (`follows:false`), the
   fight ends — "You walk clear of them. Nothing follows." Chasers
   (`follows !== false`, e.g. hushwolf) still hold the fight at any
   distance. Belltoad chorus check runs first, still holds fights open.
2. **Honest pursuit** in `tbBarrierExit`: vs only non-chasers, the getaway
   auto-succeeds (no 50% roll — nothing pursues). On a failed flee with a
   mixed group, only chasers teleport through the barrier; stayers are
   marked fled ("The slow ones are left behind.").

## Proof

`scripts/test-turtle-breakit-20261008.js`: 13/13 x 5 seeds (20261008,
42, 777, 1234, 999). Covers: walk-away disengages, adjacent does not,
distant chaser holds, turtle-only barrier auto-succeeds, mixed failed
flee splits correctly, bunker still expires at distance 2, chorus still
holds.

## Regressions

- test-combat-r3-async.js: 21/21
- test-combat-r3-honesty.js: 18/18
- test-betrayal.js: 80/80
- test-betrayal-fixes-20261008.js: 13/13
- validate-ontology.js: 50/50, release permitted

## Live

`c73695b-20261009-024147` verified on both
raw.githubusercontent.com/.../master/version.json and
the-oversight.vercel.app/version.json.
