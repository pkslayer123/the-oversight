# Villager Objectives — evidence (2026-10-08)

Steve's brief: villagers sit in haven; they should pursue OBJECTIVES, not random
drift. A little wandering is fine. Indoor ≠ outdoor. Leavers must recognize
danger (ask for help / keep tight goals). Nomads range farther. "Current
scenario is likely too simple."

## Diagnosis (verified in code, built on)

`npcNodeTravel` (once/day-part) left haven on 4 dice triggers only: hungry→forage
0.35, escape→leave 0.15, bold/restless→explore 0.12, curious 0.04. Away movement
was pure random drift (0.3/part). villager-agency.js expeditions only cover
wanderer/explorer profiles. No objective, no danger check, no indoor/outdoor
distinction. (Correction from testing: old code actually departs ~8/4 days in a
fed village via explore dice + expeditions — the win is DIRECTEDNESS, not count.)

## What was built

New module `src/js/villager-objectives.js` (self-attaching, loads after
villager-agency.js; @ontology header validated — `validate-ontology.js` green,
48 systems). Surgical hooks only in game.js/villager-agency.js.

1. **OBJECTIVES** — each villager holds one, re-picked at dawn / when idle:
   FORAGE (pantry < 4000 or personal hunger), WATER (clean water < 3), TRAPS
   (only if they know snares), VISIT (a specific familiar person — fire-groups,
   trust; indoor social call if target is home), HAVEN_CHORE (tend fire, repair,
   teach, cook, sweep — indoor), EXPLORE (wanderer/explorer), REST (energy < 35,
   indoor), LEAVE (escape goal → far node 4–6 out, duration 999). Every
   objective: target (node or person), tightness (max steps out), partsLeft,
   purpose label routed through the existing away/gossip machinery.
