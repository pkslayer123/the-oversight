# Cooking is a real system — digestibility + monster-diet weirdness (Steve 2026-10-08)

Steve: "cooking can make food more digestible and change caloric content, but it
sounds like this needs much more fleshing out than a standard multiplier."
And: "You can cook flesh or other items you don't know etc, but you get unknown
meat etc and you still have to risk eating it. Cooking isn't a cure all. Some
monster meat specifically should have weird weird diseases and consequences.
More comical yet horrific the better."

## A. Digestibility model (replaces flat multipliers)

Core: every food has GROSS kcal (chemical energy). Net = gross × digestibility(state).
Raw digests worse + carries disease risk; cooked digests better. Cooked can never
exceed gross — energy is never created. Per-class, not per-item-flat:

| class | raw | cooked | ×raw→cooked | note |
|---|---|---|---|---|
| meat | 0.60 | 0.85 | 1.42× | parasites die, protein loosens |
| monster | 0.55 | 0.80 | 1.45× | helps. does not make it safe |
| tuber | 0.35 | 0.80 | 2.29× | raw starch is barely food — biggest gain |
| grain_legume | 0.30 | 0.75 | 2.50× | must-cook |
| greens | 0.85 | 0.90 | 1.06× | barely worth the fire (honest) |
| fruit | 0.95 | 0.90 | 0.95× | cooking LOSES a little (honest) |
| nut | 0.80 | 0.90 | 1.13× | roasting wakes them up |
| mushroom | 0.50 | 0.80 | 1.60× | settles the questionable ones. mostly |

- Gross anchor: existing kcal numbers are today's raw net (zero balance disruption
  to raw eating); gross = rawNet / class.raw; cooked = gross × cooked × outcome.
- Curated `cookedKcal` (beans 150→300, rice 200→350) respected as designed values,
  still capped by gross.
- Skill outcomes: knows → perfect 70% / decent 25% / burnt 5%; unknowing →
  decent 30% / undercooked 40% (disease risk STAYS) / burnt 30%.
- Fire fuel: cooking burns fire ticks from player-made fires; a fire dying
  mid-cook downgrades one grade. Established/map fires don't notice your stew.
- All 4 cook paths share one math (`cookTransform`): per-item player, batch
  wrapper, `cookAll` staples, specialist. Pantry valuation uses the same math.
- Copy: every cook states `before → after kcal` + outcome + class blurb. Burnt
  flagged (`mealQuality` 0.45).

## B. Monster-diet weirdness (cooking is NOT a cure-all)

6 diseases, data-driven in cooking.json, statuses in statusEffects.json.
Trigger at eat-time: raw 35%, cooked 20% (reduced, never cured). Unknown flesh
stays unknown through cooking — no kcal reveal, no safety claim, still needs
the cautious test. First taste is a surprise; `codex.monsters[mid].meatDisease`
records it; the next cook warns honestly.

| disease | monster | down | UP (min-max bait) |
|---|---|---|---|
| Howlbelly 🐺 | hushwolf | night howling: +0.25 wanderer detection | small monsters fear-check |
| Gristlefit 🥩 | bulldozer | 15%/fight lash out at random adjacent (friend or foe) | +25% strike damage |
| Croakbelly 🐸 | belltoad | gut ribbits (-stealth, prey bolts) | choir toads won't start anything |
| Shellgut 🐢 | speedbump | -25% kcal absorbed, digestion clanks | immune to ingested poison/disease |
| Witness Maw 👁 | mirror_stag | black tears: -2 trust, everyone | night half as dark |
| Flockmind 🦆 | ducks_in_a_row | quack when startled (+detection, no surprise) | duck-lines won't start anything |

Hooks: `wandererFindsYou` (howlbelly/flockmind), `triggerEncounter` (kin
recognition returns false; howlbelly fear vs hp<50), `tbPlayerStrike` (gristlefit
×1.25 + lash-out via `tbDamage`), `lightLevel` (witness_maw), `fleeP` (croakbelly/
shellgut noise), `eat`/`eatOne` (shellgut absorption + immunity + weirdness roll).

## Proof
- `scripts/test-cooking-model-20261008.js`: 17 checks — class math hand-verified
  (tuber 100→229), energy conservation across all classes × outcomes, fruit loss,
  curated cookedKcal, unknown-stays-unknown via real cookFood, outcome
  distribution (0.711/0.056), undercooked keeps risk, fire-died downgrade, burnt
  quality. ALL PASS.
- `scripts/test-monster-diseases-20261008.js`: 13 checks — table integrity,
  trigger rates 0.325/0.205 over 400 seeded trials, codex recording, no double-
  apply, shellgut 75% + immunity via eatOne, detection 73→219/600, kin
  recognition, light 0.15→0.57. ALL PASS.
- Regressions: food-reality 90/90 (3 assertions updated from obsolete flat-model
  expectations), break-food ×5, cook-water 23, pantry-phantoms 11, blood-engine 7,
  tent-rooms, tent-breach, make-fire 26, sleep-preview 11. Ontology 47/47.
