# Break-it: persistence (save/load) — THIRD PASS — 2026-10-09

Hostile-player third pass on the save/load system. Passes 1+2
(`evidence/2026-10-08/break-persistence{,-2}.md`) landed 11 kills; both
re-verified still green (25/25 + 28/28). This run attacked the remainder:
mid-fight Continue fidelity, phantom entities from missing monster defs,
scholarless saves, dead payload in `state.run`, and the belltoad delayed-pack
leak across fights/loads.

Proof test: `scripts/test-break-persistence3-20261009.js`
(BEFORE/AFTER via `BEFORE=1`, seeded, deterministic) — 23 checks, all green
both modes (BEFORE demonstrates each break, AFTER demonstrates each fix).

## Kills (all fixed, all proven)

### P1. MID-FIGHT CONTINUE RE-DEALT THE FIGHT (HONESTY) — HIGH
`load()` recomputed `order` via `turnOrder()` instead of restoring the
save-time order. `turnOrder`'s tiebreak is `Math.random() - 0.5` and it
re-sorts mid-fight reinforcements by speed instead of their appended
position — so after every Continue the fight ran a DIFFERENT turn order, and
`turnIdx` pointed at the wrong fighter (proven: it was m_slow's turn, after
Continue m_fast acted). "Continue resumes the fight faithfully" was false.
**Fix:** `syncRun` persists `f.order` verbatim in tbSave; `load()` restores
it (filtered to surviving fighter keys); `turnOrder` is only the fallback
for pre-fix saves. Proof P1b–P1d.

### P2. PHANTOM FIGHTER SOFTLOCK — HIGH
A mid-fight save whose `monsterId` has no def at load (monster removed/
renamed in an update, tampered save) restored the fighter with `mdef:
undefined`. `tbMonsterTurn` dereferences `m.mdef.id` → `TypeError: Cannot
read properties of undefined (reading 'fleeAt')` — the fight could never
advance, and Continue resurrected the broken fight forever.
**Fix:** `load()` drops def-less monster fighters (never the player — a
scholarless save is rejected outright, P4) with an honest log line. Proof
P2b–P2e: BEFORE phantom present + turn throws; AFTER dropped, order/turnIdx
still valid.

### P3. PHANTOM PENDING-ENCOUNTER SOFTLOCK — HIGH
`pendingMonsterId` with no def at load restored the "face it" panel, but
`startCombat` throws on unknown ids by design (no silent fallback) — so the
button always threw and the expedition was stuck on an unresolvable panel.
**Fix:** `load()` validates `pendingMonsterId` against `data.monsters` and
clears the phantom encounter with an honest log line. Proof P3b/P3c.

### P4. SCHOLARLESS SAVE LOADED "FINE" (SOFTLOCK/HONESTY)
`load()` only required `s.run`. A save with no scholar loaded into a
half-built Game instead of taking the honest "could not be loaded" path.
**Fix:** `load()` also requires `s.scholar`. Proof P4a.

### P5. DEAD PAYLOAD IN state.run (DEAD CODE)
`syncRun` copied `talkIdx`/`fireIdx`/`questGiven` into `state.run`; zero
readers of `state.run.talkIdx` (etc.) exist anywhere — they persist directly
on `state` and survive via `this.state = s` in `load()`. Pure save bloat.
**Fix:** removed from `syncRun`; state-level fields untouched (P5b proves
they still round-trip). Proof P5a/P5b.

### P6. STALE BELLTOAD PACK LEAKED ACROSS FIGHTS (EXPLOIT/SOFTLOCK)
`_pendingPack` is per-fight Game state, not in the save. `load()` only ever
*set* it, never cleared it — loading a peaceful save after a chorus fight
left the delayed pack armed, so belltoads answered the call in some other
fight's round 2. Same class at fight creation: `startCombat` set the pack
only for belltoad fights, so a non-belltoad fight inherited the previous
fight's pack.
**Fix:** `load()` clears `_pendingPack` before restoring; `startCombat`
clears at fight creation. **Sibling sweep:** three more fight-creation
paths bypass `startCombat` and built `this.tbfight` directly — alien duels
(encounters.js `startAlienCombat`), the uprising (justice.js), betrayal
fights (party.js) — all got the same clear. Proof P6b/P6c.

## Held (attacked, resisted — documented, not failures)
- **Duplication on load (P7):** corpse loot is rolled at death
  (`registerDeath`) and persisted on the corpse — save/load changes nothing
  (P7a). Inventory + pantry are conserved exactly across save/load (P7b):
  every transfer is single-tick and atomic; no mid-transaction save hook
  exists, and double-load appends nothing (pass 2).
- **runKey stability (P8):** still pinned across saves, single index entry,
  no fork.
- **RNG save-scumming of action-time outcomes** (forage yields, fight-turn
  variance) remains possible — inherent to `Math.random` action-time rolls.
  The *fixed* class was gates/flags being re-rollable (read_stance
  once-per-fight, chorus pack, debuff cleanse — all persistent now).
  Contest resolutions are state-seeded (`contestEngine._cxSeed`: day +
  contest + participants + stat snapshot), so re-resolving after a reload
  replays the identical fate. Persisting the RNG stream would be a design
  change, not a bug fix — documented, not fixed.
- **Corrupt/version-mismatched saves:** pass 1's pruning still holds;
  P4's scholar guard extends the same honesty to scholarless saves.
- **Legacy `SAVE_KEY` fallback / two-tab resurrection:** unchanged from
  pass 2 (documented, held).

## Files changed
- `src/js/game.js` — order persisted/restored in `syncRun`/`load`, phantom
  fighter + phantom pending-encounter clearing, scholar guard, dead payload
  removal, `_pendingPack` clear in `load()` and `startCombat`
- `src/js/encounters.js`, `src/js/justice.js`, `src/js/party.js` —
  `_pendingPack` clear in the three direct `tbfight` constructions (sibling sweep)
- `scripts/test-break-persistence3-20261009.js` — 23-check BEFORE/AFTER proof (new)
- `evidence/2026-10-09/break-persistence-3.md` — this file

## Verification
- `node scripts/test-break-persistence3-20261009.js` → ALL CHECKS PASSED (AFTER, 23/23)
- `BEFORE=1 node scripts/test-break-persistence3-20261009.js` → breaks demonstrated, ALL CHECKS PASSED (23/23)
- `node scripts/test-break-persistence-20261008.js` → ALL CHECKS PASSED (no regression, 8 kills hold)
- `node scripts/test-break-persistence2-20261008.js` → ALL CHECKS PASSED (no regression, 3 kills hold)
- `node scripts/validate-ontology.js` → 50/50 systems validated, release permitted
- `node --check` clean on game.js, encounters.js, justice.js, party.js, new test
