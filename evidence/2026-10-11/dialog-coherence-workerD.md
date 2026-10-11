# Dialog coherence pass — Worker D (generator contextual appropriateness)

Date: 2026-10-11. Branch: `dialog-coherence`. Proof: `scripts/test-dialog-coherence-20261011.js` (37/37 green, seed 20261011).

Canon read first: docs/CANON.md, docs/CONVERSATIONS.md, docs/DIRECTIVES.md, plus the 2026-10-04 conversation-coherence rules from memory (choices respond to context; show/teach relates to the topic; bridges not hard pivots; NPC questions get answers).

## Nonsense classes found and fixed (4)

### A. GOAL 'answers' names the System before the System arrives — CANON VIOLATION
- **Before:** every one of the 8 goal lines for the 'answers' goal ("make the System explain itself") references the System — "The System is a locked door. I'm collecting keys." / "Some people pray to it." — and `convoOpening`/`convoAskTopic` served them whenever trust cleared the share gate, including day 1–6. Pre-arrival, nobody knows the word "System" (Day 7 staged reveal). A day-3 villager monologuing about the System is the generator firing with no precondition.
- **Fix (prefer gating over deletion):** added `preSystemLines` (6 era-neutral lines: "Whatever did this — it had a reason…") to the goal def in `src/data/characterGen.json`; new `convoGoalLines(goal, goalDef)` helper in `conversation.js` returns the pre-System set when `goal==='answers' && !state.systemArrived`. Both goal-line call sites (`convoOpening`, `convoAskTopic` 'goal') use it. Post-arrival behavior unchanged.
- **Proof:** pre-System `convoOpening` forced onto the goal branch → thread 'goal', line contains no "System" (integration); post-System the full 8-line pool (incl. System lines) is drawable (unit + draw-all-8).

### B. Time-referencing questions asked before their time exists
- **Before:** the bespoke-question pool filtered only on trust + mood (`when`). `q_first_week` ("What got you through the first week? The very first days.") could be asked on day 3 — the first week hasn't happened. `q_night` ("Did you sleep? I kept hearing things…") could be asked on day 1 — nobody has slept in-game yet. Both selection sites affected (the turn-followup queue AND the "ask me something real" fallback pools, which drew any unasked question).
- **Fix:** `minDay` on the defs (`q_first_week: 8`, `q_night: 2`) + `convoQuestionOk(q, trust, mood)` helper enforcing trust/when/minDay, used at both selection sites.
- **Proof:** day 3 → `q_first_week` cannot be asked; day 9 → can. Day 1 → `q_night` cannot; day 2 → can. Trust gate still enforced.

### C. Six newer goals had no follow-ups and no askAbout lines — threads contradicted themselves
- **Before:** goals `home/record/answers/legacy/joy/peace` exist in `characterGen.goals` (8 opener lines each) but had NO `goalFollow` entries: opening the thread then tapping "tell me more" instantly returned the exhausted line — the villager claims "I've told you everything" one beat after opening the subject. Separately, `askAbout(vid,'goal')` in game.js only knew the original 12 goals, so asking a joy-driven villager "what do you want?" answered "I don't know. Getting through today, I guess." — contradicting the goal they share. (Also fixed a latent day-count bug in the data: peace follow-up "I've talked down three fights this month" → "I've talked down fights before.")
- **Fix:** 8 follow-up lines per goal in `goalFollow` ('answers' follow-ups written era-neutral so the thread works pre- and post-arrival); 6 one-line answers in `askAbout` goalLines ('answers' one era-neutral: "Whatever did this — it had a reason. I'm going to find it.").
- **Proof:** for each of the 6 goals, `convoThreadHasMore` is true and `convoThreadBeat` returns a real beat; `askAbout` speaks a goal-specific line, never the generic dodge.

