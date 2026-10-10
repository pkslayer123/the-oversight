# Break-it: contests — round 13 (2026-10-10)

Target: the contests system (`src/js/contests.js`, `src/js/contestEngine.js`,
`src/js/broadcast.js` + the app.js contest-modal wiring). Canon read first:
`docs/CANON.md`, `docs/CONTESTS.md`. Prior rounds: r11 (cheer-trap,
dead `_cxWin`/`_cxLose`, arena-death hygiene, genRoster dead-leak),
r12 (held-counter terminals, eligibility panel off-the-board, co-winner
share). This round went where they didn't: the ratings/scheduling signal
chain and dead-helper census.
Proof: `scripts/test-break-contests-r13-20261010.js` — 22 checks × 3 seeds
(424242 / 777 / 31337), all green.

## Kills (4)

### K1 — the ratings-dip signal was DEAD: the summons never aired (DEAD CODE + HONESTY)
**Attack:** traced every writer of `state.village.viewership` repo-wide.
**Break:** viewership only ever GREW in live play — `recordMoment` (+1),
sticky `havenViewership()` init, the summons's own +2. Every decrement lived
in zero-live-caller code: `declineChallenge` (−3, marked DEAD, superseded)
and `arenaAct`'s cowardice −2 (zero callers outside ledger.js). So in
`contestTick`, `trend = now − lastWeek` was ≥ 0 on every dawn, and
`trend < -1` could NEVER fire. Consequences, all dead in live play:
- the +0.15 scheduling bump and 75% contest-share-when-dipping,
- the 20% ratings-summons branch — `fireRatingsSummons`,
  `ratingsSummonsPhases`, the three played choices (200 kcal + 4 trauma
  stunt / phone-it-in / refuse on camera), the +2 viewership recovery, the
  rate-limited care package: a canon system (Steve 2026-10-04) with full
  copy, costs, and prizes, UNREACHABLE. The Alien Players lesson, again.
- The audit-shows DIP-SIGNAL FIX (2026-10-09) fixed the comparison ORDER
  (was compared after overwrite — always false) but not the SIGNAL.
**Fix:** attention fades — `contestTick` now decays viewership −1/day at
dawn (day 14+, floored at 0) before computing the trend; dip = any
day-over-day decline (`trend < 0`). Quiet stretches genuinely go soft; big
plays (recordMoment +1, delivered stunt +3) outrun the fade. The
`_lastWeekViewership` key name stays for save compat; the comment now says
honestly that the signal is day-over-day. `docs/CONTESTS.md` ratings
section amended (one paragraph). Ontology `ratings_scheduling` /
`ratings_summons` rules amended.
**Design note (Steve can overrule):** −1/day is deliberately gentle — a
quiet day reads as dipping, which is what "when the numbers go soft"
means. Deliberate quiet-farming for summons is a real trade (200 kcal +
4 trauma per stunt, 2/week budget cap), not an exploit.
**Proof:** K1a models the old rules over 30 quiet dawns → dip never
detected (the break, pinned); K1b 5 quiet dawns → viewership strictly
declines, never negative; K1c forced dip + pinned RNG → `contestTick`
returns `{id:'__summons'}` and consumes exactly 1 budget slot; 60 quiet
dawns with seeded RNG → ≥1 summons airs; K1d 3 moments outrun the fade,
rising days coast (no summons); K1e dead scholar → slot falls through,
no summons (castability gate holds).

### K1b — SIBLING, same bug class: `_cxChance` "ratings are slipping" was dead
**Attack:** swept the same dead-signal class into contestEngine.
**Break:** `_cxChance` (chance-cat resolver: wheel/lottery/secrets/
longodds/auction) read the same `_lastWeekViewership` trend with the same
`trend < -1` — "the ratings are slipping — the System gives the audience
its favorite" never fired; chance contests were always "flat → the
trusted" (or rising → dark horse). The documented three-way behavior was
dishonest in live play.
**Fix:** `trend < 0`, matching the scheduler; comment notes the decay
makes it reachable.
**Proof:** K1f — slipping → highest-notability wins ("slipping" in the
detail); flat → highest-trust wins; rising → lowest-notability (dark
horse) wins.

### K2 — `broadcastWatching()` was a dead helper (DEAD CODE)
**Attack:** call-site census over broadcast.js (9 defs).
**Break:** zero game call sites — app.js inlined `ac.participant !==
'player'` at the watching-ribbon render instead of calling it. (It was
covered by old unit tests and the ontology doc, which is why nobody
noticed it was unwired in the game.)
**Fix:** wired, not deleted — app.js `contestBoxHTML` now calls
`Game.broadcastWatching(ac)` (behavior-identical; the caller guarantees
non-null `ac`). Ontology 57/57 still validates.
**Proof:** K2 — helper semantics + app.js source contains the call.

### K3 — arena-fled "LOSE+shame" comment overstated the engine (HONESTY)
**Attack:** read `_contestArenaAfter`'s fled branch against the ontology
header's `(won→next wave/WIN, lost→death processed, fled→LOSE+shame)`.
**Break:** there is no mechanical shame for contests — fled lands LOSE
with the crowd's disappointment said aloud + showmanship notability.
**Fix:** comment corrected; no behavior change.

## Held (documented, not fixed)

- **Mid-modal autosave:** the 30s autosave / visibilitychange save CAN fire
  mid-contest-modal. Verified benign: phases are stored rendered (data —
  text/choices/do/next), `activeContest` JSON-round-trips, and the restored
  modal keeps playable phases with labeled choices (K3 proof section).
- **Pool retirement:** canon (`docs/CONTESTS.md`) says old events retire
  "when they've stopped being interesting" — `pickContest` never retires
  (`contestsSeen` only gates the hardened variant). Same class as r12's
  companion-bringing gap: a canon/code gap, not a break. Pinned by a test
  so it can't silently change.
- **`dance_off` / `nap_wars` lack `mixed` text:** unreachable — neither
  show authors a `mixed` choice; `_showEnd`'s generic fallback would cover
  a mis-authored one. Noted, not "fixed" into noise.
- **SHOW_BEATS ↔ showPool census:** exactly 1:1 (30/30) — no dead show
  content, no beat-less pool entries.
- **contests.js function census:** 94 `G.*` defs; the 7 with no in-file
  callers (`contestTick`, `fireShow`, `fireRatingsSummons`, `fireContest`,
  `resolveContest`, `contestChoose`, `_contestArenaAfter`) are all wired
  from game.js / app.js / the tbEnd hook. contestEngine 16/16 reachable
  (r12, still true). `src/data/contests.json` (44 pool contests) is live
  data via `contestPool()`, not dead.
- **Re-entry / double-terminal:** r12's guards re-verified via the r12
  suite (34/34) — no regressions from the decay change.

## Sibling sweep
Same bug class (dead trigger signals) hunted across the contest/show
scheduling chain: `trend > 2` coasting (live — recordMoments accumulate),
`recentDeath || fracture` +0.10 (live — `v.fallen` is written), show
milestone `now >= _peakViewership + 5` (live — peaks ratchet on deeds),
`givesChoice || rng < 0.3` (live), whim 10% (live). Only the two dip
readers were dead. `_showEnd`/`_showVillagerEnd` terminal hygiene
re-checked — no new gaps.

## Regressions
test-break-contests-r13 22/22 × 3 seeds · r11 suite 50/50 · r12 suite
34/34 · ontology 57/57 validates · `node --check` clean (contests.js,
contestEngine.js, app.js, proof script). Reb
...[truncated 417 chars]