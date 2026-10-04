# Ability Mechanics Pass — Implementation Report (2026-10-04)

**Commit:** `5745fe9` ("make all abilities mechanically real + metabolic costs")
**Method:** Node harness, direct mechanic verification + 5 sims × 5 days.

## What was done

All 60 abilities (62 incl. fallbacks) now have real mechanical effects. Previously: 41 narrative-only, 12 with modifier targets nothing read.

### Engine
- `modifiers.js`: `scale:'level'` (multiply → value^level, add → value×level); loose condition compare (`round:1` works with numeric ctx).
- `game.js`: `mods()`, `modTarget(target, base, ctx)`, `metabolicDaily()`, `maxHealth()`.
- `metabolicMult` reads data-driven `metabolic.eatMult` (legacy fire/god name-check kept as fallback).

### 25+ new modifier targets wired into game code
forage.gift_chance / rare_find_chance / learn_threshold · hunt.find_chance / meat_yield / trap_catch · food.poison_chance / spoilage_days / eat_target_mult · healing.amount · craft.success (craft can now fail at 85% base) · travel.encounter_chance / cost_mult · trust.gain_mult · monster.detect_chance / hear_mult · ruin.find_mult · luck.global · armor.flat · carry.weight_mult · health.max_add · drama.resolve_bonus · water.rain_catch · combat.dodge_chance

### Special-case abilities (real code, not just numbers)
- Combat: patient_aim → pipeline (round:1); scream_cheese (stun 1/day, SCREAM button); pocket_sand (blind 2 rounds); fear_aura (hesitate 1 round); rage (×2 dmg <50% HP, can't flee, -20 kcal/round); cornered_rat (×2 dmg +dodge <30%); dead_aim (study r1 → crit r2 ×2.5).
- Death: second_wind (1/day → 1 HP + 500 kcal); phoenix_clause (1/run explode + respawn Haven); molt (1/week auto full-heal, lose equipped gear).
- Activatable (inventory → Abilities): blood_magic (-10 HP → +500 kcal); time_skip (skip part, age 1 day); dowsing (70% reveal water); echo_location (reveal 3×3, 1/day); compost_king (bury food → +10% tile); cannibal_frenzy (starving only: +1000 kcal, -30 trust all).
- Daily procs: ant_trail (30% +1L water); cold_blooded (cold days: +440 kcal); symbiote (purify 1L/day + poison warnings); photosynthesis (+100 kcal/daylight part); rain_dancer (+1L when raining).
- Passive: thief (50% clean steal); grave_robber (corpse loot); leech (absorb half ally damage, +5 trust); eyes_in_back (no ambush); bird_whisperer/third_eye (detect & avoid); hive_mind (reveal all map, -10 trust); open_book (true trust in status); mediator (drama auto-resolve +trust); beard_moss (boil anywhere); taste_vision (ruin bonus); squirrel_friend (nut gifts); loud_chewer (2× hear, +5 energy); chitin_skin (+30 armor, 0.8 trust); extra_stomach (2× eat target, 2200/day metabolic); hollow_bones (0.7 weight); hoarder (0.8 trust, +10 carry already); poisoner/scarecrow (trap ×1.5/×2).
- On-acquire: pact (gain random OP, lose random utility); chitin_skin (-5 trust); fear_aura/hive_mind (-10 trust).

### Metabolic costs (conservation of energy)
Every System ability drains kcal/day: utility 25–50, wacky 25–50, combat 50–75, social 50, vile 75–100, body horror 100–150 (extra_stomach 2200 — the trade is the fiction), risky 100–200, overpowered 150–300. Background abilities free. Drained nightly in endDay; offer UI shows `🔥 Costs N kcal/day`.

### Weather
Clear/rain/cold rolled each morning (70/20/10).

## Verification
- Mechanic spot-checks: patient_aim 22 dmg r1 → 10 r2 ✓; dead_aim crit 30 ✓; rage blocks flee ✓; second_wind cheats once/day ✓; pact net-0 swap ✓; blood_magic -10/+500 ✓; maxHealth 110 w/ survivor ✓; metabolicDaily sums ✓.
- 5 sims × 5 days, random System ability each: 0 crashes, 0 negative values.
- `node --check` clean on all files. `CONTENT GATE: OK` (62 abilities).
