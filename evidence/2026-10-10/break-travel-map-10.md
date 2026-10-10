# Break-it: travel & map, round 10 (2026-10-10)

Hostile-player attack on travel & map, round 10. Rounds 1–9 and the morning
run are closed and were NOT re-attacked (verified closed: fog leaks r4,
examine spam r5, corpse-walks r6, travel ping-pong r7, glasswing stacking r8,
diagonal blockage + hive_mind honesty morning run). This round attacked the
remaining fresh surface named in the brief: MoveAnim queue vs state
transitions, long-walk integrity, mid-fight barrier-crossing encounter
honesty, dead code, swim/force/teleport reachability.

Canon: **no dedicated travel/map canon doc exists** (stated, not invented —
same as every prior round). Travel canon from docs/TIME-ECONOMY.md (node
travel free; travelTimeStep anti-spam) + docs/CANON.md ("If you don't know,
it doesn't show"; swimmer ability text "Cross water freely. Rivers are roads
to you." from src/data/abilities.json).

Worktree: `break-travel10`.

Verdict: **BROKE + FIXED — 3 real breaks** (2 phantom-walk exploits, 1
walk-truncation honesty/exploit). Everything else held.

## BREAK 1 — EXPLOIT: phantom walk after Continue (FIXED)

**Attack:** `MoveAnim`'s step queue is in-memory UI state, but `Game.load`
swaps the world underneath it — the title screen's Continue handler
(`app.js`) never purged the animator. Queue a committed walk (or hold-walk
steps), hit Continue mid-walk in the same session: the queued steps keep
draining and execute against the freshly loaded state. The reloaded bearer
walks squares they never authorized post-load — each executed step is real
game logic (kcal charged, 1 tick, monsterTurn/animalTurn/villagerTurn). Worse:
the queue is save-agnostic, so Continuing a DIFFERENT expedition mid-walk
walks the other save's bearer on your old queued steps.

**Measured (seeded node proof, real move-anim.js + real save/load):**
BEFORE — 6 steps queued, ~5 land pre-load, Continue → 1 more executes
post-load (phantom). AFTER — 0 post-load.

**Fix (`app.js`, Continue handler):** `S.MoveAnim.stopAll()` after a
successful `Game.load`, before `expeditionScreen()`. A load is a fresh
session for the feet.

**Sibling sweep (same "queue survives state transition" class):**
- `playerDeath` → BREAK 2 (fixed, below).
- `Game.newGame` (onboarding "Begin") — fresh flow, no queue can exist. Held.
- `wipe()` paths (village scattering, won-run wipe, death fallbacks) — all
  set `over=true` first; `pathStep`/`microMove` refuse on `over` and the
  executor purges the walk. Held.
- Combat/contest starting mid-walk — `inCombat()` guards refuse in
  `pathStep`/`beginPathWalk`/`walkPathAnimated`; the executor purges. Held.
- No other module touches MoveAnim (grep: only app.js + move-anim.js +
  the new ledger.js guard).

**Proof:** `scripts/test-travel-r10.js` T1 — BEFORE: post-load executions > 0
(red leg passes); AFTER: source check (handler contains stopAll) + 0
post-load executions. ×3 seeds (7, 42, 2026).

## BREAK 2 — EXPLOIT: death mid-walk walks the new bearer (FIXED)

**Attack:** `playerDeath` passes the mantle — `over` stays false — but never
touched the animator. A walk queued when the bearer dies keeps draining:
the queued path steps execute for the SUCCESSOR on the dead player's intent,
charging the new body's kcal and ticking the clock. (The r6 "corpse walks"
fix guarded the engine verbs, but the UI queue sits above them.)

**Measured:** BEFORE — death mid-queue (bearer `kane_park` → `sofia_chen`),
steps keep executing post-death. AFTER — 0.

**Fix (`ledger.js`, `playerDeath` top):** guarded
`Scattering.MoveAnim.stopAll()` — first line, so even a later throw can't
leave the stale walk behind. Guarded for node harnesses (animator absent).
Death ends the walk, full stop — the successor wakes in the hall with their
own intent, not the corpse's queued footsteps.

**Proof:** `scripts/test-travel-r10.js` T2 — BEFORE: post-death executions > 0
with bearer changed (red); AFTER: source check + 0 executions. ×3 seeds.

## BREAK 3 — HONESTY/EXPLOIT: long committed walks silently truncate (FIXED)

