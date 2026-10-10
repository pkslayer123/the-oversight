# Break-it: contests — round 12 (2026-10-10)

Target: the contests system (`src/js/contests.js`; sibling sweep into show
terminals in the same file, `fieldFights.js` arena hook, `broadcast.js`
frame hygiene). Canon read first: `docs/CANON.md`, `docs/CONTESTS.md`.
Prior round: `evidence/2026-10-10/break-contests-r11.md` (cheer-trap,
dead `_cxWin`/`_cxLose`, arena-death resolve hygiene, dead-leak phantoms).
Proof: `scripts/test-break-contests-r12-20261010.js` — 34 checks × 3 seeds
(424242 / 777 / 31337), all green. Regression: r11's
`scripts/test-break-contests-20261010.js` 50/50 (seed 424242); ontology
52/52 validates; `node --check` clean on all touched files.

## Kills (3)

### K1 — contestsHeld missed 3 of 5 terminals (HONESTY: code vs its own comment)
**Attack:** the pacing build (2026-10-10) counts held contests for the Arc II
gate (`progression.js`: `(this.state.contestsHeld || 0) >= 1` = "survived a
televised contest"). The counter lived inline in `_contestEnd` under the
comment "Every end path flows through here."
**Break:** false. `_contestDie`, `_contestRefuse`, and the arena-death branch
of `_contestArenaAfter` all set `phase='done'` and clear `activeContest`
WITHOUT touching `_contestEnd`. A death, a refusal, or an arena death never
counted — the comment described an invariant the code didn't hold.
**Fix:** `G._cxCountHeld(ac)` — counts at ANY terminal, once per contest
object (`ac._heldCounted` guard keeps the multi-take verdict, which calls
`_contestEnd` per contestant on one ac, at exactly one). Called from
`_contestEnd`, `_contestDie`, `_contestRefuse`, and the arena-lost branch.
**Sibling (same terminal):** the arena-lost branch also skipped the
`contestLearn(ac.contestId, 'died')` knowledge grant every other death path
makes — a death on camera in the arena taught the codex nothing. Added.
**Proof:** H1a–d — watched death, refusal, arena death, arena win each move
the counter exactly once; H3 — arena death grants codex `seen>=2`; E1a/b —
double `_contestEnd` and 3-contestant verdict count once; E1c — per-winner
prizes untouched (3 wins = 3 shares).

### K2 — the eligibility panel never said who's OUT or why (HONESTY)
**Attack:** canon (`docs/CONTESTS.md`): "The player must always be able to
answer 'who can go, and why.'" The OVERSIGHT panel listed the castable with
their notability notes — the excluded (dead, severed, too young/old,
gravely wounded, exiled, away) vanished silently.
**Break:** confirmed — `contestEligible()` returned only `{eligible,
reason}`; every exclusion was a bare `continue`.
**Fix:** `contestEligible()` now also returns `ineligible: [{id, name,
reason}]` — 'dead — the mantle has passed' / 'exiled — cut off from the
village' (player); 'severed from the village', 'dead', 'too young', 'too
old', 'gravely wounded', 'away from Haven' (nodePos off the Haven node or
`v.away`), 'unaccounted for' (villagers). `oversightPanel()` in app.js
renders an "off the board" section under the castable list. Eligibility
SEMANTICS unchanged (same eligible set as before — the reporting is
additive). `docs/CONTESTS.md` eligibility section amended with one line.
**Proof:** H2 — 9 exclusion buckets each land out-of-eligible WITH the
right reason; every excluded on-roster person is reported (none silently
dropped); exiled and dead player covered; healthy roster → empty list.
[needs-eyes] — new panel section Steve may want to see on his phone.

### K3 — multi-take co-winner got no winner's share (EXPLOIT-adjacent asymmetry)
**Attack:** traced the villager-win prize on every path. The watch-verdict
path (`_contestEnd` isWatch) grants the winner's share via pantryAdd; the
multi-take path (`_contestResolveOthers`, player taken alongside villagers)
granted a co-taken winner NOTHING — no rations, no line, for the same deed.
**Fix:** extracted `G._cxWinnerShare(pname)` (identical pantryAdd block,
cap-real) and called it from both `_contestEnd`'s villager branch and
`_contestResolveOthers`' won branch. A winner is a winner, whichever arena.
**Proof:** E2a/b — co-taken win mints exactly one share, announced; E2c —
co-taken loss mints none. r11's E2 (player-win ≤1 loot, villager-win exactly
1 pantryAdd) still green — the refactor didn't change single-grant
semantics.

## Held (documented, not fixed)

- **Re-entry / double-prize:** `contestChoose` refuses input at
  `phase==='done'`; `arenaSuspended` blocks choice input and second
  `startCombat`; the verdict loop shares one ac by design (per-contestant
  fates, once-guarded counter). No double-mint found.
- **Re-trigger farming:** 2/week budget + `pendingContest`/`activeContest`
  guards hold; dawn resolve-then-tick can't double-fire (a resolved contest
  leaves a live modal, which blocks the tick).
- **Ratings-summons loop:** the +2 viewership + `recordMoment`(+1) moves the
  needle (fame-seeker fix holds); the dip trend is computed before
  `_lastWeekViewership` is overwritten — no immediate re-summon.
- **Bet re-wager:** `!ac.bet` — once per contest, fixed 200 stake (r11).
- **Save/load mid-arena:** `tbfight` persists (`tbSave`) and restores; no
  suspended-modal softlock.
- **Contest fires while a show is live:** `broadcastStart` is idempotent
  (frame just re-titles to the contest); the interruption is by design
  (unavoidable); every terminal calls the idempotent `broadcastEnd` — no
  frame leak. A pending contest and an open show modal can't coexist
  (the tick is blocked while any modal is live), so dawn can't clobber one.
- **Player dies mid-countdown:** recast logic (r10/r11) — corpses aren't
  televised, the show goes on or cancels honestly.
- **Dead code:** `contestEngine.js` — all 16 resolvers/helpers have call
  sites; both entry points (`contestResolveGroup`,
  `contestResolveVillager`) are called from contests.js. New helpers
  `_cxCountHeld` (5 call sites) and `_cxWinnerShare` (2) are defined and
  wired; D1 asserts all four contest terminals route through the counter.
- **Companion-bringing:** canon (`docs/CONTESTS.md`) says "sometimes the
  chosen can bring friends" — no such mechanic exists in the code (multi-take
  is System-chosen, not player-chosen). Noted as a canon/code gap, not
  invented.

## Sibling sweep
Same bug classes hunted in show terminals (`_showEnd`,
`_showVillagerEnd`): both already do outcome-beat → `broadcastEnd` →
`phase='done'` → clear — no hygiene gap. Shows correctly excluded from
`contestsHeld` (it's a contest counter). Villager show-wins grant
fans/shame/notability — the social prize, by design; no material-prize
asymmetry of the K3 class. No new campaign into shows.js.

## Regressions
test-break-contests-r12 34/34 × 3 seeds · r11 suite 50/50 (seed 424242) ·
ontology 52/52 · node --check clean (contests.js, app.js, proof script).
