# Break-it: persistence (save/load) — SECOND PASS, deeper — 2026-10-08

Hostile-player second pass on the save/load system. The first pass
(`break-persistence.md`, commit b32aabb) landed 8 kills; this run re-verified
all 8 still hold (25/25 checks green), then attacked the remainder of the
surface: win paths, death-path throw races, decay/spoilage clocks, social-state
fidelity, double-load duplication, day-part/position honesty, silent-save-failure.

Proof test: `scripts/test-break-persistence2-20261008.js` (BEFORE/AFTER via
`BEFORE=1`, seeded, deterministic) — 28 checks, all green both modes.

## Kills (all fixed, all proven)

### W1. WIN-PATH STALE SAVE -> ending-shopping exploit (EXPLOIT/HONESTY) — HIGH
`chooseTableOption` (ledger.js) set `over=true; won=true` and then called
`this.save()` — which **no-ops when over**. The pre-choice save written by
`tableScene()` (with `scholar.tableChoices` intact) survived the finale.
Title screen -> Continue -> `load()` resets `over=false` -> the final live
choice was offered again and could be re-picked. Every ending, tried in turn,
keep the best — the "final live choice" was save-scummable.
**Fix:** `this.wipe()` instead of the no-op `save()` — a finished run doesn't
continue (same rule as game.js:4735). Proof W1c/W1d: BEFORE save survives and
`load()` resurrects `tableChoices`; AFTER zero keys, zero index entries.

### W2. DEATH-PATH THROW RACE (EXPLOIT) — same bug class as first-pass kill #1
Four callers wrapped `playerDeath` in `try/catch (e) { this.over = true; }`
with **no wipe**: expedition (game.js:4720), night (game.js:18670), combat
(game.js:26584), arena (ledger.js:1001). A throwing `playerDeath` left the last
autosave behind; Continue resurrected the dead run (`load()` resets
`over=false`). Proven with a sabotaged `Game.say` forcing the throw.
**Fix:** `this.wipe()` in each catch — the invariant is now structural: every
`over=true` transition wipes the save in the same tick. Proof W2a (static:
all four catch texts) + W2c (behavioral: throw + over-without-wipe resurrects
in BEFORE; throw + over-with-wipe leaves nothing in AFTER).

### W3. SIBLING SWEEP — contest death wrote a split-brain `state.over` (SOFTLOCK/HONESTY)
contests.js:2930's fallback was `catch (e) { this.state.scholar.health = 0;
this.state.over = true; }` — no wipe, AND it wrote `state.over`, a flag that
**nothing else in the codebase ever sets** (the game reads `Game.over`;
`state.over` is read in 8 UI places but never written in any normal path).
A throwing `playerDeath('contest')` produced a zombie: `Game.over=false` (so
autosave kept persisting the "dead" state) while `state.over=true` persisted
across load, with the UI and engine disagreeing about whether the run was over.
**Fix:** same pattern as the other four sites — `this.over = true` + `wipe()`;
the phantom `state.over` write is gone. Proof W2a contests.js both modes.

## Held (attacked, resisted — documented, not failures)

- **B. Decay/spoilage clocks**: corpse `dayDied`, inventory `spoilDay`,
  `prepStash` `spoilDay` are all absolute-day-keyed (`scholar.day`-relative).
  Save at day 5, load: `dayDied`/`spoilDay` unchanged, corpse stage identical
  (B1–B4). No clock rewinds; no free fresh meat.
- **F. Social state fidelity**: `village.trust`, `village.gossip`,
  `village.talkRequests`, `village.justice` (stage/exile timers) all live on
  `village` (persisted). Save, mutate trust down to 3, load: trust restored to
  77 — **no forgive-by-reload exploit** (F1–F4).
- **E. Double-load duplication**: loading the same save twice appends nothing
  — villager re-injection is idempotent (gen_ filtered before re-adding),
  `recomputeActiveSynergies` replaces, log/map replaced not appended (E1–E4).
- **C/G. Day-part + position**: `dayPart` (mid-afternoon survives, no free
  dawn), `map.px/py` + `scholar.mx/my` all restored faithfully (C1, G1, G2).
- **A. Silent save failure**: deep scan of a maximally-populated live state
  (corpses, gossip, trust, talk requests, pendingContest, camp, wanderer,
  pendingEncounter, active tbfight, log) found **zero** unserializable values —
  no functions, no BigInt, no circular refs. Every runtime assignment into
  persisted state is a plain literal (quests, pendingContest, camp all built
  as literals); the only `JSON.stringify`-to-storage paths are the save path
  itself plus string-literal flags. The silent no-op hazard is real *if* junk
  ever lands in state (A3 demonstrates with a poisoned state: save swallows,
  stored save goes stale) but **no natural vector exists** — held, not fixed.
  A blanket drop-unserializables replacer would mask future bugs; fail-loudly
  beats silent data loss, and the highest-risk section (fighter snapshots) is
  already hardened with the minimal-whitelist fallback from pass 1.
- **D. Mid-conversation save**: no Game-level dialogue/conversation state
  exists to persist (dialogue is DOM/app-level); nothing dangles across
  load. Mid-tent/contest-teleport transients were covered in pass 1.
- **H. Dead code re-check**: `Game.hasSave`/`deleteSave`/`listSaves`/
  `wipeAllSaves`/`S.state.saveKey` all have live callers (app.js/game.js).
  `SAVE_VERSION` has never been bumped (still 1) — no migrator exists yet,
  and none is owed until a version change; version-mismatched data is kept
  hidden per pass 1. The legacy `SAVE_KEY` fallback remains unreachable via
  any caller, kept as defensive code (unchanged from pass 1).

## Files changed
- `src/js/ledger.js` — win path wipes (`chooseTableOption`); arena death catch wipes
- `src/js/game.js` — expedition/night/combat death catches wipe (invariant comment)
- `src/js/contests.js` — contest death catch: `Game.over` + wipe, split-brain `state.over` write removed
- `scripts/test-break-persistence2-20261008.js` — 28-check BEFORE/AFTER proof (new)

## Verification
- `node scripts/test-break-persistence2-20261008.js` → ALL CHECKS PASSED (AFTER, 28/28)
- `BEFORE=1 node scripts/test-break-persistence2-20261008.js` → breaks demonstrated, ALL CHECKS PASSED (28/28)
- `node scripts/test-break-persistence-20261008.js` → ALL CHECKS PASSED (no regression; 8 kills hold)
- `node scripts/validate-ontology.js` → 50/50 systems validated, release permitted
- `node --check` clean on game.js, ledger.js, contests.js, new test
