# characterGen appearance clothing expansion + originKeywords audit — 2026-10-07 (Worker A)

## 1. Clothing pools (main task)

All 37 appearancePools in `src/data/characterGen.json` now have **>= 5 clothing entries**
(exactly 5 each). Before: 11 pools at 1, 25 at 2, 1 at 3 (default).

- Append-only: existing entries kept byte-identical and in front; verified by diff
  (37 deletions are all trailing-comma shifts on the old last entry; zero true deletions)
  and by proof test comparing `clothing.slice(0, oldLen)` against
  `git show HEAD:src/data/characterGen.json`.
- JSON style: file is raw UTF-8 (no \uXXXX escapes); written with
  `JSON.stringify(d,null,2)+"\n"` which round-trips byte-identical.
- Content register per pool: origin-plausible, person-specific garments —
  workwear (oilfield coveralls, milk-bar cook whites, rickshaw-puller vest),
  weather-worn (rain-darkened flat cap, travel-creased barong, dust-hemmed djellaba),
  scavenged (pre-Scattering uniform, surplus army coat, re-soled tramping boots),
  pre-Scattering remnants (salaryman suit rumpled, delivery-rider windbreaker,
  bus-driver cap), plus local markers (ankara print, galabeya, ruana, chullo,
  liquiliqui, netela shawl, aran sweater, lusekofte-style patterned sweater).
- Total new clothing strings: 114 (37 pools; 1-pools +4, 2-pools +3, default +2).
- Note "monsoon poncho, taped" appears in both Jakarta and Dhaka — deliberate
  (same garment plausible in two monsoon cities); no duplicates WITHIN any pool.

### Sprite-palette caveat (follow-up, NOT my file)
`src/js/sprites.js` maps clothing via `CLOTHING[v.clothing] || CLOTHING.casual` —
only palette keys `outdoor/casual/bright/workwear` produce distinct sprite colors;
all new descriptive strings render with the casual palette. Safe (no crash), but a
future worker touching sprites.js should extend CLOTHING with mappings for common
descriptive strings (e.g. hi-vis -> bright, oilskin -> outdoor) so the variety
becomes visible on the grid. Existing palette-key entries still hit their palettes.

## 2. originKeywords audit

Consumers checked: `parseOrigin` (game.js:221), `familiarityTier` (235, plant
`regions` — only `columbus, georgia, ohio, pacific_nw`), `heritageFor` (250,
heritageMap 16 tags), `bumpPlantFamiliarity` tag match (game.js:14042, plant
regions), animal common-region overlap (encounters.js:132, animal regions = only
`north_america`; also `north_america|united states|usa|america|canada` check),
lifeseed region word-set matching (lifeseed.js:70 — matchTag words must ALL appear
in the tag's word set).

Of 105 distinct tag values across 121 keys, **49 are LIVE, 56 are DEAD** (no engine
effect; they remain as human-readable categorization, harmless).

Live (49): alabama, alaska, arizona, boreal, california, canada, city, coast,
colorado, columbus, dakota, desert, florida, georgia, hawaii, idaho, illinois,
kansas, louisiana, maine, mediterranean, midwest, minnesota, mississippi, montana,
mountains, nebraska, new mexico, ohio, oklahoma, oregon, pacific_nw, pennsylvania,
plains, rural, savanna, suburb, southwest, texas, tropics, tropical, urban, utah,
vermont, virginia, washington, wetland, woodlands, arctic. (Most via lifeseed
word-matching; `pacific_nw` is plant-region-only — lifeseed matchTag is
"pacific northwest", which does NOT word-match `pacific_nw`.)

Dead (56): africa, argentina, asia, australia, brazil, carolina, china, colombia,
continental, egypt, england, europe, france, germany, ghana, highlands, india,
indonesia, iran, iraq, israel, italy, japan, kentucky, kenya, korea, mexico,
middle east, netherlands, nevada, new york, nigeria, north america, northeast,
oceania, palestine, peru, philippines, poland, russia, saudi arabia, south,
south africa, south america, southeast, spain, subtropics, sweden, temperate,
tennessee, thailand, turkey, ukraine, vietnam, west, wilderness.

### Changes made (exactly one)
- Key `"columbus"` (was `[ohio, midwest, city]`) gained tag `"columbus"`. It is
  already pinned to Columbus, Ohio by its own tags; plant region `columbus` is its
  home region, and lifeseed matchTags include `columbus`. Unambiguous alignment,
  zero behavior change for any other origin. (Also now covered by lifeseed.)

### Documented, NOT changed
- `idaho` carries `pacific_nw` (geographically iffy — interior mountain state) —
  but it is a LIVE tag and removing it would change engine behavior; that's
  retagging the world, Steve's call.
- `"north america"` tag (key `mexico city`) does NOT match the animal check's
  `'north_america'` (underscore vs space) in encounters.js:132 — a real miss for
  Mexico-City origins on animal common-region knowledge. Flagged for a future
  worker with access to encounters.js; not mine to fix.
- `sao paulo` and `são paulo` keys duplicate (both fine for substring matcher).
- Dead tags left in place: they may serve display/future consumers; removing them
  is a design decision, not cleanup.

## Proof
`scripts/test-charactergen-appearance-20261007.js` (node, pure data, no jest):
asserts every pool clothing.length >= 5, string type, no within-pool dupes;
old entries byte-identical vs `git show HEAD` (prefix deep-equal); no pools
added/removed; skinTones untouched; every originKeyword value a non-empty string
array; old tags all retained; parseOrigin spot-checks on Ohio / "columbus, ohio"
/ lagos / "rural vermont" / Tokyo (reimplemented matcher). **ALL GREEN — 472 checks.**
