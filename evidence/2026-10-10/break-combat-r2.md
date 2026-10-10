# Break-it: combat engine r2 (2026-10-10)

Target: the turn-based combat engine (game.js tb*, feastBurn, ability turn
economy) — NOT monsters-as-content. Hostile-player attacks from a worker
with full code knowledge. Canon: docs/CANON.md, docs/MONSTER-WAVES.md,
docs/BALANCING.md read first. (No dedicated combat-engine canon doc exists —
the engine's rules live in code comments + BALANCING.md's feastburn section.)

Earlier today a combat-engine run already landed (test-combat-break-20261010.js:
hushwolf/speedbump badge honesty, armor invariant, practice cap, softlock
routed/lost, dead-code module loading). This run attacked fresh angles and
sibling-swept the f5794463 classes (dead_aim double-advance, leech
stance/tbDamage redirect, scream viaAbility).

## CATCHES (all fixed, proof below)

### S2/S3 — TypeError: attack-less monster fighter crashes tbMonsterTurn (THE CATCH)
The engine defaults the pattern for attack-less mdefs
(`const pat = (m.mdef.attack && m.mdef.attack.pattern) || {type:'burst',radius:1}`)
— the code's own contract promises such fighters work. But three spots in the
generic declare/resolve path assumed `atk` / `m.mdef.attack` exists:
1. Generic declare: `dmg: atk.damage, attackName: atk.name` → TypeError on
   `atk.damage`. Fixed: `dmg: (atk && atk.damage) || [6, 10]`,
   `attackName: (atk && atk.name) || 'violence'`.
2. Generic telegraph resolve: `(m.mdef.attack.pattern || {}).type` (×3:
   charge-lane move, boar winded, stag wheel) → TypeError on `.pattern`.
   Fixed: `((m.mdef.attack || {}).pattern || {})`.
3. Codex-learn block in the generic declare: `atk.name` → guarded with
   `atk &&`.
All 30 shipped mdefs have attacks, so this was unreachable in play — but
union_rep summons, debug scenarios, and the engine's own fallback contract
make it a real robustness hole, and it crashed deterministically in harness.
Sibling sweep: every other `atk.*` / `m.mdef.attack.*` read in tbMonsterTurn
is species-guarded (real patterns) or already null-safe; verified by grep.

### H1 — Leech stance redirect invisible to Settle the Debt (honesty)
The leech redirect called `addHealth(-half)` directly, which never writes
`fightDamageTaken`. trade_of_blows.settle_debt promises "You cash in every
bruise, every cut" and pays +50% of `fightDamageTaken` — the half you took
via leech was silently excluded. Fix: the redirect now records `_half` into
`fightDamageTaken` (game.js tbDamage leech block).

### H2 — stale barrier comment (sibling sweep)
app.js barrier-edge comment still promised "50% break, 50% followed" — the
CHASE rewrite (2026-10-09) replaced the coin flip with stamina pursuit.
Comment corrected. Verified: no player-facing say() ever promised flee odds.

### Drive-by: stale test lock-in
test-combat-r2-hp-routing-20261008.js asserted risky water = flat −15 HP —
the disease rework (2026-10-09) changed it to −5 + gut rot. Updated the
assertion (pre-existing failure on HEAD, not caused by this run).

## HELD (attacks attempted, engine resisted)
- E1 feastBurn integrity: exactly one burn per tbPlayerStrike; kcal delta ==
  stated burn; multiplier matches the computed pipeline (×1.5 feasting).
- E2 static guard: `this.feastBurn()` has exactly one call site in game.js.
- E3 f5794463 regression: useAbility('dead_aim.dead_aim_shot') advances the
  world exactly once (monster acts once, not twice); the shot flag is
  consumed by the next strike (no linger).
- E4 refused ability taps grant no XP (settle_debt with no damage taken:
  refused, xp unchanged).
- E5 stat farming capped: 200 strikes, str/agi hard-cap at 10.
- S1 snake split: mid-chain kill splits into two hunting snakes (new head on
  the after-side); killing everything ends the fight — no phantom fighters.
- H3 leech redirect: villager takes ceil(half), player the rest; trust
  bumped; stance clears at the player's next tbBeginTurn (one full round).
- D1: all 80 tb* methods defined on Game have ≥1 call site.
- D2: all 11 engine/combat.js exports resolve as functions.
- S2-first-half / S3: crowded 12-fighter order — tbAdvance lands on the player.

## Pre-existing failures (on HEAD, not mine)
- test-combat-r2-deadcode-20261008.js: X1 peacemaker.walk_in exposed
  expectation, X2 fear-applier static scan — both fail identically with
  pristine HEAD game.js. Left for the owning worker.

## Proof
- scripts/test-combat-break2-20261010.js — 31/31 × 3 seeds (7, 999, 424242).
  Pre-fix: 4 FAIL (3 crash sites + leech fightDamageTaken) on seed 7.
- Regressions: test-combat-break-20261010 19/19; r2-doubleko 8/8;
  r2-hp-routing 16/16 (after stale-assertion fix); r2-multikill 8/8; r7 32/32;
  abilities 67/67; ontology 52/52 green.

## Design notes
- No canon invention: the fallback damage [6,10] is a never-in-play defensive
  default, not a balance number; no canon doc covers the combat engine.
- No [needs-eyes]: no feel/UI/combat-number changes visible to a player —
  crash hardening + one honesty accounting fix.
