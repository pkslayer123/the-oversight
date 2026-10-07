# Plants depth expansion — Worker A — 2026-10-07

Pool grew from 26 to 38 entries. All entries (old + new) now carry the full depth
schema: `knowledgeLevels` 1–4, `codex`, `lookalikeNote`, `preparation`,
`idDifficulty` 1–5, honest `description` (unknown-stage, no edibility leaks),
`unit`, `caloriesPerUnit`, `spoilageDays`, `tileAffinity`, `waterContent`,
`sources`, `regions`, `taxon`, `form`, `edibility`, `uses`.

## New plants (12)

### Forageable (10 — wired into se_woodlands forageTable, weights 2–4)
1. **Spicebush** (`spicebush`, Lindera benzoin) — wild allspice berries + twig tea. wt 3
2. **American Hazelnut** (`american_hazelnut`, Corylus americana) — small nuts, float-test note. wt 2
3. **Jerusalem Artichoke** (`sunchoke`, Helianthus tuberosus) — fall tubers, honest gas warning ("fartichoke"). wt 3
4. **Stinging Nettle** (`stinging_nettle`, Urtica dioica) — cook-only, the sting IS the ID. wt 2
5. **Greenbrier Shoots** (`greenbrier`, Smilax rotundifolia) — thorny-vine asparagus tips, spring. wt 3
6. **Pokeweed** (`pokeweed`, Phytolacca americana) — young shoots boiled 2x ONLY; CRITICAL toxic lookalike notes. wt 2
7. **Maypop** (`maypop`, Passiflora incarnata) — ripe wrinkled fruit only, calming leaf tea. wt 3
8. **Wild Black Cherry** (`wild_cherry`, Prunus serotina) — fruit safe, pits cyanogenic, spit rule. wt 3
9. **Serviceberry** (`serviceberry`, Amelanchier arborea) — June berries, blueberry-almond. wt 2
10. **Groundnut** (`groundnut`, Apios americana) — protein-rich creek-bank tubers, cook well. wt 2

### Codex-only (2 — learned via codex, deliberately NOT in forageTable)
11. **American Ginseng** (`american_ginseng`, Panax quinquefolius) — rare/protected; the knowledge is the harvest, "you don't forage this".
12. **Wild Ginger** (`wild_ginger`, Asarum canadense) — smells like ginger, nephrotoxic aristolochic acid; the game teaches what NOT to eat.

## Baseline repairs
5 pre-existing entries were missing schema keys the depth test requires:
- `blackberry`, `hickory_nut`, `chickweed`, `muscadine` → added `lookalikeNote`
- `rare_herb` (Ghost Pipe) → added `sources`

No existing forageTable weights were touched; no entries removed or renamed.

## Test results
`scripts/test-plants-depth-20261007.js` (plain node, no jest): **377 passed, 0 failed**.
Asserts: JSON parses; no `\u` escapes (raw UTF-8 style kept); no duplicate ids;
38 entries; all 26 baseline ids intact + 12 genuinely new ids; every entry has all
23 required keys; knowledgeLevels 1–4 non-empty and substantive; uses well-formed;
descriptions leak no edibility; idDifficulty in range; every forageTable id resolves;
10 new plants wired, ginseng/wild-ginger excluded; weights modest (2–4); existing
weights untouched; calorie sanity on greens and nuts.
