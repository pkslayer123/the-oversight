# Parity Audit A — evidence (2026-10-10)

Worker A: villager-player parity audit. Steve's law: "They are all other players too."

## Method
- Node harness (scripts/sim-harness.js), FULL src/js list, Math.random seeded pre-eval.
- Parallel: 4 node processes x seed partitions (scripts/sweep-parity.js), 20 seeds x 2
  policies (competent, socialite) x 200-day cap.
- Instrumentation (scripts/parity-instr.js): ~35 Game-method wraps tagging
  villager vs player events.
- HARNESS CORRECTION (found during this audit): the shared runDays drives time via
  raw tickAction(128), which fires npcBatchTurn (ambient movement) but NOT villagerTurn
  (the needs-driven individual-action driver: hunger-foraging, fear, rest, social).
  Live play routes every player action through doAction -> villagerTurn. Without the
  correction, npcTakeAction fired ~1x/30 days in sims (all prior sweeps measured
  villagers standing still). The chunk runner now calls ensureVillagerPositions() +
  villagerTurn() after each tickAction batch (chunk-local; shared sim-harness untouched).

## Parity matrix
(see scripts/sweep-parity-results.json + scripts/analyze-parity.js output)

## Fixes landed

### FIX 1 — Villager abilities actually fire (2026-10-10)
**Gap:** `npcGrantAbility` granted ~400 abilities across 40 runs but `npcHasAbility`
was only ever read for phoenix_clause burn eligibility — every other ability sat
inert. Measured: player ability uses 2440–2470 vs villager **0** across 40 runs.

**Fix (src/js/fieldFights.js):** `fieldFight` now reads the villager's kit via
`npcHasAbility` and applies it blow-by-blow, mirroring the player's mechanics:
- patient_aim (round-1 aim → next strike ×2.5), haymaker (every 3rd round ×2,
  monster +2 that round), ambush (free opening strike on contact),
  war_cry (hopeless rally: monster loses next attack, flee line −0.15),
  scream_cheese (once/fight stun when hurting), unbreakable (once/fight: first
  hit after being hurt reduced 60% — same number as the player's brace),
  dead_aim (×2 vs lead <25%), blood_trail (+2 vs lead <50%),
  trade_of_blows (×1.5 after taking >20 last round), stalk (+4 round-1),
  game_sense/tracker/echo_location (awareness evade bonuses).
All draws use `lroll`/`RR` — the contest engine's seeded path stays deterministic.

**Fix (src/js/game.js):** non-combat abilities now fire:
- purify/iron_stomach halve sicken chance in `villagerFoodPoisoning`
  (0.70 → 0.28 measured).
- triage gives medics 2-patient reach in `villagerCareTick` (was 1); care also
  spreads across distinct patients instead of piling on the first sick.
- Tactical combat: villager allies brace (unbreakable, once/fight 60% reduction
  in `tbDamage`) and haymaker (every 3rd strike ×2 in `tbVillagerTurn`).

**Proof:** `scripts/test-parity-abilities.js` — 15 checks, ALL GREEN.
`STRIP=1` mode (abilities granted but forcibly unread, simulating pre-fix)
fails 9 checks → the test is sensitive to the fix.
Kit vs baseline: 26.1 vs 8.8 dmg/fight; unbreakable 29.0 → 20.4 taken;
purify 0.70 → 0.28 sicken; triage 1 → 2 patients.

### FIX 2 — Hunt duty through shared chance machinery (2026-10-10)
**Gap:** the hunt duty branch of `resolveOneAssignment` was a flat `R(400,900)`
kcal roll — no prey, no depletion, no gear, no skill. The player's hunt picks a
real animal, rolls difficulty, depletes wildlife.

**Fix (src/js/game.js):** new `villagerHuntResolve(vid, eff)` — picks a REAL
animal from a REAL nearby tile's wildlife (hunted-out ground honestly yields
nothing; wildlife decrements), chance = difficulty base + hunter occupation
+0.2 + villager's own equipped weapon bonus + tracker +0.3 if held +
game_sense ×1.4 (same modifiers as the player's `huntAnimal`), kcal = animal's
real calories × butcher fraction (0.78 with field_dressing, else 0.6). Injury
roll unchanged. Proof test asserts a result object + honest narration
(1080 kcal raccoon kill observed; miss path narrates "it winds them").

## Deliberate differences (not fixes)
- **Abstract `villagerDayProduction` background economy:** the duty path (hunt,
  now real-depletion) is the real economy; the background abstract sim is a
  perf/design tradeoff owned by other workers. Changing it is survival-balance
  territory, not parity.
- **System quests player-only:** the System's quests are the player's lane
  (the scholar is the System's interlocutor); villagers have objectives/errands.
- **Synergies player-only:** synergy discovery requires per-fighter practice
  logs; villagers don't log ability uses. Granting synergies without the
  practice mechanic would be a flat table (violates the real-mechanic law).
  The ability-use foundation (FIX 1) is the prerequisite; full villager
  synergy discovery is follow-up.
- **Crafting/trapping player-only:** Steve — "NOT a crafting game." Crafting is
  the player's survival-supply lane; villagers have mend/cook/tend duties.
- **Feasts player-hosted / feast surge player-only:** pantry spending is the
  player's leadership call; villagers contribute.
- **Aid-cry 4-tier chain player-initiated:** villagers have in-fight party-up
  shouts (fieldFight); the full crisis chain is the player's tool.
- **Ratings summons player-only:** explicit canon (`summons_castability`).
- **Tactical-combat active abilities (patient_aim, war_cry, etc.) for villager
  allies:** unbreakable + haymaker are in (passive/reactive); full ability AI
  for allies needs turn-planning the current AI doesn't do. Follow-up.
- **Contests:** villagers participate as co-stars through the REAL engine
  (`contestResolveVillager` verified live) and watch-mode. The first pick
  prefers the player ("the System's surest star") — deliberate.
- **Phoenix:** bidirectional by code (villager trigger exists); 0 hits in sims
  (rare by design).

## Remaining gaps
- Villager tactical-combat active ability AI (patient_aim, war_cry, scream_cheese
  as planned actions) — unbreakable/haymaker done, the rest needs AI turn planning.
- Villager synergy discovery (needs per-villager ability-use logging first).
- Late-game parity (waves 3–5, switchboard, national scale): all 40 runs died
  ~day 30 (median 29–30); zero coverage. Open question for Steve/coordinator.
- SIBLING REGRESSION (not mine): `test-break-contests-r13-20261010.js` now fails
  2 checks — commit 9da7b2de (utilization audit r5) changed the ratings decay
  from daily (-1/day, which r13's proof asserts) to weekly drift. I never touched
  contests.js. Flagged for the contest worker/coordinator.
