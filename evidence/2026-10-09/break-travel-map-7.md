# Break-it: travel & map, round 7 (2026-10-09)

Hostile-player attack on the travel & map system, round 7 (explorer
archetype). Round 6 closed post-death movement x6, prepaid-walk billing,
haven regen, monster continuity, tryNodeExit, and the dead-code sweep —
none re-attacked. This round attacked new surface: the travel world-step
pricing, wild-node detail regen, arrival spawn farming, map-knowledge
honesty, the bridge economy, and monster-per-tile singularity.

Canon: no TRAVEL.md / MAP.md / EXPLORATION.md exists in docs/ (stated, not
invented — same as round 6). Travel canon read from docs/TIME-ECONOMY.md
(node travel is free; one NPC batch turn per travel, gated) and
docs/CANON.md.

Worktree: `playtest-explorer` (registered to this run). Commit 05b3b19a.

Verdict: **BROKE + FIXED — 2 real breaks** (1 re-armed travel-spam needs
exploit defeating the 2026-10-08 gate, 1 monster-stacking class across 4
sources producing phantom monsters). Wild regen, animal spawn farming,
map gates, and the bridge economy HELD.

## BREAK 1 — EXPLOIT: the re-armed travel ping-pong (FIXED)

**Attack:** the 2026-10-08 fix gated `travelTimeStep`'s `tickNeeds` +
`spreadGossip` on "dayTicks moved at all." One `microMove` step (1 tick,
2 kcal) between travels re-arms the gate, granting a full part-scale
world-step per ~2 player ticks.

**Measured (pre-fix, seeded):** 20 ping-pongs = 20 player ticks + 40 kcal →
whole-village NPC fear 60→0, energy 20→100, hunger 10→100, gossip heard
2→22. The honest price of a part-scale needs step is 128 ticks
(`advancePart`); the exploit paid ~1/64th of that. Infinite calm, rest,
and gossip fast-forward — the exact harms the 2026-10-08 comment names.

**Fix (`game.js`, `travelTimeStep`):** the world-step is now proportional
to the clock. Each travel banks its elapsed `dayTicks`; every 128 banked
(one day-part) releases one `tickNeeds` + `spreadGossip`. Debt carries
across travels and day boundaries. **Design call (Steve-overridable):**
the first crossing ever and each new day's first crossing keep one free
step — "moving between nodes is a BIG time step" (preserves the
2026-10-08 test's documented contract). Everything after is priced.

**Test-contract update (same run, not silent):**
`scripts/test-break-travel-spam-20261008.js` — the "real travel (after
time spent) still advances needs" leg used `tickAction(32)`; a part-scale
step now costs a part (128). Updated to `tickAction(128)` with the
repricing noted in the file header. The "30 spams = exactly one
world-step" assertions pass unchanged.

**Proof:** `scripts/test-travel-r7.js` T1 — BEFORE: 20 ping-pongs zero fear
/ max energy / gossip 2→22 (break demonstrated); AFTER: fear 60→52 (the
one designed first-crossing step), energy 20→24, gossip 2→4, pacing buys
nothing more. ×4 seeds (7, 1, 42, 2026).

## BREAK 2 — PHANTOMS: monster stacking across 4 sources (FIXED)

**Attack:** the engine is singular — `monsterAt` returns the first, and
the `scholar.monster` alias, perception, and combat all target one. Four
travel-path sources could stack 2+ monsters on a tile:
1. `wanderWorldMonsters()` — no occupancy check on the wander destination.
2. `pickWorldTile()` (via `maintainWorldMonsters`) — no occupancy check.
3. `travelTo` follow re-entry — a follower chases you onto an occupied tile.
4. `checkEncounter` wanderer contact — materializes onto the player's tile
   even when claimed.

