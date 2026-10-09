# Break-it: travel & map, round 3 (2026-10-08)

Hostile-player attack on the travel & map system, round 3. Rounds 1–2 closed
travel-spam, animal-continuity, stale-clamps, double-charge, barrier-exit lies,
pit-death, and the bridge label. This round went after the remaining surface:
combat-vs-travel guards, the party.js travelTo wrapper, swim-button reachability,
mid-walk desync, save/load of travel state, villager-map growth, and dead code.

Verdict: **BROKE + FIXED — 2 real breaks** (1 combat-escape exploit at engine
level + sibling sweep of the same guard class, 1 betrayal-roll farm via the
party.js wrapper firing side effects on refused travel). Plus 2 dead variables
removed. Everything else held.

## BREAK 1 — EXPLOIT: travelTo mid-combat teleports with the fight live (FIXED)

**Attack:** `Game.travelTo()` never checked `inCombat()`. `tryNodeExit` (dpad)
and `walkPathAnimated` both refuse mid-fight, and the grid-tap handler routes
taps to `tbPlayerMove` while `tbfight` is live — but the engine itself had no
guard. Calling `Game.travelTo(adjacent)` mid-fight moved `map.px/py` while
`tbfight` stayed live: a free flee with no 50% barrier roll, no consequences,
and a desynced fight whose fighters reference a node you left. Any console or
future UI caller bypasses the tap-handler guard.

**Measured (pre-fix, seeded):** `travelTo` returned `undefined`, map moved
4,4→5,4, `tbfight` still active. Same latent class in `microMove`,
`beginPathWalk`, `pathStep` (scholar.mx/my slides without the tb fighter moving).

**Fix (`game.js`):**
- `travelTo(x, y, force, combatExit)` — refuses mid-combat with the honest line
  "Not mid-fight — the barrier is the way out." (returns null, no silent refusal).
- `tbBarrierExit` (the one legitimate mid-combat caller) passes `combatExit=true`.
- Sibling sweep, same class: `microMove` → `false`, `beginPathWalk` → `null`
  (says "Not mid-fight — finish it first."), `pathStep` → `false` mid-combat.
  Safe: combat movement is `tbPlayerMove`'s job — it never calls these three;
  dpad/tap paths already route around them in combat.

**Proof:** `scripts/test-travel-breakit.js` — BEFORE: teleport demonstrated
(moved=true, fightLive=true), microMove slide demonstrated. AFTER: all refused,
honest lines said, fight untouched; tbBarrierExit still crosses (bypass works);
normal travel/microMove outside combat unaffected. 13/13 × 3 seeds.

## BREAK 2 — EXPLOIT/HONESTY: party.js travelTo wrapper farmed betrayal rolls on refused travel (FIXED)

**Attack:** `party.js` wraps `Game.travelTo` to run `placePartyAtPlayer()`,
`partyBanter('travel')`, and `betrayalSweep()` — **unconditionally**, even when
the engine refused (null) or returned a blockage object. `betrayalSweep()` rolls
`Math.random() < 0.5` per high-opportunity betrayer (`npcBetrays`). So: stand
next to a blocked node, tap it repeatedly → free betrayal-strike rolls with zero
travel. Travel banter also fired without moving (honesty lie).

**Measured (pre-fix, seeded):** blocked tap (fallen_tree) → `partyBanter` 1×,
`betrayalSweep` 1×, `placePartyAtPlayer` 1× — all on a refusal.

**Fix (`party.js`):** the wrapper now forwards the 4th `combatExit` param
(without this, BREAK 1's guard would have refused tbBarrierExit's legitimate
crossing — caught by the proof test), and runs side effects only on a real
arrival: `map.px/py` on the destination node AND `!this.over` (a pit trap can
kill mid-arrival; the corpse gets no banter).

**Proof:** same test file, sections 5–6 — BEFORE: 3 side effects on refusal;
AFTER: 0 on refusal, still 1+1 on a real arrival.

## Dead code removed

- `wasUnknown` (game.js `travelTo`) — assigned, never read.
- `pendingTravel` (app.js) — declared with a "TWO-CLICK TRAVEL" comment, never
  read anywhere; only nulled once. Removed declaration + the nulling.

