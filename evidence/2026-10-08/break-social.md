# break-it: social systems (2026-10-08, run by break-social worker)

Target: social surface (justice, conversation, convo-*, betrayal, hierarchy,
membership, truth, codex-people, villager-agency, party, party-formal, drama,
carexplore). Verdict: **BROKE + FIXED** — 3 live bugs fixed, 1 dead method
removed, 1 dead legacy block flagged for coordinator approval.

## CATCH 1 — Progressive trust designed but never wired (EXPLOIT + DEAD CODE)
- `Game.trustGainProgressive` (game.js:16523, Steve 2026-10-07: "higher trust is
  harder to earn — 0-50 full, 50-75 half, 75-90 quarter, 90-100 one point at a
  time") had **zero callers**. Every live trust write used flat gains: a private
  'full' food gift gave +24 trust at trust 95 exactly as at trust 10.
- Proof (pre-fix): `scripts/test-social-progressive-trust-20261008.js` —
  gift@80 == gift@10 (6==6), gift(full)@95 gave 24, donate@80 == donate@10
  (10==10), bumpTrust(+6)@95 gave 5. 5 failures on HEAD code.
- Fix: routed ALL positive home-village trust writes through
  `trustGainProgressive` (which also applies `trustGainMult`, so no double
  application):
  - carexplore.js `giveFood` — now reports the APPLIED gain in its return
    (was: raw base; honesty fix)
  - game.js `donateToPantry`, `bumpTrust` (the general conduit: moot votes,
    task rewards, drama), `comfort` (+8), `makeAmends` (+4),
    `mediateConflict` (+6), `confrontGossip` (+4, same class found in sweep),
    `abilityOnAcquire` trustAll, `evStranger` mediator, `_evTrustAll`
  - convo-scene.js `resolveConsequence` tdelta — progressive applied after
    live-translate mediation halving, before the talk-40 cap
  - losses stay raw everywhere (punishment lands whole — verified by test)
  - other-village `ov.trust` (betrayal.js gifts/talk) deliberately NOT
    changed: bounded by real food cost (700 kcal min), same-day repeat cap
    (+6), once-per-day talk — held by design
- Proof (post-fix): 9/9 × 4 seeds (20261008, 7, 42, 999).

## CATCH 2 — `endConvo` ReferenceError on every natural conversation end (SOFTLOCK/HONESTY)
- conversation.js `endConvo` called `this.convoConflictFallout(vid, t[vid])`
  with `t` UNDEFINED (stale copy: game.js's older endConvo defined `const t`,
  conversation.js's override didn't). Every NATURAL conversation end
  (`endConvo(vid,'natural')` via convoTurn wind-down) threw `ReferenceError: t
  is not defined` — skipping the exit line, mood goodbye, and coherence
  close-beat, and propagating out of `Game.convoTurn` into the UI with no
  `{ended:true}`. (The 'leave' BUTTON is intercepted by app.js `closeChat`
  before reaching convoTurn, so the button path was unaffected — but any
  direct `endConvo(vid,'left')` call also threw.)
- Fix: pass the live trust value
  `((this.state.village||{}).trust||{})[vid]` + comment.
- Proof: `scripts/test-social-menu-honesty-20261008.js` — 4 failures pre-fix
  (`endConvo(natural) does not throw`, `returns ended:true`, `returns goodbye
  line`, plus the leave path), 6/6 post-fix × 2 seeds.
- Sibling sweep: no other bare-`t[vid]` in conversation.js; convo-wants.js
  wraps endConvo chain-safely AFTER conversation.js loads, so the fix flows
  through.

## CATCH 3 — party.js `betrayalState(vid)` shadowed by betrayal.js `betrayalState()` (DEAD CODE + live bug)
- party.js defined `betrayalState(vid)` → per-traveler `{intent, evaluated,
  suspicion, cuesSeen}`. betrayal.js defines `betrayalState()` → village
  plot/case state. Both `Object.assign(Game, ...)`, betrayal.js loads later —
  party's version was DEAD. All 5 party call sites (`betrayalIntent`,
  `reevaluateBetrayal`, `betrayalCueCheck`, `lureCheck` via sweep,
  `betrayalSweep`) received the SHARED village object: intent was global
  across travelers (one member's roll overwrote another's), `evaluated` never
  cached (re-rolled every sweep), `intent`/`evaluated`/`suspicion` keys
  polluted `v.betrayal`, and `betrayalCueCheck` crashed with
  `TypeError: bs.cuesSeen.length` (undefined) as soon as any intent was set.
