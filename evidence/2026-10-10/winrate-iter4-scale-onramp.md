# Win-rate iteration round 4 — scale on-ramp tuning (2026-10-10)

## The change (tuning call — Steve can overrule)

`src/js/hierarchy.js` `polityOf()` BELONG gate: **link age 21→14 days, trust 60→50**.
Arrears must still be 0; the primary's realm must still hold ≥4 villages.
`docs/SCALE.md` updated to match. `kingdomEndingEligible` (70/0/21 — the
*ending* frame, not scale qualification) intentionally untouched.

**Why this lever:** 420 combined runs, 0 wins. Confirmed by 3 independent
policies (winseek, oracle-v2, oracleV2 replication): the binding constraint is
the scale on-ramp. National requires 21+ days of link age + trust 60, but
median survival is 34–48 days — the requirement is unreachable inside a strong
run's lifetime (see `evidence/2026-10-10/survival-validation.md`,
`policy-competence-panel.md`, `winrate-iter3-oracle-v2.md`).

Steve's standing directive is to tweak and iterate toward a reasonable win
rate (target ≥15%); wave-ledger bars are propose-only and were not touched.

## Exploit check

**Boundary proof** (`scripts/test-scale-onramp-20261010.js`, green on seeds
11/222/3333): vests at exactly 14d/trust 50; does NOT vest at 13d, at trust
49, with arrears > 0, or with a <4-village realm. A fresh subordinate link
starts at trust 30 — trust must be *earned*.

**Why the lowered bar can't be gamed trivially:**
- Trust gains are deed-priced (`hierarchy.js`): first-gesture gift 2,000 kcal
  → +10 (proportional — less food, less trust); first-gesture visit +8 costs 3
  days of a representative's (or the player's) time; `proveWorth` +1..6 scaled
  by deed magnitude; honoring the primary's demands +gain, refusing −15; the
  oath's trust is proportional to kcal sealed (0-kcal oath = token trust).
  Trust 30→50 costs real food and real days.
- 14 days must genuinely elapse; arrears must be 0 (tribute shortfalls cost
  trust −4..−6 and accrue arrears).
- The realm-4 requirement needs the primary to hold ≥4 villages — off-screen
  foreign-polity sim, not player-conjurable. A throwaway link to a 2-village
  pact never vests.
- Empirical half: the round-4 sweep records every national-road vest
  (day/shape/trust/link-age). See "Vest events" below.

## Measurement

Driver: `scripts/winrate-iter4.js` (unified; day loop + utilization verbatim
from `scripts/winrate-iter3.js`; blocker decomposition from
`sweep-winseek.js`; adds vest-event tracking + winDay). 60 seeds × 120-day cap
(Steve's 120d protocol), `Game.doAction('wait')` per part — never raw
tickAction. Policies: **winseek** (primary) + **oracle-v2** (best-playing).

Analyzer: `scripts/analyze-iter4.js`.

## Results

### winseek (primary metric) — 60/60 runs, 120d cap

- **Wins: 0/60 (0%)**. Survival: median 32d, max 73d. End: 60/60 village-lost.
- Scale: **60/60 regional, 0/60 national+**. Binding blocker: `scale` in 60/60.
- Vest events: **0** — no national road vested in any run.
- maxWave: 46× w1, 14× w2, 0× w3+. Wave-2 median unlock day 26 (n=14).
- Feast: held 108/266 attempts; armed 50/60 runs; **used 0/60**.
- Death causes (top): combat 205, villager combat 106, monster 58, sickness 55,
  starvation 47, the night 43.
- Diplomacy: 6 proposals/run (median), 0.67 active links/run (mean), 25/60
  runs held ≥1 active link — but none matured.

### oracle-v2 — 60/60 runs, 120d cap

- **Wins: 0/60 (0%)**. Survival: median 41d, max 78d. End: 60/60 village-lost.
- Scale: **60/60 regional, 0/60 national+**. Binding blocker: `scale` in 60/60.
- Vest events: **0**.
- maxWave: 28× w1, 32× w2 (median unlock day 28), 0× w3+.
- Feast: held 127/506 attempts; armed 51/60; **used 2/60**.
- Utilization: 3.3 ability uses/run, 0.48 synergies, 6.0 kills/run (0 counter),
  11 aid quests handed in/run, 2 trap catches on 1 set.
- Death causes (top): combat 162, villager combat 132, the night 109,
  monster 76, starvation 44.

### Combined round-4 measurement: 0/120 wins, 0/120 national+ (target ≥15%)

### Sibling oracleV2 replication (same tuned code, 120d)

`scripts/sweep-r4-scale-results.json` (sibling's, 6 shards × 10 seeds, already
complete): **0/60 wins, median 50d, max 87d, 60/60 regional, 0 national**.
0 subordinate links held at end (links med 0/run); proposals med 7/run.

## Why the lowered bar didn't move the needle: link fragility

The bar is no longer the binding constraint — **link survival is**. Probe
(`scripts/probe-linkstates-20261010.js`, re-ran the 8 winseek runs that held
links, dumped every link's end state + break cause):

- Subordinate links form at trust 30. Observed end-states: trust 8–19 on
  broken links, 23–30 on the rare actives. **58/58 broken links broke via
  'succession'.**
- The chain (`hierarchy.js` `linkTick` → `theirLeaderDied` → `successionCrisis`):
  the other village's designated speaker is a named person in the catch-up
  sim's roster; the sim kills speakers regularly (hunger/raids). Each death =
  **trust −15, and the link snaps if trust < 20**. A fresh link at 30 dies on
  the FIRST speaker death (30−15=15 < 20).
- To vest BELONG at trust 50 needs ~7 weeks of perfect tribute (+3/wk) with
  no speaker death — structurally near-impossible when speakers die every few
  weeks. The observed lifecycle is churn: form at 30 → speaker dies → snap →
  re-form at 30 → …
- Even the realm-4 requirement was met in one case (seed 55, village_3 held a
  4-village realm) — the links still snapped on succession first.

This is the round-5 lever, with numbers: the succession snap (trust < 20
breaks on a −15 hit) makes the BELONG road structurally closed no matter the
bar. Candidate directions (for Steve / the loop — NOT changed in this round):
grace period for young links, a smaller succession hit, or rarer speaker
deaths. Note the canon tension: "deaths hit hard" is designed — but "hit
hard" currently reads as "the road is closed."

## Vest events (exploit-check, empirical)

- Boundary proof (`scripts/test-scale-onramp-20261010.js`): green on 3 seeds —
  vests at exactly 14d/trust 50; no vest at 13d, trust 49, arrears > 0, or
  realm < 4.
- Sweep vest tracker (`scripts/winrate-iter4.js` `trackVests`, self-tested
  green by `scripts/test-vest-tracker-20261010.js`): **0 vest events in 120
  runs** (60 winseek + 60 oracle-v2) — nothing reached any national road, so
  there was nothing to game.
- Trust economics audit: trust 30→50 costs real food/days (2,000-kcal gift
  +10, 3-day visit +8, tribute +3/wk, proveWorth +1..6/deed; oath trust
  proportional to kcal sealed). No cheap farm exists; 14 days must elapse;
  realm-4 is off-screen-sim-gated. **No exploit found — no fix needed.**

## Interpretation

Round 4's authorized change is landed and proven correct at the gate level,
but the win rate is still 0% — the binding constraint moved one level deeper,
from the bar's height to link fragility. The scale on-ramp needs the
succession mechanics addressed before any bar value can matter. Recommend
round 5 target the succession snap (with a fresh tuning call), not the bar.
