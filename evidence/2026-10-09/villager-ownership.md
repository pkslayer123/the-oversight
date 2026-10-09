# Villager ownership + gear crafting (Steve 2026-10-09, three directives)

## 1. Individual ownership (corrects the first gear build)
Steve: "Not necessarily communal gear, it's their gear... individuals with
the capacity to share resources and cooperate but not obligation."

- The choose-5 overflow is PERSONAL: `ch.stashed` (their belongings at their
  space). No `villageShare`, no auto-seeded communal pool. The first build's
  `v.armory` auto-seed is removed.
- `villagerGearUp` acquisition order: own carried -> own stashed ->
  communal armory (DEPOSITED only) -> whittle from woodpile. Never another
  person's gear.
- Transfer paths: deliberate gift/trade, discard, or death. Sharing is
  capacity, not obligation.

## 2. Deposit-gated communal stash (Steve: "just a stash for items that can be
taken by any villager once deposited... Weapons open armory. Medicine open
pharmacy.")
Built on the EXISTING storage.js stash (not a parallel system):
- `stashState()` gains `weapons[]` + `medicine[]` alongside materials/tools.
- `donateWeapon`/`takeWeapon` (armory), `donateMedicine`/`takeMedicine`
  (pharmacy) — same gates as donateTool: physical stores, bonded refusal,
  weight check, ledger, trust.
- `stashHtml()` shows Armory / Pharmacy / tools / materials sections.
- Inventory: Armory/Pharmacy deposit buttons; haven panel take wiring.
- NPC villagers draw deposited weapons when gearing up (deposit = consent);
  the take is ledger-logged under their id.

## 3. Corpse = death pack (Steve: "human or alien bodies are lootable corpses,
you don't just get it in your inventory... Just for the sapient enemies.")
- `generatePossessions` for villagers: the dead person's ACTUAL carried +
  stashed gear becomes the lootable corpse items (take/leave per item —
  loot-as-action, nothing auto-transfers).
- Sentimental items DIE with the owner: excluded from corpse loot, and the
  bond gate means a stranger's keepsake grants nothing.
- Animals/monsters keep generic pools (sapient-only rule).

## 4. Gear crafting wired — one organized system (Steve: "yes wire those gear
items but... one organized system not parallel pathing.")
- 12 gear recipes appended to recipes.json (stone_knife already existed):
  sharpened_stick, hunting_spear, fire_hardened_spear, crude_bow, bow,
  crossbow, sling, arrow (x5), bolt (x5), bark_armor, padded_cloth, hide_armor.
  Honest materials from obtainable keys; L1/L2/L3 prose in the existing voice.
- `craft()` now makes REAL items: recipe id matching an item def produces
  `{itemId}` — a crafted spear is a spear (fixes stone_knife crafting a
  decorative rock). Same craft(), same L0/L1/L2 gates, `makesUnits` for ammo.
- Removed the 13 dead `.craftable: true` flags from items.json (nothing ever
  read them; recipes.json is the single source).
- Knowledge: handling a gear item (equip, corpse loot) teaches L1
  (`noteGearHandled`); a successful blind L1 craft teaches L2.
- New materials with honest sources: `bark` (gathering branches),
  `hide` (animal corpse loot carries `material: 'hide'`). Both in MAT_DEFS.

## Proof
`scripts/test-villager-gear-20261009.js` rewritten for the ownership model:
26/26 x 3 seeds. Regressions: grit 22/22, fieldfights 24/24, knowledge 4/4,
ontology 50/50. validate-data.js crash is pre-existing on main.
