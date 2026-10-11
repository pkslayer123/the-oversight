# Break-it: travel & map, round 11 (2026-10-10)

Hostile-player attack on travel & map, round 11. Rounds 1–10 are closed and
were NOT re-attacked (fog leaks r4, examine spam r5, corpse-walks r6, travel
ping-pong r7, glasswing stacking r8, diagonal blockage + hive_mind honesty
morning run, MoveAnim queue exploits + long-walk truncation r10). This round
attacked the remaining fresh surface: the `over` flag's integrity across
travel/map/contest UI gates, travel during forbidden states, world-step
farming, village catch-up honesty, node-exit softlocks, and a full dead-code
re-audit.

Canon: **no dedicated travel/map canon doc exists** (stated, not invented —
same as every prior round). Travel canon from docs/TIME-ECONOMY.md (node
travel free; travelTimeStep anti-spam) + docs/CANON.md ("If you don't know,
it doesn't show").

Worktree: `break-travel` (registered; this run's r11 work).

Verdict: **BROKE + FIXED — 1 real break** (a 14-site phantom-flag class:
dead contest/show eligibility + dead UI gates). Everything else held.

## BREAK — DEAD-CODE/HONESTY: the `state.over` phantom flag (FIXED)

**Attack:** `Game.state.over` is READ in 14 places but NOTHING in the
codebase ever writes it. The live flag is `Game.over` (surfaced as
`Game.status().over`). Every one of those 14 guards was dead:

- `src/js/contests.js` (6): `contestEligible()` listed a dead run's scholar
  as contest-eligible; `showEligible()` (TV pulls) likewise; the ratings
  summons castability gate and `fireRatingsSummons`' direct-call guard let a
  summons proceed on a dead run; the ineligibility *reason* line could never
  name death (`this.state.over || health<=0 ? 'dead…'` always took the
  health branch).
- `src/js/app.js` (5): `lowerMenuHTML`, `nearbyActionItems` (owns the
  "Clear the way" travel-blockage action), `perceiveHTML`, `statsHTML`,
  `compassHTML` gates never fired.
- `src/js/game.js` (2): the phoenix post-`playerDeath` guards never fired.
- `src/js/perceive.js` (1): `perceptionHints()` gate never fired.

The 2026-10-08 persistence fix ("split-brain zombie") already documented
that `state.over` was "a flag nothing else ever sets" — but only fixed the
*write* site in contests.js, never the 14 *read* sites.

**Measured (seeded node proof, full engine):** BEFORE — with
`Game.over=true` (dead run), scholar contest-eligible AND show-eligible,
`fireRatingsSummons()` returned a summons object instead of null, and a
static sweep found all 14 phantom reads. AFTER — scholar ineligible with
reason "dead — the mantle has passed", summons returns null and says why
aloud, zero phantom reads remain.

**Blast radius note:** in live play the expedition screens gate on
`st.over` (= `Game.status().over` = the live flag) first, so the dead UI
gates were harmless redundancy — *except* for pre-2026-10-08 split-brain
saves, which can persist `state.over=true`: on load (`load()` resets only
`this.over`), the phantom-true flag would have hidden nearby actions,
perception, stats, and the compass while the game played on. The fix closes
that too.

**Fix:** read the live flag — `st.over`/`Game.over` in app.js, `this.over`
in contests.js/game.js/perceive.js. No behavior change in live play (the
guards were dead); dead runs are now honestly gated.

**Sibling sweep (same "reads a flag nothing writes" class):** swept
`won`/`dead`/`ended`/`finished`/`started`/`gameOver`/`isOver`/`alive` across
src/js — all clean (`won` is properly written; the rest have no readers).
`over` was the only phantom.

**Proof:** `scripts/test-travel-r11.js` section [T] — BEFORE: 6 red legs;
AFTER: green ×3 seeds (7, 42, 2026).

## HELD — probed, not broken

- **E1 — travelTimeStep ping-pong (r7 mechanism re-verified):** 30 free hops
  with no player clock time granted ~no world-steps (first-crossing beat
  only); a real 128-tick day-part then released steps proportionally.
  The debt mechanism holds.
- **E2/E3/E4 — forbidden states:** `travelTo`/`tryNodeExit` refuse null
  mid-combat and when dead; `beginPathWalk`/`pathStep` likewise; the
  `force` (swim/debug) bypass does NOT skip the combat/death guards (guard
  order: over/combat first — verified with a blockage + force + combat).
- **E5 — village catch-up:** walking within 2 tiles generates the village
  and runs the catch-up sim to today *before* any arrival text or
  interaction; villages never approached stay ungenerated (no leak).
- **S1 — `findWalkableEntry`:** in-bounds for all 81 tiles (the "unreachable"
  fallback never fires out of bounds).
- **S2 — committed walks:** `beginPathWalk`/`pathStep` refuse mid-combat
  (no desync class).
- **S3 — node surrounded by blockages:** every `tryNodeExit` returns its
  blockage, nothing moves the player, no exception — the "Clear the way"
  action (nearbyActionItems) is the way out, and its gate now reads the
  live flag.
- **H1 — blocked travel stays blocked:** `travelTo` returns the blockage
  object, position unchanged, says why aloud. No bypass without `force`.
- **H2 — intermediate blockages:** a d=2 hop over a guarded middle tile is
  refused, unmoved, with the reason said (path_blockages_hold, r10-era).
- **H3 — travelTargets honesty:** every offered target is d=1..3 and
  revealed-or-adjacent — no phantom targets.
- **H4 — fog:** 79 tiles unseen after spawn; unshared villager seed tiles
  stay out of the codex MAPS gate until `compareMaps` (the social gate)
  earns them.
- **D — dead code:** all 7 travel/map modules loaded from index.html; all
  40 travel/map `Game.*` entry points defined AND called (only
  `debugToWildNode` is call-free by design — it's the debug test hook).

## Regression

- `scripts/test-travel-r11.js`: BEFORE 6 red / AFTER 125–127 green × seeds
  7, 42, 2026.
- `test-travel-r10.js` 8/8, `test-travel-r8.js` 25/25,
  `test-travel-break-20261010.js` 27/27,
  `test-break-contests-r13-20261010.js` 23/23,
  `test-break-contests-r12-20261010.js` 34/34,
  `test-break-contests-20261010.js` 50/50,
  `test-break-persistence9-20261010.js` 23/23 (exercises playerDeath).
- `test-travel-fog4.js`: 32/34 — the 2 failures are PRE-EXISTING (fail
  identically on the pristine tree; depletion-staleness assertions, not
  this change).
- `node --check` clean on app.js, contests.js, game.js, perceive.js.
- Ontology validator: 57/57, release permitted (no Game functions
  added/removed/renamed).

## Files

- `src/js/app.js` — 5 phantom `Game.state.over` reads → live `st.over`/`Game.over`.
- `src/js/contests.js` — 6 phantom `this.state.over` reads → live `this.over`.
- `src/js/game.js` — 2 phoenix phantom guards → live `this.over`.
- `src/js/perceive.js` — 1 phantom read → live `this.over`.
- `scripts/test-travel-r11.js` — proof (BEFORE red / AFTER green ×3 seeds).
- `evidence/2026-10-10/break-travel-map-11.md` — this file.

No [needs-eyes]: no player-facing behavior change in live play (the guards
were dead); dead-run gating is now honest.
