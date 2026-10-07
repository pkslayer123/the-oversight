# Relic enhancements depth — 23 → 32 (worker B, 2026-10-07)

## What was added
9 new entries in `src/data/relicEnhancements.json`, weighted to the smallest class:

**Clothing 6 → 12** (pool doubled):
- `many_pockets` — Many Pockets — carry.weight_mult ×1.15 (seventeen pockets, everything has a place)
- `forest_scent` — Forest Scent — monster.detect_chance −0.08 — hidden/rare 0.3, affinity playstyle:solitary
- `warm_bones` — Warm Bones — travel.cost_mult ×0.9 — affinity temperament:steady
- `stay_put` — Stay-Put Bandages — healing.amount +4
- `rain_funnel` — Rain Funnel — water.rain_catch +1 (funnels storm rain into your bottle)
- `light_feet` — Light Feet — combat.dodge_chance +0.05 — affinity temperament:bold

**Tool 8 → 10**:
- `butchers_friend` — Butcher's Friend — hunt.meat_yield ×1.15 — affinity temperament:cautious
- `smoke_keeper` — Smoke Keeper — food.spoilage_days +1 (pack-sized smoker)

**Sentimental 9 → 10**:
- `calm_stone` — Calm Stone — drama.resolve_bonus +4 — hidden/rare 0.35 (smooth from years of thumbs)

## Key design decision: engine-honest effect.targets
The existing entries use evocative `effect.target` values (task.speed, weather.immunity, …)
that are NOT consumed anywhere — the real application path is
`RELIC_MOD_MAP` in `src/js/engine/modifiers.js` (id → engine targets), read by
`collectModifiers()` and applied via `modTarget()`/`resolve()`. Verified by grep:
every target I used has ≥1 real consumption call site
(carry.weight_mult, monster.detect_chance, travel.cost_mult, healing.amount,
water.rain_catch, combat.dodge_chance, hunt.meat_yield, food.spoilage_days,
drama.resolve_bonus). My 9 entries declare the engine targets directly, so the
JSON effect is exactly what the engine will apply once wired — no dead mechanics.

## Balance rationale
- Multiplies are mild (1.15, 0.9); adds are small (+4 healing on base 30,
  +0.05 dodge, −0.08 detect, +1 rain liter, +1 spoil day, +4 drama bonus on base 8).
- Min-maxing welcome: forest_scent stacks multiplicatively with existing
  detect-reducers; many_pockets ×1.15 carry is a real but bounded logistics win.
- No true infinite exploits: no diminish-group bypasses, no compounding loops,
  values can't chain into each other.
- Semantics checked against call sites: monster.detect_chance and
  combat.dodge_chance use base 0 → must be `add` (multiply would no-op);
  travel.cost_mult uses base 1 → `multiply` is correct.

