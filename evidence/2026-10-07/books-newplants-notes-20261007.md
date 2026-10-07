# Books new-plants pass — 2026-10-07 (Worker B)

Closed the real gap left by the plants depth pass: 12 new `plants.json` ids had zero
book coverage, breaking the knowledge loop (learn → recognize → forage deliberately
→ haul home → identify → learn more). `rare_herb` stays intentionally uncovered
(mystery discovery pool) — a regression guard for that is in the test.

## New books (5), appended to `src/data/books.json` (28 → 33)

| id | name | unlocks | voice |
|---|---|---|---|
| peddlers_sample_tin | The Peddler's Sample Tin | spicebush, american_hazelnut (L2) | traveling salesman's sample tin, looping script, half the packets empty |
| nanas_tuber_cards | Nana's Tuber Cards | sunchoke, groundnut (L2) | grandmother's rusted recipe-card tin, shaky pencil, all cards about roots |
| crayon_herbarium | The Crayon Herbarium | stinging_nettle, greenbrier (L2) | kid's sketchbook, green crayon tangles, one plant circled in red |
| june_notebook | The June Notebook | maypop, wild_cherry, serviceberry (L2) | forager's pocket notebook, June dates, cover stained dark purple |
| wardens_notebook | The Warden's Notebook | pokeweed, american_ginseng, wild_ginger (L3) | warden's field notebook, three pages flagged with red tape, rest blank |

## Level choices (convention of the existing 28)

- L2 for the ten ordinary food plants — matches each plant's `uses[].minLevel: 2`
  (parts knowledge), the same grant as nut_gatherers_handbook / thicket_field_guide.
- L3 for the warden's trio, following the late_summer_herbarium → mayapple precedent
  (mayapple's food use is minLevel 2 but the book grants L3): plants with a "don't"
  attached get the deeper grant. pokeweed (deadly if misprocessed), american_ginseng
  (medicine use minLevel 3, protected), wild_ginger (L3 text is the "do not ingest"
  knowledge — the highest honest level for it).

## Knowledge honesty

`readBook` shows `name` + `description` at find time (`You find a book: "...". ...`),
so both are find-visible cover copy. All 5 books' name/description/flavor were
written evocative-only (artifact + finder's voice, e.g. "Card 12: If the ground is
still hard, wait. The waiting is the hard part.") — no edibility claims, taste
words, calorie hints, or preparation instructions. File kept pure-ASCII with
`\uXXXX` escaping, matching the existing style; append-only via text surgery
(the 28 old entries are untouched down to the byte).

## Coverage before → after

- Before: 25/38 plant ids covered; 12 new ids at zero.
- After: 37/38 covered; only `rare_herb` uncovered (intentional).

## Test

`scripts/test-books-newplants-20261007.js` (plain node, deterministic, no jest):
all 38 ids except rare_herb in ≥1 book; every unlocked id resolves; required keys
on all 33; extended leak-wordlist scan (edible/inedible, delicious, tasty, yummy,
nutritious, calories/kcal, "good to eat", taste verbs, the full prior cooking/
poison/trap wordlist) on the 5 new books' name+description+flavor; old 28 deep-equal
vs `git show HEAD:src/data/books.json` plus byte-prefix append check; rare_herb
regression guard.

Result: **449 passed, 0 failed**.

## Commit

Private-index commit only (shared index untouched — still carrying the stale fossil):
`9fdc3b4f0840963da9cf42732a075fc512e2673d` — "books: cover the 12 new plants with
knowledge-honest books (Steve 2026-10-07)". books.json only, 67 insertions,
0 deletions. NOT pushed (loop handles push + version bump).
