# Break-it: social systems (r7, 2026-10-09)

Hostile run against social systems, fresh ground only (r6 killed generous-rumor
farm, who-gossip bleed, phantom talk, absentia weregild; r5 covered deal/appeal,
trust bands, exile fork, bribery; r4 covered interpreter farm, giveFood landmine,
promiseHelp settled-block, rumor-trace cost).
Two proof scripts: scripts/test-social-r7-trustbleed.js (17 checks),
scripts/test-social-r7-promises.js (15 checks). Both RED before, GREEN after,
x3 seeds (20261009/777/424242).

Standing canon applied: docs/CANON.md ("Trust ≠ reputation — gossip/rumors move
REP only, never trust"), docs/CONVERSATIONS.md, docs/PARTY.md. r6's explicit
sibling-sweep order (other paths paying trust where only rep should move) drove
this run.

## KILL 1 — mediate double-pay (r5 trustMoved class)
`mediateConflict` success wrote +6/+6 trust directly to both principals, then
called `observe('mediate', {target: vid})` with no trustMoved/noTrust — the
target drifted AGAIN as a "witness" of their own mediation. Measured BEFORE:
target 40 -> 51 (+11, not +6). Same class as the r5 giveFood double-pay.
Fix: `observe('mediate', { target: vid, noTrust: true })` — trust moves through
the direct writes; opinion still forms via observe (exact pattern of the
already-fixed askSupport/confrontGossip calls two functions away). After:
40 -> 46. Proof T1.

## KILL 2 — failed mediation paid positive (HONESTY)
The failure branch said "It goes badly... Nothing is clearer than before. It's
worse." — then called `observe('mediate')` with the SUCCESS dims. Measured
BEFORE: failure paid +5 trust and +5 honest/+3 competent rep for making things
worse. The copy and the engine disagreed.
Fix: honest failure — no trust gain, -3 trust to both principals who let you
in (standard "it went badly" number, cf. confrontDoubt deflection), new
`mediate_failed: { competent: -5 }` AX entry, `observe('mediate_failed',
{target: vid, noTrust: true})`. After: 40 -> 37/37, competent 0 -> -5.
Proof T2.

## KILL 3 — caught theft double-pay (r5 trustMoved class)
`stealFrom` caught branch: `bumpTrust(vid, -35)` then
`observe('theft', {target: vid})` — the victim drifted -26 MORE as a witness of
their own robbery. Measured BEFORE: 60 -> 0 (clamped; -35 + -26 = -61).
Fix: `trustMoved: true` (r5's stated principle: "the target's trust already
moved through the deed path; trust drift lands on witnesses only"). After:
60 -> 25 exactly. Witnesses still judge (they saw it — direct-act channel).
Proof T3.

## KILL 4 — intimidation double-pay (r5 trustMoved class)
`markBully` (all intimidate branches): direct bumpTrust (-40/-25/-20) then
`observe('intimidation', {target: vid})` — another -12 drift on the victim.
Measured BEFORE (refused branch): 60 -> 28 (-32, not -20).
Fix: `trustMoved: true`. After: 60 -> 40 exactly. Proof T4.

## KILL 5 — truth.js confrontation seed skim (r6 KILL-2 class), 3 sites
`confrontDoubt`/`confrontTheft` seed gossip about the liar/thief AND call
applyRep at seed time without noTrust — right next to an explicit bumpTrust
that already moved trust for the confrontation. The gossip seed skimmed trust
off the designed direct-act numbers. Measured BEFORE: confession 30 -> 33
(designed +5, drift stole 2); counter-attack 30 -> 20 (designed -8, drift
stole 2 more). Fix: `noTrust: true` on all three seed-time applyRep calls
(confession, lie counter-attack, theft counter-attack). Rep still lands
village-wide via the seeded gossip (which already carries dims.who, so r6's
structural fix covers propagation). After: 30 -> 35 / 30 -> 22. Proof T5a/T5b.

## KILL 6 — betrayal cover-story trust bleed (r6 KILL-2 class)
`seedCoverStory`: the plotters' cover STORY (third-party words about the
target) called `applyRep(target, st.dims, 0.8)` — drifting the target's trust
-3..-8 from a lie someone else told. Measured BEFORE: target trust -8 on the
"went strange / talking wild" story. Fix: `noTrust: true` on the seed-time
applyRep; the seedGossip now carries `who: targetId` (NPC targets) so
propagation routes to the subject's record under r6's structural noTrust rule
(player-target case keeps the listener routing, which already names the right
subject, plus trust silence). After: trust delta 0, rep trustworthy still
lands (-10). Proof T6.

## KILL 7 — target's version farmed listeners' trust (r6 KILL-1 class)
`seedTargetStory` seeded `{trustworthy: 6, honest: 6}` with no who-dim and no
noTrust. As it spread, every listener's TRUST of the player rose — measured
BEFORE: max listener delta +6 over 25 spreadGossip calls. Positive words
paying trust = the generous-rumor farm class. Fix: `who: targetId` (NPC) +
`noTrust: true` on the seed. After: max listener delta 0. Proof T7.

## KILL 8 — accusation trust bleed + dead self-rep write (r6 KILL-2 + r4 class)
`seedAccuserStory`: (a) the accusation gossip spread with trust drift —
measured BEFORE: listeners -9 trust over 25 hops; (b) the seed-time
`applyRep(this.villagerId, {trustworthy: -10}, 0.8)` wrote rep to the player's
DEAD self-record (r4 established repOf(player) is never read) while drifting
the trustInPlayer aggregate 10 -> 5 — words moving the village prior.
Fix: `noTrust: true` on the seedGossip (rep still travels); the immediate rep
hit now lands on every villager's LIVE view of the player (roster loop,
trust-silent) — the author's evident intent, previously a dead write. After:
trustInPlayer 10 -> 10, listener trust delta 0, rep hit lands (villagers'
trustworthy view of player < 0). Proof T8.

