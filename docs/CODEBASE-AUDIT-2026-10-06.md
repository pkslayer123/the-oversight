# Codebase Audit — The Oversight

**Date:** 2026-10-06
**Directive:** Steve — "Pursue excellent data structure if so you stop losing track of everything. Whole codebase audit."
**Method:** Five read-only audit workers (game.js, app.js, data layer, scripts, cross-cutting systems). No source files modified. All findings verified with grep/Python against the actual tree.

---

## Headline

The codebase has **two God files** (game.js 19,939 lines, app.js 11,123 lines = ~55% of all game code), **no unified knowledge gate**, **no audio event registry**, **a release-gate validator that proves presence instead of truth**, and **375 scripts** with no organization. The good news: the decomposition seams are clean, the mixin pattern for splitting is already proven, and state-mutation discipline in the view layer is actually good. This is a restructure problem, not a rewrite problem.

**The through-line** (from the cross-cutting audit): every cross-cutting concern is currently implemented as *a convention + scattered call sites + a comment claiming it's enforced*. The fix for "losing track of everything" is to turn each convention into **one data structure with one enforcement point** — one gate, one registry, one schema, one topic table.

---

## 1. Complete inventory

### 1.1 The two God files

**`src/js/game.js`** — 19,939 lines, 626 methods, one `Game` object literal. Contains: character generation, newGame bootstrap, social actions, village management + multi-village sim, worldgen, travel, grid interaction, inventory, pathfinding, camp systems, hunting, NPC core, social sim, knowledge systems, time engine, tiles, monster codex, encounter framework, monsterTurn, exploration events, relics/abilities, doAction dispatcher, eating, day cycle, meta-progression, startCombat, the entire combat turn framework, tbMonsterTurn (2,227 lines — 11% of the file), combat end, plant codex, text utils.

**`src/js/app.js`** — 11,123 lines. Two things glued together: a ~4,900-line UI layer (screens, grid, dialogs, chat, sheets) and a **~6,185-line Web Audio synthesizer library (`CombatAudio`)** that is >55% of the file and has zero coupling to the rest of it. State-mutation discipline is good — almost everything dispatches through `Game.*` APIs.

### 1.2 What's dead (verified: zero call sites repo-wide)

**game.js:**
- 573 lines of shadowed conversation engine (lines 1546–2118: `talkTo`, `convoTurn`, `startConvo`, etc.) — `conversation.js` loads after and replaces all 16 via `Object.assign`. Zero risk to delete.
- `villageAction` (3679) — defined, wrapped by betrayal.js, never invoked; the wrapper is unreachable.
- `randomLandingZone`, `npcHomeRegion`, `setNet`, `plantGenesis`, `unequip`, `movePath`, `fillWaterFromVillage`, `takeFromPantry` (superseded by `takeFromPantryBulk`), `monsterThreatSense`, `monsterHpSense`, `visualStage`, `tileInfo`, `noteCodex`, `drinkTreated`/`drinkWild` (self-marked "Legacy. Use drinkWater()"), `allModifiers`, `earnedEnding`, `readiness`, `threatRating`, `monsterWaveAvailable`, `cellWarned`, `clearWarnCells`, `traumaLevel` (reader never used), `encNoticeLine`/`encPainLine`/`encProximityLine`, `speciesRecognition`, `combatRound`.
- Dead flags: `Game.won` (set false, never true — win path unwired), `TIME.NPC_BATCH_MOVES` (self-marked deprecated, never read), `Game.ap` (vestigial from pre-"no action-point bookkeeping" design).

**app.js:** `clearSheets`, `renderPersonInline`, `remoteAssignSheet`, `panelCombat` (superseded by `combatActionsHTML`), `combatStripHTML`, `statsHTML`.

