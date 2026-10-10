# Break-it: social systems, round 11b — exile edges + ghost trials (2026-10-10)

Target index 3 (social). Hostile-player pass, fresh ground only. Prior rounds
killed: word-farms (r2), interpreter/giveFood-landmine/promise-settled-block/rumor-trace
(r4), deal/appeal/trust-bands/bribery (r5), generous-rumor/who-gossip/phantom-talk/absentia-weregild
(r6), mediate/theft/intimidation double-pays/seed-skims/unkeepable-promises (r7),
mood-residue (r8), trivial-gift/theft-apology (r9), yieldChallenge/0-resurrection
patterns/ghost-challenge/dead-allies (r10), moot re-convene/vote-stall/weregild-mint
(r11a, this file's sibling). This run is the exile/social-edges companion pass.

Canon applied: docs/CANON.md (Trust ≠ reputation; "if you don't know it doesn't
show"; no silent actions), docs/CONVERSATIONS.md, docs/PARTY.md, docs/TRUTH.md,
docs/CORRUPTION.md. No dedicated SOCIAL.md exists — the six docs cover the area.
No canon gaps found this run.

Proof: scripts/test-break-social-r11-exile.js — 10 break checks FAIL on pre-fix
code with exactly the predicted values (stashed), ALL GREEN × 3 seeds
(20261010/777/424242) post-fix.

## KILL 1 — exiled player kept hands in the old hall's pantry (EXPLOIT)
Three holes in the same "what you carry — nothing more" class:
- `exilePlayer` never cleared `s.insideHaven` — an exiled player kept 'inside'
  pantry access to the hall they'd been walked out of.
- `havenStoresAccess` returned 'remote' at integration stage 3 for an exiled
  player — the cast-out could drain the old village's pantry from anywhere,
  forever, with no counter (theft allowed, socially punished — but a ghost
  drain has no witnesses).
- `hostFeast` (which draws from the VILLAGE pantry via pantryDraw) let an exile
  standing on the old haven tile burn 1500+ kcal of village food per day for
  +3 trust per villager.
Fix: havenStoresAccess returns 'none' while exiled; exilePlayer walks you out
of the hall (insideHaven cleared); hostFeast refuses exiles aloud ("Exile means
exile. The fire isn't yours to open."). Sibling sweep, same class: payBribe/
canAffordBribe read pantryKcalLive directly — now gated on havenStoresAccess
(the exile can still bribe from their own pack). Proof T1/T2/T3/T6/T7.

## KILL 2 — ghost trial: the moot tried a dead accused (SOFTLOCK/phantom)
An accused killed mid-case stayed 'open' — callMoot convened the trial, votes
were tallied, and sentenceCase sentenced a corpse (exile, for the dead).
Truth canon: "Gone closes the thread." Fix: removeVillager closes open/dormant
cases naming the removed as ACCUSED → status 'resolved', resolution
'accused_died', said aloud + journal note. DEATH ONLY ('killed'/'ambushed'):
an exiled accused is still tried in absentia (r9 design, kept deliberately).
Target/accuser-dead cases stand — the crime happened. The mantle path is
covered: ledger.js calls removeVillager(oldId, 'killed') for the dead bearer,
so a case against the previous mantle dies with them instead of haunting the
successor. Proof T4/T4b/T4c.

## KILL 3 — schism re-trigger duplicated feud groups (HONESTY)
resolveCase 'schism' pushed hardcoded `{id:'feud_a'}`/`{id:'feud_b'}` every
time — a second schism left two feud_a groups, and the resolveConsequence
group ripple hit shared members twice (40% x2). Fix: mergeFeud — reuse the
existing feud group, dedupe members. Proof T5/T5b.

## HELD — and why
- **Dual challenge**: every challenge creation site (leadershipFriction,
  agencyLeadershipTick ×2) guards `!v.challenge`; the second contender waits
  with heat, not lost. Asserted H1/H1b.
- **Feast trust math**: bumpTrust (progressive) + 1/day gate + ≥1500 kcal real
  pantry cost. Trust 95 → +0..1 per feast. Not a farm. Asserted H2/H2b.
- **Dark care packages**: corruption ≥60, systemArrived, dayPart 0, 5-day
  minimum gap, 8%/day roll — measured 12 packages/200 days. Honestly scarce. H3.
- **Theft proportionality**: unseen theft → notice sweep later: victim trust
  -15 (whole penalty, trust 0 stays 0 — no resurrection), rep gossip seeded.
  Caught: -35 via bumpTrust. H5.
- **Teaching**: v.taught[vid] blocks re-teaching the same plant; the engine's
  teachable filter excludes taught. No repeat farm. H6.
- **Player-initiated NPC accusation**: re-verified absent — all 8
  accusation-named methods are player-defense machinery (consider/force/open
  player cases, accuser aftermath/costs); demandMoot requires playerRole===
  'accused'. H4/H4b. (Note: the player CAN force the moot timing on an
  EXISTING case via betrayalChoices 'Call a moot' — not an accusation.)
- **Tiny-roster moot**: 1-villager village — trial convenes, player's vote is
  decisive, sentence resolves, no crash. H7.
- **Favor lanes**: no villager favor economy exists in the social code — favor
  is the broadcast fan-club system (alienPlayers.js), outside this target.

## Regressions
- test-break-social-r11-exile.js: 21/21 × 3 seeds (20261010/777/424242)
- test-break-social-20261010.js (r10): 14/14
- test-break-social-r11-20261010.js (r11a weregild): 18/18
- scripts/validate-ontology.js: 57/57
- node --check on both edited files

## Commit
8d0a337a — "merged locally, pending ship". No [needs-eyes]: engine-behavior
fixes, no feel/UI change.
