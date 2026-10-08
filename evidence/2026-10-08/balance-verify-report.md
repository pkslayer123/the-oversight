# Balance verification report — Hunter Stalk nerf feel + one_person_army XP honesty

Worker: balance-verify | base commit 5b266b2 | date 2026-10-08 ~00:30 CDT
READ-ONLY on all src/data files. Deliverables: proof scripts + this note only.

Scripts:
- `scripts/test-hunter-stalk-nerf-20261008.js` — Stalk nerf feel pass (5 seeds)
- `scripts/test-xp-doublecount-20261008.js` — one_person_army double-count proof (characterization)

Both run via the full node harness (src/js eval in index.html order, DOM-only
app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js excluded, window stubbed
for eval then deleted, mulberry32 seed with SEED env override).

## 1. Hunter Stalk nerf feel (stealth.move_silent 0.30 -> 0.15, commit 9ef4d1e, Steve's call)

Resolved modifier at this commit confirmed live: `stealth.move_silent = 0.15`.

Bolt chance measured at the real player-path roll (`Game.preyReaction`, the strike
roll huntAnimal calls), 200 seeded trials per config, cottontail rabbit, tracker L1,
day, non-hunter, dist 2 unless noted:

| seed | A baseline (no stalk) | B nerfed (0.15) | B0 old (0.30, in-memory) | C stalked approach (active+passive) | D full stack |
|------|----------------------|-----------------|--------------------------|-------------------------------------|--------------|
| 1    | 42.5%                | 29.5%           | 12.5%                    | 0/200 (0%)                          | 0/200 (0%)   |
| 2    | 39.5%                | 24.0%           | 10.0%                    | 0/200 (0%)                          | 0/200 (0%)   |
| 3    | 38.5%                | 28.0%           | 17.5%                    | 0/200 (0%)                          | 0/200 (0%)   |
| 4    | 35.5%                | 28.5%           | 12.5%                    | 0/200 (0%)                          | 0/200 (0%)   |
| 7    | 39.0%                | 24.0%           | 14.5%                    | 0/200 (0%)                          | 0/200 (0%)   |
| analytic fleeP | 0.42 | 0.27 | 0.12 | -0.09 -> 0 | -0.61 -> 0 |

Configs: C = stalk action used (aware 0.6 -> 0.2, verified in-game: the aware drop
IS the mechanism) + nerfed passive. D = C + tracker L3 + hunter occupation +
night + point-blank dist.

Feel verdicts (as a player, Steve's "feel over math" — overrulable):

1. **Stealth is still meaningful.** Nerfed passive cuts the cold-approach bolt rate
   from ~39% to ~27% — a real, felt 15-point shave. It is no longer the near-free
   0.30 crutch (old: ~13% bolts cold).
2. **The nerf lands where it should.** A cold stalk (no approach work) now bolts
   ~1.9x as often as before. But a *real* stalked approach — use the Stalk action,
   close distance — still goes fully silent (0/200 bolts on all 5 seeds), because
   the active's aware-drop (0.2 -> fleeP base 0.18) plus the 0.15 passive and
   tracker L1 push fleeP negative.
3. **Zero-bolt stacking CONFIRMED.** Full stack: 0/200 bolts on all 5 seeds,
   fleeP analytic -0.61. Earlier math said yes; it holds at the nerfed value.
4. The gameplay loop the numbers describe: the passive alone is a meaningful
   edge, the active+passive combo is the reliable hunter fantasy, and stacking
   (night, occupation, tracker levels, point blank) still rewards the full
   investment with total silence. That is the right shape for the nerf — Steve
   can overrule, but I would not touch it further.

## 2. one_person_army double-count proof (before-state)

The 2026-10-07 23:55 note is accurate. At `game.js` activateAbility (~14323/14327):
one activation calls `this.noteAbilityUse(id)` directly AND `this.gainAbilityXP(id, 1)`,
and gainAbilityXP itself calls `this.noteAbilityUse(abilityId)` (~14420). Verified
behaviorally at this commit (all green, seeds 1/3/7/9):

- `noteAbilityUse('war_cry')` invocations per single `activateAbility('war_cry')`: **2**
- `abilityUseLog` entries appended per activation: **2**
- `synergyAttempts` for a probe synergy (simultaneous legs war_cry+rage, minLevel 1,
  injected in-memory) after ONE activation following a rage use: **2**
- XP granted per activation: **1** (honest — the bug inflates use-logging, not XP)

Consequence for one_person_army (3 combined-attempt unlock via simultaneous legs):
it fires after **2 real combined activations, not 3**. The combat-XP grant itself
works (the original problem — brawler abilities never leveling from combat — is
fixed); the attempt counter is what's dishonest.

Assertion style chosen (stated plainly): this is a **characterization test** —
it encodes the CURRENT buggy behavior and is GREEN at this commit, documenting
the bug. It will go RED when the fix worker lands (counts drop to 2->1); at that
point the assertions should be flipped to the single-count expectations (each
check comment marks this). It does NOT assert the correct post-fix behavior now.

Fix worker note: the cleanest fix is removing the direct `noteAbilityUse(id)` call
in activateAbility and letting gainAbilityXP own it (useAbility already single-logs);
also check the data-driven `useAbility` path never grants XP — abilities used that
way never level, which is the same one_person_army reachability class of bug.
