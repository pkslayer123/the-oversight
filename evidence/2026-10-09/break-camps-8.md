# break-it: camps & structures, round 8 — tent fire, multi-tent over-break, travel (2026-10-09)

Worker: break-camps8 worktree. Proof: `scripts/test-camps8-breakit-20261009.js`
(93 checks. BEFORE run: 7 FAILURES — every catch below demonstrated red.
AFTER: ALL GREEN × 3 seeds: 20261009, 1, 777.)
Regressions green: test-camps6-breakit (40/40), test-camps7-breakit (71/71),
test-storage.js (59/59). Ontology gate: ✓ 51/51 validated.

Canon: docs/CANON.md read. **There is NO dedicated camps canon doc** — stated
per instructions instead of inventing (same gap noted in rounds 6–7).
Relevant canon used: docs/STORAGE.md (stash/buried caches) + Steve's standing
law "Havens are the ONLY unbreakable human structures".

Context: rounds 1–7 killed phantom camps ×2, lying breakCamp messages,
pack→re-pitch free repair, shredded-tent state, room eviction invariants,
INFINITE BURY, sweepDeadFires eating tents, storm camp rules, bulldoze camp
integrity, the bridge system, camp↔fire interplay (stale-fire camp lie,
hearth-fire camp, struck-message fire lie, shredded-camp softlock, struck
sweep wrecking the other tent, dead setUpDay field), cookFood stale-fire
gate, pitchTent cost engine honesty, tent persistence on travel, destroyCell
camp kill, one-camp-at-a-time. This pass attacked what they left alone: the
interior tent-fire cooking path, the multi-tent camp over-break class
(wreckTent/destroyCell vs round 7's scorchCells rule), and node travel with
a live tent room.

## CATCH 1 — COOK-IN-TENT FIRE LIE (honesty + wasted cost) — BROKE, FIXED
**Attack:** `cookInTent()` (game.js) checks `tentFireLit()`, promises "Small
fire, slow cooking", charges 24 ticks — then calls the food.js-wrapped
`cookAll()`, whose gate was `nearFire()` — grid cells ONLY. Beside a lit fire
pan with no grid fire, the player got "Need a fire to cook." and lost the 24
ticks. The tent-room Cook button renders exactly in that state (`fireLit &&
rawCount` in app.js) — UI-reachable, not engine-only.
**Fix (food.js):** the cookAll gate counts the tent fire, same pattern as
boilWater (`this.nearFire() || this.tentFireLit()`). Sibling of round-7's C7
(cookFood stale-fire gate) — same bug class, neighboring path. Proof C1a/C1b
red→green; C1c control (cold pan still refuses "Need the tent fire lit")
green throughout.

## CATCH 2 — WRECKTENT OVER-BREAK (honesty) — BROKE, FIXED
**Attack:** `wreckTent` broke the camp whenever the wrecked tent sat on the
camp tile — even with another INTACT yours-tent standing. Pitch two tents,
make camp, a monster tears down the one you're in: BEFORE also broke the
camp and breakCamp's tent sweep silently wrecked the OTHER tent (no item,
no tent back, copy says "a monster tore it down" — it tore down ONE).
Round 7's scorchCells fix established the rule (a surviving intact tent
keeps the camp); wreckTent never got it.
**Fix:** new shared helper `Game.campTentStanding(tx, ty)` — an intact
yours non-shredded tent on the tile. wreckTent breaks the camp only when it
returns false. Proof C2a–C2c red→green; C2d/C2e controls (wrecking the ONLY
tent still kills the camp, honest copy) green throughout.

## CATCH 3 — DESTROYCELL OVER-BREAK (honesty) — BROKE, FIXED
**Attack:** same class — `destroyCell` smashed one camp tent and breakCamp's
sweep wrecked the other standing tent. Bulldoze one of two pitched tents:
BEFORE lost the camp AND both tents.
**Fix:** same `campTentStanding` guard (cell already cleared when checked, so
the smashed cell can't self-match). Proof C3a/C3b red→green; C3c–C3e controls
(smashed last tent → camp breaks, "flattened" copy) green throughout.

## CATCH 4 — TRAVEL PHANTOM TENT ROOM (softlock-adjacent) — BROKE, FIXED
**Attack:** `travelTo` never cleared `insideTent`. The tent-room screen keys
off insideTent alone, and validateInsideTent keeps it (the old tent still
stands, still yours) — so a direct travelTo while inside rendered the old
tent's room on the new tile, with tentFire()/sleepQuality() reading the old
tile. Unreachable from the honest UI (the tent room has no travel button) —
engine armor for direct calls and debug scenarios, same class as round 6's
stale-card guards.
**Fix:** travelTo clears insideTent (+tentSmoke) — you walk out of the tent
to travel. Proof C4b red→green.

## Held (attacked, resisted / verified)
- **DEAD CODE sweep (D):** all 38 camp/structure helpers (pitchTent … smashBridge,
  buryCache … dailyCacheCheck, atCamp) defined AND called — now including
  app.js in the text scan, since the honest-UI callers live there. No dead
  camp helper. The new campTentStanding is called from all three wreck paths.
- **feedTentFire's burn0 cap:** max tent-fire life is 2× the initial burn no
  matter the fuel — small capacity, honest label; each feed costs real fuel.
- **Traps have no destruction path** (storm/bulldoze/scorch don't touch
  t.traps): judged NOT a law violation — a snare is tackle, not a structure;
  uses exhaustion is its end. Noted, not changed.
- **Camp + death:** ledger.js playerDeath ends the camp (camps-3) — re-verified
  intact; the pitched tent stands for the successor.
- **Cache robbery while camped on the node:** dailyCacheCheck rolls even with
  the player present; discovery is at the hole (Steve 2026-10-06 design).
  Harsh but canon; not changed.
- **campHealerName's roster-wide check:** named for the camp, reads the whole
  village roster — but all call sites are village-context (villageSicknessTick,
  villager departure healing, villagerTickTeachTick which haven-gates first).
  Loose naming, honest behavior; belongs to the disease/social area anyway.
- **makeCharcoal's nearFire gate:** tent fire pan does NOT count — deliberate:
  charcoal comes from an ash bed, and a fire pan isn't one. boilWater counts
  the tent fire (fixed earlier); charcoal left as-is.

## Sibling sweep (same bug class, related paths)
- Round-7 C4's "surviving intact tent keeps the camp" rule now lives in ONE
  helper (`campTentStanding`) used by all three wreck paths — scorchCells'
  inline scan was refactored onto it (no behavior change, verified by the
  round-7 suite staying 71/71).
- Round-7 C7's fire-gate class swept into the cookAll wrapper (C1) — the
  last nearFire-gated cooking/boiling path that ignored the interior fire.

## For Steve's overrule
Nothing this round needs design adjudication — all four fixes align engine
with existing copy/rules. The travel-insideTent clear is engine armor only;
if any debug scenario relied on traveling while inside a tent, say the word.
