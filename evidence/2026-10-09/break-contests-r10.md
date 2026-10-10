# Break-it r10 — contests (2026-10-09)

Target index 4. Canon read: docs/CANON.md + docs/CONTESTS.md first. No canon invented.

## Attacks attempted

### EXPLOIT
1. **Ratings summons on a dead/exiled player** — BROKE. `contestTick`'s
   summons branch only checked generic `contestEligible()` (villagers can
   satisfy it) and `fireRatingsSummons()` never checked the player at all.
   A dead (health 0 / over) or exiled scholar got the full live promo-stunt
   modal — "Do the stunt" on a corpse. The 20% summons roll was reachable
   in this state (scripted-RNG proof through the real `contestTick`).
   Severity: medium — softlock-adjacent (modal on an unfit player), honesty
   ("summons YOU").
2. **Refusal showmanship farm** — HELD. Every refusal grants +1 showmanship
   (casting weight up) at +5 trauma. Bounded by the 2/week budget: max ~2
   refusals/week, and the "reward" is being picked MORE (obscurity is
   safety). Diegetically consistent ("the audience will remember").
3. **Weapon-flee farming** (grantWeapon then flee the arena) — HELD.
   Buttons say "yours to keep"; fleeing grants showmanship (embarrassment)
   and a loss. The weapons are mundane (hunting_spear, stone_knife), not
   alien loot. Honest copy, real cost.
4. **Countdown skip / teleport evasion / exile-mid-countdown** — HELD.
   `firesDay` uses `>=` (no day-jump skip); resolveContest recasts dead/
   exiled/vanished contestants from the living eligible or cancels aloud.

### SOFTLOCK
- **Exhaustive phase-graph walk**: all 44 pool contests × {choice-mode,
  grabbed-mode} × {9999 HP, 25 HP} — 6,716 edges, 4,634 terminals via the
  REAL `contestChoose` with state snapshots per edge. Zero dead ends, zero
  null returns, zero throws, zero cycles (depth-cap + revisit detection).
- Same walk for every show beat: player / watch / together / summons —
  all terminate.
- Cycle detection was active: any choice looping to a revisited phase would
  have failed. None do.

### HONESTY
1. **Contest-mode 'MIXED' terminal** — BROKE (latent). `contestChoose` routed
   `next === 'MIXED'` unconditionally to `_showEnd`, so a contest landing
   MIXED would silently become a *show* ending: showbiz favor instead of the
   prize table, no winner's mark, no contestWin notability. Nothing authors
   it today, but one mis-authored phase would have downgraded the whole
   contest economy silently.
2. **2/week budget over 21 dawns** (incl. summons slots) — HELD. Max 2/week
   in every window, summons consumes the same budget.
3. **"Top ~20%" viewership-rank gate** (docs/CONTESTS.md) — documented
   divergence, not a code bug. Casting is notability-weighted per Steve's
   2026-10-08 ratings_casting decision (documented in the @ontology header);
   the UI eligibility panel promises only "who can go — and why", which is
   true. The canon doc's "Needed" section predates the decision. Flagged for
   a doc touch-up, not changed unilaterally.

### DEAD CODE
- contests.js, broadcast.js, contestEngine.js all in index.html script list;
  `contestTick` invoked in the game.js dawn branch; the `__summons` return
  is consumed by the dawn branch; `_contestArenaAfter` is hooked in tbEnd
  (game.js:30611-30616).
- All 25 public contest/show/engine functions exist and are wired.
- Death-line coverage: 44/44 pool contests (bespoke or category).
- Watch beats: 44/44 (setup/turn/end). Generic fallback unreachable.
- Show beats: all 30 pool shows authored; zero on `_showGenericBeat`.
- Every pool contest builds playable phases. All grantWeapon ids exist in
  data/items.

## Fixes (src/js/contests.js)
1. **Summons castability** (contestTick + fireRatingsSummons): the summons is
   for the player specifically. If the player is dead (over/health<=0) or
   exiled, the tick falls through to normal scheduling (slot unconsumed —
   the show goes on without you) and `fireRatingsSummons` refuses out loud
   ("The System looks for its star... and finds no one fit for the cameras")
   returning null.
2. **MIXED terminal**: contest-mode MIXED now routes to
   `_contestEnd(ac, 'lost', false)` — contests land as contests (same
   fallback convention as a bad numeric next). Show-mode MIXED unchanged.
3. Ontology header: added `summons_castability` rule. `validate-ontology.js`
   passes (52/52), docs/ONTOLOGY.md regenerated.

## Sibling sweep
Same bug class ("targets the player without a castability check") hunted in
fireShow/showCastPull (showEligible excludes dead/exiled — clean),
contestInterruption (resolveContest recast checks playerAlive; fireContest
uses contestEligible — clean). Only the summons had the hole.

## Proof
- scripts/test-break-contest-r10.js (new): 20/20 × 3 seeds (424242, 777, 31337).
- Regression: test-break-contests.js 65/65, test-break-contest-20261009.js
  76/76, -r3 22/22, -r4 32/32 (seed 424242).
- validate-ontology.js: 52/52, release permitted.

## Attack-surface notes (held, worth knowing)
- Refusal is a fame engine by design; the 2/week budget is the governor.
- Weapon-flee keeps are priced in embarrassment, not prevented.
- Notability weight grows ~linearly with repeated deeds (floored 0.125
  repeats) — stars get picked; that's the design, and obscurity is the
  opt-out.
- `_contestVerdict`'s `pid === 'player'` fallback (resolve as lost) is
  defensive-only; the watch branch never includes the player.
