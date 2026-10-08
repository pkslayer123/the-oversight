# Break-it: monsters (target 5) — 2026-10-08

Hostile-player run against the monster system (combat monsters, not the combat
engine). Three real catches, all fixed + proven. Everything else held.

## CATCH 1 — Dead bespoke AI for 5 retired monsters (DEAD-CODE) — FIXED

**The break:** Commit 6943235 (Steve 2026-10-06) retired `hype_horn`,
`camera_swarm`, `service_mimic`, `contract_golem`, `delegate_beast` from
monsters.json — but game.js kept **456 lines** of live-looking code for them:
id predicates (`swarmIs/hornIs/smIs/cgIs`), the full camera_swarm flash-mob AI
block, the service_mimic watch/dial/hold block, the contract_golem fine-print
block, the hype_horn crowd-deflate/encourage/detonate branches, the
camera_swarm fire-scatter/windup/resolve branches, a torch-×3-vs-paper damage
rule, a +25%-fragile damage rule, `swarmCreep`/`swarmChase` helpers, and a
`hornIs` entry in the `tbFifoBreather` spec table. The predicates could never
match (no data def carries those ids) — the Alien Players lesson class,
explicitly deferred by a code comment ("another run's scope"). This run was
that scope.

**The fix:** Anchor-verified deletion of all 18 dead spans + stale-comment
updates (src/js/game.js, src/js/monsterBehaviors.js ontology note,
src/data/monsterBehaviors.json notes — byte-surgical, no JSON rewrite).
One deletion-induced bug caught by the harness before commit: the approach
section kept referencing the deleted `swarmChased` flag — fixed to drop the
dead condition.

**Sibling sweep:** every other module checked — encounters.js, alienPlayers.js,
contests.js and the rest of src/js carry no live references (only historical
comments). All 50 audio names in monsters.json resolve to real audio functions
in app.js. 8 orphaned audio *functions* remain in app.js (swarmFilm,
swarmBuild, swarmFlash, swarmShutters, swarmScatter, swarmEscalate,
hypeDeflate, hypeEncourage, hypeInflate — `serviceRush` stays live via the
warranty caller) — noted for the audio run, not deleted here.

**Proof:** `scripts/test-break-monsters-deadcode-20261008.js`
- Static: retired ids absent from monsters.json; zero string-literal
  references in code/data; zero live callers of the removed predicates/helpers.
  HEAD fails 6/6 caller checks; patched passes all.
- Differential: 28-monster × 3-state × 3-seed battery (tbMonsterTurn +
  tbDamage, 252 scenarios, 1065 messages captured) run against HEAD's game.js
  and the patched game.js — **0/252 diffs**. Deletion provably
  behavior-preserving.
- Existing suites: test-monster-behaviors-20261007.js 21/21,
  test-monster-loot.js 42/42 green.

## CATCH 2 — Wave-2 gate disagreed between spawn paths (HONESTY) — FIXED

**The break:** `monsterWavePool()` (tile-entry spawns + background
`maintainWorldMonsters`) keyed wave 2 on System arrival (day 7) with **no kill
requirement**, while `unlockedWave()` — used by `castMonster`, the loot tiers,
and the "Wave 2 talent has been released" announcement — requires day 8 + 4
wave-1 kills. Measured on HEAD: day 7, System arrived, zero kills →
tile-entry pool was 13/28 wave-2 and `spawnWaveTarget` dealt **~58% wave-2**,
while `unlockedWave()` said 1 and the System hadn't announced anything. The
"prove you can handle it" kill gate was bypassed on two of three spawn paths.

**The fix (figure-it-out-yourself call):** the kill gate is the deliberate
design, so `monsterWavePool()` now follows `unlockedWave()` — one gate
everywhere. No wave-3+ monsters exist in data, so behavior changes only for
wave 2's gate (day-7 arrival → day 8 + 4 kills). Stale comments updated.

**Proof:** `scripts/test-break-monsters-wavegate-20261008.js` — 9/9 green:
day-7/0-kill pool is wave-1-only, day-8/4-kill unlocks wave 2 on both paths,
day gate holds at 99 kills, 2000 `spawnWaveTarget` draws never deal wave 2
pre-unlock, the 60/40 newest-wave ratio is preserved post-unlock, and 500
`castMonster` calls never cast wave 2 pre-unlock.

## CATCH 3 — Sunbasker weakness lied about dusk (HONESTY) — FIXED

