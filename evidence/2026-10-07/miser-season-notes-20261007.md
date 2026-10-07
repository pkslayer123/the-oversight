# Miser season playtest — 2026-10-07 02:30 CDT run

Script: `scripts/test-miser-season-20261007.js` (12/12 green).

## What was played
Full hoarder loop: autumn haul → bury at three distances → 45-day season
(16 npcBatchTurn batches/day = full day budget) → walk back → draw rations
→ dig up. Plus wrong-node honesty and ration-drawer drills.

## Findings

**1. The distance-safety gradient is season-invisible (feel verdict, Steve's call).**
`cacheTheftChance` per batch: 0.008·max(0.06, 1−dist/12). At 16 batches/day:
- 12 seasons × 45 days: near (d2) robbed 12/12, far (d6, farthest legal tile) robbed 12/12.
- 20 fortnights × 15 days: near robbed 18/20, far robbed 16/20.
- Gossip named a culprit 10/12 seasons (50%-per-robbery trace compounds to
  near-certainty over a season; per-incident "sometimes nobody saw anything"
  holds).

**2. The curve's "far wild" floor is unreachable.** The 0.06 floor kicks in at
dist ≥ 12, but the world map is 7×7 and Haven sits near (3,3) — max Manhattan
distance from Haven to any tile is 6. No cache can ever reach the designed
"far wild ~0.05%/batch" band. Practical range is 0.008 → 0.004/batch, i.e.
~12%/day near the doorstep, ~6%/day at the farthest corner.

**Net:** burying food for the season is a near-guaranteed loss no matter how
far you walk. The miser promise ("bury dried goods far away, eat them in
winter") doesn't cash out — every cache is short-term only. Options: roll per
day instead of per batch, rescale the curve so the 7×7 corners are actually
safe, or own "caches are short-term" in the fiction. Not retuned unilaterally —
Steve's call.

## Mechanics verified working
- Spoilage underground: smoked (spoilDay+60) survives 45 days; fresh berries
  (spoilDay+4) rot and the rot is announced at the hole.
- Ration drawer: 5× takeFromCache(2) over 5 days, weight-checked per portion,
  empty cache removed from the list.
- Wrong-node honesty: dig/draw from afar refuses and cites the journal entry.
- Journal records bearing ("4 tiles east of Haven").
