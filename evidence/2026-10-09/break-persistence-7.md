# Break-it: persistence — 7th pass (2026-10-09)

Target 8 of the break-it loop. Canon note: no canon doc covers persistence/save-load
(docs/ARCHITECTURE.md §"Save format" is the closest authority — and it contained a
false claim, fixed this pass). Nothing invented; all fixes are mechanical.

Passes 1–6 had already hardened: tombstones vs two-tab death resurrection, stable
runKey, honest index, quarantine with random suffix, save-status returns, stale-version
surfacing, fight fidelity, phantom-fighter/pending-encounter guards, scholar/map guards,
villageLost reset, beam-cooldown/uprising persistence, JSON-native fidelity. This pass
attacked the remaining surface. **5 breaks, all fixed. 2 held.**

Proof: `scripts/test-break-persistence7-20261009.js` — 60/60 AFTER, 41/41 BEFORE
(breaks documented as red-behavior assertions). `BEFORE=1` supported via git HEAD.
Regressions: pass-6 suite green (one assertion updated — see T4 note), ontology
52/52, `docs/ONTOLOGY.md` regenerated.

## BREAKS (fixed)

### T1. wipeAll() never wrote tombstones — stale tab resurrected every wiped run (EXPLOIT, KILL)
The r5 "dead runs stay dead" rule was enforced only on the `wipe()` path. The debug
panel's "Wipe ALL saves" (`S.state.wipeAll`) removed every blob and the index but wrote
**zero tombstones** — a stale tab's 30s autosave then re-created every wiped run with
`save() === true`. Demonstrated: 2 runs saved, `wipeAll()`, stale-tab `save()` →
`true`, blob back on disk.
Fix: `wipeAll()` writes a tombstone per removed key (plus the legacy key when it
existed), reason `'wiped-all'`. After: stale-tab save → `'tombstoned'`, nothing written;
new runs save normally (new keys unaffected).

### T2. Cross-tab last-write-wins — stale tab silently destroyed newer progress (EXPLOIT, KILL)
Two tabs, same run, no sequence number anywhere. Tab 2 saved day 5; stale tab 1 saved
day 2 → `save() === true`, disk day now 2. Five days of progress destroyed with no
signal to either tab.
Fix: monotonic `state.saveSeq`, bumped on every successful save. `save()` reads the
disk blob's seq first; if `diskSeq > memSeq` the write is **refused** with a new
distinct status `'stale'` (never the quota-`false`, never silent). `Game.save()`
propagates it verbatim; the autosave toasts once, honestly: "Another tab saved this
expedition more recently — this tab paused saving so it would not overwrite that
progress. Close the other tab and reload here to keep playing." Sequential same-tab
saves unaffected (true/true). Residual: the read→write window is not atomic across
tabs (microsecond race); the realistic seconds-apart race is caught. Documented.

### T3. Version-bump bricks every save forever — migration was aspirational (SOFTLOCK, KILL)
ARCHITECTURE.md claimed "state.js migrates old versions forward." **No migration code
existed.** Demonstrated via harness bump of SAVE_VERSION 1→2: `load()` → null,
`listSaves()` → stale-only, title screen offered only "Delete it to clear the slot."
A version bump was a permanent, unrecoverable expedition wipe with no path back.
Fix: real `MIGRATIONS` registry (`{targetVersion: (state) => state}`, runner owns
version stamping, throwing migration = failed migration = refuse), `migrateSave()`,
`hasMigrationPath()` (dry-run, no mutation). Wired into `load()` (old versions upgrade
on load; no-path and future versions still refuse with null) and `save()` (old-version
in-memory state upgrades before writing, so blobs are always current). `listSaves()`
treats migratable versions as loadable (flagged `willMigrate`, title screen says
"from an older version — upgrades on load") instead of stale. Doc fixed to match
reality. Proven with a registered `MIGRATIONS[2]` in-harness: old save loads at
version 2, listed as loadable, future version 99 refuses, save() upgrades the blob.

