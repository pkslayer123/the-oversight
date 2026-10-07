# Social scenarios played audit — 2026-10-07 (~07:55 CDT)

Work-queue item #2 (overdue): **moot, exile, ambush, liars** — each PLAYED as a player, end to end, through the debug scenarios (`liars`, `mootAccused`, `mootJuror`, `ambush`, `exile`).

- Script: `scripts/play-feel-20261007-social.js` — **103/103 assertions green** at seed 20261007; re-run at seed 777: **105/105 green** (no seed-luck).
- Engine: READ-ONLY, loaded from HEAD (`ff5346a`, version bump aa55e4e-20261007-125131) via `git show`. The worktree was NOT read (sibling churn in flight). Bugs below are a wiring backlog, not edits.
- DoD check: every player action verified to SAY something (no silent actions); no stuck states; knowledge gating scanned on every line.

## Verdicts

**LIARS — GOOD, borderline FUN.** The loop is real detective work: hear the claim over the fire → watch hands (costs time) → the tell lands → confront → the coat comes off or gets sewn tighter. Played: 5 liars (Brain surgeon / Navy SEAL / Senator / Michelin chef / Fighter pilot covers). 12 watches → 4 tells (one liar stayed smooth all 6 watches — earnable, not guaranteed, exactly right). Confrontations: 2 confessed, 2 deflected (personality-driven). Post-confession, talk lines speak the truth naturally ("Being a beekeeper taught me one useful thing: how to look busy while thinking."). The slip mechanic fired mid-conversation and reads great. Fun is in the watching; fear is mild (social, not mortal) — appropriate.

**MOOT (ACCUSED) — GOOD, genuinely tense.** Theft + assault on the books, accuser named, 2-day clock. Played the defense window hard: spoke (diminishing returns), called witnesses (nobody met my eyes — honest silence, cost me belief), planted-then-exposed the accuser's bought vote ("follow the food — it always works"), pressed the accuser in conversation. Moot convened on the clock without a manual push. **Verdict: NOT GUILTY, 1/9** — the defense play visibly moved the room (the earlier probe without the bribery expose convicted). The system rewards working the case. The flee variant resolves cleanly to exile-by-flight. No stuck states.

**MOOT (JUROR) — GOOD.** The ambush-that-never-happened case: cover story seeded first (first-mover advantage, avgBelief positive at open), then I worked it — pressed an accomplice ("she says full dark, he said dusk — somebody's lying"), examined the site, named witnesses, offered leniency to the weakest. Called the moot, cast my vote guilty out loud — and the room ACQUITTED anyway (the gamble: evidence matters enormously, but the room has weather). The vote landed in memory (`moot_vote` records) — the price is real either way. This is the Undertale-ish unfairness Steve wants, kept honest by the wild-day narration.

**AMBUSH — GOOD, the strongest beat of the four.** Three full plays, three different resolutions, zero stuck loops:
- TALK ×3: the waver cracks ("I'm sorry," whispered to the leader, not me), talked_down — "You walk back to Haven with all of them, at a distance, in silence."
- FIGHT: desperate, all-in — escaped after 3 rounds, both sides bleeding.
- RUN: caught, knocked out, pack rifled — "They couldn't finish it."
Every aftermath opens the case with THEIR story first. TALK correctly disappears from choices when talks run out (the 2026-10-06 stuck-state fix holds). Tells are perception-gated (1 tell at base perception — the observant earn more).

**EXILE — GOOD, the full arc plays.** Claim site → 4 timber trips (27 wood) → lean-to → hut → 4 caches (12,000 kcal) → 8 solo days → **founded Dawnrest**. Hard reset verified for real: new village object, old Haven archived in `pastVillages` (continues), trust/gossip/memory wiped, scholar + codex + pack cross over, haven rises on the CLAIMED tile (map tile marked). Petition path played both ways: rejected (Emberhold takes the 2,500 kcal gift and says so out loud — by design, never silent) and accepted (theft-tier exile + gift → probation, half-share meal line, 14-day clock that waits until you're at their fire — correct).

## Knowledge gating — HOLDS, swept for siblings

Scanned every game-spoken line in all five acts for unconfessed truths: **zero leaks**.
- Claims, observation tells, slips, contradiction beats, confrontation lines: name the CLAIM + behavior, never the truth (`observationTell` template never receives the truth — verified in code).
- `scrubLiesFromLine` runs on every finished talk line across all topics (the round-3 generalization holds — no 'goal'-topic siblings).
- `npcGossipAbout` CAN reveal the true occupation via villagers — this is EARNED intel (the village polices its own lies), not a leak: framed as "X says" and only after you've heard the claim.
- Confession is the single gate: the ✓ codex line ("confessed: Beekeeper (was claiming Navy SEAL)") and truthful talk lines only appear post-confession. The journal records what they TOLD you until then.
- Moot: charged only over recorded, provable crimes; the summons names accuser + charge, no phantom crimes. Ambush tells never name accomplices (knowledge-gated whoTag).
- No `undefined` rendered in any game line across all acts.

## Bugs flagged (not fixed — engine off-limits)

1. **Case status vocabulary split:** conviction → `status='resolved'`, acquittal → `status='acquitted'`. Both terminal, but any future worker unifying case-status checks must handle both. → **wiring backlog for engine owner.**
2. **mootJuror scenario fixture:** `Game.witnesses(6)` returned empty at the scenario's location, so "name the witnesses" honestly answered "Just trees" — the seeded-witness intent didn't materialize. Engine path is correct; scenario fixture luck. → **scenario nit backlog.**
3. **Origin lies are two-stage-gated:** `getActiveLie` returns the occupation lie first for 'past'/'personal'; the origin lie can't surface until the occupation lie is confessed. Fine as depth, but a player can never hear the origin cover first — worth a design eye. → **design note, not a bug.**
4. Petition-accepted probation clock correctly waits until the player is at the village tile (`d > 1` → return) — verified, not a bug. Drift ticks honestly (driftDays increments, road wears).

## Feel notes (for Steve)

- The ambush talk-down is the best social writing in the game right now — the waver's "I'm sorry" landing on the leader, not the player, is a real gut-punch.
- The moot-as-accused defense window is the right kind of stressful: every action has a visible price, and working the case visibly moves the verdict.
- Exile's founding grind (timber/caches/solo days) felt like honest work, not a checklist — the "wild grades on results" line earns its place.
- Nothing in any act left the player stuck, confused, or staring at a silent button. The no-silent-actions rule holds everywhere I touched.
