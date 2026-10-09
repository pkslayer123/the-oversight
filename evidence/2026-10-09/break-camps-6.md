# break-it: camps & structures, round 6 — BRIDGES (2026-10-09)

Worker: break-camps6 worktree. Proof: `scripts/test-camps6-breakit-20261009.js`
(40 checks. BEFORE run: 20 FAILURES — every catch below demonstrated red.
AFTER: ALL GREEN × 3 seeds: 20261009, 1, 777.)
Existing travel suites re-run green: test-blocked-travel-feedback.js (13),
test-travel-breakit.js (13). Ontology gate: ✓ 50/50 validated.

Context: rounds 1–5 killed phantom camps ×2, lying breakCamp messages,
pack→re-pitch free repair, shredded-tent state, room eviction invariants,
INFINITE BURY, sweepDeadFires eating tents, storm camp rules, bulldoze camp
integrity. This pass attacked what they left alone: the tile-level BRIDGE
(buildBridge) and the tile structure ledger.

## CATCH 1 — DOUBLE-BUILD EXPLOIT (exploit + honesty) — BROKE, FIXED
**Attack:** `buildBridge` (game.js) had no `dest.bridged` guard and no
need-check. The blockage card can sit open; the engine is the last line.
Called twice on a washed_out tile with 8 wood: spent 8 wood, pushed two
`{type:'bridge'}` entries onto the same tile, `bridged` still just true.
**Fix:** engine-level guards — refuse honestly (no spend) when already
bridged ("There's already a bridge here — lashed and holding.") or when the
tile needs no bridge. Proof A2–A4 red→green; A1 control (legit build spends
exactly 4) green throughout.

## CATCH 2 — DRY-LAND BRIDGE LIE (honesty) — BROKE, FIXED
**Attack:** direct `buildBridge` on dry land — meadow, no blockFrom, not a
creek. Spent 4 wood, set `bridged=true`, said "A rough bridge spans the gap"
— spanning nothing. A phantom structure flag with a lying label.
**Fix:** same need-check — creek+needsBridge or washed_out blockFrom, else
"No gap to span here — save your wood." No spend, no flag. Proof B1–B4
red→green.

## CATCH 3 — DEAD STRUCTURE LEDGER (dead code) — REMOVED
**Attack:** `dest.structures[]` was WRITTEN (push at build) and NEVER READ
anywhere — grep found the push as the only touch. Every bridge decision keys
off `dest.bridged`. The "foundation for walls/palisades" comments were
speculative scaffolding for systems that never arrived. The Alien Players
lesson (2026-10-08) applies: a write-only ledger is dead weight.
**Fix (Steve's no-dead-code rule — decide-and-document):** DELETED the push,
the per-tile `t.structures = []` init, and all three future-scaffolding
comments. `dest.bridged` is the source of truth. The one thing the ledger
would have carried (what a destroyed bridge must restore) lives in a single
purpose-built field, `dest.bridgeFrom` (washed_out origin dx/dy), not a
ledger. Proof C1–C3 (source grep + runtime) red→green; ontology gate ✓.

## CATCH 4 — UNBREAKABLE BRIDGE (Steve's law) — BROKE, FIXED
**Attack:** tile-level bridges had NO destruction path. tbBulldozeCells works
the detail grid (bridges live between tiles); storms only took camps. Havens
are the ONLY unbreakable human structures — a permanent player bridge was a
law violation. Round 3 noted "bridges aren't bulldozable — no new
violation"; this pass judged that wrong: no destruction path IS the
violation.
**Fix (decide-and-document, Steve can overrule):** new `Game.smashBridge(x,
y, cause)` engine function + `stormSmashBridges()` hooked into BOTH
resolveStormFront branches (the storm is global). A storm flood washes out
bridges on CREEK tiles — "The storm swells the creek [bearing] — your bridge
washes out in logs and spray." Dry-land washed-out-path bridges STAND
(nothing to flood — and it gives the player a real choice: water crossings
are storm-fragile, dry ones aren't). Never strands: creek keeps needsBridge
so the blockage card returns with bridge/swim/go-around intact; a washed-out
bridge's smash restores the original blockage verbatim from bridgeFrom. The
build copy now foreshadows the risk ("Rough wood, though — a bad storm could
take it") — the old "It'll hold." was a promise the engine couldn't keep.
Proof D0–D6 red→green (D0 asserted the function's existence — before, the
violation; after, the path). D7: smash on a bridgeless tile is a quiet no-op.

## Held (attacked, resisted / verified)
- **PERSISTENCE:** bridged + bridgeFrom survive save/load verbatim (tiles
  serialize wholesale in syncRun). Before the fix, the DUPLICATE ledger also
  survived — save/load persisted the dup, it never healed it (proof E4
  red→green). Double round-trip stable. (Proof E1–E3, E6 green throughout.)
- **SIBLING SWEEP — every other player-placed thing:**
  - hidden caches: bury→digUp round-trip removes the ledger entry
    (removable ✓); theft and spoilage paths unchanged. (F1)
  - blockFrom clearings: permanent by design ("the path stays clear"),
    read by travelBlockage, deleted by clearBlockage/buildBridge, honest
    copy. Not a ledger — held. (F2)
  - player campfires: destroyCell still breaks them and purges state.fires
    (no split-brain); the haven-lie copy ("Havens do not break") never fires
    for player fires. (F3 — test initially missed `till`, fixed; engine was
    correct.)
  - claimSite cairn: marker, double-claim guarded, consumed by founding —
    no destruction path needed. (F4)
  - founding shelter tiers: convert into the new haven's building
    (unbreakable, correct). _forkNewHaven leftovers: rounds 3/5 held
    (camp/fires/caches are physical/node-keyed — "just theirs", reachable).
- **UI path:** the blockage card only renders for live blockages, so the new
  guards are unreachable from honest UI — they're engine armor for stale
  cards and direct calls. A refused stale click already refresh()es (app.js).

## For Steve's overrule
The storm-takes-creek-bridges rule is a design call made under "figure it
out yourself": it is deterministic and learnable (creek bridges are
storm-fragile, dry ones aren't), foreshadowed in the build copy, and it
keeps the unbreakable law absolute. If he'd rather bridges be permanent, the
revert is one hook + copy line — say the word.
