# noDodgeNext wiring backlog — removal proof notes (2026-10-07)

## Decision: REMOVAL, not a new monster-dodge system
The vestigial `noDodgeNext` flag was set when AMBUSH's ready-strike landed
(`src/js/abilityActions.js`) but READ NOWHERE. Verified: the dodge system in
`game.js` `tbDamage` (~19335-19361) is player-side only (`t.kind === 'player'`
— FOOTWORK + agility let the *player* dodge *monster* attacks). Player strikes
have no monster-dodge mechanic (strikes don't miss except haymaker's
accPenalty), so the card's "target can't dodge" was a promise with no
mechanism. Building a whole monster-dodge mechanic is out of backlog scope
and would change combat feel broadly; the honest fix is removal + honest text.

## Changes (committed)
- `src/js/abilityActions.js`
  - `_applyAbilityActionMods`: removed `s.noDodgeNext = true;` + its
    "No-dodge: set flag for the dodge check." comment; comment rewritten to
    document *why* there is no flag (no dodge mechanic on the player-strike
    path). 2x mult and the 'AMBUSH: they never saw it coming' say line kept.
  - `'ambush.set_ambush'` impl: `s.ambushReady = { mult: 2.0 }` (dropped the
    dead `noDodge: true` field); say line "they won't dodge it" rewritten to
    "they never see it coming" (same false promise, same spot — in scope).
- `src/data/abilities.json`: `set_ambush` effect ->
  "Spend turn preparing. Next attack is 2x damage — they never see it coming."
  (`\u2014` escape matches the file's existing style).
- `src/js/game.js:16993` `delete s.noDodgeNext` LEFT ALONE (harmless cleanup,
  sibling-active area — not edited per assignment).

## Proof
`scripts/test-ambush-noDodge-20261007.js` — tests the COMMITTED tree
(modules eval'd from `git archive HEAD`; the dirty worktree/shared index are
not trusted on this hot tree). Full src/js module list in index.html order
minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js; window stubbed
for eval, deleted before playing; seeded PRNG (mulberry32).
- A1 (unit, exact): `_applyAbilityActionMods(40)` with the exact flag object
  the fixed impl sets -> 80; flag consumed; `noDodgeNext` never set; say line
  honest.
- A2 (impl integration): real `useAbility('ambush','set_ambush')` in combat ->
  `ambushReady = { mult: 2.0 }` exactly (no `noDodge` field), honest say text.
- A3 (e2e): readied ambush fires on a real `tbPlayerStrike`; damage dealt,
  honest AMBUSH line, flag consumed.
- B (grep, committed src): zero `noDodgeNext` assignments remain; only the
  allowed `delete s.noDodgeNext` cleanup in game.js.
- C (grep): no can't/cannot/won't-dodge promises in abilityActions.js or
  abilities.json; `set_ambush` card text is the honest rewrite.
- Result: **17 passed, 0 failed on seed 7 AND seed 42.**

## Sibling hunt (no other player-strike-path dodge promises)
Grep of committed src for can't/cannot/undodgeable/won't-dodge: all remaining
hits are the *player-defense* direction (monster attacks vs the player's
dodge — `opts.undodgeable` in tbDamage, sunbasker dive, rent collection,
lure's Distress Call, direct telegraphs). Per assignment these are left alone.
No other card/game text promises target-can't-dodge on the player's
offensive strike path.

## Commits
- `e3608b66cc908127327e3ac47a888690176f7aae` — the fix + proof test
- `d4a735b9c92f8f599e18f9b0c40ff6934d349b0a` — test fix (abilities.json top
  level is a list, not `{abilities: [...]}`)
- (this note) — committed separately; hash recorded in the loop run note.
- NOT pushed (per assignment).

## Tree-state observations (for the loop coordinator)
- A sibling committed `dd1c7f4` ("fireside wiring backlog notes") mid-run,
  after my HEAD-extract (was 213c0ed). It did NOT touch my files
  (evidence + scripts + game.js only) — verified no stale-base revert before
  committing. My commit parents cleanly on dd1c7f4.
- The shared index still holds the sibling's armed staged cleanup: staged
  DELETION of `src/js/abilityActions.js` and a staged gutting of
  `src/data/abilities.json` (~979 deletions, `set_ambush` absent in the
  staged version). NOT touched.
- Worktree `src/js/abilityActions.js` is UNTRACKED and STALE (predates HEAD's
  hunter-playtest edits — someone restored it from an old copy after the
  staged deletion). NOT touched.
- Worktree `src/data/abilities.json` has a sibling's UNCOMMITTED balancing
  edits (brawler_instinct/berserker/line_up text + modifiers, ~37+/7-). NOT
  touched, NOT swept into my commit.
- Commit method: manual private-index recipe (read-tree BASE, hash-object +
  update-index --cacheinfo from /tmp edited blobs, mass-deletion guard,
  HEAD-move check, commit-tree -p, update-ref). `scripts/safe-commit.sh`
  was extracted from HEAD but NOT used as-is: it stages worktree content,
  which would have swept the sibling's uncommitted abilities.json edits into
  my commit. Same guards, safer staging source. No `git add`/`git commit`
  touched the shared index at any point.