2. **DEPARTURE DANGER CHECK** (`objDanger`) — recent attack/murder/death gossip
   (≤3d), rain, distance vs profile, temperament. GO / ASK / TIGHTEN / DEFER.
   Night never departs (kept). Escape goal zeroes danger by design (the
   desperate don't count danger) and bypasses the check.
3. **ASK** — finds a companion (prefers one with its own outdoor errand,
   range-filtered); both marked away together, departure gossiped with both
   named. High danger + no companion → TIGHTEN (1-step errand only).
4. **MOVEMENT WITH DRIFT** (`objAwayStep`) — step toward target; 35% meander
   (encounters); at the site, "work the area" (local steps, pulled back by
   pursue). Co-location with another away villager → trust bump + seen-together
   say line if player present. `tightness` is a hard trip radius; `tightened`
   = short leash, no meander. Away costs hunger+3/energy−4 per part via
   npcNeeds (the engine's ledger — honesty).
5. **INDOOR vs OUTDOOR** — indoor objectives hold villagers inside (re-asserted
   after door drift); indoor beats (chores/rest/teach/social) via say+gossip.
   The generator still pushes people out: water/forage/traps can't be done
   inside.
6. **NOMADIC RANGE** — reuses `npcRangeProfile`/`npcMaxDist` (explorer 6,
   wanderer 3, forager 1, homebody 0); VISIT/GUARD/WATER/TRAPS capped by
   profile; expeditions: indoor-objective holders skipped, launches gated on
   village danger < 4, objectives synced truthfully during expeditions.
7. **HONESTY** — every departure/return/ask/defer is said (player present) or
   gossiped (departure with witnesses). No new UI. Base return machinery
   (pantry stocking on forage return, explorer news, escape) untouched, extended
   via `objReturnEffect` for water/traps/visit/guard.

## Design calls I made (Steve can overrule)

- Distance is measured in **steps** (chebyshev), because the world moves
  8-directionally — a diagonal is one step. Tightness, danger bands, and range
  caps all speak steps.
- Escape goal zeroes danger — designed, not a bug (desperate people leave
  anyway). Flagged: it means escapees never ask for companions.
- Stale away entries (no objective — shouldn't happen in-game) walk home
  instead of drifting; the base return clock still governs.
- TEST UPDATE: `scripts/test-break-travel-clamps-20261008.js` attack B pinned
  the rim-clamp fix through the OLD drift (scripted RNG). The old drift is gone
  by design; the attack now pins the same property (crossing x=6) through the
  new pursue path, deterministically. BEFORE branch untouched.

## Proof — `scripts/test-villager-objectives-20261008.js` (16 checks)

True A/B: RUN B evals `HEAD:src/js/game.js` (old dice) and skips the new
module. Seeded (mulberry32, SEED env; load-time RNG captured too per the
SEED-BEFORE-EVAL lesson). Full src/js list in index.html order.

**16/16 green on 7 seeds** (20261008, 7, 42, 999, 1234, 555, 7777):
- fed village: ≥6 departures/6d, every one with an objective purpose
  (water/forage/explore/leave/visit…)
- pursuit: crafted far trips close distance (ratio > 0.55); sim shows
  target-directed steps, not drift
- no night departures (hard rule, 24-part sweep incl. night)
- homebodies ≤ 1 step out; nomads ≥ 2 steps out (distribution check)
- indoor objectives: 60 indoor-parts seen, zero travel
- high danger (score ≥ 4, pinned rain): no departure beyond 1 step except
  escape; moderate danger (score 2): paired departure, BOTH marked away
- departures gossiped; old code purposes ⊆ {expedition, explore, leave}
  vs new broader set

## Bugs found & fixed during the build

- LEAVE targeted haven itself (ghost-away) → far node 4–6 out.
- Diagonal targets broke manhattan-tightness (1 step = dist 2) → steps
  (chebyshev) everywhere via `objDist`.
- Meander could exceed trip tightness → tightness now a hard trip radius.
- Tighten picked diagonal DIRS8 → orthogonal only.
- Expedition villagers kept stale indoor objectives → objectives synced in
  objTick; indoor holders skip expeditions.
- Gossip `seedGossip` dedups per (action, partKey) — test artifact; tests now
  ensure the scenario (retry/step part) instead of assuming the seed landed.
- Living weather (`resolveStormFront`) moves during tests → scenario tests pin
  it (correct game behavior; controlled in tests).

## Regression checks

- `test-villager-agency.js`: 37/37 green.
- `test-continuous-travel.js`: 21/21. `test-blocked-travel-feedback.js`:
  13/13. `test-break-travel-clamps-20261008.js` AFTER: 4/4 (updated, see
  above). `test-break-travel-sib-clamps-20261008.js`: ALL CHECKS PASSED.
  `test-tent-breach/rooms-20261008`: ALL GREEN.
- Pre-existing failures, identical on HEAD baseline (verified via /tmp
  checkout): `test-interior.js` 4 fails, `test-living-world.js` 7 fails (one
  asserts the OLD 6-clamp — stale), `test-villager-agency-20261007.js` crashes
  on `Game.daylifeOf` (function no longer exists anywhere — archived stale
  test). None caused by this work.
- Ontology gate: `validate-ontology.js` → "✓ All 48 systems validated.
  Release permitted." (Rules now carry `(code:)` citations.)

## Files (worktree `villager-objectives`, branch `villager-objectives`)

- `src/js/villager-objectives.js` (new) — the system
- `src/js/game.js` — 3 surgical hooks (departure → objMaybeDepart, away step
  → objAwayStep, return extension → objReturnEffect)
- `src/js/villager-agency.js` — 2 guards (indoor holders skip expeditions;
  danger ≥ 4 blocks launches)
- `index.html` — script tag after villager-agency.js
- `scripts/test-villager-objectives-20261008.js` (new) — the proof
- `scripts/test-break-travel-clamps-20261008.js` — attack B updated (above)
- `docs/ONTOLOGY.md` — regenerated by the validator (new module entry)

Not merged/pushed/bumped — coordinator lands.
