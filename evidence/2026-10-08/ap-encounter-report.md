# Alien-player encounters — wired into the live game (2026-10-08)

## What was dead
`src/js/alienPlayers.js` had a complete exclusive pool — `apRollEncounter`
("Called from the encounter phase"), `apStartEncounter`, fighter builder,
wealth stances, beam weapons, codex/gossip integration — with **no call
site**. The module's own comment said where it should be called from; nothing
called it. Contests/codex/gossip were wired by the integration worker; the
encounter roll itself was not.

## Patch (all in encounters.js — game.js, contests.js, app.js, index.html untouched)

**1. checkEncounter wrap** — after the monster encounter phase, take the alien
pool's SEPARATE roll. Guarded (contests.js `_contestVerdict` pattern):
module absent = no-op; combat already started / monster on the tile / animal
encounter live = skip (separate pools, separate beats, no doubling up on one
crossing). Gating (post-System, wave 2+, safe tiles, readiness) stays inside
the module's `apEncounterEligible`.

**2. `startAlienCombat(fighter)`** — builds `this.tbfight` for a PERSON fight:
player + party villagers (nearest 4 within 4, same shape as a monster fight)
+ one `kind:'hostile'` fighter. The engine already treats `'hostile'` as an
enemy for targeting/damage; the intro keeps the ambiguity ("STRANGER",
descriptor and dread, never a name pre-reveal).

**3. `tbAlienTurn(m)`** — the hostile fighter's bespoke turn: retreat stance
(broke personas break off at critical HP instead of dying), telegraphed heavy
burst (windup → burst radius 1 → recovery, grid-highlighted via `warnCells`,
`telegraph` audio cue, legible beat), close-in movement, persona-flavored but
knowledge-safe melee strikes. People fight like players, not beasts.

**4. `tbHostileTurn` intercept (lazy)** — party.js's sync `tbAdvance` routes
`kind:'hostile'` to the betrayal AI (begging/yielding villagers — wrong
fiction for an alien, and its yield path nulls `tbfight`). Installed lazily
inside `startAlienCombat` because party.js `Object.assign`s `tbHostileTurn`
*after* encounters.js loads and would silently replace a load-time wrap.
(A load-time wrap died exactly this way during development — caught by proof.)

**5. `tbMonsterTurn` intercept (load-time)** — covers the browser's stepped
`tbAdvanceAsync`, which calls `tbMonsterTurn(c)` directly for every
non-player fighter. The monster pipeline needs `m.mdef`; a person has none.

**6. `tbEndCheck` wrap (chain-safe)** — game.js only counts `kind:'monster'`
as enemies, so an alien-only fight would instantly "win". Alien hostiles
count; player-dead/fled resolves honestly. Chains before party.js's betrayal
wrap (which keys off `f.betrayal`, absent here).

**7. Beam key adapter (module bug, fixed at the seam)** — `alienPlayers.js`
`apBeamHit` addresses the player fighter as `'player'`, but the engine's key
is `'p'` — `tbFighter('player')` is `undefined`, so every beam **announced
and then silently whiffed**. Translated `'player'→'p'` in a lazy chain-safe
wrap. **The module file itself needs the one-line fix at the source**
(alienPlayers.js `apBeamHit('player', …)` → `'p'`); this adapter is the seam
fix until its owning worker lands it. Same lazy install (load order).

## Debug scenario
`alienEncounter()` — day 30, wave 2 (`waveKills {1:4}`), System arrived +
integrated, two allies (readiness gate passes), wild node, spear in hand.
Fires through the **real** `apRollEncounter` path (spins the 8% roll), not a
forced spawn. Listed + categorized under "👤 Alien Players".

## Proof
`scripts/test-ap-encounter-20261008.js` — 54 assertions, green on seeds
20261008, 1, 7, 42. Played, not just executed:
- ACT 0: static — guarded call lives in encounters.js; game.js untouched
  (no `apRollEncounter`/`startAlienCombat`/`tbAlienTurn` there); all
  intercepts defined; scenario registered/listed/categorized.
- ACT 1: `checkEncounter()`'s wired roll fires a real alien encounter while
  walking wild tiles (not a direct `apStartEncounter` call). Fighter is
  `kind:'hostile'`, name "Stranger", 🧑, HP in band.
- ACT 2: the debug scenario runs end-to-end; the fight is live and the alien
  takes its bespoke turn after the player.
- ACT 3: full fight played — player strikes land; heavy strike declares
  (windup line), highlights grid cells (`state.warn`), and resolves (burst
  or clean miss); beam fires through the resolver and damages; broke Pip
  retreats at critical HP and the fight resolves; killing Fenwick ends the
  fight, `apOnCombatEnd` records it, codex entry writes, encounter state
  clears, and the game continues (no stuck state).
- ACT 4: whole-run leak scan — no alien-truth word (Vexari, "wearing a human
  suit", species/titles, etc.) on any pre-reveal surface.

`node scripts/validate-ontology.js` — all 46 systems validated (the
`provides`/`rules` entries for the new surface added to encounters.js).

## Notes for the coordinator / Steve
- The beam-damage bug (announce-but-whiff) was live in the module since it
  was written — every beam attack the design intended was a no-op. Fixed at
  the seam; source fix belongs in alienPlayers.js.
- Alien fights reuse the person-combat machinery the betrayal system built
  (`kind:'hostile'` targeting, damage, witness reactions) — the pool's
  "separate from monsters" rule holds: no mdef, no monster pipeline, no
  carcass economy.
- Balance feel (one playtester's read, not a verdict): a spear player drops
  a 100-HP alien in ~3 rounds if the heavy is ignored; the heavy punishes
  standing still; beams remain the real terror (nearly lethal unresisted, by
  design). Pip fleeing at low HP read as character, not a bug.
