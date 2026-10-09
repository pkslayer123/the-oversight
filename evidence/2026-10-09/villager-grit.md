# Villager Grit — Evidence (2026-10-09)

Steve's direction: "Villagers should vary. No more inputting percentages like 60% of own needs. These are people trying to survive. But not everyone has the same grit or capacity especially in the early game."

## What was built

**1. Killed the flat 60%.** `providesPerDay` (was: 60% of kcalPerDay for everyone) replaced with per-villager daily production from identity:
- `occupationFoodSkill(occ)`: farmer/gardener/fisher/hunter/forager/chef = 1.5; programmer/lawyer/accountant = 0.6; tiers documented in code
- `ageCapacity(age)`: prime 25–50 = 1.0, declines to 0.55 at 70+
- `gritRoll(temperament)`: DAY-TO-DAY variance — steady 0.90–1.10, anxious/fidgety 0.50–1.20
- `strangerFactor(day)`: 0.8 → 1.0 over 7 days (stress/disorganization; the "unknown land" penalty lives in the knowledge factor, not here)
- `villagerKnowledgeFactor`: retained (1 + 0.10 × plants, cap 1.8)
- Base: 1500 kcal (tweak C: competent people net HIGHER than old flat mean)
- Formula: `1500 × skill × age × knowledge × stranger × grit × health`

**2. Freeloader exile.** `freeloaderTick(v)` daily: 5-day rolling effort (actual/expected-per-person) + ledger drain. Stages: day 3 gossip (rep −8), day 7 direct warning (trust −10), day 12 moot vote (roster majority, trust < 35) → exile. Applies to PLAYER too. Good stretch resets. Bad week ≠ exile.

**3. Per-person expectations (no cruelty).** `villagerExpectedDaily` from the same identity model at MEAN grit. Elderly/infirm judged against their capacity, not a flat bar. Verified: 72yo not flagged, haven cook not flagged.

**4. Haven contributions count.** Cook (800), tend (600), teach (500), mend (400) kcal-equiv credits via `delegateTasks`, competence-weighted, in the ledger and exile logic.

**5. Party mentorship.** Party members learn player-known plants (70%/day), gain XP in weighted lane; every 10 XP → +0.05 production bonus (cap 0.5). Mentored death → village trust −8 + grief.

**6. Knowledge spread (tweak B).** Fireside gate 0.35 → 0.75 (3+ at haven). Villagers learn from their own daily work (0.06 × skill/day). Autonomous foragers learn and seed sharedKnowledge.

**7. Legibility.** Haven panel "Who's pulling weight" with effort bands (💪/👍/😟/⚠️) from `v.lastContrib`.

## Design decisions (mine, Steve can overrule)

1. **Stranger penalty is shallow (0.8→1.0, 7d), not harsh (0.45→1.0, 14d).** First attempt used the harsh curve — it doubled pantry drain and killed villages faster (median 7 vs 9.5). The harsh version double-counted "unknown land" (already in knowledge factor). Stress is real but a farmer's hands still work.
2. **Base 1500, not 1200.** Tweak C requires competent people to net HIGHER than the old mean. Farmer day 1: 1500×1.5×0.8=1800 (feeds self). Farmer day 30, 8 plants: 1500×1.5×1.8=4050 (surplus). Programmer day 1: 720. The variance tells the story.
3. **Expectations use MEAN grit.** Judging capacity, not luck. A bad grit roll doesn't make you a freeloader.
4. **Trust-gated sharing retained (0.2 at low trust).** Strangers hoard — that's the social reality. It means the village can't coordinate without trust, which is a finding, not a bug.

## Proof results

`scripts/test-villager-grit-20261009.js`: **22/22 × 3 seeds** (20261009, 7, 424242)
- Farmer out-produces programmer at day 1
- Day 30 > day 3 (stranger ramp); 8 plants ≈ 1.8× (knowledge ramp)
- Grit drives day-to-day variance; anxious wider than steady
- Exile fires on sustained NPC freeloading (warned → voted → exiled)
- Bad week does NOT trigger exile
- 72yo at capacity NOT flagged; haven cook NOT flagged
- Mentorship: learns plants + XP; mentored death → trust hit
- Player freeloading reaches moot vote

Regressions: test-break-food 116/116, bear-rework ALL GREEN, disease-pools 66/66, monster-vectors 43/43. Ontology: 50/50 validated.

## Sim results (12 seeds)

**Random rosters (mvc):** median 12 days (baseline 9.5), range 8–17, 0/12 win year.
**Competent rosters (mvc, ≥4 food-skilled + healer):** median 15 days, range 11–21, 0/12 win year.
**Zero control:** 10–16 days (player idle ≈ player foraging — food isn't the bottleneck).
**Mentor mode:** mentee learns 9–17 plants vs control 8–10; gains 5–8 XP vs 0. Both survive (died to monsters, not hunger).

**Knowledge spread:** avg plants/villager 1.7 → 3.8 in 5 days; sharedKnowledge 0 → 5. Tweak B works.

**Roster variance:** Competent rosters survive ~25% longer (15 vs 12 median). The correlation is real but modest — because...

## THE FINDING (for Steve, not a bug)

**Zero starvation deaths across all 36 sim runs. Every death was 'killed' — monsters.**

The food model works. Villagers don't starve. The village gets eaten.

Competent rosters + knowledge spreading + 15 days = food self-sufficiency is within reach (production ramps to 2700+/person at kf 1.8). But monsters kill 2–8 villagers per run starting day 9. The idle village (no player fighting) cannot survive the monster pressure regardless of food.

This means:
- The villager-grit food rework **achieves its goal**: food is identity-driven, varied, knowledge-gated, and sufficient.
- "Can the village win the year?" is now a **monster-defense question**, not a food question.
- The exile system fired 0 times in sims — not because it's broken (proof test verifies it), but because per-person expectations mean almost everyone meets their bar. No false positives.

## Files changed

- `src/js/game.js`: grit model, exile, mentorship, knowledge spread, haven roles, legibility data
- `src/js/betrayal.js`: removeVillager mentored-death hook
- `src/js/membership.js`: foodSupports uses expected-daily
- `src/js/app.js`: Haven "Who's pulling weight" panel
- `scripts/test-villager-grit-20261009.js`: 22 proofs
- `scripts/sim-idle-village-20261009.js`: mentor mode, COMPETENT flag
