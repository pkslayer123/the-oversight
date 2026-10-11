# SIM-PERF.md — sim process optimization (2026-10-10)

Steve: "Optimize the process. It's our highest leverage improvement tool."

## Baseline (measured 2026-10-10, 2-core box, unmodified code)

Winseek policy, 60-day runs via `scripts/sim-harness.js`, stdout captured
(terminal-like — includes the `[SLEEP]` write storm; the file-redirect
numbers in "New baseline" are the realistic shard case):

| seed | days | ms/day | end |
|------|------|--------|-----|
| 1 | 46 | 170.2 | village-lost |
| 2 | 36 | 152.4 | village-lost |
| 3 | 60 | 104.9 | survived |
| 5 | 31 | 183.4 | village-lost |
| 6 | 30 | 85.3 | village-lost |
| 7 | 25 | 78.5 | village-lost |

Median ≈ **129 ms/sim-day** under terminal capture (~49 ms/day with
file-redirect — see "New baseline"). A 60-seed × 120-day round = 7,200
seed-days ≈ **15.5 min per core** terminal-capture (≈5.9 min file-redirect;
~2.9 min wall with 2 shards). Seed 8 hit 1,174 ms/day
(pathological long-fight run — see "What's left").

Per-day cost breakdown (manual instrumentation, 30-day seed-3 run, % of wall):

| component | % of wall | honest? |
|-----------|-----------|---------|
| `tickAction` (player movement, tick costs) | 54% | yes — the sim itself |
| `advancePart` (of which below) | 42% | |
| `endDay` (inside `sleep`) | 23% | yes — village lives, contests, regrow |
| `status()` UI-object build | ~10% | **no — discarded by sim drivers** |
| `npcNodeTravel` | 8–9% | yes — villager agency |
| `resolveAssignments` | ~5% | yes — leader assignments + gossip |
| `save()` autosave serialization | ~2% | **no — sims never load saves** |
| policy roads (upkeep/daily/fights) | ~30% | yes — the policy being tested |
| `console.log` [SLEEP] diagnostics | <1% | **no — pure noise** |

Inside `status()`: the ~60-field object build plus `kcalCap()` (~13% of wall
from all callers), `feastState()`, `packCapacity()`, `packWeight()`,
`pantryDaysEstimate()`, `afflictionChips()`.

## What changed (all in `scripts/`, one 3-line-class fix in `src/js/game.js`)

