# Hunter adversarial playtest — 2026-10-10 (run: oversight-playtest-loop, archetype 5)

## Attacks attempted (hostile player)
- **E1 EXPLOIT — hunt.meat_yield stacking**: stacked field_dressing + clean_kill synergy; measured trap-catch and strike-kill gross. Multiplier bounded (1.3–1.95x, ≤3x gate). Trap catch bakes exactly once (gross == base×mult); clean→cook never exceeds gross. HELD.
- **E2 EXPLOIT — population double-spend**: 1-rabbit tile; encounter spawn decrements to 0; trap finds nothing (30 days, 0 catches); wildlife never negative; release returns exactly one. HELD.
- **E3 SOFTLOCK — travel continuity**: animal parked on leave tile, restored on return, population-neutral (no dupe, no silent depletion). HELD.
- **E4 SOFTLOCK — edge-bolt exit**: animal at edge bolts out cleanly, no exception, population incremented exactly once. HELD.
- **E5 HONESTY — box-trap rattlesnake**: BROKE. Recipe L3 text warns "a rattlesnake in the box means the weave held and your luck did too — pin it before you reach in", but the engine handed over a free dead snake with zero handling risk — the same class as the skunk spray event (fixed earlier). FIXED (see below).
- **E6 EXPLOIT — dress_game refused taps**: no-carcass and rotted-carcass refusals cost nothing (kcal/ticks unchanged); rot retained for the Clean path. HELD.
- **E7 EXPLOIT — fishing.yield stacking on nets**: netted fish gross bounded (≤3x species kcal; measured 0.75–1.0x). HELD.
- **E8 — cleanShotReady persistence**: flag survives a bolted pre-strike (paid cost, bonus waits for a real strike — design-consistent), consumed by a resolved strike. HELD by design.
- **E12 — pit-trap trapline EV**: 30-day sim, 4 catches max (uses=4), 104,000 kcal gross on a deer tile. Trap breaks on schedule; ecology depletes. Finite — reported as balance signal, not a break.

## The break (E5) and the fix
- **Break**: `checkTraps` special-cased the skunk (spray event, knowledge-gated) but a box-trapped timber rattlesnake arrived as an unhandled carcass — no bite, no pinning, contradicting the recipe's own warning.
- **Fix** (`src/js/game.js`, `checkTraps`): rattlesnake retrieval is now the bite moment. L3 box_trap readers pin it behind the head first (15% bite); the careless take 60% bite — 8–14 damage + rattlesnake venom poison (same numbers/shape as the field bite in encounters.js). Both outcomes narrated; `animalBite` audio. The snake is still killed/cleaned after — the carcass math is untouched.
- **Proof**: `scripts/attack-hunter-20261010.js` — E5 failed pre-fix ("caught a Timber Rattlesnake! About 1560 kcal on the bone" with no risk language), passes post-fix. Careful path verified separately (L3: pins every time, ~15% bite). ALL GREEN × 3 seeds (20261010, 7, 99).

## Regressions
- Ran prior hunter trap suites: test-hunter-attack-20261009 ALL GREEN; test-hunter-breakit-20261009 E5–E7 green; test-hunter-ecology-20261008 20/20; test-hunter-traps-20261007 26/26; test-trap-poolA 202 passed / 13 failed — the 13 are pre-existing on pristine HEAD (trap-method coverage gaps + fox-rate stat, verified identical with the fix stashed). attack-hunter-20261008.js crashes on `seMoveMod` on pristine HEAD too (stale script).

## Fun notes
- The rattlesnake pinning beat now mirrors the skunk's — knowledge earns safety, carelessness earns fangs. The box trap feels like a live cage again.
- Pit-trap EV (~26k kcal/deer gross with field dressing) is strong but finite and labor-gated (96 ticks to dig); Steve's call whether it needs tuning.
