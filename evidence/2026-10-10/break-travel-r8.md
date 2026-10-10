# Break-it: travel & map, round 8 (2026-10-10)

Hostile-player attack on travel & map, round 8. Rounds 1–7 and the morning
run (diagonal blockage armor, hive_mind map honesty, echo/dowsing fog
honesty) are closed — none re-attacked. This round attacked the remaining
surface named in the brief: fog bypasses, blocked-travel bypasses, honesty
of travel copy vs engine, and dead code.

Canon: no TRAVEL.md / MAP.md / EXPLORATION.md exists in docs/ (stated, not
invented — same as every prior round). Travel canon from docs/TIME-ECONOMY.md
(node travel free; one NPC batch turn per travel, gated) + docs/CANON.md
("If you don't know, it doesn't show"; havens the only unbreakable human
structures; monsters were sent to fight).

Worktree: `break-travel`.

Verdict: **BROKE + FIXED — 3 real breaks** (1 exploit with 4 stacked harms,
2 honesty). Everything else held.

## BREAK 1 — EXPLOIT: glasswing trap resolve stacked onto an occupied tile (FIXED)

**Attack (the open round-7 item — confirmed real, not a design call):** the
trap ARMS by removing the glasswing from the world (`monsterTurn`, "it
VANISHES"), so the tile reads empty while the shadow circles. Another
monster can claim the tile in the meantime (checkEncounter spawn,
wanderer). When the dive resolves, `gwTrapTick` called `spawnWorldMonster`
with no occupancy check. Seeded probe (bulldozer at grid 1,1, wounded to
7 HP; trap resolves at 4,4):

1. **Free silent kill:** `startCombat` ends with
   `removeWorldMonster(this.playerMonster())` — `monsterAt` returns the
   FIRST monster, so it deleted the bulldozer, the beast never fought. A
   wounded monster you were stalking vanished with no narration, no loot.
2. **Grounded-window lie:** the fighter is built from `s.monster` (the
   bulldozer) — `gwGrounded` read 0, `beamPhase` read 'dive' (stalk).
   The dive narration promised "It's GROUNDED" and the GROUNDED WINDOW
   PARITY comment calls the 3-tick window load-bearing. Silently 0.
3. **Position disconnect:** the narration said "SLAMS into you" (dist 0)
   but the fighter spawned at the bulldozer's cell (1,1), far from the
   player at (4,4).
4. **Phantom second fight:** the glasswing world-monster survived on the
   tile after the fight — one trap, two glasswing encounters.

**Fix (`game.js`, `gwTrapTick`):** the dive is the aggressor and keeps the
tile — the impact drives the prior monster to an adjacent in-bounds,
non-safe, unoccupied tile (wounds kept, still out there), narrated with
the `monsterNoun` something-guard. Nowhere to run (all 8 neighbors
claimed/safe — near-impossible) falls back to removal with honest
"scattered into the dark" copy. **Design call (Steve-overridable):** the
dive wins the tile rather than holding off — the slam already happened in
the narration.

**Sibling sweep (same stacking class):** all other `spawnWorldMonster`
call sites audited — `maintainWorldMonsters` (pickWorldTile guards, r7),
`checkEncounter` spawn (`!monsterAt` guard), wanderer contact (r7
circle-off), fled-monster recovery (`!monsterAt` guard), travelTo follower
re-entry (r7 hold-at-boundary) all hold. The hushwolf trio (`evQuietWoods`)
is the deliberate same-species pack the r7 design call exempts — untouched.

**Proof:** `scripts/test-travel-r8.js` T1 — BEFORE: stack of 2 at spawn,
bulldozer deleted, fighter gwGrounded=0/phase=dive at (1,1), phantom
glasswing left (break demonstrated); AFTER: drive-off runs first (spawn
sees n=1), bulldozer alive on an adjacent tile at 7 HP, dive spawns with
gwGrounded=3/beamPhase=grounded at (4,4), fighter holds the slam site with
the window intact after the opening tick (3→2 is the designed burn — the
speed-5 darter opens per the 2026-10-04 opening-turns rule), drive-off
narrated. ×3 seeds (7, 1, 42) AFTER; ×2 seeds BEFORE.

## BREAK 2 — HONESTY: tryNodeExit reported moved:true for a wiped run (FIXED)

**Attack:** `travelTo` can kill you on the way in (your own pit trap) and
returns `undefined`, not `null`. `tryNodeExit` computed
`moved: res !== null` → `true`. With no successors the mantle has nowhere
to go — `playerDeath` sets `over=true`, wipes the run — and the d-pad layer
reported `moved:true` for a run that no longer exists (`MoveAnim.clearHold`
ran for the dead).

**Fix (`game.js`, `tryNodeExit`):** `moved: res !== null && !this.over`.
The normal mantle-passing case still reports `moved:true` — the crossing
did happen; the bearer died after it, and the successor wakes at Haven
with sane coords (verified in T3a: map=pinned, grid 4,4, insideHaven).

**Proof:** T3b — BEFORE: over=true, moved=true (break); AFTER:
over=true, moved=false. T3a (mantle case): moved=true, successor sane.

## BREAK 3 — HONESTY: swim handler charged the successor for a dead bearer's swim (FIXED)

**Attack:** the blockage-card swim path (`app.js`) only null-checked
`travelTo(x, y, true)`. Pit death on the far bank returns undefined and
passes the mantle — the NEW bearer wakes at Haven having swum nothing, but
the old code charged them 20 kcal and said "You swim across, cold and
grinning." Wrong person, wrong crossing.

**Fix (`app.js`, swim branch):** snapshot `Game.villagerId` before the
crossing; refuse the charge and the line when the bearer changed
(`Game.villagerId !== bearerBefore`) or the run ended (`Game.over`).
Phoenix cheat-death keeps the same bearer on the arrival tile — the
crossing is real, the toll stands; only the grin is tonally loud, noted
below rather than "fixed" into a new lie.

**Proof:** T4 source assertion (app.js is DOM-only, excluded from the node
harness per convention) + T3a engine proof of the mantle behavior it
guards; T3a also asserts the successor's kcal is exactly the 1500 mantle
grant — no phantom toll.

## HELD (attacked, resisted)

- **scholar.monster resync (T2):** the ontology claim is wired, not just
  commented — `syncMonsterAlias()` runs post-move in `travelTo` (and in
  spawn/remove). Dynamic test: poisoned the alias with a stale phantom,
  traveled, alias matched the arrival tile's monster. Held.
- **force=true bypass (T6):** only two call sites in the codebase —
  the swim branch (UI offers it solely for creek/washed_out + swimmer
  ability; never smuggles past a fallen tree) and debug-scenarios
  (debug-only). Engine-level direct calls are outside the threat model,
  same as every other direct call. Held.
- **Strand between nodes (T7):** the only `map.px/py` writes outside
  `travelTo` are the village PINs (valid coords); `returnToVillage` PIN
  leaves grid coords sane; the player moves fine after. No phantom-tile
  state exists — grid coords are always 0..8, node coords always 0..8.
  Held.
- **Fog:** `travelTargets` offers adjacent fog tiles as `unknown` (no
  content); rim-tap copy names 'unexplored ground' for unrevealed tiles;
  `findWalkableEntry` is called only inside `travelTo` post-arrival (no
  UI leak of destination layout); `checkVillageProximity` announces
  within-2 villages as smoke-on-the-horizon (boundary fiction, held);
  `examineCell` is grid-local and combat/death-guarded via the
  carexplore override. Held.
- **Dead code (T5):** all 29 travel/map functions defined and called,
  including new code (`hiveSight`, `syncMonsterAlias`,
  `glasswingTrapCells`, `gwTrapTick`); `debugToWildNode`'s live callers
  are the proof scripts (test hook, as labeled). No dead module. Held.

## FUN (hostile)

- Delight: the drive-off creates a readable beat — the thing that was
  stalking you bolts from bigger wings and is *still out there*, wounded,
  on the next tile over. The dive feels like weather, not a spawn.
- Drag: none. Honest play never sees the drive-off unless it was already
  in the stacked state.

## Regression

- test-travel-r8.js: 25/25 ×3 seeds AFTER (BEFORE: 24/24 breaks demonstrated)
- test-travel-r7.js: 35/35; test-break-travel-spam-20261008.js: 5/5;
  test-travel-r6.js: 34/34; test-travel-fog4.js: 34/34;
  test-travel-village5.js: 13/13; test-movement.js: 49/49;
  test-movement-actions.js: 12/12; test-blocked-travel-feedback.js: 12/12;
  test-travel-break-20261010.js: 27/27; test-explorer-reveal-20261010.js: 18/18
- validate-ontology.js: 52/52, release permitted
- (Node proof scripts, run sequentially, never concurrent.)

## Design calls for Steve (overridable)

1. Glasswing dive drives off the prior tile-holder (keeps wounds, adjacent
   tile, narrated) rather than holding off — the slam already happened.
2. Phoenix cheat-death on a pit mid-swim keeps the toll: the crossing is
   real; only the "cold and grinning" line is tonally loud after a burn.
   Left as-is, flagged here.

## Files changed

- src/js/game.js — gwTrapTick drive-off + @ontology rule; tryNodeExit moved honesty
- src/js/app.js — swim branch bearer/over honesty
- scripts/test-travel-r8.js — 25-check proof (new)
- evidence/2026-10-10/break-travel-r8.md — this file
