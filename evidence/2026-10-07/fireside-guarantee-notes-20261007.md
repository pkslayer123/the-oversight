# Fireside wiring backlog — worker notes (2026-10-07 ~17:40 CDT)

Worker: fireside-teaching owner. Base HEAD: 213c0ed. Commit: cbe58ef75cec93d067ac0dbd0a8e8e2a7046eeee.

## 1. Fireside teaching RNG gating → guaranteed first-return teaching (CODE)

Standing rule (Steve): returning to haven with a new haul is the key teaching
moment. The 35% ambient gate in `firesideTeaching` could eat exactly that moment.

Edit (minimal, 2 hunks in src/js/game.js, +11/−1):
- `returnToVillage()`: after `daysAway` is computed, `if (daysAway > 0)
  this.state.village.homecomingFireside = true;` — any real return (1+ days
  away) arms the flag. Same-day returns don't.
- `firesideTeaching(isPresent)`: at entry, `const homecoming =
  !!v.homecomingFireside; v.homecomingFireside = false;` (consumed regardless
  of outcome), then gate becomes `if (!v.roster || (!homecoming &&
  Math.random() > 0.35)) return;`. The `!taught.length` early-out is untouched —
  nothing to teach still says nothing.

Proof: scripts/test-fireside-return-guarantee-20261007.js (seeded mulberry32,
full src/js module list in index.html order minus DOM-only app.js/sprites.js/
tile-scenes.js/move-anim.js; window stubbed for eval, deleted before play).
Engine = HEAD pristine src/js + repo's current game.js overlaid (byte-identical
to committed copy at test time).
- Seed 20261007: 11/11 green. Seed 777: 11/11 green.
- First fireside part after a 3-day return ALWAYS fires a visible line
  ("Fireside lesson: ..." / drawn-in-dirt variants) — no silent action; the
  homecoming return line itself also fires ("You walk back into Haven — 3 days
  gone...").
- Later parts revert to the ambient gate: 39/100 (seed 20261007) and 40/100
  (seed 777) fired — right on the 35% design band; gate is provably still real
  (not 0/100) and still generous (not 100/100).
- Flag consumed even on the nothing-to-teach early-out; no-return same-day
  visits never arm the flag.

## 2. Forager ACT2 backlog → VERIFIED STALE, CLOSED (no code change)

Backlog claim: ACT 2 used `Game.ident` (doesn't exist) and
`Game.refreshItemNames && null;` no-op.
- `git show HEAD:scripts/play-feel-socialite-round3-20261007.js | grep` for
  `Game\.ident\b` → none; for `refreshItemNames` → none. Both markers gone.
- ACT 2 now uses real `Game.identifyPlant(learnPid, 'observation')` (line 233).
- Ran the full script (extracts pristine HEAD at runtime; verifies the
  unmodified engine): 27/27 checks green (seed 20261007) — ACT 2 (identify
  while away, awayLearned queue, no home rumor, no witness line) and ACT 4
  (fireside ambient spoke, taughtAround marked, village learns human-to-human)
  all green. Item closed; no edit.

## 3. Drama Part C header flip (COSMETIC, comments only)

scripts/test-drama-wiring-fixes-20261007.js: "EXPECTED-FAIL pin" comments
replaced with RETIRED-pin wording (ember fix ce0864b landed); Part C kept as a
passing regression assertion. No logic changed.
- Part C: PASS — ember timing 2 / 1 / 0 across the three cycles (design: 2/1/0).
- ALERT (not mine to fix — drama.js is a sibling's active area): the script
  reads the WORKTREE, and the sibling's in-flight worktree drama.js DELETED the
  beamHorror beat (0 refs vs 2 at HEAD) and dropped one plantIdentified mapping
  (3 vs 4 at HEAD), so Parts A/B fail in the worktree run → script exits 1
  there. At pristine HEAD the same script exits 0 / RESULT: PASS. Re-verify
  once the sibling's drama work lands.

## Tree hygiene notes

- src/js/game.js worktree was dirty (sibling's uncommitted edits, which among
  other things removed beamHorror refs from THEIR copy). HEAD-extract pattern
  used throughout: edited only pristine-HEAD copies in /tmp, copied back only
  my files. The sibling's pre-my-work worktree game.js is backed up at
  ~/workspace/goals/the-scattering-roguelite-survival-game/hidden_files/fireside-20261007/game.js-worktree-backup-1739CDT.js
  (stash left intact; shared index's staged deletions untouched).
- Committed via scripts/safe-commit.sh (restored from HEAD to /tmp/sc/scripts/)
  on a private index — never bare git add/commit; nothing pushed.

## Proof commands (re-runnable)

- `node scripts/test-fireside-return-guarantee-20261007.js` (SEED=20261007 / 777)
- `node scripts/play-feel-socialite-round3-20261007.js` (ACT2 backlog verify)
- `node scripts/test-drama-wiring-fixes-20261007.js` (Part C regression)
