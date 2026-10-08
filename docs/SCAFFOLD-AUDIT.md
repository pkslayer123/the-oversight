# Scaffold Audit — The Oversight

**Date:** 2026-10-07
**Directive:** Steve — "What else needs to be scaffolded or otherwise organized better? Audit this codebase deeply. Think about scalability and verification at every step."
**Method:** Read-only audit against HEAD (not the stale worktree). Builds on `docs/CODEBASE-AUDIT-2026-10-06.md` — does not repeat it, focuses on what's new since then and the scaffolding angle.

---

## Headline

Yesterday's audit identified the God files and scattered systems. Since then, we've added **four major new systems** (alienPlayers, gear slots, endgame builds, regions in progress) — each built in a hurry, each with different structural quality. The regions.json scaffold is the right pattern. **Five more systems need the same treatment.** The knowledge gate is still scattered. Scripts are still flat (679 files). Schemas are still stale (629 errors).

The through-line: **every new system we ship without a scaffold becomes tomorrow's tech debt.** The regions pattern (clean schema + helper functions + documentation) should be the template for all future systems.

---

## 1. Systems That Need Scaffolding (regions.json pattern)

Ranked by impact. Each needs: clean JSON schema + helper functions + documentation, like regions.json is getting.

### 1.1 Monster behavior tables (HIGHEST IMPACT)

**Problem:** `tbMonsterTurn` is 2,228 lines of per-species if/else dispatch with 120 `this.xxxIs(m)` predicate checks. Adding a monster means editing this function. Yesterday's audit flagged it; it's grown since.

**Scaffold:**
- `src/data/monsterBehaviors.json` — per-monster behavior table: `{id, aggroRange, preferredRange, tactics: [...], specialMoves: [...], retreatThreshold, packBehavior}`
- Helper: `monsterBehavior(mid)` returns the table; `tbMonsterTurn` becomes a generic interpreter
- Each monster's 2-3 signature moves defined in data, not code
- **Effort:** Large (2-3 worker days). Must be done species-by-species with regression tests. Do NOT attempt without per-species test coverage first.

**Why now:** We're at 28 monsters. At 50+, this function becomes unmaintainable. The wave-2 audit already found bugs hiding in the dispatch (Inspiration ember timing).

### 1.2 Knowledge gating (HIGH IMPACT, correctness issue)

**Problem:** Still no unified gate. `plantKnown`, `monsterKnown`, `encAnimalKnown` are separate APIs with different semantics. Yesterday's audit found a live leak (inventory showing kcal for unknown plants). The Columbus pawpaw fix added yet another path (direct codex seeding).

**Scaffold:**
- `Game.canShow(domain, id, aspect)` — one gate, aspect ∈ {name, stats, kcal, edibility, mechanics, lore}
- One codex entry shape: `{level, learnedDay, via, ...extras}`
- Migrate domain by domain: plants → animals → monsters → items → aliens
- **Effort:** Medium (1-2 worker days). Start with plants (most surfaces), prove it, then migrate.

**Why now:** Every new system adds another knowledge check. Alien players added `apKnowsAlien`. Regions will add region familiarity. Without unification, we'll have 10 competing "known" functions by Christmas.

### 1.3 Ability definitions (MEDIUM-HIGH IMPACT)

**Problem:** 69 abilities in `abilities.json`, but activation logic is scattered across game.js. The endgame builds doc references ability IDs — if an ID changes or an ability is dead content, nothing catches it.

**Scaffold:**
- Each ability in JSON gets: `{id, name, description, activation: {type, ...params}, synergies: [...], tier}`
- Validator checks: every ability ID referenced in docs/synergies/code exists in abilities.json
- Dead ability detector: abilities never granted by any path get flagged
- **Effort:** Medium (1 worker day for validator + schema; activation migration is larger)

**Why now:** The summary notes "several abilities are dead content" and "trial/discovery/mentorship acquisition runtime remains incomplete." We can't fix what we can't see.

### 1.4 Drama effect registry (MEDIUM IMPACT)

