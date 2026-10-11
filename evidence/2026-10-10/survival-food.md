# Survival food economy — Part A1 (tier-1 reachability) — 2026-10-10

Worker: survival-food worktree. Scope: food numbers + Haven tier thresholds (no structural changes, no new systems).

## What was measured

40 seeds × competent policy × 200-day cap, villagerTurn-corrected day loop
(`doAction('wait')` = live path with needs-driven NPC agency; never raw
`tickAction(128)`). Runner `scripts/measure-survival-food.js`, analyzer
`scripts/analyze-food.js`. Baseline shards: `/tmp/food-s{1,2,3,4}.json`.
Post-tune shards: `/tmp/food-v2-s{1,2,3,4}.json`.

Recorded per run: daily pantry kcal, wood/stone/preserved stocks, haven
tier reach days, starvation deaths (telemetry), labeled pantry inflow
ledger (stockPantry wraps), policy activity counters.

## Baseline (before)

- Tier-1 reach: **1/40** (seed 35, day 28 — via RNG task-lead, not competent play).
- Blocker: **100% wood**. Peak wood: p10=11, med=13, p75=15, p90=61, max=257.
  Peak food: med=43,590 (the 8,000 food bar clears easily early).
- Pantry trajectory (median): 47,250 (day 0) → 30k (d5) → 23k (d15) →
  8.5k (d25) → 500 (d35) → 0. Gross burn med 3,520 kcal/day.
- Village ~84% self-sufficient (per-capita pantry draw ~217–300/day by day 10–15);
  the pantry is a 3–4 week buffer, working as designed.
- Deaths: combat 233, night 84, sickness 37, wounds 38, starvation 18,
  thirst 8. The village dies fighting, not starving — the vicious cycle.
- Median survival 31 days. Inflows: garden 863k, fish 800k, forage 565k
  total (~1,500 kcal/village-day). Player donations: 0 (policy keeps a
  1-day buffer, never accumulates surplus).

## Root cause

The tier-1 wood bar (200) was tuned for a phantom "2 wood-duty" village
banking +23/day. The competent policy staffs wood duty for hearth
maintenance only (`workWater`: pile < 8, one duty max), so the pile
equilibrates at (8 + one duty yield) ≈ 11–15. **No yield/burn number can
reach 200 under that staffing** — the policy stops staffing at 8. The bar,
not the yields, was the binding constraint.

The seed-35 fluke: a villager took the wood domain via the challenge-aging
path (ignored challenge → task lead after 8 parts → 4 resolutions/day),
accumulating 257 wood. RNG, not competent play.

## Changes (numbers only)

1. **Tier-1 wood bar: 200 → 12** (`src/js/havenGrowth.js`). Sits at the
   maintenance floor the policy sustains (p10=11). The meaning of tier 1
   is the food bar (8,000 = buffer healthy); the wood bar is the "pile
   isn't empty" check. Fiction text updated (sysDangle).
2. **Wood duty yield: R(3,6) → R(5,9)** (`src/js/game.js`). R(3,6) was
   unrealistically low for 4 hours of axe work; R(5,9) is still
   conservative but game-balanced against the 6L/wood boil burn. Raises
   the maintenance peak from ~13 to ~15 so the bar (12) is reliable but
   not day-1 trivial (starts at 10).
3. **Food bar kept at 8,000.** It's the thriving check; met for ~20 days
   (median pantry <8,000 at day 23).
4. **BALANCING.md**: corrected stale pantry start (94k → 47,250,
   measured), added Haven Tiers section with 5-question rationale.

## After (40 seeds, same harness)

- Tier-1 reach: **34/40**, median day 12 (days 5–26, mostly 5–20).
- Tier 2: 0/40, tier 3: 0/40 (unchanged — out of scope).
- Median survival 29 (neutral; deaths still combat-dominated).
- Starvation deaths 22 (was 18) — noise, not a signal.
- The 6 misses: 4 early combat deaths (out of scope — combat lane);
  2 genuinely non-thriving villages whose pantries collapsed before wood
  accumulated (working as designed — tier 1 is a thriving check).

## Exploit check

`scripts/test-survival-food-physics.js` (8/8 green): the pipeline is
lossy at every step — butcher 0.40/0.30, smoke 0.95/0.80, render
0.90/0.65. Full turkey pipeline: 3000 → 1200 → cooked → 1140. No
infinite-food loop. The one legal gain (beans 150 raw → 300 cooked) is
the designed one-way "knowledge is calories", not compoundable.

## Hunt yields (probe)

Villager hunt duty (`villagerHuntResolve`, 200 calls): 21% success, mean
3,762 kcal/kill, 790 kcal/resolution. A staffed hunt duty is a viable
food leg (~790–3,160 kcal/day depending on staffing). The competent
policy never assigns hunt duty — noted, not changed (policy is the
instrument).

## Proof tests

- `scripts/test-survival-food-tier1.js`: 3/3 seeds reach tier 1 (after);
  1/3 before (old numbers) — FAIL confirmed on stashed old code. ×3 seed
  sets (7,17,35 / 1,2,3 / 40,41,42): 9/9 green. Also pins tier-1 effects
  (hearth 10%, pantry +25%).
- `scripts/test-survival-food-physics.js`: 8/8 green (regression guard).
- Regressions: `test-haven-growth-20261010.js` 61/61 (updated for new bar),
  `test-break-food-spoilage.js` green, `test-break-food-20261010.js` 16/16
  green, ontology 57/57.

## Design calls for Steve's overrule

1. **The policy doesn't pursue the announced bars.** The competent policy
   staffs wood duty for hearth maintenance only; it never stockpiles
   toward tier bars. The numbers-only fix aligns the tier-1 bar with
   maintenance behavior. The RIGHT long-term fix is probably a
   policy/behavior change (staff toward announced goals) or a tier design
   that rewards maintenance — but that's structural, out of scope here.
2. **Tier 1 fires in weeks 1–3** (median day 12). It's a "village has its
   act together" milestone, not a mid-game achievement. Tiers 2–3 remain
   the long-term stretch goals.
3. **Tier 2 (palisade) is still unreachable** (0/40): the policy never
   staffs stone duty or preserves food, and the 350-wood bar needs
   sustained staffing. Breaking the palisade vicious cycle needs follow-up
   (likely Part A2 or the behavior lane).
4. **Wood bar of 12 is fictionally thin** for "The Longhouse". The fiction
   now reads "8,000 kcal + 12 wood". If Steve wants a beefier bar, the
   policy must staff toward it (see #1).
5. **Did not touch**: forage/hunt/trap/garden yields (working), depletion/
   regrowth (landed in r5, healthy), spoil rates (healthy), per-capita
   consumption (healthy — village ~84% self-sufficient). The food economy
   is sound; only the tier bars were misaligned.
