# Villager gear: find it, wear it, heal up (Steve 2026-10-09)

## The root cause
**equipment.js published to `window.S`; game.js consumes `global.Scattering`.**
`Scattering.equipment` was `undefined`, so every `if (S.equipment)` guard in
game.js silently skipped — **autoEquip NEVER ran in the real game**. Every
villager spawned with a weapon in their pack and fought every fight unarmed
(4–8 dmg/round, 0% kill rate vs anything but hummice). The 20k-fight sim that
showed "unarmed loses everything" was measuring this bug, not the design.

Fix: namespace bridge at the end of equipment.js — publishes to both
`window.S` (existing consumers: app.js UI, fieldFights) and the canonical
`global.Scattering`.

## Sibling bugs found while fixing
1. **God-tier starter weapons**: genPersonalPool's `take('weapon', 1)` had no
   tier gate (genItemCandidates gates to tier ≤2, non-alien). Villagers spawned
   with godslayer_spear / worldbreaker_maul. Gated to match.
2. **Stale equipped after pool swap**: the lifeseed wrapper replaced ch.items
   but never re-ran autoEquip — equipped referenced items no longer carried.
   Re-equip added to the wrapper.
3. **Ranged weapons invisible to field fights**: spears (range 2) file as
   ranged; fieldFight only read melee wb. Off-screen fights have no grid —
   melee + ranged now both contribute (same as threatLevel).

## What villagers do now (Steve's directives)
- **Choose their own 5** (`choosePersonalFive`): personality-driven scoring —
  keepsakes stay (+1000 keep-bias), weapons/tools/armor by bonus, a flicker of
  idiosyncrasy. The 3 unchosen go to `ch.villageShare` → village **armory**
  at founding. Normal items are communal; keepsakes are not.
- **Find gear**: re-equip at every fight entry (deterministic, safe for seeded
  contests); draw best weapon from the armory at departure; whittle a
  sharpened stick from the woodpile (buffer-respecting, hearth first) as
  fallback. Kill loot: villager kills roll the same alien-loot table — the
  System's gift goes in the killer's pack, re-equip on the spot.
- **Heal before going out** (`villagerHealCheck`): <70% HP + healer at haven
  → tended (+25, narrated). <70% HP + no healer → rests instead of ranging
  out. Called at expedition departure and patrol assignment.
- **Sentimental owner-lock**: keepsakes tagged with owner at spawn; bond
  accrues only for the owner (`accrueRelicBond` gate). A stranger's keepsake
  is just stuff.
- **Armor honesty**: fieldFights models equipped armor with the tactical
  engine's flat reduction (`final = max(0, final - prot)`), absorption logged.
  The old "no armor modeling" boundary is removed from the header.

## Proof
`scripts/test-villager-gear-20261009.js` — 16/16 × 3 seeds:
namespace bridge, spawn-armed-after-gearup, no god-tier starters, choose-5 +
armory seeding, keepsake owner tags, stranger-keepsake bond gate, re-equip on
inventory gain, armory draw (best weapon), heal-check both branches, fieldFight
uses real weapon damage, armor absorption logged, kill loot to killer.

Regressions: villager-grit 22/22, break-monsters3-fieldfights 24/24 (one test
updated to the honest items→autoEquip path), combat-r7 29/29, ontology 50/50.
Pre-existing failures unchanged (test-lifeseed 107, test-equipment-20261007 —
identical on main).

## Held / follow-ups
- The 13 craftable gear items (hunting_spear, bark_armor, crude_bow…) are
  defined but unreachable — `craft()` only reads recipes.json (traps/tools).
  Offered to Steve as follow-up work; not done unapproved.
- Wave-2 pacing (day 8 + 4 kills) unchanged — the village can now plausibly
  gear inside the window via armory + kill loot + whittling.
- Player donation to the armory: no UI yet. Villager-populated only.
