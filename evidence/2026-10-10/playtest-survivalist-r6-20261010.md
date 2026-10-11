# Playtest loop — survivalist r6 (2026-10-10, rotation idx 3 again)

ROTATION ANOMALY: the rotation file still read 3 — the morning's idx-3 run
did not write index+1 back. Played survivalist again with FRESH angles (no
re-litigation of r5's rest/water/boil ground). Wrote 4 back at the end.

Hostile player vs water/fire/rest/camp/weather, round 6. The fire economy is
now a coherent machine: fuel is labor (deadfall from sweeps), fires die on
a real clock, rain taxes them, tents are shelter-but-smoky, storms are
telegraphed and costly. This round attacked the seams r1–r5 left.

## Breaks (4, all HONESTY class — fixed this run)

Same class as the morning's H1/H2 (silent costs): the fire actions are the
most expensive buttons in the game and none of them named their price.

**H1 — makeFire never named its cost.** "Start a fire (big job)" commits
70 kcal + 48 ticks (32 with moss-tinder, 8 + 5 kcal with a lighter) — the
biggest single-action price in the game — and neither the success copy nor
the failure hint named it. Fix: both name actuals (clamped), success
`(-70 kcal, 48 ticks.)`, failure `(-70 kcal, 48 ticks of work, gone either
way.)`.

**H2 — lightTentFire's 30 kcal + 16 ticks were silent.** Fix: names
actuals — `(-30 kcal, 16 ticks.)`.

**H3 — feedFire named neither the 8 ticks of tending nor the flame bought.**
"a while more flame" said nothing. Fix: `(+64 ticks of flame, 8 ticks of
tending.)` — computed from the real fuel.burn incl. fire.heat mods.

**H4 — feedTentFire, same class, one function away.** Fix: `(+38 ticks of
flame, 8 ticks of tending.)`.

## Attacks that held (verified, not just asserted)

- E1: wild tiles spawn ZERO map fires (5×5 node scan) — the eternal-map-fire
  cold-night freebie doesn't exist. Haven's hearth is the only map fire.
- E1b: fireside cold protection requires a FED fire: a dying ember grants
  'fireside' quality but fireLastsTillDawn=false, the preview warns "your
  fire dies before dawn", and the bite lands. Preview and engine agree.
- E2: storm sheltered water clamps to carry room (addWater returns actual
  take); the message names it, incl. the pack-full branch.
- E3: fed fire → fireLastsTillDawn true, no dying-fire warning; starved fire
  → false, warning shown. Consistent.
- S1: "barely dawn" and "too late for real sleep" refusals hold.
- E4: shivering rest never drags energy down (90→90; 10→40 cap).

## Proof

`scripts/proof-survivalist-r6-20261010.js` — H1/H2/H3/H4 FAIL pre-fix (by
design), ALL GREEN 54/54 x3 seeds post-fix. Regressions:
`proof-survivalist-20261010.js` ALL GREEN, `attack-survivalist-20261010.js`
8/8, `attack-survivalist-r5-20261010.js` 18/18,
`attack-survivalist-20261009.js` 11/11, `attack-survivalist-r4-20261009.js`
13/13. Landed locally, pending ship. No [needs-eyes] — copy-honesty only.

## Notes

- The nearFire whole-grid generosity (a fire 8 cells away counts as
  "fireside") is a design simplification, not a break: the 9×9 is one
  campsite, and cold protection still requires feeding the fire past dawn.
  Left as-is.
- Fun: the fire economy finally feels like the survivalist's whole game —
  feed the flame or the cold gets in. The honesty fixes make the costs
  legible, which makes the choice real.
