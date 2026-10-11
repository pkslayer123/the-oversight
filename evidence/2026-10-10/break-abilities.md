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

---

## Second run 2026-10-10 (late) — the 12-button backlog: BROKE + FIXED

Commit: f5794463 [needs-eyes]. The earlier run's "REFERRED" backlog item
(12 unwired-but-honest ability actions) is now CLOSED: all 12 are wired or
deduped. Proof: `scripts/test-abilities-break-20261010.js` — 67/67 green × 3
seeds (20261010, 7, 99). Before-fix run recorded: 12 wiring failures +
dead_aim advancing the world twice per tap.

### K1. TWELVE DEAD BUTTONS → 10 wired, 2 deduped
`activatableAbilities()` surfaced 12 data-declared actions with no
`ABILITY_ACTION_IMPLS` entry; every tap answered "isn't wired up yet —
this is a bug, not a feature." Wired in `src/js/abilityActions.js`, each
honoring its data copy as the contract and reusing existing engine hooks:
molt.shed_skin (shares the weekly budget with the auto-molt death cheat —
once/week, 2 with refuses_death; heal full, gear lost), scream_cheese.scream
(delegates to tbPlayerScream({viaAbility:true}); framework owns the turn +
20 kcal), pocket_sand.throw_sand (nearest live monster, blind=2 — engine
already 50%-misses while blind>0), grave_robber.rob_grave (lootCorpse
takeAll = "better gear than normal looting"; party witnesses −15 trust each),
mediator.mediate_dispute (hottest known dispute via mediateConflict, now
taking the drama.resolve_bonus the copy promises — new opts.resolveBonus),
leech.leech_stance (stance flag; tbDamage redirects half of nearby-ally
damage to the player via addHealth; clears in tbBeginTurn), scarecrow.
stage_injury (arms stagedInjury; checkTraps forces the next eligible trap to
catch — skips the 40% roll + trap-shyness; empty woods don't consume it),
peacemaker.walk_in (talk check 35 + 2×drama.resolve_bonus cap 90: success =
monsters fled, Elders exempt; failure = exposed, no dodge until next turn),
peacemaker.make_friends (−50 tension on hottest dispute, resolves ≤10),
water_breathing.dive_deep (creek/wetland tile only; modest sunken salvage;
once per tile per day). echo_location.echo_locate and purify.purify_poison
REMOVED from data — pure duplicates of working legacy buttons (one live
button + one "bug" button for the same ability). Every new action got a
precheck: refused taps cost nothing, and the precheck drives the button's
disabled state.

### K2. DEAD_AIM DOUBLE-ADVANCE (honesty, combat)
'dead_aim.dead_aim_shot' cost {turn:true, kcal:50} AND its impl called
tbAfterPlayerAction() directly; the framework then spent the turn again —
the monster acted twice per tap. Fix: impl no longer self-advances.
Sibling sweep: no other impl self-advances (only dead_aim did).

### Held (re-verified, not assumed)
6-slot law on all grant paths; blood_magic 2/day-part + wound gate;
second_wind daily cap; synergy stacking slot-bounded (all 5
combat.strike_damage multipliers need 7 abilities > 6 slots; achievable
6-slot ceiling ≈ x2.27 — scary-good, not infinite); XP L3 ceiling;
tidecaller discovery completes via the synthetic skill path (3 uses).

### Stale test lock-ins updated to the new contract
test-combat-r7-20261009.js T8, test-combat-r2-deadcode-20261008.js X1,
test-combat-break-deadcode-20261008.js D3 (tbPlayerScream now reached via
useAbility — the single-entry direction), all green.
Pre-existing failures NOT mine (identical on HEAD via stash):
test-combat-r3-deadcode.js D1 (harness file-list drift: broadcast.js/
corruption.js), test-villager-xp-20261009.js c3, test-combat-r2 X2-fear
(static-scan artifact).

### [needs-eyes]
Dead_aim taps now advance the world once (monsters act half as often after
a dead-aim tap — the old double was the bug); scream costs the copy's
20 kcal through the ability bar (the old combat button was free); 10
abilities gained working buttons.

---

## Third run 2026-10-10 (night) — the starvation farm: BROKE + FIXED

### L1. EXPLOIT: second_wind printed 500 kcal/day from nothing (game.js, statusEffects.js, abilities.json)
`second_wind`'s spite-ration (`s.kcal = Math.max(s.kcal, 500)`) fired on
EVERY cheated death, including starving to 0 HP overnight: sleep at 0 kcal
→ the overnight spiral (~13–20 HP/night, engine/calories.js) takes you →
`maybeCheatDeath()` → 1 HP + 500 kcal → repeat. A true infinite engine in
the one economy where food is everything. Fix: `maybeCheatDeath(cause)` —
the ration fires only on violent death; `'starvation'` (overnight caller)
and `'disease'` (the trembles) get 1 HP and stay hungry. Copy updated
honestly (description + Refuse action effect + in-game say variant).
Proof: `scripts/test-abilities-breakit-20261010.js` — 23/23 green × 4
seeds; `FIX=0` replays the pre-fix shim and the exploit test goes red
(kcal=500), demonstrating the hole. Violent-death ration, refuses_death
2×/day, molt single-fire + gear loss, blood_magic 2/daypart cap all hold.

### L2. HONESTY: the XP bar lied (app.js)
Abilities menu rendered `xp / (level*100)`; the engine needs 10 (L1→L2) /
25 (L2→L3) — L1 showed 9% at 9/10 real. Now uses the engine thresholds
(proven by the test's threshold assertions); L3 shows full.

### L3. HONESTY: stale synergy stirrings (app.js, sibling sweep)
`renderSynergyStirrings` and `_synTeaseSet` checked only `syn.requires` —
multi-path (`requires_any`) synergies always passed, so a lost leg left a
stale "something is stirring" tease. Both now path-aware like
`recomputeActiveSynergies`. Empty-slot copy also fixed: "trials, mentors,
or the System" → "the System: offers, trials, and service" (mentors never
grant abilities).

### L4. DEAD CODE (documented, NOT fixed — design call for Steve)
**17 of 85 abilities have no player grant path** (grant paths are exactly:
34 occupation background ids + 55 system_offer ids, all slot-checked):
trial ×7 (trials never built; Trial of Hunger/Blood live only in
`data/_archive`) — iron_stomach, adrenaline_surge, intimidating_presence,
gossip_network, peacemaker, evidence_board, trade_of_blows (three with ZERO
code refs); practice ×5 — stalk, blood_trail, ambush, war_cry, haymaker
(NPC kits only); 'granted' ×5 in no occupation's list — purify,
brawler_instinct, silver_tongue, pathfinder, lie_detector (**purify is the
poison cure**). **Cascade: 20 of 51 synergies undiscoverable** (every path
has a dead leg, verified by hand). **blood_tracker is discoverable but
mechanically void** (no modifiers, no flags, zero code reads). The proof
test characterizes all three dead sets as tripwires. Proposed (Steve
picks): (a) build the missing trial/practice grants; (b) retype the 17 to
system_offer; (c) confirm NPC-only and prune.

### Held (attacked, resisted)
Synergy stacking uncapped (by design — "broken builds welcome"); no
swap/unequip exists so no slot-swap abuse; blood_magic wound gate;
death-cheat ordering; Feastburn "burns hotter" wired (arc4burn);
refuses_death ≈ 2× uses (honest in effect); all 44 modifier targets live.

### Regressions
test-phoenix-rework 66/66, test-phoenix-gear 42/42, test-xp-attempts 5/5,
test-synergy-requires-any 15/15. Pre-existing rot (not mine):
test-synergy-20261007.js calls `Game.synLedger` (doesn't exist).
