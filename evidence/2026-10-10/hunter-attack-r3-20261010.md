# Hunter adversarial playtest — 2026-10-10 r3 (run: oversight-playtest-loop, archetype 5)

Resumed the previous run's `playtest-hunter` tree (it died mid-r3 with a stale lock; work was intact). Round 3 attacked the trapline, trap honesty, butchering yields, and prey AI.

## Attacks attempted (hostile player)
- **Trapline** (`scripts/proof-hunter-trapline-20261010.js`, 27 checks): trap duplication (set consumes the tool; no verb returns a set trap), uses honored (3-use snare catches exactly 3, trap breaks and leaves), net set consumes the net, own-pit at 1 HP kills honestly (named death flow), far-tile traps keep checking while traveling, stale-recipe tile trap doesn't crash dawn, kill carcass species-honest, cleaning capped 0.95. ALL HELD.
- **Trap honesty** (`scripts/proof-hunter-traps-20261010.js`, 31 checks): recipe uses vs engine (snare 10, wire snare 2), catch consumes a use, barren tile stays quiet (uses not consumed), trap-shyness curve real (41% fresh → 13.7% shy-3, model 0.65³), recipe copy vs engine (snare/deadfall/box/pit cards), glasswing "monster trap" resolves into a real fight (not a roll), own-pit 50% warned fall with death handled. ALL HELD.
- **Butcher yields** (`scripts/proof-hunter-butcher-20261010.js`, 21 checks): see breaks below.
- **Prey AI** (`scripts/proof-hunter-preyai-20261010.js`, 17 checks): deer/turkey flee on approach (never sit still), cornered deer panics (narrated, can hurt — not a piñata), edge escape honest, strike is a real roll (25 strikes → 2 kills, 8 miss markers; winded + right tool earns the kill), carcass species-honest, no wall-phasing. ALL HELD. Deviation noted: deer at the treeline goes winded instead of escaping (edgeTurns=1) — recorded, not a fail.

## The breaks (r3) and the fixes
1. **Y1 EXPLOIT — fat+meat energy creation**: meat (0.95 cap) + separable fat (20% of gross, additive) totaled up to **1.15× the species-honest gross** — a 30,000-kcal bear paid 28,500 meat + 6,000 fat. Same energy-creation class as the 3.3× kill-inflation bug. FIXED (`src/js/food.js`): `butcherYieldFrac(how, animalId)` is now fat-aware — meat caps at 0.75 for fat animals (bear/boar/javelina per canon BEAR.md), fat carved OUT of the gross; meat+fat ≤ 0.95 everywhere: self-clean, specialist (`askSpecialist` butcher, also given the 0.95 hard cap it lacked), stash path, and the whoOptions/kill-line labels (which now read the shared helper — no copy drift). Bear now: 22,500 meat + 6,000 fat = 28,500 (95.0% of gross).
2. **S3 SOFTLOCK — stale-recipe trap crashed dawn**: a tile trap whose recipe no longer exists (renamed/removed since the save) threw inside `checkTraps` — the one endDay call with no try/catch wrapper — bricking every dawn. FIXED (`src/js/game.js`): unknown-recipe traps rot away honestly, once, narrated ("the weave gave out, the stakes with it").
3. **fish() bonus double-up conjured from deleted stock**: the fishWise 30% bonus picked from the STALE pre-catch species list — on a nearly-fished creek it decremented an already-deleted species (`_wl[fid] = NaN`, never cleaned up) while pushing a real second carcass. "Two real fish, two real decrements" was a lie in this edge. FIXED (`src/js/game.js`): the bonus re-reads live stock after the first decrement; no stock, no second fish.

## Test bugs fixed (harness, not engine)
- traps T7: the fall-detection regex `/your pit|.../` also matched the DODGE narration ("your pit waits") — measured 100%, engine was 53% all along. Now matches the stakes line only.
- butcher Y3 / dress D4: roster lottery — some backgrounds start with a cutting tool; the "no knife" preconditions are now enforced by stripping.
- dress D1 / butcher Y5: roster lottery — preservation bonuses make spoilDay=day-1 NOT rotten; rotten probes now use day-30.
- activefishing E13b: racy by construction — fish() burns 32 ticks and simEcology + villagers move stock between snapshots. Clock frozen for the catch-accounting pin (ecology honesty belongs to the ecology suites).
- activefishing E13: simEcology migrates fish between tiles (10%/species/day), so a 200-cast "fishless" probe isn't fishless by cast 193. Rewrote the invariant per-cast: every carcass backed by pre-cast stock (conjured=0).
- ecology suite: stale pin — net backfill is 16 uses since the depletion rebalance (12→16), test still pinned 12.

## Proof results
- proof-hunter-trapline: 27/27 × 3 seeds (20261010, 7, 99)
- proof-hunter-butcher: 21/21 × 3 seeds
- proof-hunter-preyai: 17/17 × 3 seeds
- proof-hunter-traps: 31/31 × 3 seeds
- attack-hunter-20261010 (r1): ALL GREEN × 3 seeds

## Regressions
- test-hunter-activefishing-20261010: ALL GREEN × 3 seeds
- test-hunter-yield-20261010: 13/13; test-hunter-dress-20261009: ALL GREEN × 4 seeds
- test-hunter-ecology-20261008: 20/20; test-hunter-traps-20261007: 26/26
- test-hunter-attack-20261009: ALL GREEN; test-hunter-breakit-20261009: 15/0
- test-hunter-net-print-20261009: ALL PASS (the 2 pre-existing failures healed — sibling fix)
- Ontology: 62/62 validated.

## Test-harness notes (for future runs)
- Roster generation is seed-lottery for starting equipment AND preservation bonuses: never assert preconditions about the fresh scholar's pack — enforce them (strip tools) or make thresholds bonus-proof (spoilDay day-30).
- Long cast/creel loops cross day boundaries: simEcology, regrow, and villager agency all move the numbers between snapshots. Pin catch-accounting with a frozen clock; pin living-world behavior in the ecology suites.
- A 200-cast "fishless" probe is ~12 days — migration refills the premise. Per-cast invariants beat end-state invariants.

## Fun notes
- The fat separation makes butchering a bear feel like butchering: meat piles plus glistening slabs to render — the 115% bug was invisible, the fix is tangible.
- Prey AI held everywhere it mattered: the winded-deer chase (blow itself out at the treeline, walk up) is a genuinely good beat.
- Pit-trap EV (~26k kcal/deer with field dressing, finite, labor-gated) and the fishWise double-up are strong but bounded — Steve's call on tuning, flagged in build notes.
