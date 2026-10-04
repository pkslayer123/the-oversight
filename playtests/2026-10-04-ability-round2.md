# Ability System Round-2 Test (2026-10-04)

**Method:** Node harness at commit 1529f2b, same loader as scripts/simulate.js. Phase 1: 12 deterministic mechanical test groups (T1-T12). Phase 2: 10 playthroughs x 12 days (52 part cap), 6 playstyles + mixed.

**Verdict:** 2 MECHANICAL FAILURES; 10/10 survived to day 12; 10/10 saw System arrival; 0 negative kcal/HP violations; 0 bad wild picks.

## Key findings

**1. REAL BUG — `takeFromPantry` strips cooking fields (T12b/T12c FAIL).** In `src/js/game.js`, `takeFromPantry` pushes `{ name, kcalEach, units: 1, spoilDay, safe, kg, unit }` — it drops `rawKcal`, `cookedKcal`, and `needsCooking`. Pantry beans/rice can never be cooked after taking (cookAll filters on `item.rawKcal`). This broke the cook playstyle end-to-end: run 5 (theo_park/cook) did take+cook every day but `week1.cook` stayed 0 all week, so the System offered the zero-action fallback (survivor/wanderer/lucky_rock) instead of camp_cook. Fix: copy `rawKcal`, `cookedKcal`, `needsCooking` into the pushed item.

**2. All 6 tested ability mechanics work exactly as designed.** green_thumb ×1.5/×2.0 yield, tracker +30/+50 hit chance, diplomat 2×/3× trust, camp_cook water/kcal tiers (L1 half water +10%, L2 no water, L3 +25%), generous 2× donate trust, scrounger +1 loot. Background abilities (incl. legacy string form) feed `collectModifiers`; kcal/HP floored at 0; wild first-ability picks never vile/risky/body_horror/overpowered (8 profiles × 15 rolls); zero-action fallback offers the 3 honest options.

**3. Scavenger isn't a viable week-1 identity right now (balance note, not a bug).** Run 7's scavenger never reached a ruin — ruins spawn ~5 tiles from haven, beyond the d≤3 revealed travel range — so `week1.scavenge` stayed 0 and it got the fallback. Fog-walking (d=1 unrevealed) exists but the bot didn't push. Worth a design look: either ruins spawn closer or scavenging needs a week-1 path.

**4. 10/10 survival to day 12** (vs 5/10 in round 1) — the village-meal economy holds. Ability XP accrues through use post-arrival (tracker L2, diplomat L2 observed); XP correctly does NOT accrue before the ability is granted.

**5. Open design note (carried over):** `ant_trail`, `cold_blooded`, `echo_location` are utility-tier `system_offer` abilities with no `cond` entry in `firstAbilityChoices` — they can never be first-ability picks.

## Phase 1: mechanical verification

| Test | Result | Detail |
|------|--------|--------|
| T1a green_thumb absent => x1.0 yield | PASS | r.units=19 levelMult=1 expected=19 got=19 |
| T1b abilityLevel green_thumb == 1 | PASS |  |
| T1c green_thumb L1 => x1.5 yield | PASS | r.units=21 lm=1 expected=32 got=32 |
| T1d green_thumb L2 => x2.0 yield | PASS | r.units=15 lm=1 expected=30 got=30 |
| T2a no tracker: 0.65 roll vs 0.4 base => miss | PASS |  |
| T2b tracker L1: 0.65 roll vs 0.7 chance => hit | PASS |  |
| T2c tracker L2: 0.85 roll vs 0.9 chance => hit | PASS |  |
| T3a no diplomat: talk => +3 trust | PASS | delta=3 |
| T3b diplomat L1: talk => +6 trust (2x) | PASS | delta=6 |
| T3c diplomat L2: talk => +9 trust (3x) | PASS | delta=9 |
| T4a no camp_cook: 4 beans cost 4L | PASS | water=16 |
| T4b no camp_cook: kcalEach=300 | PASS | kcalEach=300 |
| T4c camp_cook L1: 4 beans cost 2L (half) | PASS | water=18 |
| T4d camp_cook L1: kcalEach=330 (+10%) | PASS | kcalEach=330 |
| T4e camp_cook L2: 4 beans cost 0L | PASS | water=20 |
| T4e2 camp_cook L2: kcal stays +10% (330) | PASS | kcalEach=330 |
| T4f camp_cook L3: kcalEach=375 (+25%) | PASS | kcalEach=375 |
| T5a no generous: 600kcal donate => +1 trust | PASS | gain=1 |
| T5b generous L1: 600kcal donate => +2 trust (2x) | PASS | gain=2 |
| T6a no scrounger: ruin visit => 1 item | PASS | items=1 |
| T6b scrounger L1: ruin visit => 2 items | PASS | items=2 |
| T7a background object abilities feed collectModifiers | PASS | mods=3 |
| T7b hasAbility finds background triage | PASS |  |
| T7c abilityLevel background triage == 1 | PASS |  |
| T7d legacy string IDs still work | PASS |  |
| T7e hasAbility works with string IDs | PASS |  |
| T7f unknown ability => level 0 | PASS |  |
| T8a kcal floored at 0 | PASS | kcal=0 |
| T8b health floored at 0 | PASS | hp=0 |
| T9a zero-action => 3 honest fallback options | PASS | got=lucky_rock,survivor,wanderer |
| T9b wild pick never vile/risky/body_horror/overpowered/combat/social | PASS |  |
| T9c forager offered green_thumb | PASS | got=green_thumb,taste_vision |
| T9d hunter offered tracker | PASS | got=tracker,dowsing |
| T12a pantry has raw staples | PASS | pi=0 |
| T12b taken beans keep rawKcal/needsCooking/cookedKcal | FAIL | rawKcal=undefined needsCooking=undefined cookedKcal=undefined |
| T12c taken beans cook to >=300 kcal | FAIL | kcalEach=150 rawKcal=undefined |
| T11 all 6 week1 counters increment | PASS | {"forage":1,"hunt":1,"talk":1,"cook":1,"donate":1,"scavenge":1} |

