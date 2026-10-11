# Survival-economy rebalance — validation sweep (2026-10-10)

Worker: survival-validate (oversight-survival-econ). READ-ONLY game code; one
test-script path fix committed (below).

## Method

- **Policy:** `scripts/policies/winseek.js` (Worker E's instrument — every road pursuing the galactic-table deed gate), 200-day cap, seeds 1–60 (SAME seeds as Worker E, so RNG streams are held constant), 6 parallel shards × 10 seeds.
- **Day loop (harness difference — read this):** Worker E's sweep drove time via the shared `sim-harness.runDays` with raw `Game.tickAction(128)`. This sweep uses the villagerTurn-corrected live path (`Game.doAction('wait')` per part, per the parity audit's Worker-A finding that raw tickAction only fires `npcBatchTurn` and under-measures needs-driven villager agency). Same policy, same seeds, same cap, same shards; the ONLY harness change is the corrected day loop.
  - Seeding: `sim-harness.loadGame` installs mulberry32 BEFORE eval (modules that capture `Math.random` at load stay deterministic); window stubbed during eval, deleted before play.
- **Result artifact:** `scripts/sweep-survival-validation-results.json` (merged 60 rows). Runner: `scripts/sweep-survival-validation.js`; analyzer: `scripts/analyze-validation.js`.

## Headline numbers (before = Worker E's 60-seed winseek baseline)

| Metric | Before (E) | After (this sweep) | Δ |
|---|---|---|---|
| Median survival | **24 days** | **34 days** | +42% |
| Max survival | 43 | 110 | +156% |
| Wins / galactic-table reaches | 0/60 | **0/60** | — |
| Haven tier 1 | 0/60 | **40/60** | fixed |
| Haven tier 2 / 3 | 0/60 | 0/60 | — |
| Scale national+ | 0/60 | 0/60 | — |
| w1 ≥5 distinct | 42/60 (70%) | 50/60 (83%) | +13pp |
| w2 ≥5 distinct | 1/60 (2%) | 0/60 | −1 |
| w3 ≥4 distinct | 0/60 | 0/60 | — |
| w4/w5 bars | 0/60 | 0/60 | — |
| Contests ≥3 survived | 13/60 (22%) | 11/60 (18%) | −4pp (noise) |
| Crises ≥3 | 36/60 (60%) | 48/60 (80%) | +20pp |
| Sentiment taught | 45/60 (75%) | 55/60 (92%) | +17pp |
| Feast surge used | 21/60 (35%) | 13/60 (22%) | −13pp |
| Integration stage ≥3 | 41/60 (68%) | 52/60 (87%) | +19pp |
| Wave-2 unlock (any) | — (not reported) | 16/60, median day 24 | — |
| Wave-3 unlock (any) | 0/60 | 0/60 | — |
| Binding blocker | scale (all) | **scale (all 60)** | — |

## Unlock pacing detail

- Tier 1: 40/60 (A1's wood-bar fix working in this policy; A1 measured median unlock day 12 with competent policy — day-of-unlock not captured in this sweep's rows).
- Wave-2 unlock: 16/60 runs, median day 24. Wave-3 unlock: 0/60. Wave-4/5 facing: 0/60.
- Scale: all 60 runs reached **regional**; none reached national. (E reported 0/60 national without reporting regional reach.)

## Death-cause distribution (623 recorded deaths across 60 runs, day-binned)

| Cause | Share |
|---|---|
| combat (player) | 37.6% |
| villager combat | 15.7% |
| monster | 11.6% |
| sickness | 9.8% |
| starvation | 8.0% |
| the night | 7.5% |
| a wound that wouldn't close | 4.0% |
| other (phoenix link, thirst, expedition, contest, named monsters) | 5.8% |

Combat-related deaths total **64.9%** — still the dominant killer, down in absolute
count from E's profile but unchanged in composition. Sickness 9.8% (was 37/451 ≈
8% in E's food-worker baseline). Starvation 8.0% — the village still dies
fighting, not starving.

By day-bin: d1–10 dominated by combat (29/69); d11–20 combat+monster spike
(59+42/190); d21–30 the night climbs (23/202); d31–40 and d41+ stay
combat-dominated (40/85, 32/77) with starvation creeping in (9/77 d41+).

## Exploit scan

No infinite loops. Spot-checks on the three new surfaces:

