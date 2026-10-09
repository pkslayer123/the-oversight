# Break-it pass 5: persistence (save/load) — 2026-10-09

Hostile-player audit of the save/load system, fifth pass. Passes 1–4 killed:
save-leak wipe, fight-id minting, volatile fighter drops, mantle/key forks,
index dishonesty, corrupt pruning, wipeAll dead code, dead payload, win-path
stale saves, death-path throw races, mid-fight order re-deal, phantom
fighters, phantom pending encounters, scholarless saves, talkIdx/fireIdx/
questGiven dead payload, stale belltoad `_pendingPack`, stale cross-load
fights, corrupt fighter nukes, silent quota saves, vanishing old-version
saves, destroy-on-sight corruption, dead proof test. All four prior suites
re-run green after this pass (one test-setup update, documented below).

CANON NOTE: there is no docs/PERSISTENCE.md. Expected save/load behavior was
inferred from docs/CANON.md (standing rules: no silent actions, honesty on
every surface) plus the save/load code itself — not invented.

Proof: `scripts/test-break-persistence5-20261009.js` — seeded, deterministic
harness (full module list, seeded RNG before eval). BEFORE=1 runs the same
assertions as break-demonstrations against pre-fix code from git HEAD.
10 checks, all green in both modes.

## KILLS

**R1. villageLost BLED ACROSS IN-SESSION CONTINUE (softlock/honesty) — HIGH.**
`Game.load()` reset `over`/`won` but never `villageLost` (newGame did).
Repro: die village-lost (villageLost=true, run wiped) → title screen →
Continue a different living save in the same session → the new expedition
inherited villageLost=true. At the next dawn, `sleep()`'s "no home to return
to" early-return fired silently — the home-return sequence was skipped in a
run that HAS a home, with no say line and no UI explanation. (journal.js's
`over || villageLost` gate was also wrongly closed.) A loadable save is a
living run by definition; villageLost is session state of a dead run.
**Fix:** `load()` sets `this.villageLost = false` next to the over/won reset
(game.js), ontology rule `load_resets_session_death` added. Proof R1:
BEFORE load=true villageLost=true; AFTER load=true villageLost=false.

**R2. MAPLESS SAVE LOADED "FINE" (softlock) — MEDIUM.** The pass-4 scholar
guard rejected saves with no scholar, but a save with `run` and no `map`
loaded "successfully" (load=true) and then broke everywhere at once —
`playerTile` and the whole world dereference `map`. Proven: BEFORE
load=true, Game.map=undefined. **Fix:** the guard now also requires
`s.run.map`; the title screen takes the honest "could not be loaded" path.
Proof R2: BEFORE load=true; AFTER load=false, no throw.

**R3. TWO-TAB DEATH RESURRECTION (exploit) — HIGH.** The two-tab form of the
class pass 2 killed single-tab. Repro: tab A saves run (key X pinned);
tab A dies → `wipe(X)` removes data + index entry; tab B (stale tab, same
runKey, still playing, over=false) hits its 30s autosave → `S.state.save`
re-created key X and re-upserted the index — Continue resurrected the dead
run, `load()` resetting over=false exactly as in the pass-2 bug. Proven at
both levels: BEFORE saveB=true, key back in storage, listed again (S.state
and Game.save).
**Fix:** `wipe()` leaves a per-runKey tombstone
(`scattering-save-tombstone-<key>`) when the wiped key actually existed;
`S.state.save()` checks it before any write and returns the distinct string
`'tombstoned'` — deliberately NOT the quota-false, so the UI can't blame
storage. `Game.save()` propagates it verbatim; the 30s autosave toasts once:
"This expedition's save was ended somewhere else (another tab?) — progress
since your last save is at risk." Tombstones are capped (100, oldest pruned)
and keyed per runKey, so new runs (new keys) are never blocked; `wipeAll`
keeps tombstones (a lingering tab must not resurrect a run you deleted).
`Game.wipe` passes reason 'ended', `Game.deleteSave` passes 'deleted' (R5
proves title-deleted saves stay deleted too). Ontology rule
`dead_runs_stay_dead` added. Proof R3/R4/R5: BEFORE resurrection at both
levels; AFTER 'tombstoned', nothing re-created, nothing listed, new run
saves fine under a fresh key.

