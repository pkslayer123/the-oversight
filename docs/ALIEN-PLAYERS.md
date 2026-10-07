# Alien Players — Schema & Authoring Guide

**System:** Late-game sentient aliens impersonating humans in an exclusive encounter pool.
**Data:** `src/data/alienPlayers.json` (8 personas as of 2026-10-07)
**Schema:** `alienPlayer` in `src/data/schemas.json` (validated by `scripts/validate-data.js`)
**Code:** `src/js/alienPlayers.js`
**Steve's rules:** They impersonate HUMANS, not monsters. Monster tiers and loot tiers are separate concepts — never conflate them here either.

---

## Persona Schema

Each persona is an object with these fields:

### Required (every persona)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique slug, e.g. `vex_marlowe`. Never changes. |
| `name` | string | Display name, e.g. `Vex Marlowe` |
| `title` | string | Epithet, e.g. `Trophy Hunter, Third Dynasty` |
| `species` | string | Alien species, e.g. `Vexari`, `Meridian`, `Burlap` |
| `disposition` | enum | `sadistic` \| `neutral` \| `benevolent` |
| `wealth` | enum | `rich` \| `comfortable` \| `broke` — drives self-preservation: broke retreats when losing (can't afford another body), rich never retreats and enrages when hurt |
| `experience` | enum | `veteran` \| `rookie` — veterans exploit game mechanics; rookies make charming mistakes |
| `combat` | boolean | `true` = appears as a fighter. `false` = never fights (acts through dead drops, warnings, etc.) |
| `voice` | string | Voice description for writers, e.g. `Theatrical, drawling, delighted by your suffering` |
| `backstory` | string | Who they are, 2-4 sentences |
| `motivation` | string | What they want, 1-2 sentences |
| `signature` | string | Combat signature — how they fight, 1-2 sentences |
| `rivalry` | string | How they escalate across encounters, 1-2 sentences |
| `introLines` | string[] | 1-2 lines on first encounter |
| `defeatLines` | string[] | 1-2 lines when you beat them |
| `abilityKit` | string[] | Ability IDs from `abilities.json`. Combat personas: exactly 6. Non-combat: `[]`. |
| `alienTech` | array | `{id, name, desc}` objects. Rule-breaking gear. May be `[]` (Old Tam fights fair). Tech IDs must be unique across all personas. |

### Required for combat personas (`combat: true`)

| Field | Type | Description |
|-------|------|-------------|
| `taunts` | string[] | Mid-fight taunts (2-4) |
| `victoryLines` | string[] | 1-2 lines when they beat you |
| `escalationLines` | string[] | 1-2 lines on repeat encounters |
| `combatLines` | object | Exactly 3 lines per situation: `onHit`, `onHurt`, `onWinning`, `onLosing`, `unhinged` (15 total, all unique) |

### Optional (any persona)

| Field | Type | Description |
|-------|------|-------------|
| `helpLines` | string[] | For secret allies (Wren, Old Tam) — dead-drop notes, warnings |
| `tradeLines` | string[] | For traders (Pip) — what they offer |

---

## How to Add a 9th Persona

1. **Pick a gap.** Check existing dispositions (3 sadistic, 3 neutral, 2 benevolent), wealth tiers, and species. Don't duplicate a voice.
2. **Write the persona.** Copy an existing entry as a template. Fill ALL required fields. Combat personas need all 15 combat lines (3 per situation, unique, in-voice).
3. **Choose abilities.** Pick 6 from `src/data/abilities.json` that fit the fighting style. Verify each ID exists.
4. **Design alien tech.** 1-2 pieces that break normal rules. Give each a unique `id`. Write the `desc` as a player-facing threat ("You cannot hide from Vex" — not "+2 stealth pierce").
5. **Set `combat`.** `true` unless they're strictly non-combat like Wren.
6. **Validate.** Run `node scripts/validate-data.js` (schema) and `node scripts/test-alien-schema-20261007.js` (semantic rules).
7. **No code changes needed.** `apAbilityKit`, `apAlienTech`, and `apIsCombat` read from the JSON. The encounter pool, progression, and group logic pick up new personas automatically.

### What NOT to do

- Don't add a 9th sadistic rich veteran without a reason — the roster needs variety.
- Don't write generic combat lines. Each persona's 15 lines should be unmistakably theirs.
- Don't give non-combat personas a combat kit. `combat: false` means `abilityKit: []`.
- Don't reuse tech IDs. Each piece of alien tech is unique in the fiction.

---

## Validation

Two layers (following the regions.json pattern):

1. **Structure** — `scripts/validate-data.js` checks the `alienPlayer` schema: required fields, enum values, types, unknown fields, duplicate IDs, and that every `abilityKit` ID exists in `abilities.json`.
2. **Semantics** — `scripts/test-alien-schema-20261007.js` checks what the schema can't: combat personas have exactly 6 abilities and 15 unique combat lines, tech IDs are globally unique, and the JS actually reads from JSON (not the hardcoded fallbacks).

Run both before committing a new persona.