### T4. Corrupt index orphaned every healthy save (SOFTLOCK, KILL)
The index was a single point of failure: one corrupt index blob → `listSaves()` → `[]`
(two healthy saves invisible). Worse, the next `save()` rebuilt the index with **only
its own entry** — the other runs' blobs stayed on disk but permanently unlisted.
Fix: the index is now treated as a cache, not truth. `listSaves()` scans localStorage
for save-shaped keys (`scattering-save-v1-*`; tombstones/quarantine keys don't match)
and adopts parseable current-version/migratable blobs missing from the index
(synthesized honest entries, flagged `adopted`); unparseable orphans are quarantined
(never destroyed); tombstoned keys are skipped (dead runs stay dead). A corrupt index
now heals on next listing. Regression note: pass-6's T5 asserted the orphan stayed
unlisted until the next *save*; with self-healing it lists on the next *listSaves* —
assertion updated with an r7 comment (the `save() === false` contract is unchanged).

### T5. Quarantine was a black hole (HONESTY, KILL)
A corrupt save vanished from the title screen with **no word to the player**, and
nothing could ever read quarantined data back — "preserved for recovery" was
unreachable (zero callers, zero UI).
Fix, two parts: (a) `quarantineKey()` now writes a one-shot notice key; the title
screen's `renderSaves()` consumes it and toasts once: "One saved expedition's data was
damaged and was set aside (not deleted)." (b) A restore manifest
(`scattering-save-quarantine-manifest`, pruned with the 3-per-key cap) backs new
`S.state.listQuarantines()` / `restoreQuarantine(qkey)`; the debug panel lists
snapshots with one-tap Restore — refuses to clobber a live save (`'occupied'`),
refuses unparseable snapshots (`'corrupt'`), clears the tombstone on a deliberate
restore so the revived run can save again (the next `listSaves()` re-adopts it into
the index).

### T8. load() of a tombstoned key still loaded (EXPLOIT, KILL — same class as T1)
`save()` refused tombstoned keys but `load()` didn't check: a blob surviving under a
tombstoned key (failed removeItem, cross-tab weirdness) loaded fine — a dead run
resurrected at the read path. Fix: `load()` returns null for tombstoned keys.

## HELD (attacked, resisted — documented, not failures)

### T6. Dead-code sweep — pipeline is fully wired (static)
Every `S.state` export has def + export + ≥1 caller (internal or external);
`Game.save/load/wipe/deleteSave/wipeAllSaves/hasSave/listSaves` all reachable
(`Game.wipe` is invoked as `this.wipe()` from death paths — the naive `Game.wipe`
grep misses it; the sweep counts both forms). `S.state.save` has exactly one live
caller (`Game.save`) — no backdoor writers. `quarantineKey` is called by `listSaves`;
`SAVE_VERSION`/`MIGRATIONS` are internal-but-live. Verdict: **solid** — the Alien
Players lesson (dead module) does not repeat here.

### T7. Double-load fork — held
Two `load()` calls on the same key return independent objects; mutating one does not
affect the other. Same-tab double-Continue just re-parses. No aliasing. Verdict:
**solid**.

## Sibling sweep (same bug classes in related systems)
- Other `JSON.parse(JSON.stringify(...))` round-trips that silently drop fields:
  exactly one, the tbfight fighter snapshot in `syncRun` — drops `mdef`/functions
  **by design**, documented, with a minimal-whitelist fallback. No silent-loss
  siblings found.
- Other "returns a status nobody checks": `Game.save()`'s status is now consumed by
  the autosave (`true`/`false`/`'tombstoned'`/`'stale'` all handled). The
  `visibilitychange`/`beforeunload`/`pagehide` handlers intentionally ignore the
  return (no UI possible during unload — noted, not a gap).
- Tombstone-cap residual: the 100-tombstone prune means a tab stale across 100+
  wipes could resurrect — accepted by design, documented in code.

## Pre-existing, out of scope
- `scripts/test-save-integrity-20261007.js` is broken independent of this pass: it
  hardcodes `/tmp/game-fix.js`, which doesn't exist (ENOENT). Pre-existing, not
  caused here, not fixed here (a coordinator call whether to repair or retire it).

## Files changed
- `src/js/engine/state.js` — all engine fixes + @ontology header
- `src/js/game.js` — `'stale'` propagation comment; `takeQuarantineNotice` /
  `listQuarantines` / `restoreQuarantine` passthroughs
- `src/js/app.js` — autosave `'stale'` toast; quarantine notice toast in
  `renderSaves()`; `willMigrate` line on save cards; debug-panel quarantine list +
  restore
- `docs/ARCHITECTURE.md` — save-format section now describes the real migration /
  quarantine behavior
- `docs/ONTOLOGY.md` — regenerated by the validator
- `scripts/test-break-persistence7-20261009.js` — new proof suite (60 checks)
- `scripts/test-break-persistence6-20261009.js` — one assertion updated for the r7
  self-healing behavior change (commented)

No `[needs-eyes]` — no feel/combat/UI changes a player would notice beyond honest
toasts; nothing for Steve to playtest on his phone this pass.
