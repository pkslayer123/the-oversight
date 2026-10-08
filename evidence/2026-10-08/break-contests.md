# Break-it: contests system (2026-10-08)

Hostile-player audit of the contests module (`src/js/contests.js` + its
Alien Players integration in `src/js/alienPlayers.js`). Proof script:
`scripts/test-break-contests.js` — 63/63 green after fixes (was 61/63,
2 genuine breaks found and fixed).

## Attacks attempted

### EXPLOIT
- **Eligibility bypass**: pre-day-14, exiled player, dead player (hp 0),
  killed villager — all correctly excluded; 40 `fireContest` runs never
  cast a dead villager. HELD.
- **Countdown schedule/double-fire**: `firesDay = day+1` exactly; no early
  fire; `resolveContest` idempotent; `contestTick` refuses while
  `pendingContest` set. HELD.
- **Reward duplication**: watch-mode multi-take verdicts — pantry
  "Winner's share" granted exactly once per winning villager, never
  phantom; player win grants exactly one alien-loot roll. HELD.
- **Bet exploits**: offered only at kcal≥200 (choice hidden otherwise);
  stake deducted once; `ac.bet` guard blocks re-bet; settles exactly +400
  or +0; rides on first-taken (label names `ids[0]`, engine pays `i===0`).
  HELD.
- **Cheer/judge manipulation**: +0.05 / veteran +0.10, capped 0.15 at both
  accumulate and verdict; verdict adds to winOdds. HELD.
- **XP farm**: no `do`-block grants xp; playing a contest mints 0 xp. HELD.
- **Queue-jump**: direct double `fireContest` overwrites pending (live path
  guarded by `contestTick`; debug-only). Documented, not live-reachable.

### SOFTLOCK
- **Phase-graph validation, all 44 pool contests** (bare + choice-prefixed
  + watch phases): every phase has ≥1 choice, every numeric `next` in
  range, every terminal in {WIN,LOSE,DIE,REFUSE,VERDICT}. CLEAN.
- **Full auto-play** of all 44 contests in participant AND watch mode
  (hostile choice-0): every run reached resolution, `activeContest`
  cleared. CLEAN.
- `contestChoose` on null/done/bad-idx → null, no crash. Unknown contest
  id in `resolveContest` → pending cleared, no throw. Contestant dying
  mid-countdown → recast with announcement, show goes on. HELD.

### HONESTY
- Countdown copy ("The grab comes at dawn. One more day.") vs
  `firesDay=day+1` vs HUD chip (`in 1d`). HONEST.
- Bet copy vs 2x payout. HONEST. Cheer percentages vs engine. HONEST.
- Gauntlet closer displayed odds vs rolled odds (wounds-before-choice).
  HONEST.
- **FEAR**: 28 mentions, all narrative. The game makes NO mechanical fear
  claims in contest copy, and the engine never writes villager fear needs.
  Nothing to violate — HONEST (documented as narrative-only).
- Eligibility text ("day 14+", ages 15–72) vs engine. HONEST.
- **BREAK 1 — benevolent lifeline lied in watch mode**: `apContestInterference`
  fired the "killing blow... misses" note and returned `deathSave=true`
  even when the player wasn't taken; `_contestVerdict` honors `deathSave`
  ONLY for `pid==='player'`, so a villager could die on camera right after
  the feed promised the killing blow would miss. FIXED: lifeline now fires
  only when the player is among the taken (`alienPlayers.js`).
- **BREAK 2 — silent winner's HP tax**: every player win cost 5 HP with
  zero feedback (`_contestEnd`). FIXED: announced out loud —
  "The lights take their cut. Winning marks you. (-5 health.)"
  (`contests.js`), matching the established `(-5 health)` pattern used by
  food-poisoning in `game.js`.

### DEAD-CODE
- `contests.js` in `index.html` script list; all 13 ontology `provides`
  exist on Game; live callers verified: `game.js` dawn path calls
  `resolveContest`/`contestTick`/`fireContest`, `app.js` wires
  `contestChoose` to choice buttons.
- Alien Players integration is REAL: `apContestInterference`,
  `apAdjustFavor`, `apCarePackage` all defined and consulted at runtime
  (verdict consults interference; favor moves on televised wins). Not
  comments.

## Fixes landed
- `src/js/alienPlayers.js` — lifeline gated on player participation
  (+ ontology note `lifeline_player_only`).
- `src/js/contests.js` — win tax announced (+ ontology note
  `win_tax_announced`).
- `scripts/test-break-contests.js` — proof script (63 assertions).

## Sibling sweep
- Same "undeliverable promise" class: sadistic rigging note is generic
  and its `winMod` applies to all verdict rolls — honest. Fan-favor ±8%
  note ("the crowd loves you") buffs your villagers in watch mode —
  acceptable fiction, no promise broken.
- Same "silent stat tax" class: other `-5 health` writes in `game.js`
  (food poisoning) already announce `(-5 health)`; `dmg`/`heal`/`kcal`
  in contest `do`-blocks surface via sysSay or visibly-moving bars;
  trauma changes ride on loudly-announced deaths/refusals. No further
  silent taxes found in the contest module.

## Verdict
System HELD against every exploit/softlock attack; two honesty breaks
found and fixed with proof. Solid.