**The break:** monsters.json weakness promises "it won't fight in shade **or
at dusk**", and the code comment says "Shade or dusk: it flattens" — but the
engine tested `isNight()` (dayPart 3 only). At dusk (dayPart 2) the sunbasker
kept basking, charging, and biting. Copy said dusk; engine said night.

**The fix:** dusk (dayPart 2) flattens it too, with its own honest line ("The
light is dying and the fight dies with it…"). Unflatten path verified correct
(dawn/midday re-bask). Sibling sweep: the other three "dusk" mentions in
monsters.json (nightlight_catfish, memory_projector, nevermore) are flavor
text, not mechanical promises — clean.

**Proof:** `scripts/test-break-monsters-sunbasker-20261008.js` — HEAD:
dusk sunbasker keeps basking (lie documented); patched: dusk flattens
(phase=flat, charge=0), night still flattens, midday still basks.

## Attacked and HELD (solid notes)

- **Exploit — monster farming:** kill rewards are one carcass per fight
  (tbEnd, first monster fighter only) + low-chance loot rolls; per-segment
  corpses yield trophies (0 kcal), not meat. Ducks' 14 segments = 14 wave
  kills, but each is a real HP-bearing fighter — legitimate effort, not an
  exploit. Union rep's picket-line summon is once-per-fight (`urSummoned`).
  Fleeing/routing grants no meat, no trophy, no XP — and the fled-strike
  guard blocks parting hits.
- **Exploit — infinite spawns:** `worldMonsterCap` (3/5/8) bounds background
  spawns; tile-entry pity is capped at 60%; wave ratios preserved.
- **Softlock — union rep walkout:** the old permanent-untargetable stalemate
  was already fixed (killing allies collapses the walkout — verified in code).
- **Softlock — moderator shadowban:** mute only ever covers strike/move;
  WAIT is unmutable and flips the mute ("silence is a verb the algorithm
  cannot moderate") — always escapable. Flee-by-barrier-exit is never blocked
  by any monster.
- **Softlock — belltoad chorus:** `_pendingPack` strictly decrements; the
  fight always terminates. Turtle bunker decrements; drone recalc bounded at 1.
- **Honesty — hushwolf:** no grid rush indicator in code (per Steve's kill);
  the silence telegraph is implemented (Quiet Woods event + encounter
  messaging); rush moves-and-hits with no telegraph, snarl fires only after
  first contact. Data telegraph text matches.
- **Honesty — warranty caller:** weaknesses match code exactly (2+ tile move
  drops the call; pain forces redial; ring always first).
- **Honesty — lockpick theft:** escaping with your item is narrated
  explicitly ("it's gone. so is your stuff.") — theft-allowed by design, not
  a silent loss.
- **Dead-code — full sweep:** all 28 data monsters have behavior-table
  entries, encounter blocks, and reachable spawn paths; every monster js
  module is loaded in index.html in order; zero retired-id string literals
  remain in code or data.

## Notes for other runs
- app.js has 8 orphaned audio functions from the retired monsters
  (swarmFilm, swarmBuild, swarmFlash, swarmShutters, swarmScatter,
  swarmEscalate, hypeDeflate, hypeEncourage, hypeInflate) — audio run's scope.
- `scripts/test-encounters-20261007.js` is broken pre-existing (calls
  `G.encPatternStage`, which exists nowhere in the codebase, HEAD included).
- `monsterWaveAvailable()` has zero callers — harmless, left alone.

## Files changed
- src/js/game.js (−456 dead lines; wave-gate unification; sunbasker dusk fix;
  swarmChased dangling-ref fix)
- src/js/monsterBehaviors.js (ontology note updated)
- src/data/monsterBehaviors.json (2 notes updated, byte-surgical)
- scripts/break-monsters-harness.js (new shared harness)
- scripts/test-break-monsters-deadcode-20261008.js (new)
- scripts/test-break-monsters-wavegate-20261008.js (new)
- scripts/test-break-monsters-sunbasker-20261008.js (new)

## Landing status (2026-10-08, end of run)
- COMMITTED (f29b09a): wave-gate unification, sunbasker dusk honesty,
  comment updates, proof tests, this evidence file. All proof tests green.
- PENDING — dead-code purge (Catch 1): the 460-line deletion in src/js/game.js
  is staged in the worktree as UNCOMMITTED changes. safe-commit.sh REFUSED it
  (492-line deletion guard = stale-revert signature). This is the documented
  intentional-deletion case, verified by a 252-scenario differential vs HEAD
  (0 diffs) — but per run rules it needs coordinator approval for
  --force-delete. The full end-state is in the worktree, tests green against
  it. Do NOT let the reaper or another run touch this tree until the purge
  decision is made.
