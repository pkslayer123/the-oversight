# Break-it: shows & broadcast (target 13) — ROUND 2, 2026-10-10 ~12:40 CDT run

Worker worktree: `break-shows-r2`. Canon read first: `docs/CANON.md` + `docs/CONTESTS.md`;
round-1 evidence (`evidence/2026-10-10/break-shows-broadcast.md`) read to avoid repeats.
No canon invented.

## Catches (2, both fixed)

### 1. HONESTY — `SHOW_REFUSED` outcome commentary fell into the generic pool (hook-after-classify class)

`_showEnd`'s comment promises outcome commentary "tied to the actual result, never a
generic line" (the round-1 fix made it fire while the broadcast is live). But
`classifyBeat('SHOW_REFUSED')` matched none of the regexes and fell through to
`generic` — so a defiant on-camera refusal got a shrug ("The galaxy watches. The
galaxy judges. The galaxy snacks."). Every other outcome name resolves: WON→triumph,
LOST→embarrassment, MIXED→together, VILLAGER_FANS→triumph, VILLAGER_SHAME→embarrassment,
VILLAGER_BOTH→together. Only REFUSED was generic.

Fix (`src/js/broadcast.js`): new authored `refused` commentary pool (4 lines, alien
commentator register), `classifyBeat` rule `/refus/i → 'refused'`, and a `refused`
crowd-reaction row. Sibling sweep of the same class: classified ALL beat names that
can reach `broadcastBeat` — outcome beats are now 7/7 on authored pools; `contestChoice`
(mid-contest, not an outcome) → generic is the honest fallback by design. Proof:
`scripts/test-shows-r2-20261010.js` H5 (failed before fix with `refusedPool=0`, passes after).

### 2. Rule-duplication drift — `_showEnd` prize inlined the `apWackyGift` filter

The fame-seeker commit (2026-10-10) established "one helper, one rule" for the fan
paths (apCarePackage + club-boon curio) but `_showEnd`'s prize block still inlined
the same filter (`origin==='alien' && tier<=1 && !kcalEach && class!=='food'`). Any
future change to the never-dinner rule would silently diverge the show-prize path.
Fix (`src/js/contests.js`): `_showEnd` now calls `this.apWackyGift(1)` — behavior
identical (verified: same candidate set, same uniform pick), one rule again.

## Attack surface — what held (the deeper level)

- **Exploit:** 60-refusal summons farm grants nothing, favor floors at −100 (no silent
  underflow); empty-tank stunt refused out loud, no free prize, no advance; stunt nets
  −200 + 30–69 snack (the shaken-loose package) — no kcal-positive loop; contest-win +
  stunt-win same day = ONE package (4-day gate whiffs aloud).
- **Mixed-deed notability laundering (new vs r1):** cross-type is LINEAR — one of each
  of the 6 authored deed types = weight 29, beating 50 identical showmanship deeds
  (16.25). Not a bug: per-type decay is the sublinearity (r1), and casting is
  notability-first by design — a laundered villager IS pulled over a plain player
  ('star', never whim-silent). The churn premium is bounded by the deed-type roster
  (6 authored, impact ≤4) and favors are earned on camera.
- **Softlock:** exile mid-broadcast and death mid-broadcast both terminate cleanly
  (frame lifts, activeContest null, no throw); villager watch path renders and
  terminates with no extra input; countdown with exiled player recasts or cancels
  aloud (resolveContest's RECAST, Steve 2026-10-06).
- **Honesty:** the −2 refusal favor now verified against REAL state (round 1 stubbed
  apAdjustFavor — the actual landing was never checked; it lands exactly −2 in
  showbiz); ticker renders live / silent when dead; LIVE line names the real show;
  vault-shy fallbacks (package + club boon + show prize) all said aloud with snacks/
  no-pocket intact; BEANS can unreachable across all fan paths (only edible alien
  item, excluded by both filter conditions; no bare-`kcal`-field items in data).
- **Dead code:** summons reachable from live `contestTick` under dip conditions
  (seed-found, 600-hunt); dead player never summoned over 200 dip ticks and the
  slot falls through unconsumed; club boons reachable — all 4 branches fire and
  narrate (fight +10 clamped, survival pantry share, social +1 unity, showbiz
  wacky curio), 5-day gate holds; apWackyGift's shy fallback reachable and honest.
- **Overlap:** no runtime path can double-fire shows/summons — `contestTick` returns
  null while `pendingContest` exists or `activeContest` isn't done; the only callers
  are the dawn branch (guarded) and debug scenarios. `broadcastStart`'s idempotent
  meta-update is the backstop, never a teardown.

## Note (not fixed — test-harness lesson)

Round 1's proof stubbed `apAdjustFavor` (favor deltas recorded, never applied) and
`Game.say` writes to the game log, not the sysSay capture — so "said aloud" checks
for `this.say(...)` lines need a `say` capture too. The r2 harness captures both and
keeps the real favor function.

## Proof

`scripts/test-shows-r2-20261010.js` — **65/65 × 3 seeds** (777002, 424242, 999983).
Before fixes: 61/65 (H5 failed as designed — generic-pool refusal; the _showEnd
refactor was equivalence-verified before and after).
Regressions: `test-shows-break-20261010.js` 80/80; `attack-fameseeker-20261010c.js`
52/52; ontology 53/53.

## Landing

Commit `break-it shows r2 2026-10-10: ...` (files: `src/js/broadcast.js`,
`src/js/contests.js`, `scripts/test-shows-r2-20261010.js`). Merge locally via
--ff-only, pending ship. No [needs-eyes] — no feel/UI change; commentary-pool
content addition is text-only.
