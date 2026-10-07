# Hunter wiring backlog — fixes — 2026-10-07 (Steve 2026-10-05)

Three known-broken items from the hunter re-verify
(evidence/2026-10-07/hunter-reverify-notes-20261007.md §§4–5 + §C residual),
fixed following the brawler pattern (commit 0e3e41c). Proof:
`scripts/test-hunter-wiring-fixes-20261007.js` — seeded (mulberry32, SEED=7
default), **39/39 green on seeds 7 and 42**, exit 0. (Base moved mid-run
5f30aee → c32c36d — sibling brawler "haymaker whiff" commit; their game.js
hunks are in different regions, rebased clean, proofs re-run green at the
new base.)

## 1. Seven dead hunter modifier targets — FIXED (2 wired, 5 honestly removed)

**Before:** 7/10 hunter modifier targets had zero engine consumers (audit §4).

**After — wired through the sanctioned pipeline** (`game.modTarget`,
"new content = new target, never new plumbing"):

| target | source | consumption site |
|---|---|---|
| `stealth.move_silent` (+0.3) | stalk (passive) | food.js `preyReaction` flee roll: `fleeP -= modTarget(...)` — quiet movement keeps prey calmer at the strike moment, beside the tracker-level term the roll already had ("stalking skill matters") |
| `hunt.first_shot_damage` (×2.0) | clean_kill (synergy) | game.js round-1 strike hook, beside the AMBUSH block: `CLEAN KILL: one shot, and it never knew. ×2` — the round-1 hook is the engine's "first shot"; no ranged gate (sibling hunter verbs dead_aim/take_aim already use "shot" for any strike) |

Synergy modifiers apply while discovered AND active (`synergyMods` reads
`activeSynergies`) — clean_kill's ×2.0 only fires while you hold a path at
minLevel 2. Knowledge → power holds.

**After — honestly removed from data** (no mechanic exists to wire into;
documented here, not left as silent dead data):
- `hunt.track_wounded` (blood_trail, +0.5): no wounded-animal system anywhere
  in src/js — wounded animals don't exist as trackable entities;
  `follow_blood` is fixed narration, not a tracking mechanic.
- `animal.behavior_read` (animal_ken, +0.4): `read_beast` returns a flat pick
  from 4 states — no read-quality mechanic to scale. Inventing quality tiers
  would be a new mechanic, not wiring.
- `hunt.wounded_find` (blood_tracker, +0.8) / `hunt.wounded_time`
  (blood_tracker, ×0.5): same missing wounded-animal system as track_wounded.
- `hunt.intimidate` (apex_predator, +0.5): no animal-intimidation pipeline.
  `social.intimidate` exists but is the vs-human stare_down; the only
  animal-fear roll is `calm_beast`'s 50/50, whose fiction ("make yourself
  small and uninteresting") is the OPPOSITE of intimidation — wiring it there
  would contradict the fiction. apex_predator keeps `combat.vs_beast_damage`
  (consumed, narrated "APEX PREDATOR: you are the thing other things fear").

Card-text honesty: none of the five removed targets' cards promised a
numbered system — descriptions are flavor ("You can follow a wounded animal
through anything"), actions unchanged. No text trims needed (unlike brawler's
knockdown promises). blood_tracker is now a discovery-only synergy (fiction
+ earned unlock, no stat) — kept deliberately: removing it would break
apex_predator's requires_any path. Noted as a design observation, not a bug.

**Proof:** §A — 5/5 absent from data, 2/2 declare+consume, full sweep: every
hunter modifier target left in data has ≥1 engine reader (live set:
hunt.find_chance, combat.strike_damage, hunt.meat_yield, hunt.trap_catch,
stealth.move_silent, combat.first_strike_damage, hunt.first_shot_damage,
combat.vs_beast_damage). §D1 — behavioral A/B over the real `preyReaction`
flee roll (identical random streams, 400 trials): 72 bolts without stalk vs
0 with stalk; pipeline value 0.3. §D2 — clean_kill discovered via 3 days of
played [patient_aim + game_sense], active while path held; round-1 strike
narrates CLEAN KILL and deals damage; pipeline value 2.0.

## 2. encKillLine names the field-dressing bonus — FIXED

**Before:** the kill's kcal already carried `hunt.meat_yield` (caller applied
it), but the kill line never said so — the bonus was only named later at
`dress_game`.

**After:** `encKillLine` (encounters.js) recomputes the mult via
`modTarget('hunt.meat_yield', 100)/100` and appends the same phrasing
dress_game uses: `(Field Dressing ×1.3 — your skill kept more of the
carcass.)`. Silent without the skill (no phantom bonus).

**Proof:** §B — with field_dressing held the kill line contains the bonus;
without it, it doesn't.

## 3. Hunter per-fight flags — FIXED (reset + 2 dead flags resolved)

