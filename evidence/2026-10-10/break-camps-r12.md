# Break-it: camps & structures R12 — 2026-10-10

Target index 6. Worker verdict: **broke+2 fixed** (both honesty class), rest held.

## Canon
docs/CANON.md read first, then docs/STORAGE.md (tools, stashes, caches). **There is NO dedicated camps canon doc** — stated per instructions instead of inventing (same gap noted in rounds 6–11). In-code design comments treated as the camp canon. Nothing invented.

## Attacks attempted

### EXPLOIT — all held
- **E1 bridge rebuild loop:** build (4 wood) → smashBridge → rebuild. Smash refunds nothing; rebuild costs a full 4 again. No material printer. (buildBridge spends *inventory* wood via spendWood, not storage materials — test fixture corrected.)
- **E2 setUpCamp abandon cost:** abandoning a camp on another tile charges exactly 30 ticks once, no kcal. The breakCamp inside setUpCamp charges nothing itself.

### SOFTLOCK — all held
- **S1:** breakCamp with camp coords off the map (99,99) — no throw, state.camp cleared (every destructive step is try/catch'd; the delete always runs).
- **S2:** setUpCamp on a new tile while inside a tent *there* — the old camp's breakCamp does not evict (room-still-stands check from camps-9 holds).
- **S3:** resolveStormFront (unsheltered) while inside the camp tent — breakCamp evicts, no crash, no stale room.

### HONESTY — 2 kills
- **H1: multi-fire mourning lie (THE CATCH).** breakCamp's destroyed path mourned "the fire's scattered cold" unconditionally. A camp tile can hold several live fires (two fires for a big cook) — the sweep douses them ALL while the copy names ONE. Same copy-vs-engine class as camps-7/R10's fire lies. **Fix:** count-aware fire bit — "the 2 fires are scattered cold" / "the fire's scattered cold" / "the fire was already cold".
- **H2: abandon-confirm singular lie (sibling).** The "Set up camp" confirm promised "its tent is wrecked, its fire dies" while the engine wrecks every yours-tent and douses every tracked fire on the old tile. **Fix:** new read-only `Game.campAbandonLoss(px,py)` preview that mirrors the sweep (every yours-tent regardless of condition) and killCampFires (every tracked entry on the tile) exactly; the confirm names the real loss ("its 2 tents are wrecked, its 2 fires die" / singulars / "already cold").
- **H3 (reverted draft — reported, not shipped):** first drafted as "destroyed path with zero tents wrecked says 'The tent's wrecked'". R11's H1.4 proved the draft wrong: wrecked===0 in the destroyed path always means the wrecker one call up (wreckTent, destroyCell, the breach branch) already wrecked it, so the singular is the honest line. Reverted the game.js change; kept a regression guard on R11's judgment.
- Controls held: one-fire singular, cold-pit line (R10), wreckTent-path singular (R11 H1.4).

### DEAD-CODE — held
- **D1:** campAbandonLoss has exactly one live call site (app.js confirm) — wired, not speculative.
- **D2:** index.html loads game.js + app.js.
- **U3 (unbreakable audit):** source audit of every detail/cells write of a haven cell type ('hall','bunk','door','haven','sanct','base') — the ONLY writer is map-gen (validateSpawnArea carving haven doors). No player-reachable path can mint an unbreakable cell: pitchTent writes 'tent', makeFire writes 'fire', and nothing writes haven types. destroyCell's unbreakable list covers everything that exists; alien structures still don't exist on the grid ("when they exist" is still future).

### UNBREAKABLE (Steve's law) — held
- **U1:** destroyCell on a 'hall' cell (bulldozer cause) refuses — "The hall holds. Havens do not break.", cell intact.
- **U2 (reverse):** a yours-tent IS smashable — no path makes a player structure unbreakable.

## Fixes (src/js/game.js, src/js/app.js)
1. `Game.campAbandonLoss(px,py)` — read-only abandon-loss preview (new; no ontology header change — game.js header already covers it).
2. breakCamp destroyed-path fire bit is count-aware.
3. "Set up camp" confirm names the previewed loss.

## Sibling sweep
Same bug class (copy promises singular / engine does plural-or-silent): smashBridge copy has no counts (honest); wreckTent has no own copy (breakCamp's covers it); packTent's 16 ticks ride the visible clock per the established pitchTent cost-honesty judgment — left alone. **Observation, not changed:** buildBridge's "a bad storm could take it" is false for dry-land washed-out-path bridges (stormSmashBridges only takes creek bridges) — but round 6 deliberately chose dry-land bridges stand ("nothing to flood… a real choice"), so this is their call to revisit, not mine to silently retune.

## Proof
`scripts/test-camps-r12-20261010.js` — **40/40 × 3 seeds AFTER** (20261010, 1, 777); **BEFORE mode shows exactly 10 red** (H1.1–H1.2, H2.0–H2.6, D1 — the two catches, demonstrated pre-fix).
Regressions green: R10 suite 71/71, R11 suite 67/67 (after the H3 revert — my draft had regressed R11 H1.4, caught by the suite, reverted), camps6 40/40, camps7 71/71, camps8 93/93, camps9 49/49, storage 59/59. Ontology: 57/57 validated ("Release permitted").

No [needs-eyes] — copy-honesty only, no feel/combat/UI behavior change.
