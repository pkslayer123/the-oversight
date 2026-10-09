# The Oversight — Disease Roster (Steve's canon)

Two pools. They never mix. Read this before touching any disease, vector, cure,
or diagnosis code. (Established 2026-10-06, reworked 2026-10-09, corrected 2026-10-09.)

## The law

- **Mundane diseases are REAL diseases** (or their playful renamed versions).
  Earthly vectors: bad water, raw/undercooked food, dirty wounds, ticks.
  Diagnosed and cured by earthly medicine: folk remedies, herbal_remedy,
  field_medicine, triage, and specific ruin medicine (antibiotics/antiparasitic).
- **Alien diseases have ALIEN effects.** Vectors: monster bites, monster meat,
  giant freakish mosquitoes. Each is a min-max building block: a drawback, a
  new ability, and a horrible physical transformation. They are never diagnosed,
  eased, or cured by mundane medicine — earthly pills do nothing to alien biology.
- Enforced in code: every def in `src/data/statusEffects.json` carries
  `pool: "mundane" | "alien"`. `seIsDisease()` admits mundane only;
  `contractDisease()` refuses alien; the alien pool contracts through its own
  vectors only. See the `two_pools` ontology rule in `src/js/statusEffects.js`.

## Mundane pool (6) — real diseases

| id | Name | Real analogue | Vector |
|----|------|---------------|--------|
| gutrot | Gut Rot | gut parasite | raw food, risky water, dirty hands |
| trichinosis | Trichinosis | trichinosis | undercooked bear/boar meat (only `cooked` clears it; smoking doesn't) |
| disease | Fever | generic fever | mild: bad food/water/luck; ambient mosquito bites (1.5%); ambient tick bites (escalating) |
| lockjaw | Lockjaw | tetanus | dirty wounds, rust (spasms; lethal untreated) |
| wound_fever | Wound Fever | infected wound | open cuts left dirty; botched tick removal |
| trembles | Trembles | kuru (prion) | human meat — 15% per meal; cooking does NOT kill it |

Diseases never announce their names — only symptoms. Diagnosis (triage /
field_medicine / herbal_remedy, herb lore, stethoscope, or a medical villager)
unlocks the true name, class, and cure direction. Cure tiers per disease:
folk remedies (anyone, uncertain) → occupation medicine → specific ruin
medicine → earned healer deepenings → the Fever's End synergy (true cures).

## Alien pool (9) — alien effects

| id | Name | Vector | Drawback | Ability | Transformation |
|----|------|--------|----------|---------|----------------|
| howlbelly | Howlbelly | hushwolf meat | howl at night, heard | small monsters think twice | second canine voice-box under the jaw |
| gristlefit | Gristlefit | bulldozer meat | rage fits lash out (friend or foe) | +25% strike damage | gristle braids through shoulders/neck |
| croakbelly | Croakbelly | choir toad meat | gut ribbits (-stealth) | choir toads won't start anything | vocal sac under the chin |
| shellgut | Shellgut | speedbump meat | -25% kcal absorbed | immune to ingested poison/food-borne disease | chitin plates under the skin |
| witness_maw | Witness Maw | grief counselor meat | people decide you're possessed (-trust) | night half as dark | black tear ducts, reflective eyes |
| flockmind | Flockmind | duck-line meat | quack when startled, no surprise | duck-lines won't start anything | down feathers on the forearms |
| eurika | Eurika | **giant mosquito bite** (monster fight) | sensory static (1 HP/part, world never turns down) | mosquito-sense: ambushes announce themselves | faceted eye patches, sensory hairs |
| east_nile | East Nile | **giant mosquito bite** (monster fight) | fever dreams (2 HP/part) | the crows warn you: directional danger sense | hollow bones, black pinfeathers |
| lemons | Lemons | **alien tick bite** (monster fight) | achy joints (1 HP/part, energy x0.85) | engorge (+20% kcal); blood-sense (+2 vs bleeding) | ringed rashes at every joint, waxy grey skin |

Eurika and East Nile are the original alien diseases (Steve 2026-10-06/09):
unhinged virus versions that cause **permanent biological warping** — they do
not expire on their own. They come from the GIANT mosquito MONSTER FIGHT
(50/50 which virus on a landed bite) — never from background ticks. Plain
mosquitoes are just mosquitoes (itchy, nothing more) — the shock is that
they're just bugs; the giant ones are "massive freakish" but still called
plainly "mosquitoes."

**Lemons** moved to the alien pool (Steve 2026-10-09): it was the playful
Lyme name, but Steve's correction puts it on the ALIEN tick — a map-visible
monster fight, plainly called a "tick." Drawback: achy joints (1 HP/part +
energy x0.85). Abilities: engorge (+20% kcal absorbed — the tick drinks
deep) and blood-sense (+2 strike damage vs bleeding enemies — you feel
heartbeats). Transformation: ringed rashes at every joint that never fade,
waxy grey skin between. Permanent warping, like eurika/east_nile.

**Two tiers, side by side** (Steve 2026-10-09): ambient ticks/mosquitoes are
background flavor — tiny per-step attach chance in woods/thicket (narrated,
visible as "Tick attached," never silent), ambient mosquito bites at
dusk/night in wetlands. They carry only the mild generic Fever: mosquitoes
1.5% per part; an attached tick rolls once per day with an ESCALATING chance
(day 1: 3%, +3%/day, capped 15% — never guaranteed). Removal needs light
medical knowledge: the `tick_removal` technique (taught by a camp healer
within a couple days), or triage/field_medicine/herbal_remedy. Blind removal
is allowed but 40% botches (head stays in → wound_fever). A mundane deer tick
attaches an ambient tick — it NEVER gives Lemons. The map-visible giants
(giant_mosquito, alien_tick) are the monster fights that carry the alien
viruses.

Min-maxing is welcome: some players will avoid these at all costs, others
will seek infection to boost their build.

## Change log

- 2026-10-09: Trembles added to the mundane pool (kuru/prion analogue, Steve's corruption system). Vector: human meat, 15% per meal. Cooking does not kill prions — nothing does. No cure exists at any tier; slow (40 day-parts) and certain. The terrible bargain made biological.

- 2026-10-09: Eurika + East Nile moved back to the alien pool (they were
  misclassified as mundane mosquito viruses by the disease-rework worker, which
  had not read the 2026-10-06 design). This doc created as the single source
  of truth so the roster is never reinvented from scratch again.
- 2026-10-09: Lemons moved to the alien pool (Steve: "Lemons disease is
  supposed to be from an alien tick. Both are supposed to be monster fights").
  Rewritten as alien: achy-joint drawback + engorge/blood-sense abilities +
  ringed-rash-at-every-joint transformation, permanent warping. Giant mosquito
  + alien tick built as real map-visible monster fights (sprites, bespoke
  combat turns, wave-2 spawn). Ambient tier added side by side: tiny
  ticks/mosquitoes as narrated flavor carrying only the mild generic Fever
  (escalating daily roll 3%→15%, never guaranteed; technique-gated removal
  taught by camp healers; blind removal botch → wound_fever). All
  'tick fever'→lemons mappings remapped to the generic 'disease'.
