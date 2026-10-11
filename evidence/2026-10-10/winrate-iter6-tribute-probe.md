# Win-rate iteration round 6 (final) — the tribute-priority probe (2026-10-10/11)

## The question

Round 5 fixed succession churn and still got 0/60 wins, 0/60 vests — binding
blocker `scale`. The round-5 evidence noted the oracleV2 policy may simply
under-invest in tribute/deeds upkeep vs survival actions. Before Steve makes
a design call: **is vesting reachable at all by a policy that actually
prioritizes it?**

## The instrument

`scripts/policies/oracle-v3.js` — oracleV2 plus a tribute-priority layer, and
nothing else (scripts only, no game changes). Survival play is inherited
verbatim (fight assessment, abilities, traps, counter preference,
feast-then-fight, aid, quests); any survival difference vs oracleV2 is the
measured *cost* of the tribute priority. Three additions:

1. **Tribute vanguard** — pay each subordinate link current at the first
   upkeep of each day (before the day's consumption), max once/day/link, plus
   an immediate pay after any succession beat on that link. Same engine call
   as oracleV2's daily payment (payTribute is idempotent per week); earlier,
   never more often — re-paying thin-pantry partials 3×/day would drain new
   pantry arrivals into tribute faster than the village eats (a policy
   artifact, not "paying on time"; caught in verification, fixed before the
   sweep).
2. **Answer the call** — oracleV2 never answered `link.pendingDemand` (the
   primary's ~20%/week call: tribute +8, aid 3-day visit +8, counsel +8;
   refuse = −15; demands never expire and one pending blocks the next).
   oracle-v3 honors every demand promptly: counsel always (free); tribute
   only when the pantry covers the FULL cost (honoring short accrues arrears
   — the BELONG bar needs arrears 0); aid (the 3-day visit, a real villager
   loaned to the link) whenever the village isn't in immediate survival
   danger (pantry ≥3000, scholar kcal ≥30% cap); tribute/aid deferred during
   the 7-day mourning window (gains are 0 there — paying wastes food); refuse
   is never chosen.
3. **Succession watch** — wraps successionCrisis/theirLeaderDied: on any beat,
   immediately pay that link current + answer its pending demand. A death must
   never meet a neglected link.

Honesty rules: no direct `Game.proveWorth` calls with invented magnitudes —
deeds feed proveWorth through the engine's own recordDeed wrap (real deeds
only). The new trust comes from demands + on-time tribute, all engine-priced.

## Sweep results — oracleV3, 60 seeds 1–60 × 120d cap (DAY-CAP PROTOCOL)

Driver `scripts/sweep-r6-tribute-20261010.js` (day loop verbatim from the r5
driver), analyzer `scripts/analyze-r6-tribute-20261010.js`. Raw:
`scripts/sweep-r6-tribute-s{1..6}.json`. Base: b5fae7d6 (round-5 succession
law; predates the structural-scale / structural-counters landings).

**Result: 0/60 wins, 0/60 national+ (nationalLive ever: 0/60), 0/60 vests.**
Survival: median 36d, max 69d, min 7d; endReasons 60/60 village-lost.
maxTier: 0→18, 1→42. Wave unlocks: w1 met 57/60, w2 met 4/60, w3–w5 0/60.
End rank: 60/60 regional. Binding blocker: `scale` 60/60.

**The v3 levers fired** (60 runs): tribute pays 3,436 (median 48/run);
demands honored 61 (tribute 24, aid 6, counsel 31; median 1/run) in 38/60
runs; deferred 87 unique demands (mostly mourning-window or thin-pantry);
succession beats answered 1,016 (median 16/run); trust applied via demands
376 total (median 8/run); 3-day aid visits 6. Tribute extracted 5,079,552
kcal total, avg 1,478/pay vs ~5,000 owed — the pantry pays in thin partials.

**Trust got there; vesting didn't.** Max subordinate-link trust per run:
median 44, max 62. Bands: [30,40):20, [40,45):13, [45,50):16, [50+]:11 —
**11/60 runs reached the trust-50 bar**. Trust-at-break (91 subordinate
breaks, all succession): median 0, max 16 — breaks happen after the −6/wk
shortfall engine already ground trust down. Active subordinate links at run
end (165): trust median 9, max 50. Runs ending with any subordinate link in
arrears: 36/60.

**Death causes (n=634):** combat 21.5%, the night 20.2%, villager combat
16.9%, starvation 12.8% (up from 8.5% in r5 — the tribute priority's
footprint: 5.08M kcal walked out of pantries), monster 12.1%, sickness 6.5%.

## The cost

Median survival 36d vs oracleV2-r5's 38d (−2d). The tribute priority costs
almost nothing in raw survival — but starvation's share of deaths rose
(8.5%→12.8%): the food it moves is real.

## Gate decomposition — which BELONG gate fails? (the 11 seeds that hit trust ≥50)

