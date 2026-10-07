# Locations depth pass — 2026-10-07 (worker A)

## What was added
`src/data/locations.json`: 20 → 28 entries. City pool was the small pool (4 → 10), countryside 16 → 18.

New city starts (scavenger-country, all playable):
- `rail_yard` — Rail Yard. Split boxcars, spilled grain, creek under the trestle. lootMult 1.5 / stockMult 0.85, trailLines 3 (rail = long sightlines).
- `market_row` — Market Row. Burned stalls, feral restaurant herb beds, tinned ghosts. lootMult 1.6 / stockMult 0.85, startReveal 2 (sightlines down the street), ruinMaxDist 1.
- `hospital_grounds` — Hospital Grounds. Feral courtyard gardens, picked-over supply dock. lootMult 1.4 / stockMult 0.9, waterClean 5 (cistern), hazard: glass/sharps — no monster or threat leaks.
- `school_yard` — School Yard. Half-looted cafeteria stores, sports field gone to meadow. lootMult 1.3 / stockMult 0.9, meadowSize 6.
- `warehouse_row` — Warehouse Row. Pallet stacks, split shrink-wrap, tools that remain. lootMult 1.7 (matches existing junkyard_edge max) / stockMult 0.7, ruinMaxDist 1.
- `subway_cut` — Subway Cut. Open-air concrete trench, standing water, dark-fruiting mushrooms "if you know them" (knowledge-gated by fiction, no names). startReveal 0, wetlands 3.

New countryside starts:
- `alder_marsh` — Alder Marsh. Black water, cattail roots (real survival food), duck nests. creeks 2, wetlands 5, stockMult 1.15.
- `limestone_glade` — Limestone Glade. Spring box (waterClean 10), wild persimmon rim, no cover. startReveal 2, meadowSize 6.

## Key-balance rationale
- City identity preserved: lootMult 1.3–1.7 (existing range 1.4–1.7), stockMult 0.7–0.9 (existing 0.65–0.9), ruinMaxDist 1–2 (guaranteed ruin reachable week 1 per game.js scavenger-viability guarantee).
- Playability rule for every new start: a water path (creeks ≥ 1, or wetlands, or waterClean ≥ 5) AND a food path (lootMult ≥ 1.3 or stockMult ≥ 0.85). Checked in the proof test.
- gen keys strictly within the 11 consumed by `locParams()` (game.js:281-293) — no unknown-mechanic keys. startMod only `waterClean`, the single startMod key consumed anywhere in src/ (game.js:1511).
- Copy discipline: no distinctive monster name (24 checked, len ≥ 7) appears in any description/hazard/tagline across all 28 — "if you don't know, it doesn't show" holds. Hazards are real-world (tetanus-adjacent cuts, collapsing stacks, bad air in the cut), never threat leaks.
- File style preserved: single-line compact JSON, raw UTF-8 em-dashes, key order description/gen/hazard/id/name/spawnType/startMod/tagline, gen keys alphabetical — verified byte-identical round-trip for the original 20 before appending.

## Consumed-key derivation (grep evidence)
- `gen`: `locParams()` reads exactly creeks, wetlands, groveBlobs, groveSize, meadowSize, thickets, trailLines, ruinMaxDist, lootMult, stockMult, startReveal — identical to schemas.json's location.gen schema.
- `startMod`: only `waterClean` consumed (game.js:1511: `20 + ((loc.startMod && loc.startMod.waterClean) || 0)`).
- Selection: `newGame()` honors `locationId` via `locPool.find(l => l.id === locationId)`, else random over the whole pool. All 28 ids resolve.

## Test results
`scripts/test-locations-depth-20261007.js` (plain node, mulberry32, SEED override):
- ALL GREEN on seeds 20261007, 7, 42: 28 entries, city 10, countryside 18; schema shape, unique ids, gen/startMod allowlists, copy non-empty, 24-name leak check, selection-by-id for all 28 ids, random-path in-pool (50 draws), playability rule for the 8 new starts.
- Repo validator `scripts/validate-data.js`: 522 stderr errors, 0 mentioning locations (pre-existing errors only, none new).

## Commit
Private-index commit on the hot shared tree (no bare add/commit/reset touched the shared index). Hash reported to the loop coordinator. NOT pushed — coordinator pushes.
