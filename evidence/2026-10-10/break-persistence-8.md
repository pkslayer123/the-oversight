# Break-it: persistence (save/load) — EIGHTH PASS — 2026-10-10

Hostile-player eighth pass on the save/load system. Passes 1–7 killed 30+:
save-leak wipe, fight-id minting, volatile fighter drops, mantle/key forks,
index dishonesty, corrupt pruning, wipeAll dead code, dead payload, win-path
stale saves, death-path throw races, mid-fight order re-deal, phantom
fighters, phantom pending encounters, scholarless saves, belltoad
`_pendingPack`, stale cross-load fights, corrupt fighter nukes, silent quota
saves, vanishing old-version saves, destroy-on-sight corruption, dead proof
test, villageLost bleed, mapless saves, two-tab death resurrection,
quarantine stamp collision, beam-cooldown save-scum, mid-uprising continue,
Map/Set/Date fidelity, write-ordering crash window, alien r5 round-trip,
storage-unavailable honesty, tombstone edges, key parity, S.state.save
callers, wipeAll tombstones, cross-tab staleness refusal, migration registry,
corrupt-index self-healing, quarantine notice + restore manifest, tombstoned
read path, save-integrity reverts, talkIdx rewire.

CANON NOTE: there is no docs/PERSISTENCE.md (confirmed again this pass — the
canon manifest lists no persistence doc; docs/STORAGE.md is about stashes,
not save/load). Expected behavior inferred from docs/CANON.md (no silent
actions, honesty on every surface) plus the save/load code — not invented.

This pass attacked the FRESH surface: every persisted slice added or changed
since 2026-10-08 (alien r7 naming fixes, camps r10 killCampFires, food r2
parasiteRisk field contract, stash armory/pharmacy, disease rework _seq
mirrors, contestEngine determinism, survivalist r5, social r10, explorer
fog reveals). Proof: `scripts/test-break-persistence8-20261010.js` — seeded
(mulberry32, SEED env, default 20261010), full index.html module order,
BEFORE=1 via git HEAD. 59 checks AFTER green (x4 seeds: 20261010/7/42/99),
58 BEFORE (all three K8 breaks demonstrated).

## KILL

### K8. _seSeq SAVE/LOAD COLLISION — disease mirror desync (EXPLOIT/HONESTY) — HIGH
`applyStatus` mints a session-unique `_seq` per status entry; the legacy
`s.diseases`/`s.poisons` mirror is matched by `_seq` (disease rework
2026-10-10 fixed shift()-based wrong-mirror drops). But `_seSeq` is a
Game-level counter — deliberately unpersisted (pass-4's empty Game own-prop
diff). After Continue it reset to `undefined`, so the first post-load
`applyStatus` re-minted seq 1, COLLIDING with a pre-load entry's seq.
`seDropMirror` takes the FIRST seq match: curing the post-load disease
(trichinosis, seq 1) dropped the PRE-LOAD disease's mirror (gutrot's
"Nauseous") instead. End state: engine still had gutrot ticking but the
mirror said clean, and trichinosis's mirror ("Aching") lingered though cured
— engine and the herbal_remedy/purify gate disagreed in BOTH directions. The
exact bug class the disease rework fixed, resurrected across save/load.
Proven: pre-load gutrot:1 + wound_fever:2; post-load trichinosis got seq 1;
after cure, engine=gutrot,wound_fever but mirrors=Feverish,Aching.
**Fix:** reseed `_seSeq` from the max live `_seq` (scholar + any live fight
fighters, whose statuses persist mid-fight) before minting, inside
`applyStatus` — the single mint point, covering every path including
mid-fight loads. The Game-unpersisted invariant is preserved (lazy
re-derivation, no new persisted field). Sibling sweep: `_seSeq` is the only
Game-level id-minting counter in src/js — no siblings. Proof K8/K8c:
BEFORE all three collisions demonstrated (scholar seq, wrong-mirror drop,
fighter seq); AFTER trichinosis gets seq 3, cure removes only its own
mirror, mid-fight fighter seq goes 1→2.
**Files:** src/js/statusEffects.js (fix), scripts/test-break-persistence8-20261010.js (proof).

## REGRESSION TRIAGE (all three are stale test assertions, not behavior bugs)

Passes 1–7 left three red checks, all caused by DELIBERATE r7 behavior
changes the old assertions predated — the same class as r7's own pass-6
assertion update. Fixed with dated r8 comments, no game-code changes:

1. **Pass-1 7b** ("all saves + index gone — keys=1"): r7's T1 made
   `wipeAll()` write a tombstone per removed key (dead runs stay dead vs
   stale tabs). Zero-keys is no longer the contract. New contract: no save
   blobs, no index entries, remaining keys are exactly tombstones, and a
   stale-tab save is still refused 'tombstoned'.
2. **Pass-2 A3** ("poisoned state → storedDay=9"): r7's self-healing
   `listSaves` scans storage insertion order, so `listSaves()[0]` picked the
   previous block's day-9 different-key save. The test now clears storage
   before the poison block so the key is unambiguous.
