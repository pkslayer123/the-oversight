# Break-it: camps & structures R13 — 2026-10-10

Target index 6. Worker verdict: **broke+3 fixed** (1 exploit, 1 softlock, 1 Steve's-law gap), rest held.

## Canon
docs/CANON.md read first, then docs/STORAGE.md (tools, stashes, caches). **There is NO dedicated camps canon doc** — stated per instructions instead of inventing (same gap noted in rounds 6–12). In-code design comments treated as the camp canon. Nothing invented.

## Attacks attempted

### EXPLOIT — 1 kill, rest held
- **E1 camp abandon economy: HELD.** Pitch+fire+setUpCamp on tile A, move, setUpCamp on tile B: old tile swept (tents wrecked not returned, fires doused), exactly 30 ticks charged once, zero kcal, no item/tent/fire duplication. New camp functional.
- **E2 feedFire fuel conservation: HELD.** Every feed consumes exactly 1 branch from materials; till grows by exactly the named amount. No fuel printer. (Fixture note: the fuel economy runs on `addMaterial`, not inventory items.)
- **E3 tent-unit conservation: HELD.** Three pitch/pack cycles round-trip units exactly; packTent's "pack it down" returns the unit honestly.
- **E4 (THE CATCH): haven door-trip phantom fire.** Pitch a tent on the haven grounds, light the interior fire, enter the hall (`enterBuilding` nulls the tile's cached detail to switch views) and come back out: the regen silently DELETED the pitched tent (no message, no refund) and left its interior-fire entry in `state.fires` as a phantom. Re-pitching the same cell inherited a FREE lit fire — same class as the camps-3 packTent phantom-fire catch. **Fix:** the haven tile now keeps two persistent view caches (`t.groundsDetail` / `t.hallDetail`) with `t.detail` as the current view's alias; door trips only invalidate the alias, never the grounds. Interior-fire continuity verified (same fire still burning, not a freebie).

### SOFTLOCK — 1 kill, rest held
- **S1 contest modal while insideTent at camp: HELD.** contests.js/contestEngine.js/broadcast.js contain zero references to `state.camp`/`breakCamp`/`insideTent`; a simulated modal round-trip leaves camp + tent room validating clean.
- **S2 storm (sheltered) with the camp on another tile: HELD.** `resolveStormFront` fires `breakCamp('the storm tore through it')` on the camp's tile, state consistent, message honest, no throw.
- **S3 alien douse-raid on the campfire: HELD.** Camp stands (fire isn't required post-setup), `atCamp()` true, no phantom; re-lit fire → "already your camp" (no duplicate camp).
- **S4 (THE CATCH): silent tent destruction.** Same root cause as E4 — the door trip deleted the player's tent with no narration, violating "No silent actions," and a full camp on the grounds became a phantom camp (tents gone, `state.camp` intact — the camps-4 class). Fixed by the view-cache split. Also added engine armor: `enterBuilding` refuses while `insideTent` ("duck out of the tent first"), same class as travelTo's insideTent armor.

### HONESTY — all held
- **H1:** setUpCamp's "(Sorting, resting, and camp rituals work here)" — `atCamp()` true at a player camp (sort gate passes), rest not refused. The promise holds.
- **H2:** pitchTent's "Sleep quality: tent" — `sleepPreview().quality === 'tent'` inside a pitched tent.
- **H3:** packTent's "pack it down" — the tent unit returns to the pack.
- Gate-order note (kept, not changed): with a doused campfire, `setUpCamp` names the missing fire before "already your camp" — the tent/fire checks deliberately run first so a failed setup can never cost the old camp (camps-2 design comment).

### UNBREAKABLE (Steve's law) — 1 kill
- **U4 (THE CATCH): the haven's lodge was breakable.** `destroyCell`'s unbreakable list omitted `'lodge'`; the only lodge cells in the game are the haven's lodge (map-gen, no player build-lodge action exists), so the law's enforcement had a latent hole. **Fix:** `'lodge'` added to the list ("The lodge holds. Havens do not break."). Currently unreachable (no combat on haven tiles — bulldozer is the only destroyCell caller, alien burn skips haven), but the list is the law's code expression; leaving it out was a violation waiting for a caller.

### DEAD-CODE — held
- **D1:** all 25 camp/structures `Game` functions exist; the 4 context-bar labels ("Pitch tent", "Pack up tent", "Enter tent", "Set up camp") are emitted by `cellActions` under the right conditions; app.js maps all 4 labels to engine calls; the tent room wires all 7 buttons (`tr-light/feed/cook/vent/sleep/exit/face`) to engine functions. Fully wired, no dead modules.

## Fixes (src/js/game.js)
1. **Haven view-cache split** (`genDetail` haven branch): `t.groundsDetail` / `t.hallDetail` persistent caches, `t.detail` as the current-view alias. The haven branch no longer trusts `t.detail` blindly (JSON save/load duplicates the shared reference — the branch re-links the live cache). Save migration: pre-fix saves adopt `t.detail` into the right cache via `lodge`/`hall` cell markers (the hall never contains lodge; the grounds never contain hall).
2. **`sweepDeadFires` view fix:** grid fires on the haven tile sweep `t.groundsDetail` (where they live), not the possibly-hall `t.detail` — no more stale "Warm hands" fire cells.
3. **`enterBuilding` tent armor:** refuses while `insideTent`.
4. **`destroyCell`:** `'lodge'` added to the unbreakable list.

## Sibling sweep
Same bug classes elsewhere: all three `t.detail = null` writers (enterBuilding, exitBuilding, travel-arrival at haven) are covered by the cache split; no tile-object replacement anywhere (fires key by coords, safe); `validateSpawnArea` writes only `door` (already unbreakable); alien burn path skips haven tiles and already skipped `lodge` in targeting; `scorchCells` only shreds tents via secrets (never clears lodge). Pre-existing, unrelated: `scripts/validate-data.js` crashes with `TypeError: spec.endsWith is not a function` — untouched by this run (script + data files unmodified; a sibling's schema/data change).

## Proof
`scripts/test-break-camps-r13-20261010.js` — **94/94 × 3 seeds AFTER** (20261010, 1, 777); **BEFORE mode shows exactly 11 red** (H4.4, H4.7, H4.8, H4.10, H4.11, H4.13, H4.14, H4.15, U4.1, U4.2, U4.3 — the three catches demonstrated pre-fix).
Regressions green: R10 suite 71/71, R11 67/67, R12 40/40, camps6 40/40, camps7 71/71, camps8 93/93, camps9 49/49, storage 59/59. Ontology: 62/62 validated ("Release permitted").

No [needs-eyes] — bug-fix restoring expected behavior (tents no longer vanish; lodge refusal unreachable in live play), no feel/combat/UI redesign.
