# Break-it: abilities & godhood (target 12) — 2026-10-10

Canon read first: docs/CANON.md, docs/ENDGAME-BUILDS.md (godhood builds),
docs/SYSTEMS.md (ability/modifier tables). No canon invented.

## Verdict: BROKE + FIXED (5 catches), rest held

Proof: `scripts/test-ability-break-20261010.js` — 33/33 green × 3 seeds
(SEED=20261010, 7, 99). Ontology gate green ("All 52 systems validated").
Adjacent suites: test-break-abilities-20261009b 215/215,
test-ability-honesty-20261009 7/7. test-ability-actions-20261007 has 1
pre-existing failure (12 unwired-but-honest actions — fails on pristine
tree too, known backlog, not mine).

## CATCHES (fixed, proven)

### 1. Build archetype system was DEAD — object-vs-ID bug (game.js)
`buildArchetype()` iterated `s.abilities` entries (OBJECTS `{id,name,...}`)
but compared `(this.data.abilities).find(a => a.id === aid)` with `aid` the
object — never matched. The entire specialist/generalist bonus system
(Steve 2026-10-07: "specializing should have rewards just like generalizing
should") NEVER fired: `buildBonus()` always null, the pack badge never
rendered, `mods()` never pushed the bonus. One-line fix: extract
`const aid = (entry && entry.id) || entry`.

### 2. Generalist "+10% to everything" applied to nothing (modifiers.js)
Even fixed, the generalist bonus used `target: 'all'` — `resolve()` only
matches exact targets, so it fired on zero resolutions. Fix: documented
engine rule — target `'all'` is a wildcard in `resolve()` (ontology header
updated, gate green).

### 3. Three abilities had fully DEAD modifiers (abilities.json)
`social.persuade`, `travel.speed`, `truth.detect_chance` were read NOWHERE
in the engine (only in the dead buildBonus poolTargets map). Silver Tongue,
Pathfinder, Lie Detector — abilities whose ONLY mechanic did nothing.
Retargeted to live channels (Steve can overrule the specific routings):
- silver_tongue: `social.persuade` +0.2/lvl → `trust.gain_mult` +0.2/lvl
  (live via trustGainMult; "words land harder")
- pathfinder: `travel.speed` ×1.2/lvl (dead) → `travel.cost_mult` ×0.85/lvl
  (live via walkStepKcal; the engine's own "travel efficiency" channel,
  same as wanderer/second_skin). L2 blurb "You travel 50% faster." was
  dishonest under the new mechanic → "Every step costs less. Distance
  shrinks."
- lie_detector: `truth.detect_chance` +0.2/lvl → `social.lie_detect`
  +0.2/lvl, WIRED into truth.js observePerson's detectChance
  (`+modTarget('social.lie_detect', 0)`, capped 0.95). Side effect: the
  KNOWLEDGE map's `lie_detect` key is live too (dead-knowledge inventory
  32 → 31; test-break-abilities-20261009b R3 updated, B4 fixed-list +1).
  L2 blurb "You catch 50% of lies." → "You catch most lies." (L2 is
  0.30+0.40=0.70).
- buildBonus poolTargets updated to match (social→trust.gain_mult,
  exploration→travel.cost_mult ×0.8 — a REDUCTION, the old ×1.25 would have
  made specialists WORSE at travel; investigation→social.lie_detect).

### 4. Stale synergies after loseAbilityXP (game.js)
`loseAbilityXP()` never called `recomputeActiveSynergies()` — a leg
dropping below minLevel kept its synergy firing. The modifiers.js header
comment names exactly this hole as the motivation for activeSynergies.
One-line fix. Sibling sweep: `completeTrial()` (progression.js) also
pushed a gift ability without recomputing — fixed too. (chooseAbility,
pact, gainAbilityXP level-up already recomputed.)

### 5. Dead Swap button (app.js)
The Abilities menu rendered a "Swap" button with NO click handler
anywhere — a fake affordance. No swap mechanic exists in canon. Removed
(button + "(swap at camp)" placeholder + unused canSwap var).

## VERIFIED HELD (2026-10-08 findings re-checked, not assumed)
- **Pact 7th-slot**: at 5/6 with no utility the gift dissolves and the
  Static takes nothing (6/6 holds); at 6/6 with a utility the give+take is
  one transaction (gift lands, one random utility taken, net 6/6). The
  2026-10-09 fix holds.
- **×1.3 synergy single-fire**: wildreader alone resolves forage.yield
  100 → exactly 130, not 169. The double-fire is gone.
- Multiplicative stacking across DIFFERENT synergies (×1.3×1.3=×1.69) is
  the documented engine design (adds, then chained multiplies) — Steve's
  "broken builds welcome" doctrine, not a bug.
- Revive caps: second_wind 1/day (2 with refuses_death), molt 1/week
  (2 with synergy), phoenix burns one villager per death; no-village death
  sticks honestly (`maybeCheatDeath` → false). Phoenix clause is NOT
  consumed for the player — canon: "the villagers ARE the cap."
- Slot ladder matches the pacing build: 20→2 / 35→3 / 50→4 / 65→5 / 80→6.
- Synergy honesty spot-checks: crimson_circuit (Blood Price 7 + healing
  ×1.3 both fire), refuses_death (swMax 2, moltMax 2), undying_fury (full
  restore ONLY with rageActive — the 2026-10-09 mere-possession fix holds).
- Dead-code: abilities.json + synergies.json loaded at init; all modules
  (modifiers, progression, abilityActions, statusEffects, truth) in
  index.html's script list; every ability/synergy modifier target now has
  an engine consumer.
- Duplicate ability entries WOULD double-apply (engine trusts the list),
  but every grant path dedupes (chooseAbility choices, trial owned-set,
  pact held-filter) — documented as attack surface, unreachable.

## REFERRED (not fixed — other targets' territory)
- **Knowledge modifier map has ~19 dead targets** (sibling sweep of the
  same bug class): `food.spoil` vs engine's `food.spoilage_days`,
  `hunt.find` vs `hunt.find_chance`, `combat.damage` vs
  `combat.strike_damage`, `health.disease_resist`, `trap.success`,
  `combat.crit`, `social.conflict_resolve`, `psych.fear_resist`,
  `village.morale`, `weather.warning`, `combat.ambush_avoid`,
  `scout.find`, `scavenge.find`, `travel.lost`, `party.damage`,
  `party.coord`, `system.favor`, `shelter.warmth`, `fire.fuel` — knowledge
  grants that no engine code reads. For the knowledge target's next run.
- **Free-step travel.cost_mult rounding**: `pathStep` charges base 2 kcal
  with `Math.max(1, Math.round(2*mult))` — every discount >0.75 rounds to
  dead (only the base-10 committed-walk path in walkStepKcal is real).
  For the travel target.
- 12 unwired-but-honest ability actions (molt.shed_skin, leech.leech_stance,
  etc.) — pre-existing backlog, fails on pristine tree.

## Design calls made (Steve: figure it out yourself; overrule welcome)
- Pathfinder retarget: cost_mult ×0.85/lvl (not a new tick mechanic).
- 'all' wildcard in resolve() (not per-target fan-out).
- Swap button removed (not implemented) — no canon for swap.

No [needs-eyes]: no feel/UI changes players would notice beyond bugfix
correctness (numbers that were dead now work; dead button gone).
