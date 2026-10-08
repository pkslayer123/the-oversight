# Break-it: contests, run 2 (2026-10-08)

Second hostile-player run on the contest system today. Builds on the earlier
run's evidence (`break-contests.md`, which fixed the watch-mode lifeline lie
and the silent winner's HP tax — both present in this tree and verified
still-green: their `scripts/test-break-contests.js` passes 63/63 with my
changes applied).

Harness: full `src/js/*.js` eval in index.html order (minus DOM-only
app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js), Math.random seeded
BEFORE eval (mulberry32, SEED env override).

## Verdict: BROKE twice, both fixed with proofs. Everything else held.

## CATCH 1 — HONESTY: two WIN choices granted no prize (fixed)
`tithe` "Offer your name instead" and `confession` "Accuse the System" both
resolved `next: 'WIN'` without `prize: true` in their `do` block, so
`contestChoose` called `_contestEnd(ac, 'won', undefined)` — the player "won",
took the winner's −5 health mark, and got NO alien-loot prize. Violates the
documented template_prize rule ("every playable WIN choice carries prize:true").
Sibling sweep found the same hole in `_contestGeneric` ("Push hard" → WIN,
no prize) — the fallback that fires when a bespoke builder throws.
Fix: `prize: true` added to all three choices.
Proof: `scripts/test-contest-break-1.js` — static sweep over all 44 contests +
generic fallback, plus two played wins asserting the alien-loot prize lands in
inventory. FAILS pre-fix (names all three choices; played wins grant nothing:
inventory 7→7), PASSES post-fix (5/5).

## CATCH 2 — DEAD-CODE: benevolent lifeline unreachable in real play (fixed)
Follow-on to the earlier run's Break 1. That fix gated the lifeline on the
player being among the taken (`playerIn`) — but `apContestInterference()` is
called ONLY from `_contestVerdict` (watch mode), where the player is never a
participant. The guard could never pass: the benevolent lifeline ("a bonded
ally may save you from death") was fully built, honesty-fixed, and dead. The
verdict's `apDeathSave && pid === 'player'` branch was likewise unreachable.
Fix: `contestChoose` now calls `apContestInterference(ac, {forPlayer:true})`
at the player's own death roll; a save converts death → loss (sequence still
runs, interruption law holds). The `{forPlayer:true}` mode skips the
verdict-only branches (sadistic rigging, fan favor — they bend verdict win
odds, which don't exist on the playable path); only the lifeline is evaluated,
and its note ("the killing blow... misses") fires exactly at the save moment.
Scope boundary (deliberate): the cumulative-damage death path ("the damage was
too much") is NOT lifeline-eligible — the fiction is a single killing blow
missing. No `next: 'DIE'` terminal choices exist, so every rolled death flows
through the checked path.
Proof: `scripts/test-contest-break-2.js` — bonded Wren (bond 3), scripted
death roll in The Pit → outcome 'lost', player alive, lifeline note in log;
control (no ally) → 'died'; forPlayer mode never bends winMod even at favor
50; verdict-mode interference unchanged (regression). FAILS pre-fix (outcome
'died'), PASSES post-fix (9/9).

## Attacks that HELD (solid notes)
- **Double prize claim**: after WIN/LOSE/refuse, `state.activeContest = null`;
  a second `contestChoose` returns null. Inventory verified unchanged.
- **Bet duplication**: `ac.bet` set once per contest; second bet rejected.
- **Eligibility bypass**: dead (health 0), exiled, game-over player excluded;
  dead villagers excluded via `_cxKillContestant` (roster actually filtered);
  children/elderly (age gate 15–72) excluded; pre-day-14 returns reason.
- **Countdown dodge**: `firesDay = day+1`, resolved at dawn; dead/missing
  contestants are recast from the living eligible (message on record) or the
  show is cancelled with the galaxy booing — never a silent skip.
- **Participant-count inflation**: `participants: 999` in data capped at
  eligible count.
- **Softlock sweep**: all 44 contests have non-empty playable phases, every
  numeric `next` valid (including under the choice-phase +1 shift), bespoke
  watch beats and coaching lines for all 44 ids, bespoke death lines for all
  44 ids (+category +generic fallbacks). Full playthrough of all 44 contests
  terminates. `contestTick` refuses to fire while a countdown is pending or a
  contest is unresolved. Unknown contestId clears pending without throwing.
- **Dead-code sweep**: `contestTick`/`resolveContest`/`fireContest`/`fireShow`
  all wired at dawn in game.js; `contestChoose` wired to app.js buttons;
  eligibility panel + countdown row wired in app.js; contests.js and
  alienPlayers.js both in index.html script list; all 24 ontology-listed
  functions exist; alien hooks (`apAdjustFavor`/`apCarePackage`/
  `apContestInterference`) defined and called; pre-existing
  `test-alien-players-integration-20261008.js` still 54/54 green post-fix;
  ontology validator passes (47/47 systems).
- **Countdown/copy honesty**: announcement names the grab ("at dawn, one more
  day"); winner's −5 health mark said out loud (earlier run's fix, intact);
  bet label honest (200 kcal wager, 2x payout announced on win).

## Notes (not breaks, for the record)
- **Bet EV**: low-risk watch bets are player-favorable (~0.70–0.85 win odds,
  200 kcal → +400 gross). Capped at once per contest, ≤2 contests/week —
  min-maxing welcome per doctrine, not an infinite exploit. Left as designed.
- **Refuse-to-veteran**: 6 refusals reach knowledge level 3 (25% damage read)
  without ever fighting. Refusal is itself a costly played sequence (trauma,
  others still taken); left as designed.
- **`_cxWin` helper** is defined but has no callers (superseded by bespoke
  climax phases). Documented, kept — removing it would churn the ontology
  ledger for zero runtime effect.
- **No leaderboard**: DESIGN's "~top 20% leaderboard" isn't implemented as a
  visible board — participants are picked randomly with player preference and
  notability deeds shown in the OVERSIGHT eligibility panel. Flagging as a
  design-vs-code gap, not a break.

## Files
- `scripts/test-contest-break-1.js` (proof: prize:true)
- `scripts/test-contest-break-2.js` (proof: lifeline reachable)
- `src/js/contests.js` (3× prize:true + lifeline call + ontology note)
- `src/js/alienPlayers.js` ({forPlayer:true} mode + ontology notes)
- `docs/ONTOLOGY.md` (regenerated by validator)
