# Break-it: persistence (save/load) — run 1, 2026-10-10

Target 8. No dedicated persistence canon doc exists (docs/STORAGE.md is about
item storage, not save/load) — worked from docs/CANON.md + code. Prior nine
break-it persistence passes (r1–r9, 2026-10-08 → 2026-10-10) already hardened
the save engine heavily (tombstones, cross-tab saveSeq, quarantine, index
self-healing, migrations, fight-fidelity). This run attacked the remaining
surface with a fresh deterministic node harness
(`scripts/test-persist-harness.js`: seeded Math.random BEFORE eval, full
src/js list in index.html order minus DOM-only modules, fake localStorage
with quota support).

## Attacks attempted (all green = held)

- **EXPLOIT / duplication on load** (`test-persist-probe1`): save → load →
  save → load; scholar vitals, inventory (exact-once, byte-identical),
  codex knowledge, runName, saveSeq, runKey stability. HELD.
- **EXPLOIT / death save-scum** (`test-persist-probe2`): village-lost death
  wipes + tombstones; `save()` after game-over no-ops (over guard); forced
  stale-tab save on a tombstoned key returns `'tombstoned'`; `load()` refuses;
  index hides the dead run. Mantle-pass death: new bearer, runKey stable,
  save/load clean, scholar identity = new bearer. HELD.
- **SOFTLOCK / corruption** (`test-persist-probe3`): truncated JSON blob →
  quarantined (not destroyed), one-shot title notice, `load()` null-no-throw,
  not offered as loadable. Corrupt index → self-heals by adopting orphaned
  blobs (flagged `adopted`). Versionless blob → quarantined as untrustworthy,
  never listed, `load()` refuses. Future-version blob → surfaced stale, kept,
  refused by `load()`. HELD except K1 below.
- **EXPLOIT / quota + cross-tab** (`test-persist-probe4`): quota-full save
  returns `false`, never throws, recovers after; cross-tab stale save returns
  `'stale'` and does NOT clobber newer disk data; post-reload save works. HELD.
- **EXPLOIT+HONESTY / mid-fight gates** (`test-persist-probe5`): shouts,
  beam cooldown, chorus-break, hum stacks, scorch flag, fight id all
  round-trip verbatim across two save/load cycles — no gate re-armed. HELD.
- **HONESTY / timers** (`test-persist-probe7`): disease duration, spoilage
  clocks, and displayed day do NOT advance on wall-clock time across the load
  boundary (expedition-clock canon). No double-tick, no phantom advance. HELD.
- **HONESTY / mid-modal autosave**: mid-contest reload resumes via the
  narration box rendering `state.activeContest` (phase-driven); ability/relic/
  table drafts re-queue from `scholar.abilityChoices` etc. via
  `processPendingSheets`; mid-conversation settled by load() (prior r9);
  pending encounters restored with phantom-monster guard. HELD except K2 below.
- **DEAD CODE**: every function in `src/js/engine/state.js`
  (quarantine/tombstone/migration/self-heal machinery) has live callers;
  every `Game.*` save wrapper (wipeAllSaves, deleteSave, quarantine notice/
  list/restore, hasSave, listSaves) is wired to UI. No dead save machinery —
  the Alien Players lesson does not repeat here.
- **Save size**: day-1 blob 69KB (1.3% of a 5MB quota); village rosterChars
  is the bulk (52KB). No quota pressure. (`test-persist-probe6`, report only.)

## Kills (2)

### K1. restoreQuarantine lied "restored" for never-loadable snapshots (HONESTY — medium)
`restoreQuarantine` only checked parseability. A snapshot that parses but can
never load (no `version`, or a version with no migration path — exactly what
the self-healing scan quarantines as "untrustworthy") returned `true`; the
debug panel said "restored" while Continue still couldn't load it, and the
next `listSaves()` silently re-quarantined it — burning one of the 3
per-key quarantine slots per restore cycle.
Fix (`src/js/engine/state.js`): refuse with a new distinct `'unusable'`
signal when `s.version !== SAVE_VERSION && !hasMigrationPath(s.version)`;
ontology header updated; debug panel (`src/js/app.js`) names the reason
honestly. Snapshot stays quarantined (preserved, not destroyed).
Proof: `test-persist-probe3` (e)+(f) — versionless → `'unusable'`,
truncated → `'corrupt'`, both still listed in quarantines afterwards.

### K2. System-arrival cinematic skipped after mid-cinematic reload (SOFTLOCK-of-experience — medium)
`systemAnimationShown = true` was set when the cinematic *started*
(`src/js/app.js` expeditionScreen). A tab backgrounded mid-cinematic
autosaved with the flag set; on reload the staged Day-7 reveal never played —
the player got post-arrival powers with no reveal, contradicting the staged-
reveal design requirement.
Fix: set the flag in the animation's completion callback ("once" means once
*seen*), so an interrupted viewing replays from beat 1. Verified by
inspection (DOM-only path; single call site, single reader).
Sibling sweep: no other `*Shown = true` one-time flags in game.js/app.js.

## Sibling sweeps performed
- Same class as K1 ("restore claims success on unrestorable data"): `adoptEntry`
  quarantines (not adopts) versionless blobs; `Game.load` → `migrateSave`
  refuses; no other restore/copy path over-claims.
- Same class as K2 (one-time UI flag set at start): sole instance.
- `state.run` wholesale-replace whitelist: no writes to `state.run.*`
  outside `syncRun` (would silently vanish on next save).
- Pending-event family (`pendingContest/Raid/Succession/Petition/...`) all
  ride day-boundary ticks, so they fire after Continue too — no session-gated
  limbo.

## Regression
- `scripts/test-break-persistence9-20261010.js`: 23 passed, 0 failed (AFTER mode).
- `scripts/test-break-persistence8-20261010.js`: 59 checks passed.
- New probes 1,2,3,4,5,7: all green (probe6 is size-report only).

## Verdict
System held nearly everywhere — nine prior passes earned it. Two genuine
catches fixed (K1 quarantine-restore honesty, K2 cinematic completion flag),
both with proof tests. Nothing pushed, bumped, or verified live per protocol.

## Files
- `scripts/test-persist-harness.js` — reusable deterministic harness (seeded
  RNG pre-eval, quota-capable fake localStorage).
- `scripts/test-persist-probe1.js` … `probe7.js` — proof tests (probe6 size
  report).
- `src/js/engine/state.js`, `src/js/app.js` — the two fixes.
