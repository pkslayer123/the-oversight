# nameCultures / originPicker depth — 2026-10-07

Worker assignment: expand thin name pools to ≥150 first AND ≥150 last in
`src/data/nameCultures.json`, extend `originToCulture` coverage against
`background_survivors.json` origins, expand thin `originPicker.json` regions.
Append-only on existing pools; existing entries byte-identical (only trailing
commas added where arrays grew). Both files are raw UTF-8 (no `\u` escapes) —
new content matches that style.

## Pool expansions (before → after)

Assigned bottom-10:
- italian: first 100→150 (+50), last 52→150 (+98)
- venezuelan: first 105→150 (+45), last 98→150 (+52)
- ukrainian: first 120→150 (+30), last 97→150 (+53)
- newzealander: first 124→150 (+26), last 100→150 (+50)
- peruvian: first 120→150 (+30), last 106→150 (+44)
- norwegian: last 99→150 (+51) (first already 152)
- argentine: last 97→150 (+53) (first already 166)
- polish: last 101→150 (+49) (first already 161)
- colombian: last 115→150 (+35) (first already 164)
- ghanaian: first 114→150 (+36) (last already 165)

Scope extension (found by the proof test, which asserts EVERY culture ≥150 —
these 5 were also sub-150 and weren't in the assignment's list):
- bangladeshi: last 125→150 (+25)
- ethiopian: first 134→150 (+16), last 112→150 (+38)
- irish: first 144→150 (+6)
- moroccan: last 124→150 (+26)

All 29 cultures now ≥150/≥150. Total: 29 cultures, 92 originToCulture mappings.

## Style matching per culture
- italian: existing pools are 100% ASCII (no diacritics) → new names ASCII-only.
  First list mixes genders (50 male + 50 female pattern) → appended 25 male + 25 female.
- ukrainian: ASCII transliteration style (no diacritics) → matched; mixed modern +
  archaic folk names (Marfa, Motrya / Panas, Khoma) → new batch same mix.
- ghanaian: ASCII; day names + Ewe + Ga + northern/Muslim names → new batch same mix.
- venezuelan/peruvian/argentine/colombian: diacritics on surnames and some
  first names (González, Sebastián, Fernández) → new names carry proper accents;
  venezuelan firsts include modern/trendy names (Deiker, Yorman, Katiuska) →
  new batch includes same register (Greivis, Yulibeth, Mileidys).
- peruvian: Spanish + Italian-immigrant + Quechua names → new batch adds all three
  (Alonso, Matías / Atuq, Sayri / Abril, Isabella / Asiri, Sumaq; lasts incl.
  Peruvian "Gonzales" spelling variant).
- norwegian: ø/æ/å diacritics, -sen/-son heavy + farm names (Bakken, Haugen) →
  new batch same (Abrahamsen, Bakkebø, Bjørklund, Grøndahl…).
- polish: heavy diacritics (Ł, ś, ć, ź, ż, ń, ą, ę, ó) → new batch same.
- newzealander: Māori (macrons: Māui, Pōtiki) + English + Pacific → new batch same;
  added Samoan/Tongan surnames (Tuala, Sopoaga, Fifita, Moala) reflecting NZ.
- bangladeshi: Muslim + Hindu Bengali surnames, ASCII → matched.
- ethiopian: Amhara/Tigray/Oromo names, ASCII → matched.
- irish: fada-less style (Saoirse, Niamh) → new names fada-less (Breasal, Ailbhe).
- moroccan: Ben-/El-/Ait- heavy, ASCII → matched.

## originToCulture additions (37 → 92)

Best-fit EXISTING culture keys only; no new culture keys invented:
- japanese: Kyoto, Japan; Hokkaido, Japan
- mexican: Veracruz, Mexico
- american: Denver/Nashville/Ames/San Diego/Anchorage/Santa Fe (US cities had NO
  fallback — cultureForOrigin's country-substring fallback can't match "New York"
  against "Denver, Colorado", so these returned null before); Toronto, Canada;
  Kingston, Jamaica; rural England; Manchester, England
