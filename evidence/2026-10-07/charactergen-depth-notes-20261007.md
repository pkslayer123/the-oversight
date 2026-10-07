# characterGen smallest-pool expansion — 2026-10-07 (worker B)

Steve 23:20 directive: "add content to small pools." Expanded the bottom-third pools
of `src/data/characterGen.json` (leaf-count audit below), plus player-facing mid-small
pools. APPEND ONLY — zero old leaf strings removed/altered (verified by diff:
55 removed lines are all trailing-comma shifts; 0 true deletions).

## Pool size table (leaf entries, before → after)

| pool | before | after | + |
|---|---|---|---|
| questTemplates | 3 | 6 | +3 |
| misunderstandTemplates | 5 | 10 | +5 |
| curiosities | 6 | 12 | +6 |
| grievances | 6 | 12 | +6 |
| sharingStyles | 7 | 12 | +5 |
| theorizeAsks | 8 | 14 | +6 |
| darkTells.benign | 5 | 9 | +4 |
| darkTells.malicious | 4 | 7 | +3 |
| temperaments | 11 | 16 | +5 |
| heritageMap | 11 | 16 | +5 |
| goals | 12 | 18 | +6 |
| habits | 15 | 22 | +7 |
| hopes | 15 | 22 | +7 |
| quirks | 20 | 28 | +8 |
| fears | 20 | 28 | +8 |
| wakeUpSpeeches (8 keys ×3) | 24 | 32 | +8 (1/key) |
| moodTalk (5 keys ×6) | 30 | 40 | +10 (2/key) |
| overheard (12 sub-pools ×2) | 24 | 36 | +12 (1/key) |
| talkTemplates | 44 | 60 | +16 |
| topicPack.labels (9 keys ×3) | 27 | 36 | +9 (1/key) |
| topicPack.moreLabels (9 keys ×3) | 27 | 36 | +9 (1/key) |
| temperamentTalk (10→15 keys ×8) | 80 | 120 | +40 (5 new keys) |

Untouched (already deep enough or names/keys): intelligences, theories, intelOpeners,
convo, voice, appearancePools, firstNames, lastNames, occupations, sampleOrigins,
languages, originKeywords.

## What was added and why

- **questTemplates (+3):** the wake-up quest giver's intro lines. New ones keep the
  fire-keeper voice, introduce the "someone carried you in" mystery without naming them.
- **misunderstandTemplates (+5):** language-barrier comedy beats. Doubled — these fire
  often in early game when languages are unlearned.
- **curiosities (+6):** single-word traits (restless, methodical, guarded, dreamy,
  meticulous, disengaged). New values fall back to `steady` in the intelligence-secondary
  mapping (same as existing `anxious`), so no consumer changes needed.
- **grievances (+6):** old inter-people wounds in the established noun-phrase register
  (wedding feud, fishing spot, bridge toll, burned schoolhouse, strayed herd, broken funeral promise).
- **sharingStyles (+5):** open-handed, stingy, strategic, communal, grudging.
- **theorizeAsks (+6):** quoted asks pulling the player into System theorizing.
- **darkTells (+7):** 4 benign (salt lines, name roll-call, empty seat, mirror avoidance),
  3 malicious (kindness ledger, injury-question fixation, sleep-watching). All
  observational — assessments never name unwitnessed crimes or accuse. `{They}`-verb
  forms checked against the `conj` map in game.js (redraw→ rephrased; only mapped verbs
  used after {They}/{they}).
- **temperaments (+5) + temperamentTalk (+40):** sardonic, earnest, fidgety, stoic,
  mischievous — each with 8 quoted lines in a distinct voice, matching the existing
  8-line convention. New temperaments fall back to `steady` secondary intel and the
  default trust threshold, same as existing `anxious`.
- **heritageMap (+5):** appended at END (savanna/boreal/mediterranean/urban/tropical)
  so existing tag matches still win by order — zero behavior change for existing origins.
- **goals (+6):** home, record, answers, legacy, joy, peace — each {id, want, lines[8]}.
  No special-cased ids (only lead/survive are); lines fill via fillTalkLine.
- **habits/hopes/quirks/fears (+7/+7/+8/+8):** plain-string traits, distinct voices,
  no overlap with existing entries (proof test enforces ≤60% trigram overlap).
- **wakeUpSpeeches (+8):** one closing line per key, each in the key's voice (the debt
  key's quest ask stays as the penultimate beat; new line closes after it).
- **moodTalk (+10):** two quoted lines per mood (grieving/scared/cheerful/lonely/weary).
- **overheard (+12):** one opener + one reply per intelligence type — the fire-side
  chatter pool was only 2 deep per type and fires often.
- **talkTemplates (+16):** small-talk lines using only {an_occ}/{Occ}/{occ}/{first}/
  {origin}/{skill}. Third-person {first} self-reference kept as the established quirk.
- **topicPack (+18):** one new label + one follow-up per topic key (lately/you/fears/
  oldworld/skills/others/systemtake/advice/loved).

## Constraints honored

- No new top-level keys (33 → 33); no new field names on darkTells/goal objects.
- Token vocab per pool harvested from baseline entries; new entries use only
  established tokens, and fill-simulation with each pool's real consumer fill
  (fillTalkLine / wake-up fill / genRoster quest fill / fillPronouns) leaves no
  `{token}` unfilled.
- Knowledge-gating: no named unwitnessed crimes, no species/food names the player
  hasn't earned (debt-key dandelion reference is pre-existing, untouched).
- JSON style: `JSON.stringify(d,null,2)+"\n"` round-trips the untouched file
  byte-identically (verified before writing); no cosmetic churn.

## Proof test

`scripts/test-charactergen-depth-20261007.js` — plain node, mulberry32 seeded
(default 20261007, SEED env override). Checks counts ≥ baseline, shapes, id
uniqueness, token vocab, trigram-dupe ≤60% (new-vs-baseline and new-vs-new),
no new top-level keys/fields, and seeded fill-simulation sampling (110 samples).
ALL GREEN on seeds 20261007, 42, 987654, 7. Caught 3 real near-duplicates during
writing (fixed in the content, not by loosening the bar).
