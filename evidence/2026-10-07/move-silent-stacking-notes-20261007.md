# move_silent stacking balance measurement — 2026-10-07 (report only)

## Purpose
Steve's balance call, with data. Commit f659485 wired `stealth.move_silent`
(+0.3 stalk passive) into the real `preyReaction` flee roll (food.js line
1215). The 21:50 run measured the passive in ISOLATION (aware pinned 0.8 both
arms: ~117-130/200 unarmed vs ~52-68/200 stalk-held). This measurement adds
the real STACK: the stalk ACTION's aware-drop (aware -> 0.2) layered under
the passive — the combination the notes warned produces ~0 bolts/200.

## Method
- Pristine `git archive HEAD` (253a3bf) extract at /tmp/headx. Seeded A/B/C
  over the REAL `preyReaction`; identical mulberry32 streams per arm per seed
  (reset before each arm); kcal+energy saved/restored around trials (each bolt
  charges the real 50 kcal lunge). Same harness recipe as
  move-silent-notes-20261007.md (full module list in index.html order minus
  DOM-only modules; window stubbed for eval only, deleted before playing).
- Close range every trial (turkey 5,5; scholar 4,4 => dist 1, -0.10
  point-blank modifier applies in all arms). wild_turkey, 200 trials/arm,
  seeds 7, 42, 99 (same seeds as the 21:50 run for comparability).
- Arms:
  - **baseline**: no stalk held, no stalk action; aware = pin level.
  - **stalk-only**: stalk ACTION's aware-drop applied (aware -> 0.2) but the
    stalk PASSIVE zeroed. Synthetic counterfactual — the pre-f659485 wiring
    plus the old stalk action. (In real play you hold stalk to use the
    action, so the live behavior is the third arm.)
  - **stalk+move_silent**: stalk action aware-drop + stalk held (passive
    +0.3) = the LIVE behavior after f659485.

## Results (bolts/200)

| seed | aware | baseline | stalk-only | stalk+move_silent |
|------|-------|----------|------------|-------------------|
| 7  | 0.8 (noticed something) | 117 | 13 | 0 |
| 7  | 0.6 (wary baseline)     | 79  | 13 | 0 |
| 7  | 0.95 (it saw you)       | 175 | 13 | 0 |
| 42 | 0.8                     | 130 | 16 | 0 |
| 42 | 0.6                     | 91  | 16 | 0 |
| 42 | 0.95                    | 185 | 16 | 0 |
| 99 | 0.8                     | 122 | 18 | 0 |
| 99 | 0.6                     | 82  | 18 | 0 |
| 99 | 0.95                    | 185 | 18 | 0 |

Villager pinned: the run used whatever genRoster produced (identical across
arms within a seed, so the A/B is unbiased).

## What the numbers mean
- The 0/200 in the stacked arm is **not** seed luck — it's mathematically
  forced: after the aware-drop, fleeP = 0.2*0.9 - 0.10 (point blank) - 0.30
  (passive) = -0.22, and `Math.random() < negative` never fires. Every seed
  agrees exactly, which corroborates rather than suspects the code.
- stalk-only lands at 13-18/200 — matches the theoretical 0.08 residual
  (0.18 aware-base minus 0.10 point blank). The old stalk action alone already
  made the strike ~92% safe.
- The passive's real job in the stack is erasing that last ~8%: 13-18/200 ->
  0/200. By itself (aware 0.8, no action) it halves the bolt rate; layered
  under the aware-drop it converts "near-certain" into "certain."
- Note the aware=0.95 row: the stalk action's aware-drop erases even a
  spotted animal (0.95 -> 0.2) BEFORE the flee roll, in ALL stalk arms —
  including pre-f659485. "It saw you move" no longer means "no clean shot"
  once you stalk; the fleeP=1 branch never survives the drop. That interaction
  predates f659485 (stalk_prey always did `min(aware, 0.2)`); the passive just
  makes the outcome absolute.

## No numbers changed
This is Steve's balance call. Measurement script kept as a new untracked file:
scripts/test-move-silent-stacking-20261007.js (exits 0 on successful
measurement; not a pass/fail gate).