**Measured (pre-fix, seeded, deterministic):** forced wander stacked 2 on
a tile; `monsterAt` returned only the first — the second was a phantom:
unperceivable, unfightable, but still wandering and narrating ("Something
pads into the clearing"). Follower ping-pong reproduced the stack via
source 3 (bulldozer followed onto a mirrormoth tile).

**Fix (`game.js`):** occupancy guards at all four sources — wanderers
wait for open ground, maintenance spawns pick only unoccupied tiles (or
skip), followers hold at the boundary ("It stops at the boundary —
pacing, unwilling. Something else is already here. It's still out
there."), the wanderer circles off claimed ground (beat recurs).
**Design call (Steve-overridable):** deliberate same-species packs (the
hushwolf trio from `evQuietWoods`) are the exception — they ship with
their own flows and are untouched.

**Proof:** `scripts/test-travel-r7.js` T3b — BEFORE: stacking + phantom
demonstrated on all 4 sources; AFTER: no tile ever exceeds 1, follower
holds with trail kept, `pickWorldTile` returns null when every tile is
claimed. ×4 seeds.

**Open (not fixed, needs a design call):** `game.js:15752` — the
glasswing trap spawns its monster on the player's tile with no occupancy
check. Rare (trap armed + monster already present + trigger), left alone
— trap-vs-monster interaction wants Steve's call, not a silent guard.

## HELD (attacked, resisted)

- **Wild detail regen (T2):** `genDetail` caches on `tile.detail`; only
  the haven tile's detail is nulled per travel (round 6). Wild detail
  object survives the round trip by identity; simulated harvest
  depletion persists. No forage regen farm.
- **Animal arrival farming (T3a):** 30 ping-pongs → spawns bounded by
  tile-local wildlife populations (spawn decrements; `simEcology`
  regrows once per day at `endDay`, not per travel). Populations never
  negative. Thin-air farming impossible.
- **Map knowledge gates (T4):** unshared villager tiles stay out of
  `villageMapKnown`; `compareMaps` admits exactly the shared set, marked
  `'shared'` not `'visited'`; the codex MAPS renderer touches only tile
  type (glyph + name) — static check confirms no `genDetail`/`.detail`
  access, so no content leak. The rim-tap blockage card names the
  blockage type for adjacent fog tiles — held as visible-at-the-boundary
  fiction, not a leak.
- **Bridge economy (T5):** build = exactly 4 wood; double-build refused;
  storm smash refunds nothing and restores the honest pre-bridge
  blockage; rebuild costs 4 again (sink, not printer); `fallen_tree`
  clear is one-shot (+2 wood, second clear a no-op). No dupe.

## FUN (explorer, hostile)

- Delight: the follower-hold creates emergent readable monster
  territory — a chaser that won't enter claimed ground tells you
  something is there without naming it. Worth keeping.
- Drag: none new. The debt-priced travel is invisible in honest play
  (real journeys still move the world once per part) — the only losers
  are pacers.

## Regression

- test-travel-r7.js: 35/35 ×4 seeds AFTER (BEFORE mode: 35/35 breaks demonstrated)
- test-break-travel-spam-20261008.js: 5/5 (contract updated, noted in-file)
- test-travel-r6.js: 34/34; test-travel-fog4.js: 34/34;
  test-travel-village5.js: 13/13; test-movement.js: 49/49;
  test-movement-actions.js: 12/12; test-action-clock.js: 18/18;
  attack-explorer-20261009.js: 9/9 held; test-explorer-attack-20261009.js: 6/6 held;
  test-blocked-travel-feedback.js: 13/13; test-travel7-breakit-20261009.js: 57/57
- validate-ontology.js: 52/52, release permitted
- play-feel-20261007-socialite6.js: 22/23 — the one RED ("rumor travels
  over days") reproduces identically on pristine HEAD; pre-existing
  flake, not this run.
- (No jest in this repo — suites are node proof scripts; run
  sequentially, never concurrent.)

## Design calls for Steve (overridable)

1. `travelTimeStep` repriced to debt-at-part-scale; first crossing ever
   and first crossing per day keep one free world-step.
2. `test-break-travel-spam-20261008.js` contract: 32 ticks → 128 ticks
   to earn a travel world-step.
3. Followers/wanderers yield tile occupancy; deliberate same-species
   packs exempt from the one-monster-per-tile rule.
4. Open: trap-spawn stacking (`game.js:15752`) left unguarded pending a call.
