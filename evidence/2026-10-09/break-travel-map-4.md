# Break-it: travel & map, round 4 (2026-10-09)

Hostile-player attack on the travel & map system, round 4. Rounds 1–3 closed
travel-spam, animal-continuity, stale-clamps, double-charge, barrier-exit lies,
pit-death, the bridge label, swim honesty, mid-walk desync, save/load of travel
state, mid-combat engine guards (travelTo/microMove/beginPathWalk/pathStep),
and the party.js betrayal-roll farm. This round went after the remaining
surface: fog-of-war render paths, teleport-caller audit, mid-crossing death,
cost-label honesty, blockage actions mid-combat, and dead code.

Verdict: **BROKE + FIXED — 7 real breaks** (3 fog-of-war leaks, 1
death-mid-crossing desync, 1 cost-label lie, 1 mid-combat free-work exploit,
1 dead function). Teleport audit, barrier-roll honesty, and mid-walk
interruptions held.

## BREAK 1 — FOG: codex MAPS named ground nobody shared (FIXED)

**Attack:** the codex MAPS section (`villageMapSection`, app.js) unioned every
villager's seeded `visitedTiles` directly into the rendered grid — with the
real tile type name in each cell's `title`. `compareMaps` is the designed
gate ("maps_are_social: ground knowledge spreads by comparing maps in
conversation"), but MAPS bypassed it entirely.

**Measured (pre-fix, seeded):** fresh game: `seenTiles` = 1 tile, the old
union = 25 tiles — **24 named tiles** the player never earned, shown on sight.

**Fix:**
- `game.js` `compareMaps` now records the sharing: `scholar.mapsSharedBy[vid] = true`.
- New `game.js` `villageMapKnown()` — your seen tiles plus visited tiles of
  villagers who actually shared (compareMaps) or whose reports arrived via
  earned channels (scout `markSeen 'shared'`, already in seenTiles).
  Unshared seed tiles are life experience, not village knowledge.
- `villageMapSection` renders `villageMapKnown()`.
- Sibling sweep: no other ungated `visitedTiles` consumers in src.

**Proof:** `scripts/test-travel-fog4.js` T1 — BEFORE: 24 leaked tiles;
AFTER: 0 leaked, own tiles shown, `compareMaps` opens the gate
(`mapsSharedBy` recorded). ×3 seeds.

## BREAK 2 — FOG: 'shared' tiles rendered full scene detail (FIXED)

**Attack:** `renderMap`'s first block treated ANY `seenTiles` entry as
fully-seen and rendered full TileScenes/emoji detail. Steve 2026-10-07's rule
— "'shared' tiles show as BIOME COLOR ONLY, not detailed SVG" — was
implemented in the fall-through block, which became unreachable for shared
tiles. A scout's report rendered full terrain detail.

**Measured (pre-fix):** real render of `renderMap()` (extracted from app.js,
DOM-free stubs): a `shared` creek tile rendered the full-detail 💧 marker.

**Fix (`app.js`):** the first block's `_seenSimple` now requires
`entry.k === 'v'`; `'shared'` falls through to the biome-color-only branch.

**Proof:** T2 — BEFORE: shared tile renders detail; AFTER: shared renders
the `opacity:0.7` biome div with no detail markers, visited tiles still
render full detail. ×3 seeds.

## BREAK 3 — FOG: depletion styling leaked through fog (FIXED)

**Attack:** `depletionClass` gated on `t.revealed` (the TRAVEL flag), not
`seenTiles` (the FOG flag). A fogged tile revealed for travel rendered
visibly picked-clean/barren (`.tile.depleted-picked` dims+grays the fog tile)
— resource state you never earned.

**Measured (pre-fix):** fogged + revealed + `stock/maxStock = 0.1` →
`'depleted-barren'`.

**Fix (`game.js`):** `depletionClass(t, x, y)` now gates on `mapSeen(x, y)`
when coords are given (the app.js caller passes them); the coord-less form
keeps the old contract for non-render callers.

**Proof:** T3 — BEFORE: fogged tile reports `depleted-barren`; AFTER: `''`
when fogged, `'depleted-barren'` once visited. ×3 seeds.

## BREAK 4 — SOFTLOCK/HONESTY: death to your own pit mid-barrier-crossing (FIXED)

**Attack:** `tbBarrierExit` → `travelTo(..., combatExit=true)` can kill you
on arrival (your own pit trap, 50%). The old code kept going with a corpse:
- barrier roll succeeds → `tbEnd('fled')` for a dead body: flee-reputation
  for a corpse, "You escape / They lose your trail" in the log next to the
  death;
- barrier roll fails → the fight CONTINUES with the dead body, and the later
  `tbEnd` overwrites the NEW bearer's full health with the old fighter's HP.

**Measured (pre-fix, seeded):** T4a: `died=true`, flee lie said, fight
ended as fled. T4b: `died=true`, `inCombat()=true` — a live fight for a
corpse.

**Fix (`game.js` `tbBarrierExit`):** snapshot `villagerId` before the
crossing; if `over` OR the bearer changed (mantle passed — `playerDeath`
doesn't set `over` when a successor exists), dissolve the fight silently
(`tbfight.over`, result `'dissolved'`, null) and return. The death narration
already fired; monsters melt back like any victor-less fight end. No
`tbEnd('lost')` — its `s.health = p.hp` line would clobber the new bearer.

**Proof:** T4a/T4b — AFTER: mantle passed, `tbfight === null`, no
barrier/flee/continue narration, new Bearer <redacted> full health. ×3 seeds. (One
test-harness note: seed 999's generated bearer has `second_wind` — the pit
"kill" correctly triggered the save instead; the test strips cheat-death
abilities so the death is deterministic.)

## BREAK 5 — HONESTY: "Walk here (N kcal)" lied to Wanderer/Second Skin (FIXED)

**Attack:** the button quoted `path.length * 10` but `beginPathWalk`
charged the `travel.cost_mult`-discounted price. A label is a promise.

**Measured (pre-fix):** 3-square walk with Wanderer (-10%): label 30 kcal,
charged 27.

**Fix:** new `game.js` `walkCost(n)` — the single formula, quoted by the
button AND charged by `beginPathWalk`. Ontology header updated.

**Proof:** T5 — BEFORE: label 30 ≠ charged 27; AFTER: `walkCost(3) ===
charged` with and without the modifier. ×3 seeds.

## BREAK 6 — EXPLOIT: blockage card worked mid-fight (FIXED)

**Attack:** the blockage card (cut/clear/bridge/swim) can sit open when a
fight starts. `clearBlockage`/`buildBridge` spent kcal and removed the
blockage with NO time cost (`tickAction` no-ops in combat); swim charged
20 kcal and then `travelTo` refused the crossing — charge, then refuse.

**Measured (pre-fix):** mid-fight `clearBlockage` on a fallen tree: blockage
gone, 60 kcal spent, no time cost.

**Fix:** engine guards — `clearBlockage`/`buildBridge` refuse mid-combat
with "Not mid-fight — the barrier is the way out." (round-3's engine-guard
precedent); the card's `onclick` guards all four actions before any charge.
Sibling of round-3's travelTo/microMove/beginPathWalk/pathStep guard class.

**Proof:** T7 — AFTER: refused, blockage intact, 0 kcal spent, honest line
said; `buildBridge` same. ×3 seeds.

## BREAK 7 — DEAD CODE: Game.movePath (REMOVED)

`movePath` (10 kcal/square instant walk) had zero callers — superseded by
`beginPathWalk`/`pathStep`. Only its own definition and a comment mentioned
it. Removed; the `beginPathWalk` comment reference rewritten. Not in the
ontology header, so no header deletion needed.

**Proof:** T6 — BEFORE: exists, no callers; AFTER: `undefined`, no
references. ×3 seeds.

## HELD (attacked, resisted)

- **Teleport audit:** every `map.px/py` write accounted for — `travelTo`,
  `tryNodeExit`→`travelTo`, `tbBarrierExit`→`travelTo(combatExit)`,
  `returnToVillage` PIN, exile haven founding (betrayal.js — pins to the
  CLAIM site, retags old haven so no free teleport back), day-7 System
  arrival (scripted), `phoenix_clause` (explicit once-per-run), death mantle
  (pins to Haven), debug buttons/scenarios. Contests and alien players never
  move the player across nodes (contests are modal phase sequences where you
  stand; the "grab" is diegetic). No free warps.
- **Barrier 50% roll honesty:** `Math.random() < 0.5` — a real coin flip.
  Failure branch resumes the fight exactly: chasers repositioned near the
  entry edge, non-chasers marked fled, player placed at the opposite edge,
  `scholar.mx/my` synced, `moveLeft = 0` spent, `acted` untouched (you can
  still act on the new node). No stuck "already acted" state.
- **Mid-walk interruptions:** combat starting mid-`pathStep` → `pathStep`
  returns false, the animator purges the rest of the walk (round-3 verified
  the dpad-purge path); `tickAction` no-ops in combat so a step landing the
  same tick as a fight start can't double-advance the clock; save+load
  mid-`walkPathAnimated` just stops the walk (prepaid kcal sunk, position
  consistent — no dupe, no phantom steps). `checkEncounter` inside
  `travelTo` spawns world monsters only, never nests a combat.
- **Blockage card labels:** cut (60 kcal, +2 wood, "a while" = 32 ticks),
  rubble (40 kcal + stone), bridge (4 wood, 60 kcal) — every label matches
  the charge. The washed_out scramble (80 kcal) is reachable via the rim's
  "Clear the way" contextual action.
- **Tap-self "Head {dir}" popup:** fog-honest — unrevealed neighbors read
  "unexplored ground"; the "(blocked!)" flag names only that the adjacent
  edge is blocked (visible from the rim), not what's there.
- **World-map overlay:** view-only (no travel from the map), fog-honest per
  `seenTiles`; other villages' 🏘️ gated on seen (Steve 2026-10-06 rule
  intact).
- **Re-entering a barrier-exited node:** fled monsters melt to the wilds —
  no phantoms on return; failed-exit nodes are empty behind you.

## Files changed

- `src/js/game.js` — tbBarrierExit death-dissolve (+mantle watch);
  compareMaps `mapsSharedBy` record + new `villageMapKnown()`; new
  `walkCost(n)` + beginPathWalk uses it; removed dead `movePath`;
  clearBlockage/buildBridge mid-combat guards; `depletionClass(t, x, y)`
  fog gate; ontology header (walkCost, villageMapKnown, 4 new rules)
- `src/js/app.js` — renderMap `_seenSimple` visited-only; depCls via gated
  depletionClass; villageMapSection uses `villageMapKnown()`; "Walk here"
  label quotes `Game.walkCost`; showBlockage `onclick` mid-combat guard
- `scripts/test-travel-fog4.js` — new proof test (BEFORE=1 runs pre-fix
  HEAD game.js + app.js; SEED override; full module list per index.html
  order minus DOM-only; Math.random seeded before eval)

## Verification

- `node --check` on game.js, app.js: OK
- `scripts/validate-ontology.js`: 50/50 systems validated, release permitted
- New proof test: BEFORE 13/13 (breaks demonstrated), AFTER 32/32 —
  seeds 7, 999, 123456
- Regressions: round-3 travel proofs 13/13 (AFTER), round-2 pitdeath 4/4,
  doublecharge 2/2, barrierblock 7/7, test-movement.js 48/48
- (Round-3's BEFORE assertions no longer apply — HEAD already contains its
  fixes; its AFTER suite is the regression signal, green.)

## Design flags (not changed)

- Committed tap-to-walk costs 10 kcal/square vs 2 kcal/step manual dpad
  for the same ground (5×). The label is now honest about the charge, but
  the asymmetry itself is the food/economy loop's call — flagging, not
  fixing.
- `villageMapKnown()` currently equals seenTiles in practice (compareMaps
  merges into seenTiles); the `mapsSharedBy` gate preserves the "village
  cumulative" concept for future sharing channels (e.g. codex sync).
