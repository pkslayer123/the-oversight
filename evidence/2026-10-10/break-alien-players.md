# Break-it: alien players — 2026-10-10

Worker: break-alien worktree. Canon: docs/CANON.md read first. There is NO
dedicated canon doc for alien players (noted per protocol — nothing invented;
all fixes follow the module's own r7 knowledge-gate precedent).

## Catches (all fixed, proof-tested)

**1. KNOWLEDGE LEAK — apMaybeActivate named the persona on the System feed
pre-reveal.** `'◈ The System feed flickers: "Vex Marlowe has entered the
game...'` — true name, no gate, no apRevealAlien. Every other naming site
gates on apKnowsAlien. Fix: pre-reveal it says "A stranger has entered the
game." (Withholding rather than reveal-on-hear: entry announcements happen
for every persona, so revealing here would collapse the 3rd-encounter and
Wren-dead-drop reveal paths.)

**2. KNOWLEDGE LEAK — apMaybeDeactivate, same class.** `"<name> has left
the game."` ungated. Fixed the same way.

**3. KNOWLEDGE LEAK — apEventFeed sadistic-rival line named the persona at
2 encounters** with no gate and no reveal registered — the exact class r7
fixed in apFeedMessage. Fix: pre-reveal it reads "Someone out there has
requested you specifically for the next exhibition."; the named line fires
only when known.

**4. KNOWLEDGE LEAK — apCodexEntry stored p.name ungated** ("safe
pre-reveal") while the codex renderer prints entry.name verbatim — so the
codex showed "Vex Marlowe" after one fight while the fighter card still said
"Stranger". The fighter card, combat intro, feed lines, and reveal message
all treat p.name as the alien truth; the "safe pre-reveal" comment was
wrong. Fix: `entry.name = known ? p.name : 'someone'` (reveal re-runs the
entry and the name lands then).

**5. KNOWLEDGE LEAK (sibling sweep, codex) — app.js codexAliensSection
header read "ALIENS"** the moment you'd met one stranger. Canon: the word
"alien" never appears in player-facing copy pre-reveal. Fix: header reads
STRANGERS until any entry has real species (intro line adjusted to match).

**6. DEAD CODE — apBeamHit built a `newOpts` object with a "beam final"
flag** that nothing ever read (the tbDamage wrap's matching branch was
removed 2026-10-08; apBeamHit never re-enters tbDamage). Removed; comments
reworded to avoid resurrecting the dead token name.

**7-8. Stale comments corrected to match the engine:** apBeamResistLevel
claimed bonded keepsakes in inventory "can push beyond 5" — the engine only
scans equipped slots; apPlaygroundKill claimed the villager-kill limit was
"per alien" — the engine uses one shared 5-day key.

## Attacks that HELD (documented, not failures)

- **Exploit — economy farming:** dead-drop 3-day gate, persona-package 6-day
  gate, care-package favor>=20 + 4-day gate, favor clamp ±100 — all hold
  under forced RNG. Persona-package medkit is a real usable item (not a
  brick); sadistic package records the trackedBy cost. Care-package snacks
  are 30–70 kcal ("a taste, not dinner").
- **Softlock — stasis field:** tbBarrierExit consumed while Rax fields
  stasis; field drops the moment Rax dies. No permanent lock.
- **Softlock — group chain:** tbEnd consume-first bookkeeping verified;
  chained persona re-arms correctly, lastHuntDay recorded, no phantom
  alienEncounter, no throw.
- **Honesty — beam readout:** 5 equipped alien pieces → FULL, count shown
  honestly; inventory keepsakes don't inflate (matches 0.7^n math).
- **Dead code:** all 74 provided functions reachable (module self-wires via
  endDay/tbEnd/tbBarrierExit/tbDamage wraps; encounters.js calls the roll/
  start paths; contests.js calls interference + care package; game.js calls
  grantItem + village gossip). Ontology validator: 52/52 systems green.

## Proof

`scripts/test-break-alien-20261010.js` — 122 assertions, 3 seeds
(20261010, 31337, 9001), seeded shared RNG before eval, window stubbed for
eval then deleted. Pre-fix: exactly the 11 expected failures (3 leaks × 3
seeds + 2 dead-code); post-fix: 122/122 green. Regression:
test-alien-breakit-20261009.js 75/75 green; test-alien-break-economy.js and
test-alien-break-tech.js have pre-existing failures (2 + 4) identical on
pristine HEAD — Sable dread-projector/crystal-lattice fear tests and a kcal
accounting test, untouched by this run.

Commit: 08afd9d1 (break-alien branch). [needs-eyes]: feed copy + codex
header changes are player-visible.
