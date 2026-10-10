# Break-it: shows & broadcast (target 13) — 2026-10-10 06:08 CDT run

Worker worktree: `break-shows` (registered, heartbeat n/a — short run). Canon read first: `docs/CANON.md` + `docs/CONTESTS.md`; no canon invented.

## Catch (1, fixed + landed)

**Dead outcome commentary beat** (hook-after-teardown class). In `src/js/contests.js`,
`_showEnd` and `_showVillagerEnd` called `broadcastBeat('SHOW_'+outcome)` *after*
`broadcastEnd()`. But `broadcastEnd` sets `state.broadcast = null` and `broadcastBeat`
returns null when not live — so the "commentators call the outcome — tied to the
actual result, never a generic line" beat **never fired**. Copy promised commentary;
the engine dropped it silently. The fix moved the beat to fire while the broadcast
is live, before `broadcastEnd()` lifts the frame (narrative order now: outcome lines →
commentator reaction → "Broadcast over"). +12/−5 in `src/js/contests.js`.

**Sibling sweep (same bug class: hook-after-teardown):** all 3 `broadcastBeat` call
sites verified live-ordered (the two fixed + `_contestRenderPhase`, which fires
mid-phase while live). All 7 `broadcastEnd` end-paths intact and still 1:1 with the
7 `activeContest = null` assignments. No other instances.

## Attack surface — what held (not broken, deeper level)

- **Exploit:** 2/week budget holds (80 ticks in one week → ≤2 events, `used` matches);
  summons refusal is clean (no prize, −2 favor said aloud, broadcast lifts); stunt
  pays exactly one prize (no curio double-dip); care packages rate-limited (1 per
  4 days, favor ≥ 20); show prize double-tap blocked (`contestChoose` returns null
  post-`done`); reqKcal gate refuses out loud on an empty tank; notability weight
  grows sublinearly (50 identical deeds stay bounded).
- **Softlock:** countdown with dead contest id clears cleanly; resolve always
  produces a sequence or a said cancellation; all 3 summons choices terminate;
  unknown show ids fall back to a playable generic beat.
- **Honesty:** TV doesn't kill (`do.dmg` clamps at 1 HP for shows); System's whim
  announced on show pulls; casting is notability-first (star pulled, never the
  unknown); eligibility panel is engine-driven.
- **Dead code:** `broadcast.js` + `contestEngine.js` are loaded in index.html AND
  runtime-wired (no Alien-Players-style dead module); all 6 canon shows in the
  pool with authored SHOW_BEATS; ticker renders while live, silent when dead.

## Naming nit (noted, not fixed)

`_lastWeekViewership` is overwritten every dawn, so the "week-over-week" dip
signal is effectively day-over-day — behavior is as designed; comment-only.

## Proof

`scripts/test-shows-break-20261010.js` — **80/80 × 3 seeds** (777001, 424242,
999983). Before fix: 77/80 (H2, H2b failed as designed — the dead beat). Regression:
`test-break-contest-20261009.js` 76/76, `test-break-contests-20261010.js` 50/50.

## Landing

Commit `8db8aa3e` (files: `src/js/contests.js`, `scripts/test-shows-break-20261010.js`).
Merge `break-shows` failed `--ff-only` at first (master had moved: playtest-loop
landed `80d87aef` mid-run); rebased the 1-commit branch onto master cleanly
(rebase exit 0, no conflicts, fix verified intact, proof re-run 80/80 seed 777001),
then fast-forwarded. Landed locally, pending ship. Worktree released + removed,
branch deleted, reaper final sweep clean, main tree `git status` empty.

Target index advanced 13 → 14 (regional & hierarchy next).
