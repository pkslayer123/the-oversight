# Playtest: Living World + Knowledge Taxonomy — 2026-10-04

## What shipped
Commit b1a9954 "living world" — pushed to origin master.

## Systems tested

### Knowledge Taxonomy (18/18 unit tests pass)
- 27 skills across 9 domains (survival, nature, medical, crafting, social, combat, psychological, spiritual, navigation)
- Rarity tiers: 12 common, 10 uncommon, 3 rare, 2 legendary
- Background knowledge: nurse gets 5 skills (wound_care L2, anatomy, herbal_medicine, calm_panic, purify_boil)
- Mechanical effects feed the modifier pipeline (fire.fuel ×0.8 from purify_boil L2, etc.)
- Knowledge-ability synergy: wound_care L2 + healing → "Precise Mend" technique (+50% healing)
- Jackpots: stranger (2-3 skills), insight (15% on knowledge combination), books unlock skills

### Living World (20/20 tests pass, from earlier)
- Tile depletion: lush → picked-over → barren visual states
- Villager foraging depletes specific tiles
- Personality-driven zones (bold goes far, cautious stays close)
- Pressure-suppressed regrowth
- Fireside teaching (pre-System)
- Knowledge traders
- Village knowledge profiles emerge from sim
- Knowledge combination from overlap

### UI Refinements
- Assignment in talk menu: "🗣️ Ask for help" (was "📋 Assign task")
- Conversational framing: "What do you need?" / "Could you go forage?"
- Remote assignment hooks: `canAssignRemote()`, `remoteAssignMethods()`, `remoteAssignSheet()`
- Ability contract documented: `remoteAssign: {id, name, desc, range}` in ability data
- Names match origins: 80% correlated, 20% mismatch (tested 20 samples: 16/20 matched)
- Visual origin picker: searchable, flags, regions, 35 origins, escape hatch for custom

## Build verification
- Syntax: all JS files pass node --check
- Content gate: OK (25 plants, 10 monsters, 63 abilities, 90 items, 12 synergies, etc.)
- Knowledge: 18/18 pass
- Living world: 20/20 pass
- Build playtest: 15/15 pass

## Design notes for Steve
- Knowledge is now about ANYTHING: purify water 5 ways, read tracks, predict weather, calm panic, make snares, star navigation, wound care, fire in rain
- Jackpots are rare by design: 5%/day stranger, 15% insight on combine, books always jackpot
- Background knowledge is MECHANICAL, not flavor: nurse's wound_care L2 gives real heal bonuses
- Knowledge × Abilities: 27 skills × 63 abilities = technique unlocks. Currently 3 defined (Precise Mend, etc.), more to come.
- Each run reveals a different slice: rarity + random stranger + background = structured variety
- The Codex now has SKILLS and TECHNIQUES sections alongside plants/beasts
