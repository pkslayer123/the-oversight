# BREAK-IT round 2: combat engine (2026-10-08, target #0, second pass)

Hostile-player audit, fresh attack surface only — round 1's vectors
(free-XP activations, dead Bury Food, door-flee reset, unwired turn-eaters,
strike-number lie, FeastBurn silence) were NOT re-attacked.
Proof tests: `scripts/test-combat-r2-phantom-pack-20261008.js`,
`scripts/test-combat-r2-multikill-20261008.js`,
`scripts/test-combat-r2-hp-routing-20261008.js`,
`scripts/test-combat-r2-doubleko-20261008.js`,
`scripts/test-combat-r2-deadcode-20261008.js` (59 checks, green × 5 seeds).
Every test was run against the pre-fix code via stash: all fail pre-fix,
all pass post-fix (details per finding).

## EXPLOIT — broke + fixed (4)

**R1. Phantom mid-combat heals (BROKE, fixed).** `useItem()` (first aid /
healAmount items, reachable mid-fight via the Pack button in the lower menu,
which renders during combat) wrote `scholar.health` directly. In a fight the
live pool is the fighter's `p.hp`; `tbEnd` overwrites `s.health` from `p.hp`,
so every mid-fight heal printed "+N health" and delivered NOTHING — a
phantom heal. It also cost no combat action, violating the stated rule
("using a consumable from Pack in combat costs your action — eating,
drinking, using items, all of it").
Fix: new `Game.addHealth(n)` routes HP deltas to the fighter in combat
(and can end the fight via tbEndCheck); `useItem` calls
`spendCombatAction('use')` mid-fight. Proof: R1 (heal lands on p.hp, scholar
synced, turn advances).

**R2. Free drinking in combat (BROKE, fixed).** `drinkWater()` cost only
`tickAction(1)` — which early-returns mid-fight, so drinking was completely
free: unlimited hydration at zero action cost. Risky-water sickness (-15)
also wrote the wrong pool (erased at fight end).
Fix: `spendCombatAction('drink')` in combat; sickness routed via addHealth.
Proof: R2.

**R3. Free bad-food damage in combat (BROKE, fixed).** `eatOne`'s
poison/disease/unsafe-food damage wrote `scholar.health` directly — eat
risky food mid-fight, keep the kcal, the damage vanished at `tbEnd`.
Worse: the "COMBAT: eating from pack costs an action" rule NEVER FIRED —
the check was `playerMonster() || state.inCombat`, but `state.inCombat` is
never assigned anywhere (it's only a UI snapshot field), and
`playerMonster()` is null during tb fights (the wild monster is cleared at
combat start). Verified live: real `startCombat` + `eatOne` spent nothing.
Fix: `eatOne` uses `inCombat()` ("the ONLY safe way to check", per the
code's own comment); all 6 HP sites routed via addHealth. Proof: R3.

**R4. Phantom Field Medicine (BROKE, fixed).** `field_medicine`
(`combat: true`, in the ability bar mid-fight) healed `scholar.health`:
+20 HP promised, nothing delivered in a fight.
Fix: routed via addHealth. Proof: R4.

**Sibling sweep — same bug class (broken, fixed):** `trade_of_blows.open_trade`
(combat, cost `{turn, hp: 10}`) paid its HP cost via the `hp:` cost handler's
raw `s.health -= amount` — erased at fight end, so the 10-HP price was free
mid-combat. Handler now reads the fighter's HP for the would-kill block and
pays via `addHealth`. Proof: R6. Other `s.health` writes swept:
sleep/night/day-reset/respawn (combat-guarded or out-of-combat — clean),
`gwTrapTick` (tickAction-gated, can't run mid-fight — clean), `eat()` bulk
(out-of-combat self bar only — clean), `blood_magic` (no `combat: true`,
hidden from the ability bar in fights — clean).

**P. Phantom belltoad reinforcements (BROKE, fixed).** `_pendingPack`
(round-2 chorus arrivals) was set in `startCombat` but never cleared.
Fleeing (door/barrier → `tbEnd('fled')`) bypasses the chorus check, so the
stale pack survived into the NEXT fight: at round 2 `tbAdvance` spawned
belltoads into unrelated encounters, and `tbEndCheck`'s chorus clause held
finished fights open ("another croak answers") for fights that never had
toads. Reproduced end-to-end: belltoad fight → flee → bulldozer fight.
Fix: `resetPerFightFlags()` clears `_pendingPack`. Proof: P1–P4.

**M. Multi-kill single payout (BROKE, fixed).** `tbEnd('won')` paid carcass +
alien-loot + codex-'slain' ONCE per fight on the first monster fighter:
3 kills → 1 carcass, 1 loot roll, second species never marked slain.
`corpseForKill`'s node+species search additionally misfiled same-species
kills onto one corpse (kill 1's carcass landed on kill 2's body).
Fix: per-creature rewards — one carcass + one loot roll per body (snake
segments share per snakeId, so the fix can't dupe snake meat); the corpse
registered at kill time is stashed (`t._deathCorpse`) and preferred;
codex 'slain' per species; grave-robber trophy per body. Economy note for
Steve: loot now rolls per kill (was per fight) — matches "HIGH RISK / HIGH
REWARD per monster" but increases pack-fight loot income; overrule-able.
Proof: M1–M3.

**K. Double-KO declared 'won' for a corpse (BROKE, fixed).** Killing a
winding-up sweeping-beam monster at low HP: death throes fire the beam from
the corpse and kill the player on the same tick. `tbEndCheck` checked
monsters first → 'won' — the 'lost' death flow (`playerDeath` →
village-as-protagonist respawn) never ran, leaving a 0-HP scholar wandering.
Pre-fix proof: `result=won`, `playerDeath` never called.
Fix: player death checked before the monster-victory check AND before the
chorus check (the dead get no encores). Second Wind still gets its chance
(K3). Clean kills still win (K2). Proof: K1–K3.

## SOFTLOCK — probed, held or fixed

- Death on the monster's own turn (bleed/DoT): `seTickFighter` → `tbEndCheck`
  fires correctly. (Note: no fighter DoTs have appliers — see dead code.)
- Stunned monsters skip `seTickFighter` (legacy `m.stunned` consumed first):
  bleed/burn wouldn't tick that turn — moot, no appliers exist.
- Villager death mid-combat: turn order skips dead fighters; `tbVillagerFalls`
  cleans village state. Held (round 1 verified, re-verified via code read).
- Wait-stall: `tbPlayerWait` every turn is legal, but the player has NO
  damage-over-time to stall with (no bleed/burn/poison appliers) — stall-kill
  is impossible. Held by absence.
- Infinite fight: every monster damages or the player can flee (barrier 50%
  stated in grid-edge UI comment; door at Haven). Bunker turtle unseals
  after 2 turns. No 0-damage stalemate found.
- Combat while incapacitated: stun consumed at `tbBeginTurn`; sleep guarded
  ("Not in the middle of a fight.").
- Flee from anywhere: no boss-flee locks found (`tbHasEscape` is beam-lane
  geometry, not fight escape).

## HONESTY — verified

- War Cry: "courage check or lose their next turn" — 60% fail, stun turns:1
  consumed on the monster's turn. Honest. (Costs turn+30 kcal each use: no
  perma-stun loop.)
- Shout: "(2/fight)" — enforced via `f.shouts`. Honest.
- Villager help "+12 HP" — applied exactly. Honest.
- Flee barrier 50%: matches code; edge reads as exit in UI.
- Strike numbers: round-1 fix holds (re-ran honesty suite: green).
- Loom "loses its next round": `loomHesitate` consumed on next monster turn.
  Honest.
- The 4 dead data actions: STILL DEAD (no impls added since round 1) but
  fail-fast verified in a real fight — turn kept, nothing paid, "isn't wired
  up yet". Content debt, honestly labeled. Note: `scream_cheese` has TWO
  paths — working hardcoded `tbPlayerScream` (`c-scream` button, once/day)
  AND the dead data action in the ability bar. A player with the ability sees
  both; the bar one politely refuses. UI-debt flag for a content run.

## DEAD-CODE — findings

- **Fighter statuses fear/slow/bleed/burn/poison: ZERO appliers anywhere**
  (static scan of game/abilityActions/monsterBehaviors/statusEffects/
  encounters/alienPlayers/contests). The whole combat DoT/fear framework —
  tick damage, durations, `seFizzle`, `seMoveMod` — is unreachable in fights.
  Only stun/stun_full are live. Not removed (declared future surface for
  monster design); flagged so nobody balances around phantom DoTs. In
  particular: "poison the monster and wait" does nothing — poison ticks
  `per: dayPart` only, and nothing applies it to fighters anyway.
- `monsterBehaviors.js`: all 4 registered hooks referenced by
  monsterBehaviors.json; no unregistered hook names in data. 24 of 28
  species have empty `preTurnHooks` (unmigrated — by design, incremental).
- `eat()` bulk: live but out-of-combat only. Not dead.
- All combat modules loaded in index.html (re-verified).

## Attack surface that HELD (deeper level)

- Ally farming: impossible — strike targeting offers only monster/hostile;
  `tbPlayerStrike` rejects non-monster targets outright.
- Kill credit: no combat XP exists (progression is ability-XP + stats);
  villager kills pay the same 'won' block as player kills — "hide and let
  allies win" is a legal strategy, villagers risk death (30 HP), loot is
  identical either way. Not a break.
- Flee economy: 'fled'/'routed' pay nothing but knowledge; `identifyMonster`
  on flee matches the fiction (you saw it).
- Practice-on-strike capped at stat 10 (round 1) — no farm.
- In-combat item use now uniformly costs the action (eat/drink/use/dice).
- `activateAbility`'s `tickAction(2)` is a no-op mid-fight (early return);
  the ability bar spends via `tbPlayerActed`. No double-charge, no freebies.
- `tbAdvance`'s 60-guard: only reachable with 60+ consecutive AI turns —
  not realistic; async path has no guard but terminates on player turn.

## Sibling sweep notes

- HP-routing class swept across eatOne/useItem/drinkWater/field_medicine/
  trade_of_blows-cost + triage of every other `s.health` write (list above).
  If a second worker is needed: the same erased-write pattern may exist in
  contest/show reward paths (out of combat scope for this run).
- Per-kill reward change touches `tbEnd` only; `recordWaveKill` was already
  per-monster. `rollAlienLoot` signature unchanged.

## Files changed

- `src/js/game.js`: `addHealth(n)` helper; `resetPerFightFlags` clears
  `_pendingPack`; `eatOne` (6 HP sites + `inCombat()` fix); `useItem`
  (heals + combat action cost); `drinkWater` (action cost + routed sickness);
  `field_medicine` routed; `tbDamage` stashes `_deathCorpse`;
  `corpseForKill` prefers it; `tbEnd('won')` per-creature rewards;
  `tbEndCheck` player-death-first reorder.
- `src/js/abilityActions.js`: `hp` cost handler combat-aware.
- New proof tests (5 files, 59 checks): listed at top.
- Ontology validator: 47/47 green after changes.
