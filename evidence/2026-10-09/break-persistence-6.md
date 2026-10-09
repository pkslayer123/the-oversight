# Break-it pass 6: persistence (save/load) — 2026-10-09

Hostile-player audit of the save/load system, sixth pass. Passes 1–5 killed 20+:
save-leak wipe, fight-id minting, volatile fighter drops, mantle/key forks,
index dishonesty, corrupt pruning, wipeAll dead code, dead payload, win-path
stale saves, death-path throw races, mid-fight order re-deal, phantom
fighters, phantom pending encounters, scholarless saves, stale belltoad
`_pendingPack`, stale cross-load fights, corrupt fighter nukes, silent quota
saves, vanishing old-version saves, destroy-on-sight corruption, dead proof
test, villageLost bleed, mapless saves, two-tab death resurrection,
quarantine stamp collision.

CANON NOTE: there is no docs/PERSISTENCE.md (confirmed — the canon manifest
lists no persistence doc). Expected save/load behavior was inferred from
docs/CANON.md (standing rules: no silent actions, honesty on every surface)
plus the save/load code itself — not invented.

This pass attacked the fresh surface (alien r5 + forager/camp/survivalist
commits since pass 4). Proof: `scripts/test-break-persistence6-20261009.js`
(seeded, deterministic; BEFORE=1 runs break-demonstrations against pre-fix
code from git HEAD — valid only while HEAD predates the fix; see note at the
end). 14 checks, green in both modes from the worktree. Passes 1–3 suites
re-run green. Pass-4 suite needs a test-setup update (below).

## KILLS

**T1. ALIEN BEAM COOLDOWN SAVE-SCUM (exploit) — HIGH.** Alien r5 (2026-10-09)
moved the beam's once-per-~3-rounds gate onto the fight object
(`f._beamCooldown`), but `syncRun` never persisted it. A mid-alien-duel
save+Continue reset the cooldown to zero — the alien could beam immediately
after every Continue, and a save-scummer gets a beam every round instead of
every ~4. Same save-scum-gate class as the belltoad chorus / read_stance
kills (persistence r3). Proof T1: BEFORE saved.beamCooldown=undefined;
AFTER saved=2, restored=2, and `apMaybeBeamAttack` refuses while the
cooldown is hot. **Fix:** `beamCooldown` persisted in tbSave, restored
verbatim onto `f._beamCooldown` (game.js syncRun/load). Ontology rule
`fight_gates_round_trip`.

