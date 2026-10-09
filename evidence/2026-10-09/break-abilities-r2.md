# Break-it ABILITIES r2 — modifier-pipeline honesty + slot economy (2026-10-09)

Second rotation pass on target 12 (abilities & godhood). The kickoff (break-godhood-kickoff.md)
covered the death-cheat stack; this run attacked the modifier pipeline, the 6-slot
economy, synergy copy-vs-engine, and dead data. Hostile, depth-first.

Canon read first: docs/CANON.md, docs/SYSTEMS.md, docs/ENDGAME-BUILDS.md.
Prior work built on, not re-attacked: break-godhood-kickoff.md (G1–G6, H1–H4),
af62f4a5 (synergy wiring), 238b3805 (villager XP grants), c1b3484b/143c8c4a (phoenix rework).

## Catches (all fixed + proven)

### B1. EXPLOIT — pact's gift broke the 6-slot cap (the only hole in the economy)
`abilityOnAcquire('pact')` pushed the Static's gift with NO slot check. Hostile
scenario: hold 5/6 slots with no utility-tier ability, take pact (slot-checked 5→6),
the Static gives an overpowered ability and takes nothing → **7/6**.
Every other acquisition path is capped (chooseAbility, completeTrial,
villagerGainXP/NPC_MAX_ABILITIES). Fix: give+take are one transaction — the gift
lands only if the post-take count fits `abilitySlots()`; otherwise the offer
dissolves honestly and the Static takes nothing. (game.js)

### B2. EXPLOIT/HONESTY — collectModifiers fired INACTIVE synergy modifiers
`collectModifiers` read `scholar.synergies` (discovered), ignoring
`activeSynergies`. Lose a leg — pact's Static taking it, `loseAbilityXP`
dropping it below minLevel — and the synergy's modifiers kept applying while
the card promised "active only while held". Proven: crimson_circuit's
healing ×1.3 persisted after losing leech. Fix: honor `activeSynergies`
(fallback: discovered, for pre-resonance states; recompute runs on load).
(modifiers.js)

