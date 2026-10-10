# Villager experiences count toward wave unlocks — build note 2026-10-10

Steve's order: "Wave unlock should include villager experiences not just the players. But don't weaken the definitions. Idk playtest it."

## The VILLAGER XP LAW

A villager's blow-by-blow encounter with a wave-N monster (fight, survive,
flee, or kill) feeds the wave-unlock engagement lanes AND the 5/5/4/3/2
deed bars exactly like the player's — the village is the protagonist.
Definitions NOT weakened: same bars, same distinct-monster counts, keyed by
monster type (villager + player facing the same hushwolf = one count; the
same villager facing the same type twice = one count).

What counts (fieldFight outcomes): `vKill`, `mFlee` (drove it off), `vFlee`
(fled — same as the player fleeing). What records nothing: `evade`
(pre-contact), `vDie` (the dead told no tale), `alreadyDead` (a corpse is
not a fight).

## What was actually broken (2 bugs, both fixed)

1. **The fieldFight deed wrap never attached** (progression.js). The lazy
   `_attachFieldFight` was an **arrow function** — `.call(this)` on an
   arrow is a no-op, so `this` was the module scope, not Game, and the
   guard returned every time. Result: NO villager fieldFight ever fed
   `wavesFaced` — patrols, wild encounters, expeditions, aid-crisis fights
   were all invisible to the unlock gates and the deed bars. Fixed: regular
   function + attach attempts at init, on `depart` (day-1 fights fire before
   the first endDay), and on `progDaily` (belt and suspenders).
2. **vDie/alreadyDead over-recorded** (latent — masked by bug 1, would have
   fired the moment the wrap attached): the wrap excluded only 'evade', so a
   dead villager's death and a found corpse would have counted as
   "experience". Now allow-listed to vKill/mFlee/vFlee per Steve's order.

The kill lane (`waveKills` via `recordWaveKill`) was already village-wide —
villager kills fed it from patrol/wild/expedition call sites.

## Proof

- `scripts/test-villager-wave-xp-20261010.js` — 21/21 × 3 seeds (1/2/3).
  Real fieldFights with controlled RNG: villager vKill feeds, vFlee feeds,
  vDie doesn't, alreadyDead doesn't, evade doesn't, villager+player same
  monster id = one distinct, villager-ONLY fights unlock wave 3 at day 25,
  bars unchanged (waveUnlockEngage()[2] === 2).
- Before/after (stashed pre-fix tree): 13 pass / 8 fail — pre-fix, NO
  villager fieldFight fed the deed at all (attach bug).
- Regressions: `test-deed-gate-20261010.js` 68/68, `test-bal-waves-20261010.js`
  30/30, `test-monsters-break-r14-20261010.js` 116/116.

## Pacing playtest (Steve: "idk playtest it")

`scripts/villager-wave-pacing-20261010.js` — 12 seeds × competent × 60 days,
player-only (pre-fix tree) vs villager-inclusive (fixed tree), deed sources
attributed via stack sniffing.

| | player-only | villager-inclusive |
|---|---|---|
| wave-3 unlocks | 4/12 | 9/12 |
| unlock days | 25–28 | 25–27 |
| eng(2) distinct total | 17 | 32 |
| villager fieldFight deeds | 0 | 134 |
| player TB deeds | 64 | 72 |

Verdict: unlocks do NOT arrive trivially early — the day-25 floor is the
binding constraint (earliest possible day is 25 either way). Villagers
roughly double engagement, so the engagement lane fires more reliably in
organic play, but the definition (2 distinct faced) and the floor are
unchanged. Pacing stays sane.

## Files

- `src/js/progression.js` — deed feed: arrow→function fix, vKill/mFlee/vFlee
  allow-list, attach at init/depart/progDaily.
- `src/js/game.js` — unlock comments document the villager XP law.
- `docs/PROGRESSION.md`, `docs/MONSTER-WAVES.md` — law written down.
- Raw pacing JSON: `/tmp/pacing-pre.json`, `/tmp/pacing-post.json`.
