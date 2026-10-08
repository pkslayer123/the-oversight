# break-it: camps & structures, 3rd pass (2026-10-08)

Worker: break-camps worktree. Proof: `scripts/test-camps3-breakit-20261008.js`
(37 checks, ALL GREEN × 4 seeds: 20261008, 1, 777, 20261009).
Before-fix run: 14 FAILURES — every catch below demonstrated red, then green.

Context: passes 1–2 attacked the camp/tent/breach/fire surface hard (phantom
camps ×2, lying breakCamp messages, phantom "let it go", breach menu hole,
sweepDeadFires eating tents, grid-fed tent fires, save-scummed breaches).
This pass attacked the two paths those left alone: PACK (packTent) and DEATH
(playerDeath / the mantle). Result: 2 catches + 1 sibling, all broke, all fixed.

## CATCH 1 — PACK → RE-PITCH FREE FIRE (exploit + honesty) — BROKE, FIXED
**Attack:** `packTent` clears the tent cell, THEN calls `breakCamp('you packed
up the tent')`. The struck path skips breakCamp's fire sweep by design, and
breakCamp's tent sweep looks for live `'tent'` cells — the cell was already
cleared, so the sweep found nothing. The interior fire entry lingered in
`state.fires`.
**Result:** re-pitch on the same cell → `tentFireLit()` TRUE with no fuel, no
16 ticks, no 30 kcal. Pitch→light→pack→pitch = pay the ignite cost ONCE, then
a free lit fire every cycle. The struck message also claimed "The fire keeps
burning" for a fire whose tent was in your pack — a phantom fire.
**Fix (game.js packTent):** purge the packed cell's interior-fire entries
BEFORE breakCamp (same purge shape as wreckTent). A struck tent's fire is
doused; the "keeps burning" clause now only fires for real remaining grid
fires (proof A2 keeps that honest).
**Sibling (same class):** `destroyCell` smashing a tent had the identical hole
— it clears the cell to null, then leans on breakCamp's sweep, which can't see
the cleared cell. A bulldozer flattening your tent left its interior fire
entry behind → re-pitch the smashed cell → free fire. Fixed in destroyCell
(proof section C). Swept every other tent-cell destruction site: wreckTent
purges ✓, breakCamp sweep purges ✓, found-tent take can't have interior fires
(non-yours tents are never lit) ✓, tree felling never touches tents ✓.

## CATCH 2 — THE MANTLE BEQUEATHS THE OLD BEARER'S ROOM (softlock + honesty) — BROKE, FIXED
**Attack:** `ledger.js playerDeath` never cleared `s.insideTent` /
`s.tentSmoke` / `state.camp` / the pending-encounter triple. The village is
the protagonist — death passes the mantle — but the new bearer woke at Haven
carrying the old bearer's room.
**Result:** `insideTent` pointed at the dead bearer's tent, nodes away →
`tentRoomScreen()` rendered "Your tent — inside" at Haven (app.js keys off
insideTent alone); Light fire / Cook / Feed / Sleep all operated through the
dead tent's coords; `shelteredFromSky()` lied (rain-immune in the hall);
`triggerEncounter` with stale insideTent → `wandererTentBreach`: "IN here with
you" while standing at Haven. `state.camp` was inherited — a camp the new
bearer never pitched. A pending breach (`pendingInTent`) survived death and
rendered the breach card for someone never in a tent. And `insideHaven` was
left undefined → `havenStoresAccess()` 'none': the successor couldn't touch
the pantry until they found the door (newGame wakes you INSIDE the hall).
**Fix (ledger.js playerDeath):** the camp claim lapses with its keeper — camp
fires die with it (same honesty as the wreck paths), `insideTent`/`tentSmoke`
cleared, the pending triple cleared, and the new bearer wakes `insideHaven`
(like newGame). The pitched tent itself STANDS — the expedition's canvas,
still sec.yours; walk back and reclaim it. Placed before successor selection
so a later throw can't leave the stale room behind.
Design note (Steve-callable): I kept the tent rather than wrecking it — the
mantle passes the office, not the face, and wrecking would be a second,
silent death tax on top of the corpse-loot risk. The camp claim lapsing (not
the tent) is the consistent line: a camp is a claimed patch; the claimant died.

## Held (attacked, resisted)
- **EXPLOIT — tent pitch/pack loop:** still net-negative; wreck paths destroy
  with no salvage. No dup path.
- **EXPLOIT — exile cache / founding:** `_forkNewHaven` doesn't clear camp/
  insideTent, but the founder is the same person and their tent stands — not
  broken, just theirs. `foundHaven` is a tile action, unreachable from the
  tent-room screen, so founding-while-inside can't happen.
- **SOFTLOCK — packTent while inside:** still refused ("duck out first") ✓.
- **HONESTY — unbreakable rule:** destroyCell list unchanged
  (`hall/bunk/door/haven/sanct/base`); bridges aren't bulldozable (not in the
  lane's smash set) — no new violation.
- **DEAD-CODE:** no new functions added; all touched paths already wired.
  index.html loads every camp module (game/ledger/storage/app all present).
  `nodeEpithet` (used by the new death message) verified present on Game.

## Regressions
Green: test-camp-phantom, test-camp-storm-break, test-camps2-breakit,
test-tent-breach, test-tent-rooms, test-make-fire (26), test-fireside-return
(11). Ontology 50/50 validated.
Pre-existing failure (NOT this run): test-sleep-preview-tonight 10/11 — the
hydration-36 threshold fails identically with my changes stashed (water/fire
reality numbers, unrelated to camps).

## Files
- `src/js/game.js` — packTent interior-fire purge; destroyCell tent-smash
  interior-fire purge (sibling)
- `src/js/ledger.js` — playerDeath: camp lapses, room/pending cleared,
  insideHaven set
- `scripts/test-camps3-breakit-20261008.js` — 37-check proof
