# Completion gaps — 2026-10-10

Coordinator-owned log of game-completion gaps and their fixes. Append per
gap; never overwrite.

---

## Gap 1: integration 80 is the Arc IV wall (worker: gap-integration)

**Measurement.** 6/60 competent sim runs reached integration 80 (stage 3);
Arc IV requires stage 3 (`checkArc`: `stage >= 3`).

**Where the road died.** Full `integrate()` source audit (all call sites in
`src/js/game.js` + `completeTrial` in `progression.js`):

| Source | Amount | Availability |
|---|---|---|
| `identifyPlant` (discovery) | +3/+2 | finite, 45 plants — the monoculture |
| Books (`readBook`) | +5 | finite, rare |
| `evFanPackage` (d14), `evQuietWoods` (d16) | +2 | one-shot each |
| `evCookingLesson` (d18) | +2/+5 | one-shot |
| `evTrialOffer` (d24) System challenge | +2..5 | one-shot |
| Village quests (`checkQuest`) | +5/+2 | **dead at integration ≥ 40** (`maybeOfferQuest` early-returns) |
| `system_task` (d12 event) | — | **dead from birth**: set `{id:'system_task'}` with no `type`; `checkQuest`'s dispatch ignored it, so it could never complete |
| Audience trials (`completeTrial`) | +15 | recurring (25%/day at ≥40, +7d cd) — the only recurring source |
| Monster naming | 0 | no integration hook at all |
| Ratings/viewership | 0 | no integration hook at all |

The 40→80 stretch had exactly one recurring source (audience trials,
task-gated on 3-day windows) plus the finite discovery pool. The comment
"System quests come at integration 40+ — the overlay takes over" promised a
40+ quest line that was never built. Rewards don't decay — they just run out.

**Fix (landed).** All deed-reactive, declining returns, never hard caps:

1. **System quest line revived** (`game.js`): `evSystemTask` now offers a real
   `system_teach` quest; new `offerSystemQuest`/`checkSystemQuest`/
   `systemQuestReward`; recurring via `progDaily` (~1/6 days, only when a
   known plant sits below L3); completes the moment a NEW plant hits L3;
   rewards 8, 6, 4, then 2 (floor). Ghost-quest guard skips giver `'system'`.
   Legacy `{id:'system_task'}` saves migrate instead of stranding.
2. **Monster naming grants integration** (`game.js` `monsterNamingCheck`):
   one-shot per monster, 6, 5, 4, 3, then 2 — the village agreed a name, the
   System learned what to call it.
3. **Ratings milestones grant integration** (`contests.js` `showCastPull`):
   new all-time viewership high by +5 → 6, 5, 4, 3, then 2. Viewership moves
   on notable deeds (`recordMoment`), so this is deed-reactive.
4. **Audience-trial pool fix** (`progression.js` `offerAudienceTrial`): the
   'identify 3 plants to L3' task is dropped from the offer pool when fewer
   than 3 plants remain below L3 (was a dead offer late-game).

**Boundary note (worker C owns breadth):** monster naming also feeds codex
breadth via existing naming flow — untouched; the integration grant is a
separate one-shot keyed on `villageName`, no double-counting with breadth.

**Proof.** `scripts/test-integration-road-20261010.js`: 69 checks × 3 seeds
(207/207 green). Covers: quest offer/completion/declining schedule
(8,6,4,2,2), offer refusals (active quest / nothing teachable / pre-arrival),
ghost-guard sparing, legacy migration, `checkQuest(kind)` dispatch, naming
grants (6..2) + one-shot, milestone grants (6..2) + ratchet, trial-pool
adaptation, and an end-to-end road: 10 discoveries + 4 system quests + 3
namings + 2 milestones = 5 → 81, stage 3, 6 slots, slot-moment-80 fired —
without the exhaustive ~25-plant monoculture. On HEAD the same script fails
19 checks and the road section cannot run (`offerSystemQuest` undefined).

**Regressions.** `test-pacing-20261010.js` 39/39, `test-break-shows-20261009.js`
64/64, `test-quest-knowledge-gate-20261007.js` 6/6, `test-event-engine-20261007.js`
56/2 (identical on HEAD — pre-existing fixture drift). `test-monster-naming.js`
crashes identically on HEAD (pre-existing `seTickFisher` harness issue).
60-day competent sweep runs crash-free through the new daily path.
No jest `__tests__` tree exists in this repo snapshot — node proof scripts
are the test suites here.