**1. Slim `status()` in sims** — `sim-harness.js` `applySimOpt()`, gated by
`SIMOPT` (default on; `SIMOPT=0` disables). Replaces `Game.status` with a
version that runs ONLY the three side-effecting calls —
`migrateReserve()`, `migrateLumps()` (one-time migrations), and
`validateInsideTent()` (the tent-shred choke — proven by the trajectory
test's shredded-tent scenario) — and returns a 6-field object. Verified
2026-10-10: no game-code consumer reads fields off `status()` returns; sim
drivers discard them. Full builder survives as `Game._fullStatus`.

**2. Stub `save()` in sims** — keeps `syncRun()` (cheap run metadata) but
skips `S.state.save`'s full-state `JSON.stringify`. Sims never load saves.
Return is `true`; every game-code caller is a bare `this.save()` (only
`app.js`, browser-only, reads the return).

**3. Silence `console.log` during sim execution only** — `quietLog(fn)` in
`sim-harness.js` (async-aware, try/finally restore), wrapped around the day
loop in `runDays` and around `runOne` in the oracle sweep. The game code's
only console.logs are the two `[SLEEP]` diagnostics (every simulated
night). Sweep progress logging between seeds is outside the wrapper and
keeps working. `console.warn`/`error` untouched.

**4. Shard count = core count** — `scripts/run-winseek-parallel.sh` now
defaults `N_SHARDS` to `$(nproc)` (was hardcoded 6, oversubscribing the
2-core box). Still overridable: `bash scripts/run-winseek-parallel.sh 4`.

**5. Adaptive seeds (sequential stopping)** — `scripts/adaptive-seeds.js`
(new): exact Clopper–Pearson 95% interval (Lanczos log-gamma, verified
against reference values in its self-test) + `AdaptiveStopper`. Reference
implementation in `scripts/sweep-oraclev2-20261010.js`: seeds run 1..N in
order; minimum 20 seeds; then every 5 seeds the interval is checked — STOP
when it excludes the 15% decision threshold (upper < 15% → below target;
lower ≥ 15% → target met). A stopped run is a strict prefix of the full
seed set, so rounds stay comparable. N, the interval, and the stopping
reason are logged to the console, the iteration log, and written to
`OUT + '.adaptive.json'` (OUT itself stays a plain rows array — merge
scripts unaffected). `ADAPTIVE=0` restores the fixed seed list;
`ADAPTIVE_MIN` / `ADAPTIVE_STEP` / `ADAPTIVE_THRESHOLD` tune the rule.

**6. Instrumentation diet** — the round-3 sweep's 17 method wraps moved to
`scripts/util-instrument.js` with `UTIL_LEVEL`: `full` (default — this round
analyzes utilization, including `abilityUses`/`synergyDiscoveries`/
`trapCatches` per `analyze-oraclev2.js`), `light` (cheap aggregate counters
only; drops the per-turn hot paths `useAbility`, the `villagerTurn` phase
flag, `checkSynergyDiscovery`, `foodCarcass`), `off` (no wraps).
Measured on oracle-v2 seed 3 × 25 days, interleaved reps: full wraps cost
**~27.5%** vs off (well over the 5% bar); light ≈ off. Sweeps that don't
analyze utilization should set `UTIL_LEVEL=off` (or `light`).

**7. Hot-spot pass (npcNodeTravel)** — two clear redundancies fixed in
`src/js/game.js`, both proven trajectory-neutral (see proof):
- Removed dead `const temp = this.npcTemper(rid)` / `const goal =
  this.npcGoal(rid)` in `npcNodeTravel` — never read below; each was a
  linear `.find()` scan per villager per part (~1.7% of wall).
- Hoisted `travelingWith()` out of the per-villager loop (loop-invariant:
  nothing in the loop mutates party state).

Looked at and deliberately left alone: `spreadGossip`/`spreadPlantKnowledge`
(per-part social sim with RNG — honest work, no redundant recomputation),
`objMaybeDepart`/`objAwayStep` (per-villager agency decisions — honest),
`flowVillageKnowledge` (honest grants), `kcalCap` (called from many honest
paths; slimming it is a game-code change outside this pass's scope).

## Honesty proof

`scripts/test-simopt-trajectory-20261010.js`:
- For fixed seeds (5+, incl. a long survivor), runs D days with SIMOPT=1 vs
  SIMOPT=0, hashing a canonical per-day snapshot (day, scholar
  hp/kcal/health/energy/dayTicks, roster length, pantry kcal, wave unlocks,
  monster count, village trust mean, active contest id). Hashes must be
  IDENTICAL every day — any divergence rejects the optimization.
- Asserts `validateInsideTent` still fires: a shredded-tent scenario
  (scholar inside their own shredded tent → `status()`) must evict in both
  modes.
- Part 2: the `npcNodeTravel` game-code delta is proven separately —
  pristine-HEAD vs patched `game.js`, both SIMOPT=0, same seeds: identical
  trajectories.

## New baseline (measured 2026-10-10, same 2-core box)

Per-day, seed 3 × 60 days, stdout to /dev/null (the real shard case —
file-redirect, not terminal capture), interleaved reps:

| config | ms/sim-day (mean of 3 reps) |
|--------|-----------------------------|
| pristine harness | 49.0 |
| simopt bundle ON (`SIMOPT=1`) | 39.9 |

**Per-day speedup: 1.23×** (reps: 1.53× / 1.25× / 0.96× — the box is noisy,
load avg ~5 on 2 cores from sibling loops; the micro-benchmarks below are
the deterministic evidence). With terminal capture (the old interactive
case) the bundle measured 2.3×, because `quietLog` also kills the
`[SLEEP]` write() storm.

Per-call micro-benchmarks (same loaded mid-game state, interleaved):
- `status()`: 0.090ms → 0.0003ms per call (**339×**)
- `save()`: 0.028ms → 0.0002ms per call (**125×**)
- Real sims call `status()` ~14×/day and `save()` ~10×/day (drivers,
  fights, contests — more than the 4×/day from the day loop alone).

**Per round** (the ≥2× target): per-day gives 1.23×; the rest comes from
adaptive seeds. A 60-seed × 120-day round = 7,200 seed-days:
- Baseline: 7,200 × 49ms ≈ 5.9 min per core → ~2.9 min wall (2 shards).
- With adaptive stopping at 25 seeds (the 0-win case: 95% CI at 0/25 is
  [0, 0.137] — excludes 15%): 3,000 × 40ms ≈ 2.0 min per core → ~1.0 min
  wall (2 shards). **≈2.9× per round.**
- Close-verdict rounds run all 60 seeds and keep only the 1.23× — the
  honest floor. The optimization never costs seeds: a stopped run is a
  strict prefix of the full ordered set.

## What's left (the floor)

If per-day lands below 2×: the floor is honest work — `endDay`/`npcNodeTravel`
village sim (~30% combined), policy roads (~30–40%), `tickAction` movement,
and `kcalCap` (13% across callers, mostly honest). The ≥2× per-round target
is carried by adaptive seeds (early stopping at 20–25 seeds when the verdict
is clear) plus correct shard sizing.
