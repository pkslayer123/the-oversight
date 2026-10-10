# Completion sweep r2 — current master (2026-10-10)

HEAD: `7c832842` (break-it social r11). Full sweep via `scripts/sweep-completion.js`:
60 seeds (1–60, deterministic) × 4 policies × 200-day horizon. Read-only sims; no game code changed.

## Headline

**Still zero organic completions: 0 wins, 0 Arc IV, 0 table. 238/240 runs ended village-lost; 2 mvc runs survived the full 200-day horizon — the first full-horizon survivors any sweep has recorded.**

| policy | Arc III | Arc IV | table | wins | median days | max days |
|---|---|---|---|---|---|---|
| competent | 75% (45/60) | 0 | 0 | 0 | 29 | 52 |
| mvc | 30% (18/60) | 0 | 0 | 0 | 17 | 200 |
| leader | 18% (11/60) | 0 | 0 | 0 | 16 | 29 |
| zero | 20% (12/60) | 0 | 0 | 0 | 16 | 26 |

vs pacing-build sweep (post-pacing, pre-today's-break-it-work):
competent 78% → 75%, mvc 35% → 30%, leader 10% → 18%, zero 5% → 20%.
Median survival: 27 → 29 (competent), 17 → 17 (mvc), 14 → 16 (leader), 14 → 16 (zero).
Small shifts both directions; consistent with today's large break-it landing batch changing game code (food cook-transform canon fix, combat/leech hardening, knowledge-leak gates, regional honesty fixes) rather than a trend. None moved the completion needle.

## The two survivors (new)

First full-horizon survivors on record (both mvc policy):
- seed 6: 200 days, stalled at **Arc II**, breadth 24, stage 2, no sentiment, 0 contests seen, wave 1.
- seed 22: 200 days, reached Arc III on day 13, breadth 22, stage 2, no sentiment, 4 contests.

Even with 200 days alive, neither cleared the Arc IV gates: breadth 22–24 sits *below* the 25 bar, integration never crossed 80, sentiment/feast chains never started. Survival ≠ progress: integration and breadth compound too slowly even in the best-case survival.

## The Arc IV wall (gate analysis, competent n=60)

Arc IV requires: integration stage 3 (integ ≥ 80) + breadth ≥ 25 + sentimentTaught + feastSurgeUsed.
Among the 45 runs that reached Arc III:

| gate | unmet at end |
|---|---|
| feastSurgeUsed | **45/45** — every single Arc III run |
| stage 3 (integ 80) | 39/45 |
| breadth ≥ 25 | 20/45 |
| sentimentTaught | 24/45 |

**Feast-surge is the universal blocker.** Competent reach rates overall:
- sentimentTaught: **23/60 (38%)** — flat vs last sweep's 37% (22/60).
- stage 3 (integ ≥ 80): **7/60 (12%)** — flat vs 6/60.
- stage distribution: stage 1 = 8, stage 2 = 45, stage 3 = 7. No weak-policy run reached stage 3 (0/180).
- feastSurgeUsed: **0/240** — sim policies never channel keepsakes (policy blindness, flagged in the pacing audit; the game gate is fixed, the sims don't walk it).

The 7 stage-3 runs (all competent, seeds 24/29/35/40/51/55/59) are the closest the sweep has ever come to the table: 6 at Arc III with breadth 28–61 (bar met) and sentiment=true; the only missing link is the feast-surge chain. One (seed 40) reached stage 3 but stayed at Arc II — integration is necessary, not sufficient; the 2-crisis Arc III gate still requires the village to *experience* things.

## First-crisis / arc timing

- Arc II: median day 9 (competent) — the 6-new-breadth deed gate didn't slow the curve materially vs the old timer.
- Arc III entry (2 crisis kinds): median **day 20** (competent), 17–20 across policies. Pushed later than the old 1-crisis gate's day 12–15 — intended "earned, not attrition" effect holds.
- Breadth compounds well: competent mean 26.3, max 61.

## What moved vs the pacing-build sweep

1. **Full-horizon survivors appeared (2 mvc, 0 before)** — but they expose that survival alone doesn't advance the road: 200 days with breadth 22–24 and stage 2.
2. **Weak-policy Arc III rose (leader 10→18%, zero 5→20%)** while competent/mvc slipped slightly — code churn from today's break-it batch, not a pacing change. The weak-policy rise is the 2-crisis gate being reachable via dying *more*, not surviving better.
3. **Integration-80 stays the flatline**: 7/60 competent, 0 elsewhere. The discovery monoculture from the pacing audit persists; audience-encore trials exist but policies don't chase them.
4. **Feast-surge eligibility unchanged (0/240)**: still policy blindness, not a gate problem.

## Read

The organically completable game still hasn't completed. The binding stack, in order:
1. No policy channels keepsakes → feast-surge never fires (all 45 Arc III competent runs die at this gate).
2. Integration 80 reach: 7/60 competent, 0/180 otherwise.
3. Survival: competent median 29 days, max 52 — a year needs roughly 7× current max survival.

Next experiments per the pacing plan: a channeling-aware policy (to prove organic feast-surge), and measuring integration 40→80 diversity (trial uptake).