**Problem:** Drama has 60+ methods, each a bespoke visual. Adding a new effect means writing a new method. There's no registry of what effects exist, what triggers them, or whether they're tested.

**Scaffold:**
- `src/data/dramaEffects.json` — `{id, trigger, visual: {type, ...params}, audio, gating}`
- Generic renderer interprets the table
- Test: every drama effect has a test (currently 46 methods tested via stub DOM, but no registry)
- **Effort:** Medium (1-2 worker days). The effects are already well-structured; this is mostly extraction.

**Why now:** Drama is one of our best systems. At 100+ effects, the bespoke-method pattern breaks down.

### 1.5 Alien player personas (MEDIUM IMPACT, new system)

**Problem:** Just built (8 personas). Currently well-structured in `alienPlayers.json`, but the combat lines, wealth tiers, progression rates, and tech are all in one file with no schema. The next worker to add a 9th persona won't know the required fields.

**Scaffold:**
- JSON schema for personas: required fields (name, disposition, wealth, combatLines[15], abilityKit, alienTech, voice)
- Validator: every persona has all required fields, combat lines are unique, ability IDs exist
- Documentation: "how to add a new alien player"
- **Effort:** Small (half worker day). The data is already clean; just add the schema + docs.

**Why now:** This is the regions.json lesson applied proactively. Do it now while the system is fresh, not after 20 personas.

---

## 2. Organization Problems (still open from yesterday)

### 2.1 God files (unchanged)
- `game.js`: 24,786 lines (was 19,939 yesterday — **grew 4,847 lines in one day**)
- `app.js`: 13,322 lines (was 11,123 — **grew 2,199 lines**)
- At this growth rate, game.js hits 50,000 lines by November.

**Recommendation:** Don't try to split them in one go. Instead, enforce: **all new systems go in new files** (like alienPlayers.js, like engine/). The God files should shrink by extraction, not grow by addition. The regions worker is doing this right (new regions.json, not more game.js).

### 2.2 Scripts directory (679 files, flat)
Yesterday's audit recommended buckets (`regression/`, `playtests/`, `tooling/`, `debug/`, `archive/`). Still not done. At 679 files, finding anything is archaeology.

**Recommendation:** This is low-risk, high-value. A worker can do it in a day. The naming convention (`test-*`, `play-*`) already exists — just add directories.

### 2.3 Stale ontology headers
`alienPlayers.js` in the worktree still has the old "piloted monsters" ontology header, but HEAD has the new "human impersonators" version. The worktree is stale (known hazard). But this reveals a systemic issue: **ontology headers are comments, not contracts.** Nothing verifies they're current.

**Recommendation:** Add a CI check: ontology `provides` list must match actual method definitions. The yesterday audit flagged this ("proves presence, not truth"). Still open.

---

## 3. Scalability Concerns

### 3.1 Content scale limits

| System | Current | Breaks at | Why |
|--------|---------|-----------|-----|
| Monsters | 28 | ~50 | tbMonsterTurn dispatch becomes unmaintainable |
| Items | 213 | ~500 | No item category index; every lookup is linear scan |
| Abilities | 69 | ~100 | No ability registry; dead abilities invisible |
| Plants | 38 | ~100 | Knowledge system has no bulk operations |
| NPCs | ~12/village | ~30/village | Everyone Acts is O(n) per turn; fine now, watch at scale |
| Regions | 0 (8 planned) | ~20 | Need region index, not linear search |
| Alien personas | 8 | ~20 | Need schema (see 1.5) |

### 3.2 Save file size
`engine/state.js` has versioned save/load with migration (good). But:
- No compression. A late-game save with full worldgen + 12 NPCs + codex could be 2-5MB.
- localStorage limit is ~5MB on iOS Safari. We're probably fine now, but monitor.
- **Recommendation:** Add save size logging (warn at 3MB). Don't optimize prematurely.

### 3.3 The `Math.random()` problem
442 uses in game.js. Worldgen uses seeded PRNG (good). Gameplay doesn't. This means:
- Playtests aren't reproducible (workers use seed overrides, but it's fragile)
- Bug reports can't be replayed
- Balance testing is statistical, not deterministic

