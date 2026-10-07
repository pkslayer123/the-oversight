# Background survivors pool expansion — depth notes (2026-10-07)

Worker A. Pool: `src/data/background_survivors.json` 75 → 97 entries (+22).

## What was added

22 new unique people, all with origins/cities not present in the existing 75
(the Scattering pulled people from everywhere; the old pool had no Iceland,
Argentina, Canada, Australia, Kenya, Peru, Egypt, Turkey, Indonesia,
Philippines, New Zealand, Finland, Serbia, Italy, Greece, Nepal, Mongolia,
Georgia, or Jamaica):

| Name | Occupation | Origin | Voice beat |
|---|---|---|---|
| Ines Duarte | florist | Lisbon, Portugal | grows inedible flowers; morale is a crop too |
| Thabo Maseko | taxi driver | Cape Town, South Africa | same route 11 years; now the route is wherever the village needs |
| Sigrun Eiriksdottir | night security guard | Reykjavík, Iceland | prefers night shift; the dark never small-talks |
| Mateo Alvarez | barber | Buenos Aires, Argentina | best haircuts in the village; hair's longer now so it matters |
| Somchai Prasert | bike messenger | Bangkok, Thailand | outruns anything on two wheels — or off them |
| Nadia Khoury | radio DJ | Toronto, Canada | morning show for nobody; the village takes requests |
| Ruby Callaghan | lifeguard | Sydney, Australia | counts heads at the river; hasn't lost one yet |
| Brian Otieno | zookeeper | Nairobi, Kenya | knows which animals bluff; says the monsters do too |
| Valeria Quispe | pottery instructor | Lima, Peru | every bowl a small argument with the old world |
| Omar Farouk | piano tuner | Cairo, Egypt | tunes by ear in a world with no pianos |
| Elif Demir | hotel housekeeper | Istanbul, Turkey | folds everything; calls it triage for chaos |
| Sari Wulandari | postal worker | Jakarta, Indonesia | walked her route through two floods |
| Miguel Santos | dockworker | Manila, Philippines | unloaded ships 20 years; still checks the horizon |
| Aroha Ngata | comic shop owner | Auckland, New Zealand | kids trade chores for the good chapters |
| Onni Korhonen | chimney sweep | Helsinki, Finland | climbs like he's 63 going on 40 |
| Jovan Milic | tattoo artist | Belgrade, Serbia | every mark a decision nobody rushes |
| Giulia Bianchi | crossing guard | Rome, Italy | stops traffic that isn't there; children cross safely anyway |
| Nikos Papadopoulos | aquarium keeper | Athens, Greece | river fish are easier and lie less than sharks |
| Tashi Sherpa | arborist | Kathmandu, Nepal | comes down with the fruit and the weather report |
| Naran Tumen | bus driver | Ulaanbaatar, Mongolia | shorter roads, stranger passengers |
| Nino Kapanadze | dry cleaner | Tbilisi, Georgia | defiance, dry-cleaned |
| Desmond Clarke | sign painter | Kingston, Jamaica | paints signs for places that had no names |

## Why each fits

- **Unique-person law**: distinct names/ids/occupations/origins; every `line` is a
  character beat, not a template. Proof test enforces pairwise line distinctness
  (trigram Jaccard ≤ 0.60 across ALL 97 lines).
- **Reality anchors**: kcalPerDay 1800–2600 by age/body (elder Giulia 69: 1800;
  bike messenger Somchai 28: 2500). providesPerDay ≤ kcalPerDay, ≥ 800, and
  occupation-plausible (dockworker 1700, comic shop owner 1250, night guard's
  night watch 1500).
- **Vocabulary**: only values already present in the file (sharing/temperament/
  curiosity/skinTone/clothing/gender). No new keys — game.js/app.js/membership.js
  consumers untouched.
- **Style**: appended via string surgery (inserted after the last entry's closing
  brace); `git diff` shows 419 insertions, 0 deletions; raw non-ASCII kept raw
  (Reykjavík, matching the file's existing raw Kraków); no `\u` escapes
  introduced.

## Pre-existing legacy anomalies (left byte-identical, per rules)

- Ruth Goldstein (71): kcalPerDay 1500; Ella Johnson (67): 1600 — below the new
  1800 floor, realistic for elderly survivors. Test asserts legacy envelope
  1500–2800 separately from the new block's strict 1800–2600.
- Rosa Mendez: providesPerDay 1800 > kcalPerDay 1700 (a line cook feeding a
  crowd). Test notes it; new block is strict ≤.

## Test result

`scripts/test-background-survivors-20261007.js` — plain node, seeded PRNG
(mulberry32, default seed 20261007, `SEED` env override): **ALL GREEN**
(19/19 checks, exit 0), also green under SEED=42. Checks: count 97 (95–100,
exactly +22); baseline 75 name-set SHA-256 matches HEAD and deep-equals HEAD;
all 97 entries have exactly the 13 keys; ids and names unique; new ids/names
absent from baseline; full vocabulary conformance; legacy kcal envelope;
new-block kcal 1800–2600; new-block provides ≤ kcal and ≥ 800; all lines
non-empty; max pairwise line trigram Jaccard 0.500 (a legacy pair) ≤ 0.60;
new-block ages 18–70 (19–69).