**Follow-ups (not this gap).** The competent *policy* still doesn't chase
trials/quests (pacing-build.md follow-up; policy work is separate). Organic
Arc IV completion still needs a channeling policy + long survival.

---

## Gap 3: discovery breadth monoculture (worker: gap-breadth, commit 0654f6ef)

### Diagnosis

`codexBreadth()` (src/js/progression.js) was a plant monoculture by construction:

- **Monster codex contributed ZERO, forever.** The breadth branch counted
  `(e.level||0) >= 1`, but monster codex entries carry `stage`
  ('encountered'/'observed'/'slain'), never `level` — the whole 30-species
  monster codex was a dead branch. Confirmed in 5 competent-policy sims:
  `monsters: 0` in every run's breadth breakdown.
- **Animal knowledge (48 species) was never counted.** Hunting lore,
  butchering depth, book-taught animal entries — invisible to breadth.
- **Techniques were never counted.** Binary earned knowledge, ignored.
- Measured 200-day-horizon competent runs (5 seeds): breadth 20–30 at death,
  plants 15–21 of it (60–80%). Plants plateau ~day 20 once nearby flora is
  identified; nothing else grows. This starved Arc IV's 25-breadth gate and
  the discovery-driven integration sources.
- **Ruin books ~0.1/run:** 10% roll only after a ruin's loot was exhausted;
  one guaranteed ruin per map. Canon says books are treasure troves
  unlocking big codex chunks (MEMORY.md) — they never fed breadth.
- **Explorer plant lessons were an infinite talk faucet:** `agencyTeachPlant`
  re-taught on `k.plants >= 3` with no consumption, so asking repeatedly
  printed knowledge. Monster field lessons were flavor text only.

### Fix

1. `codexBreadth()`: monsters count at stage 'observed'/'slain'
   ('encountered' sightings still don't — break-it knowledge 2026-10-08
   holds: a glimpse can't force arc triggers). Animals count at L1+,
   techniques count, recipes explicitly L1+ (was all-keys; no writer ever
   stores L0, so behavior is unchanged). Skills stay L2+.
2. Ruin books: one 30% roll on the FIRST search of each ruin (was 10% after
   loot exhausted). Treasure, not routine — one roll per ruin, declining
   by construction. Books remain one-shot (consumed on read).
3. Explorer lessons: plant lessons now SPEND one earned teachable entry
   each (entries accrue 1 per 3 expedition plant discoveries); monster
   lessons teach one fought species → 'observed' (never downgrades 'slain',
   evades stay flavor). Each species teachable once — declining by
   construction.
4. Overlap note for worker A (gap-integration): `readBook` already calls
   `this.integrate(5, 'book')` — unchanged; breadth and integration both
   move on book reads, which is intended (the deed is real).

### Proof

`scripts/test-breadth-20261010.js`: 47 checks × 3 seeds (20261010, 7, 99),
all green. Covers: per-domain counting incl. honesty cases (sighting/L0/
blind-bite add nothing), ruin book rate ~30% + one-roll-per-ruin,
teachable-entry consumption, monster lesson stage/no-downgrade,
Arc II deed counts new cross-domain breadth, corpses attunement + board
consumers unaffected, and a scripted diverse-deeds run where plants drop
below 60% of breadth and fighter/hunter deeds keep it growing.

Regressions: `test-pacing-20261010.js` 39/39, `test-break-knowledge-20261010.js`
28/28, `test-break-knowledge-r2-20261010.js` 40/40, `knowledge-playtest.js`
4/4. Ontology 52/52 validated.

### Follow-ups

- Sim policies don't fight monsters or ask explorers for lessons (policy
  blindness): the completion sweep won't show monster/lesson breadth until
  a policy chases them. The mechanics are proven; the sweep needs a
  bolder policy.
- Arc IV's breadth>=25 gate is now reachable through fighting/hunting/
  reading lanes, not just foraging — intended. If it fires too early once
  policies improve, retune the number, not the domains.