**Recommendation:** Add a game-seeded RNG for gameplay (not just worldgen). Keep Math.random() for cosmetic things. This is a medium refactor with high verification value.

### 3.4 O(n) hotspots (checked, mostly fine)
- `villagerTurn`: O(n) per player action, n=village size. Fine at 12, fine at 30.
- `npcNodeTravel`: O(n) per day-part. Fine.
- Item lookups: `.find(x => x.id ===)` — 103 sites in game.js. At 500 items, this is 500 comparisons per lookup. **Add an index** (`itemById` map) — trivial fix, do it now.
- Monster lookups: same pattern. Same fix.

---

## 4. Verification Gaps

### 4.1 Systems with no tests
- **Gear slots** (just built): has test-gear-slots (49/49). Good.
- **Endgame builds**: has test-endgame-builds (403/403) + test-endgame-builds2 (480/480). Good.
- **Regions**: not yet built. Must have test from day one.
- **Knowledge gating**: no unified test (can't — no unified gate).
- **Save/load migration**: `_migrateV0toV1` exists but no test. **This is scary** — if migration breaks, players lose saves.

### 4.2 Flaky tests
The summary notes: "a node proof script asserting aggregate villager/monster behavior over unseeded Math.random is flaky by construction." The fix (seeded PRNG in tests) is documented in AGENTS.md. **Audit finding:** not all test scripts follow this. Spot-check new tests for unseeded randomness.

### 4.3 "Trust me" areas
- **Balance**: docs/BALANCING.md exists, but no automated balance checks. The 48 endgame items were "scaled against existing tier-4 ceiling" by a worker's judgment. No test verifies this.
- **Mobile performance**: The dpad fix had a test, but there's no perf regression suite. If someone adds a heavy animation, nothing catches it.
- **PWA update flow**: Manually verified each release. No automated check that version.json + sw.js + build.js are in sync (though bump-sw-version.sh does this).

### 4.4 What can't be verified without playing
- **Fun**. The playtest loop addresses this (9 archetypes, rotating). This is working well — keep it.
- **Visual quality**. Drama effects are tested via stub DOM (methods don't throw), but "does it look good?" requires eyes. The render-grid.js tool helps. Consider screenshot regression tests for key visuals.
- **Narrative coherence**. 105 alien combat lines, 30 endgame build descriptions — no test checks if they're good, only if they exist. This is fine; Steve is the gate.

---

## 5. Prioritized Action List

### Do now (this week)
1. **Item/monster lookup indexes** — trivial, prevents future perf cliff. Half-day.
2. **Scripts directory organization** — low risk, high value. One worker day.
3. **Alien persona schema** — proactive, half-day. Do it while the system is fresh.
4. **Save migration test** — scary gap. Half-day.

### Do soon (next 2 weeks)
5. **Knowledge gate unification** — correctness issue, growing. 1-2 worker days.
6. **Ability registry + dead detector** — visibility into dead content. 1 worker day.
7. **Seeded gameplay RNG** — verification value. Medium refactor.

### Do when ready (needs tests first)
8. **Monster behavior tables** — biggest win, highest risk. Species-by-species with tests.
9. **Drama effect registry** — good system, needs scaling path.
10. **God file extraction** — ongoing, not one big bang. New code goes in new files.

### Don't do
- **Rewrite**: The architecture is sound. This is organization, not replacement.
- **Premature optimization**: Save compression, render pipeline — monitor, don't fix yet.
- **Big-bang splits**: Extract incrementally. The mixin pattern works.

---

## 6. The Meta-Lesson

Every system we've built in the last 48 hours (alienPlayers, gear slots, endgame builds, regions) was built fast by workers under time pressure. The ones with scaffolds (regions.json pattern) will be maintainable. The ones without will become tomorrow's audit findings.

**New rule proposal for Steve:** Every new system ships with:
1. JSON schema (if it has data)
2. Helper functions (not inline logic)
3. Documentation (how to extend it)
4. A test (proof it works)
5. An ontology header (that's actually current)

If a worker can't produce all five, the system isn't done.
