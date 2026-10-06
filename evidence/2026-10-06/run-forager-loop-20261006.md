# Forager playtest loop — run note (2026-10-06 ~21:15 UTC / 16:15 CDT)

Archetype: **forager** (rotation 0 → 1).

## Played
`scripts/play-feel-20261006-forager.js` — full forager day via real tap flow
(`_cellInteract` + BFS walking + `pathStep`, 2 kcal/step): walk out, sweep
patches, deplete, haul home, camp ritual, pantry, eat. 14/14 checks green,
stable across 6 runs.

## Bug found and fixed: unknown-lump weight was QUADRATIC
`addUnknownToLump` (src/js/food.js) stored the TOTAL weight (units×0.1) in the
per-unit `kg` field; `packWeight()` sums `units × kg`, so a lump weighed
0.1×N² kg — 12 units = 14.4 kg, 24 units = 57.6 kg. The forager's pack filled
in ~2 sweeps and the morning loop died. Fix: `lump.kg = 0.1` (per-unit, like
every other food item). Sibling instances fixed too: `splitLumpOut`'s remainder
recompute and the `stageForPrep` homecoming merge — same formula, same bug.
Proof test: `scripts/test-lump-weight-20261006.js` (all pass, covers all 3 paths).

## Feel verdict
- Morning loop is healthy: patches deplete with honest "picked clean / worked
  out — step to another green patch" guidance; every press says what happened.
  ~11 sweeps / 770 kcal effort → ~120 food units, ~15k kcal LATENT (gated by
  identification + processing + spoilage — the design's balancers, working).
- Knowledge loop plays end-to-end: blind sweep ("a shot in the dark… not food
  until identified") → lump → homecoming auto-stages to the counter ("the
  clock is ticking") → camp ritual (`sortBag` with a knower) teaches → named
  haul. No true names leak before knowledge.
- Pack-full friction is right: one explanatory lecture, then "Still full."
- Observation (not a bug): latent haul/tile is generous; spoilage (1–2d) and
  processing gate it. Worth a multi-day watch, not a fix.

## Test state
- Related suites (food/lump/forage/pantry): no regressions from the fix.
  `test-food-reality` 90/0, `test-forager-pack-loop` 12/0, `test-forage` 18/0,
  `test-forage-rot` 9/0, `test-field-identify` 11/0. `test-forager-loop`,
  `test-lumped-unknowns`, `test-pantry-real` are RNG-flaky; their residual
  failures ("finished -> pantry on return", 2× pantry endDay sync) reproduce
  identically on HEAD — pre-existing, not mine.
- Sim lesson: exploration walking may use edge cells 0..8 (travelTo parks the
  player there); the 1..7 interior restriction is combat-only (flee barrier).
- Transient: one run hit a SyntaxError mid-eval — a sibling saved game.js
  mid-read (shared-tree hazard); re-ran clean.
