# Break-it: diseases (2026-10-09)

Target: disease system — mundane/alien two-pool law, vectors, cures, diagnosis,
trembles certainty, tick/mosquito honesty, dead-code wiring.
Canon: docs/CANON.md + docs/DISEASES.md (read first; roster not reinvented).

## Attacks attempted

### EXPLOIT
- **E1 — bulk-Eat cannibalism bypass.** `eatOne()` routes `meat_human` through
  `eatCannibal()` (trauma, corruption, 15% trembles roll), but the bulk meal
  `eat()` had no such routing: human meat eaten via the Eat button was silent
  calories — no trauma, no corruption, no prion roll. **BROKE.** Fixed: `eat()`
  routes `meat_human` through `eatCannibal()` (src/js/game.js). Proof:
  scripts/test-disease-breaks-20261009.js B1 (BEFORE: silent eat confirmed).
- **E2 — trembles wait-out.** Trembles ("no cure at any tier; slow (40
  day-parts) and certain") simply expired after 40 day-parts like a cold, and
  the expireText ("it never lets go") lied about the engine. A 10-day debuff,
  not a death sentence. **BROKE.** Fixed: at expiry the bearer dies of the
  trembles (mantle passes; phoenix death-cheat still holds at the threshold),
  with a ~2-day late warning ("settle what matters"). Proof: B3 (BEFORE:
  harmless expiry confirmed).
- **E3 — time-skip shortening trembles.** `sickRestTick` (sleep) and
  `folkRemedy` slow-rolls only shorten `folk:'slow'` diseases; trembles is
  `folk:'no'`. **HELD** — no sleep/cryo exploit exists.
- **E4 — infection-seeking min-max (stack all 9 alien).** Drawbacks are real:
  eurika+east_nile+lemons = 4 HP/part drain + energy x0.85 + fever dreams +
  sensory static; gristlefit rages hit friend-or-foe; witness_maw costs -2
  trust from everyone on contraction. **HELD** — stacking is a genuine trade,
  as Steve intends ("min-maxing is welcome").
- **E5 — cure alien via mundane medicine.** All treatment paths
  (`treatDisease`, `useMedicine`, folk remedies) iterate `sickDiseases()`,
  which filters via `seIsDisease()` (mundane only). `cureEffectFor` on alien
  defs returns 'no'. **HELD.**
- **E6 — tick removal farming.** `removeTick()` grants nothing (no XP/items).
  **HELD.**

### SOFTLOCK
- **S1 — undiagnosable lockjaw death spiral.** Diagnosis reachable via
  triage/field_medicine/herbal_remedy, herb lore, stethoscope, or a medical
  villager's auto-diagnosis (`villagerDiagnosisTick`); treatment via
  antibiotics/ruin medicine; lockjaw's own damage (~48 HP over 16 parts, vector
  requires HP<40) enforces "lethal untreated" for the wounded while care can
  save you. **HELD** — agency paths exist at every step.
- **S2 — tick_removal teaching.** `villagerTickTeachTick()` runs in the daily
  villager block; a camp healer teaches at ~50%/day (≈2 days expected). With no
  healer, blind removal is always available (40% botch → wound_fever, the
  honest fallback). **HELD** — never a dead promise, never a softlock.
- **S3 — tick narration spam.** Attach (2%/part in brush) and mosquito flavor
  (12%/part at dusk in wetlands) narrate once per event, not per part.
  **HELD.**

### HONESTY (copy vs engine)
- **H1 — undercooked trichinosis.** Cook paths set `foodState='cooked'` even on
  undercooked outcomes while the eat-path gated `parasiteRisk` on
  `foodState !== 'cooked'` — the prep text said "still risky" but the engine
  skipped the worm roll. **BROKE.** Fixed: undercooked flags the item
  (eat-path rolls on `undercooked`); cooked-through deletes `parasiteRisk`
  outright. Proof: B2a (BEFORE: roll skipped confirmed).
- **H2 — cooked→smoked resurrection.** Smoking set `foodState='preserved'`,
  re-arming a stale `parasiteRisk` on previously-safe cooked bear meat.
  **BROKE** (sibling of H1). Fixed: proper cooking deletes `parasiteRisk`
  ("Cooking to 160°F kills it" — diagnosedDesc); smoking can't resurrect it.
  Proof: B2b.
- **H3 — smoking raw bear meat.** `foodState='preserved'` keeps `parasiteRisk`;
  eat-path rolls. "Smoking doesn't clear it, only cooked does." **HELD.**
