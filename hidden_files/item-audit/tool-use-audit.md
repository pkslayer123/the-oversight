# Starting-Item Tool-Use Audit — 2026-10-05

**Scope:** all 74 items in `src/data/items.json` with `class` in (tool, weapon, clothing).
**Directive (Steve):** if an item is presented as an ordinary tool, it must have an ACTUAL USE in the game. No dead-weight masquerading as tools.
**Method:** read-only. For each item checked: `def.weapon`/`def.armor`/`def.tool`/`def.healAmount`/`def.carryBonus`/`def.kcalEach`/`def.craftable`/`def.tradeValue`/`def.baseEffect` field reads in `src/js/`, plus quoted id-grep (`'id'`/`"id"`) across all `src/js/*.js` for bespoke mechanics.
**Verdict: 24 have a real use. 50 do not.**

---

## DEAD ITEMS (50) — no verifiable game mechanic

### Why they're dead — the evidence

1. **`baseEffect` is display-only.** The ONLY code reads are `src/js/app.js:433` (item-pick card display) and `src/js/game.js:16047` (alien-loot announcement text). Nothing in the game ever reads `baseEffect` to change behavior. An item whose only claim is `baseEffect` does nothing.
2. **Zero bespoke id references.** Quoted grep (`'stethoscope'` etc.) across all `src/js/*.js` returns 0 files for every item in this section (one false positive noted below).
3. **`craftable`/`materials` on item defs are dead flags.** `craftable` appears 0 times in all of `src/js/`. Crafting runs through `src/data/recipes.json` + `Game.craft()` (game.js:2154), which never reads item-def `craftable`.
4. **`universal: true` is a data-validation marker only** (progression.js:434 — "no occupation link and not universal"). Not a mechanic.
5. **Relic bond does not rescue them.** All 5 starting picks become bonded relics (game.js:1247), and bond enhancements exist — BUT the enhancement `effect.target` values (`task.speed`, `tool.reliability`, `task.impossible`, `weather.immunity`) are never read by any game code (0 hits). Only the sentimental-pool `resolve`/`anchor` enhancements have real code (game.js:11965/11974). A stethoscope with "Efficient Action: 25% faster at its task" has no task.
6. **Fire/fishing/cooking/water ignore these items.** `makeFire` (game.js:6209) is friction-fire via knowledge + `beard_moss` ability — never checks for `lighter`/`tinder_bundle`/`hand_drill`/`torch`. Fishing (game.js:6428) is bare-hands + knowledge — never checks `fishing_line`/`gill_net`. `eatOne` (game.js:11191) requires `kcalEach > 0` — none of the food-named tools have it, so protein bars etc. can't even be eaten.

### The 50

**No fields at all (9)** — bare id/class/name/flavor, nothing for code to read:
`stethoscope`, `binoculars`, `bus_map`, `phone_charger`, `energy_drink`, `calculator`, `pen_set`, `tasting_spoon`, `thermos`

**`universal`-only (7)** — validation marker, not a mechanic:
`bandana`, `protein_bar`, `snare_wire`, `trail_mix`, `chopsticks`, `soy_packets`, `dice_set`
- Note: `snare_wire` has 1 grep hit (game.js:7890 `grantProgress(['tactics_small','snare_wire','shelter_debris'])`) — that is a KNOWLEDGE topic id, not the item. Coincidence, not a mechanic.

**`baseEffect`-only tools (16)** — flavor text with no code behind it:
`multitool` ("+1 to foraging yields" — no forage code reads it),
`lighter` ("Fire on demand" — makeFire never checks it),
`field_sutures` ("Stabilize one severe injury" — no code),
`rope_50ft`, `tin_cup` ("Drink from anything, anywhere" — no water mechanic reads it),
`chefs_knife`, `whetstone` ("Restore any blade to service" — no code),
`fishing_line` ("Fish anywhere" — fishing never checks it),
`tinder_bundle` ("Start fires without a check" — makeFire never checks it),
`rope_coil`, `sewing_kit` ("Repair clothing/armor" — no code),
`torch` ("Light in dark places" — no light mechanic reads it),
`hand_drill` ("Make fire anywhere" — makeFire never checks it),
`gill_net` ("Passive: catches fish" — no passive-fishing code),
`field_dressing_kit`, `camp_pot` ("Cook without a kitchen" — no cooking code reads it)

