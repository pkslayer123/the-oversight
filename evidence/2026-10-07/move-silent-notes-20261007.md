# move_silent wiring — 2026-10-07 (flesh-out loop, move_silent job)

## What changed (delivered as /tmp/patch-move-silent.patch, vs pristine HEAD 9d0103b)

Two hunks, no data changes, no @ontology header changes:

1. **src/js/food.js — `preyReaction`, +1 line:**
   ```js
   fleeP -= this.modTarget('stealth.move_silent', 0, {}); // stalk passive (abilities.json): quiet movement in general
   ```
   Inserted right after the tracker-level line. The cheapest honest wiring from
   the engine-owner backlog: the defined-but-never-consumed stalk passive
   (abilities.json, add +0.3) now subtracts from the real flee roll whenever the
   player holds the stalk ability. It stacks with the stalk action's aware-drop
   (separate mechanism) — the A/B below isolates the passive by pinning aware at
   0.8 in both arms.

2. **src/js/abilityActions.js — `stalk_prey` comment, reworded:**
   The old parenthetical claimed the passive "now feeds the flee roll" —
   aspirational and false at HEAD (zero modTarget readers). Now that the wiring
   exists the comment is true, so it points at the real wiring:
   "wired into the preyReaction flee roll (food.js, via modTarget)".

## Why

- verify-closeout-notes-20261007.md §3 and hunter-dead-modifiers-notes-20261007.md
  document `stealth.move_silent` as the single genuinely-dead modifier (the other
  five 2108-backlog items were honestly removed by cf3049d). This job closes it.
- Play-feel note: holding stalk is now strictly better than not holding it for
  the strike approach, on the passive alone — the passive was a lie before.

## Proof — scripts/test-hunter-move-silent-20261007.js (NEW, untracked)

Seeded A/B over the REAL `preyReaction` flee roll, identical mulberry32 streams
per arm (reset before each arm), 200 trials/arm, aware pinned 0.8 in both arms
so the passive is isolated from the stalk action's aware-drop. Full harness
module list in index.html order minus app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js;
`global.window = global` stubbed only for the eval phase, deleted before
playing. kcal+energy saved/restored around the loop (each bolt charges the real
50 kcal lunge cost). Static pins: `s.stalkActive === undefined` (honest removal
still holds), abilities.json pipeline value = 0.3 (flat, no scaling),
modTarget resolves 0 without stalk / 0.3 with stalk held.

Results against the PATCHED pristine extract (REPO_ROOT=/tmp/w-movesilent):

| seed | unarmed (no stalk) | armed (stalk held) | diff |
|------|--------------------|--------------------|------|
| 7    | 117/200 bolts      | 52/200             | -65  |
| 42   | 130/200            | 68/200             | -62  |
| 99   | 122/200            | 58/200             | -64  |

24 ok, 0 FAIL. Margin threshold was 15/200; observed diffs ~62-65/200, roughly
twice the theoretical 0.3 probability shift (shared-stream pairing amplifies the
crossing effect) — comfortably above the margin on all seeds.

Negative control: SEED=7 against the UNPATCHED pristine extract fails as it
should — consumer scan finds none, armed=117 unarmed=117 (passive did nothing).
The test discriminates the wiring, not just the roll.

## Balance note (coordinator/engine-owner)

The dead-modifier notes warned this stacks with the stalk action's aware-drop
(aware 0.8→0.2 + flee -0.3 ⇒ ~0 bolts/200 on a wary turkey at close range).
That was already true in the closeout A/B (0/200 stalked). This wiring makes
stalk-held strictly better in every approach; it does not add a new system, so
any retuning is a balance call, not engine work.

## Tree safety

Worked entirely from `git archive HEAD` extracts (/tmp/w-movesilent,
/tmp/w-movesilent-pristine). In the repo tree only three NEW untracked files
were created: the proof script, this notes file, and the patch is at
/tmp/patch-move-silent.patch (not in the repo). No tracked file modified, no
git add/commit/reset/stash, no shared-index contact. Coordinator: apply the
patch and commit via safe-commit.sh.
