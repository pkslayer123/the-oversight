# Break-it: camps & structures R11 — 2026-10-10

Target index 6. Commit pending. Worker verdict: **broke+1 fixed (+1 sibling), rest held**.

## Canon
No CAMPS.md exists in docs/. Per posture: read docs/CANON.md first, then docs/STORAGE.md (caches, haven stores) + in-code design comments as the camp canon. Nothing invented.

## Attacks attempted

### EXPLOIT — 1 catch, 1 held
- **E1: exile while inside your tent (THE CATCH).** `exilePlayer` (betrayal.js) never cleared `s.insideTent` — death did (ledger.js camps-3), exile didn't. The engine kept believing you were inside a tent standing back at the old fire: `shelteredFromSky()` true from tiles away (cold/rain tax exemptions at game.js:19557/20224/20314), the tent room screen rendering with live cook/feed/light/sleep actions while walking open ground (`expeditionScreen` keys off `insideTent` alone), the interior fire staying "lit" remotely (`tentFire()` matches by the tent's recorded tile, never the player's), and "Rain hammers the canvas" with no canvas. The every-status choke point (`validateInsideTent`) KEPT the stale room — the tent still stands, so validation is a no-op. Trivially reachable: pitch a tent on the Haven tile, enter it, get exiled at the moot. FIX: exilePlayer now evicts the room (`insideTent=null`, `tentSmoke=0`) with an honest line ("You crawl out of the tent — ... It stays pitched behind you; maybe you'll walk back for it. The road takes everything else."), mirroring the death path. The pitched tent itself STANDS — walk back and reclaim it, same as after a death.
- **E2 (softlock sibling): pending tent breach followed the exile.** `pendingEncounter`/`pendingInTent`/`pendingMonsterId` survived exile — "that thing is IN here with you" on an empty road. Same fix clears all three, mirroring the death path's "no pending breach follows them to Haven".
- **E3: camp claim survives exile — HELD (design judgment, flagged for Steve).** `state.camp` persists through exile; tents stay `sec.yours`; `atCamp()`/the sort ritual work if you walk back to the old tile at your own risk. No economy break, no dupe, no lie found — the camp is a personal claim on a wild tile, and the exile copy only says the *village* keeps its fire ("what crosses the road with you: yourself, your Codex, your pack" — the camp doesn't cross, it stays). Left unchanged; Steve can overrule.

### SOFTLOCK — held
- **S1:** post-exile move + `validateInsideTent` + `sleepQuality` + `tentFireLit`: no crash, no stale room (post-fix). Contest grab while inside the tent is NOT a break — the grab is modal, the player stays physically in the tent.

### HONESTY — held
- **H1:** `wreckTent`→`breakCamp('a monster tore it down')` with zero tents left in the sweep still says "The tent's wrecked" — true (wreckTent wrecked it one line earlier), no invented count.
- **H2 (R10 regression):** storm + dead fire stays honest — no "scattered cold" about a cold pit.

### DEAD-CODE — held
- **D1:** all 26 camp/structure functions have live call sites (def + callers verified in source). `state.camp` readers touch only `{px, py, condition}` — no stale-field reads anywhere. `atPlayerCamp()` has exactly one guarded call site (food.js `atCamp()`) — wired, not dead. index.html loads betrayal.js, ledger.js, game.js, storage.js, app.js.

## Sibling sweep
- Same bug class (stale room state surviving a life-transition): death clears the room (ledger.js, R10-verified), breakCamp/storm/breach evict it, travel clears `insideHaven` — exile was the only gap. `insideHaven` self-corrects on travel, so no parallel fix needed there.

## Fixes (src/js/betrayal.js +17)
`exilePlayer`: clear `insideTent`/`tentSmoke` with an honest line + clear the pending breach triple. No new functions — no ontology header change.

## Proof
`scripts/test-break-camps-r11-20261010.js` — **67/67 × 3 seeds AFTER**; BEFORE mode shows exactly **7 red** (E1.1–E1.5, E2.1, S1.2 — the catch and its sibling). Regressions: R10 suite `test-break-camps-20261010.js` 71/71 AFTER-mode; ontology `validate-ontology.js` 52/52 ("Release permitted").

No [needs-eyes] — state-correctness fix + copy, no feel/combat/UI changes.
