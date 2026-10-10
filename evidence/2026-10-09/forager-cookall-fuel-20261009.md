# Break-it: forager r3 — batch-cook fire fuel (2026-10-09)

Target: archetype 0 (forager), hostile pass over the batch-cook economy
(`Game.cookAll`, the fire-context "Cook N raw" button). Canon:
docs/PRESERVATION.md ("Energy is never created"), docs/BEAR.md (portion law).
Proof: `scripts/test-forager-cookall-fuel-20261009.js` — 18/18 × 3 seeds
(20261009, 7, 99) AFTER; BEFORE mode demonstrates the E1 exploit.

## KILL (broke, fixed, proven)

### E1. EXPLOIT: cookAll never burned fire fuel
Per-item `cookFood` drains `cookTime` ticks of fire via `consumeCookFire()`
and DOWNGrades the outcome when the fire dies mid-cook. The batch path cooked
UNLIMITED items for a flat 16 ticks of *time* and zero fuel — a 1-tick fire
cooked the whole harvest (measured: 7 items, till delta 0). Fuel (wood →
fire → till) is the scarcity the per-item path honors; the batch ignored it.
`renderFat`/`preserveFood` also don't burn fuel, but that's the broader
batch pattern — out of scope for this run (noted, not changed).

Fix (my design call — Steve can overrule):
- food.js wrapper: the batch is one fire session — it burns 16 ticks of fuel
  via `consumeCookFire(16)` before cooking (nothing burns when there's
  nothing to cook). A fire that dies mid-batch flags `_cookAllFuelDied`.
- game.js cookAll: rolls ONE outcome for the whole batch (the wrapper's own
  comment already claimed this: "the fire doesn't roll per portion" — the
  code rolled per item); downgrades it one step on fuel death, same fiction
  as the per-item path.
- Wrapper meat/plant pipelines: same — one outcome each (knows:knowsCook),
  downgraded on fuel death, passed explicitly to cookTransform.
- Death narrated: "The fire dies halfway through the batch — everything
  comes out scorched and uneven, a step worse than it should be."
- Flag cleared in the wrapper's finally AND at normal return (no leak on
  throw).
- Tent fires consume too (consumeCookFire matches insideTent coords).

BEFORE: till delta 0, dying fire changed nothing. AFTER: till delta exactly
16; dying fire → perfect becomes decent exactly (measured 275 → 220, one
step); narrated; no throw.

## HELD (attacked, resisted — measured)

### E2. Conservation battery — "energy is never created"
- cookTransform over all 8 cook classes × 4 outcomes × skill 1.0/1.25 ×
  relic 1.1: cookedTotal ≤ gross everywhere (worst ratio 1.0000).
- shellNuts: exactly 0.75x. renderFat: 0.65x blind / 0.90x known.
- makePemmican: out ≤ in (≤97% + rounding), one honest set measured.
- Considered and dropped: fat double-count (40% meat + 20% fat = 60% of
  gross) is the SHIPPED bear-rework design (proof-tested 24×500 portions +
  6 slabs; Steve's direction) — not a break.

### S1. Softlock edges
- Empty batch: no fuel burned, "Nothing raw to cook.", no throw.
- No fire (walked off-haven): "Need a fire to cook.", no throw.
- Fire-death batch: narrated, game continues, items still cook (worse).

### H1. "Cook N raw" label honesty
- The label's filter counts exactly the items cookAll will cook (2/2 in the
  probe; berries correctly excluded). Batch narration states the 16-tick
  time cost; fuel burn is quiet like the per-item path; only the surprising
  case (fire death) gets narration.

## Design calls made (Steve: "figure it out yourself")
1. Batch = one 16-tick fire session (not per-item fuel) — batch keeps its
   efficiency edge, but fuel matters again.
2. One outcome per batch portion instead of per-item rolls — matches the
   existing code comment's stated fiction.
3. Fuel death = downgrade, not refusal — the food still cooks, worse (same
   as per-item); never a dead batch.

## Regressions
- bear-rework ALL GREEN; pemmican-print 15/15; forager-sweep 17/17;
  forager-rotfarm 22/22; ontology 52/52.
- test-food-reality 84/90 (6 fails) and test-break-food3-20261009 44/46
  (2 fails) — both fail identically on the pristine tree (pre-existing,
  unrelated: knowledgeFactor float, food-reality yield asserts).

## FUN notes
- Delights: the fire-death line reads like the game's voice — "scorched
  and uneven" tells you what happened and why.
- Drags: nothing new. The batch still feels generous (16 ticks for the
  whole harvest) — now with an honest fuel cost behind it.