- irish: Dublin, Ireland (fallback couldn't match: only key was "rural Ireland")
- norwegian: Stockholm (Sweden), Bergen/Trondheim (Norway), Aarhus (Denmark),
  Reykjavík (Iceland)
- ukrainian: Odesa/Lviv (Ukraine), Vladivostok/Novosibirsk (Russia),
  Belgrade (Serbia)
- polish: Kraków (Poland), Prague (Czech Republic)
- german: Amsterdam (Netherlands), Vienna (Austria), Brussels (Belgium)
- argentine: Seville (Spain), Valparaíso (Chile), Montevideo (Uruguay)
- brazilian: Lisbon (Portugal), Cuiabá (Brazil)
- colombian: Medellín (Colombia)
- indian: Ahmedabad/Amritsar/Kochi/Hyderabad (India), Kathmandu (Nepal),
  Karachi/Lahore (Pakistan)
- ghanaian: Dakar (Senegal), Kumasi (Ghana)
- nigerian: Enugu (Nigeria); kenyan: Nakuru (Kenya), Dar es Salaam (Tanzania);
  moroccan: Beirut (Lebanon), Casablanca (Morocco)
- newzealander: Sydney/Melbourne (Australia), Wellington/rural New Zealand
- peruvian: Quito (Ecuador), La Paz (Bolivia)

Deliberately left unmapped (documented in proof test as DOCUMENTED_UNMAPPED):
no plausible existing pool, and a wrong-culture mapping would be worse fiction.
Consumer (`Game.cultureForOrigin`, game.js:295) returns null for these and
`genNameForOrigin` falls back to the characterGen.json legacy flat first/last
name lists — names still generate, just not culture-matched:
Shanghai/Beijing/Chengdu (China — no chinese pool), Lyon/Marseille (France —
no french pool), Budapest (Hungary), Cape Town (South Africa), Helsinki
(Finland), Athens (Greece), Ulaanbaatar (Mongolia), Tbilisi (Georgia).

## originPicker additions
- South America 5→8: Quito (Ecuador 🇪🇨), Montevideo (Uruguay 🇺🇾), La Paz (Bolivia 🇧🇴)
- Africa 6→10: Dakar (Senegal 🇸🇳), Casablanca (Morocco 🇲🇦), Kumasi (Ghana 🇬🇭),
  Dar es Salaam (Tanzania 🇹🇿)
- Oceania 1→5: Sydney (Australia 🇦🇺), Melbourne (Australia 🇦🇺),
  Wellington (New Zealand 🇳🇿), rural New Zealand (🇳🇿)
All new labels added to originToCulture (see above). File is minified
single-line; additions were spliced textually in identical
`{"flag":"..","label":".."}` format. Labels stay parseable: `parseOrigin`
(game.js:221) does case-insensitive keyword substring matching; new labels
just yield no/fewer region tags (fine).

## The `language` tags — what they actually are
The task brief described "`language` list of single-letter tags". Grepped the
consumer before touching: **that premise was wrong**. `culture.language` is a
plain STRING id (e.g. "italian", "twi", "amharic", "english"), not a list.
Consumers: game.js:471 uses it as the person's native language id
(`levels.native = ...language || 'english'`), game.js:494/514/519 use it for
heritage-language lookups against characterGen.languages. Left untouched, as
the brief's default said.

## Proof test
`scripts/test-namecultures-depth-20261007.js` — seeded (mulberry32) node
script, ALL GREEN (902 checks, exit 0). Asserts: every culture ≥150/≥150; no
exact-string duplicates within any pool; every originToCulture value is a
valid culture key; every distinct background_survivors origin is mapped or on
the documented legacy-fallback list; every originPicker region ≥3 origins with
flag+label; every picker label mapped or documented; seeded 20-name spot
samples per expanded pool for sanity + ASCII-strictness (italian/ukrainian/
ghanaian) + diacritic-carry where the existing pool is >5% non-ASCII.
