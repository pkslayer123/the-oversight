# Break-it: combat engine r3 (2026-10-10)

Target: turn-based combat engine — fresh angles vs r2 (attack-less crashes,
leech honesty, feastBurn integrity, dead_aim double-advance, snake split,
stat caps, refused-ability XP). Canon: docs/CANON.md read first, then
docs/MONSTER-WAVES.md + docs/BALANCING.md (feastburn section) + docs/SYSTEMS.md.
No dedicated combat-engine canon doc exists — engine rules live in code
comments + BALANCING.md. (r2's drive-by stale assertion also noted.)

Worker: hostile-player attacks with full code knowledge; node harness, FULL
src/js list in index.html order (DOM-only modules excluded), shared seeded
RNG installed BEFORE eval.

## CATCHES (all fixed, proof below)

### H1 — villager haymaker announced the pre-mitigation swing (THE CATCH)
`tbVillagerTurn` announced `Mara puts everything into the swing — HAYMAKER! (12)`
(the doubled roll) BEFORE `tbDamage` applied armor/bunker; the engine then
printed its own `Mara hits turtle for 2.` Two contradicting numbers two lines
apart. Proved in harness vs a bunkered speedbump_turtle: announced 12, landed 2.
Fix (game.js): capture `tbDamage`'s return and announce the LANDED number
after it — the same convention as the player strike line
(break-it combat r8 2026-10-09). Now reads `…HAYMAKER! (2)`.

### H3 — sibling sweep, same bug class (pre-mitigation announcement)
- gallowdeer `tbAntlerThrash`: `Something thrashes its antlers at you —
  getting close has a price. (14)` announced the raw roll before armor/dodge —
  a dodge then read `(14)` next to `it misses clean.`
- the breather's `tbRechargePaw` foreleg lash: same pattern.
Both now announce no number in the fiction line; `tbDamage`'s own line
carries what landed. Swept the rest of the class: monsters.json `knownCue`s
(no damage numbers promised), monsterBehaviors.js / sigW3a-c /
abilityActions.js / fieldFights.js clean; glasswing dive lines are pre-combat
trap ticks with a direct, matching write — honest as-is, untouched.

## HELD (attacks attempted, engine resisted)
- E1 XP economy: no kill-XP exists anywhere in the engine; practice is granted
  per ACTION only (strike +1 str/+1 agi, dodge +1 agi; whiffs grant zero),
  hard-capped at 10. `tbPlayerStrike` has exactly 2 `tbDamage` call sites
  (the strike + the single-target gristlefit lash) — no player AoE faucet
  exists to double-count XP from.
- E2 friendly fire: deliberate strikes at villagers are REFUSED with the
  betrayal line, HP untouched. The involuntary gristlefit lash CAN kill a
  villager (the risk is real) but pays zero XP (kills pay nothing, ever) and
  registers a real corpse. Mid-fight corpse interaction is refused at the
  engine level (`_cellInteract`: "Not mid-fight — finish it first"); grid taps
  are move-only in combat.
- H2 crit honesty: DEAD AIM's "×2.5" line states exactly the HP the crit
  removed; the aim flag is consumed by the shot.
- S1 turn economy: stunned monsters consume stun exactly once — no move, no
  damage, no telegraph. Player death holding second_wind resumes the SAME
  fight at 1 HP with no duplication; a second death the same day correctly
  ends 'lost' with playerDeath running. `tbEnd`'s finally nulls `tbfight` —
  no phantom fight state leaks into the new life.

## Pre-existing failures (on HEAD, not mine — verified via git stash, left for owners)
- `test-combat-break8-20261009` B1a: asserts 30 monsters, data now has 56.
- `test-ability-honesty-20261009`: fishing modifiers not wired to nets.

## Proof
- scripts/test-combat-break3-20261010.js — 34/34 × 3 seeds (7, 999, 424242).
  Pre-fix: 1 FAIL (haymaker announced-vs-landed).
- Regressions re-run on the post-rebase base (master had moved twice mid-run —
  sibling landed playtest-hunter rebase + depletion fix): combat-break 19/19,
  break2 31/31, r2-doubleko 8/8, r2-multikill 8/8, abilities 67/67, ontology
  62/62 green.

## Design notes
- No canon invention; no mechanic changes — announced numbers now match the
  existing math. No [needs-eyes]: copy-only honesty corrections, no
  feel/combat-number/UI change visible to a player.

## Landing notes (coordinator)
- Master moved twice during the worker run (842102ec → b155bb7c → 1586d227:
  sibling playtest-hunter rebase + depletion fix + reaper idempotent fix), so
  the worker's commit was rebased onto the new tip (2c374bb7 → 504f73a2 →
  cdb09004), proof + closest regressions re-run green on the new base, then
  merged via --ff-only. Merge exit captured unpiped (MERGE_EXIT=0).
- Post-merge the main-tree index held a sibling's stale pre-commit staged
  version of scripts/worktree-reap.sh (safe-commit.sh private-index leftover
  from the sibling's 1586d227) — superseded by the commit, resynced with the
  sanctioned `git read-tree HEAD`. Main tree verified clean after.
- Merged locally, pending ship. No bump, no push — the ship loop owns deploys.