3. **Pass-5 R7** ("quarantine keys=4"): r7's T5 made `quarantineKey()` also
   write the restore manifest + one-shot player notice, both under the
   quarantine prefix. The filter now counts snapshot keys only.

All eight suites green after the updates (passes 1–7 + the new pass-8).

## HELD (attacked, resisted — documented, not failures)

- **N. Round-trip fidelity of every new slice:** alienPlayers (met, known,
  favor, fanClubs, lastDropDay/FeedDay/HuntDay/GroupDay/VillagerKillDay),
  village.stash (tools/weapons/medicine sections + deposit ledger),
  scholar.caches (parasiteRisk field contract), state.fires
  (till/burn0/inside/lastTax), scholar.statuses + disease mirror,
  activeContest mid-show, arenaContest (suspended), village.justice
  (moot/exile), pendingContest, gossip, saveSeq monotonicity — all
  deep-equal across save→load. Fires are `_absTick`-keyed (day×TICKS_PER_DAY
  + dayTicks, both persisted) so no clock rewinds. No `ashOf`/phoenix gear
  field exists in code — nothing to persist, noted not invented.
- **S. Save-scum:** fight-id gate + read_stance (pass-1 class) hold;
  `_cxSeed` identical before/after load (2468125211 → 2468125211) — contest
  fate replays, never re-rolls; corpse loot fixed at death; beam cooldown
  holds. The remaining action-time RNG (forage yields, fight-turn variance)
  is the documented inherent class, not a gate reset.
- **D. Duplication on load:** double load appends nothing across
  caches/stash-ledger/fires/gossip/statuses/log; quarantine double-restore
  refused as 'occupied'; apState fan-club migration and stashState() are
  idempotent (earned favor kept).
- **F. Softlock mid-flight:** mid-activeContest restores mid-phase (the
  narration box re-renders it, choice buttons re-wire — resumable, not
  stranded); arenaSuspended + live tbfight both restore; pending moot
  (stage 3) and exile flag + exileDay survive; mid-alien-duel restores
  fighters with alienPid/alienTech + beam cooldown.
- **H. Honesty:** index names the live bearer after mantle transfer
  (re-verified post alien-r7: "Mara Voss", single entry); saveLocationLabel
  honest (Haven by name / "the wild"); quarantine-notice toast fires in
  renderSaves (one-shot); debug panel lists quarantines + one-tap restore
  with occupied/corrupt messaging; autosave handles all four statuses
  (true/false/'tombstoned'/'stale') with honest toasts; migratable saves
  labeled "upgrades on load".
- **M. Dead code + migration:** every S.state export has a live caller;
  Game.save/load/wipe/deleteSave/wipeAllSaves/hasSave/listSaves +
  takeQuarantineNotice/listQuarantines/restoreQuarantine all defined. The
  MIGRATIONS registry was proven to fire end-to-end with a synthetic
  MIGRATIONS[2] against a SAVE_VERSION=2 re-eval: old blob upgrades on
  load(), hasMigrationPath(1) true, version 99 refuses null, save()
  upgrades old in-memory state, migratable saves list with willMigrate.
  (The r7 suite proved this first; re-proven here per the task.)

## Process notes

- The proof test's localStorage mock needed a `length` getter — r7's
  self-healing scan enumerates via `localStorage.length`/`key(i)`. Without
  it the scan silently found nothing (a mock fidelity gap, not a game bug).
- Disease suites re-run green after the _seSeq fix (disease-break 53/53,
  disease-rework 53/53, status-effects 51/51, disease-pools 66/66) —
  the fix is inside the mint path the rework's tests cover.
- `node scripts/validate-ontology.js` → 52/52, release permitted. No header
  changes needed (fix is inside an existing function, no new exports).
- No `[needs-eyes]` — no feel/combat/UI changes; the _seSeq fix is
  engine-invisible when correct.

## Files changed

- `src/js/statusEffects.js` — _seSeq reseed fix (+22 lines, one block in applyStatus)
- `scripts/test-break-persistence8-20261010.js` — new 59-check proof (BEFORE/AFTER for K8)
- `scripts/test-break-persistence-20261008.js` — 7b assertion updated (r7 tombstone contract)
- `scripts/test-break-persistence2-20261008.js` — A3 setup hardened (storage clear)
- `scripts/test-break-persistence5-20261009.js` — R7 filter narrowed (snapshot keys only)
- `evidence/2026-10-10/break-persistence-8.md` — this file

## Verification

- `node scripts/test-break-persistence8-20261010.js` → ALL CHECKS PASSED (59, seeds 20261010/7/42/99)
- `BEFORE=1 node scripts/test-break-persistence8-20261010.js` → all 3 K8 breaks demonstrated, ALL CHECKS PASSED (58)
- Passes 1–7 suites → ALL CHECKS PASSED (incl. pass-7 60/60)
- `node scripts/validate-ontology.js` → 52/52
- `node --check` clean on statusEffects.js + all touched tests
