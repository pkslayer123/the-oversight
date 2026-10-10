# Completion gaps — Gap 3: discovery breadth monoculture (2026-10-10)

Worker: gap-breadth. Commit: TBD (pending coordinator landing).

## Diagnosis

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

## Fix (all deed-reactive, declining returns — no calendar scripts)

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

## Proof

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

## Follow-ups (not mine)

- Sim policies don't fight monsters or ask explorers for lessons (policy
  blindness): the completion sweep won't show monster/lesson breadth until
  a policy chases them. The mechanics are proven; the sweep needs a
  bolder policy.
- Arc IV's breadth>=25 gate is now reachable through fighting/hunting/
  reading lanes, not just foraging — intended. If it fires too early once
  policies improve, retune the number, not the domains.