- **H4 — mosquito 50/50 second virus.** Inline guard
  (`!hasStatus(eurika) && !hasStatus(east_nile)`) blocked the second virus
  outright, contradicting the per-bite 50/50 framing. **BROKE.** Fixed:
  `mosquitoBiteVirus()` excludes only the held virus. Proof: B4 (BEFORE:
  helper absent / guard confirmed by code read).
- **H5 — mosquito 50/50 real.** `Math.random() < 0.5` per landed bite;
  60-bite distribution sane in test. **HELD.**
- **H6 — tick cap 15% / 40% botch.** `Math.min(0.03+0.03*(daysOn-1), 0.15)`
  enforced; blind removal `Math.random() < 0.6` → 40% botch real. **HELD.**
- **H7 — ambient vectors never leak alien.** Ambient mosquito/tick use
  `contractDisease('disease')`, which refuses non-mundane; deer-tick attach →
  `tick_attached` → only generic Fever. **HELD.**
- **H8 — cooking vs trembles.** `eatCannibal()` has no cooking check; prions
  don't cook out. **HELD.**
- **H9 — "diseases never announce their names".** Mundane apply/tick/expire
  texts and pre-diagnosis descriptions are name-free; UI labels show
  `symptomLabel` until diagnosed. Alien names show in status chips — held as
  intended (alien pool is "never diagnosed"; transformations are visible body
  horror). **HELD.**

### DEAD-CODE
- **D1 — statusEffects.js loaded in index.html** (line 61, after game.js;
  `Object.assign` onto Game). Not another Alien-Players. **HELD.**
- **D2 — every pooled def reachable:** gutrot (creek water), trichinosis
  (bear/boar `parasiteRisk`), disease (ambient), lockjaw/wound_fever (wounds,
  botched removal), trembles (cannibalism), tick_attached (brush, deer hide),
  6 meat-quirks (`monsterDiseases` table; all 6 source monsters exist),
  eurika/east_nile (giant-mosquito bite branch), lemons (alien-tick latch).
  **HELD.**
- **D3 — two-pools enforced live:** `seIsDisease()` admits mundane only;
  `contractDisease()` refuses alien; alien vectors use `applyStatus` directly.
  **HELD.**
- **D4 — giant_mosquito / alien_tick are real fights:** wave-2 defs in
  monsters.json, behaviors in monsterBehaviors.json, bespoke `tbMosquitoTurn`/
  `tbTickTurn` dispatched in the combat turn loop, calm/aggro sprites, spawned
  via `maintainWorldMonsters()` ← `monsterWavePool()` (wave-gated).
  **HELD.**
- **D5 — no calls to undefined functions** in the disease paths (seRemove,
  diagnoseOdds, campHealerName, grantKnowledge, mosquitoBiteVirus all defined).
  **HELD.**

## Sibling sweep
- Undercooked meat was a **dead-end item** (couldn't go back on the fire):
  `cookFood`, batch cook, and the specialist cook now accept `undercooked`
  meat for re-cooking. Proof: B2d.
- Swept the "bulk path bypasses special routing" class: `eat`, `eatOne`
  (wrapper), corpse-loot `eatOne`, guest meals (pantry-kcal, no items) — all
  clean.
- Lockjaw "lethal untreated": left as damage-enforced (~48 HP over 16 parts
  against the <40 HP wound vector); expiry = the body fought it off. Judgment
  call, noted not changed.

## Proof
`scripts/test-disease-breaks-20261009.js` — 26 checks, BEFORE/AFTER modes.
AFTER: **26/26 × 3 seeds** (7, 4242, 99991). BEFORE: all four breaks reproduce
(silent cannibal eat, skipped worm roll, harmless trembles expiry, blocked
second virus).
Regression: test-disease-pools (66/66), test-disease-rework (53/53),
test-status-effects (51/51), test-monster-diseases (pass),
test-parity-disease (5/5) green. test-break-food-r4 (3 fails) and
test-food-reality (6 fails) fail identically on the pristine baseline —
pre-existing, unrelated.

## Commit
`break-it disease r10` [needs-eyes] — src/js/game.js, src/js/food.js,
src/js/statusEffects.js, scripts/test-disease-breaks-20261009.js,
evidence/2026-10-09/break-diseases.md. Merged locally, pending ship.
[needs-eyes]: the trembles-certainty change makes cannibalism a real death
sentence (canon), and the mosquito change lets min-maxers hold both viruses —
Steve may want a playtest feel check.
