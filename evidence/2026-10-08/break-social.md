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
