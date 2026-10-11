# Break-it: shows & broadcast (target 13) — ROUND 3, 2026-10-10 ~20:40 CDT run

Worker worktree: `break-shows` (fresh registration for this run). Canon read
first: `docs/CANON.md` + `docs/CONTESTS.md`; prior rounds read to avoid
repeats: `evidence/2026-10-10/break-shows-broadcast.md` (r1),
`evidence/2026-10-10/break-shows-r2.md` (r2), `evidence/2026-10-10/break-contests-r13.md`,
`evidence/2026-10-10/parity-worker-d.md`. No canon invented.

## Catch (1, fixed)

### SOFTLOCK-adjacent — `load()` didn't restore the broadcast frame CSS (half-on frame)

`syncRun` persists `state.broadcast` live (mid-show autosaves are real — the
modal restores from `activeContest`'s stored phases, r13-held). But the
TV-frame treatment (`body.broadcasting` — scanlines/vignette/screen frame) is
DOM-only, set only in `broadcastStart`. After Continue: the LIVE bug and the
commentary ticker restored from state while the grid treatment vanished — the
frame was half-on, against broadcast.js's own rule ("entry and exit are
ALWAYS explicit — the player never wonders whether they're playing or
watching").

Fix (`src/js/game.js`, `load()`): when the restored state has a live
broadcast AND a show modal to restore, re-apply `body.broadcasting`. A live
broadcast with NO modal is a phantom (the two clear together in every end
path — only a corrupted/legacy save can produce it): drop it rather than
frame a bare grid. Proof: `scripts/test-break-shows-r3-20261010.js` S4 —
save mid-summons → load → broadcast live + class re-applied + restored modal
still plays to a clean terminal; phantom case dropped, no class set.

## Attack surface — what held (the deeper level, new vs r1/r2)

- **Exploit — dip-farming under weekly drift:** pinned the fear (viewership
  parked at the drift floor 12 = perma-dip → summons on demand). 8 weeks of
  maximum stunt-farming: summons fire (signal live), every stunt terminates,
  but the loop is kcal-negative (−200 + 30–69 snack per stunt, net < 0 over
  N stunts) and trauma stays bounded (nightly −2 decay; peak ≤ 40). A real
  trade — 200 kcal + ~2 net trauma for a curio + favor — not a farm. The
  4-day package gate and 2/week budget hold throughout.
- **Exploit — heckle-as-fame-button:** 30 heckles → player fame exactly the
  sublinear formula (11.25, bounded), and every heckle costs: victim remembers
  (`memory[].t === 'heckled'`), victim rep moves negative via applyRep, and a
  heckle requires a real villager pull. Not free.
- **Exploit — wacky gifts:** 300 `apWackyGift` grants across tiers 1–3: zero
  dinner, zero over-tier, every grant a usable unique-id inventory entry
  (no dupe ids, no pack-void bricks).
- **Softlock — full terminal sweep:** all 30 pool shows × every player choice,
  all 30 × all 3 watch choices (cheer/heckle/quiet), together ×2, summons ×3 —
  every path terminates with `activeContest === null` and the broadcast
  lifted. 0 throws, 0 stuck, 0 frame leaks.
- **Honesty — commentary census:** all 11 show-path beat names classify to
  authored (non-generic) pools; `SHOW_VILLAGER_BOTH` → `together` (not
  triumph — the `/fans/` regex does NOT match it, verified, r2's 7/7 holds);
  `SHOW_REFUSED` → `refused` (r2 fix holds).
- **Honesty — "a week with a contest gets at most one show pull":** organic
  400-day pin — in every week with ≥1 contest, shows ≤ 1 (structural: the
  2/week budget only admits contest+show as a mixed week). 0 violations, 0
  over-budget weeks.
- **Honesty — scheduling shares pinned:** dipping routes exactly per
  docs/CONTESTS.md (20% summons, else 75/25 contest/show); calm routes 60/40
  with no summons branch reachable (dip-gated).
- **Honesty — gossip/trust:** `_showGossip`'s `noTrust: false` is inert —
  `spreadGossip` hardcodes `applyRep(..., true)` (noTrust), so show gossip
  moves REP only, never trust, per the canon rule. Held at the engine level.
- **Dead code:** broadcast.js 9/9 defs attached and behavior-verified
  (start/beat/end cycle, replay, lower-third, ticker live-vs-dead, watching(),
  crowd, guest title); index.html loads broadcast.js + contestEngine.js in
  order (Alien-Players lesson re-checked); `apClubBoon` + `apCarePackage`
  both fire via `apDailyTick` at favor 60 (not just direct calls); showPool ↔
  SHOW_BEATS 30/30 1:1 re-verified; every authored choice end has matching
  win/lose/mixed text.

## Canon gaps pinned as absent (documented, not built)

Same class as contests-r13's pool-retirement hold — canon promises with no
mechanic; pinned by tests so a future build is deliberate:

- **No "show is restless" pre-pull teaser.** docs/CONTESTS.md scheduling:
  "They can see 'the show is restless' as a pull approaches (gossip, System
  teasers), never the date." No such mechanic exists.
- **No show retirement.** Canon: "old events retire when they've stopped
  being interesting." `pickShow` never retires (mirrors the contest gap r13
  held).

Neither is a break (no promise the engine contradicts — the copy never claims
them in-game), and building them is a design call, not a break-it fix.

## Notes (held, not fixed)

- `mystery_smell`'s "Follow your nose" grants +200 kcal of alien catering
  ("Dinner is served") + a prize curio. Not a never-dinner violation: the rule
  covers the fan-gift curio (apWackyGift filters dinner — holds), while the
  kcal is a stated, played supply prize ("supplies" are canon prizes). Bounded
  by the 2/week budget, said out loud.
- Show win/loss/mixed favor deltas (±1–2) land without an individual
  announcement (apAdjustFavor announces |n|≥3). No promise broken — unlike the
  summons case fame-seeker fixed, no copy contradicts the move. Left as is.
- `broadcastStart`'s "Nobody dies on television… Probably." also fires for
  `contest-watch` broadcasts, where villagers can die in the arena. The
  "Probably" is doing the work; Steve's wry hedge. Left as is.

## Proof

`scripts/test-break-shows-r3-20261010.js` — **63/63 × 3 seeds**
(777003, 424242, 999983).
Regressions: `test-shows-r2-20261010.js` 65/65; `test-shows-break-20261010.js`
81/81; `test-fameseeker-20261010d.js` 28/28; ontology 62/62 validates;
`node --check` clean (game.js, proof script).

## Landing

Commit `break-it shows r3 2026-10-10: ...` (files: `src/js/game.js`,
`scripts/test-break-shows-r3-20261010.js`,
`evidence/2026-10-10/break-shows-r3.md`). Merge locally via --ff-only,
pending ship. No [needs-eyes] — the load() change is invisible plumbing
(frame CSS restored, no UI/feel change).
