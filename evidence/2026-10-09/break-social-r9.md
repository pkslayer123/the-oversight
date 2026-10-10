# Break-it: social systems — r9 (2026-10-09)

**Target:** social systems (trust/gossip, conversation, moot/exile, membership). Index 3 → 4.
**Canon:** docs/CANON.md + docs/CONVERSATIONS.md + docs/PARTY.md read first. No canon doc covers quests — noted, not invented.
**Verdict: BROKE 4, FIXED 4.** Trust/gossip economy held (fortified in prior rounds); the removal/exile seams did not.
**Worker:** single worker, worktree `break-social`, commit `a90fdb14`, merged locally to master. Pending ship.

## Attacks attempted
- EXPLOIT: 200× kind-answer trust farm via resolveConsequence → capped at 40, held. endConvo spam ×20 → no payout, held. Bribe double-charge/idempotency → held. Rumor re-spread → held.
- SOFTLOCK: ghost quest, mid-convo removal, vote-pending exile, double exile, promise rot.
- HONESTY: callMoot(null case) → safe null, held. Follower 65-gate present, held. Bribe label vs payBribe → honest, held.
- DEAD-CODE: all 52 modules loaded in index.html, held. Ledger's shareFood/hoardFood/hearGossipAboutSelf still zero callers (admitted dead, untouched — wiring foodStance is a Steve design call).

## Breaks → fixes (commit a90fdb14)
1. **Ghost quest** — giver killed/exiled → quest completed posthumously ("…takes the Dandelion. +500 kcal"). Fix: `removeVillager` lapses giver-anchored quests aloud; `checkQuest` old-save guard (giver off-roster → lapse, no pay); `exilePlayer` lapses player's giver quests (exile = hard reset).
2. **Phantom witness** — NPC exile kept grid+node positions → exiled villager counted in `witnesses(6)`, `combatWitnessReact` spoke for them. Fix: `removeVillager` clears positions+nodePos; `witnesses()` roster-gated (defense in depth).
3. **Vote from exile** — `castPlayerVote`/`tallyVotes` seated an exiled player. Fix: exiled → moot finalizes without them, said aloud; `playerVoter=false` when exiled.
4. **Promise rot on ghosts** — promise to removed villager rotted at 7d (−15 trust on a corpse) or "kept" across the fire. Fix: released on removal; journal renders 'released'.
5. **Double exile record** — non-moot exile + moot sentence pushed `v.exiles` twice. Deduped.

## Sibling sweep
Same "anchored-to-removed-NPC" bug class hunted across doubts (already closed), mentored (already handled), quests, promises, positions — all now closed at the `removeVillager` choke point.

## Proof
`scripts/test-social-r9-break.js` — 13/13 checks, green across 4 seeds (re-verified by coordinator post-merge: SEED=1,7,42,99 all green). Ontology gate: 52 systems pass. No regressions in r6-rumor-farm, r7-trustbleed, r8-residue, endconvo-farm suites.

## Notes
- Evidence dir was dated 2026-10-08 from prior runs; this run executed 2026-10-09 CDT. File placed under evidence/2026-10-09/.
- No `[needs-eyes]` — edge-case fixes, no feel changes. Ship loop owns push.
