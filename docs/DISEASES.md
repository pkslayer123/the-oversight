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

## Mundane pool (5) — real diseases

| id | Name | Real analogue | Vector |
|----|------|---------------|--------|
| gutrot | Gut Rot | gut parasite | raw food, risky water, dirty hands |
| trichinosis | Trichinosis | trichinosis | undercooked bear/boar meat (only `cooked` clears it; smoking doesn't) |
| lemons | Lemons | Lyme disease | tick bites (ringed rash tell; can go chronic in joints) |
| lockjaw | Lockjaw | tetanus | dirty wounds, rust (spasms; lethal untreated) |
| wound_fever | Wound Fever | infected wound | open cuts left dirty |

Diseases never announce their names — only symptoms. Diagnosis (triage /
field_medicine / herbal_remedy, herb lore, stethoscope, or a medical villager)
unlocks the true name, class, and cure direction. Cure tiers per disease:
folk remedies (anyone, uncertain) → occupation medicine → specific ruin
medicine → earned healer deepenings → the Fever's End synergy (true cures).

## Alien pool (8) — alien effects

| id | Name | Vector | Drawback | Ability | Transformation |
|----|------|--------|----------|---------|----------------|
| howlbelly | Howlbelly | hushwolf meat | howl at night, heard | small monsters think twice | second canine voice-box under the jaw |
| gristlefit | Gristlefit | bulldozer meat | rage fits lash out (friend or foe) | +25% strike damage | gristle braids through shoulders/neck |
| croakbelly | Croakbelly | choir toad meat | gut ribbits (-stealth) | choir toads won't start anything | vocal sac under the chin |
| shellgut | Shellgut | speedbump meat | -25% kcal absorbed | immune to ingested poison/food-borne disease | chitin plates under the skin |
| witness_maw | Witness Maw | grief counselor meat | people decide you're possessed (-trust) | night half as dark | black tear ducts, reflective eyes |
| flockmind | Flockmind | duck-line meat | quack when startled, no surprise | duck-lines won't start anything | down feathers on the forearms |
| eurika | Eurika | **giant mosquito bite** | sensory static (1 HP/part, world never turns down) | mosquito-sense: ambushes announce themselves | faceted eye patches, sensory hairs |
| east_nile | East Nile | **giant mosquito bite** | fever dreams (2 HP/part) | the crows warn you: directional danger sense | hollow bones, black pinfeathers |

Eurika and East Nile are the original alien diseases (Steve 2026-10-06/09):
unhinged virus versions that cause **permanent biological warping** — they do
not expire on their own. Low contraction chance (~2% per dusk/night part in
wetlands, 50/50 which virus). Plain mosquitoes are just mosquitoes (itchy,
nothing more) — the shock is that they're just bugs; the giant ones are
"massive freakish" but still called plainly "mosquitoes."

Min-maxing is welcome: some players will avoid these at all costs, others
will seek infection to boost their build.

## Change log

- 2026-10-09: Eurika + East Nile moved back to the alien pool (they were
  misclassified as mundane mosquito viruses by the disease-rework worker, which
  had not read the 2026-10-06 design). This doc created as the single source
  of truth so the roster is never reinvented from scratch again.