## KILL 9 — unkeepable promises auto-broke (SOFTLOCK + HONESTY)
`checkPromises`' keep table covered 5 of 18 villager goals. A promise for any
other goal could NEVER be kept — it sat open 7 days then auto-broke
(-15 trust, "Promises rot"), punishing a vow the engine never let the player
keep. Measured BEFORE: 10 of 18 goals doomed (lead, alone, escape, remember,
home, record, answers, legacy, joy, peace); family/understand/survive had
promise lines implying keepability but no keep path.
Fix (design call, Steve can overrule): keep mapping is now data-driven via
`promiseKeepKind()` — family->travel ("I'll watch the roads" is kept by
walking them; one-line `checkPromises('travel')` hook in travelTo next to
checkQuest), understand->social (talking it through together), survive->food
(keeping them fed is "we make it"). The 10 goals with no promise content get
an honest deflection at promise time ("I won't make you a promise I don't
know how to keep." / NPC: "Fair. Most people just say the words.") — no
tracked promise, no journal vow (journal.js wrapper now requires r.ok), +2
words warmth as before. Rot still breaks genuinely ignored keepable promises
(P4: 8-day-old feed promise -> broken, -15). After: 0 doomed; 8 keepable (all
verified kept via their paths), 10 deflected. Proof P1-P5.

## HELD — and why
- STEAL-THEN-APOLOGIZE LOOP: measured 3 full cycles (caught theft + max
  apologies): trust 60 -> 8, honest rep 0 -> -9. Apology is rep-gated
  (worstRepAxis <= -15, one amends per axis per theft) and words-capped at 40
  — you can never apologize back above 40, and each cycle nets -31 trust.
  Theft allowed, socially punished, punishment real and compounding. (Note:
  pre-fix the caught theft cost -61 via KILL 3's double-pay; the designed -35
  stands.)
- COMFORT SPAM: mood-gated (scared/grieving/hungry only), resolver words-cap
  40, share-approach repetition-gated 1/day, observe noTrust. A hungry
  villager can be comforted repeatedly but it's words (cap 40), not a farm.
- MEDIATE FARM: bounded by conflict supply — 2 successes max per conflict
  (tension 50 -> 15 -> resolved), then "nothing to mediate." Post-KILL-1 each
  success pays exactly the designed +6/+6.
- MENTORSHIP SLOT FARM: no vector — ability slots gate on scholar.integration
  (neural depth), not mentorship actions; mentorBonus caps at 0.5, +1 xp/day,
  party-gated. The slotMoment(40) bumpTrust(mentor, 4) is once-per-threshold.
- PLAYER-SIDE TALK-REQUEST SPAM: no vector exists — talk requests are
  NPC->player only (r6: one initiative/daypart, 2-day expiry, bounded at 3).
  The player can't queue requests on NPCs.
- SECONDHAND player-action gossip trust drift (theftNoticeSweep etc.):
  tension noted, NOT changed. r6 deliberately preserved it ("Player-ACTION
  gossip keeps its intended secondhand-reputation drift") while killing
  who-gossip trust. The strict canon reading ("gossip moves REP only, never
  trust") would flip these seeds to noTrust too — that's a balance redesign,
  not a break-fix; flagged for Steve. The seed-time double-pays (KILLs 3/4)
  were the unambiguous bugs and are fixed.

## DEAD CODE
- truth.js: fully wired (all 35 methods have call sites, internal or external).
- party-formal.js: `roleBonus` (trivial PARTY_ROLES accessor) and `clearRole`
  (no UI path clears a role; assignRole reassigns) have zero callers anywhere.
  Added to scripts/test-sibling-sweep.js DEAD list per that file's convention
  (tracked dead, not deleted — `disbandParty` precedent). Sibling-sweep
  CLASS 2 still green (3/3).
- All four social modules + convo-*/truth/party-formal/codex-people in
  index.html in eval order; r6's 16/16 wiring proof untouched.

## Design calls made (Steve: decide + document, he can overrule)
- Words move rep only, never trust — extended to betrayal cover/target/
  accusation stories and truth.js confrontation seeds (r6's structural fix
  only covered spreadGossip propagation; the seed-time applyReps were the
  remaining leak).
- Crime victims don't "witness" their own victimization for trust purposes:
  direct bumpTrust is the whole trust channel; observe drift is for
  third-party witnesses (r5 principle applied to theft/intimidation).
- A failed mediation is honest failure: -3 trust to both principals,
  competence -5 rep, no trust gain. The copy said "it's worse" — now it is.
- Promises: only goals with a real keep path get a formal tracked promise.
  family->travel, understand->social, survive->food; the 10 content-less goals
  deflect honestly instead of writing a doomed vow.
- Left alone deliberately: secondhand player-action gossip trust drift
  (r6-blessed; flipping it is a redesign — your call).

## Regressions
- test-social-r7-trustbleed.js: 17/17 x3 seeds (20261009/777/424242)
- test-social-r7-promises.js: 15/15 x3 seeds
- test-social-r6-rumor-farm.js: green (rep still moves, no trust)
- test-social-r6-whogossip.js: green
- test-social-r6-edge.js: green (8/8 incl. phantom-talk guards)
- test-social-r6-wiring.js: green (16/16)
- test-sibling-sweep.js: 3/3 (DEAD list extended, still enforced)
- test-social-breakit-promises.js: 3/3 (existing promise suite)
- test-social-breakit-deal-appeal-20261009.js: 12/12
- test-social-breakit-r2.js: 7/7
- test-social-exile-fork-20261009.js: green
- test-gossip-rumors.js: 11/11; test-gossip-drama.js: 3/3; test-gossip-norepeat.js: 17/17
- attack-socialite-r4-20261009.js: ALL GREEN
- validate-ontology.js: 50/50, release permitted
- Pre-existing environmental failures (not mine, fail on pristine tree too):
  test-socialite-r5.js (hardcodes ROOT to nonexistent worktree
  playtest-socialite), playtests/test_conversations.js (loads only 8 files,
  missing convo-scene.js -> resolveConsequence undefined; also hardcodes
  ROOT to ~/workspace/the-scattering).

## Files changed
- src/js/game.js: mediate noTrust + mediate_failed AX/failure branch,
  theft/intimidation trustMoved, promiseKeepKind + checkPromises rewire,
  promiseHelp keep-gate, travelTo checkPromises('travel') hook
- src/js/truth.js: 3x seed-time applyRep noTrust
- src/js/betrayal.js: seedCoverStory/seedTargetStory/seedAccuserStory
  trust-silence + subject marking + live rep routing
- src/js/conversation.js: deflected-promise NPC line
- src/js/journal.js: journal only real promises (r.ok), not deflections
- scripts/test-social-r7-trustbleed.js, scripts/test-social-r7-promises.js: new
- scripts/test-sibling-sweep.js: roleBonus/clearRole to DEAD list