## HELD (attacked, resisted)

- **Encounter/animal farm via free node travel:** `checkEncounter` rolls per
  arrival (5–15%, pity-bounded) and `checkAnimals` draws from the tile's LOCAL
  wildlife population (decrements; hunted-out tiles are empty). Grinding exists
  but is pay-to-play with HP and self-limiting via ecology — not a free loop.
- **Relic-bond grind via free travel:** `noteRelicUse` is a 1/day boolean flag —
  spam crossings can't accelerate bond beyond one day's use.
- **Swim button reachability:** for creeks the button is unreachable by design —
  swimmers cross free (the ability IS the solution; `travelBlockage` returns
  null), non-swimmers get the blockage card without the button. For `washed_out`
  + swimmer it renders and honestly charges 20 kcal. Not dead, just conditional.
- **Teleport audit:** every `map.px/py` write is accounted for — `travelTo`,
  `tryNodeExit`→`travelTo`, `tbBarrierExit`→`travelTo` (barrier), debug scenarios,
  debug buttons, day-7 System arrival (scripted beat), `phoenix_clause` (explicit
  once-per-run ability, honest label), exile haven founding (walks to claim site
  first; position pinned to claim). No free warps.
- **Mid-walk travelTo desync:** dpad presses `purgeKind('path')` first ("hands on
  the pad win"); `walkPathAnimated` purges previous walks. No orphaned path steps.
- **toWildNode callers ignoring `false`:** 15 debug-scenario callers ignore the
  return, but `false` (no valid wild tile) is unreachable on a 9×9 world with
  ~76 valid wild tiles — defensive debt, not a live break. Left alone.
- **`_lastTravelStepTicks` save/load:** missing from saves just means the world
  advances once after load — correct, not exploitable.
- **compareMaps fog honesty:** merged tiles are marked `'s'` (shared), never
  `'v'` (visited) — the arrival moment is preserved. Verified in code.
- **Villager maps never grow (observed, NOT fixed — no exploit/softlock/honesty
  violation):** `npcSetNode` doesn't append to `vp.visitedTiles`, so
  `compareMaps` is frozen at the seed tiles within a session; additionally
  `data.villagers` isn't persisted, so even seeds re-roll on load (persistence
  loop's area — flagging, not fixing). The feature does what its comments claim
  (seed → merge); growth is a design extension, not a break.

## Design flags (not changed)

- `newGame` doesn't clear a live `tbfight` (found via harness: combat leaked
  across test setups). Unreachable in production UI (no menu access mid-fight),
  and fight lifecycle is the combat loop's area — flagging for their break-it run.
- The tap-self "Head {dir}" travel button is unreachable mid-combat only because
  the grid-tap handler checks `Game.tbfight` — BREAK 1's engine guard is now the
  real defense; the UI check is belt-and-suspenders.

## Files changed

- `src/js/game.js` — travelTo combat guard + combatExit param; tbBarrierExit
  passes it; microMove/beginPathWalk/pathStep combat guards; removed wasUnknown
- `src/js/party.js` — travelTo wrapper forwards combatExit; side effects only on
  real arrivals (position match + !over)
- `src/js/app.js` — removed dead pendingTravel
- `scripts/test-travel-breakit.js` — new proof test (BEFORE=1 runs pre-fix
  game.js + party.js from git HEAD; SEED override; 3/3 BEFORE, 13/13 AFTER ×3 seeds)

## Verification

- `node --check` on game.js, party.js, app.js: OK
- `scripts/validate-ontology.js`: 50/50 systems validated, release permitted
- New proof test: BEFORE 3/3 (exploits demonstrated), AFTER 13/13 (seeds 7, 999, 123456)
- Regressions: round-1 proofs (spam 5/5, animal 5/5, clamps 4/4, sib-clamps ALL
  CHECKS PASSED), round-2 proofs (doublecharge 2/2, barrierblock 7/7, pitdeath
  4/4), test-movement.js 48/48, test-action-clock.js 18/18