- Fix: renamed to `partyBetrayalState(vid)` + 5 call sites; comment documents
  the shadow. Ontology header untouched (never claimed the old name).
- Proof: `scripts/test-social-party-betrayal-state-20261008.js` — fails
  pre-fix (`G.partyBetrayalState is not a function`), 9/9 post-fix × 3 seeds.

## CATCH 4 — dead `Game.trustGain` removed (DEAD CODE)
- conversation.js `trustGain(vid,n)` had zero callers; its mediation-halving
  logic lives on in convo-scene.js `resolveConsequence`. Deleted + tombstone
  comment pointing at the canonical funnel (`trustGainProgressive`).
  Ontology-safe: never listed in the provides header.

## FLAGGED (not fixed — needs coordinator approval)
- **Dead legacy conversation engine in game.js (~lines 1902-2432, ~530
  lines):** `talkTo, vpOf, convoGet, convoBudget, convoPick, convoPickCycle,
  convoOpening, convoAskTopic, convoThreadHasMore, convoThreadBeat,
  startConvo, convoTurn, endConvo, convoConflictFallout, convoUI` — ALL
  shadowed by conversation.js (loads later, both `Object.assign(Game)`).
  Method-level caller sweep: every method in the social surface has ≥1
  caller, so this is pure shadow-death. Deletion trips safe-commit.sh's
  >50-line deletion guard; NOT overridden without coordinator approval.
  Suggested: one `--force-delete` commit after coordinator sign-off, or
  chunked removal. The dead block is also why Catch 2 happened (stale copy
  drift) — it will keep producing such bugs.
- `playerDeath` shadow investigated and CLEARED: drama.js attaches to
  `Scattering.Drama`, not `Game` — ledger.js's logic version is live. The
  naive name-based shadow scan false-positived here (attach-target aware
  scanning recommended for future runs).

## ATTACKS THAT HELD (documented, not failures)
- **Gossip loops:** `seedGossip` dedupes per (action, day-part); `spreadRumor`
  dedupes per (target, day-part) with backfire risk. Visit-gossip is
  +2 trustworthy to ≤3 NPCs once/day/village. Bounded by the day clock.
- **Bribery (fresh surface from badc134):** re-verified — payBribe removes
  real items + records takes, bribeVoter idempotent per (voter,briber),
  self-exposure backfires, menu gates on canAffordBribe, payment only on
  success. `test-detective-bribery-20261008.js` 13/13.
- **Moot votes:** `castPlayerVote` gated on `awaitingPlayerVote` (single
  vote); a pending trial waits for the player but the village continues and
  the vote menu re-offers — by design (both sides keep buying votes via
  simBriberyTick while you delay; delay has a price).
- **Exile:** fork is a real village object (fresh trust/pantry/gossip,
  old archived); `ensureReachableVillage` guarantees a reachable village;
  petition gated on capacity + judgment. No stranded state found.
- **Conversation dead ends:** `finalizeMenu` guarantees `"..."` on every
  menu; dynamic sweep of all current-menu choice ids across 5 villagers:
  none threw, none dead-ended (post-fix).
- **Trust farming via other-village gifts/talk:** bounded (see Catch 1).
- **makeAmends:** gated by worstRepAxis ≤ -15, rep moves +12 toward 0 —
  self-limiting after ~2 amends per axis.
