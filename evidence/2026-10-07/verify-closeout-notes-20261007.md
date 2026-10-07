# Backlog close-out verification — 2026-10-07 (Steve 2026-10-05)

Worker assignment: ember-timing proof re-run, 'miss' audio census re-run, stalkActive stale-pin update. NO src/js edits (game.js is a sibling's active area). All proofs run against a pristine HEAD extract (`git archive HEAD` → /tmp/w-closeout) at base 9809c2c.

## 1. EMBER TIMING — PASS (Part C now green)

Commit ce0864b ("Fix Inspiration ember timing: transition turn is the first ember turn") landed the fix diagnosed in drama-wiring-notes-20261007.md §3.

`node scripts/test-drama-wiring-fixes-20261007.js` (full index.html module order minus app.js/sprites.js/tile-scenes.js/move-anim.js; window stubbed for eval then deleted):
- SEED=20261007 (default): **PASS** — Part A (floatText routing + 33-kind census), Part B (knowledgeReveal), Part C all green.
- SEED=99: **PASS** — Part C: cycle 1 = 2 visible ember turns (design 2), cycle 2 = 1 (design 1), cycle 3 = 0 (design 0).

Verdict: the designed 2/1/0 timing now holds. Note: the script's Part C header still reads "(EXPECTED-FAIL pin)" — stale label; the drama worker (script owner) should flip it or retire the script per the sibling's cleanup (this file is staged-deleted there).

## 2. 'MISS' AUDIO VOICE — PASS (census zeroed)

`node scripts/test-audio-hooks-static-20261007.js` at pristine HEAD: **PASS — 0 fired-but-undefined call sites.** Commit 15c9510 ("Audio: 'miss' voice for brawler haymaker whiff + audio census test") closed the pre-existing gap the drama worker flagged (haymaker whiff fired `audioEvent('miss')` with no voice). No action needed.

## 3. STALE stalkActive PIN — UPDATED (no dead-flag assertions)

`scripts/test-hunter-reverify-20261007.js:154` pinned `s.stalkActive === true`. That flag was REMOVED in cf3049d (set-and-never-read; the comment claiming preyReaction read it was aspirational — hunter-wiring-notes §3).

Replaced with pins on the real current pipeline (hunter-wiring-notes §"Per-fight flags"):
- stalk ACTION: aware 0.8 → ≤0.2 (pre-existing check, kept).
- Seeded A/B over the REAL `preyReaction` flee roll, identical random streams per arm (mulberry32(SEED) reset), 200 trials/arm: unarmed = no stalk held + aware 0.8; armed = stalk held + aware 0.2 (post-stalk_prey state).
  - SEED=7: 65/200 bolts unarmed, **0/200 stalked**.
  - SEED=42: 80/200 bolts unarmed, **0/200 stalked**.
- `stealth.move_silent` pipeline value = 0.3 (flat, no level scaling — verified in abilities.json).
- `s.stalkActive === undefined` (honest removal pinned).
- `s.cleanShotReady === true` after the exploreActs loop (clean_shot arms it; huntAnimal consumes +0.25 — wired in cf3049d).

Harness trap found and fixed: each simulated bolt charges the real 50 kcal lunge cost, so 400 preyReaction calls drained scholar kcal/energy and broke the downstream dress_game checks. Trials now save/restore kcal+energy around the A/B. (First attempt without the restore: 47 ok / 5 FAIL; after restore: 49 ok / 3 FAIL on both seeds.)

Result after update (original script: 44 ok / 4 FAIL — the 4th FAIL was the stale stalkActive pin):
- SEED=7: **49 ok, 3 FAIL** — the 3 FAILs are the script's intentional STILL-BROKEN/PARTIAL pins of still-open items (stale §E static audit; kill-line naming deferred to engine owner), identical before and after my change.
- SEED=42: **49 ok, 3 FAIL** — same 3 intentional pins.

## Tree-safety notes

- Worked entirely from `git archive HEAD` extracts (/tmp/w-closeout); candidate edits tested at /tmp/candidate before touching the worktree. Never read dirty worktree files for source.
- This run's three test scripts are staged-deleted in the shared index by a sibling's uncommitted cleanup (54 staged deletions), with byte-identical untracked worktree copies. HEAD (9809c2c) still has all three — HEAD is the source of truth. The updated test file is committed back to HEAD via private index (safe-commit.sh); the shared index and the sibling's staged cleanup were NOT touched. Coordinator: reconcile with the sibling before their cleanup commit (they will need to re-delete or keep the updated file).
- No src/ changes, no game.js edits, no pushes, no jest runs (plain node proofs only).

## Flags

1. Drama Part C "(EXPECTED-FAIL pin)" header text is now stale — cosmetic only, owner should update.
2. Reverify §E/§F still carry intentional FAIL pins for the still-open items (§E's static audit is stale post-cf3049d; §F kill-line naming was deferred to the engine owner by the hunter worker). Not regressions.
3. Nothing else broken found. All three close-out items verified green at the committed state.
