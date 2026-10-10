# Worker D — Contest/Show Reachability (parity audit, 2026-10-10)

Branch: `parity-audit-d` (worktree `~/workspace/worktrees/parity-audit-d`)

## Organic fire rates (5 runs × 200 days = 1005 days, seeds 424242/777/31337, competent + fame-seeker)

Harness: `scripts/play-contest-reach-20261010.js` — full 52-file eval in index.html
order (minus DOM-only), mulberry32 seeded BEFORE eval, competent caretaker
(eats, rests, hauls 5000 kcal/day via `stockPantry`, waters, treats sick —
a hands-off harness otherwise scatters by day ~24, before the day-14 unlock).

| Event | per 100 days | raw |
|---|---|---|
| Contests | 11.64 | 117 |
| TV shows | 6.17 | 62 |
| Ratings summons | 3.18 | 32 |
| **Total TV** | **~21** | **211** |

≈1.5 TV events/week — inside the 2/week combined budget. First contest fired
day 14-17 in every run (the embargo holds). Categories seen: all 8
(forage 27, puzzle 15, chance 14, detective 13, weird 13, moot 12,
endurance 10, blood 8). Risks: high 50, medium 42, low 10, extreme 10.

## Playability verdict: PLAYABLE end-to-end

- 211/211 modals driven to a terminal (102 contestEnd, 93 showEnd, 3 died,
  12 refused, 1 showVillagerEnd). **0 stuck, 0 unresolved, 0 throws.**
- Countdowns: 117 fired → 117 interruptions → **0 skipped**.
- Arena fights (pit/gauntlet/siege suspend into real tactical combat):
  4 completed, 0 stuck.
- Broadcast frames: 99 starts / 216 ends (ends are idempotent, multi-path),
  **0 leaks** across 1005 days.

## Villager participation verdict: PLAYED, not RNG

- 57 interruptions included villager co-stars (multi-take picks); every one
  resolved through the real engine (`contestResolveVillager` via
  `_contestResolveOthers`): 19 fates — 15 won / 4 lost / 0 died.
- 5 villager-only contests → player watches → `_contestVerdict` →
  `contestResolveGroup` (4 lost, 1 died). Real fights/moots/ordeals, no
  outcome tables. One villager TV pull (`crib_mine`, sofia_chen) played the
  full watch-phase path → `_showVillagerEnd` (fans/shame).
- Casting: lead = player in 112/117 (design: "the player is the surest star,
  taken first when castable"). The 5 exceptions were the documented 10%
  System's-whim path — verified announced ("The System's whim"), never
  silent, constrained to notables. Co-star picks are notability-weighted
  (villagers accumulate real weights: 8-8.5 observed).
- Fan clubs: wins move the lane's club (blood→fight, endurance→survival,
  moot→social, else showbiz); drift pulls toward 0 daily. Losses don't move
  clubs (wins-only by design).

## Design conflict found & reconciled

**The conflict was real.** Live code = bal-util's WEEKLY drift (10%/week,
min 2.5, floor 12); the sibling's r13 suite (22/22) pinned the sibling's
superseded −1/day dawn decay — it actually ran **20/22** against live code.
Two failures:
1. "viewership strictly declines over 5 quiet dawns" — pinned the old
   mechanism. Updated K1b to pin the decided weekly design (declines
   week-over-week above the floor, floors at 12).
2. "rising ratings do not summon" — exposed a REAL incoherence in the util
   design: the `now < 15` low-clause fired the desperate path (+0.15, 75%
   contest share, 20% summons) on a RISING week that the −0.10 coast rule
   simultaneously rewarded. Fixed in `contestTick`: dip = falling
   week-over-week OR (low AND not rising). Now r13 is 23/23 ×3 seeds.

Also fixed while here (found via organic runs):
- **Show/contest id collision**: show pool `{id:'moot'}` vs contest pool
  `{id:'moot'}` — game.js routes on id, so the fully-authored TV show
  "The Moot" NEVER aired; every pick became a contest. Renamed show →
  `moot_show` (+ SHOW_BEATS key), regression pinned (no-collision assert).
- **Test staleness** (all pre-existing, verified via stash): test-shows
  R4b inherited the persisted `_trendWeek` dip flag across measurements
  (reset per-iteration now); test-contests TERMINAL set missing
  MOOT_JUDGE/MAW_JUDGE/MIXED/SHOW_VILLAGER + stale 'won 1 contest' copy;
  test-contests-playable predated the arena redesign (single-choice arena
  gates, unreachable epitaph phases now marked `unreachable: true`,
  stakes via arena waves not do.die).

## Suite status (final)

r13 23/23 (×3 seeds) · r12 34/34 · test-contests 29/29 · test-shows 73/73 ·
test-show-casting 22/22 · test-broadcast 47/47 · test-contests-playable
1302/1302 · test-shows-break 81/81 · test-shows-r2 65/65.

## Notes for coordinator (cross-lane observations, not fixed)

- A hands-off village scatters ~day 22-24 (starting 47k pantry empties;
  3 hungry days → the scattering). Contest content is unreachable in runs
  where the village dies early — expected, the player is the provider.
- Villager mortality is steep without player healthcare (thirst/sickness
  cascades); the supported-village caretaker was needed to measure
  villager participation at all. Survival-balance lane may want the numbers.
- An idle player gets moot-exiled ~day 16-17 (`exilePlayer('moot')`) —
  plausible (non-contributing stranger judged by the village) but worth a
  justice-lane glance since it zeroes contest participation.
- Villager co-stars win a lot (15/19) — threat-matching makes competitive
  fights; whether 79% is too kind is a balance call, not a bug.

Raw beats: `evidence/2026-10-10/reach-*-*.jsonl` (5 files).
Summarizer: `scripts/summarize-reach-20261010.js`.
