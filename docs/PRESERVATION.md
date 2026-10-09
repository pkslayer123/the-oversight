# The Oversight — Food Preservation Canon (Steve's design)

The ladder: **cleaned (2d) < cooked (5d) < smoked (30d) < rendered fat (90d)
< pemmican (120d).** Longer road, better payoff. Refined and longer methods
must earn meaningful rewards — that's the whole point of the ladder.

## The rungs

| Rung | Action | Time | Known yield | Blind yield | Shelf |
|------|--------|------|-------------|-------------|-------|
| cleaned | butcher/clean | — | 100% | 0.75x | ~2 days, risky |
| cooked | cook over fire | — | 100%, safe | — | ~5 days |
| smoked | `preserveFood` | **16 ticks** = 1/8 day-part | 0.95x kcal | 0.80x kcal | 30d known / 15d rough |
| rendered fat | `renderFat` (fire) | 12 ticks | 0.90x | 0.65x | 90 days |
| pemmican | 2 preserved meat + 1 rendered fat + 2 berries | 20 ticks | 3 × 600-kcal bars | — (needs rendering knowledge) | 120 days |

## Rules

- **Blind penalties teach, never stupid-make.** First attempts scorch some
  (clean 0.75x, smoke 0.80x, render 0.65x) — but the attempt teaches the
  technique; the sting is one-time. (Steve 2026-10-09, bear rework.)
- **Rot can't be smoked back into food.** Spoiled meat is discarded honestly.
- **No nonsensical calorie loss.** Cooking or combining foods must never
  destroy calories that don't make sense. (Steve 2026-10-09: "At very least
  make sure that cooking or combining foods doesn't cause any calorie loss
  that doesn't make sense.")
- **Smoking pace is 16 ticks.** A worker once shipped 8; Steve's final word:
  "1/8 of a day seems about correct. That's all fine." 16 ticks = 1/8 of a
  day-part. Do not "quicken" it again.
- **Pemmican is the payoff.** Shelf-stable, nearly indestructible, 120 days.
  It requires rendering knowledge — the ladder gates itself.

## Rendering (bear rework)

- Raw fat → rendered tallow over fire. 12 ticks. 90% yield known, 65% blind.
- Rendered fat keeps ~3 months and is the key to pemmican.
- Only some animals yield separable fat — see docs/BEAR.md.

## Open / known gaps (2026-10-09)

- Render/pemmican are not yet wired for the village stash path (`prepStash`).

## Change log

- 2026-10-09: canon created. Smoking restored 8 → 16 ticks per Steve's final
  pacing call.
- 2026-10-09 (hunter break-it): pemmican bars now scale with input kcal at
  ~97% retention (half-bar granularity) instead of a fixed 3 bars/set — small
  inputs (smoked fish + javelina fat, ~1058 kcal) were printing 1800. Full-size
  sets still pay 3 bars. Recipe and retention unchanged.
