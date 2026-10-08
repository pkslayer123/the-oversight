# Break-it: persistence (save/load) — 2026-10-08

Hostile-player attack on the save/load system (`src/js/engine/state.js`, `Game.save/load/syncRun/wipe` in game.js, title-screen + autosave + debug panel in app.js, `playerDeath` in ledger.js).
Proof test: `scripts/test-break-persistence-20261008.js` (BEFORE/AFTER via `BEFORE=1`, seeded, deterministic) — 25 checks, all green both modes.

## Kills (all fixed, all proven)

### 1. Village-lost save leak → resurrection exploit (EXPLOIT/HONESTY) — HIGH
`playerDeath`'s no-candidates branch (ledger.js) set `over=true`/`villageLost` and returned
**without wiping**. The last autosave survived; Continue resurrected a dead run (`load()`
resets `over=false`). Every other death path wipes ("dead runs are wiped" — state.js).
**Fix:** `this.wipe()` in the no-candidates branch. Proof 1b/1c: BEFORE save survives and
`load()` returns `over=false`; AFTER zero keys, zero index entries.

### 2. Mid-combat save minted a new fight id → read_stance once-per-fight bypass (EXPLOIT)
`syncRun` never persisted `tbfight.id`; `load()` generated a fresh id. `read_stance` keys its
once-per-fight gate on `scholar.stanceReadFight === tbfight.id` → use Read Stance, save,
reload, read again. Infinite intel. **Fix:** persist `id` in tbSave (syncRun + load).
Proof 2b: BEFORE id differs post-load; AFTER `f_test123` preserved and matches
`stanceReadFight`.

### 3. Mid-combat save dropped volatile fighter state (EXPLOIT/HONESTY)
The old whitelist (hp/pos/acted…) silently discarded stuns, beam cooldowns/phases,
telegraphs, threat queues, hesitate/blind, and terraformed ground. Reload = free monster-
debuff cleanse; "Continue restores faithfully" was false. **Fix:** snapshot every own
fighter field except `mdef` (reattached by `monsterId`) and functions, through a JSON
round-trip with a minimal-whitelist fallback so an unserializable field can never nuke
the whole save. `terraform` persisted at fight level. Proof 2c–2h.

### 4. Save index never named the bearer (HONESTY) + mantle-transfer staleness (HONESTY)
Two stacked bugs: (a) the index entry read `state.villagerId`, which **nothing ever sets**
→ `villagerName` was ALWAYS null; the title screen showed "Expedition · unknown" for
every save. (b) `scholar.villagerId` was never synced on mantle transfer. **Fix:**
`playerDeath` syncs `s.villagerId = newId`; `Game.save()` syncs `state.villagerId` to the
live bearer and pins a stable `state.runKey` (computed from the legacy key *before* the
sync, so pre-existing mid-run saves don't fork into a duplicate keyed save); index uses
the live bearer. Proof 4a–4d: AFTER single entry, "Tove Lind", key unchanged across saves.
**Sibling sweep — same bug class:** six more `scholar.villagerId` readers all wanted the
live bearer and were attributing to a corpse: pantry takes/gives tracking (game.js
8509/8549), theft-confrontation once-per-day (8388), ration-share trust scaling (16818),
ledger vids (storage.js 237), roster self-exclusion (storage.js 273), Light Fingers
caught-stealing trust hit (abilityActions.js 1123). All fixed by the one sync.

### 5. Save index location was always the start location (HONESTY)
`startLocationName` never updated after day 1. **Fix:** `Game.saveLocationLabel()` —
Haven by name when on the haven tile, "the wild" when departed. Proof 4e/4f.

### 6. Corrupt save: silent dead Continue + immortal list entry (SOFTLOCK/HONESTY)
`listSaves` only pruned orphans, never unparseable data; `load()` → null → Continue did
nothing, no message, entry lingered forever. **Fix:** `listSaves` validates parse +
`SAVE_VERSION`, prunes the entry; corrupt data deleted, version-mismatched data KEPT
(hidden — a future migrator could recover it); Continue toasts on failed load (app.js).
Proof 6a–6d.

### 7. Dead code: `S.state.wipeAll` had zero callers
Wired to the debug panel: `Game.wipeAllSaves()` + two-tap "Wipe ALL saves" button (app.js).
Ontology header unchanged (still accurate). Proof 7a/7b.

### 8. Shared-ref duplication: `run.telemetry` was a second copy of `state.telemetry`
JSON round-trip forked them; the run copy was never read back. Removed from `syncRun`
(`state.telemetry` persists directly, capped at 300).

## Held (attacked, resisted — documented, not failures)
- **Contest countdowns**: day-driven (`firesDay` in `state.pendingContest`), survive save/load.
- **Map/Set/class instances**: none in persisted state — factories return plain literals;
  the `Set`s in game.js are Game-level gen-uniqueness trackers, never saved.
- **Save during modal/countdown/teleport**: transients are DOM-only; `load()` re-renders via
  `expeditionScreen()`; day-driven systems (`pendingContest`, encounter flags) resume.
- **hasSave / deleteSave / listSaves**: all wired; "Expedition deleted" really deletes
  (key + index entry). Edge noted: two tabs open — tab A's 30s autosave resurrects a
  save deleted in tab B ("Expedition deleted" then it's back). Single-tab flow can't hit
  it (title screen only shows when not mid-expedition); documented, not fixed (would need
  cross-tab tombstones — over-engineering for the observed flow).
- **SAVE_KEY legacy fallback** in `load()`/`wipe()`: unreachable via any caller
  (`Game.load` is only ever called with a key), kept as harmless defensive code.
- **saveKey collisions**: `vid + startedAt(ms)`; villager ids are unique per run — not a
  real vector.
- **Autosave with no active expedition** (`Game.state` null): `syncRun` throws, caught by
  every autosave caller's try/catch — silent by design, no crash.
- **`save()` no-op when `this.over`**: intentional; death paths wipe instead.

## Files changed
- `src/js/engine/state.js` — stable `runKey`, corrupt/version-mismatch pruning, honest index (live bearer/location)
- `src/js/game.js` — fight-fidelity `syncRun`/`load` (id, terraform, full fighter snapshots), `save()` live-id + location sync, `saveLocationLabel()`, `wipeAllSaves()`
- `src/js/ledger.js` — village-lost `wipe()`, mantle `s.villagerId` sync
- `src/js/app.js` — Continue failure toast, debug-panel "Wipe ALL saves"
- `scripts/test-break-persistence-20261008.js` — 25-check BEFORE/AFTER proof (new)

## Verification
- `node scripts/test-break-persistence-20261008.js` → ALL CHECKS PASSED (AFTER)
- `BEFORE=1 node scripts/test-break-persistence-20261008.js` → all breaks demonstrated, ALL CHECKS PASSED
- `node scripts/validate-ontology.js` → 47/47 systems validated, release permitted
- `node --check` clean on all four edited files
- `scripts/test-highbeam-persistence.js` fails identically on pristine HEAD (pre-existing combat-sim failure, unrelated); `scripts/test-save-integrity-20261007.js` is unrunnable by design (requires a missing `/tmp/game-fix.js` one-off extract)
