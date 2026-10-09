# Break-it: monsters ROUND 4 (target 5) — 2026-10-08

Hostile-player run against the monster system, 4th pass. Two workers: one on the
brand-new turtle-flip mechanic (commit c00b92f, never adversarially tested), one
sibling-sweep on monster counter honesty + telegraphs. **5 catches, all fixed +
proven.** New evidence file from worker A: `evidence/2026-10-08/break-monsters4-flip.md`.

## CATCH 1 — Flipped "no armor" lied (HONESTY) — FIXED

The flip promise: flipped 3 turns, armor 0, can't snap, can't bunker. The 0.5
physical resist survived the flip and halved every flipped strike (28→14) —
"no armor" was a lie. Fixed: flipped zeroes physical resist too (ember-punish
precedent). Proof: fixed-roll strike = exactly 28 post-fix.

## CATCH 2 — `audioEvent('turtleFlip')` fired with no handler (DEAD-CODE) — FIXED

The flip commit fired the audio event but no handler existed — the flip was
silent since landing. Fixed: added `turtleFlip()` audio + dispatch registration;
fail-snap now plays `turtleSnap`.

## CATCH 3 — "SHOUT breaks the chorus for a round" never implemented (HONESTY) — FIXED

The `tbRoundWrap` comment promised it; `tbPlayerShout` set no state the wrap
read — the pending pack arrived regardless. Fixed: shout sets
`f.chorusBrokenUntil = round+1`; the wrap skips arrivals that round (narrated,
pack preserved, resumes next round, 2/fight cap bounds it).

## CATCH 4 — Union rep: silent aura drop + write-only buff fields (HONESTY + DEAD-CODE) — FIXED

On rep death the solidarity aura dropped silently, and per-ally
`urDmgBonus`/`urBuffed` were write-only (zero readers anywhere — grep-verified).
Fixed: purged the dead fields; rep death now actually dissolves the line —
summoned picketers (`m_ur_*`) flee with narration, pre-existing allies stay on
uncoordinated. The codex promise "without the rep the picket line dissolves" is
now mechanically real.

## CATCH 5 — Hushwolf "fire (they remember being dogs)" overpromised (HONESTY) — FIXED

The fire counter exists only in `investigateQuietWoods`; in combat fire does
nothing (`fear:'numbers'`). Fixed copy-only (byte-surgical JSON): "carry a flame
when you track the quiet woods." No engine change — in-combat fire-flee would
collide with NO SELF-PRESERVATION (Steve's call).

## HELD (attacked, resisted)

- **Flip-lock economy:** 200-HP turtle dies in ~15 turns / 4 flips / 8 strikes,
  but every failed flip costs a real snap (~133 dmg taken) — strong counter, not
  an exploit. Fail-snap is the real [20,30] Snap Decision; re-flip refused while
  flipped; flip+disengage clean; crowbar +0.25 is equipped-only (measured
  0.49/0.51/0.73 over 1200 trials — undisclosed-by-design, not a lie); flip
  predicate is exactly speedbump_turtle; button can't show for dead/fled turtles.
- **Wavegate sibling sweep:** no third spawn path — every wave picker keys on the
  single `unlockedWave()`; all 28 monsters referenced; all 46 audio names resolve.
- **Held counter claims:** projector sidestep + watch-phase + "fears movement"
  (bonus found: standing still after sidestepping gets you spell-dragged back —
  the counter-counter is real); landlord rent exactly `1+llAddenda`, eviction
  punishes turtling; nevermore lands post-strafe with a real +50% grounded
  window; hushwolf silence telegraph fires pre-contact with zero rush telegraph
  (Steve's kill honored); bulldozer charge lane honest; bright-idea burst exactly
  radius-2, daylight flees.

## Landing notes (coordinator)

- Master moved under the workers (sibling forager loop landed f4b8c64, touched
  src/js/game.js). Both worker branches rebased cleanly onto f4b8c64; rebase
  preserved the worker src diff exactly (84+/13- pre and post — verified against
  pre-rebase SHAs, not an apples-to-oranges diff).
- MERGE DRIFT CHECK: the sibling-sweep doc-test went 48/4 post-merge — the 4
  failures are the "LIE DOCUMENTED" before-assertions flipping red because the
  fixes landed (B1.6 shout, B5.1/B5.4/B5.7 urDmgBonus purge). Expected by design;
  the AFTER proofs stay green. Added a before/after contract header to the
  doc-test so future runs don't misread it as a regression.
- Regressions on merged master: flip 18/18, counters-fix 14/14, turtle-flip
  14/14, turtle-breakit 13/13, wavegate 9/9, behaviors 21/21, loot 42/42,
  patterncells 11/11, lockpick 9/9, fieldfights-r3 24/24, combat-r3-honesty
  18/18, ontology 50/50.
- Pre-existing failures, not this run: choir-toad harness crash (seMoveMod,
  stale harness omits statusEffects.js); audio-census 2 fails (documented
  swarm/hype orphans + mirrormothFlash — untouched by this diff).
- Live: `3d190dc-20261009-045528` verified on BOTH
  raw.githubusercontent.com/.../master/version.json and
  the-oversight.vercel.app/version.json.

## Harness lesson (durable, from worker)

`tbPlayerStrike` doesn't advance the turn alone — the action economy advances
only when `moveLeft <= 0`. A harness that strikes with moves remaining never
gives the monster a turn, so status windows never tick. Honest pattern:
strike → WAIT to forfeit moves.

## Could not verify

- Full `tbBarrierExit` flee during the projector's watch phase end-to-end (world
  travel in harness); holds structurally.
- Multi-toad chorus-join vs shout scatter interaction (single-toad harness only).