**data:** `villagers.json` is `[]` (3 bytes) — not data, an empty-array initializer that code fills at runtime. `characterGen.json → misunderstandTemplates` (5 templates, 0 references). Dead schemas in `schemas.json`: `gameEvent`, `systemMessage`, `shopItem`, `trial` (files don't exist).

**scripts (7 debris):** `test-deer-audio.js` (superseded, crashes), `fast-screenshot.js` (headless Chromium hangs in this VM), `balance-check.sh` (stale targets, broken pipe), `expand-foreign-speech.js` (one-shot migration, done), `test-wave2-escalation-results.json` + 2 `play-detective-*-output.txt` (output artifacts written into `scripts/` — belong in `evidence/`).

### 1.3 What's duplicated

- **25 `xxxIs` predicates** (game.js 15848–15999) — identical shape, one per monster id. Generate from a list.
- **Fighter-construction literal ×2** (game.js 15178–15193, 15208–15223) → extract `spawnFighter()`.
- **`FORAGEABLE` set literal ×3** → one shared const.
- **103 inline `.find(x => x.id ===` data lookups** across game.js → accessor helpers (`plantDef(pid)` etc.).
- **Two beam-lane rasterizers** — hand-rolled `tbBeamCells` vs `engine/combat.js:patternCells`. Route through the engine.
- **Origin strings 100% duplicated** — `originPicker.json`'s 36 labels ≡ `characterGen.json`'s `sampleOrigins` (verified by set comparison).
- **Names ~85% overlap** between `characterGen.firstNames/lastNames` and `nameCultures.json`'s 8,576-name corpus.
- **Language registry duplicated** — `characterGen.languages` (26 defs) vs `foreignSpeech.json` top-level keys (same 26 ids).
- **Duplicate balance maps** — `contests.js` `dieBase`/`winBase` vs `dieOdds`, identical tables.
- **app.js**: `dirArrow` map ×3, villager lookup ×9, corpse action block ×2, `on` wirer ×2, "back to person" reset object ×10.
- **scripts**: contest cluster (17 scripts, 4 whole-system sweeps), wave-2 (9, two parallel naming schemes), conversation (17), social (28), audio (11, three sequential deepening passes), animals (12), brawler (7), drifter (8).

### 1.4 What's thin

- **`biomes.json`** — 73 lines, **1 biome**. `Game.biome()` hardcodes `'se_woodlands'` — adding a second biome requires a code change, defeating the data file's purpose.
- **`originPicker.json`** — 6 regions / 36 labels, single consumer (app.js:434).
- **`hierarchy.js`** — 577 lines, 9 functions. Verify the hierarchy system is real, not a stub wearing a system's name.
- **`journal.js`** — 264 lines. **`corpses.js`** — 503 lines. **`codex-people.js`** — 467 lines. Small may be fine; flagged for verification, not condemned.
- **Wave-1 monsters** — 7 of 13 lack `aggroAudio` (`gallowdeer`, `mirrormoth`, `lockpick_raccoon`, `hummice`, `nightlight_catfish`, `glasswing`, `sunbasker`); all 11 wave-2 monsters have it. Wave 1 is what every new player meets first.

### 1.5 What's in the wrong place

- **`CombatAudio`** (~6,185 lines) in app.js → should be `ui/audio.js`. Already a closed IIFE, zero coupling. Biggest single win.
- **573 dead conversation lines** in game.js → delete (conversation.js owns it).
- **`tbMonsterTurn`** (2,227 lines) — per-species AI dispatch with 90 `this.xxxIs(m)` predicate checks. Behavior tables keyed by species id belong in monsters.json; the dispatch becomes data-driven.
- **Contest content in code** — `contests.js:181+` `contestPool()` (~28 contest defs), `LINES` pools, and **32 bespoke `_contestX` functions** with inline narrative + damage numbers. Largest content-in-code block in the codebase. → `contests.json` + one generic beat renderer.
- **Dialogue pools in code** — `conversation.js` `REACTIVE_DEFS`, `GQ_ACK`, `GQ_TAKES`, `knowByOcc`, `idleByTemp`, `variants`, player response pools. Same *kind* of content as `characterGen.json`'s `talkTemplates` — never moved.
- **Name/gender/culture data in code** — `NAME_GENDER` (237 entries), `ROMANCE`/`SLAVIC`/`ARABIC` groups, `MARITIME` occupation list (one id already drifted from `characterGen.occupations`) → data records with fields.
- **Balance literals in code** — `RICH` (tile richness), `TRUE_READS`/`MISREADS`/`CHANCE`/`SUCCESS`/`FAIL` (scavenging tables), `SCAVENGED` (ruin loot), `ARRIVAL`/`WALL_EXAMINE` (flavor), `TILE_GLYPH`/`TILE_NAME` (→ cell_defs.json), `FAVORED` (node→plant pairs).
- **`villagers.json`** — inverted: a data file functioning as a runtime variable initializer. → `this.data.villagers = []` in code.
- **One real view-layer leak** — app.js:641 `showBlockage` swim handler writes `Game.state.scholar.kcal` directly with a magic number. → `Game.swimAcross(x, y)` API.
- **Render-time side effects** — `expeditionScreen` calls `Game.ensureVillagerPositions()`, `Game.clearDialGlitch()`. Rendering should not mutate.
- **Monster semantics in the renderer** — `tbAllTelegraphCells` (app.js 10103–10254) routes per-monster-id telegraphs with knowledge-gating rules. The *routing table* belongs in data; the renderer should be dumb.

### 1.6 Cross-cutting systems: scattered, not centralized

- **Knowledge gating** — NO single API. Five per-domain APIs (`plantKnown`, `monsterKnown`/`monsterDisplayName`, `monsterFoodSafe`, `encAnimalKnown`, `treeLevel`) + inline ternaries copy-pasted per surface + **two competing definitions of "known"** (entry-exists vs level≥1). **Live leak**: inventory sheet renders `(i.kcalEach||0)*i.units kcal` ungated (app.js:1189) — unknown plants show real kcal. `monsterKnown` has 2 external call sites; everyone calls `monsterDisplayName` directly.
- **Audio** — no event→synth registry. ~132 scattered string literals + 27 data refs. `audioEvent` is a **silent no-op on missing synths** (game.js:14682–14686) — typos fail invisibly. 5 fired-but-missing hooks in betrayal.js (`joinVillage`, `claimSite`, `chopWood`, `buildShelter`, `foundHaven`). Extended Warranty missing `warrantyRing`/`warrantyPitch`/`warrantyDrop`. Two aggro dispatch patterns disagree (silent vs deer-bellow fallback — the fallback ships wrong-species sounds, e.g. "toad played deer bellow").
- **Ontology** — the validator proves *presence*, not truth. `storage.js` header is factually wrong (claims save/load; the file is tools/stashes/caches) and passes because the regex matches call sites, not definitions. `consumes` is unvalidated despite docs claiming it is. `src/js/engine/` (6 files, including canonical `state.js`) has no headers and is never scanned.
- **Conversation** — topics are *methods* (`t2gen_you`, `t2fol_fears`…), not data; the `t2defs()` registry is a hand-maintained parallel list that can drift. Voice dimensions split across code + JSON with no dimension list. `vpOf()` identity lookup chains three sources.
- **Save/load** — centralized in `engine/state.js` (good), but: **no migration path** (`load()` returns null on version mismatch — version has been 1 forever), `syncRun()` whitelist silently drops new `Game` fields, factories don't construct all runtime keys (`codex.animalEncounters` etc. appear out of thin air; ~60 defensive `|| {}` sites).

---

## 2. Target structure — "excellent data structure" as a concrete spec

### 2.1 Module map

**`src/js/` — game logic** (each file owns its domain; all mixed into `Game` via the proven `Object.assign(Game, …)` pattern — zero call-site changes):

| File | Owns |
|---|---|
| `game.js` (shell) | Module shell, TIME config, `init()`, save/load wrappers, `say`/`status` utils, export |
| `chargen.js` | Name/culture/language/origin, genCharacter, roster, keepsakes, conflicts |
| `newgame.js` | `newGame` bootstrap |
| `nonverbal.js` | Gesture/read/draw |
| `social-actions.js` | Craft, traps, books, gifting, theft, intimidation, deals, askAbout, repair, quests |
| `village-mgmt.js` | Delegation, assignments, depletion, knowledge flow, pantry, depart/return |
| `village-sim.js` | genVillages, catch-up sim, simVillageDay |
| `worldgen.js` | genMap, genDetail, species assignment |
| `travel.js` | travelTo, node exits, buildings, microMove |
| `grid-interact.js` | _cellInteract, animals, animalTurn |
| `inventory.js` | Equip/use/consume, pack & pantry economy |
| `pathfind.js` | canSee, findPath, path-walk |
| `camp.js` | Cooking, water, fire, fishing |
| `hunting.js` | Weapons, ammo, huntAnimal |
| `npc-core.js` | Positioning, node travel, identity/descriptors/rep |
| `social-sim.js` | Observe, gossip, rep, needs, moods, events, theorizing |
| `knowledge.js` | Knowledge transfer, jackpot, synergies, plant codex |
| `time.js` | tickAction, npcBatchTurn, sleep |
| `tiles.js` | cellActions, regrow/deplete |
| `monster-codex.js` | Monster knowledge/naming |
| `monster-ai.js` | Encounter framework + ALL per-species combat AI (split by species first) |
| `combat.js` | startCombat, turn framework, player actions, damage, terrain, tbEnd |
| `explore-events.js` | checkEncounter, System arrival, tile/node info |
| `abilities.js` | Relics, ability activation, timed events |
| `actions.js` | doAction dispatcher, eat/eatOne |
| `daycycle.js` | advancePart, villageEats, endDay |
| `meta.js` | Waves, leadership, endings |

**`src/js/ui/` — view layer** (new directory; app.js splits along existing section banners):

`audio.js` (CombatAudio) · `screens/title.js` · `screens/onboarding.js` · `screens/expedition.js` · `grid.js` · `bars.js` · `sheets.js` · `targeting.js` · `person.js` · `chat.js` · `cellpopup.js` · `movement.js` · `codex.js` · `debug.js` · `ending.js`

Cross-module UI state (`sheetQueue`, `targeting`, `inlineView`, `chatView`, `dangerCue`) formalized in one `ui/state.js`.

**`scripts/`** — by bucket: `regression/` (test-*) · `playtests/` (play-*, playtest-*) · `tooling/` (12 invoked files) · `debug/` (repro-*, probe-*) · `archive/` (debris + superseded sweeps). Shared `regression/_loader.js` builds the eval list from a manifest so refactors can't silently break scripts. Naming convention enforced: `{test,play,playtest,tool,debug}-<system>-<aspect>[-<YYYYMMDD>].js`. Scripts never write into `scripts/` (route to `evidence/<date>/`). Generated `scripts/INDEX.md` registry.

### 2.2 Data-vs-code rules

1. **Narrative content belongs in data** — writers and flesh-out workers shouldn't read engine code to add content. Contests, dialogue pools, knowledge lines → JSON. The *sequencing mechanic* stays in code; the *words and numbers* move to data.
2. **Any literal keyed by content-id belongs in data** — id-keyed code rots when content changes. The Highbeam rule: **no `mdef.id ===` string comparisons outside debug scenarios.** Per-monster special-casing becomes data fields (`audioTag`, `special`).
3. **Probability tables belong in data** — balance tuning is a data job. One home per table; the duplicate dies in the move.
4. **Registries have exactly one home** — two homes always diverge (MARITIME already has; the 36-label origin identity is the proof this rule is overdue).
5. **Enums used generically stay in data; mechanical constants stay in code** — `DIRS`, `BLOCKS`, `TILE_GLYPH` are code; `unlock.type`, modifier targets are data (consumed via generic dispatch).
6. **Every shipped data file gets a schema and a gate, or it gets deleted.** 7 files currently unvalidated. Wire `validate-data.js` into `bump-sw-version.sh` (docs already promise this).
7. **Data files must not contain dev notes or reference nonexistent hooks.** Any `comment` naming a code hook gets a validator check that the hook exists.
8. **Runtime state must not live in `src/data/`.** A reader should trust that everything under `src/data/` is authorable content.

### 2.3 One-gate unifications (the "stop losing track" core)

- **Knowledge**: `Game.canShow(domain, id, aspect)` with aspect ∈ {name, stats, kcal, edibility, mechanics}. One codex entry shape `{stage|level, learnedDay, via, …extras}` for all domains. Retire the five APIs and the inline ternaries. Fix the entry-exists-vs-level ambiguity once.
- **Audio**: `AUDIO_EVENTS` table as data — every fired event resolves to a registered synth (test-enforced), every registered synth is reachable, data contracts documented. `audioEvent` warns in dev on unregistered names. One aggro dispatch helper with one default policy.
- **State**: `engine/state.js` owns `schemaVersion` + `migrate()` chain; factories construct *every* runtime key; replace the `syncRun()` whitelist with serialization of a declared state object.
- **Conversation**: topics declared in one registry `{id, gates, generator, followUps, labels}`; voice dimensions declared as a dimension list `[{key, source, combiner}]` — adding a dimension is one entry, not surgery in three places.
- **Ontology**: validator checks `consumes` paths resolve; flags public functions missing from `provides` (definitions, not call sites); scans `engine/`; requires `provides` to match definitions.

---

## 3. Phased restructure plan (ordered by risk)

### Phase 0 — Guardrails (before anything moves)
- Fix the ontology validator's `provides` regex (definitions, not call sites); add `engine/` to the scan; validate `consumes`. A gate that can't catch a mislabeled file is theater — don't restructure under a blind gate.
- Snapshot: full test suite green baseline. Every later phase diffs against it.

### Phase 1 — Zero-risk deletions (no behavior change possible)
1. Delete game.js 1546–2118 (573 shadowed conversation lines).
2. Delete dead functions in game.js §1.2 and app.js §1.2 (each verified zero call sites).
3. Move 7 debris scripts to `scripts/archive/`; move 3 output artifacts to `evidence/`.
4. Remove dead schemas from schemas.json; delete dead `misunderstandTemplates` key.
5. Delete or stub out `locations.json`/`originPicker.json` decision: they're real content now — keep, but document.

### Phase 2 — Mechanical extractions (zero call-site changes via `Object.assign` mixin)
1. **`ui/audio.js`** — move CombatAudio. Closed IIFE, zero coupling. Biggest single win; do first.
2. **game.js → 24 modules** per §2.1 table, in dependency order: leaf systems first (`pathfind`, `tiles`, `camp`, `hunting`), then social (`social-actions`, `social-sim`, `knowledge`), then the big ones (`combat.js`, `monster-ai.js`).
3. **app.js → `ui/`** per §2.1, formalizing cross-module UI state into `ui/state.js`.
4. **`scripts/` reorganization** per §2.1 + shared `_loader.js` + naming convention + INDEX.md.
5. Fix the ~8 stale-loader scripts (add `membership.js`/`food.js` to eval lists — proven fixable).

### Phase 3 — Data moves (content out of code)
1. `contests.json` + generic beat renderer replacing 32 `_contestX` functions. (Largest content block; also unblocks contest flesh-out work.)
2. `NAME_GENDER`, `MARITIME`, culture groups, `RICH`, scavenging tables, `SCAVENGED`, `ARRIVAL`, `WALL_EXAMINE`, `FAVORED`, `TILE_GLYPH`/`TILE_NAME` → appropriate data files.
3. Origin strings → one home. Language registry → one home.
4. `villagers.json` → code-initialized array.
5. Wave-1 audio pass: 7 missing `aggroAudio` + Extended Warranty hooks + 5 betrayal.js dead hooks wired.

### Phase 4 — Structural unifications (highest risk; needs tests first)
1. **One knowledge gate** (`Game.canShow`) + one codex entry shape. Write the gate, migrate one domain (plants), prove it, then migrate the rest.
2. **Audio event registry** as data + dev-mode warnings + unified aggro dispatch.
3. **State migrations** — `schemaVersion` + `migrate()` + complete factories + kill the `syncRun()` whitelist.
4. **Conversation as data** — topic registry, voice dimension list.
5. **`tbMonsterTurn` species split** — only after per-species regression tests exist. This is the 2,227-line heart; it moves last.

### Phase 5 — Verification
- Ontology validator hardened (Phase 0) re-run; `validate-data.js` wired into `bump-sw-version.sh`; all 7 unvalidated data files get schemas.
- Full suite green; playtest passes per archetype; live release with version verification.

---

## 4. What NOT to touch and why

- **`src/js/engine/`** (combat.js, forage.js, modifiers.js, state.js, day.js) — genuinely used pure helpers with real call sites (45 for combat.js). These are the *good* pattern; the restructure converges toward them, not away.
- **The `Object.assign(Game, …)` mixin pattern** — already proven by conversation.js/food.js. The split uses it; don't invent a new module system mid-restructure.
- **`tbMonsterTurn` internals** until Phase 4 — 2,227 lines of live combat AI with 90 dispatch sites. Splitting it without per-species tests is how regressions ship. Move the *file* first (Phase 2), split the *function* last (Phase 4).
- **Balance tunables** (`TIME` block, shelter heal values) — intentionally code-side per the `@ontology` "ALL TUNABLE IN ONE PLACE" rule. Not a bypass; leave alone.
- **`Game.biome()` hardcode** until `biomes.json` has a second biome — moving it now buys nothing.
- **Anything while workers are active** — the shared-tree hazard is live (multiple revert/sweep incidents this week). Restructure phases run only on a quiet tree, one phase per wave, with the tree verified coherent between phases.
- **`SAVE_VERSION`** until the migration chain exists — bumping it orphans every existing save with no recovery path.
- **The pull-based render pipeline** — no render loop exists; `expeditionScreen()` rebuilds the DOM per tap. Don't "optimize" this during the restructure; it's a separate project with mobile-perf implications.

---

## Appendix: audit worker notes

- game.js measured 19,939 lines at audit time (grew during the audit — siblings active). Line numbers in §1 cite the audited revision.
- app.js measured 11,123 lines at audit end (grew 10,896 → 11,123 mid-audit, all in CombatAudio region).
- scripts/ measured 375 files at audit end (grew 370 → 375 mid-audit). 269 regression / 84 proof / 3 debug / 12 tooling / 7 debris.
- Data worker corrected the brief: `locations.json` and `originPicker.json` are single-line JSON with real content (not 0 bytes); `validate-data.js` currently passes clean (the "485 errors" AGENTS.md note is stale).
- Cross-cutting worker's `validate-ontology.js` run rewrote `docs/ONTOLOGY.md`; restored via git checkout. Tree untouched.
- All five audits were read-only. No source files modified.