1. **Food physics** — `scripts/test-survival-food-physics.js`: **8/8 green** on current master. Pipeline lossy at every step (butcher 0.40/0.30, smoke 0.95/0.80, render 0.90/0.65); full turkey pipeline 3000 → 1200 → 1140; re-cooking does not compound. The one legal gain (beans 150 raw → 300 cooked) is the designed one-way "knowledge is calories," not compoundable.
2. **Heal/attrition exploits** — `scripts/test-survival-attrition-exploit-20261010.js`: **16/16 green** on current master. Rest heals only when fed+hydrated (crisis rule), rest costs kcal, field_medicine costs 100 kcal + once per part + refused-without-charge when short (the A2 fix), sleep can't loop without food/water, triage never exceeds maxHealth, rest/triage/sleep all capped at maxHealth.
3. **Safety nets** — `scripts/test-survival-nets.js`: **100/100 green** on current master. Quest budget (≤3/run, 4-day cooldown, days 7–21, struggling-gated), relief options once per relief with ~3-day expiry, aid requests 1/village/week + trust ≥35 + struggling gate, neighbor pantries finite (30-day max-aggression test: total received ≤16k, pantry visibly depletes, honest refusals).
4. **Code-review pass** on `src/js/safetynets.js` bounds: quest completion single-shots (activeAidQuest nulled + ledger incremented — no double hand-in); relief triage refuses honestly without consuming the option when short; aid requests gate on knowledge/trust/struggle/cooldown. **One minor inconsistency found:** relief `'hunt'` marks the option used BEFORE the no-hale-hunters check (returns `'noneed'` but burns the option), while triage's `'short'` does NOT consume the option — the same r3 rule ("refused tap never eats the turn") applied inconsistently. Edge case (only when the roster has nobody hale); noted, not a blocker, easy one-line fix for a follow-up.

Also fixed (committed with this note): `scripts/test-survival-attrition-exploit-20261010.js` had a hardcoded absolute require to the deleted A2 worker's tree (`/home/hatch/workspace/worktrees/survival-attrition/scripts/sim-harness`), which made the proof unrunnable from anywhere else. Replaced with `require('./sim-harness')`. Verified 16/16 green post-fix.

## Verdict — did the survival wall move?

**Yes, but not to ~60.** Median survival moved **24 → 34 days (+42%)**; max survival moved **43 → 110**. The worst early collapse (seed 6, day 9) still exists; the mid-game death band moved from days ~20–30 to ~30–40. Tier 1 went from a dead gate to a working one (0/60 → 40/60). Crises, sentiment, and integration gates all moved 15–20pp in the right direction. The food/attrition/nets changes compose: the village still dies fighting (65% of deaths), not starving (8%).

**What did NOT move:** wins 0/60, table 0/60, wave-2 deed bar 0/60, wave-3 unlock 0/60, national scale 0/60 — the binding blocker is **scale in all 60 runs**, same as before. Wave-2 unlocks happen (16/60, median day 24) but runs end before 5 distinct wave-2 deeds fill. The feast-surge-used rate dropped (35% → 22%) — plausibly because the policy host feasts weekly but villages die before the surge is used; worth a look, not decisive.

**Harness caveat (honest):** E's baseline used the raw-tickAction loop; this sweep used the villagerTurn-corrected loop. Direction-of-bias: the corrected loop gives villagers real individual needs-driven agency (they eat/drink/forage themselves), which plausibly lifts survival a few days versus E's run. Cross-anchor: the food worker's pre-tune baseline measured median 31 on the corrected harness with the competent policy, and this sweep measures 34 with the more aggressive winseek policy — so the design-change delta on the corrected harness is roughly +10% on the median, with the bigger gain in the tail (max 43 → 110). The 24 → 34 headline should be read as ~+10 days with maybe 2–4 of those attributable to the harness correction rather than the rebalance.

**Still binding (for Steve's queue):**
1. **Scale is the wall now, not food.** All 60 runs reach regional; national needs 21+ day link age + trust 60 at a 34-day median — mathematically closer but still out of reach. The vicious cycle moved from "can't survive" to "can't get old enough."
2. **Wave-3 unlock: 0/60.** Whatever gates wave 3 (scale-gated per the audit) never fires inside 34-day median survival.
3. **Combat is still 65% of all deaths.** The A2 retune softened it (−12% early deaths in their lane, hushwolf 1v1 now winnable at full HP) but wave-2/3 monsters at day 8/25 unlocks still maul 100-HP players. The policy fights unarmed — a policy/harness fix (weapons, haven-well drinking) would shift measured deaths substantially; a human would do better than this instrument.
4. **Tier 2 (palisade) 0/60** — the policy never staffs stone duty or preserves food; the food worker flagged this as needing a behavior-lane follow-up.
