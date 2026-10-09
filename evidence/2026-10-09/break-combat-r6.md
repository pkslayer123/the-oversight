# Break-it: combat engine — round 6 (2026-10-09)

Hostile pass, fresh ground only. Rounds 1–5 vectors (strike-number lies,
fieldFight-vs-corpse, startCombat clobber, dead standoff, 2x2 movement,
phantom heals, eat/drink costs, save-scum, double-KO, xp farms, refuse_death)
were NOT re-attacked; their suites re-ran green (one stale heuristic updated —
see F2 note; one pre-existing seed-flake in r2 hp-routing, identical on base).
Proof: `scripts/test-break-combat6-20261009.js` — 21/21 AFTER on seeds
20261009, 1, 7, 99. BEFORE=1: 10 checks fail on stashed pre-fix code.
Ontology 50/50.

## KILLS (broke + fixed, all with proof)

### F1. HONESTY: Take Aim's "enemies get +hit" was a lie (write-only flag)
`patient_aim.take_aim` arms `s.aimBonus = {mult: 2.5, guaranteed: true,
exposeTurns: 1}` and the copy promises "You are exposed (enemies get +hit)".
`exposeTurns` had ZERO consumers — the tradeoff never fired. The 2.5x was
free.
**Fix:** while `exposeTurns > 0`, the player's dodge chance is suppressed in
`tbDamage` (an exposed player is planted for the shot — one say line, told
once per aim); `tbBeginTurn` ticks it down ("until your next turn"). The 2.5x
aim itself persists until the shot is taken.
**Sibling sweep (write-only-flag class):** `noDodgeNext` — set NOWHERE, only a
fossil `delete` in the fight-start hygiene (removed); `fightRead` — see F6;
`layWaitActive`/`cleanShotReady`/`pushThroughParts`/`tradeOpen` all have live
consumers — clean.

### F2. HONESTY: Dead Aim's "you cannot move this turn" was a lie
`dead_aim_shot` set the flag but never touched `moveLeft` — plant your feet,
then walk 6 tiles and fire the 3x shot.
**Fix:** the impl zeroes the fighter's `moveLeft` and re-evaluates the turn
end via `tbAfterPlayerAction()` (the r3 gravity-well pattern — without it the
turn strands at 0 moves + acted with no legal moves). The turn ends; the shot
stays armed for the next turn.
**Test fallout (sibling's test, stale heuristic):** r3-honesty H4 flagged
dead_aim as "FREE" because its heuristic (`ret===true && !p.acted`) can't see
a turn that ended and a new one that began. Updated H4 to also accept a round
advance as "spent" — the action demonstrably cost the turn.

### F3. HONESTY: armor-absorb line understated (stated-before-applied class)
`tbDamage` said `Armor absorbs ${Math.min(dmg, prot)}` — the RAW input — but
union-rep solidarity (+3) and pack-leader (+2) inflate `final` BEFORE armor.
Measured: raw 8, +3 aura, armor 10 → landed 1, line said "absorbs 8" (really
10). Fixed to state the post-modifier absorbed number, for player and
villager armor alike.

### F4. DEAD CODE: `tbNearestFire` — zero callers, removed
A fire-tile helper with no readers anywhere (git history: never had one; it
survived the 2026-10-08 dead-monster purge). Removed from game.js. Not in the
ontology provides list, so the gate never noticed — the Alien Players lesson
class, caught by the every-tb* caller census (82 defs; this was the only true
orphan).

### F5. EXPLOIT/CAUSALITY: betrayal hostile respawned at flat 40 HP — your damage erased at no cost
`startBetrayalCombat` built the hostile at `hp: 40` always. Beat them to 1 HP,
flee, heal for free, re-engage (`playerAttacks` has no cooldown) — a fresh 40.
Same bug class as the door-flee monster reset (fixed 2026-10-08: stashed HP
honored on re-engage). Your wounds persist (s.health syncs from the fighter);
theirs didn't.
**Fix:** the party.js `tbEnd` wrapper stashes each living hostile's remaining
HP on `state.village.betrayalWounds[vid]` (cleared on death); the next
`startBetrayalCombat` restores it (min 40).

### F6. DEAD CODE: Read the Fight's banked branch was unreachable
The impl banked `s.fightRead = {speedBonus: 2}` for "the NEXT fight when used
out of combat" — but the action's `context` is combat-only, so `useAbility`
can never reach that branch. Write-only flag + a misleading comment in
`resetPerFightFlags` claiming the banking worked. Removed the branch and the
comment. (Deliberately NOT wired as a pre-fight feature: that's a UI/cost
design decision for a content run, not a break-it fix. Noted below.)

### F7. HONESTY (copy): Rage "for 3 rounds" → "your next 3 strikes"
The engine decrements `rageActive` per STRIKE (`_applyAbilityActionMods`), not
per round — a round without a strike didn't consume it. Copy (abilities.json
effect + description + flavor, abilityActions say) now matches the engine.
No power change; the generous strike-counting behavior is kept.