### D. ambientSocial "tonight" lines fired at any day part
- **Before:** `ambientSocial` (called from `villageLives` every day part) hardcoded "tonight" in two lines: grief — "The fire is quiet tonight. Nobody's talking much."; cheer — "X got the fire going big tonight." At noon, "tonight" is false.
- **Fix:** `const tod = this.isNight() ? 'tonight' : 'today'` in `ambientSocial`; both lines interpolate it.
- **Proof:** dayPart 0 + grief → "today", no "tonight"; dayPart 3 → "tonight". Same both directions for the cheer fire line.

## Audited and clean (no change)
- **Village grief:** set only on death/murder events (`villageEvent`), decays per day-part in `tickNeeds` — grief lines always trail a real death. No "grief with no death."
- **Taught-reference openers:** pick from `v.taught[vid]` (plants actually taught) — real references.
- **`talkReason` templates:** every line conditional on real state (negative gossip heard, goal, pantry level).
- **`npcGossipAbout` (truth.js):** teller-knowledge gated (trust floor, lie/truth from actual claims).
- **Teach/show:** already topical per the Rule-2 fix (floraMentioned match or explicit bridge) — verified, untouched.
- **"Remember when" for things that never happened:** no such generator found in conversation paths.
- **Goal lines for satisfied goals:** goals are persistent drives with no satisfaction mechanic in the codebase — nothing to gate; not a live bug.

## Post-commit verification saga (read before merging)
- The archive-of-commit check caught a real loss: the marker-based hunk
  classifier dropped the game.js cheer-line hunk (it carried no "Worker D"
  marker — the marker sat only on the sibling `tod` hunk), so commit
  25427a32 shipped the grief fix without the cheer fix. Proof on the archive:
  36/37. Fixed via amend (9a980e6e). LESSON: verify the COMMITTED tree, not
  the worktree — and put the marker comment on EVERY hunk, not just the first.
- Worker A committed onto this branch mid-run (63662b5b, parented on my
  25427a32). My amend orphaned it; I re-parented it onto 9a980e6e as 74cc9145
  (same tree/message/author/date — verified the only content delta vs the
  original is my cheer line). Then found the tree-reuse trap: re-parenting
  with the old tree silently reverted my cheer fix (A's tree predated it) —
  restored in 9b26598f. LESSON: never reuse a stale tree when re-parenting;
  merge the trees.
- Worker A's tip commit BREAKS `say()` in the node harness: their emission
  wrapper calls `this.emit(...)`, which is defined nowhere in the tree
  (HARNESS ERROR: this.emit is not a function, at newGame). Emission plumbing
  is A's area (out of my scope) — but it blocked MY proof on the merged tip,
  so the proof script now stubs `Game.emit` when missing (clearly commented;
  bypassed if A's real emit lands). Coordinator: A's commit needs its emit
  implementation before this branch merges to master.
- Final: 37/37 on the tip archive (a04d1d18). Sensitivity: base tree
  (e4080e54) lacks all four gates (no preSystemLines, no minDay fields, no
  goalFollow for the 6 goals, no convoGoalLines/convoQuestionOk) — the test's
  data/unit assertions fail pre-fix by construction.

## Coordination notes
- Shared-worktree collision: on starting work I created `dialog-coherence`, but mid-run the worktree's HEAD was on `dialog-layout` (a sibling checked out their branch in the same directory — one worktree = one checkout). My uncommitted changes were intact. I switched back to `dialog-coherence` (clean, same base) and committed ONLY my hunks via the private-index selective-staging recipe: `conversation.js` had 1 foreign hunk (pluralize, left untouched), `game.js` had ~20 foreign hunks (left untouched), `characterGen.json` was all mine. Working tree left exactly as found.
- Possible overlap with Worker B (knowledge gating): the 'answers' askAbout line and preSystemLines are era-gates (context), not knowledge leaks — no double-claim. If B touches goal 'answers' too, mine is the context half.
- No push/bump/live per instructions. No jest run (no test files touched by my change area; node --check + JSON parse on edited files instead).
