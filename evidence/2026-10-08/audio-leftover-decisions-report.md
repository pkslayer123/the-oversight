# Aggro-audio leftovers — design decisions (Steve 2026-10-08)

Worker: game.js declare/audio regions. Worktree: `~/workspace/worktrees/aggro-audio-leftovers` @ 9e84450.
Mandate: resolve the 3 aggro hooks the audio-game worker left for "Steve's call" + the Bison
`"horn": 2` off-schema item. Steve's standing order (2026-10-07 23:55 CDT) covers design calls —
decisions made, documented in code comments, proven by test. He can overrule.

## Decision 1 — nightcourt 'nightcourtTurn': FIRE at the roost beat (option a)

**Fiction reasoning.** The nightcourt dive is deliberately silent — "the silence IS the telegraph" —
and firing a head-turn sound at the dive would break that fiction. But the hook is named
*nightcourtTurn*: an owl rotates its head while ROOSTING, tracking. The sound belongs to the
perch, not the strike.

**Change (game.js, nightcourt roost branch):** the roost `pickFresh` message is captured; when the
picked variant is the head-rotation line ("Its head rotates — too far — tracking you."), the
data-driven hook fires via `this.tbAggroAudio(m)` → `encounter.aggroAudio` = 'nightcourtTurn'.
~1/3 of roost turns. The dive declare path is untouched — the dive stays silent.

## Decision 2 — heron 'heronUnfold': KEEP, already live (option a)

**Finding.** The "unreachable" label was stale. A seeded probe (3 seeds) showed the audio-game
worker's generic-declare fix (`tbAggroAudio` at the generic declare path) already wired it:
at the heron strike-declare the sequence is `telegraph → heronUnfold → heronStatic`. The unfold
IS the strike-declare tell — the declared behavior the data always wanted.

**Change (game.js, heron windup branch):** comment only — documents the two-hook split so no
future worker "fixes" it: `heronUnfold` is the AGGRO voice (fires at strike-declare via
tbAggroAudio); `heronStatic` is the DECLARE/WINDUP cue (notice+declareAudio, "the air goes
staticky"). Both earn their keep. monsters.json untouched.

## Decision 3 — hushwolf 'wolfSnarl': FIRE at rush resolve, after the hit lands (option a)

**Fiction reasoning.** The rush itself stays silent — Steve killed the rush indicator 2026-10-06
("Silent Rush gives no warning, it just moves and hits"). But a wolf that has made contact
snarls: the teeth are done, now you hear it. No warning is given; the voice is aftermath.

**Change (game.js, `pat.type === 'rush'` branch):** after `tbDamage` lands the rush hit, gated to
`wolfIs(m)` and once per wolf per fight (`m.wolfSnarled` flag — a pack's first contact is three
snarls, not thirty). Fires via `tbAggroAudio(m)` → 'wolfSnarl'. The exploration-notice call site
(game.js:15037, quiet-woods event) is unchanged. Do NOT put any warning on the rush itself.

## Decision 4 — Bison `"horn": 2`: EXTEND the schema

**Reasoning.** Mapping horns to `tusk` (teeth) or `antler` (shed bone) would be biologically
dishonest — bison horns are keratin sheaths, neither. This is a knowledge game about real
bushcraft; horn vs antler is exactly the distinction the codex should honor. One-line change:
`src/data/schemas.json` butcher schema gains `"horn": "number?"`. Runtime was already safe
(generic material naming). `validate-data.js` reports zero `horn` errors after the change.

## Proof

`scripts/test-audio-leftover-decisions-20261008.js` — seeded node harness (mulberry32, SEED env
override, default 20261008; Math.random seeded BEFORE eval; window stubbed for eval, deleted
before play). 11 assertions, **green across 4 seeds** (20261008, 7, 42, 777):

- nightcourtTurn fires at the roost beat; every firing gated to the head-rotation say; never
  fires at/after a dive declare (dive stays silent — verified with a flee-then-dive two-phase fight)
- heronUnfold fires at the strike-declare; heronStatic still cues; ≤2 per fight window
- wolfSnarl fires at rush resolve; no snarl before the first rush hit lands (rush stays silent);
  ≤1 per wolf
- schemas.json allows horn; bison butcher yields all schema-conformant

Sibling regression check: `test-declare-audio-20261008.js` 15/15 green, `test-xp-attempts-20261008.js`
4/4 green.

## Census re-verification at HEAD (task 5)

Re-ran `scripts/test-audio-census-20261008.js` (read-only): **35 pass, 7 fail (seed 20261008)**.
The 7 failures are NOT new unreachable hooks:

1. **5 stale "DOCUMENTED GAP (never fires)" FAILs** (turtleGrind, glasswingBuzz, sunbaskerShimmer,
   hecklerLaugh, lockpickFingers) — these assertions *fail because the hooks now FIRE*. The
   audio-game fix landed; the census test's UNREACHABLE list predates it. Stale assertions, not
   real gaps. The census test needs its allow-list updated by its owner.
2. **delegateDebrief** — registered in app.js, zero call sites in src/js. `tbFifoBreather`'s spec
   array was restructured (droneRecalc/hypeDeflate) and the dispatch is gone; the delegate monster
   itself no longer exists in monsters.json. Vestigial registry entry → needs an app.js removal by
   its owner (same class as the audio-game worker's `patternResolve` finding).
3. **managerCircle / managerCharge / managerDebrief / managerFear** — registered in app.js,
   zero call sites, no "manager" monster in monsters.json. Vestigial registry entries → app.js
   owner. Not in this worker's scope (game.js declare/audio regions only).

**Conclusion: no registered-but-unreachable aggro hooks remain in the encounter system.** Every
`aggroAudio` in monsters.json fires at its fiction-correct moment. The only registered-but-silent
entries are 5 vestigial app.js registry entries needing owner cleanup.

## Files changed
- src/js/game.js — nightcourt roost hook, hushwolf rush-resolve hook, heron two-hook comment
- src/data/schemas.json — butcher schema gains "horn"
- scripts/test-audio-leftover-decisions-20261008.js (new)
- evidence/2026-10-08/audio-leftover-decisions-report.md (this file)
