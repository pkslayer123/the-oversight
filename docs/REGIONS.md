# Regions Scaffold

**Steve 2026-10-07.** The game takes place in America. The default landing is
Middle America (Missouri/Indiana/southern Illinois feel), but the world
supports 8 distinct regions — each a different survival experience.

A **region** works two ways:

## As an origin (where you're FROM)

Your origin's region determines what you already know:

- **knownAnimals**: species IDs you recognize on sight (via `encAnimalKnown`
  tag overlap — the animal's `regions` field must include your region ID).
- **knownPlants**: `{plantId: level}` seeded into your codex at game start
  (via `regionKnownPlants()`). Level 2 means you know the edible parts,
  not just the name.
- **familiarTiles / alienTiles**: which tile types feel like home vs strange.
  (Hook for future familiarity/morale systems.)
- **culture**: flavor text — food traditions, attitudes toward nature.

**How it connects**: `characterGen.json` originKeywords entries carry region
ID tags (e.g. `columbus: [..., 'middle_america']`). `regionsForOrigin(tags)`
finds matching regions; `regionKnownPlants()` / `regionKnownAnimals()`
merge across matches (highest level wins).

## As a haven location (where the GAME takes place)

Your haven's region shapes the world:

- **gen**: map generation params (creeks, wetlands, groveBlobs, etc.) merged
  into `locParams()` — region provides the base, the landing zone overrides.
  `state.region` defaults to `'middle_america'` (current behavior unchanged).
- **animalAdd / animalRemove / animalDensity**: remix the animal pool.
  (Scaffold: data defined; spawn-time filtering via `initTileWildlife` is
  the integration point.)
- **challenge**: the region's signature threat (water scarcity, contamination,
  wildfire, harsh winter...) with `mechanics` tags for future systems.
- **monsters**: 2 scaffold concepts per region (`scaffold: true`). Each has
  a name, concept description, wave, and behavior hook — enough for the
  flesh-out loop to build a full Highbeam Deer-level monster.
- **strategy**: what playstyle this region rewards. The "different strategy"
  emerges from the biome/challenge/monster mix, not from hardcoded rules.
- **seasons / weather / hazards**: regional flavor for future systems.

## The 8 regions

| ID | Flavor | Signature challenge | Strategy |
|----|--------|-------------------|----------|
| `middle_america` | MO/IN/s.IL | The Long Winter (balanced) | Generalist; stockpile |
| `southwest_desert` | AZ/NM | The Thirst (water scarcity) | Cache water; night travel |
| `pacific_northwest` | OR/WA | The Green Water (contamination) | Purify everything |
| `deep_south_bayou` | LA bayou | The Black Water (disease) | Stay dry; boil everything |
| `great_plains` | KS/NE | The Fire Season (wildfire) | Firebreaks; mobility |
| `appalachian` | WV/KY hollers | The Hollers (terrain) | Elevation; know the ground |
| `northeast` | VT/ME | The Deep Cold (harsh winter) | Prepare from day one |
| `florida` | FL peninsula | Rot and Storm (heat/hurricane) | Stay high; preserve food |

## How to flesh out a region (for future workers)

Pick a region and fill in what's thin:

1. **Animals**: check `asHaven.animalAdd` — are those animals in
   `animals.json` with full entries (knowledgeLevels 1-4, behavior, etc.)?
   Add missing ones. Check `animalRemove` — is the base pool correctly
   filtered at spawn time?
2. **Plants**: check `asOrigin.knownPlants` — do those plants exist in
   `plants.json`? Add region-signature plants.
3. **Monsters**: each `scaffold: true` concept needs a full `monsters.json`
   entry to Highbeam Deer level (telegraph, phases, audio, codex stages).
   When done, move it out of `regions.json` into `monsters.json` and
   reference the ID.
4. **Challenge mechanics**: the `challenge.mechanics` tags (e.g.
   `water_scarcity`, `wildfire`) are hooks. Implement the systems they name.
5. **New regions**: copy a region block, change the ID, fill in all fields,
   add your origin keys to `characterGen.json` tags. The helpers handle
   the rest.

## How to add a 9th region

1. Add a block to `src/data/regions.json` with all fields (copy
   `middle_america` as a template).
2. Add the region ID to the relevant `originKeywords` tags in
   `src/data/characterGen.json`.
3. Add any new animals/plants to their JSON files (append-only).
4. Add 2 monster concepts to the region's `monsters` array.
5. Run `scripts/test-regions-20261007.js` to verify.

## Design notes

- **Not state-specific**: regions are flavored ("Arizona / New Mexico feel")
  but not locked to states. Border origins map to multiple regions
  (e.g. `kentucky` → `middle_america` + `appalachian`).
- **Tile types are reused**: the 8 existing tile types (forest_floor, grove,
  meadow, thicket, wetland, creek, trail_edge, ruin) are reinterpreted per
  region via gen weights. True new tile types (sand, scrub) are a future
  expansion — the `tileWeights` hook is the extension point.
- **Knowledge is regional**: `encAnimalKnown` checks origin-tag overlap with
  animal `regions`. An animal with `regions: ['southwest_desert']` is known
  to Tucson natives, unknown to everyone else until they encounter it 3x.
