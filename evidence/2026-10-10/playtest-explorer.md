# Playtest explorer — adversarial run 2026-10-10

Archetype: EXPLORER (hostile). Attacked travel/map/fog/teleport/examine as a
player trying to break the game. Canon read first: docs/CANON.md,
docs/TIME-ECONOMY.md, docs/PERCEPTION.md. Worktree:
~/workspace/worktrees/playtest-explorer.

## Prior art respected (not re-litigated)
travel r6/r7/r8 armor, explorer r2/r3 guards, today's dowsing/echo_location
fog-honesty fix, hive-sight display-only overlay, diagonal blockage armor —
all held under probe. Contests verified to NOT relocate the player (no
map.px writes in contests.js/contestEngine.js) — the "grab" plays in place,
so contest-teleport state corruption is a non-issue by construction.

## KILLS (3)

### W1 — EXPLOIT: committed walks cost 5x manual steps (same squares)
`microMove` charges 2 kcal/step (Steve 2026-10-05: "not free, not punishing");
`walkStepKcal()` charged 10/square for the committed walk. Identical
fictional weight (1 square, 1 tick), two prices. A hostile player never taps
"Walk here": 8 squares = 16 kcal by hand vs 80 via the button. The
accessibility tap-to-move path was a noob trap. (break-it travel r6 saw the
gap — "the old '2 kcal' assertion predates the prepaid model" — and walked
past it.)
- Proof: `scripts/test-explorer-walkprice-20261010.js` — BEFORE documents the
  5x gap (8/8), AFTER: one price both verbs (9/9) x3 seeds (20261010, 777,
  424242). Also asserts the app.js fallback matches.
- Fix: `walkStepKcal()` base 10 -> 2; `microMove` now levies
  `this.walkStepKcal()` (single formula, both verbs); app.js fallback
  `path.length * 10` -> `* 2`; TIME-ECONOMY.md matrix corrected (microMove
  effort 0 -> 2, movePath 10 -> 2); stale comment "Strolling is time-only —
  no effort cost" fixed; stale assertions in test-movement.js,
  test-movement-actions.js, test-travel-fog4.js updated.
- Design call (Steve can overrule): unified at 2, Steve's explicit
  "not punishing" number — raising manual steps to 10 would make basic
  movement miserable and contradict the partner bugfix.

### E1 — HONESTY/DESIGN: the plant-examine verb was orphaned (dead on arrival)
Steve 2026-10-06: examining a plant should yield vague descriptions and an
observation memory — the foundation of the recognition beat. `examine.js`
built the whole system, but its only caller is `game.js`'s `examineCell`,
which `carexplore.js` has shadowed since 2026-10-04 (later in index.html).
The live "Examine" on plants/bushes ran carexplore's generic flavor branch:
no observation, no vague description, no `plantVisualDepth` 1 — the feature
never went live. Observations were reachable only by foraging.
- Proof: `scripts/test-explorer-examine-plant-20261010.js` — BEFORE documents
  the orphan (no observation, depth stays 0, no recognition beat possible;
  7/7), AFTER: observation recorded via the live verb, depth 1, vague
  description narrated with no true-name leak, examine->taught->recognition
  beat chain fires, farm cap still holds (10/10) x3 seeds.
- Fix: the live `Game.examineCell` bush/plant branch now resolves the
  species (`Ex.resolveCellSpecies`), records `Ex.observePlant(pid,
  'examine')`, and says the name-scrubbed `Ex.examineDescription` (skipped
  when known). Same guards, same 2-tick charge, same farm cap.

### S1 — SOFTLOCK: travel entry could strand the player in a pocket
`findWalkableEntry` returned the nearest walkable cell — even a pocket
(walkable, zero walkable neighbors: a dirt cell ringed by water). Arrival
there = zero grid moves. Fix: prefer the nearest walkable cell WITH a
walkable neighbor; fall back to nearest-walkable only when the whole tile
is pockets. Monster follow-through entries use the same helper.
- Proof: `scripts/test-explorer-entry-strand-20261010.js` — BEFORE strands
  (6/6), AFTER: entry has a way out, normal case unchanged, all-pocket
  fallback intact (6/6) x3 seeds.

## HELD (attacked, no break)
- examineCell/_cellInteract/beginPathWalk/travelTo/pathStep mid-fight +
  post-death guards all hold (r3 attack suite ALL GREEN).
- Perception danger line: shows the strange descriptor for unknown monsters
  — legitimately visible (the monster is adjacent on the grid), consistent
  with the monster-knowledge law; PERCEPTION.md's bare "Something moves
  nearby." is terse but the behavior is the designed one.
- Swim `force` bypass of far-tile blockFrom: unreachable via the honest UI
  (travelBlockage surfaces blockFrom first; swim is only offered for the
  creek block after the tree is cleared). Engine armor only.
- Node-sequence: no gated nodes to skip; blockages always have a solution
  (cut/clear/bridge/swim/go around) and foraging bootstraps 0-kcal clears.
- `travelTargets` d<=3 range: only the honest UI's adjacent exits and debug
  scenarios call travelTo — no long-range teleport for players.

## Pre-existing failures (verified identical on pristine HEAD — NOT mine)
- `test-travel-breakit.js`: tbBarrierExit regression expects the retired
  coin-flip flee (fightOver=true); the chase system (Steve 2026-10-09) keeps
  pursuit going. Test asserts the retired contract — needs a chase-aware
  update by whoever owns it.
- `test-perceive.js`: "known monster named" + "stash hint lists contents"
  fail on HEAD too.
- `test-travel-break2-doublecharge-20261008.js`: asserts the retired prepaid
  model (r6 removed prepay); fails on HEAD too.

## Regressions run (all green after fix)
test-movement (49), test-movement-actions (12), test-travel-r6 (34),
test-travel-r7 (35), test-travel-r8 (25), test-travel-fog4 (34),
test-explorer-reveal-20261010 (18), test-break-knowledge-r2-20261010 (40),
attack-explorer-r3-20261009 (ALL GREEN), test-explorer-adv-travel-20261008
(17), test-continuous-travel (21), test-blocked-travel-feedback (13),
test-break-knowledge-r2 (18/18), ontology 52/52.

## FUN judgment
- Delight: the examine verb finally does what Steve asked in June — look
  closely, come away with a real (vague) description, and feel it CLICK
  later when someone names it. The pocket-proof entry is invisible when it
  works, which is the point.
- Drag: walking the world is now uniformly cheap (2/square) — good — but
  the "Walk here" button's whole value was convenience; with price parity
  there's no reason not to use it, which is exactly right.

## Files changed
- src/js/game.js (walkStepKcal 10->2, microMove single formula, findWalkableEntry strand-proof, ontology rules)
- src/js/carexplore.js (examine observation wiring + ontology rule)
- src/js/app.js (fallback price 2)
- docs/TIME-ECONOMY.md (matrix honesty)
- docs/ONTOLOGY.md (regenerated by validator)
- scripts/test-explorer-walkprice-20261010.js (new)
- scripts/test-explorer-examine-plant-20261010.js (new)
- scripts/test-explorer-entry-strand-20261010.js (new)
- scripts/test-movement.js, test-movement-actions.js, test-travel-fog4.js (stale 10/square assertions updated)