**`baseEffect`-only tools with bond hooks (1)** — still dead as a tool:
`grandfathers_knife` — has `bondThresholds` + `secretEvolution: "old_ghost"` (real hook at game.js:10314, bond-50 evolution offer). The item itself does nothing; the evolution is a lottery ticket, not a use.

**`baseEffect`-only clothing (11)** — `isArmor` needs `def.armor`; none have it, so the Wear button never appears (app.js:3212 gates on `Game.isArmor`):
`good_boots`, `camo_jacket`, `wool_socks`, `rain_poncho`, `work_gloves`, `canvas_pants`, `flannel_shirt`, `knit_cap`, `denim_jacket`, `running_shoes`, `rain_shell`

**Alien loot with dead stats (6)**:
`phase_blade` — class `weapon`, but NO `def.weapon` field. `isWeapon` (game.js:5772) requires `def.class==='weapon' && def.weapon` → false → Equip button never renders. Its "+60 damage, ignores armor" is pure text. **Cannot be equipped.**
`starfall_lance` — same: class `weapon`, no `def.weapon`. "+80 damage" is text. **Cannot be equipped.**
`contract_quill` — `tradeValue: 600`, but `tradeValue` is read 0 times in `src/js/`. "The System values this (trade 600)" is a lie.
`nanite_swarm` — "Heals 50 HP over 3 turns when used" — no `healAmount`, no id refs. Not usable.
`gravity_well` — "Immobilizes enemies in 3x3 area" — no id refs. Does nothing.
`genesis_seed` — "Creates a food source (5000 kcal over 10 days)" — no id refs. Does nothing.

---

## FULL TABLE — all 74

