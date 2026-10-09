# Break-it: social systems, round 2 (2026-10-08, ~23:00 CDT)

Target index 3 (social). Hostile-player pass over trust farms, softlocks, honesty, dead code.
Prior rounds: d53be21 (promise/bribe/moot fixes), d2a0010 (agree-spam), 0593cfd (drifter exile edges).

## EXPLOIT — found and fixed

### 1. Comfort trust farm (BROKE — measured 10→100)
`Game.comfort` (live implementation = carexplore.js override) wrote trust via direct
`setTrust` + `applyRep` rep-drift, bypassing `resolveConsequence` entirely: no 40 talk
cap, no mediation halving. A chronically hungry villager (hunger never resolves via
comfort) farmed **trust 10 → 100 in 40 free comforts** (proof: scripts/test-social-breakit-r2.js,
attack 1 — RED pre-fix). Worse, each comfort double-dipped: +4 direct AND +4 from the
`observe('comfort')` → `applyRep` rep→trust drift, plus +1 to every group member.

Fix (same bug class as the promise:made fix in d53be21 — "words through the resolver"):
- carexplore.js comfort: trust now routes through `resolveConsequence`. Word-approaches
  (silent/reassure/practical/space) pass `talk:true` → capped at 40. Only `share`
  (real vulnerability, already gated at trust≥40) passes `talk:false` → uncapped.
- `observe('comfort')` now carries `noTrust:true` (trust moves through the resolver;
  the village still forms its opinion via rep dims). Kills the double-dip.
- The game.js fallback comfort got the same routing (it's shadowed by the override,
  kept as defense-in-depth).

Post-fix: 40 comforts → trust caps at 40; single silent at 38 → exactly 40 (no +4 drift);
`share` at 45 → 55 (real act still climbs). 7/7 × 3 seeds.

### 2. tellSide uncapped +6 (BROKE — measured 38→44)
betrayal.js `tellSide`: direct `t[vid] = min(100, +6)` — no talk cap, no progressive.
Per-case, per-person. Fixed: through `resolveConsequence` (`talk:true`, temper honest-hard);
the case-belief shift stays direct. Proof attack 4: 38→40 now.

### 3. makeAmends / confrontGossip word-gains (same class, fixed pre-emptively)
Both wrote direct progressive trust with no talk cap, and both double-dipped via
`observe()` rep-drift. Routed through the resolver + `noTrust:true` on their observe calls.
`appeal` observes also got `noTrust:true` (a refused appeal was drifting +2 trust).

### Held (attacked, resisted)
- **speak_back farm**: +3/convo uncapped at exp≥25 looks farmable, but reaching exp 25
  needs ~13–25 convos (one attempt per convo, +1/+2 exposure each), each convo costs
  time, and the design explicitly classifies it a real act. Progression-gated, not
  zero-cost. Documented in the test; not changed.
- **promise-keep cycle**: `promiseHelp` refuses a second promise until the first is kept,
  and a kept promise can never be re-promised (one promise per villager per lifetime).
  10 attempted cycles → 1 keep, trust 10→25. The farm dies on the one-promise gate.
- **teach**: bounded by `youKnow − theyKnow` (finite teachable plants); exhaustion gives
  no payout. Held.
- **proveWorth (hierarchy)**: magnitudes are ledger-owned fixed values (2–10) from real
  deeds; +6/deed cap. Held.
- **donations/stash trust**: miser-hardened (net-band grants + revoke ledger). Held.
- **mediateConflict/askSupport/resolveInvite**: real acts with gates (40+/30+ trust,
  villager-initiated, risk). Held.

## SOFTLOCK — probed, held
- Exile then talk/endConvo: no crash, no stuck state (convo state lives on the village
  object; the fork wipes it).
- Gossip seeded with a dead witness + spread tick: no crash.
- `_forkNewHaven` re-verified: old village archived once (guard), fresh justice/mship/
  trust/gossip/convo state on the new object, exile flags cleared, scholar/codex/pack
  cross over. Hard-reset rule honored in code.

## HONESTY — checked
- Hierarchy demand lines print `link.trust` AFTER applying the delta — the number shown
  is the true value. Honest.
- `askSupport` "Need 30+ trust" gate matches the label. Honest.
- Comfort UI only reads `r.ok`; the returned base `trustDelta` is never displayed,
  so the cap doesn't create a label lie.
- `tellSide` "Whether it lands is in the pause after" — belief shift is still applied;
  now trust-capped like other words.

## DEAD CODE — audited (scripts/test-social-breakit-deadcode.js)
- All 12 social modules ARE loaded in index.html (the Alien Players lesson: verified).
- **WIRED (fixed this run)**: `renegotiateLink`, `bidForPrimacy`, `breakLink` (hierarchy)
  were engine-only — a subordinate village could never climb, renegotiate, or break
  away. No UI anywhere. Added three buttons to the Haven panel link rows + handlers
  (same precedent as the drifter loop wiring proposeLink). Functions were already
  safe (status/active/subordinate guards).
- **Documented unwired (left alone, flagged for the queue)**:
  - `theirLeaderDied` (hierarchy): designed to fire on other-village leader death via
    gossip/catch-up, but simVillageDay never simulates individual leader deaths — no
    caller can exist yet. Needs a sim event; not fake-wired.
  - `formAlliance` (membership): network-stage verb, no UI path. Future work.
  - `splitParty`/`disbandParty`/`clearRole`/`roleBonus` (party-formal): party exists in
    UI (invite/dismiss/HUD) but management verbs have no buttons. Test-covered only.
  - `plotAwareness` (betrayal): escape-tuning helper with no callers.
  - `pantryAccess` (membership): superseded by `havenStoresAccess` (physical-stores rule).
  - `villageAction` (game.js): haven well/fire actions — UI removed deliberately in
    916a9ab per Steve's "no fill-water/sit-by-campfire buttons" directive. Intentionally retired.
  - `convoWant`: consumer (dialogueBeatKind) was deleted in the Phase 1 rethink; kept as
    the public want read. Stale comment fixed.
  - `recentTrauma()`: uncalled, but the `bs.trauma` log IS read for honest wild-day
    narration. Kept deliberately.
  - `memoryAidActive`, `talkTo` (compat shim, test-called), `npcVoiceFingerprint`
    (uniqueness-test-called), convoTopics `t2gen_*`/`t2fol_*` (dynamic `this['t2..'+topic]`
    dispatch — not dead).

## Proof tests
- `scripts/test-social-breakit-r2.js` — 7/7 × 3 seeds (comfort cap, share real-act,
  no double-dip, tellSide cap, makeAmends cap, promise-keep held, exile/gossip no-crash).
- Prior suites re-run green: breakit-promises 3/3, breakit-bribes 3/3, breakit-honesty 1/1,
  breakit-softlock 5/5, social-confront ALL GREEN, hierarchy 42/42.
- Pre-existing stale failures (verified identical on pristine HEAD via stash):
  test-justice.js (startVillageUprising fixture), test-hierarchy-20261007.js (harness
  temperament read), test-membership-20261007.js (references nonexistent exileArcState).

## Files changed
- src/js/carexplore.js — comfort trust via resolver; share stays a real act; noTrust observe
- src/js/game.js — comfort/makeAmends/confrontGossip trust via resolver; noTrust on
  comfort/amends/confront-resolved/appeal observes
- src/js/betrayal.js — tellSide trust via resolver
- src/js/app.js — hierarchy climb buttons (Renegotiate / Bid for primacy / 🗡️ Break away)
- src/js/convo-wants.js — stale dialogueBeatKind comment corrected
- scripts/test-social-breakit-r2.js — proof suite (new)