## HELD (attacked, resisted — the deeper level)
- **Stalemate/round cap:** no round cap exists, but no 0-damage stalemate does
  either — all 28 monsters deal ≥4 damage; flyers always come down to attack
  (circle→dive→grounded loop); turtle bunker unseals after 2 turns (r2); the
  union-rep walkout stalemate was already fixed (line breaks with no allies).
  Kiting a chaser forever is possible but costs time, gains nothing, and flee
  is always available — player choice, not a trap.
- **Stun-lock:** stuns are consumed in `tbBeginTurn`; belltoad `stun_full`
  re-application also deals damage — no damage-free lockout. Mirror-stag
  gaze costs movement only, correctly.
- **Negative/overkill damage:** `tbDamage` clamps `Math.max(0, ...)` — no
  healing-through-damage; no resistances outside [-1, 1] in data; armor can't
  drive strike damage negative (`min(d, armor)`).
- **Feastburn overstack:** burn capped at 300/400 kcal per strike, fires once
  per strike AFTER all refusal gates (no burn paid on refused/out-of-range
  strikes); surge wrapper states its total honestly (2026-10-08 fix holds).
- **Friendly fire:** player abilities never call `tbDamage` (flag-based,
  consumed by `tbPlayerStrike`, which rejects non-monster/hostile targets) —
  player friendly fire is impossible. Monster AoE does hit villager allies
  (beams iterate all fighters on cells) — emergent dark play with real costs
  (lost villager, witnesses), not a code break.
- **Flee-heal-return (wild):** wild monsters despawn at fight start (r4);
  barrier-follow keeps the SAME wounded fighters; door-flee honors stashed HP
  (2026-10-08). Only the betrayal hostile reset — fixed (F5).
- **XP on non-kills:** no combat XP; ability XP only after a real fire
  (r1/r3); `practice()` capped at stat 10; dodge-practice farming is capped
  grinding with real risk, not an exploit. Fled fights pay knowledge only.
- **Ability self-kill:** the `hp` cost handler leaves 1 HP minimum and reads
  the fighter's pool in combat (r2) — no mid-turn self-kill.
- **Pacified both sides:** `calm_beast` honestly fails on monsters (r3);
  loom/war-cry skips cost a turn + kcal each — no free perma-skip.
- **Monster with no legal move:** `tbMonsterTurn` best-efforts movement and
  ALWAYS ends with `tbEndCheck` — verified by code read across the whole
  function; no path strands the turn.
- **tbEnd('calmed'):** unhandled result string, but the fight ends cleanly via
  the finally (tbfight cleared, no rewards) — peaceful by design.
- **22 combat data-actions:** 18 have impls (spot-checked rage/loom/
  read_fight/stare_down/war_cry/haymaker/ambush/settle_debt/brace/take_aim —
  all honest); 4 remain unwired but fail fast with the turn kept
  (scream, pocket_sand, leech_stance, peacemaker.walk_in) — documented content
  debt, not silent.

## Regressions run
test-break-combat6 21/21 ×4 seeds; break-combat1 13/13; r3-async 21/21;
r3-honesty 18/18 (H4 heuristic updated); r3-deadcode 13/13; r2-doubleko 8/8;
r2-multikill 8/8; r2-phantom-pack 7/7. r2-hp-routing 15/16 at seed 20261009 —
verified IDENTICAL on stashed base (seed-dependent sickness roll flake in
their test, 16/16 on seeds 1/99/42).

## Content-run candidates (not break-it fixes)
- Pre-fight Read the Fight: data text ("Read the fight before it starts")
  wants an out-of-combat use; needs UI placement + cost design.
- The 4 unwired combat actions (scream/pocket_sand/leech_stance/walk_in).

## Files changed
- `src/js/game.js` — take-aim exposure (tbDamage suppress + tbBeginTurn
  tick); honest armor-absorb lines (player + villager); removed
  `tbNearestFire` + `noDodgeNext` fossil; resetPerFightFlags comment truth.
- `src/js/abilityActions.js` — dead_aim move lock; read_fight dead branch
  removed; rage copy ("next 3 strikes").
- `src/js/party.js` — betrayal wound stash (tbEnd wrapper) + restore
  (startBetrayalCombat).
- `src/data/abilities.json` — rage effect/description/flavor copy.
- `scripts/test-break-combat6-20261009.js` — new proof (21 checks).
- `scripts/test-combat-r3-honesty.js` — H4 heuristic accepts round-advance
  as turn-spent.