- **Comfort:** gated by mood (scared/grieving/hungry).

## REGRESSIONS
- test-social-progressive-trust-20261008.js: 9/9 ×4 seeds (new)
- test-social-menu-honesty-20261008.js: 6/6 ×2 seeds (new)
- test-social-party-betrayal-state-20261008.js: 9/9 ×3 seeds (new)
- test-betrayal.js: 81/81 ✓ · test-detective-bribery-20261008.js: 13/13 ✓
- test-moot-justice-aftermath.js: 27/27 ✓
- Pre-existing failures on clean HEAD (NOT regressions):
  test-moot.js "cannot afford: no bribe offer" (seed-dependent);
  test-dialog-honest-optout-20261008.js (stale harness omits convo-scene.js);
  test-convoturn-guard-20261006.js (RNG-flaky, 14/2 on HEAD too).

## FILES
- src/js/carexplore.js — giveFood progressive + honest return
- src/js/game.js — 9 trust sites progressive (incl. confrontGossip sweep find)
- src/js/convo-scene.js — tdelta progressive
- src/js/conversation.js — endConvo ReferenceError fix; dead trustGain removed
- src/js/party.js — betrayalState → partyBetrayalState rename
- scripts/test-social-progressive-trust-20261008.js (new)
- scripts/test-social-menu-honesty-20261008.js (new)
- scripts/test-social-party-betrayal-state-20261008.js (new)

---

# break-it: social systems — second run (2026-10-08, break-social worker)

Target index 3 (continued). The earlier run hardened conversation trust
(talk caps, progressive wiring, endConvo guards); this run attacked what was
left. Verdict: **BROKE + FIXED — 6 fixes**, rest held.

## CATCH 1 — promise trust farming (EXPLOIT, fixed)
- `promiseHelp` (game.js) wrote `t[vid] = min(100, (t[vid]||10) + 6)` directly
  — bypassing resolveConsequence entirely (no 40 talk cap, no progressive, no
  mediation). Proof: trust 39 → 47, straight past the talk cap. Free +6 per
  villager.
- `checkPromises(kind)` fulfilled EVERY villager's matching promise on ANY
  kind-matching action: one conversation end kept all 'belong' promises
  (+15 each); one food handoff kept all 'feed' promises (+15 each). Proof:
  2 belong promises kept by a third villager's conversation (+15/+15).
- Sibling: `observe('promise')` bled +2/+1 trust to every witness via
  applyRep's 0.6× rep→trust conversion — uncapped, unprogressive, a second
  silent farm stacked on the +6.
- Fixes: promiseHelp +6 through resolveConsequence (words until kept);
  checkPromises(kind, vid) — per-person actions keep only that villager's
  promise (communal fight/task stay broadcast); kept +15 via resolver
  talk:false; observe('promise', {noTrust:true}) — opinions form, trust only
  via resolver. **Wrapper hazard:** journal.js's checkPromises wrapper
  dropped the new vid param — now forwards (kind, vid). Call sites scoped:
  endConvo, both food handoffs, both comforts.
- Proof: scripts/test-social-breakit-promises.js — 3/3 (was 0/3).

## CATCH 2 — phantom bribe attribution (EXPLOIT, fixed)
- `simBriberyTick` fabricated `by: villagerId` bribes when the sim picked
  the victim's side and the victim was the player — a bribe never paid,
  never chosen; investigate/expose then punished the player for it. Proof:
  1 tick → 1 phantom bribe.
- Fix: sim never attributes to the player; an NPC ally (pairAffinity > 0)
  may act for the victim's side, else the moment passes.
- Proof: scripts/test-social-breakit-bribes.js — 0 phantoms in 400 ticks.

## CATCH 3 — victim self-exposure double-dip (HONESTY, fixed)
- `exposeBribery` swung belief −30 (toward guilty) for ANY player briber —
  including a player VICTIM confessing, where −30 rewarded the confession
  with a conviction push. Proof: belief 0 → −300.
