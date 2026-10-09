# Break-it: social systems (r5, 2026-10-09)

Hostile run against social systems. Recent context: knowledge 5th pass closed the
contested-trust farm + ack-spam mood farm; dialogue rethink Phase 1+2 live
(one resolver, 40 words-cap, Ask/Answer contract). Attacked what was left.

## KILL 1 — deal/appeal trust farm (EXPLOIT)
`offerDeal()` and `appealToGoal()` (src/js/game.js) computed "effective trust
for this check" and then wrote that sweetened value into PERMANENT trust —
flat, no progressive scaling, no 40 words-cap, and the `|| 10` read
resurrected 0-trust villagers.
Measured BEFORE (SEED 20261009, trust start 10):
- appeal: 10 -> 50 -> 90 -> 100 in THREE FREE calls (pure words)
- deal: 10 -> 41 -> 72 -> 100 in THREE calls costing 3 food units
Fix: the +30/+bonus sweetener buys only the obedience check. Permanent gain is
a separate path — deal routes through `resolveConsequence` as a real act
(talk:false, no 40 cap, progressive scaling); appeal routes through the
resolver as words (talk default true: capped at 40, progressive, mediation
halving). Zero-trust reads fixed (`=== undefined ? 10 : v`).
After: appeals 10->38 over 7 calls (capped at 40); deals 10->72 over 7 calls,
diminishing (11,11,11,11,6,6,6).
Proof: scripts/test-social-breakit-deal-appeal-20261009.js — 12/12 x 3 seeds.

## SIBLING SWEEP — same bug class (flat trust writes, no cap/progressive)
- `resolveInvite()` (betrayal.js): +3/+5/+4 flat — routed through resolver.
  NPC-paced (not player-farmable), but one math now.
- `askSupport()` (game.js): flat +5 — routed through resolver; `observe('coalition')`
  now `noTrust: true` (it was a second uncapped +~1 trust source on top).
- `theorizeWith()` practical branch (game.js): flat +2*mult per theorize —
  afternoon theorizing was a slow faucet; through the resolver.
- Checked and deliberately LEFT: game.js `giveFood`/`comfort` fossils (shadowed
  by carexplore.js overrides, `_orig*` never called — dead code, no runtime
  effect); `crowdingTick`/`debateIntake` penalties (penalties land whole, by
  design); `playerDeath` mantle bonus (one-shot); `applyRep` trust drift
  (real-act rep drift, noTrust-gated on words); mediator/ambush paths (already
  progressive); moot-vote +6 (via bumpTrust, once per moot); bribery (idempotent
  + real food cost, fixed r4).

## KILL 2 — assign panel leaked raw trust numbers (HONESTY)
The person panel and people journal read trust as qualitative bands
(Guarded./Warming up./Trusts you.); the assign inline panel showed
"Trust: N/100". One convention now — bands everywhere (src/js/app.js).

## HELD — exile haven fork (SOFTLOCK check, Steve's hard-reset law)
Drove exile -> satisfy founding reqs -> foundHaven() in harness.
Verified: old village archived into pastVillages WITH its social state intact;
new village is a fresh object (founder-only roster, trust {pid:15}, empty
gossip/needs/memory/requests); pack + codex + character cross over; scholar +
justice exile flags cleared; founding project spent; old name remembered.
14/14 x 3 seeds. Proof: scripts/test-social-exile-fork-20261009.js.
The fork is real. Steve's law holds.

## HELD — everything else attacked
- Bribery: idempotent per briber/voter, real food cost (pantry-funded bribes
  take real items), self-exposure backfires. Held.
- Gossip: player rumors dedupe per daypart/target; tracing attributes to the
  player with real rep/trust cost. 'generous' positive rumors exist but only
  move NPC rep, capped by dedupe + trace risk. Held (by design, drama verb).
- Names: displayName() is the single funnel; npcName() call sites audited —
  all gated by nameKnown/systemArrived or immediately earn the name via
  revealName('overheard'). Held.
- Overheard-name gossip lines: name is earned via revealName, not leaked. Held.
- Moot: conductTrial/castPlayerVote/finishTrial/resolveCase all guarded
  (no-player-vote path, acquittal path, schism/cold_war fallbacks). Held.
- DEAD CODE: 24 social entry points checked — all have live call sites
  (conversation, moot, exile, membership, invites, party, theorize, comfort,
  giveFood via carexplore override). No dead modules.

## Regressions
- test-social-breakit-deal-appeal-20261009.js: 12/12 x 3 seeds (20261009, 12345, 777)
- test-social-exile-fork-20261009.js: 14/14 x 3 seeds
- test-socialite-r4-20261009.js all: 10/10
- test-social-breakit-r2.js: 7/7
- test-socialite-endconvo-farm-20261008.js: 4/4
- test-socialite-agree-spam-residue-20261009.js: 6/6
- validate-ontology.js: 50/50, release permitted

## Design calls made (Steve: decide + document, he can overrule)
- Deal permanent gain = 10 progressive via resolver as a real act (food paid,
  deed). Appeal permanent residue = 4 progressive, words-capped at 40.
- Invite shared-time = words (resolver, 40 cap), not deeds.
- askSupport coalition = words (resolver) + observe noTrust.
- Assign panel shows trust band, not number.
