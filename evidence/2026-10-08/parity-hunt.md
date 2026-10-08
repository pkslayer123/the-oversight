# Parity Hunt — 2026-10-08

Subagent 58c29303, worktree `~/workspace/worktrees/parity-hunt` (base `a022af0`).
Steve's brief: *"Look for ways to break villager-player parity. As much as possible, we don't treat the player character as special."*

## FIXED

### 1. FOOD — player double-dipped the pantry (game.js)
**The bug:** The player drew from the pantry TWICE per day. `villageMeal()` granted a personal trust-scaled meal (~2000 kcal at trust 50). Then `villageEats()` included the player in the collective roster loop, drawing a second net share AND crediting ~1156 kcal/day of phantom production (their real foraging goes to their pack, not the pot). Measured: player ~2786 kcal/day total draw vs a comparable villager ~956 (**2.9×**). Root cause: `villageMeal` (2026-10-03) predates the collective `villageEats` sim — a layering accident, not design.
**The fix:** The player is never in the collective pot. Their pantry draw is the trust-scaled `villageMeal`; their contributions are real donations. `v.lastPlayerMeal` is recorded so the honest burn clock (`burnHistory` → `pantryDaysEstimate`) still counts the player's meal.
**Proof:** `scripts/test-parity-food-20261008.js` — 2/2 PASS (failed before the fix: 0/1).
**Side find (separate bug, not fixed here):** `villageMeal` can't split indivisible units — a single 30000-kcal test item was fully consumed for a 2000-kcal need. Needs its own fix.

### 2. COMBAT — stat-blind monster encounters (game.js)
**The bug:** `resolveWildMonsterEncounter` used a flat table (35% kill / 25% drive off / 25% mauled / 15% die) regardless of villager stats or monster threat. A random villager had a 35% chance to kill a Highbeam Deer; a 100-HP veteran died 15% of the time to a hushwolf. The player fights the same beasts through the tactical engine where stats matter.
**The fix:** Outcomes weight by villager capability (health × bravery XP × range profile) vs monster threat (wave × HP × attack damage). Mauled damage scales with the monster's actual attack. Measured: strong villager vs weak monster → 75% kill / 4% death; weak villager vs strong monster → 9% kill / 45% death.
**Proof:** `scripts/test-parity-combat-20261008.js` — 4/4 PASS.
**Held (not changed):** full tactical sim per off-screen encounter remains abstracted — POV-necessary, not stat-blindness.

### 3. DISEASE — villagers immune by omission (game.js, villager-objectives.js)
**The bug:** Zero code paths could make a villager sick. The player faces food-borne disease, dirty water, wound infection, ticks; villagers faced none of it — same world, same vectors, no consequences.
**The fix:** `villageSicknessTick()` (daily, after `villageEats`): wound fever (health < 40), gut rot (drinking dirty water), tick fever (foragers). Sick villagers drain health daily, stay home (`objMaybeDepart` skips them), recover or die through the normal `hurtVillager` pipeline. Narrated via `say()`. Deliberately light — not the full status engine (POV-necessary abstraction).
**Proof:** `scripts/test-parity-disease-20261008.js` — 6/6 PASS.
**Follow-up (not done):** villager poison (player gets food-poisoned; villagers don't yet).

## HELD (documented, not changed)

- **DEATH:** shared `registerDeath`; the mantle passing to a trust-sorted successor is the intended design asymmetry (village-as-protagonist).
- **TRUST:** universal vid-agnostic `bumpTrust` → `trustGainProgressive` funnel — the player and villagers run through the same gate.
- **JUSTICE:** the player can be accused/tried/exiled; the richer `exilePlayer` phase is POV-necessary (you live it, you don't watch it).
- **CONTESTS:** villagers are taken with real stakes via `_contestResolveOthers`; the 90% player-first-pick in `fireContest` is load-bearing show-bias (it's a TV show about *you*).
- **KNOWLEDGE:** same background seeding by occupation + `villagerLearnsPlant` machinery; the Codex is the diegetic scholar role (intended).
- **MOVEMENT:** `villager-objectives.js` charges 1 energy/step like the player's 2 kcal/step; node teleport is POV-necessary (you can't render everyone's footsteps).
- **GOSSIP:** the awayNews narration is POV-necessary — the medium, not an advantage.
- **SLEEP/HEALING rates:** the player's sleep heal vs villager +2/day passive are on different resolution scales (tactical vs abstract); held by abstraction.

## Sibling sweeps
- Food: other roster loops (`rally` trust bump) already skip the player — clean.
- Combat: `villagerMonsterTick` delegates to the fixed `resolveWildMonsterEncounter` — no other flat tables.
- Disease: no other immunity-by-omission in the same class (poison noted as follow-up).

## Ontology
- Added `villageSicknessTick()` to game.js `@ontology` provides. No renames/removals. `validate-ontology.js` should pass at bump time.

## Files changed
- `src/js/game.js` — food double-dip fix, stat-weighted encounters, villageSicknessTick, ontology header
- `src/js/villager-objectives.js` — sick villagers don't depart
- `scripts/test-parity-food-20261008.js`, `scripts/test-parity-combat-20261008.js`, `scripts/test-parity-disease-20261008.js` — proofs
