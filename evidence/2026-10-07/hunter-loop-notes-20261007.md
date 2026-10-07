# Hunter loop — playtest + fix (playtest loop 2026-10-07, ~13:00 CDT)

**Archetype:** hunter (traps, tracking, monster encounters, night play).
**Harness:** `scripts/play-feel-20261007-hunter-loop.js` (24 checks, seeds 7/42/99).
**Proof test:** `scripts/test-synergy-requires-any.js` (15 checks, seeds 7/42/99).

## Played as a player (BEFORE state, pristine HEAD)

The hunter-audit (b71301e) found the hunter path "content without a game loop".
Since then the engine owner wired all 13 actions (60a9eec) — verified working,
narrated, no silent turns. Remaining gaps found live this run:

1. **3 synergies still undiscoverable** — no `discovery_method` + `checkSynergyDiscovery`
   ignores `requires_any` in matchesUsed/other-leg; `recomputeActiveSynergies`
   ignores `requires_any` (discovered clean_kill would be permanently active);
   `apex_predator`'s synergy legs unsatisfiable via `abilityLevel`.
2. **Card promises unfulfilled** — `dead_aim_shot`'s `ignoreArmorNext` never read
   (and never consumed → permanent armor-piercing after one use);
   `take_aim`'s `guaranteed` never read (blinded aimed shot could miss);
   `ambush` passive `combat.first_strike_damage` and `apex_predator`
   `combat.vs_beast_damage` pipelined but zero engine consumers.
3. **`read_stance` first-use bug** — `tbfight.id` undefined → `undefined===undefined`
   made the FIRST read of every fight say "already read this fight" + fizzle.
4. **`dress_game` double-dip** — impl re-multiplied ×1.3 on a carcass whose
   `hiddenKcal` already carried the `hunt.meat_yield` bonus from the kill;
   also read the wrong store (`state.corpses[].meatYield`, which doesn't exist —
   hunted game is inventory `foodCarcass`).
5. **Garbled text** — `spendCombatAction('ability')` → "You ability — that costs
   your action."
6. **Unwired flags** — `stalkActive` / `layWaitActive` set but never read.

## Fixed this run (game.js, abilityActions.js, abilities.json, synergies.json)

- `checkSynergyDiscovery`: path-aware — `livePaths` (paths containing the used
  ability), synergy legs satisfied by discovery, `otherLegs` union for combined
  detection across simultaneous/sequential/same_target/sustained; synthetic
  tech/skill block unions `requires_any` paths.
- `recomputeActiveSynergies`: `requires_any` paths gate activation; synergy
  legs = discovered.
- Data: `discovery_method` (simultaneous + hints/teases) for clean_kill,
  blood_tracker, apex_predator.
- `tbfight.id` set at both creation sites (+ null-guard in read_stance).
- Armor block honors + consumes `ignoreArmorNext`; blind miss honors
  `aimBonus.guaranteed`; round-1 consumes `combat.first_strike_damage`;
  vs-monster consumes `combat.vs_beast_damage`.
- `stalk_prey` settles an active animal encounter (aware → ≤0.2); `lay_wait`
  consumed at the game.js animal spawn (aware 0 + say).
- `dress_game`: inventory carcass, converts at face value (no re-multiply),
  names the Field Dressing bonus; effect text rewritten honestly.
- `spendCombatAction('focus')` → "You focus — that costs your action."

## Verified

- Proof test 15/15 × 3 seeds: all 3 synergies discoverable via requires_any
  paths, apex via synergy leg, activation gating (deactivate/reactivate),
  negative (no progress without the synergy leg), classic synergy
  `undying_fury` still unlocks (no regression), teases fire.
- Play harness 24/24: night stalk→aim→strike (30 dmg, 2.5x), read_stance reads,
  dress +3860 net with named bonus, trapline speaks at dawn.
- Existing suites: synergy 30/30, synergy-content all pass, tech-synthesis
  13/13, combat-engine 9685/9685, hunter-traps 26/26, hunter-fixes 17/17,
  ontology ✓ 46 systems.
- Pre-existing failures (NOT mine, NOT fixed): test-ability-actions 1 fail —
  16 re-added actions (thief.steal_pantry, molt.shed_skin, …) have data but no
  impls (engine owner's active area); test-animals-hunt-honesty crashes —
  `this.applyStatus is not a function` (sibling's statusEffects.js not in that
  test's hardcoded file list).

## Deferred to engine owner (sibling has 276-line WIP in encounters.js + 14-line WIP in food.js — did not touch)

- `encKillLine`: name the field-dressing bonus when kcal > base.
- `hunt.first_shot_damage` (clean_kill 2x): map into chance-based hunt strike.
- `preyReaction` (food.js): consume `stalkActive` at strike ("until you act").
- `layWaitActive` at encounters.js:766 spawn site.
- Remaining unconsumed modifier targets: stealth.move_silent, hunt.track_wounded,
  animal.behavior_read, hunt.wounded_find, hunt.wounded_time, hunt.intimidate.

## Tree hazards noted

- Shared index has staged deletions of abilityActions.js, monsterBehaviors.js,
  statusEffects.js, alienPlayers.js, statusEffects.json + a 2000-line-shorter
  game.js + many evidence/docs files. A bare `git commit` on the shared tree
  would be catastrophic. This run's commit used the private-index route and is
  mine-only.
- Sibling actively rewriting src/data/abilities.json + synergies.json (in-flight
  at 18:17 UTC). My data changes were built pristine-HEAD-based; if their
  commit lands without the 3 `discovery_method` blocks, re-apply:
  `python3` splice after each synergy's `"discovery"` line (see this run's
  commit diff), or re-run `scripts/test-synergy-requires-any.js` to detect.
- Sibling committed 1570577 + 4174d39 mid-run (brawler audit found the same
  requires_any discovery bug class — this fix addresses it generically).

## Feel verdict

The hunter kit finally has teeth: stalk→calm→strike, aim→2.5x, dead aim→armor
ignored, synergies actually discoverable with juicy teases. The loop that was
"four passive stat lines and a menu of buttons that do nothing" now plays.
Remaining itch: `follow_blood` / `track` are still narration-only (no wounded
prey to actually follow) — the wounded-tracking subsystem is the next honest
build, not a wiring fix.
