# Balance: scale on-ramp, integration pacing, plant-L3 lane (bal-scale, 2026-10-10)

## Diagnosis (from sweep r4: 180 runs, scale 'village' in all 180)

**Scale had no organic on-ramp.** Measured with a link-seeking policy on the
pre-fix engine: the mechanics work (regional by day 7–17 when a village is
close), but three gates blocked organic runs:
1. **First contact too late**: `maybeVillageRumor` at 1–6%/day heard the
   nearest fire ~day 22 on average (measured: rumors day 8–14, one seed none
   by day 20). PROGRESSION.md #5 says villages are NEAR and contact happens
   EARLY — the number didn't deliver the design.
2. **National mathematically unreachable**: `genVillages` made 2–3 villages.
   LEAD needs 3 subordinate links, covenant/trade need 3 peer links, BELONG
   needs a foreign 4-realm (primary + 3 subs). With 2 villages, no road works.
3. **Foreign polities too slow for BELONG**: 22%/wk → a 4-realm in ~a season+.

**Integration was a coin-flip cadence.** `offerSystemQuest` fired at flat
15%/day and shared `activeQuest` with villager errands — measured 4/8 runs
with a 'visit' quest blocking the System's line for the whole run, and
system_teach completions 0/8 (quests need a NEW L3 plant; the plant lane was
dead so pending quests sat forever, blocking new offers).

**The plant-L3 lane was stuck at L1→L2, not at offers.** `offerSystemQuest`
already accepted L1 plants as teachable (`level < 3`) — offers DID fire
(2/8 runs had system_teach pending). The chain L1→L2 needs 5 post-
identification harvests of the same species; the policy never did targeted
revisits, and two policy bugs hid it: (a) `walkToward` stopped within 2
tiles but the sweep reads the player's tile detail — wrong tile's grid;
(b) swept cells go dirt for 2 days (regrow) — resweeps found dirt.

## Changes (engine)

- `src/js/game.js` — `maybeVillageRumor`: early-contact boost — villages
  within 4 tiles heard at ~28%/day for the first 15 days (nearest fire known
  ~day 4–5). Still a rumor roll, never a calendar grant.
- `src/js/game.js` — `genVillages`: 2–3 → 3–4 villages (all six national
  roads reachable; canon: villages NEAR, ~500m apart).
- `src/js/hierarchy.js` — `_foreignPolitySim`: 22% → 30%/wk, 50% → 65%
  grow-bias (a 4-realm in ~2 months; still seasonal).
- `src/js/hierarchy.js` — `_formLink`/`_formPeerLink`: stamp
  `state.lastLinkDay` (weights the System's offer cadence).
- `src/js/game.js` — system quests get their own slot
  (`scholar.activeSystemQuest`); a villager 'visit' quest no longer blocks
  the System's line. Legacy `system_task`/`system_teach` in `activeQuest`
  routes into the slot. `checkQuest` checks the system slot on every action.
- `src/js/game.js` — `offerSystemQuest('daily')`: play-weighted cadence —
  base 15%, +30% if an arc advanced in the last 7 days, +30% if a region link
  formed in the last 7 days, +50% chaining within 3 days of a completed
  lesson (if something's teachable). Event offers bypass the roll.
- `src/js/progression.js` — `progDaily` calls the weighted offer;
  `checkArc` stamps `pg.lastArcDay`; `checkSystemQuest` stamps
  `pg.lastSystemQuestDay` on completion.
- `docs/SCALE.md` — tuning notes updated (3–4 villages, early contact,
  30%/wk foreign cadence).
- `scripts/test-integration-road-20261010.js` — updated to the new slot
  contract (was asserting the old blocking behavior).

## Proof

- `scripts/test-bal-scale-ladder-20261010.js` (new): 18 checks ×3 seeds,
  ALL GREEN. BEFORE (stashed): 9 fail — early-rumor boost, 3–4 village
  count, cadence weighting, system slot, link-day stamp.
- `scripts/test-integration-road-20261010.js`: 216 pass ×3 seeds (updated).
- Regressions: `test-scale-ladder-20261010` ALL GREEN,
  `test-national-shapes-20261010` ALL GREEN,
  `test-hierarchy-break-20261010` 35/35. Ontology 57/57.

## Measurement (60 seeds × progress2, 90-day cap, final policy)

- **regional by day 45: 59/60 (98%)** — bar ≥50% ✓. Median regional day 4,
  max 8. (First run 60/60; final 59/60.)
- **national by day 80: 18/60 (30%)** — bar ≥25% ✓. National days 6–16
  (LEAD via propose→counter→sweeten, 1500 kcal). 16/60 (27%) before the
  faster re-forming; 18/60 (30%) after.
- **stage-3+ of runs reaching day 45: 0/60 reached day 45** — bar
  UNMEASURABLE (survival regression; all runs end day 9–19). Trajectory:
  stage 3 reached by ~day 13–18 in 5/60 progress runs (8%) — AHEAD of the
  day 40–60 target pace. In the competent policy's 2 runs that DID reach
  day 45, 1/2 (50%) was stage 3+. The blocker is survival, not pacing.
- **study bites: 5.90/run** — bar ≥0.3 ✓ (was 0.10 in r4).
- **system quests: 1.10/run** (was 0.02 in r4).

The national misses form 2–7 links but deaths snap them before 3 are
concurrent ("deaths detonate hierarchies" — designed). The policy re-forms
within 2 days; the survival fixes will lift this further.

## Notes for coordinator

- The policy's link-seeking proposes on rumor (no walking needed —
  `proposeLink` needs `knowsVillage`, not location); courtship walks only
  after 2 cold declines. This is the fast path the bars assume.
- National is reachable (LEAD via propose→counter→sweeten, 1500 kcal) but
  the realm is FRAGILE: "deaths detonate hierarchies" — a dead speaker snaps
  links and `nationalLive` clears (measured: national day 6, dissolved day 7
  after the rep died). Holding national needs the survival fixes.
- `scripts/policies/competent.js` and `idle.js` untouched — the measurement
  policy lives in `/tmp/progress2-policy.js` (scratch, not committed).
- No KNOWLEDGE gates added anywhere (Steve's law). The plant lane is
  knowledge by nature; scale/integration never check it.