### B9. EXPLOIT — synergy modifiers were DOUBLE-COUNTED
af62f4a5 wired synergy collection into `collectModifiers` but left the old
`synergyMods()` concatenation inside `mods()`: every active synergy's
modifiers applied TWICE (crimson_circuit healing ×1.3 → ×1.69; cornered_fury
×1.25 → ×1.5625; the kickoff's "max ×7.14 alpha" was really ~×9).
Fix: `synergyMods()` deleted; `collectModifiers` is the single collection
path. Sibling-swept: no other `.concat(collectModifiers)` sites. (game.js)

### B3. HONESTY — travel.kcal was a dead target (3 synergies + 3 relics lied)
`travel.kcal` has ZERO engine consumers (the engine reads `travel.cost_mult`).
efficient_machine, trailblazers_promise, green_highway and relic enhancements
weatherproof, storm_cloth, steady_ground promised cheaper travel and did
nothing. Fix: producers retargeted to `travel.cost_mult`. (synergies.json, modifiers.js)

### B4. HONESTY — heal_bonus mapped to a dead target
KNOWLEDGE_MOD_MAP emitted `heal.amount`; the engine reads `healing.amount`.
Every knowledge skill granting heal_bonus was silently void. Fix: map to
`healing.amount`. (modifiers.js)

### B5. HONESTY — pyrokinesis and fire_rain were dead
Pyrokinesis's card: "Fires you tend burn hotter and catch easier." Its
fire.success/fire.heat modifiers were never read by makeFire; knowledge skill
fire_rain's fire_success/fire_heat likewise. Fix: makeFire adds fire.success
to the friction lottery; fire.heat banks +25% burn per point on every fire
light/feed (makeFire, lightTentFire, feedTentFire, feedFire) — documented
conversion, since "hotter" had no existing mechanic. (game.js)

### B6. DEAD CODE — the trial gift never existed
`completeTrial` filtered gift candidates on `a.system`, a schema flag held by
ZERO abilities: "Reward: integration, and a gift" always delivered no gift.
Dead from birth (present in the file's first commit). Fix: filter
`unlock.type === 'system_offer'`; slot check retained. (progression.js)

### B7. DEAD CODE — ant_trail: stale ability references after the skill move
Steve's 725a49c7 moved ant_trail (ability) → knowledge skill. Two corpses:
the `ant_trail` cond key in firstAbilityChoices (no such ability — dead) and,
worse, `hasAbility('ant_trail')` gating the water-seep mechanic (could never
be true — the seep-finding died silently). Fix: cond key removed; the mechanic
now checks the ant_trail SKILL level. Sibling-swept the other 3 movers
(forage_identification, taught_hands, pattern_recognition): no stale
hasAbility refs. (game.js)

### B8. DEAD CODE — abilityLevelBonus L4/L5 blurbs
gainAbilityXP caps at L3; 14 abilities carried unreachable evolution copy
("MASTER: ..."). Trimmed; re-add with evolution if the cap lifts. (game.js)

## Held (attacked, resisted)

- **H5. feastburn net-positive loop** — no damage→kcal path exists (leech is
  HP-transfer, not kcal; no synergy emits food.kcal_gain); the bank is finite
  and leaks 20%/night. The loop stays dead.
- **H6. undying_fury rage persistence** — maybeCheatDeath never clears
  rageActive; mid-rage second_wind restores FULL health with rounds untouched
  ("the rage does not end" is honest); calm heals stay 1 HP.
- **H7. Mantle synergy duplication** — playerDeath never touches synergies;
  they pass with the mantle (design), never reset, re-granted, or stacked.
- **Slot economy otherwise** — chooseAbility, completeTrial, villager grants
  all slot-capped; no ability-swap path exists (nothing to exploit); the
  ability-offer modal can't strand at 6/6 (only day-7 arrival creates offers,
  slots ≥1 then).

## Reported, not fixed (design calls — wiring needs canon, not invention)

- **R1. blood_tracker** — discoverable synergy (valid requires_any paths),
  zero modifiers, zero hardcoded effect. "Wounded prey doesn't escape"
  promises a mechanic that doesn't exist. Needs a hunt-escape mechanic
  (none exists) — Steve's call.
- **R2. fire.fuel (purify_boil L2/L3 fuel_save)** — no fuel-consumption
  mechanic to hook; "saving fuel" needs a design decision.
- **R3. 32 used knowledge mechanical keys with no engine effect** (ambush_avoid,
  animal_calm, combat_crit, combat_damage, combat_focus, conflict_resolve,
  craft_quality, desertion_resist, disease_resist, fear_resist, forage_find,
  grief_recover, hunt_find, lie_detect, morale_boost, night_hunt, night_spot,
  party_coord, party_damage, scavenge_find, scout_find, shelter_warmth,
  spoil_slow, storm_warning, system_favor, system_hide, tool_decay_slow,
  trap_success, travel_lost, trust_read, village_morale). Skills are earnable;
  effects are void — 12 lack even a map entry (silently skipped by
  collectKnowledgeModifiers), 20 map to dead targets. Design backlog, not a
  silent fix.
- **R4. 12 data-declared ability actions with no impl** (molt.shed_skin,
  scream_cheese.scream, pocket_sand.throw_sand, grave_robber.rob_grave,
  echo_location.echo_locate, mediator.mediate_dispute, leech.leech_stance,
  scarecrow.stage_injury, purify.purify_poison, peacemaker.walk_in,
  peacemaker.make_friends, water_breathing.dive_deep). They fail HONESTLY
  ("isn't wired up yet — this is a bug, not a feature. Nothing spent.") —
  loud dead ends, left for content work.
- **O3. refuses_death card** ("recharge twice as fast" vs twice as many
  uses/period) — roughly equivalent for daily cooldowns; honest enough, noted.
- **O4. ability offer modal** is non-dismissible by design; a full-slot offer
  can't currently arise (only day-7 arrival creates offers). Defensive note
  only.

## Proof
`scripts/test-break-abilities-20261009b.js` — **214/214 × 3 seeds**
(20261009/777/424242). Pre-fix run: 176/211 (35 failures demonstrating
B1–B9; B2's setup assert also catches the B9 double-count).
Regressions: test-break-godhood-20261009.js 94/94, test-phoenix-rework-20261009.js
67/67, test-phoenix-gear-20261009.js 42/42, ontology validator 52/52.
validate-data.js crashes identically on HEAD (pre-existing events.json loader
failure — out of scope).

## Files
- `src/js/engine/modifiers.js` — collectModifiers honors activeSynergies;
  RELIC_MOD_MAP travel.kcal→travel.cost_mult (×3); heal_bonus→healing.amount
- `src/js/game.js` — pact slot guard (giftFits); synergyMods() deleted (B9);
  fire.success/fire.heat wired (makeFire, lightTentFire, feedTentFire,
  feedFire); ant_trail → skill gate; abilityLevelBonus L4/L5 trimmed
- `src/data/synergies.json` — travel.kcal→travel.cost_mult (×3)
- `src/js/progression.js` — trial gift filter `a.system`→`unlock.type==='system_offer'`
- `scripts/test-break-abilities-20261009b.js` — proof (214/214 ×3)
- `evidence/2026-10-09/break-abilities-r2.md` — this file
