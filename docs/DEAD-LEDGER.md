# The Oversight — Dead Ledger

Steve 2026-10-09: "Can we see what isn't being used?" This is the standing
answer. Every dead-code / dead-data / write-only finding goes here with its
disposition. Break-it and flesh-out runs: **update this file when you find or
resolve one** — it is the ledger, not a one-off report.

Dispositions: **FIXED** (wired up / repaired), **REMOVED** (deleted),
**FLAGGED** (known dead, awaiting a call), **DESIGN** (needs Steve's design
call before anything happens).

## Entries

### npcGrantAbility write-only → FIXED (wiring in progress)
- **What:** `npcGrantAbility` (src/js/game.js) had zero callers — villagers
  could never earn abilities, so the entire villager-bearer phoenix half
  (~200 lines: phoenixVillagerTrigger, give/pull-away) was unreachable in
  real play; only test scripts populated it.
- **Found:** break-it godhood kickoff, 2026-10-09.
- **Disposition:** FIXED — Steve's directive: villagers earn abilities via XP
  leveling from many sources, deterministic grants, never RNG. Wiring worker
  fe715feb (villager-xp) in progress as of 2026-10-09.

### joinVillage / leaveVillage dead → REMOVED
- **What:** old `joinVillage`/`leaveVillage` in game.js had zero live callers
  (courtship retargeted to `joinVillageReal`).
- **Found:** shows+regional audit, 2026-10-09.
- **Disposition:** REMOVED — gap sweep, commit e64c8161.

### alienPlayers.json rivalry/voice fields never read → FLAGGED
- **What:** dead data — fields exist in the JSON, no code reads them.
- **Found:** break-it alien r5, 2026-10-09.
- **Disposition:** FLAGGED — small cleanup, no design question.

### combatStripHTML, panelCombat dead → FLAGGED
- **What:** defined, never called (party panel audit).
- **Found:** party panel 5461e5d6, 2026-10-09.
- **Disposition:** FLAGGED — remove in a cleanup pass.

### observe('caught_you_stealing') dead no-op → FLAGGED
- **What:** the action is absent from the observation table, so the call does
  nothing.
- **Found:** seen-crime 28b39511, 2026-10-09.
- **Disposition:** FLAGGED — remove or wire.

### villageLives() dead filter → FIXED
- **What:** the autonomous-villager filter matched nobody after the unified
  person system (2026-10-06) — the "1–2 villagers forage per day" system
  never ran.
- **Found:** idle-village sim, 2026-10-09.
- **Disposition:** FIXED — filter retargeted to unassigned roster members
  via getPerson().

### exile-arc state machine deliberately removed → DOCUMENTED
- **What:** `exileArcState`, `roadDaily`, `forkVillage`, `seekReadmission`,
  `genSettler`, `foodSupportsSpeech`, `pantryAccess` — test expected them,
  they don't exist.
- **Found:** gap sweep, 2026-10-09 (test rot investigation).
- **Disposition:** DOCUMENTED — Steve deliberately removed them in ab148efc;
  not dead code, a design removal. Test rewritten against current systems.

## How to add an entry
What (one line), where found (run + date), disposition + commit. If it needs
Steve, mark DESIGN and say what the call is. If it's a cleanup, mark FLAGGED.

## Coverage triage 2026-10-09 (gap-triage worker) — verified reachable, not dead
These appeared on coverage NEVER lists but root-caused to survival/sample-size,
not dead code. Documented so future runs don't re-litigate. Disposition for
all: **VERIFIED** (mechanism proven working; unreached in sims).

- **Show scheduler** — contestTick is ratings-driven (reactive), pickShow
  uniform from pool, fireShow works (debuts fired). Sims die ~day 13 (unlock
  day 14) and generate zero notability → only debuts. SIM/SURVIVAL ARTIFACT.
- **Wave-2 monsters** — all 15 exist with biomes; unlockedWave() verified
  reaching 2 (day 8 + 4 wave-1 kills); monsterWavePool + both spawn paths
  correct. Villages die before the window. SURVIVAL ARTIFACT.
- **Alien diseases (9)** — vectors are wave-2 monster fights (giant mosquito,
  alien tick) + monster meat, per docs/DISEASES.md. Rare by design; unreached
  because wave 2 unreached. BY-DESIGN RARE + SURVIVAL ARTIFACT.
- **Mundane avoidable diseases** (gutrot, trichinosis, trembles, disease) —
  trigger paths verified in code (contractDisease vectors, corruption.js
  trembles). Competent policy avoids them (boils water, cooks, no human
  meat). Avoidance is the point. SIM ARTIFACT (competent play) + BY-DESIGN.
- **Alien loot** — rollAlienLoot/alienLootGrant verified working; drop chance
  intentionally LOW per code ("HIGH RISK / HIGH REWARD"). 18 items exist.
  Zero drops in sims = few kills, not a broken table. SURVIVAL ARTIFACT.
- **Never-learned skills (12)** — all have reachable paths (backgrounds,
  books, carexplore, conversations). Sims don't roll those backgrounds or
  read books. SIM ARTIFACT.
- **Never-fought wave-1s (12)** — valid data, no broken conditions; both
  spawn paths biome-agnostic. 0.3 combats/run = sample size. SIM ARTIFACT.

## Sim bugs fixed 2026-10-09 (gap-triage worker)
Not game bugs — harness/policy fixes. Proof: re-run before→after below.
- **forageTrip blockage blindness** — picked nearest stocked tile without
  checking travelBlockage; travelTo returned a blockage object and the
  "trip" foraged at Haven for 0 kcal. Fixed: skip blocked tiles, swim
  (force) if nothing else reachable, verify arrival. (scripts/policies/idle.js)
- **Fight-start assessment** — policy fought everything, retreated only
  below 35% HP. Now flees outmatched fights at start (2.5× HP, wave≥2 while
  hurt, or starting below 50%). (scripts/policies/competent.js)
- **competentEat** — was pantry index 0 blindly; now picks safe food (cooked
  first, never human meat/trembles, never raw meat). (scripts/policies/competent.js)
- **lootCorpses** — policy never looted; now strips corpses post-fight
  (396 loot_taken events in 30-run proof). (scripts/policies/competent.js)
- **Learning push** — 3× conversations/day until 5 plants known (knowledge
  is the food economy). (scripts/policies/competent.js)
- **Wave unlock telemetry** — runDays now records maxWaveUnlocked +
  waveKills so "not reached" says whether the wave unlocked.
  (scripts/sim-harness.js)
