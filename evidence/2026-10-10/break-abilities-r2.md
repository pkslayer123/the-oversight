# Break-it: abilities & godhood, round 2 (2026-10-10)

Target index 12. Hostile-player attacks against the ability/synergy/slot/revive
engine (src/js/game.js abilities section + progression.js + engine/modifiers.js
+ abilityActions.js + src/data/abilities.json + src/data/synergies.json +
src/data/knowledge.json). This morning's run (target 12, first pass) covered
slot economy, the x1.3→x1.69 double-fire, buildBonus deadness, and dead
ability-modifier targets. This run went after what it left: the KNOWLEDGE
side of the pipeline.

Canon read: docs/CANON.md + docs/SYSTEMS.md (abilities/slots/deepening).
No abilities-specific canon doc exists beyond SYSTEMS.md — noted, not invented.

## CATCHES (all fixed, proof: scripts/test-abilities-knowledge-20261010.js, 39/39 x 8 seeds)

### 1. KNOWLEDGE PIPELINE DEAD (dead-code, the big one)
`Game.allModifiers()` — the ONLY merger of knowledge modifiers into the
pipeline ("Knowledge isn't separate from powers — it amplifies them") — had
ZERO callers. `modTarget()` reads `this.mods()`, which collected only
abilities/relics/synergies. **Every knowledge skill mechanical in the game
(46 skills) was silently dead.** Fix: `mods()` now delegates to
`allModifiers()` (game.js). Verified: fire_rain L2 → fire.success +0.25,
wound_care L2 → healing.amount +5, both previously no-ops.

### 2. FIVE DEAD SYNERGIES (dead-code)
tidecaller, wildreader, smokehouse, green_highway, read_the_patch each require
`skill:fishing` / `skill:foraging` — skills that did not exist in
knowledge.json (`learnSkill` rejects unknown ids). Permanently
undiscoverable; their modifiers (incl. fishing.yield/fishing.rare_chance, which
the net check reads) could never fire. Fix: authored `fishing`
("Reading the Water") and `foraging` ("The Forager's Eye") in knowledge.json
with backgrounds (fisherman/fishing guide/sailor; forager/hunter/gardener/
herbalist) so `grantBackgroundKnowledge` wires them automatically, plus new
`fish_yield`/`fish_rare`/`forage_yield` keys in KNOWLEDGE_MOD_MAP. Verified
end-to-end: tidecaller discovers in 3 combined uses through the technique/
skill synthesis path (teases on 1–2 per design), goes active, fishing.yield
x1.5 fires.

### 3. MOLT DOUBLE-LOG (exploit, same bug class as the x1.69)
`molt.shed_skin`'s impl called `noteAbilityUse('molt')` directly AND
`useAbility`'s post-dispatch `gainAbilityXP` logged it again — one tap = 2
synergy-discovery attempts, so 3-attempt synergies unlocked in 2 taps. Fix:
removed the impl's direct call (useAbility already logs). Verified: exactly 1
log entry per tap.

### 4. TIME_SKIP HONESTY (copy vs engine)
The kept-but-dead `activatableAbilities()` copy in game.js still promised
"Ages you 1 day" — ageDebt was removed 2026-10-08, no aging mechanic exists.
The live copy (abilityActions.js) was already honest. Fixed the dead copy so
it can't lie if revived.

### 5. DEAD KNOWLEDGE TARGETS, sibling sweep (dead-code)
19 of 25 KNOWLEDGE_MOD_MAP emissions targeted engine strings nothing reads
(hunt.find vs hunt.find_chance, food.spoil vs food.spoilage_days, ...).
Retargeted the unambiguous ones to live targets: hunt_find/hunt_success →
hunt.find_chance (x1+v), trap_success → hunt.trap_catch (+v, engine caps
0.95), spoil_slow → food.spoilage_days (x1+v), combat_damage →
combat.strike_damage (x1+v), forage_find → forage.yield (x1+v). Night-gated
keys (night_hunt/night_spot — no ctx support) and keys with no honest live
target stay unmapped with a code comment (documented gap, not silent).
Dead inventory in scripts/test-break-abilities-20261009b.js R3: 31 → 26
(test updated, following the established pattern).
Also: the gill-net check now resolves through `allModifiers()` so knowledge
fishing bonuses apply. Deliberately NOT `mods()`: the generalist buildBonus
("+10% to everything") reaching net yields is a separate design call, and the
net test pins exact species gross.