Per the interpretation guide this is the "vests = 0 with survival intact"
branch, so the trust-growth math gets decomposed gate by gate. Probed the 11
seeds on the sweep base (`scripts/probe-r6-gates-20261010.js`, throwaway —
not committed), sampling every subordinate link daily against the four BELONG
gates (trust≥50, arrears=0, age≥14d, primary's realm≥4 villages):

| seed | best-trust day | gates then (t50/a0/14d/realm4) | best 4-gate day |
|---|---|---|---|
| 8 | d15 trust 57, arr 0 | 1/1/0/0 (age 11d, realm 2) | d18: 3/4 (age 14d ✓, realm 2 ✗) |
| 17 | d15 trust 52, arr 0 | 1/1/0/0 (age 9d, realm 2) | d14: 2/4 (age 8d ✗, realm 2 ✗) |
| 20 | d9 trust 52, arr 0 | 1/1/0/0 (age 7d, realm 2) | d9: 2/4 (age 7d ✗, realm 2 ✗) |
| 25 | d13 trust 62, arr 0 | 1/1/0/0 (age 10d, realm 2) | d8: 2/4 (age 5d ✗, realm 2 ✗) |
| 32 | d9 trust 54, arr 0 | 1/1/0/0 (age 6d, realm 2) | d8: 2/4 (age 5d ✗, realm 2 ✗) |
| 38 | d12 trust 50, arr 0 | 1/1/0/0 (age 8d, realm 2) | d12: 2/4 (age 8d ✗, realm 2 ✗) |
| 41 | d15 trust 53, arr 0 | 1/1/0/0 (age 11d, realm 2) | d14: 2/4 (age 10d ✗, realm 2 ✗) |
| 43 | d18 trust 55, arr 0 | 1/1/1/0 (age 15d ✓, realm 2 ✗) | d18: 3/4 (realm 2 ✗) |
| 46 | d12 trust 55, arr 0 | 1/1/0/0 (age 10d, realm 2) | d22: 3/4 (age 20d ✓, realm 2 ✗) |
| 49 | d22 trust 53, arr 0 | 1/1/1/0 (age 19d ✓, realm 2 ✗) | d21: 3/4 (realm 2 ✗) |
| 60 | d15 trust 51, arr 0 | 1/1/0/0 (age 11d, realm 2) | d14: 2/4 (age 10d ✗, realm 2 ✗) |

**11/11 clear trust≥50 AND arrears=0 together** (by ~day 9–22 — the policy
solves both fast). 4/11 (seeds 8, 43, 46, 49) additionally clear the 14-day
age gate → 3/4 gates. **0/11 clear the realm gate: the primary's foreign
realm is size 2 (primary + Haven) in every run, every day** — the foreign
polity sim never grows any primary's realm to 4 villages inside a lived run.

## Interpretation (for Steve's design call)

- **Vesting is NOT reachable by policy prioritization — 0/60 vests even
  though 11/60 runs reach trust≥50 with arrears=0.** The trust-growth math
  is fine; the arrears discipline is achievable; the link-age gate falls with
  a few more days of survival. The unreachable part is single and clean:
  **the primary's realm must hold ≥4 villages, and the foreign-polity sim
  never builds one inside a lived run** (realm stuck at 2/4 in all 11
  probed runs; median village life 36d vs ~2 months for a 4-realm at the
  sim's 30%/wk cadence).
- **Survival is not the binding wall for the trust side** (−2d median cost),
  but it is the wall the realm gate leans on: realms need ~60d to form while
  villages die at ~36d median. The tribute burden is the other pressure:
  5,000 kcal/week/link against pantries that pay 1,478-kcal partials —
  36/60 runs end in arrears, and arrears=0 is a vesting gate (the policy
  clears it transiently, but the end-of-run picture shows how fragile it is).
- Per the pacing law (40+ hours of engaging content, not day-counts as a
  number): the BELONG road as gated wants ~95d lives (round-4 finding) for
  foreign realms to mature. The design call is whether the mid-game grows
  denser arcs that mature realms faster (the structural-scale worker's
  engagement-driven foreign-realm growth, landed after this sweep's base,
  is aimed exactly here), or the realm gate itself wants re-thinking. This
  probe's job was to isolate the gate — done: it's the realm, not the
  trust.

## What the policy taught us (mechanics notes for future workers)

- `link.pendingDemand` was free trust on the table: oracleV2 never answered
  it; honoring added 376 trust across 60 runs (median 8/run) at engine prices.
  Any future scale-seeking policy should answer demands as a baseline.
- Mourning windows (7d, ~17 succession beats/run) are the main reason demands
  go unhonored — the policy correctly defers paid honors there, but counsel
  (free) should still be answered to unblock the demand slot.
- The vanguard's once/day/link cap matters: paying partials at every upkeep
  (3×/day) drains new pantry arrivals into tribute faster than the village
  eats. "Pay on time" ≠ "pay constantly."

## Process note (2026-10-11)

This round was executed by two concurrent same-loop workers (the SAME-OWNER
hazard from AGENTS.md, live): a sibling commit (acdcf63a) landed the scripts
+ sweep results to master and removed the first worker's tree/branch mid-run.
The scripts + data on master are the first worker's final code (verified:
the committed shard JSONs reproduce this note's numbers exactly — median
36d, 0/60 vests, 11/60 trust≥50). This note, the iteration-log row, and the
gate-decomposition probe are the first worker's remaining deliverables,
landed here separately. Lesson for the loop: the registry is keyed on loop
name, not run — a second instance of the same cron/worker must check for an
active same-owner run before registering a new tree.