**R4. QUARANTINE STAMP COLLISION (hardening) — LOW.** `quarantineKey` stamped
quarantines with `Date.now().toString(36)` only — two quarantines of the same
key in the same millisecond overwrote each other and one corrupt-data
snapshot was lost, defeating the quarantine's purpose. **Fix:** random suffix
appended (timestamp prefix keeps chronological sort for the cap). Also
exported `quarantineKey` on `S.state` (was internal-only) so the primitive is
reachable and testable; ontology provides updated. Proof R7: BEFORE
source-level (Date.now-only stamp); AFTER two same-ms quarantines (frozen
Date.now) both survive.

## SIBLING SWEEPS (static, all green)

- **S1. Terminal-path wipe invariant:** every `this.over = true` in game.js /
  contests.js / ledger.js has a `wipe()` within the same tick (9 sites).
  `playerDeath` alone doesn't wipe (the mantle passes — not terminal), and
  every genuinely terminal path was already covered. Held, now guarded.
- **S2. `S.state.save` has exactly one caller** (`Game.save`, game.js:5149) —
  the tombstone contract lives in one place; no backdoor writers of save keys.
- **S3 (source-level):** the 30s autosave handles the `'tombstoned'` signal
  with an honest message (app.js can't eval headless — DOM).

## HELD (attacked, resisted — documented, not failures)

- **Two live tabs, same living run (last-writer-wins):** tombstones cover
  wiped keys only. Two tabs both alive on the same run still autosave to the
  same key — last write wins, the other tab's progress is silently lost.
  Fixing that needs a session token + conflict UI: a design change, not a
  bug fix. The save list's "last played" keeps it visible, not silent.
- **beforeunload/pagehide/visibilitychange saves** swallow the save result —
  you can't toast in those handlers. The next 30s tick surfaces a failure.
  Platform limitation, documented.
- **Functions in state** would be silently dropped by JSON round-trip —
  static sweep found no function-valued state fields; pass-4's bit-identical
  round-trip stands.
- **Quota-full mid-index-write:** `save()` returns false if EITHER the data
  write or the index write fails — partial index is reported as failure,
  never as success.

## Files changed

- `src/js/engine/state.js` — tombstone machinery (`writeTombstone`,
  capped at 100), `save()` tri-state (`true | 'tombstoned' | false`),
  `wipe(key, reason?)`, `quarantineKey` exported + collision-proof stamp,
  ontology header (`dead_runs_stay_dead` rule)
- `src/js/game.js` — `load()`: villageLost reset + map guard;
  `wipe()`/`deleteSave()` pass reasons; ontology rule
  `load_resets_session_death`
- `src/js/app.js` — 30s autosave handles `'tombstoned'` with an honest toast
- `scripts/test-break-persistence5-20261009.js` — new 10-check BEFORE/AFTER proof
- `scripts/test-break-persistence4-20261009.js` — setup now models the
  normalized session (`Game.villageLost = false` alongside over/won); the
  bleed case is covered by pass-5 R1
- `evidence/2026-10-09/break-persistence-5.md` — this file

## Verification

- AFTER: `node scripts/test-break-persistence5-20261009.js` → ALL CHECKS PASSED (10/10)
- BEFORE: `BEFORE=1 node scripts/test-break-persistence5-20261009.js` → all 5 breaks demonstrated, ALL CHECKS PASSED (10/10)
- Regression: passes 1–4 suites → ALL CHECKS PASSED (pass-4 needed the
  villageLost setup update above — its T1.3 Game-prop diff now models the
  documented load() normalization, same as over/won)
- `node scripts/validate-ontology.js` → 50/50 systems validated
- `node --check` clean on state.js, game.js, app.js, new test
- No `--force-delete` used. No bare git commands.