## Phase 2: playthroughs

| # | Char | Style | Days | Survived | Arrival | Choices | Chosen | End abilities | NegViol |
|---|------|-------|------|----------|---------|---------|--------|---------------|----------|
| 1 | mara_okafor | forager | 12 | Y | 8 | green_thumb(utility), pocket_sand(wacky) | green_thumb | green_thumb L1 (3xp) | 0 |
| 2 | jesse_calhoun | hunter | 12 | Y | 8 | tracker(utility), pocket_sand(wacky) | tracker | tracker L2 (6xp) | 0 |
| 3 | aki_tanaka | forager | 12 | Y | 8 | green_thumb(utility), pocket_sand(wacky) | green_thumb | green_thumb L1 (6xp) | 0 |
| 4 | ruth_delgado | talker | 12 | Y | 8 | diplomat(utility), taste_vision(wacky) | diplomat | diplomat L2 (22xp) | 0 |
| 5 | theo_park | cook | 12 | Y | 8 | survivor(utility), wanderer(utility), lucky_rock(underpowered) | survivor | survivor L1 (0xp) | 0 |
| 6 | priya_nair | donor | 12 | Y | 8 | green_thumb(utility), generous(utility), lucky_rock(underpowered) | green_thumb | green_thumb L1 (8xp) | 0 |
| 7 | jesse_calhoun | scavenger | 12 | Y | 8 | survivor(utility), wanderer(utility), lucky_rock(underpowered) | survivor | survivor L1 (0xp) | 0 |
| 8 | mara_okafor | mixed | 12 | Y | 8 | green_thumb(utility), tracker(utility), rain_dancer(wacky) | green_thumb | green_thumb L1 (0xp) | 0 |
| 9 | theo_park | hunter | 12 | Y | 8 | tracker(utility), compost_king(wacky) | tracker | tracker L2 (6xp) | 0 |
| 10 | aki_tanaka | mixed | 12 | Y | 8 | green_thumb(utility), tracker(utility), scream_cheese(wacky) | green_thumb | green_thumb L1 (3xp) | 0 |

**Background abilities:**

- Run 1 (mara_okafor): triage L1, steady_hands L1
- Run 2 (jesse_calhoun): game_sense L1, patient_aim L1
- Run 3 (aki_tanaka): field_dressing L1, preservation_instinct L1
- Run 4 (ruth_delgado): (none)
- Run 5 (theo_park): (none)
- Run 6 (priya_nair): (none)
- Run 7 (jesse_calhoun): game_sense L1, patient_aim L1
- Run 8 (mara_okafor): triage L1, steady_hands L1
- Run 9 (theo_park): (none)
- Run 10 (aki_tanaka): field_dressing L1, preservation_instinct L1

**week1 counters at arrival:**

- Run 1 (forager): {"forage":15,"hunt":0,"talk":0,"cook":0,"donate":0,"scavenge":0}
- Run 2 (hunter): {"forage":0,"hunt":28,"talk":0,"cook":0,"donate":0,"scavenge":0}
- Run 3 (forager): {"forage":22,"hunt":0,"talk":0,"cook":0,"donate":0,"scavenge":0}
- Run 4 (talker): {"forage":0,"hunt":0,"talk":56,"cook":0,"donate":0,"scavenge":0}
- Run 5 (cook): {"forage":0,"hunt":0,"talk":0,"cook":0,"donate":0,"scavenge":0}
- Run 6 (donor): {"forage":19,"hunt":0,"talk":0,"cook":0,"donate":9,"scavenge":0}
- Run 7 (scavenger): {"forage":0,"hunt":0,"talk":0,"cook":0,"donate":0,"scavenge":0}
- Run 8 (mixed): {"forage":6,"hunt":8,"talk":22,"cook":0,"donate":0,"scavenge":0}
- Run 9 (hunter): {"forage":0,"hunt":28,"talk":0,"cook":0,"donate":0,"scavenge":0}
- Run 10 (mixed): {"forage":8,"hunt":5,"talk":22,"cook":0,"donate":0,"scavenge":0}

**Negative violations:** (none)

**Bad wild picks (vile/risky/body_horror/overpowered as first-ability wild):** (none)
