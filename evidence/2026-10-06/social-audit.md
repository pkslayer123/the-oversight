# Social scenarios playtest audit — 2026-10-06

**Auditor:** worker (flesh-out loop). **Method:** played all four (+juror variant) as a player via
`scripts/playtest-social-audit-20261006.js` — narrated turn-by-turn through the same
player-facing functions the UI calls (case dossier, convo choices, ambush exchange,
exile actions, petition). Full narration log: `/tmp/social-audit-final.log` (ephemeral);
verdicts JSON: `evidence/2026-10-06/social-audit-verdicts.json`.

Steve's rules checked on every scenario: **playable & enjoyable** (not just executable),
**knowledge gating** ("if you don't know, it doesn't show"), **consequences real and
social** (theft socially punished, violence desperate/traumatic), **no silent actions**.

## Verdicts

### 1. Moot — you stand accused — PLAYABLE: YES
TENSE FUN. The case-file dossier is a real social-game kit: speak (with diminishing
returns), call character witnesses, press the accuser, investigate bribery ("follow the
food"), expose it publicly at the moot, force the moot early (bold/dangerous), or flee.
Defense beats land: witnesses who won't meet your eyes, an accuser whose story holds
"steady as stone" (making you look desperate), a trial with ceremony (the count, the
pause, the wind past the edge of the light). Verdicts carry social weight — weregild
paid "in the open, where everyone can see," trust craters, gossip moves. Acquittal still
leaves a mark ("an accusation leaves a mark no verdict washes off") and the false
accuser eats social cost ("A case the village wouldn't hold — that's on the one who
called it").
- Friction: MEDIUM — the case-file HTML is a dense read on mobile; each beat is good but the sheet is long.
- Knowledge gating: holds — bribery/expose actions only appear once rumored/found.
- **Bug found & fixed:** verdict read `"You pay. And stays — this time."` (player verb
  agreement; the earlier fix handled "you pays" but left "stays"). Now `"You pay. And
  stay — this time."` (`src/js/betrayal.js` `sentenceCase`).

### 2. Moot — you are the juror — PLAYABLE: YES
FUN detective beat. The cover story lands first; then you work the evidence: examine the
site ("The earth keeps better records than people"), name witnesses, press accomplices
separately (catch the dusk-vs-full-dark seam), approach the weakest with leniency
(prisoner's dilemma), then call the moot and cast your vote — which lands "out loud, in
front of everyone" and is remembered by name (grievances/trust both ways). Resolutions
span exile / weregild / schism / cold war — all social, never mechanical stat damage.
- Friction: LOW — juror agency is real (investigation moves belief; the vote has a
  social price). Trial RNG can acquit the guilty; that is the design (wild days).
- Knowledge gating: holds — inconsistencies only surface via pressing; tells only via
  site/witnesses.
- **Anomaly (UNREPRODUCED, flagged):** one early audit run showed two exiles printed
  after a "Not guilty" verdict. Traced hard: the only code path to those lines is
  `sentenceCase → resolveCase('exile')` on conviction; 6 seeded re-runs plus targeted
  traces could not reproduce it, and the original run had a harness misuse (double
  `finishTrial` with a wrong-typed arg) that likely corrupted that run's state. No game
  bug found; noted here so a future pass can watch for it. NOT fixed (nothing to fix).

### 3. Ambush — the walk turns — PLAYABLE: YES
FEAR is real. "Placed." — three people arranged around you, shaking hands, the opener
pool keyed to trust/temperament ("You've had this coming." vs. a close friend's
"I keep trying to find a version of this where it isn't me"). RUN/TALK/FIGHT all
resolve with no stuck states: talk caps at 3 rounds and can genuinely talk them down
("The whole thing is coming apart") or snap back; fight is desperate and they break at
first blood; run is a gamble (aware ~always escapes, oblivious ~sometimes) with a
knocked-out branch. Aftermath opens a case → feeds the moot loop (systemic coherence).
Tells are knowledge-gated via `ambushTells`.
- Friction: LOW. Browser-only check remains: the debug panel opens the chat UI via
  `debugChatRequest` — verify the ambush thread renders on the phone (cannot do from node).
- Consequences: trauma, gossip, a village case — social, not just HP.

### 4. Liar's den — PLAYABLE: YES
DELICIOUS. Borrowed-coat covers (brain surgeon / Navy SEAL / senator…), shame/hiding
motives, and confrontations that confess, deflect, or counter-attack by temperament —
with mounting-evidence odds and prior-deflection memory. The identity epithet flips when
the lie breaks ("the michelin chef" → "the roofer") — knowledge-gated identity, a lovely
beat. Confession hits village-wide honesty rep + gossip; deflection/counter-attack cost
trust. Gossip cross-checks claims.
- Friction: LOW-MEDIUM — discoverability is gated but real: two clean conversations
  (thread-coherence: the observe option waits for an active thread to resolve) → the
  "(watch them for a while)" choice appears in convo choices. A first-timer may still
  never think to watch; acceptable, but watch for it in real playtests.
- **Bugs found & fixed (2, one class):** the observation was rendered TWICE — once as
  narration and once misattributed as the liar's own dialogue (`Nora: "You study Nora
  at the fire..."`). Root causes: (a) `observePerson` said the calm-case line itself
  AND the convo branch rendered the returned text again; (b) the convo branch pushed
  narration through the `{who:'them'}` dialogue pipeline. Fix: `observePerson` returns
  text without saying; the `observe` branch says it once as player narration and gives
  the villager a real spoken reaction from a new `observedReact` truth-line pool
  (`src/js/truth.js`, `src/js/conversation.js`). Sibling check: other `done(r.line, …)`
  branches (speak_back, invite_party, teach) pass genuine speech — no other instances.

### 5. Exile — you walk — PLAYABLE: YES
The walk is a real game: claim a campsite → fell timber (400 kcal, half a day) → raise
shelter → cache food → found. Costs are named and honest. Petitioning a nearby village
is social all the way down: they've heard the gossip (crime-weighted), gifts genuinely
move the needle, capacity is arithmetic ("It's not unkind. It's full."), rejection is
honest and never silent ("They take your food — all 800 kcal of it — and turn you away
anyway"). Acceptance = hard reset honored: old village archived, trust 5, 14-day
probation with a re-vote.
- Friction: MEDIUM — founding is a 7+ day solo grind (10,000 kcal cache, shelter tier
  2). Arc or chore? Needs a real multi-day feel check; not done in this audit.
- No bugs found.

## Cross-cutting judgment
- **Knowledge gating holds everywhere audited:** ambush tells, bribery actions,
  inconsistencies, observation tells, identity epithets. No leaks found on these surfaces.
- **Consequences are social, not mechanical:** trust, gossip, reputation, probation,
  trauma, schism — the hard rule is honored.
- **No silent actions:** every path narrates, including rejection, failed runs, and
  empty investigations ("Nothing you can prove. Yet.").
- **No stuck states found:** ambush exchanges all terminate; trials resolve; the
  talk-loop guard exists for raw calls.

## Recommendations (bigger work, NOT done here)
1. **Moot dossier mobile density** — the accused-player case file is a long read; consider
   progressive disclosure (fold evidence detail behind taps) while keeping the one-screen rule.
2. **Exile founding arc feel-check** — play the full 7-day solo founding as a player;
   if it chores, add beats (a drifter encounter mid-build, weather, a choice that matters)
   rather than cutting the cost.
3. **Liar discoverability in the wild** — the observe path is gated behind 2 convos;
   consider a one-time nudge (a villager remarking "you watch people") so first-time
   players find the detective game.
4. **Ambush chat-UI verification on phone** — `debugChatRequest` opens the ambush thread;
   needs a live browser pass (Steve's phone / builder browser task).
5. **Watch for the juror acquittal+exile anomaly** — unreproduced; if it ever appears in
   the wild, capture the case object state (status, trial, flipped) immediately.

## Files
- Proof script: `scripts/playtest-social-audit-20261006.js` (runs all five end-to-end, player perspective)
- Verdicts: `evidence/2026-10-06/social-audit-verdicts.json`
- Fixes: `src/js/betrayal.js` (verdict verb agreement), `src/js/truth.js` (observedReact pool, observePerson no longer self-narrates), `src/js/conversation.js` (observe branch: narration + reaction)
