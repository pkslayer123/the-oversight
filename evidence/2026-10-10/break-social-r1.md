# Break-it social r1 — 2026-10-10

Target: social systems (trust farming, gossip loops, moot/exile edge cases).
Worker commit: `7bbc4cca` (in worktree `break-social-r1`, pending coordinator merge).
Proof test: `scripts/test-break-social-r1-20261010.js` — 23/23 x3 seeds (7, 99, 20261010); BEFORE mode 12/23.

Canon read: docs/CANON.md (no dedicated social canon doc exists beyond CONVERSATIONS.md — noted, not invented).
Knowledge-r3 cross-check: social teaching/mentorship flows read `state.codex.plants` and `v.taught` (canonical); no social module reads `codex.techniques` or `scholar.codex` — no stale-store readers in the social area.

## Catches (all fixed in 7bbc4cca)

1. **freeloadVote: fake hand count (HONESTY, broke+fixed).** The per-voter loop read
   `v.trust[vid]` — the ACCUSED's trust of the player — so every voter computed the
   same `t` and "Hands: X for exile, Y against" was unanimous by construction
   (measured: accused trust 90 → 0/6; accused trust 5 → 6/0). The engine has no
   NPC→NPC trust matrix; votes are now cast by `pairAffinity(voter, accused)`
   (friends stand by them, the hostile/indifferent vote them out after the 12-day
   drain pattern). Proof A1–A6.

2. **Dead observe() actions (DEAD-CODE, broke+fixed).** `observe('trade')` x3
   (betrayal.js trader cart) and `observe('bribe_fight')` (justice.js) had no AX
   table entry → `if (!AX) return` killed the whole call while call-site comments
   promised social consequences. Added `trade: {honest:2, competent:2}`,
   `bribe_fight: {generous:4, brave:2}`. `observe('stole')` (storage.js) was dead
   too — and must NOT get an AX entry: observe() is player-centric, the skim's
   actor is an NPC. Witnessed skims now `seedGossip('stash_skim', {who: robber,
   honest:-12, generous:-8}, [player], true)` — the ROBBER's rep moves, never the
   player's, REP-only per canon. Unseen skims seed nothing (no false attribution).
   Proof B1–B5, G1–G3.

3. **spreadGossip fragments line lies (HONESTY, broke+fixed).** Always said
   "about you" — wrong for subject-targeted gossip; when the player was the
   teller it read "you telling X about you". Now names the real subject and
   skips the player-teller case. Proof G4–G5 (BEFORE output captured the lie).

4. **trustBand dead + dishonest default (DEAD-CODE/HONESTY, broke+fixed).**
   Steve's 2026-10-07 6-band helper was fully built and never called; worse, its
   unset-default was 15 while every engine reader defaults to 10 (unknown
   villager read 'distrustful' on the band, 10/hostile everywhere else). Default
   fixed to 10; added `trustTone()` wired into the person card + people journal,
   replacing the ad-hoc 3-band ternary that disagreed with the canonical bands;
   removed the still-dead `trustBandDesc`. [needs-eyes] — person-card copy changed.
   Proof F1–F5.

## Held (attacked, resisted)

- **Talk-stipend farm:** 60 dead endConvo calls move zero trust (active-guard +
  exchange-scaled stipend + 40 talk cap). Proof C1.
- **Rumor trust farm (r6 pin):** 12 subject-gossip cycles with forced spread move
  zero trust — spreadGossip hardcodes noTrust on hops; only the trace bumpTrust
  (the promised lying cost) moves trust. Proof D1, E1.
- **Module wiring:** all 62 src/js files are in index.html's load order — no dead
  modules (the Alien Players lesson).
- **Exile:** hard-reset path reachable with recovery (drift/found/petition);
  prior rounds (r4/r9/r11) already closed the phantom-seat, ghost-quest,
  tent-state, and hall-access holes. No new edge found.

## Sibling sweep

- Cross-checked every `observe('…')` call site against the AX table: `stole` was
  the only remaining dead action and its caller is now removed. Unused AX entries
  (attack, bully, flee, murder) are harmless table surplus.
- Swept for the same constant-in-per-voter-loop class: `for (const voter …)` exists
  only in freeloadVote. No other unanimous-by-construction counts.
- Regressions green: break-social-r11, r11-exile, r12, social-r6-whogossip,
  gossip-rumors, social-progressive-trust-20261008, ontology 62/62.
- Pre-existing, unrelated: `playtests/test_social_actions.js` "promise stored"
  is flaky (goal-dependent; passes on re-run); `playtests/test_conversations.js`
  is stale (hardcodes the main-tree path, omits convo-scene.js from its eval list).

## Verdicts

- EXPLOIT: held (stipend/rumor farms resisted; no new farm found)
- SOFTLOCK: held (exile recovery intact; moot pending-vote + exile handled)
- HONESTY: broke+fixed (freeloadVote count, fragments line, trust bands)
- DEAD-CODE: broke+fixed (3 dead observe calls, trustBand/trustBandDesc)
