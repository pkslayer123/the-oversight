# Socialite playtest loop — run note (2026-10-06 ~22:45 UTC / 17:45 CDT)

Archetype: **socialite** (rotation 2 → 3). Played as a player through real
conversation choices: openers, deep topic traversal, gossip ask, rumor
spread end-to-end, follower/party state, repetition check.

## Bug 1 (fixed): `dlg:more` looped the admission line forever on dry threads
`scripts/play-socialite-run3-20261006.js` — pressing "Go on." / "Tell me
more." 24 times on an exhausted thread returned `"That's... pretty much all
of it, honestly."` every single time; the menu kept offering `dlg:more`.
The dialogue layer (`src/js/convo-dialogue.js`) never retired the option
once `convoThreadBeat` went dry. Fix: thread-dry marker (`c.threadDryFor`,
thread-specific so new threads re-enable automatically) —
`dialogueResponses` hides `dlg:more` when dry; `dlg:react` skips beat-fishing
and winds down; the dry path says the honest line once. Proof test:
`scripts/test-thread-dry-collapse-20261006.js` (13/13).

## Bug 2 (fixed): `Game.convoTurn(vid, undefined)` threw TypeError
Found while stress-testing the rumor flow: `party-formal.js:907`, the
outermost `convoTurn` wrapper, called `choiceId.indexOf(...)` with no
type check — every other wrapper guards with `typeof choiceId === 'string'`.
One bad id killed the entire chat with an uncaught TypeError. Fix: early
`return null` (the chat UI already handles null: closes + refreshes).
Proof test: `scripts/test-convoturn-guard-20261006.js` (16/16).

## Verified working (not bugs)
- Rumor lifecycle end-to-end: `spread_rumor` → target → type → gossip item
  with first hearer seeded (sibling's earlier fix holds) → 8 day-parts of
  `spreadGossip` grew `heard` 1→8 with distortion → a hearer repeats it via
  `ask:gossip` with knowledge-gated target description ("A person, maybe
  40s, with a wiry build" — no true-name leak). (An earlier scare — `heard:
  0` — was my harness reading the wrong gossip entry; `endConvo` pushes a
  "talk" gossip after the rumor.)
- Gossip/rumor verbs are one explicit subject-change ("Can I ask you
  something else?") away from an opener thread — the thread-coherence design,
  working as intended. Subject menu rotates topics through the budget cap;
  gossip + spread_rumor are prioritized (socialite playtest fix, in code).
- Followers volunteer at trust 80 (`followerCheck`); party state intact.
- Openers are voice-led and knowledge-gated ("A man, maybe 50s, with
  calloused knuckles" until you've talked); true names surface after
  conversation, by design.
- Repetition: personal lines vary per round; lead-in ("You want to know
  about that? Okay.") repeats — acceptable, reads as a speech habit.

## Feel verdict
- The conversation loop feels like talking to people now: beats drive the
  menu, threads wind down honestly instead of stonewalling, and the
  subject-change is discoverable. The dry-thread fix removes the worst
  remaining "talking to a wall" moment.
- Rumor-spreading has teeth (travel + distortion + journal logging) but is
  slow-burn: 8 day-parts to reach 8 hearers in a 12-person camp. Right for
  day 1; worth watching at village scale.
- Friction (low): the tense/withdrawn subject menu can shrink to 1 topic +
  leave, hiding gossip entirely — deliberate design ("tense conversations
  close down"), but a socialite player mid-feud may feel the verbs vanish.
  Watch, don't fix.

## Test state
- New: `test-thread-dry-collapse-20261006` 13/0, `test-convoturn-guard-20261006` 16/16.
- Existing: `test-dialogue` 14/0, `test-convo-beats-20261006` 41/0,
  `test-convo-mood` 29/0, `test-gossip-rumors` 11/0, `test-gossip-norepeat`
  17/0, `test-party` 88/0, `test-socialite-fixes` 6/0,
  `test-convo-coherence-choices` 29/0 (5/5 runs; one earlier 28/1 was RNG flake,
  reproduces clean).
- Pre-existing failures, identical on HEAD (not mine): `test-dialogue-coherence`
  2 fail, `test-gossip-drama` 2 fail, `test-social-rumor-thread` 2 fail.
- Ontology validator: 41/41 systems, release permitted.
