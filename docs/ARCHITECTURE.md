# ARCHITECTURE

## The rule

**Everything is data. The engine is dumb. A validator guards the gate.**

New content (plants, monsters, abilities, events, villagers, shop items, System lines) is added as JSON in `src/data/`, conforming to `src/data/schemas.json`. Game code in `src/js/engine/` reads data and never hardcodes content. `scripts/validate-data.js` runs on every commit and fails the build on schema violations, dangling references, or unbalanced numbers. If it passes validation, it cannot implode the game.

## Layout

```
src/
  data/           # all content (JSON)
    schemas.json  # the law — every content file validated against this
    plants.json, monsters.json, abilities.json, villagers.json,
    items.json, events.json, systemMessages.json, shop.json,
    biomes.json, trials.json
  js/
    engine/       # pure logic, zero DOM
      state.js       # game state factory, save/load (localStorage, versioned)
      modifiers.js   # the modifier pipeline (see below)
      day.js         # day resolution order
      forage.js      # foraging resolver (slice 1)
      combat.js      # combat resolver (slice 1+)
      calories.js    # the master clock
    ui/
      terminal.js    # grounded survival UI renderer
      overlay.js     # System overlay layer (post-Integration)
    app.js           # screen router (exists)
scripts/
  validate-data.js   # content gate — run in CI and pre-commit
docs/                # VISION, DESIGN, DECISIONS, OPEN-QUESTIONS, ROADMAP, CONTENT
```

## The modifier pipeline (the scalability core)

Every computed value in the engine (forage yield, damage dealt, healing, AP, spoilage rate, travel cost...) is resolved through `modifiers.js`:

```
base value → collect active modifiers (abilities, relic bonds, injuries, conditions)
           → apply in order: add, then multiply → final value
```

Abilities declare modifiers as data:

```json
{ "target": "forage.yield", "op": "multiply", "value": 1.25, "condition": "biome:woodlands" }
```

New abilities never touch engine code. If a new mechanic needs a new *target* (e.g. `water.purity`), that's an engine change — rare, deliberate, documented in DECISIONS.md.

## Content references

Content cross-references by `id` only. The validator checks:
- every `id` is unique within its file
- every reference (`plantId`, `abilityId`, `itemId`, `monsterId`...) resolves
- numeric fields are within declared ranges (no 99999-calorie berries)
- required fields present; no unknown fields (typos fail loudly)

## Save format

`localStorage['scattering-save-v1']` — versioned. `state.js` migrates old versions forward; unknown versions refuse to load (never corrupt). Village, scholars, Codex, and run state are separate sub-objects so one can reset without touching the others.

## UI layers

- `terminal.js`: the grounded layer. Always present. Owns the hunger/water meters — nothing may cover them.
- `overlay.js`: the System layer. Inactive pre-Integration; slides over (never replaces) post-Integration. Owns notifications, assessments, shop, audience votes. May glitch (untranslated glyphs) by design.
