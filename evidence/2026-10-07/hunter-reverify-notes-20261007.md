# Hunter path re-verify at HEAD — 6a7998a (Steve 2026-10-07)

**Re-verified every finding from the 2026-10-07 hunter play-audit** (c1157dc was
"data without a game loop") against **pristine HEAD** (`git archive HEAD src
index.html` → pristine extract; worktree is dirty with sibling work, never
read from it). Proof: `scripts/test-hunter-reverify-20261007.js` — seeded
(mulberry32, SEED=7 default), **48/48 green on seeds 7 and 42**, exit 0.
(Work began at da99f23; a sibling socialite commit landed mid-run — the proof
was re-run green at 6a7998a. The delta is socialite-only, no hunter code paths.)

Sibling fixes landed since the audit: **10db816** "Hunter loop"
(requires_any discovery, card promises honored, read_stance fix, dress_game
no-double-dip) — an ancestor of HEAD, its engine changes intact at HEAD
(14 "hunter loop 2026-10-07" markers in `src/js/game.js`, discovery_methods in
`src/data/synergies.json`). Plus the **useAbility engine** (60a9eec/b15ec93).

## Per-finding verdicts

### 1. 3 synergies undiscoverable (was: no discovery_method + requires_any ignored) → FIXED
- All 3 now carry `discovery_method: {type: 'simultaneous', ...}` with hunter-flavored teases.
- `checkSynergyDiscovery` is path-aware: `matchesUsed` consults `requires_any`
  paths; `hasReq` treats a leg naming a synergy as held when discovered;
  `recomputeActiveSynergies` gates activation on `requires_any` too.
- **Proven:** clean_kill unlocked after 3× [patient_aim + game_sense] (attempts=3);
  blood_tracker after 3× [blood_trail + tracker] (attempts=3).

### 2. apex_predator unsatisfiable (was: synergy-id legs, abilityLevel=0) → FIXED
- Design decision made explicit in code: a synergy leg is "held" when that
  synergy is **discovered** (mastery travels with you).
- **Proven:** apex_predator unlocked after 3× [animal_ken] with clean_kill
  discovered; `abilityLevel('clean_kill')` is still 0 (synergies aren't abilities).
- The compounding bug is gone too: discovered-but-unheld clean_kill is **not**
  permanently active (legs stripped → recompute drops it).

### 3. 13 actions display-only / silent turns → FIXED
- All 13 now execute through **`Game.useAbility(abilityId, actionId)`** with
  real implementations in `src/js/abilityActions.js` and narration on every
  path (never-silent fallback included). `useAbility` also logs
  `noteAbilityUse`, so **playing feeds synergy discovery** — the loop closes.
- `set_ambush` outside combat refuses honestly ("This is a combat action —
  only usable in a fight."), not silently. The old `doAction(actionId)` route
  still warns "unknown kind" for all 13 — documented as superseded, not a bug.

### 4. 9/10 modifier targets pipelined but never consumed → PARTIAL
- Now consumed (3): `hunt.meat_yield` (as before), **`combat.first_strike_damage`**
  (game.js round-1 hook: "AMBUSH: first blood. ×1.5"), **`combat.vs_beast_damage`**
  (game.js strike hook: "APEX PREDATOR: you are the thing other things fear").
- Still dead (7): `stealth.move_silent`, `hunt.track_wounded`,
  `animal.behavior_read`, `hunt.first_shot_damage`, `hunt.wounded_find`,
  `hunt.wounded_time`, `hunt.intimidate` — zero `modTarget` readers in src/js.
  (The test greps pristine HEAD dynamically and asserts this exact set, so any
  future wiring flips it.)

### 5. Meat bonus silent (was: never named) → PARTIAL
- `dress_game` now **names** the bonus: "…plus parts. (Field Dressing ×1.3 —
  your skill kept more of the carcass.)" and converts the carcass at face value
  (the old ×1.3 re-multiply double-dip is gone; net +3860 on a 3900 carcass
  after the 40 kcal cost).
- `encKillLine` still does **not** name the bonus — the fix worker explicitly
  deferred this to the engine owner (sibling WIP in encounters.js hunt region).
  Flagged, not fixed.

### 6. Dead Aim / Ambush text-vs-engine mismatches → FIXED
- **Dead Aim:** card says "3x damage, ignores armor. You cannot move this
  turn." Impl arms `{mult: 3.0, ignoreArmor: true}`; the strike consumes it
  ("DEAD AIM: one perfect shot. ×3, armor means nothing."), the armor block
  honors `ignoreArmorNext` ("hide might as well not be there"), and the flag
  is consumed (no permanent armor-pierce). Proven vs armored hushwolf (33 dmg,
  one-shot kill).
- **Ambush:** action "2x next attack, can't be dodged" now arms a real
  `ambushReady {mult: 2.0}` consumed on the next strike; the *passive*
  (combat.first_strike_damage 1.5) fires on round-1 strikes. take_aim arms
  2.5x, matching its own card ("2.5x damage and cannot miss") — the old
  STUDY-armed ×2.5 vs 3x-text confusion is resolved by giving each verb its own
  flag.
- Minor residuals (not verdict-changing): `noDodgeNext` is set but never read —
  harmless, tb strikes have no dodge mechanic; ambush passive 1.5× and
  set_ambush 2× stack on a round-1 ambushed strike (3×) — design note, not a bug.

### 7. read_stance first-use "already read" bug → FIXED
- `tbfight.id` is set at creation (both creation sites) plus a null-guard in
  the impl. Proven: first use of a fight actually reads.

### 8. lay_wait → next encounter hidden → FIXED
- `checkAnimals` consumes `layWaitActive`: encounter spawns with `aware = 0`
  and a say line. Proven in the night-hunt play pass (meadow tile, rabbit
  encounter, aware 0).

### 9. stalk "animals won't flee" → FIXED
- `stalk_prey` drops an active encounter's awareness (0.8 → ≤0.2) and arms
  `stalkActive` for the strike. Proven.

## Play-feel judgment (played as a player, seeded)

**It is a game loop now.** The night-hunt sequence plays: stalk (the fantasy
lands — "You become uninteresting. Just another shadow"), lay in wait (setup
with a named payoff), walk out to the meadow, the encounter starts hidden
("(Lay in Wait: you are part of the landscape. It has no idea you are
here.)"). In a fight the verbs have teeth and voices: round-1 "AMBUSH: first
blood", "TAKE AIM: the shot lands exactly where you pictured it", "DEAD AIM:
one perfect shot" — each strike narrates *which* hunter verb just fired, so
the kit teaches itself. Synergy discovery is earnable through normal play
because `useAbility` logs uses — the 3-combined-use grind happens by *hunting*,
not by menu-diving. And the hushwolf is genuinely scary (it took the scholar
from 100 to 9 hp in a few turns while I was setting up the Dead Aim proof) —
the fantasy of the perfect shot has a real reason to exist.

Honest gaps remaining: the 7 dead modifier targets mean the *passives* on
stalk/blood_trail/tracker/animal_ken are still stat-lines, not felt — but
their *actions* are, so the path no longer feels empty. The kill line still
doesn't name the field-dressing bonus (deferred). Neither blocks the loop.

## Files
- Proof: `scripts/test-hunter-reverify-20261007.js` (new; 48 checks; seeds 7, 42 green)
- These notes: `evidence/2026-10-07/hunter-reverify-notes-20261007.md` (new)
- Engine untouched (read-only). Not pushed (per assignment).
