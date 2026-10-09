# Forager sweep adversarial attack — 2026-10-09 (playtest loop, archetype: forager)

Hostile angle: the area-sweep forage action (game.js `doAction('forage')`) as a knowledge-economy weapon.

## Breaks found (2, both fixed)

### E1. EXPLOIT: per-cell knowledge pacing collapse
`bumpPlantFamiliarity()` (familiarity encounters) and `entry.harvests` (L2/L4 depth)
incremented ONCE PER CELL per sweep. One 9-cell sweep of an unknown species =>
encounters=9 (>=3) => solo `sortBag` field-clicked it immediately — the whole
"forage blind, haul home, sort, learn" identification economy collapsed to a
single field trip. After identification, one sweep => harvests=9 (>=5) => L2
(prepKnown + yield+50%) same press; two sweeps => harvests=18 (>=15) => L4
mastery. Thresholds 3/5/15 were designed as field visits, not cell touches.

Fix (game.js, my design call — Steve can overrule): both counters now tick ONCE
per species per sweep (`sweepBumps` map in the harvest loop). 3 blind sweeps =>
field-click; +5 identified sweeps => L2; +10 more => L4. Teaching/lesson paths
were already per-event and honest — untouched. `identifyPlant` still sets
encounters=99 (naming confers recognition — realistic).

### E2. EXPLOIT: player sweeps never pressured the land
`foragePressure` (the land's memory: >=5 => wornPath + half regrow in regrowTiles)
was only fed by villager abstract nibbles. A hostile forager could strip the
same grove every 3 days forever with zero consequence — the mechanic the code
comments describe never fired for the player.

Fix: player sweep adds +1 pressure per press (same granularity as
villagerDepleteTiles) and sets foragedToday=true (no decay on worked days).

## Held (attacked, no break)

- **H1 honesty**: blind-sweep copy ("Not food until identified — sort them at camp.")
  is honest — lumps are edible:false / foodState 'unknown', eatOne refuses with
  no kcal granted.
- **S1 softlock**: stock>0 with every cell regrowing refuses via the patch-honesty
  branch ("step to another green patch"), no stock consumed, no crash.
- **E3 economy**: sweep/regrow stock accounting is exactly 1:1 — no free food,
  no silent loss.

## Design calls made (Steve: "figure it out yourself")

1. Per-species-per-sweep pacing (not per-cell, not per-press-global) — a mixed
   sweep still teaches each species it touched once.
2. Player pressure +1/press on the swept tile — matches villager granularity;
   camping one grove earns worn paths and slow regrow, as the fiction promises.

## Proofs

- New: scripts/test-forager-sweep-20261009.js — 17 asserts, RED pre-fix (9 fail),
  GREEN post-fix x 3 seeds (20261009, 7, 99). Caught a harness bug mid-run
  (seed 99 puts (5,5) on a ruin — setupGrove now scans for a real wild tile).
- Regressions: test-field-identify 11/11, test-break-food-20261009 116/116,
  knowledge5 wrongas-clear + callout-farm (3 seeds each) all green.
- Ontology: 50/50 validated.

## FUN notes

- Delights: the blind-sweep lump system reads honestly in the message stream —
  "38x unknown shoots. Into the bag, unnamed." feels like real foraging.
- Drags: nothing new this run.
