# Break-it KICKOFF — abilities & godhood (new rotation target 12, 2026-10-09)

First run for the new target. Depth-first hostile pass over the death-cheat
stack (molt / second_wind / phoenix_clause), multiplicative modifier stacking,
and the phoenix link state machine.

## Catches (all fixed + proven)

### G1. DEAD CODE — v.npcAbilities is write-only in production (LOUD)
`npcGrantAbility` has **zero callers in src/** (only test scripts call it). No
game system — not the System's ability offers, not mentorship, not succession —
ever grants a villager an ability. Consequence: the entire villager-bearer
bidirectional phoenix half (~200 lines: `phoenixVillagerTrigger`, the choice
beat, `npc-protests` struggle, give/pull-away, `dyingLinks`) is **unreachable
in real play**. The bearer-exclusion rule ("phoenix cannot burn phoenix")
likewise never fires with real data.
- NOT fixed this run: wiring acquisition is a design task, not a bug fix.
  The code stays (tested, 67/67 + 42/42), clearly commented as future-scope.
- Recommended wiring when Steve wants it: the System offers abilities to
  *notable* villagers (it watches the whole village; "popular is just what
  the aliens like to see") — or mentorship completion grants. Either makes the
  existing tested code live without new mechanics.
- Proof: `scripts/test-break-godhood-20261009.js` T1 prints the verdict
  (static caller scan, 0 sites). Suite stays green; the finding is reported.

### G2. HONESTY — undying_fury fired on possession, not rage
Card: "When Second Wind triggers **during rage**, you return at FULL health."
Engine: `hasAbility('rage')` — any rage-holder got the full heal even when
calm. Fixed to read the real rage state (`s.rageActive.rounds > 0`, set by
`unleash_rage`, spent per strike). The `noteAbilityUse('rage')` XP log moved
with it (was granting rage XP for calm heals).

### G3. WASTE — link-hold burned molt/second_wind for nothing
`maybeCheatDeath` fired molt (weekly) and second_wind (daily) *before* the
phoenix-link hold check: a second lethal hit during a pending link consumed
both for zero benefit — the link already holds the death at 1 HP. Fixed: the
link-hold check is now first; the cheats keep their uses.

### G4. DOUBLE-DEATH — victim dies by other means mid-struggle
Protest victim killed independently during the fuse day: the struggle win
burned the corpse — second `registerDeath`, second `v.fallen` push, and
`removeVillager`'s mentorship trust hit landing **twice** (-8/roster member,
twice). Fixed: `phoenixResolveBurn` guards — the fire accepts the death that
already happened, no second burn, link collapses honestly, bearer held at 1 HP
(player) or held death falls through (villager bearer).

### G5. SOFTLOCK — one link slot, silent overwrite
`state.phoenixLink` is a single slot: a second villager-bearer dying mid-link
silently overwrote the first link — first bearer orphaned in `dyingLinks`
limbo (alive, clauseless, held death never resolved), second bearer never
died (removeVillager returned early). Fixed: clause spent against a busy fire,
death proceeds normally, honest narration. (In the currently-dead code path;
fixed so it's correct when G1's wiring lands.)

### G6. LIMBO — won the struggle at 0 HP, alive at 0 HP
Player breaks a villager-bearer's link (pull away, 3 beats) while their own
death was held at 0 HP: victory left them alive at 0 HP with no pending
damage — a limbo state. Fixed: tearing free of death floors at 1 HP.

## Held (attacked, resisted — documented in the proof test)

- **H1. blood_magic infinite engine** — stays dead. 2/day-part cap, wound
  ratchets `maxHealth()` down, knits 10/night, refuses past 50 wound, kcal
  clamped to the bank cap. The old ~21,600 kcal/day engine does not resurrect.
- **H2. Multiplicative strike stacking** — bounded by the 6-slot cap and the
  L3 level cap. Max realistic alpha build (adrenaline_control L3 × patient_aim
  × cornered_fury × ringcraft) = exactly ×7.14 on round 1 — the intended
  "scary good", finite, no runaway.
- **H3. Ability-level exponentials** (`value^level`) — L3 max caps triage at
  ×3.375 healing, adrenaline_control at ×2.197 damage. Bounded by design.
- **H4. Trust-gain stacking** — multiplies compound, but gains are
  progressively damped per villager (miser break-it) and each multiplier
  costs 2 of 6 ability slots via its synergy. Opportunity cost is the brake.
- **H5. Combat HP routing** — molt/second_wind/phoenix mid-combat sync
  fighter hp ↔ scholar.health both ways (encounters.js:2796, party.js:1221);
  the field_medicine phantom-heal class does not recur here.

## Observations (not fixed — design calls)

- **O1.** `cornered_fury` ("Backs to walls hit harder") and `borrowed_surge`
  ("Hold the surge. Spend it on the one hit that matters.") apply as
  always-on ×1.25/×1.4 with no condition plumbing — the fiction describes
  conditional play patterns that don't exist. Either add conditions or
  reword the flavor.
- **O2.** `refuses_death` card ("recharge twice as fast") vs engine (twice as
  many uses per period) — roughly the same for daily cooldowns; honest enough,
  noted for the record.

## Proof
`scripts/test-break-godhood-20261009.js` — **94/94 × 3 seeds**.
Regressions: `test-phoenix-rework-20261009.js` 67/67, `test-phoenix-gear-20261009.js`
42/42, ontology validator 52/52.
Pre-fix run: 63/94 (28 failures demonstrating G2–G6; G1 documented).

## Files
- `src/js/game.js` — maybeCheatDeath (link-hold first, undying_fury rage-state),
  phoenixVillagerTrigger (busy-fire guard), phoenixResolveBurn (dead-victim
  guard), phoenixStruggleWin (1 HP floor)
- `scripts/test-break-godhood-20261009.js` — proof (94/94 ×3)
- `evidence/2026-10-09/break-godhood-kickoff.md` — this file