| item id | class | has use? | the use (mechanic + code ref) | notes |
|---|---|---|---|---|
| multitool | tool | NO | — | baseEffect display-only; 0 id refs |
| lighter | tool | NO | — | makeFire (game.js:6209) never checks for it |
| field_sutures | tool | NO | — | 0 id refs |
| good_boots | clothing | NO | — | no def.armor → Wear button never shows |
| grandfathers_knife | tool | NO | — | secretEvolution hook real (game.js:10314) but item itself does nothing |
| rope_50ft | tool | NO | — | 0 id refs |
| tin_cup | tool | NO | — | 0 id refs |
| camo_jacket | clothing | NO | — | no def.armor |
| chefs_knife | tool | NO | — | 0 id refs |
| whetstone | tool | NO | — | 0 id refs |
| fishing_line | tool | NO | — | fishing (game.js:6428) never checks for it |
| stethoscope | tool | NO | — | no fields at all |
| bandana | tool | NO | — | universal-only |
| protein_bar | tool | NO | — | no kcalEach → can't be eaten (eatOne game.js:11191) |
| snare_wire | tool | NO | — | the 1 grep hit is a knowledge topic id, not the item |
| trail_mix | tool | NO | — | no kcalEach → can't be eaten |
| binoculars | tool | NO | — | no fields at all |
| chopsticks | tool | NO | — | universal-only |
| soy_packets | tool | NO | — | universal-only |
| bus_map | tool | NO | — | no fields at all |
| phone_charger | tool | NO | — | no fields at all |
| energy_drink | tool | NO | — | no kcalEach; universal absent too — truly nothing |
| dice_set | tool | NO | — | universal-only |
| calculator | tool | NO | — | no fields at all |
| pen_set | tool | NO | — | no fields at all |
| tasting_spoon | tool | NO | — | no fields at all |
| thermos | tool | NO | — | no fields at all |
| sharpened_stick | weapon | YES | equippable; `def.weapon.bonus` 5 read by weaponBonus()/equippedWeapon() (game.js:6788/6798) | also craftable-flagged but flag unread |
| stone_knife | weapon | YES | weapon + `tool.woodcut: whittle` tier read by woodcutTier() (storage.js:68) | |
| hunting_spear | weapon | YES | equippable, range 2 | |
| kitchen_knife | weapon | YES | equippable | |
| bark_armor | weapon | YES | `def.armor.protection` 10 read by armorBonus() (game.js:5765); Wear via isArmor (game.js:5776) | data quirk: class is 'weapon' but works as armor |
| leather_jacket | weapon | YES | armor 15 | same class quirk |
| riot_gear | weapon | YES | armor 30 | same class quirk |
| military_vest | weapon | YES | armor 40 | same class quirk |
| sling | weapon | YES | equippable ranged (range 4, ammo stone) | |
| fire_hardened_spear | weapon | YES | equippable | |
| hatchet | weapon | YES | weapon + `tool.woodcut: fell` — fell tier gates tree-felling via cutInfo() (storage.js:88) | |
| machete | weapon | YES | weapon + `tool.woodcut: brush` tier | |
| crude_bow | weapon | YES | equippable ranged (range 5, ammo arrow) | |
| padded_cloth | weapon | YES | armor 5 | same class quirk |
| hide_armor | weapon | YES | armor 20 | same class quirk |
| swat_vest | weapon | YES | armor 35 | same class quirk |
| tinder_bundle | tool | NO | — | makeFire never checks for it |
| rope_coil | tool | NO | — | 0 id refs |
| sewing_kit | tool | NO | — | 0 id refs |
| torch | tool | NO | — | no light mechanic reads it |
| hand_drill | tool | NO | — | makeFire never checks for it |
| gill_net | tool | NO | — | no passive-fishing code |
| field_dressing_kit | tool | NO | — | 0 id refs |
| wool_socks | clothing | NO | — | no def.armor |
| rain_poncho | clothing | NO | — | no def.armor |
| crowbar | weapon | YES | equippable (`def.weapon`); also `tool.pry` flagged | pry has no gated action (storage.js:266/474 classify only) — weapon use counts |
| hiking_backpack | tool | YES | `carryBonus` 10 read at game.js:6574 (pack cap) | |
| duffel_bag | tool | YES | `carryBonus` 7 (game.js:6574) | |
| work_gloves | clothing | NO | — | no def.armor |
| canvas_pants | clothing | NO | — | no def.armor |
| flannel_shirt | clothing | NO | — | no def.armor |
| knit_cap | clothing | NO | — | no def.armor |
| denim_jacket | clothing | NO | — | no def.armor |
| running_shoes | clothing | NO | — | no def.armor |
| rain_shell | clothing | NO | — | no def.armor |
| hand_saw | tool | YES | `tool.woodcut: prune` tier → cutInfo prune gating (storage.js:88) | baseEffect "+1 to wood gathering" is display-only; the tier is the real use |
| camp_pot | tool | NO | — | no cooking code reads it |
| wrong_bandage | tool | YES | `healAmount` 25 → isUsable/useItem (game.js:5781/5792) | note: bonded starting picks can't be used up (game.js:5794) — works for found ones |
| hardlight_knife | weapon | YES | equippable (`def.weapon` bonus 45) | |
| medfoam_canister | tool | YES | `healAmount` 50 → isUsable/useItem | same bonded caveat |
| gravity_hook | tool | YES | `carryBonus` 8 (game.js:6574) | |
| contract_quill | tool | NO | — | tradeValue read 0 times |
| phase_blade | weapon | NO | — | NO def.weapon → isWeapon false → Equip never renders; "+60 damage" is text |
| nanite_swarm | tool | NO | — | no healAmount, 0 id refs; "heals 50 HP" is text |
| gravity_well | tool | NO | — | 0 id refs; "immobilizes" is text |
| starfall_lance | weapon | NO | — | NO def.weapon → cannot equip; "+80 damage" is text |
| genesis_seed | tool | NO | — | 0 id refs; "5000 kcal" is text |

---

## Notes for Steve

- **11 clothing items can't be worn.** The Wear button gates on `Game.isArmor` → `def.armor`, and none of good_boots/camo_jacket/wool_socks/etc. have it. They're presented as clothing but are mechanically nothing. (Separately: 7 armor pieces work but are mislabeled `class: 'weapon'` in the data — works today, but it's a trap for any future class-based logic.)
- **`baseEffect` is a lie field.** 27 items carry one; zero are consumed by mechanics. If the design intent is "the card tells the truth," the truth needs code behind it or the field removed.
- **Alien loot is the worst offender:** 6 of 10 alien items do nothing, including two "weapons" that can't be equipped. Given "monsters have a LOW chance to drop alien loot, at a proper level — not raining loot," the few drops that do land should work.
