# Break-it pass 4: persistence (save/load) — 2026-10-09

Hostile-player audit of the save/load system, fourth pass. Passes 1–3 killed:
mid-combat fight-ID minting, volatile fighter drops, mantle/key forks, index
dishonesty, corrupt-save pruning, wipeAll dead code, run.telemetry payload,
win-path stale saves, death-path throw races, mid-fight order re-deal, phantom
fighters, phantom pending encounters, scholarless saves, talkIdx/fireIdx/
questGiven dead payload, stale belltoad `_pendingPack`. This pass attacked what
remained: full-state round-trip fidelity, save-scum flag resets, corruption +
version hostility, and read/write key parity.

Proof: `scripts/test-break-persistence4-20261009.js` — parent process builds a
rich mid-game state (mid-fight with volatile fields + terraforming + inbound
belltoad chorus, armed contest countdown, suspended arena contest, pending
"face it" encounter, corpse at decay stage, codex entries, gossip network, talk
requests), saves, then spawns a FRESH node process (true PWA-restart semantics)
that loads and deep-diffs. BEFORE=1 runs the same assertions against pre-fix
code from git HEAD. Passes 1–3 suites re-run green as regression.

## KILLS

**Q1. STALE FIGHT ACROSS IN-SESSION LOADS (softlock/phantom).** `Game.load()`
only assigned `this.tbfight` when the save contained a fight. Loading a
peaceful save in a session that had already restored a mid-fight save left the
OLD fight live — a phantom fight from another save, resumable forever. (My own
test tripped over it: T3.9 "passed" vacuously on the stale T1 fight before the
fix.) FIX: `this.tbfight = null` before the restore block, next to the existing
`this._pendingPack = null` (game.js). Sibling sweep: `pendingEncounter/Id/InTent`,
`wanderer`, `encounterDone` are all assigned unconditionally — no other
conditionally-restored run field.

**Q2. CORRUPT FIGHTER NUKED THE WHOLE FIGHT (exploit).** One hostile fighter
entry (null / wrong shape) in a saved fight threw out of the restore loop; the
outer catch silently converted it to a peaceful load — a tampered save became a
free escape from a losing fight. FIX: per-fighter try/catch; bad entries are
dropped with an honest line, the rest of the fight restores; order/turnIdx
rebuild when drops happened; zero restorable fighters → honest "the fight is
gone" line instead of an empty arena (game.js). syncRun's snapshot side already
had per-fighter hardening — this closes the load side.

**Q3. QUOTA-FULL SAVE WAS SILENT (honesty).** `S.state.save()` swallowed
`QuotaExceededError` (and stringify throws) with no signal; the 30s autosave
believed it saved while nothing persisted — the player thinks they're safe and
they're not. FIX: `S.state.save()` returns true/false; `Game.save()`
propagates it; the autosave toasts once on failure and stays quiet until a save
succeeds again (state.js, game.js, app.js). Swept every `Game.save()` call site
(4 in app.js, all try/caught) and the only direct `S.state.save` caller.

**Q4. OLD-VERSION SAVES VANISHED SILENTLY (honesty).** `listSaves()` hid
version-mismatched saves with no explanation — after a build that bumped
`SAVE_VERSION`, the player's Continue list would just go empty. FIX:
`listSaves({includeStale:true})` surfaces them flagged `{stale:true,
staleVersion}`; data is kept untouched; the title screen renders them greyed
with "from an older version — it can't be loaded" and Delete-only (state.js,
game.js passthrough, app.js renderSaves). Default list behavior unchanged;
`save()`/`wipe(key)` index rebuilds now preserve stale entries (they previously
would have dropped them); `wipeAll` wipes stale too.

**Q5. CORRUPT DATA DESTROYED ON SIGHT (honesty).** Pass 1's design deleted
unparseable save data outright. Steve's 2026-10-05 design quarantined it.
STEVE-CALL (documented, overrulable): preserve-then-prune strictly dominates
destroy — unparseable data is now moved to a capped (3/key) dated quarantine
key before pruning (state.js `quarantineKey`). The full migration subsystem
stays retired; this is the minimal restoration of "corrupt never loses data".

**Q6. DEAD PROOF TEST (dead code).** `scripts/test-state-depth-20261007.js`
tested the deleted save-robustness subsystem and THREW (its own harness masked
the exit code). Removed — a lying test is worse than no test.

## HELD (attacked, resisted — documented, not failures)

- **Full-state round-trip**: rich mid-game + mid-fight + mid-countdown
  save → fresh-process load is bit-identical on `state` JSON (excluding the
  intentional `scholar.activeSynergies` recompute-migration, verified
  deterministic across double loads) and on every Game prop (excluding the
  by-design log truncation to last 40). Fight id, order, turnIdx, round,
  volatile fields (beamCd, threat), terraform, belltoad pack, contest
  countdown, arenaContest/activeContest, pending encounter, corpse, codex,
  gossip, talk requests — all survive.
- **Save-scum flag sweep**: Game own-prop diff across fresh load is EMPTY —
  no once-per-day/fight/event gate lives on un-persisted Game state. (The one
  candidate, `Game.ap`, is a legacy shadow of `scholar.ap` with zero live
  readers.)
- **`_contestArenaAfter`**: a load-time method on the Game singleton, not
  per-fight state — mid-arena-fight saves route correctly after Continue.
- **`_sleeping` / `_tentBreachSpawn` / `_npcActing` / `_ticking`**: intra-tick
  transients; single-threaded JS means no save can interleave; fresh boot
  starts clean.
- **`_usedNames` / `_usedTraits` / `_usedBackstories`**: consulted only at
  newGame/roster gen; no mid-run person-gen consults them. Reset-on-load is
  harmless.
- **syncRun/load key parity** (static sweep): every `state.run` key written is
  read, every `r.*` key read is written; every `tbSave` key written is read.
- **Corruption**: garbage/truncated/missing-key saves → honest null/false, no
  throw, no half-load; hostile `tbfight` shapes (null fighter, ghost order
  keys, string instead of object) → no throw, degraded-but-runnable or honest
  peaceful load.
- **`Game.ap`**: legacy shadow, zero readers — left alone, documented.

## THE cda7946 FINDING (process, reported loud)

While sweeping version hostility I found that commit `cda7946` ("Version bump",
2026-10-07) silently deleted Steve's entire save-robustness subsystem from
`src/js/engine/state.js`: save migration, corrupt-save quarantine, backup
rotation, run chronicle (~217 lines, Steve 2026-10-05/06 design). It had zero
callers outside state.js and `SAVE_VERSION` never changed, so no live behavior
broke — which is exactly why nobody noticed for 2 days, through three break-it
passes that audited save/load deeply. The subsystem's own proof test kept
THROWING (now removed, Q6). This is the fourth instance of the stale-tree
revert class. The full subsystem stays retired (dormant code with zero callers
should not be resurrected); Q5 restores its one load-bearing property
(corrupt data is never destroyed) in minimal form. The process lesson stands:
version-bump commits need the same HEAD-verification as content commits.

## Proof results

- AFTER: all 41 checks pass, incl. passes 1–3 regression suites.
- BEFORE (pre-fix code from git HEAD): exactly the 5 new-behavior gates fail
  (T3.5 stale surfacing, T3.10 hostile tbfight, T3.12/T3.14 save status,
  T3.15 quarantine); T3.9's BEFORE "pass" was vacuous (stale-fight bug
  masking) — T3.10 is the discriminating assertion for Q1.
- `node scripts/validate-ontology.js`: 50/50 systems validated (headers
  updated for the new rules; docs/ONTOLOGY.md regenerated).