### 6. DEAD abilitySynergies REFS, sibling sweep (dead-code)
knowledge.json `abilitySynergies` (knowledge+ability → technique unlocks, via
learnSkill → checkKnowledgeAbilitySynergy):
- `stormcall` (weather_read), `healing` x2 (wound_care, anatomy): abilities
  that don't exist — those techniques could never unlock. Retargeted:
  stormcall → rain_dancer, healing → field_medicine.
- `"night_eyes"` as bare strings (nocturnal_patterns, night_hunting):
  malformed vs the object schema — silently skipped (`syn.ability`
  undefined), and app.js rendered "???" for the technique row. Well-formed
  into {ability: night_eyes, minLevel: 2, technique, effect} objects
  ("Owl's Ledger", "Still Hunt").
Verified: Precise Mend and Owl's Ledger techniques unlock for real.

## ATTACKS THAT HELD (documented, not failures)
- **6-slot economy**: chooseAbility, pact gift, trial gift, villager grants all
  enforce the cap (pact fix from r9 re-verified). Only bypass is the debug
  screen's dbg-grant (dev-only, intended).
- **Blood-price infinite**: already killed — wound drops maxHealth, knits
  ~10/night, body refuses past 50 wound (~1 use/day sustainable). Verified
  maxHealth() is genuinely wound-aware and the nightly knit runs.
- **Death cheats**: maybeCheatDeath ordering (phoenixLink > molt > second_wind
  > phoenix) holds; second_wind daily cap + refuses_death doubling honest;
  undying_fury reads live rage state; phoenix no-village → death sticks,
  narrated. No infinite revive chain.
- **XP farming**: XP only on fired activations (useAbility post-dispatch,
  legacy wrapper on fired=true); the 35-tap second_wind farm stays dead.
- **Synergy stacking**: resolve() multiplies sequentially by design; the
  x1.69 double-collection class re-audited — single collection path confirmed,
  crimson_circuit fires exactly x1.3. No second double-count found (molt was
  the remaining one: discovery attempts, not damage).
- **Slot-adjacent**: metaProgression grants no abilities (no cross-run slot
  holes); NPC_ABILITY_KITS respect NPC_MAX_ABILITIES 6.
- **Softlock**: phoenix struggle dawn fuse, molt shared weekly budget,
  phoenixLink re-entrancy guard — all resolve, none brick.

## OPEN DESIGN QUESTIONS (not fixed — need Steve or canon)
- The 26 remaining dead knowledge keys (night_hunt/night_spot need night
  gating in the modifier ctx; animal_calm, craft_quality, trust_read,
  morale_boost, combat_focus, desertion_resist, grief_recover, system_hide,
  fire.fuel, etc. need engine targets). Inventoried in the R3 test.
- buildBonus generalist "+10% to everything" vs net yields (left out
  deliberately; see #5).
- `blood_tracker` synergy still promises "wounded prey doesn't escape" with
  no mechanic (prior run's R1, still open).

## Files changed
- src/js/game.js — mods() → allModifiers(); checkNets → allModifiers();
  time_skip dead-copy honesty
- src/js/engine/modifiers.js — KNOWLEDGE_MOD_MAP retargets + fish_yield /
  fish_rare / forage_yield keys + documented gaps
- src/js/abilityActions.js — molt.shed_skin double-log removed
- src/data/knowledge.json — fishing + foraging skills; 5 abilitySynergies
  ref fixes
- scripts/test-abilities-knowledge-20261010.js — new proof test (39 asserts)
- scripts/test-break-abilities-20261009b.js — R3 inventory 31 → 26
- scripts/test-hunter-net-print-20261009.js — E1 expects species gross x
  resolved fishing.yield (fishing skill now legitimately amplifies nets)

## Test results
- New proof: 39/39 across 8 seeds (20261010, 2, 3, 42, 99, 1234, 7, 777)
- Morning suites: test-abilities-break 67/67, test-ability-break 33/33,
  test-break-abilities-20261009b 224/224 (after R3 update), actions 22/22,
  honesty 7/7, xp-use OK, id-resolution 5/5
- Knowledge suites: 20261010 28/28, r2-20261010 40/40, r2 18/18,
  deadcode/gating/softlock/tradeecon/firesidewrong/sibling-teach ALL PASS
- Fishing: gate 2/2, activefishing ALL GREEN, net-print back to base's 2
  pre-existing failures (ecology + uses decrement — pre-existing, unrelated)
- Pre-existing failures NOT mine (verified on stashed base):
  test-ability-content (5x practice-unlock allowlist), test-brawler-synergy
  (crash at line 249)
- Ontology validator: 53/53 systems, release permitted
