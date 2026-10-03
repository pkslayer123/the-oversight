# CONTENT — how to add things

Every content type is a JSON list with a known structure (see `src/data/schemas.json`). To add something, append an entry. Run `node scripts/validate-data.js` — if it passes, you're safe.

## Plants (`plants.json`)

```json
{
  "id": "dandelion",
  "name": "Dandelion",
  "scientific": "Taraxacum officinale",
  "biomes": ["se_woodlands"],
  "seasons": ["spring", "summer", "fall"],
  "caloriesPerUnit": 45,
  "unit": "handful of greens",
  "waterContent": "high",
  "idDifficulty": 1,
  "preparation": "none — eat raw, or boil to reduce bitterness",
  "spoilageDays": 2,
  "confidence": "high",
  "lookalikeNote": "Young leaves unmistakable once flowering; teach rosette shape.",
  "codex": "Every part is edible...",
  "tileAffinity": ["meadow", "trail_edge"]
}
```

**Safety rule (non-negotiable):** `confidence` must be `high` and the plant genuinely safe. When in doubt, leave it out or mark the entry fictional. The validator rejects `confidence: "low"` plants that lack a `fictional: true` flag.

## Monsters (`monsters.json`)

`id, name, biomes[], hp: [min,max], attack: {name, damage:[min,max], telegraph: "..."}, weaknesses[], edible: {calories, note} | null, parts[], behavior: "ambush"|"territorial"|"pack"|"passive", codex (fills in as you learn), codexStages: ["unknown","observed","slain"]`

First encounter shows only `name` + `"unreadable"` intents. Codex stages unlock observation data.

## Abilities (`abilities.json`)

`id, name, pool (fieldcraft|combat|craft|care|system), description, modifiers[] (see ARCHITECTURE), unlock: {type: "granted"|"trial"|"discovery"|"mentorship", ...}, synergyHints[]`

## Villagers (`villagers.json`)

`id, name, homeRegion, formerOccupation, personality[], backstory (2-4 sentences), items[5] (itemIds), clothesNote, abilityWeights {pool: weight}, systemAssessment (the cold open line), survivalProbability`

## Items (`items.json`)

`id, name, class (tool|clothing|sentimental), baseEffect, bondThresholds: [{uses, offer: [enhancementIds]}], flavor`

## Events (`events.json`)

`id, type (audience_vote|sponsor|encounter|discovery), trigger, choices[]: {text, requirements, outcomes[]}, outcomes: {effects (modifier-style), text}`

## System messages (`systemMessages.json`)

`id, trigger (starving|levelup|death|trial_offer|morning|...), text (may contain {name} {kcal} tokens), tone: "cheerful" (always)`

## Shop (`shop.json`)

`id, name, favorCost, description, effect, wackiness: 1-5` — wacky but never dinner. The validator rejects shop items with `caloriesPerUnit > 0` unless `flagged: "novelty"`.

## Trials (`trials.json`)

`id, trigger (condition string), offers[3] (abilityIds), systemText`

## Biomes (`biomes.json`)

`id, name, description, tileTypes[], forageTable (plantId: weight), weather[], seasons: {spring: {days, note}...}, hazards[]`