## Voice notes (alien System)
Kept the established voice: joyous, genuinely trying its best, twisted and out
of touch — never generic. Examples: "The clouds have not consented. We did not
ask." / "The bacteria have filed a complaint. Denied." / "You smell like a
Tuesday in the woods. This is a compliment." Descriptions leak no unearned
knowledge — numbers live in systemCommentary (the System's voice), never in
what the player reads as fact.

## ⚠ PENDING: RELIC_MOD_MAP wiring (9 lines, mechanical)
New ids are fully specified and pipeline-proven, but they are NOT yet in
`RELIC_MOD_MAP` in `src/js/engine/modifiers.js`, so `collectModifiers()` won't
pick them up in-game. That file was sibling-dirty (staged + worktree changes),
so per worker rules I did not touch it. The exact lines to add (inside the
`RELIC_MOD_MAP` literal):

```
    many_pockets: [{ target: 'carry.weight_mult', op: 'multiply', value: 1.15 }],
    forest_scent: [{ target: 'monster.detect_chance', op: 'add', value: -0.08 }],
    warm_bones: [{ target: 'travel.cost_mult', op: 'multiply', value: 0.9 }],
    stay_put: [{ target: 'healing.amount', op: 'add', value: 4 }],
    rain_funnel: [{ target: 'water.rain_catch', op: 'add', value: 1 }],
    light_feet: [{ target: 'combat.dodge_chance', op: 'add', value: 0.05 }],
    butchers_friend: [{ target: 'hunt.meat_yield', op: 'multiply', value: 1.15 }],
    smoke_keeper: [{ target: 'food.spoilage_days', op: 'add', value: 1 }],
    calm_stone: [{ target: 'drama.resolve_bonus', op: 'add', value: 4 }],
```

Side finding: `travel.kcal` (used by existing weatherproof/storm_cloth/
steady_ground mappings) has NO `modTarget`/`resolve` call site outside the map
itself — those three existing enhancements are currently inert. Flagging for a
follow-up worker, not touched here.

## Test results
`scripts/test-relic-enh-depth-20261007.js` — plain node, mulberry32-seeded,
SEED env override. 454 PASS, 0 FAIL, exit 0 on seeds 1, 2, 3.
Covers: schema shape ×32, unique ids, class counts (12/10/10), ops ∈
{add,multiply}, finite values, no-dead-mechanics (every id reaches a consumed
target: wired / game.js special-case / declared-consumed), functional
application of all 9 new + 3 legacy effects through the REAL `resolve()` from
`src/js/engine/modifiers.js`, `describeTarget` handling for all 32 targets, and
a seeded mirror of the 1-of-3 offer draw proving every non-secret new id is
reachable (hidden/rare ones provably rarer). The pending-wiring manifest is
printed as a loud WARN, not a silent skip.

---

# Relic enhancements depth — 32 → 48 (worker A, 2026-10-07)

## What was added
16 new entries appended to `src/data/relicEnhancements.json` (APPEND-ONLY — first 32 byte-identical vs HEAD, verified by proof test). Class split evened out: tool 10→16, clothing 12→16, sentimental 10→16.

**Tool (+6):** true_measure (craft.success ×1.15, affinity cautious), patient_wire (hunt.trap_catch +0.08, hidden/rare 0.3, affinity solitary), glass_eye (hunt.find_chance +0.10), hot_stone (cook.kcal ×1.1), field_guide (forage.learn_threshold ×0.9), tasters_spoon (food.poison_chance ×0.7)

**Clothing (+4):** grey_cloak (travel.encounter_chance ×0.75, affinity steady), winter_lining (travel.cost_mult ×0.92), quiet_soles (monster.hear_mult ×0.85, hidden/rare 0.3, affinity solitary), spare_plating (armor.flat +2, affinity bold)

**Sentimental (+6):** lucky_coin (luck.global ×1.15, affinity bold), come_home (health.max_add +10), ledger_of_debts (drama.resolve_bonus +5), hearth_song (rest.energy ×1.2), mothers_compass (trust.gain_mult ×1.3), harvest_memory (forage.gift_chance +0.05)

## Engine-honesty verification
All 16 new JSON effects use targets with ≥1 REAL consumption call site (modTarget/resolve across src/js), scraped by the proof test itself: craft.success (game.js:2953), hunt.trap_catch (3049), hunt.find_chance, cook.kcal (game.js:8500 resolve), forage.learn_threshold, food.poison_chance, travel.encounter_chance (13084), travel.cost_mult (7151), monster.hear_mult (14800), armor.flat, luck.global (8892), health.max_add (15197), drama.resolve_bonus (14200), rest.energy (14582), trust.gain_mult (15212), forage.gift_chance (14517). Semantics checked: zero-base targets (hunt.find_chance, armor.flat, drama.resolve_bonus, health.max_add, forage.gift_chance) use `add`; unit-base targets (mults) use `multiply`. No travel.kcal entries — confirmed inert per the earlier side finding.

## Secrets: deliberately skipped
Secret evolutions trigger only via items.json `secretEvolution` referencing the enhancement id (bond 50, 65% chance, unnamed 4th option). No item def references any new id and src/js + items.json are off-limits to this worker, so a new secret:true entry would be unreachable (excluded from the normal pool). Skipped per the verified-trigger rule.

## ⚠ PENDING: RELIC_MOD_MAP wiring (now 25 ids, mechanical)
Same follow-up as worker B's: the map in src/js/engine/modifiers.js covers only 21 of 48 ids. The 16 new JSON effects declare engine-consumed targets directly, so the map entries are a straight port of the JSON {op,target,value} values (listed above). Until wired, `collectModifiers()` won't pick up the new ids in-game — nothing is a placebo in the data, but the engine half is pending a sibling with src/js access.

## Test results
scripts/test-relic-enhancements-20261007.js — ALL GREEN. Covers: parses, exactly 48, first 32 deep-equal HEAD, ids unique, class split 16/16/16, all new effects on scraped engine-honored targets (32-target allowlist from applier code; old 32 grandfathered — their evocative targets are documented, real behavior via RELIC_MOD_MAP/special-cases), no empty strings, schema-conformant. validate-data.js: 0 relicEnhancements errors (its 629 errors are pre-existing animals.json etc.).
