# Break-it social r11 (2026-10-10): moot/vote machinery

Target 3 (social), depth pass on the moot engine. Prior runs (r6–r10) hardened
trust farms, gossip→trust, promise loops, leadership math; this pass attacked
the trial pipeline: vote stalls, re-convening, weregild economy.

## Kills

**S1 — SOFTLOCK: the daily clock re-convened an in-session moot (fixed).**
`playerCaseTick` fired `callMoot` every day for any 'open' player-accused case
past `mootIn` — but a case awaiting the player's vote stays 'open', so each
endDay re-ran `conductTrial`: fresh broadcast spam ("TONIGHT: THE MOOT"),
`tickAction(48)` burned per day, and the trial re-randomized under the
player's feet. Fix: `callMoot` is idempotent (returns null when `c.trial`
exists); `playerCaseTick` skips in-session cases.

**S2 — SOFTLOCK: a pending trial vote could stall forever (fixed).** The vote
is cast via conversation choices — a player who never talks to anyone (away,
exiled, ignoring the fire) left the case at `awaitingPlayerVote` permanently:
no verdict, justice ladder frozen behind `playerCaseOpen`. New `trialVoteTick`
(wired into `betrayalDailyFull`): after 2 days of silence the village takes
the count without the player — same honesty as the existing exiled-vote line,
same 2-day convention as the confrontation silence-timeout. The phantom voter
leaves the denominator (`playerVoter=false`) so the "your vote lands" copy
doesn't lie about a vote never cast. A cast vote any time before the backstop
still wins the race (tested).

**S3 — HONESTY/ECONOMY: weregild minted food from thin air (fixed).**
`resolveCase` stocked 3000 kcal unconditionally AND another 3000 in each payer
block: NPC weregilds granted the pantry 6000 from nothing; player weregilds
granted 6000 while draining the player 3000. Now one sentence = one 3000-kcal
payment: the village receives exactly what the accused pays.

**S4 — SIBLING SWEEP: `demandMoot` re-ran `conductTrial` on an in-session
case (fixed).** Same re-fire class as S1; engine-level `c.trial` guard added
(the dossier UI already gated it).

## Held (attacked, resisted)

- Gossip spreads along social lines (seed → heard grows via spreadGossip) and
  moves REP only, never trust (canon Trust ≠ reputation).
- Vote buttons render on any villager's conversation choices — the pending
  vote is always reachable.
- Belief clamped ±100; `defendSpeak` has diminishing returns; `defendAlibi`
  is one-shot; `fleeBeforeVerdict`/`forcePlayerAccusation` are idempotent.
- Dead-code check: 18/18 social entry points live functions; every social
  module (justice, betrayal, membership, codex-people, convoTopics,
  villager-agency, party, party-formal) is in index.html.

## Proof

`scripts/test-break-social-r11-20261010.js` — 18 checks × 3 seeds green
(AFTER); 7 bug-presence checks confirmed FAIL-equivalent on pre-fix HEAD
(BEFORE mode evals `git show HEAD:src/js/betrayal.js`). Regressions:
test-leadership-challenge 34/34, test-break-social-20261010 ALL GREEN,
test-socialite-r10 25/25, test-socialite-r9 ALL GREEN. Ontology 52/52.