- Fix: direction by SIDE — accused-side → −30 (fire on the accused);
  victim-side → +25 (case tainted). Trust −25 still detonates on the briber.
  Control: accused self-exposure still 0 → −330.

## CATCH 4 — bribe price label vs actual (HONESTY, fixed)
- Label "800 kcal of food"; payBribe's whole-unit pack spend silently charged
  1000. Proof: labeled 800, charged 1000.
- Fix: payBribe returns actual; fiction names it: "1000 kcal changed hands;
  the pack wouldn't divide."

## CATCH 5 — moot "everyone comes" vs 88% engine (HONESTY, fixed)
- callMoot promised "Everyone comes" while tallyVotes seats ~88%.
- Fix: "almost everyone comes" on both caller lines.

## CATCH 6 — probation nowhere-state (SOFTLOCK, fixed)
- `probationTick` with a vanished village cleared probation but left
  exiled=false + stale joinedVillage + drifting=false: drift() said "you
  have a home", petition found nothing, no village card. Proof: exact
  nowhere-state reproduced (the earlier run's "no stranded state" missed
  this path).
- Fix: exile state restored (exiled/drfiting true, joinedVillage null,
  exileStartDay=day) + journal note + honest line.
- Proof: scripts/test-social-breakit-softlock.js — 5/5 (was 3/5).

## SIBLING SWEEP
- Comfort (carexplore.js) used flat unprogressive trust deltas — wired
  through trustGainProgressive (real act: no talk cap, still progressive).
- All remaining direct trust writes audited: uprising zeros (penalties),
  death-mantle (once per death), moot bumpTrust (already progressive),
  villageShareFood (real kcal cost), giveFood (already progressive). Clean.
- No other wrappers drop params; no other phantom player-attributions.

## HELD (attacked, resisted)
- Empty moot: acquits cleanly, no hang, no throw.
- Gossip loops: once-per-convo, 10 kcal/ask, finite pool, no XP;
  spreadRumor deduped per day-part, +2 via resolver (cruel temper).
- Mood-residue farming: 3+ exchanges + 10 kcal/ticks per convo, progressive
  flattens (50+→+1, 90+→0).
- Diplomat XP: 1 XP/open, 35 opens to max, needs the ability.
- Menus: `leave` pinned on every path; zero-exchange label honest.

## DEAD-CODE audit
- All 14 social modules loaded in index.html; no dead functions in
  @ontology provides. No Alien-Players-class findings.
- Dead small helpers (reported, not deleted): plotAwareness,
  recentTrauma (betrayal.js); memoryAidActive, npcVoiceFingerprint,
  convoWant (conversation.js); talkTo shim + villageAction (kept alive by
  old tests).
- Built-but-unsurfaced (design backlog): hierarchy bidForPrimacy/
  renegotiateLink/theirLeaderDied; membership formAlliance/memberBenefits/
  pantryAccess/recognizedAbroad; party-formal clearRole/disbandParty/
  partyCardHtml/roleBonus/splitParty.
- Audit: scripts/test-social-breakit-deadcode.js.

## REGRESSIONS
- New: promises 3/3, bribes 3/3, softlock 5/5, honesty 1/1.
- Existing: test-betrayal.js 80/80, test-betrayal-fixes-20261008.js 13/13,
  test-convoturn-guard-20261006 16/16, ontology 47/47.
- Pre-existing stale-harness failures (verified untouched by this diff):
  test-betrayal-aftermath.js (file list lacks statusEffects.js),
  test-convo-mood.js (lacks convo-scene.js),
  test-convo-coherence-fixes-20261007.js (expects removed dialogueResponses).

## FILES
- src/js/game.js, src/js/conversation.js, src/js/carexplore.js,
  src/js/journal.js, src/js/betrayal.js
- scripts/social-breakit-harness.js (new),
  scripts/test-social-breakit-{promises,bribes,softlock,honesty,deadcode}.js
  (new)
