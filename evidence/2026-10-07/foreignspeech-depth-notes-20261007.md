# foreignSpeech depth pass — 2026-10-07

## What was thin
`src/data/foreignSpeech.json` (25 languages × 11 categories) had two tiers:
- 8 languages (arabic, french, hindi, italian, mandarin, portuguese, russian, spanish):
  agree 3, warm 3; need_danger/need_food/questions already 4; fewWords 7.
- 17 languages (german, japanese, korean, vietnamese, tagalog, haitian_creole, thai,
  turkish, polish, ukrainian, bengali, amharic, indonesian, norwegian, yoruba, twi, swahili):
  agree 2, warm 2, need_danger 2, need_food 2, questions 2, fewWords 3.

## What was added (all appended to END of each category array; existing entries untouched)
- 17 small languages: +2 entries each in agree, warm, need_danger, need_food, questions
  and +2 fewWords (3→5). Per language 12 new entries; 204 total.
- 8 big languages: +1 agree and +1 warm each (3→4). 16 total.
- Grand total: 220 new entries (118 insertions). File went from 828 → 1048 entries.
- Key order per language block preserved (big 8 use en/kw/t, small 17 use t/en/kw);
  raw unicode kept, no escaped sequences; kw glosses map real words from the t string.

## Personality notes
Kept the existing voice: survival-gritty, warm, a little raw (fewWords kept the
swear/plain split per tier — big-8 fewWords already had the "Fuck you." energy and
needed no additions; small-tier got plain fragments like "Thank you?", "Help!", "No?").
Idiom-flavored lines per language where possible, e.g. german "So ist es. Genau so.",
tagalog "Sakto. Gano'n nga.", ukrainian "Саме так. В точку.", italian
"Proprio così, parola mia." Need lines follow the established dying-of-hunger /
one-bite escalation; danger lines are the "don't go there, something lives there /
RUN don't stop" pair; questions ask where people sleep / whether it's safe /
whether you're the boss.

## Languages that were hard to write idiomatically
- **Twi**: verb-aspect subtleties ("I will never forget" — avoided the non-standard
  "Merenfi" construction, used "Mɛnwerɛ mfi saa adom yi da."; "Ɛkɔm bɛkum me" for
  hunger-will-kill-me). Kept lines short to stay inside confident vocabulary.
- **Amharic**: gender-neutral phrasing is awkward, so I matched the file's existing
  masculine default (e.g. እባክህ already in the file) — "አዎን፣ ትክክል ነህ።".
- **Yoruba**: tone marks hand-checked against standard orthography
  (e.g. "Gẹ́gẹ́ bí o ṣe sọ", "N kò ní gbàgbé oore yìí").
- **Turkish/Polish/Ukrainian**: first draft was ASCII transliteration — rewrote all
  to proper orthography (haklısın, rację, правий) before splicing.

## Verification
- Proof test `scripts/test-foreignspeech-depth-20261007.js` (plain node, no jest):
  all 25 languages have all 11 categories; agree/warm/need_danger/need_food/questions ≥4,
  fewWords ≥5; t/en non-empty, kw objects with glosses, t≠en; no duplicate t per
  category; NEW entries get strict kw-key-appears-in-t checks (11 pre-existing kw
  quirks grandfathered, e.g. japanese kw "行く" vs t "行かなきゃ", french "aide-moi"
  vs "Aidez-moi" — original-data quirks, left alone); script-presence spot checks for
  arabic/hindi/mandarin/thai/amharic/bengali; every pre-existing entry deep-equals
  `git show HEAD:` version (additions-only proof). ALL GREEN.
- Splice method: text-level insertion before each target array's closing `]` with a
  JSON-string-aware bracket scanner; post-write assertion that all pre-existing
  entries are deep-identical. `git diff` shows insertions only (4 trailing-comma
  alignment artifacts are cosmetic diff pairing, no content removed).