**Before:** aimBonus, deadAimShot, ambushReady leaked between fights (armed by
useAbility, consumed only on the next strike). Siblings found: ignoreArmorNext
(set mid-strike, cleared same strike — hygiene), noDodgeNext (set, NEVER read
— genuinely leaked forever), cleanShotReady (set by clean_shot, NEVER
consumed — leaked forever), stalkActive (set by stalk_prey, NEVER consumed —
the comment claiming preyReaction read it was aspirational).

**After:**
- startCombat's flag-hygiene block (brawler pattern) now also deletes:
  aimBonus, deadAimShot, ambushReady, ignoreArmorNext, noDodgeNext,
  cleanShotReady. layWaitActive intentionally NOT cleared — it holds for the
  next *animal encounter* (consumed by checkAnimals), not the next fight.
- stalkActive: REMOVED (dead flag). The stalk promise ("animals won't flee")
  is delivered by the direct awareness drop (0.8 → ≤0.2), which flows into
  the preyReaction flee roll — the flag was redundant with the mechanism.
  Comment corrected. (Brawler precedent: braceActive.noKnockdown removal.)
- cleanShotReady: WIRED, not just reset. It was a paid action (20 min +
  15 kcal) arming a flag nothing read — dishonest. Now huntAnimal consumes it:
  +0.25 strike chance (same family as the tracker bonus), and a lined-up kill
  narrates "One shot — it never knew. No suffering. (Clean Shot.)" The action
  text was updated to match ("lands more reliably" — the old "full meat
  yield" promise was dropped; yield was already full via hunt.meat_yield).
  startCombat also clears it: a lined-up shot doesn't survive a monster fight.

**Proof:** §C — two-fight harness: all 6 flags armed in fight 1 (3 via real
useAbility, 3 direct), fight 2 starts clean; stalkActive never set;
layWaitActive survives by design; brawler 7 still reset (regression). §D3 —
cleanShotReady consumed by a real huntAnimal strike; lined-up kill narrates
the clean shot; startCombat clears it.

**Note for the coordinator:** the old reverify script
(`scripts/test-hunter-reverify-20261007.js` line ~154) asserts
`s.stalkActive === true` after stalk_prey — that pin is now intentionally
inverted by this fix. If that script is re-run, that one line needs updating.

## Files
- `src/data/abilities.json` — removed hunt.track_wounded, animal.behavior_read; clean_shot effect text honest
- `src/data/synergies.json` — removed hunt.wounded_find, hunt.wounded_time, hunt.intimidate
- `src/js/food.js` — preyReaction consumes stealth.move_silent
- `src/js/game.js` — round-1 hook consumes hunt.first_shot_damage; startCombat hunter flag hygiene
- `src/js/encounters.js` — encKillLine names Field Dressing bonus; huntAnimal consumes cleanShotReady (+0.25, clean-kill narration)
- `src/js/abilityActions.js` — stalk_prey dead stalkActive removed; clean_shot say text honest
- Proof: `scripts/test-hunter-wiring-fixes-20261007.js` (new; 39 checks; seeds 7, 42 green)
- These notes: `evidence/2026-10-07/hunter-wiring-notes-20261007.md` (new)

## Tree-safety notes for the coordinator
- Developed in /tmp/w-hunter from pristine HEAD extracts (never read the dirty worktree for source).
- HEAD moved mid-run (5f30aee → c32c36d, sibling haymaker-whiff commit). Their game.js hunks are in different regions (startCombat haymakerOffBalance above the brawler block; strike whiff above the damage roll) — rebased clean, proofs re-run green at c32c36d.
- Commit via scripts/safe-commit.sh (private index); sibling worktree state backed up to /tmp and restored after commit.
- Not pushed (per assignment).
- Grep markers for revert detection: `HUNTER FLAG HYGIENE` in startCombat, `CLEAN KILL: one shot` in the round-1 hook, `stealth.move_silent` in preyReaction, `cleanShotLined` in huntAnimal.

## Honest gaps / flags for Steve
- blood_tracker is now a stat-less synergy (discovery + fiction only). It still unlocks via play and gates apex_predator. If stat-less synergies feel wrong, the design call is Steve's — the alternative was fake numbers.
- clean_kill ×2.0 stacks with the ambush passive ×1.5 on a round-1 strike (3×) for a hunter holding both — same stacking the reverify already blessed for ambush+set_ambush. Earned (minLevel 2 synergy + ability), not flagged as a bug.
- stalk's passive (-0.3 flee) + stalk action (aware → 0.2) together make stalked approaches nearly bolt-proof. That IS the card promise ("Animals don't flee"), so it's faithful — but it's strong. Feel call is Steve's.
- Out of scope, observed: `noDodgeNext` is still set-but-never-read (tb strikes have no dodge mechanic); the startCombat reset now clears it so it can't accumulate, but the set itself is vestigial. Left for the engine owner.
- The old hunter reverify script has one stale pin (stalkActive, noted above).
