# Break-it socialite r12 (2026-10-10): question-dodge lapses

Target 2 (socialite) from the playtest rotation. Hostile-player pass, fresh
ground (r11 killed moot re-convene/vote stalls/weregild minting; r10 killed
yieldChallenge flat-+10, 0-resurrections, ghost leadership state).

Canon applied: docs/CANON.md (Trust != reputation; rumors move REP only),
docs/CONVERSATIONS.md ("Silence and leaving are options"; energy budget 2-6
exchanges, NPC signals a natural ending; dodged direct questions get one
follow-up then lapse honestly — the thread is never silently dropped).

Proof: scripts/test-break-social-r12-20261010.js — ALL GREEN x 3 seeds
(20261010/777/424242). BEFORE mode (conversation.js from git HEAD) fails
exactly the 2 new checks (lapsedAt=-1, wdQueuedAt=-1).

## KILL 1 — bespoke-question infinite hang defeats the energy budget (SOFTLOCK)
`convoTurn`'s silence branch never touched a hanging BESPOKE `pendingQ`
(`agree`/`joke`/`silence` only resolve `reactiveQ`/`genericQ`), and the
winddown check requires `!c.pendingQ`. Measured BEFORE: a bespoke question
dodged with silence hung for 40 turns (budget 3) — no follow-up, no lapse,
winddown never queued. The NPC asked a direct question and waited forever
while the player said "...". Generic questions already had the follow-up-then-
lapse convention (GQ_FOLLOWUP/GQ_LAPSE); bespoke questions get the same:
`convoPendingQDodge` — first silence-dodge queues a noticed follow-up
("...You're not going to answer, are you."), second dodge lapses honestly
("Never mind — wasn't important."), replacing the turn's line so the fiction
stays coherent. Stale follow-up beats are dropped at lapse time.

## KILL 2 — queued-but-unrevealed question (heldAsk) stonewalls the winddown (SOFTLOCK)
Same class one level down: a queued ask beat sets `heldAsk`, which also gates
the winddown — stonewalling with silence kept the beat queued forever (the
continuer was offered every turn, but nothing forced the issue). After 2
silence-dodges `convoHeldAskDodge` drops the unrevealed ask beats and clears
`heldAsk`. No lapse line is owed — the question was never spoken, so the
fiction stays coherent by simply never asking. Dropped questions are marked in
`askedQs` (village-wide note already landed at queue time) so the same question
isn't re-queued two turns later. Dodge counters reset on new queue/reveal.

Design note: the goodbye itself is still revealed via the continuer and never
a silent chop — under a full stonewall the winddown now QUEUES (check-level
blockers all clear) and the convo ends when the player cooperates. Forcing an
end would violate the "never a silent chop" rule.

## HELD — and why
- **Malicious rumor rotation**: 12 nasty rumors / 3 days about one target drove
  honest/trustworthy rep to the -100 floor (bounded by applyRep, no unbounded
  nuke); subject's trust of the player moved ONLY via the trace's promised
  cost (<= -6 per caught trace; measured 50 -> 38 over 6 traces). Exchange
  rate is sane: reputation destruction is possible but floored, paced (1 rumor
  per target per daypart via partKey dedupe), and socially punished.
- **Reactive trust labels**: 'saw' (trust:2) applies below the 40 words-cap
  (39 -> 40) and honest-zero at/above it (40 -> 40, 50 -> 50). Numbers never
  leak to labels; the engine applies what the design spec'd.
- **Generic-question narrowed menus**: intentionally omit 'leave' (coherence
  fix, not a bug — the code comment says so explicitly). Every offered choice
  resolves the question (answers, honest opt-out, or a react — "nodding along
  answers too"), so there is no trap. Bespoke-question and rumor-thread menus
  do offer 'leave'.
- **Infinite silence standoff**: a player picking "..." forever with the
  continuer offered is a legitimate (if weird) choice — the fiction responds
  every turn (mood-silence lines), leave is always offered, and there is no
  mechanical gain (silence is in the substantive_light_set: no residue farm;
  no ticks, no trust). Not forced.

## FUN note
The new beats read human in sequence: silence -> "You're a good listener, you
know that?" (warm) -> goon reveals "...You're not going to answer, are you."
-> silence -> "Never mind — wasn't important." Stonewalling now has a social
texture instead of a dead UI. [needs-eyes]: Steve should feel the follow-up
timing on his phone — one dodge before the nudge may be too quick for warm
NPCs.

## Regressions
- test-break-social-r12-20261010.js: ALL GREEN x3 seeds (BEFORE fails 2/2 new checks)
- test-break-social-20261010.js (r10): ALL GREEN
- test-break-social-r11-20261010.js (r11): 18/18
- test-leadership-challenge.js: 34/34
- test-socialite-r11-fixes-20261010.js: ALL PROOFS PASS
- test-socialite-softlock-honesty-20261008.js: 3/3; test-socialite-r8-deadends.js: ALL GREEN
- test-convo-mood.js / test-social-rumor-thread.js / test-convo-coherence-fixes-20261007.js:
  fail identically on pristine HEAD (stale harnesses predate the Phase 2 scene
  refactor — `resolveConsequence` not loaded). Pre-existing, not regressions.
- validate-ontology.js: 57/57, release permitted (docs/ONTOLOGY.md regenerated)

## Files changed
- src/js/conversation.js: convoPendingQDodge, convoHeldAskDodge, dodge-counter
  resets (startConvo, ask-beat reveal, both heldAsk queue sites), @ontology
  header (provides + question_dodge_lapse rule)
- docs/ONTOLOGY.md: regenerated
- scripts/test-break-social-r12-20261010.js: new proof suite (+BEFORE mode)
- evidence/2026-10-10/break-social-r12.md: this note

## Design calls made (Steve: decide + document, he can overrule)
- Bespoke questions follow the generic-question dodge convention (one noticed
  follow-up, then honest lapse) — "the thread is never silently dropped"
  applies to asked questions, not just generic ones.
- A queued-but-never-spoken question that gets stonewalled is dropped silently
  (no lapse line owed — nothing was spoken), marked asked so it isn't re-queued.
- The goodbye is still never forced: stonewalling queues the winddown but only
  the continuer reveals it. "Never a silent chop" wins over "budget always ends."
