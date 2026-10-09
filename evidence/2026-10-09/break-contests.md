# Break-it: CONTESTS system — 2026-10-09 (round 2)

Target: contests (system 4). Prior round (2026-10-08) left `scripts/test-break-contests.js`
(60 pass / 3 fail at the time). This round attacked the gaps it didn't cover.

## Attacks attempted

**EXPLOIT**
- E1 arena re-fire: double-tap the arena/weapon choice while the contest modal is suspended.
- E2 terminal double-click: contestChoose after WIN resolution.
- E3 moot 'Walk out' → MOOT_JUDGE win: does it carry prize:true (template_prize contract)?
- E4 villager-win prize: 600 kcal winner's share vs the pantry cap.
- E5 recast double-take: 60 seeded runs, two dead contestants, distinct living recasts?
- H3 casting audit: is the notability-weighted "ratings casting" real for the LEAD pick?

**SOFTLOCK**
- S1 arena completion through the tbEnd resume path (won → 3 waves, lost, fled).
- S2 exile mid-countdown. S3 death mid-countdown. S4 watch-mode multi-take verdict cleanup.
- S5 choice input during arena suspension applies nothing.

**HONESTY**
- H1 countdown copy vs firesDay timer. H2 2/week budget over 21 forced days.
- H4 unavoidability: travel-away + sleep don't skip the sequence.
- H5 watch-beat/death-line/generic-fallback coverage of all 44 pool contests.
- H6 gossip aftermath seeds and travels.

**DEAD-CODE**
- D1 contestEngine loaded in index.html + runtime-wired (verdict really calls contestResolveGroup).
- D2 all 65 phase-declared audio beats resolve in CX_BEAT_DEFS. D3 drama 'contest'
  channel handles every fired type. D4 fan-club/care-package ties live.
- D5 moot lane deterministic (same state → same fate).

## What broke (4 fixes, all in src/js/contests.js, commit d57498f)

1. **Arena re-fire (EXPLOIT + SOFTLOCK).** Re-calling `contestChoose` on the arena
   choice while `arenaSuspended` re-ran the choice's effects: `startCombat` fired a
   SECOND time (measured 1→2 calls), clobbering `state.arenaContest` mid-fight
   (phantom fight), and would re-grant any `grantWeapon` on the same choice.
   Fix: `contestChoose` drops all input while suspended (`{arena:true}`);
   `_contestArena` refuses a direct re-call. Proof E1/S5: BEFORE startCalls=2,
   AFTER startCalls=1, zero effect application.
2. **Moot 'Walk out' WIN without prize (HONESTY).** The walk-out choice
   (sway −3) goes to MOOT_JUDGE; a towering standing still wins — with no prize,
   breaking the template_prize contract (all 66 `next:'WIN'` choices carry
   prize:true; this was the one judge-path exception). Fix: prize:true.
   BEFORE grants=0 on the win; AFTER grants=1.
3. **Villager-win prize bypassed the pantry cap (EXPLOIT, sibling class of the
   food break-it).** `_contestEnd` did a direct `vv.pantry.push(...)` — overfilled
   past the cap (measured 120550 > 120000) and left `pantryKcal` stale (0).
   Fix: route through `pantryAdd`; a full pantry gets the honest
   "eaten on the spot" line. BEFORE overfill + stale kcal; AFTER capped + synced.
4. **Lead casting ignored notability (HONESTY).** `fireContest`'s first pick
   prefers the player, else fell back to UNIFORM random, unannounced — the
   notability weighting only ever applied to co-stars. Measured: a 6-deed
   villager picked at 0.24 ≈ uniform 0.25 over 200 runs. Fix: lead drawn
   weighted when the player isn't castable (shared `weightedPick()` helper).
   AFTER: ~0.75, well above uniform.

## Stale old-test assertions fixed (scripts/test-break-contests.js)
- SOFTLOCK 1 TERM set missed MOOT_JUDGE/MAW_JUDGE (added 2026-10-08, test predates).
- SOFTLOCK 2 didn't model arena suspension (now drives `_contestArenaAfter` per wave).
- HONESTY 3 asserted the retired `winBase+cheer+apWinMod` odds formula; now asserts
  cheer-as-performance wiring (cheerBonus/cheerLift into the engine).
- Old suite went 60 pass / 3 fail → 65 pass / 0 fail.

## What held (documented, not failures)
- **Eligibility**: day-14 gate, 15–72 age band, exiled/dead excluded; recast
  replaces the dead/exiled and the show goes on — "unavoidable" is real.
- **Countdown**: firesDay = day+1 exactly; "at dawn, one more day" said aloud;
  pending row in the status bar. Travel-away and sleep don't skip the sequence
  (the modal persists until played).
- **2/week budget**: holds over 21 forced-fire days.
- **Prize contract**: all 66 WIN choices prize:true (after fix #2); arena wins
  always prize; watch wins pay the pantry share.
- **Played-not-RNG**: villager fates resolve through contestResolveGroup
  (real fights/moots/ordeals), deterministic per state; moot argued, Maw
  deterministic pursuit.
- **Dead code**: none found — contestEngine loaded + called; all 44 contests
  have specific watch beats and death lines; all 65 beats resolve; drama
  channel handles all 5 fired types; fan favor + care packages fire on wins;
  gossip seeds and travels (surfaces as generic fire-talk — shallow but live).
- **Fear**: no mechanical fear claims in copy (FEAR is narrative); dread beats
  present at fire ("The grab comes at dawn") and resolve ("It is today").

## Proof
- `scripts/test-break-contest-20261009.js`: 76/76 green × 3 seeds
  (424242, 777, 20261009). BEFORE run (fixes stashed): 69/76 — the 7 failures
  are exactly the 4 fixed bugs.
- `scripts/test-break-contests.js`: 65/65 green.

## Sibling sweep
- party-formal.js: wraps startCombat (threat check) — no suspension/re-entry
  pattern; bug class N/A. drama.js 'contest' channel: render-only. villager-agency:
  no contest modal. No same-class bugs found.
- Note (not fixed, out of target): game.js has other direct `pantry.push` sites
  (lines ~1463, 4642, 4788, 4917, 9177, 18543) — food/persistence territory.

## Cross-target note for persistence (#10)
Save/load mid-arena-fight: `arenaSuspended` + `state.arenaContest` persist but the
live `tbfight` likely doesn't — no recovery path observed if a load lands in
that state. Not reproduced headless; flagged, not fixed (persistence target).
