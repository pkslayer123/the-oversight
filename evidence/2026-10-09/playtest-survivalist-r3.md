# Playtest loop — survivalist adversarial, round 3 (2026-10-09 ~06:30 CDT)

Archetype: survivalist (rotation 3→4; next: brawler). Hostile player vs needs systems.
Rounds 1–2 (2026-10-08/09) already closed: rest-heal printer, dry-meadow fill,
charcoal rake scope, cold-night wait bypass, rain-immune friction fire,
flat-rate boil, dead villageAction('water') faucet, tent cold-bite, boil-at-tent-fire.

## 2 BREAKS found + fixed (src/js/game.js)

1. **Contest grab fired mid-sleep, then sleep healed under the cameras (E1).**
   A contest announced yesterday ("The grab comes at dawn. One more day.")
   resolves in the dawn briefing — which runs inside endDay, inside tickAction,
   inside sleep()'s tick loop. contestInterruption sets state.activeContest, a
   modal the sleep wake-loop never checked (it watched tbfight /
   pendingEncounter / over only). Result: the grab fired, then sleep's dawn
   accounting applied the full heal (+20) and printed "Dawn. You wake deeply
   rested" AFTER "It is today." Fix: the loop and the post-loop check now
   break on state.activeContest — wake with a start, no dawn wrap-up, same as
   a fight or an encounter. Verified the countdown copy itself is honest
   (fires exactly one dawn after the announcement morning — the briefing's
   pre-increment day numbering lines up).
2. **pitchTent didn't name its cost (H1).** 48 ticks + 50 kcal of real work,
   copy said nothing. Now: "(48 ticks of work, -50 kcal. Sleep quality: tent.
   Pack it up to move it.)" — same convention as rest/boil.

## HELD

- **Sleep with pendingEncounter at entry (E2):** wakes after the first batch,
  no full-night heal, "wake with a start" — no sleep-through-the-monster.
- **Charcoal/filter economy (E3):** 6 fires → +11 charcoal (per-fire-per-day
  rake gate holds; second rake refused; 2 branches consumed per lighting).
  Water filter (1 charcoal + 1 cloth, 20 uses) stays gated on cloth/fiber
  (~12 deadfall cells per 3 fiber) — charcoal is abundant but never infinite.
- **Contest modal after mid-sleep grab (S1):** still actionable, no stuck state.
- packTent's 16 ticks ride the visible clock (no kcal cost) — left unnamed
  deliberately; naming every small tick action would be noise.

## Proofs

- scripts/attack-survivalist-r3-20261009.js — 14/14 × 5 seed offsets (E1b/E1c/E1d
  fail pre-fix, green post-fix).
- Regressions: test-survivalist-needs-20261008.js 26/26,
  test-survivalist-honesty-20261007.js 15/15, round-2 attack 11/11,
  test-break-contest-20261009.js 76/76, test-contest-engine-break-3.js 16/16,
  ontology 50/50.

## Fun notes

The contest-countdown dread ("Sleep if you can") now actually lands — sleeping
through the grab night is the intended terror, and the interruption finally
interrupts. Nothing new dragged.
