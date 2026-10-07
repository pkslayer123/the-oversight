# lifeseeds.json kin + regions expansion — 2026-10-07 (Steve 2026-10-07)

Second pass on `src/data/lifeseeds.json` (first pass: events/wants/wounds/places/
skillOrigins in lifeseeds-expansion-notes-20261007.md). Append-only except 4
surgical dupe-fate rephrases. Voice: terse, weathered, pre-scattering.

## Counts before → after

| pool | before | after |
|---|---|---|
| kin relations | 18 | 28 (+10: older brother, younger sister, cousin, niece, nephew, ex, rival, coworker, teacher, coach) |
| kin fates | 54 | 84 (3 per relation, zero exact duplicates) |
| regions | 14 | 18 (+4: great_lakes, gulf_coast, texas_hill_country, great_basin) |

## Dupe-fate fixes (4 pre-existing exact duplicates, one side rephrased)

- father: "hasn't been heard from since the sky changed" → "his chair's been empty since the sky changed" (mother keeps original)
- sister: "was visiting the coast when the sky changed" → "had just moved to the city when the sky changed" (older sister keeps original)
- brother: "sent one text: 'call when you can'" → "left one voicemail, half static" (younger brother keeps original)
- brother: "is somewhere west, last anyone knew" → "was headed west when the sky changed, last anyone knew" (younger brother keeps original)

## Region tag semantics (why no overlap)

The region matcher (lifeseed.js) is word-set based and array-ordered, so new
matchTags deliberately avoid territory already claimed:

- great_lakes: lake/sub-region tags only ("great lakes", "lake superior",
  "lake erie", "upper peninsula", "marquette", "green bay", "door county").
  midwest already claims "michigan"/"wisconsin"/"minnesota"/"cleveland"/"detroit",
  so those words are avoided. Towns exclude Duluth (a midwest town).
- gulf_coast: sub-regional tags ("bayou", "cajun", "biloxi", "gulfport",
  "lake charles", "houma"). florida claims "gulf coast" and deep_south claims
  "louisiana"/"mississippi"/"alabama"/"new orleans" — none of those strings
  are reused. Towns exclude Mobile (deep_south) and Pensacola (florida).
- texas_hill_country: city/sub-region tags ("hill country", "austin",
  "san antonio", "fredericksburg", "kerrville", "boerne"). "texas" itself is
  claimed by southwest and is deliberately NOT included.
- great_basin: "nevada" was unclaimed by any region; utah is claimed by
  mountain_west so no Utah towns. Towns are all Nevada (Reno, Elko,
  Winnemucca, Ely, Battle Mountain, Fallon).

New-region towns/workplaces share zero strings with any existing region's
towns/workplaces (asserted in proof test). far_away left untouched as the
engine's intentional fallback region (0 matchTags, 4 generic towns).

## Coherence notes

- Kin fates use only placeholders the engine fills for kin fates via fillBasic
  (lifeseed.js): {first} {town} {workplace} {place}. {street} and {kin} are
  never filled for kin fates and are not used.
- All new towns are real towns; fragments never cross regions.
- JSON style preserved: 2-space indent, no \u escapes, no trailing newline
  changes; all untouched entries byte-identical to HEAD (verified by proof test).

## Follow-up for a future loop run (NOT this island — engine file, off-limits)

lifeseed.js `lifeseedKinName` genders names via fem/masc relation lists. The new
gendered relations (older brother→masc, younger sister→fem, niece→fem,
nephew→masc) are not in those lists yet, so their generated names are
unconstrained. One-line addition each; ambiguous ones (cousin, ex, rival,
coworker, teacher, coach) match the existing unconstrained pattern
(spouse/friend/mentor/neighbor).

## Proof

`scripts/test-lifeseeds-kin-regions-20261007.js` — ALL GREEN (node, no jest).
Asserts: 18→28 kin / 14→18 regions vs HEAD; 3 fates per relation; zero exact
duplicate fates across 84 strings; placeholder whitelist; append-only (all
untouched kin entries + all 14 original regions byte-identical to HEAD; the 4
fixed relations changed exactly the intended fate strings); new regions have
id/label/land, ≥3 matchTags, 6 towns, 4 workplaces, unique ids, no internal
matchTag dupes; new towns/workplaces/matchTags share zero strings with HEAD
regions; no cosmetic churn.
