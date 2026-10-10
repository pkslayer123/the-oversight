# Break-it: camps & structures R10 — 2026-10-10

Target index 6. Commit `9e0d2549` (merged locally, pending ship). Worker verdict: **broke+3 fixed**.

## Canon
No CAMPS.md exists in docs/. Per posture: read docs/CANON.md first, used docs/STORAGE.md (caches, haven stores) + in-code design comments as the camp canon. Nothing invented.

## Attacks attempted

### EXPLOIT — all held
- **E1 tent economy:** pitch/pack cycles conserve units exactly (2 pitched → 2 returned, no dup, no ghost 0-unit item). HELD.
- **E2 cross-tile abandon:** new camp wrecks old camp's tents + kills its fires; no tent duplication; buried cache on old tile untouched and diggable. HELD.
- Fire-as-resource (struck keeps burning), feedFire split-brain, makeFire stacking — HELD (prior rounds' fixes verified).

### SOFTLOCK — all held
- **S1** save/load round-trip: camp + live fire + insideTent survive JSON; validateInsideTent, atCamp, tent secrets hold. HELD.
- **S2** storm sheltered at Haven with a camp ON the Haven tile: camp breaks, haven hearth survives, no crash. HELD.
- **S5** monster breach wrecks 1 of 2 tents: camp survives (camps-8). HELD.
- Camp-death mantle pass (tent stands for successor, no phantom room). HELD.

### HONESTY — 3 kills
- **H1: cold-pit lie.** breakCamp's destroyed path promised "the fire's scattered cold" unconditionally — but a camp can outlive its flame (fire burns down while tents stand), so it mourned a cold pit. Same class as camps-7's struck-path fix, which left this branch. Fix: new `Game.killCampFires(tx,ty)` sweeps dead entries first, returns the LIVE kill count; message names the fire only when one died ("the fire was already cold" otherwise). Demonstrable via wreckTent, storm, and abandon paths.
- **H1-sibling (ledger.js playerDeath):** "the fire's gone cold" had the identical unconditional claim on the mantle-pass path — now shares killCampFires.
- **S6-sibling (alienPlayers.js apDousePlayerFire):** scanned for the nearest 'fire' CELL — map hearths, edge-blended wild fires, burned-out unswept cells all qualified — then announced "Your fire is out. Not burned down — doused." Now sweeps first and requires the player's live tracked fire; refuses otherwise so the raid falls through to trust sabotage honestly.
- H2 (struck+dead fire names no fire) and H3 (setUpCamp charges exactly 30 ticks) regressions — HELD.

### DEAD-CODE
- **D1:** all 27 camp/structure functions (pitch/pack/enter/exit/setUp/breakCamp, tent-fire set, bridges, sweepDeadFires, bury/digUpCache, killCampFires) have live call sites. HELD. System fully wired through index.html → game.js.

## Fixes (src/js/game.js +45, ledger.js +17, alienPlayers.js +12)
1. New `Game.killCampFires(tx,ty)` — sweep-then-count helper; breakCamp + wreckTent/storm/abandon paths use it.
2. ledger.js playerDeath mantle-pass message shares the helper.
3. apDousePlayerFire requires the player's live tracked fire.

## Proof
`scripts/test-break-camps-20261010.js` — 71/71 × 3 seeds AFTER; BEFORE mode shows exactly 9 FAIL (the three catches, red pre-fix). Re-verified on main tree post-merge (PASS 71/FAIL 0, SEED=20261010).
Regressions: camps2–9, camp-phantom, camp-storm-break green; storage 59/59; miser-takefirst 24/24; ontology 52/52 (ONTOLOGY.md regenerated in commit).

No [needs-eyes] — copy-honesty only, no feel/combat/UI changes.
