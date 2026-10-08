# Socialite run — daily social fabric (2026-10-08, ~04:00–04:25 CDT)

Worktree: `~/workspace/worktrees/playtest-socialite`, base `cd78614`, commit `3d23533`.
Territory (new vs yesterday's moot/ambush/liar/exile scenario suite): daily haven
conversations + coherence, gossip propagation with distortion, trust building over
days, "can we talk?" requests, player→villager teaching, party building.

## Fixes shipped (3)

### 1. dlg:react trust farm (convo-dialogue.js, convo-beats.js, conversation.js)
After a topic answer whose thread had no beats left, `dlg:react` was offered
forever; every tap printed `"Anyway." A small smile.` and granted +0.5 trust with
no cap (probe: 12 taps = +6 trust on a dead button). The old wind-down counter
only incremented on formally-dry threads (via `dlg:more`), so threadless
wind-downs never engaged it.
- convo-dialogue.js: every beat-less react increments `c.reactDryCount`
- convo-beats.js: menu hides `dlg:react` after 2 consecutive dead reacts
  (dropped the threadDry precondition)
- conversation.js: `convoThreadBeat` resets the count when a beat lands
- Proof: `scripts/test-react-farm-fix-20261008.js` — 5/5 post-fix; 1/5 pre-fix
  (8 dead taps, trust +4, react still offered)

### 2. teach verb unreachable on the dialogue path (convo-beats.js)
The `teach` choice handler existed (with its topical-coherence rule), but the
live dialogue menu (`dialogueResponses` — the common case after an opener) never
offered it; only the base menu did. Villagers on the dialogue path could never
be taught by the player. Fix: `dialogueResponses` offers `teach` under the same
gate as the base menu (off-topic-thread, not grief/cheer, something teachable).

### 3. teach starved on full base menus + absent from subject picker (conversation.js)
On full base menus teach lost the MAXC slot lottery (same starvation class as the
2026-10-07 gossip-verb fix) and was missing from the subject picker. Fix: rides
after the capped topics in both spots, mirroring the gossip-verb/party-invite
pattern.
- Proof: `scripts/test-teach-dialogue-path-20261008.js` — 9/9 on seeds
  20261008/7/42, including an 11-villager sweep asserting the invariant
  "teachable + off-thread + no hanging question → teach in menu" on every menu
  path. Fails pre-fix (dialogue + picker misses).

## Play: scripts/play-feel-20261008-socialite.js
36/36, 36/36, 37/37 assertions green on seeds 20261008, 7, 42.
- ACT 1 morning rounds: coherence reads well; no leaks/undefined/raw-ids in
  spoken lines (stranger true-name scan clean). The react fix visibly improves
  feel — no more 8× "Anyway." loops; conversations pivot via subject change.
- ACT 2 "can we talk?": natural `talkReason`, renders "Talk to X.", opener
  references the request, consumed on open.
- ACT 3 gossip: second conversation honestly opens the gossip verbs; rumor
  seeded 1→11 hearers, distortion 0→10 over 10 parts; "the story's getting
  bigger" line fires; rep applies to the SUBJECT (generous 0→5).
- ACT 4 trust: 14→21→28→31→34 across convos/days; batch turns show villagers
  treating the player differently (name intros, perimeter-walk invites).
- Followers: Theo + Fatima volunteer at trust 80+, voiced travel banter.
- ACT 7 regression: yesterday's two bugs VERIFIED FIXED — talked_down aftermath
  renders "You talked them down. Now you have to live next to them." as
  narration (transcript who='narr', not leader speech); player-convened moot
  asks the vote 30/30.

## Regression suites
Green: dialogue-coherence 17/17, convo-beats 37/37, thread-dry-collapse 13/13,
gossip-verbs 5/5, party-invite-voiced 10/10, socialite-fixes 6/6,
invite-subject-menu ALL GREEN, rumor-once-per-villager ALL GREEN.
Pre-existing (identical pre/post fix, not touched): test-conversation-dialogue-20261006
is unseeded-RNG flaky (0–11 fails; beat-classification only); test-social-play-20261008
80/81 ("Sam: told the cover, not the truth" fails pre-fix too); test-convo-depth-20261007
stale harness (calls removed Game.wantBeatTag). Ontology validator: 46/46 systems.

## Commit
`3d23533` on `playtest-socialite` via safe-commit.sh (index resynced after —
safe-commit.sh leaves the private-index state behind; `git read-tree HEAD` run).
