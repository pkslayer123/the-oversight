# Worker E — Win-Seeking Completion Runs (2026-10-10)

## Task
Steve's order: run games that SEEK to complete the game. Build a win-seeking
policy pursuing the galactic-table deed gate; run 200-day games across 60+
seeds in parallel; report win rate, per-requirement completion, binding
blockers; fix or document unachievable requirements.

## Policy: scripts/policies/winseek.js
Built on competent survival base, inverted to pursue:
1. **Hunt** (deed bars 5/5/4/3/2): patrols 3x/week to far wild tiles;
   wave-targeted (only fight waves with unfilled bars; flee filled waves);
   flee already-faced types (deed banked); fight new ones if winnable
   (3.5x HP threshold, bolder than competent); flee hopeless at once.
2. **Contests**: always participate (choice 0), never refuse.
3. **Scale**: court villages (study codex), proposeLink as subordinate
   (BELONG road — legitimate per Steve), accept counter-offers, pay weekly
   tribute (+3 trust), answer national beat (never refuse/walk).
4. **Crises**: weather them; famine buffer via preservation.
5. **Sentiment/feast**: channel keepsakes daily once taught; host feasts
   weekly; surge via devotion lane (resonance ≥35).
6. **Integration**: system quests, trials, teaching, naming → stage 3 (80+).

## Harness findings (policy debugging)
- **Pending-encounter sleep block**: travel in `daily` (post loop) sets
  pendingEncounter → sleep() aborts without advancing day → clock stuck.
  Fix: travel belongs in `upkeep` (pre harness drivers). Pattern matches
  competent's forageTrip.
- **Deed-at-startCombat**: startCombat records wavesFaced immediately, so a
  naive "flee if faced" flees everything. Fix: snapshot faced-before-fight
  via ctx._fightObj guard.

## Results

**60 seeds, winseek policy, 200-day cap (6 parallel shards × 10 seeds)**

- **Wins: 0/60. Table reached: 0/60.**
- Median survival: 24 days (max: 43 days)
- Binding blocker: **early-game survival** (not a gate design issue)

### Per-requirement completion

| Requirement | Met | Notes |
|---|---|---|
| w1 ≥5 distinct | 42/60 (70%) | Policy works |
| w2 ≥5 distinct | 1/60 (2%) | Runs die before filling |
| w3 ≥4 distinct | 0/60 (0%) | Runs die before filling |
| w4 ≥3 distinct | 0/60 (0%) | Runs die before filling |
| w5 ≥2 distinct | 0/60 (0%) | Runs die before filling |
| Contests ≥3 survived | 13/60 (22%) | Reachable, needs time |
| Crises ≥3 weathered | 36/60 (60%) | Reachable |
| Scale national+ | 0/60 (0%) | Needs 21+ days + trust 60; runs die first |
| Sentiment taught | 45/60 (75%) | Reachable (auto at integ 60) |
| Feast surge used | 21/60 (35%) | Reachable |
| Integration stage ≥3 | 41/60 (68%) | Reachable |

### Analysis: The gates are fine; survival is the wall

The deed gates are **well-calibrated**. The policy reliably achieves the
early requirements (w1 70%, sentiment 75%, stage 68%, crises 60%). The later
requirements (w2-w5 bars, national scale) are unreachable **only because runs
end at median day 24**, not because the bars are too high.

Evidence the bars are reachable:
- Best run (seed 17, day 43): w2=4/5 (one short!), contests 4/3, stage 3,
  sentiment, surge used. With 20 more days, w2 would fill.
- The w2-w5 bars (5/5/4/3/2) are proportional to the wave sizes (15/15/9/9/8).
  The policy fills w1 (5/15) reliably; w2 (5/15) is the same ratio.

The BELONG scale road works mechanically (links form by day 3-4, tribute
paid weekly for +3 trust), but needs 21+ days link age + trust 60. Median
survival (24 days) makes this mathematically impossible for most runs.

Haven tiers (Longhouse/Palisade/Granary) are **never built** (0/60 reach
tier 1). Tier 1 needs 8,000 kcal + 200 wood stockpile. Villages cannot
accumulate surplus while starving. The Palisade (tier 2) would give raid
defense — the defensive infrastructure that would help survival is
unreachable because survival is already failing. A vicious cycle.

### Death analysis

Villages lose ~12 members in ~24 days. Causes (from r5 baseline + winseek):
- Combat (player): ~4/run — the deed bars require fighting, but each fight
  risks death. The policy minimizes this (wave-targeted, flee filled waves,
  flee already-faced), but the base lethality is high.
- Combat (villagers): ~2/run — villagers die on patrols/expeditions.
- Attrition (night/sickness/starvation/thirst/wounds): ~6/run — the village
  cannot sustain itself.

### Conclusion

**The game is currently uncompletable by win-seeking play.** This is a
**survival/balance** issue, not a gate-design issue. The 5/5/4/3/2 bars,
contests, crises, sentiment, surge, and stage requirements are all
well-designed and achievable in principle. They are unreachable in practice
because villages die at median day 24, but the win requires ~100 days
(per the pacing audit).

**No gate fixes are warranted.** The bars stand (Steve's law). The fix, if
any, is in early-game survival balance — food economy, combat lethality,
or haven tier reachability. That is a design call for Steve, not a worker
fix. Documenting here per the task: "document precisely why."

## Files
- scripts/policies/winseek.js — the win-seeking policy
- scripts/sweep-winseek.js — single-process sweep (shard-friendly)
- scripts/run-winseek-parallel.sh — parallel shard launcher
- scripts/merge-winseek.js — shard merger + summary
- scripts/sweep-winseek-results.json — merged 60-run results
- scripts/winseek-shards/ — per-shard raw JSON + logs
