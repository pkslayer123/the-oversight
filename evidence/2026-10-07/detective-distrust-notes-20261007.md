# Detective playtest: the distrusted detective (2026-10-07 ~06:30 CDT run)

Archetype 6 (detective). Angle: the detective loop × the Everyone Acts NPC
economy (9da6c50, shipped this morning) — confrontations drop trust, and
trust<20 + fear>70 makes villagers flee from the player. Played the seam.

## Critical finding: stale-base revert of game.js in the worktree (REPAIRED)

The worktree's `src/js/game.js` had been silently reverted to a pre-Everyone-Acts
base by a sibling's stale checkout: `npcTakeAction` (3 refs in HEAD) was GONE
from the worktree, `villagerTurn()` was the old 50%-wander version, and the two
`try { this.villagerTurn(); }` call sites plus the Drama-E1 audio-visual sync
block were missing. `git show HEAD:src/js/game.js | grep -c npcTakeAction` = 3
vs worktree = 0. If committed, the next bump would have shipped a build with
the entire NPC action economy silently dead.

Repair: surgically restored exactly the 4 missing HEAD regions into the
worktree file (Everyone Acts villagerTurn+npcTakeAction, step-code hook,
doAction hook, audio-visual sync), verified the 4 regions contain zero
sibling-unique content, `node --check` clean, repaired file byte-identical to
HEAD's game.js (the worktree had no unique game.js content — all sibling
feature lines were already committed). Everyone Acts proof test
`scripts/test-npc-actions-20261007.js`: 19/19 green on the repaired tree.

## Shared-index fossil (NOT touched — documented for the main agent)

The shared index still carries the known fossil: staged DELETIONS of committed
work across ~15 files. Largest: foreignSpeech.json (1533), game.js (1492),
drama.js (923), journal.js (908), nameCultures.json (890), conversation.js
(781), plants.json (672). The game.js staged insertions (160 lines) were
audited: all stale duplicates of committed code (7x7 grids, `village.px ?? 3`),
no unique work. Per the standing rule (never reset the shared index — siblings
may have index-only work elsewhere), the index was left untouched. All active
loops already use private-index commits, which route around it. A bare
`git commit` would still detonate it.

## Bug 1 (fixed): endConvo never cleared engagement

`v.engaged[vid]` is set by `setEngaged(vid, 2)` / `socialTick` and only lapses
via `npcBatchTurn` (2 batches ≈ 64 ticks). `endConvo` (conversation.js, the
winning definition) never cleared it — after saying goodbye, the villager
stood frozen and `villagerTurn()` skipped them instead of resuming their
needs-driven life (fleeing, foraging, seeking people). Fix: delete
`v.engaged[vid]` in `endConvo`.

## Bug 2 (fixed): NPC social talk warmed only one side

Shipped design says lonely villagers "seek out people and talk (building trust
both ways)", but `npcTakeAction`'s social branch only called
`bumpTrust(rid, 1)` — the initiator's trust in the player. The listener gained
nothing. Fix: also `bumpTrust(best, 1)`. This is the ambient repair path for
relationships the detective damages: a village that talks heals.

## Play verdicts (distrusted detective, all on repaired tree)

- `startConvo` on a scared villager (trust 12, fear 85, adjacent) OPENS
  normally — no refusal, no fear-aware opening line. Interrogation is never
  blocked; the fiction reads as them putting on a brave face. Acceptable.
- `isEngaged` correctly freezes the villager mid-conversation (verified they
  hold still during `villagerTurn` while engaged).
- `confrontDoubt` while distrusted works; deflected at low trust (12→9),
  confessed at moderate trust. confessP math holds.
- After goodbye + fix 1, the scared villager flees on the very next
  `villagerTurn` with the "edges away from you, wary." announcement, moving
  away, fear ticking down. The aftermath reads ALIVE, not broken.
- `confrontGossip` (confront the source of rumors about you) is a working
  repair path: clear-the-air (+trust, gossip dims dampened) or backfire
  (story gets worse). Both are content.
- Ambient repair measured: 30 village chats after a confrontation moved trust
  back upward via fix 2. A damaged relationship is recoverable through village
  life, not just direct player action. Good.
- Trust gains are throttled by `trustGainMult` (confession +5 nominal → +3
  actual). Intended design; noted.

## Proof test

`scripts/test-detective-distrust-repair-20261007.js` — 9/9 green:
endConvo clears engagement; freed scared villager flees with announcement;
flee burns fear; both chat participants gain trust; full
confront→goodbye→flee→ambient-repair loop stays alive.

## Regressions

- test-npc-actions-20261007.js: 19/19
- test-detective.js: 43/43
- test-gossip-rumors.js: 11/11
- test-detective-fun.js: 8/8
- test-detective-nonverbal.js: 19 pass, 2 fail — PRE-EXISTING seed-7 flake,
  reproduced on pristine HEAD worktree (b417455). Not caused by this run.

## Play script

`scripts/play-detective-distrust-20261007.js` — the full distrusted-detective
play (interview → gossip cross-ref → distrust setup → confront → aftermath →
repair paths → ambient economy). 0 failures on the repaired tree.