**Attack:** `walkPathAnimated` bulk-enqueued the whole path, but MoveAnim
caps its queue at `maxQueue` (10). Paths longer than 11 steps (reachable:
winding 9×9 paths around water/trees) dropped every step past 11 — the
"Walk here (N kcal)" label quoted the FULL walk, the player stopped early,
and `onDone(false)` fired while steps were still animating (so "walk closer"
popups never reopened). The player paid the quoted price's expectation and
got 11 squares.

**Measured:** 14-step path through the SHIPPED function + real MoveAnim:
BEFORE — 11 land, `onDone(false)`. AFTER — 14 land, `onDone(true)`.

**Fix (`app.js`, `walkPathAnimated` rewritten):** chain one step at a time —
each step's resolution enqueues the next, resolving dx/dy against the
current position. The queue never fills, the full path lands, and any
refusal (combat, death, blocked) or purge stops the chain cleanly. A
`walkToken` supersede guard retires stale chains when a newer walk starts
(the old walk's `onDone(false)` fires honestly at supersede).

**Proof:** `scripts/test-travel-r10.js` T3 — extracts the SHIPPED
`walkPathAnimated` source and runs it against the real MoveAnim. BEFORE
(HEAD source): 11/14, `onDone(false)` (red). AFTER: 14/14, `onDone(true)`.
×3 seeds.

## HELD — probed, not broken

- **T4 — checkEncounter during tbBarrierExit:** confirmed it runs mid-fight
  (worldTick + encounter roll + "Something moves out there" narration while
  the chase continues; 2 world spawns observed in one forced-roll probe —
  one from maintainWorldMonsters on a non-player tile, one from the
  encounter roll on the arrival tile). HELD: the barrier exit IS a node
  entry, and every node entry rolls — suppressing it would make fleeing
  safer than walking, which contradicts "monsters were sent to fight." No
  stacking (one-monster-per-tile respected across the two spawn paths).
  The mid-chase narration is busy but honest about the world state.
- **T5 — dead code:** all 26 travel/map functions on Game defined AND
  called. None dead.
- **T6 — swim/force/teleports:**
  - Swimmer + creek crosses FREE via d-pad/rim — this is the design, not a
    bypass: the swimmer ability reads "Cross water freely. Rivers are roads
    to you." (40 kcal/day metabolic). The card's "Swim across (20 kcal)"
    button is reachable exactly where it's priced: washed_out blockages
    (swimming the gap is work). No contradiction.
  - `travelTo(x, y, force=true)` callers: swim button (creek/washed_out +
    swimmer only) and debug-scenarios. The inCombat guard in travelTo
    applies regardless of force. Held.
  - No contest/show/exile teleports bypass travel guards — the only
    position writes are newGame setup, day-7 setup, debug scenarios, and
    the returnToVillage PIN (no-op sync after walking onto the haven tile).
  - Dawn home-return teleports the bearer to Haven — designed (villageLost
    returns early; exiles get the estranged beat via returnToVillage).
- **Fog render paths re-verified:** renderMap visited/shared/hive branches,
  overlay taps, minimap taps, villageCard fog gate, depletion/worn-path
  gating, tile-scenes `seen` gating, perceive.js (adjacent-cell only, by
  design), alien players (current-node grid only, nothing on the world map).
  No leaks found.

## Regression

- `scripts/test-travel-r10.js`: BEFORE red (6/6 break-legs) / AFTER green
  8/8 × seeds 7, 42, 2026.
- `scripts/test-travel-r8.js`: 25/25. `scripts/test-travel-break-20261010.js`:
  27/27. `scripts/test-break-persistence9-20261010.js` (exercises playerDeath):
  23/23. `scripts/test-travel-fog4.js`: 34/34.
- `node --check` on app.js, ledger.js, test script: clean.
- Ontology validator: 52/52, release permitted (no Game functions
  added/removed/renamed — walkToken is app.js module state).

## Files

- `src/js/app.js` — Continue handler walk purge; walkPathAnimated chained rewrite + walkToken.
- `src/js/ledger.js` — playerDeath stops the animator (guarded).
- `scripts/test-travel-r10.js` — proof (BEFORE red / AFTER green ×3 seeds).
- `evidence/2026-10-10/break-travel-map-10.md` — this file.

Commit carries [needs-eyes]: long tap-to-move walks now complete instead of
truncating at 11 — movement feel change Steve should playtest.
