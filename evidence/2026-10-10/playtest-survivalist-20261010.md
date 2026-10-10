# Playtest loop — survivalist (2026-10-10, rotation idx 3)

Hostile player vs water/fire/rest/camp/weather. Systems heavily hardened by
prior rounds (r1–r5: rest-heal printer, dry-meadow fill, charcoal rake scope,
cold-night wait bypass, rain-immune friction fire, flat-rate boil, dead
villageAction faucet, tent cold-bite, boil-at-tent-fire, contest-grab
mid-sleep heal, pitchTent cost honesty, outdoor cooking fuel, boil fuel +
honest boil-failure). This round found the seams the earlier rounds left.

## Breaks (2, both HONESTY class — fixed this run)

**H1 — fillWater charged 10 kcal silently.** The button says 'Fill water
(1L)', the result said "Filled 1L (risky — Creek source (unknown)). 3L
carried (3kg)." — no cost named anywhere. A thirsty player bled 100 kcal
over 10 fills with zero accounting. Fix: the result now names it —
"(-10 kcal hauling, 1 tick.)" — computed from actual spend (clamped at 0,
so an empty body hauling on fumes sees an honest -0).

**H2 — rest billed a flat -40 kcal even when the body held less.** At
kcal=5 the message said "(-40 kcal — rest burns fuel too.)" while only 5
were spent (clamped). Fix: message names actual kcal spent in both the
normal and cold-shiver variants (crisis variant never named a cost).

## Attacks that held (verified, not just asserted)

- E1 rest-heal printer at kcal=0: 5 rests, health 40→40 (crisis gate holds);
  energy still rises (no softlock — starving player can walk to food).
- E2 water conservation: 4 risky fills → boil at a live fire → exactly 4
  clean, 0 risky, no phantom bottles; boil burned exactly 32 fire-ticks.
- E3 dirty-only cistern refuses the player's bottle; cistern untouched.
- E4 boil with no fire refused; nothing purified, nothing charged.
- E5 drink refused at hydration ≥ 95.
- E6 fire dying under the pot fails honestly: water stays risky, message
  says the fire died under the pot.

## Proof

`scripts/proof-survivalist-20261010.js` — H1/H2 FAIL pre-fix (by design),
ALL GREEN x3 seeds post-fix. Regressions:
`attack-survivalist-r5-20261010.js` 18/18, `attack-survivalist-20261010.js`
8/8. Landed as 0efad31d (rebased onto sibling social-r11 landing b9f34fd3
mid-run; rebase clean, proof re-run green post-rebase). Merged locally,
pending ship. No [needs-eyes] — copy-honesty only, no feel/combat change.

## Notes

- Pre-flight: main tree had 1 untracked sibling file
  (evidence/2026-10-10/depletion-ratchet-diagnosis.md, proactivity research).
  Inert note, no staged changes; proceeded per worker-template guard lesson
  (private-index commit, merge unaffected) and flagged loudly.
- Reaper reports bal-waves/bal-util have uncommitted changes (owner:
  oversight-balance-pass) — left alone, not mine.