**T2. MID-UPRISING CONTINUE RESOLVED AS ORDINARY BETRAYAL
(softlock/honesty) — HIGH.** The uprising's identity never persisted: the
fight-level `uprising`/`uprisingAttackers`, and on `_lastBetrayal`
`uprising`/`uprisingAttackers`/`uprisingAllies`. After a mid-uprising
save+Continue, `load()` rebuilt `_lastBetrayal` WITHOUT the uprising markers,
so `betrayalAftermath` ran the plain-betrayal path and `uprisingAftermath`
(the village-wide justice — Steve's design) silently never fired. The
fight-level `f.uprising` was also lost (hostile talk lines lost the uprising
voice; the uprising flee-line swallow died). Proof T2: BEFORE
`fight.uprising=undefined, lb.uprising=undefined`; AFTER both true,
attackers/witnesses/betrayerDead all correct. **Fix:** `uprising` +
`uprisingAttackers` persisted in tbSave; restored onto the fight and rebuilt
into `_lastBetrayal` (`uprisingAllies` == defenders == the rebuilt witness
list, verified against justice.js's fighter construction). Ontology rule
`fight_gates_round_trip`.

**T12. SIBLING SWEEP — same class in related systems (exploit) — HIGH.**
Sweeping every fight-level field assignment against the tbSave key list
found the identical bug class in the hummice + shout systems:
- `humStacks`/`humMice`/`humRiseRound`/`humDecayRound` — the hummice swarm's
  sound-pressure mechanic (damage multiplier up to x2). Reload reset it to
  zero: a free threat-eraser.
- `shouts` — the player's 2/fight shout cap (`tbPlayerShout`). Reload reset
  it: infinite shouts, i.e. infinite chorus-breaks.
- `chorusBrokenUntil` — how long the shout's chorus-break lasts. Dropping it
  made the bellow's effect evaporate on reload.
- `terraformScorched` — the scorch once-per-fight narration flag.
- `orderDirty` — a mid-round speed change's pending re-sort for the next
  round (`tbRoundWrap`).
Proof T12: BEFORE all reset (humStacks=undefined, shouts=undefined);
AFTER all 8 round-trip verbatim. **Fix:** all eight persisted in tbSave and
restored verbatim (game.js). Ontology rule `fight_gate_sibling_sweep`.

## HELD (attacked, resisted — documented, not failures)

- **T3. Save-scum flag sweep re-do:** Game own-prop KEY diff across fresh
  load is EMPTY after alien r5 + forager commits; curated value snapshot
  (villagerId/dayPart/location/encounter/wanderer/pending triple) identical;
  `_pendingPack`, beam cooldown, terraform all restore. The sweep caught the
  T1-class gate in BEFORE mode and holds in AFTER — the deeper level working
  as intended. (The one known candidate, legacy `Game.ap`, still has zero
  live readers.)
- **T4. Map/Set/Date/class fidelity:** rich `state` double JSON round-trip
  is deep-equal (a Date/Map/Set/class instance fails this — none exist);
  static sweep finds no `new Date(`/`new Map(`/`new Set(` assigned into
  state fields anywhere in src/js (non-DOM); tombstones, quarantine keys,
  and index entries are constructed literals (JSON-native by construction).
- **T5. Write-ordering crash window:** data-then-index writes in `save()`
  are synchronous — no player-hittable window exists between them (a PWA
  hostile player cannot interleave single-threaded JS; only a process kill
  could, which no code can harden further). The reachable hostile case is
  index-write failure AFTER a successful data write (quota): proven that
  `save()` returns false (honest, never silent success), the blob is
  orphaned-but-listed-nowhere, and the NEXT successful save adopts it into
  the index (self-healing).
- **T6a/T6b. Mid-fight Continue from the direct-tbfight paths:** alien duel
  (encounters.js `startAlienCombat`) and betrayal fight (party.js) both
  restore mid-fight with hostiles, order, turnIdx, and `_lastBetrayal`
  intact — no phantom fighters, no softlock. (The uprising path, T2, did
  not survive — killed above.)
- **T7. Alien r5 field round-trip:** `apState` (`known`, `fanClubs`,
  `lastFeedDay`, `lastDropDay`, `met`, `lastHuntDay`) and fighter-level
  `alienPid`/`alienTech` all round-trip. The `f.alienFight` flag on the
  fight object is write-only (zero readers anywhere) — dead, harmless,
  left in place rather than churned.
- **T8. Storage-unavailable honesty:** with a throwing localStorage,
  `S.state.save`→false, `listSaves`→[], `load`→null, `quarantineKey`→no-op,
  `Game.load`→false — nothing throws, nothing lies. Boot/title paths are
  app.js (DOM-only, not eval-able headless); the state primitives they call
  are the hardened ones.
- **T9. Tombstone edges:** 101 wipes → exactly 100 tombstones, oldest pruned
  (deterministic age ordering verified with frozen Date.now); a tombstone
  survives unrelated index rebuilds; a tombstoned key is still refused
  ('tombstoned') after another run saves. `wipeAll` deliberately keeps
  tombstones (pass-5 design: a lingering tab must not resurrect a deleted
  run) — held, not a leak (capped at 100).
- **T10. syncRun/load key parity re-sweep:** programmatic — every tbSave
  key written (now 21, incl. the 11 new ones) is read in `load()`; every
  `state.run` key written is read. Green.
- **T11. Dead-code/backdoor sweep:** `S.state.save` still has exactly one
  live caller (`Game.save`); `quarantineKey` is exported and reachable;
  no backdoor save-key writers.
- **Honesty surfaces (static):** the autosave's `'tombstoned'` toast and the
  quota-false toast still wired (app.js); stale-version saves still render
  greyed with "from an older version — it can't be loaded" + Delete-only;
  `alienFight` dead field documented above.

## PROCESS NOTES

- **Pass-4 suite went red on master BEFORE this pass** (verified on pristine
  HEAD): combat-r7 (commit df2d54cc) added `betrayal: !!tbS.betrayal` /
  `playerFled` to the load() restore AFTER pass-4's test was written, so
  T1.3's hand-built fight (no betrayal keys) now diffs against the
  normalized restore. This pass extends the same normalization (uprising,
  _beamCooldown, hum fields, shouts...). REQUIRED test-setup update (same
  class as pass-5's villageLost update): add the canonical fight-shape keys
  to buildRich's fight literal in scripts/test-break-persistence4-20261009.js:
  `betrayal:false, betrayer:null, aggressor:null, playerFled:false,
  uprising:false, _beamCooldown:0, humStacks:0, humMice:null,
  humRiseRound:0, humDecayRound:-1, shouts:0, chorusBrokenUntil:0,
  terraformScorched:false, orderDirty:false`. (Every real fight constructor
  + fight-init produces this shape; the restore mirrors it.)
- **BEFORE-mode fragility:** the proof test's BEFORE=1 reads pre-fix code
  from `git HEAD`. Once the fix is merged to master, BEFORE=1 runs the
  FIXED code and the 4 break-demonstration checks (T1/T2/T3-beam/T12) fail
  spuriously. The valid BEFORE result is the one captured from the worktree
  (14/14 both modes, 2026-10-09). Same caveat applies to passes 1–5 suites.
- **Infrastructure incident:** the coordinator marked this tree done-merged
  and removed `~/workspace/worktrees/break-persist6` at 20:19 UTC while the
  worker was still mid-task (pass-4 test update + evidence file pending).
  The fixes + proof test had already been committed as a97fb046 and verified
  green, so nothing was lost — but the tree removal raced active work. The
  reaper's "never touch dirty/active trees" rule held (it was the
  coordinator, not the reaper); the queue protocol needs a "worker reports
  done first" handshake before landing.

## Files changed (landed as a97fb046)

- `src/js/game.js` — tbSave: `beamCooldown`, `uprising`,
  `uprisingAttackers`, + 8 sibling-sweep fields; load(): fight-literal
  restore of all 11 + `_lastBetrayal` uprising rebuild; ontology rules
  `fight_gates_round_trip`, `fight_gate_sibling_sweep`
- `docs/ONTOLOGY.md` — regenerated (2 rules)
- `scripts/test-break-persistence6-20261009.js` — new 14-check BEFORE/AFTER
  proof (this pass)

## Verification

- AFTER (worktree, HEAD predating fix): 14/14 ALL CHECKS PASSED
- BEFORE (worktree, pre-fix code from git HEAD): all 4 breaks demonstrated,
  14/14 ALL CHECKS PASSED
- Regression: passes 1–3 suites ALL CHECKS PASSED; pass 5 ALL CHECKS PASSED;
  pass 4 needs the test-setup update above (red on master independent of
  this pass — combat-r7 staleness)
- `node scripts/validate-ontology.js` → 52/52 systems validated
- `node --check` clean on game.js and the new test
- No `--force-delete` used. No bare git commands by the worker (the landing
  commit was made by the coordinator).
