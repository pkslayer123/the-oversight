# Brawler adversarial run 3 — 2026-10-10 (02:30–03:30 UTC)

Archetype 4 (brawler). Hostile angles: lie-buttons, turn-eating, stun-lock,
damage-stack audit, flee routing, copy-vs-engine honesty.
Proof: `scripts/attack-brawler-20261010.js` — ALL GREEN ×3 seeds
(20261010, 777, 424242).

## BREAKS FOUND + FIXED

### 1. `war_cry.challenge` (Issue Challenge) was a lie-button
Data copy: "Challenge a villager to a non-lethal bout. Winner gains respect.
Loser gains humility." Impl: narrated one line, did nothing — no bout, no
respect, no humility. Same class as the r7 `menace` fix.
**Fix:** the button is the DARE now — public, witnessed, real: once/day guard
(rep farm kill), target memory `you_challenged`, gossip `challenged`
{brave:+4, generous:-2} (rep, never trust), temperament-based response
(bold accept the dare, fearful yield it publicly → `yielded` {brave:-4} on
them). The bout itself is content-run (real fight). Copy rewritten to match.
Defaults to the active conversation partner (UI passes no target for social
actions); honest refusal otherwise.

### 2. `intimidating_presence.end_it_before` was a lie-button
Data copy: "Most disputes resolve in your favor without violence. Some resent
you for it." Impl: narrated one line, did nothing.
**Fix:** posturing is real now — target yields this dispute (memory
`you_postured`), and the promised resentment lands as a real -5 trust hit
(theft is allowed; posturing is too, but socially punished). Gossip
`postured` {brave:+3, honest:-3}. Once/day guard. Copy rewritten to match.

### 3. `war_cry.bellow` ate the turn on an empty room
No foes left (all fled): the tap spent the turn + 30 kcal, then lied "they
hold their ground, but they heard you." **Fix:** `ABILITY_ACTION_PRECHECKS`
entry — refuses before payment ("No one left to bellow at."), same class as
the r3 turn-eater fixes.

### 4. useAbility paid the turn BEFORE the impl ran (ordering inversion)
`payActionCost` → `COST_HANDLERS.turn` → `spendCombatAction` →
`tbAfterPlayerAction` advances the world — the monster acted on the spent
turn before the ability's effect landed. Strike applies its effect before the
response; abilities were inverted. Concrete victims:
- **Brace:** "Reduce next incoming damage by 60%" — the tap-provoked hit
  landed UNBRACED. (Proven: `fightDamageTaken` 100→115 inside one
  `useAbility('trade_of_blows','settle_debt')` call — the hushwolf's
  activation-turn hit.)
- **settle_debt:** cashed in the activation-turn hit it provoked.
- **Bellow:** could never stop the immediate retaliation.
**Fix:** turn-last ordering in `useAbility` — precheck turn usability
atomically, pay non-turn costs, run impl, THEN spend the turn. Fizzle still
costs the turn (unchanged semantics); refused taps still cost nothing.
Proven by H1 (bonus=50 exactly, no activation-hit) and H3 (brace up at the
monster's response turn).

## HELD (attacked, didn't break)

- **E6 bellow stun-lock:** 24 rounds of bellow spam vs bulldozer — monster
  acted 8/24 (60% courage fail, capped 0.95 with fear_itself; stun bridges via
  max(), never stacks). Costs 30 kcal/round. A costly stall, not a lock.
- **E7 damage stack:** max theoretical chain 13.5×
  (haymaker 2.5 × heavy 1.2 × trade 1.5 × rage 2.0 × army-outnumbered 1.5).
  Every multiplier narrated in the strike block. Sanctioned min-max per
  Steve's doctrine (setup: 4 turns + 100 kcal + 10 HP + minLevel-3 synergy).
- **S1 stare_down flee:** routes to 'routed' ("no meat, no trophy"), no hang.
- **H2 brace math:** 100 → 40, single-use consumed on absorb.
- **Intimidate food loop:** already hardened (breaking point, snap/run,
  recordCrime) — not re-attacked.

## Regression
- test-ability-actions-20261007: 21 pass, 1 pre-existing fail (unwired actions
  list — fails on pristine HEAD too)
- test-ability-honesty-20261009: 7 pass
- test-ability-xp-use-20261008: OK
- test-ability-content-20261007: 5 pre-existing fails (pristine HEAD too)
- test-ability-id-resolution-20261008: 5 pass
- attack-brawler-20261008 (prior run): 7 HELD, 0 BREAK
- validate-data.js: crashes on events.json — pre-existing, unrelated
  (abilities.json itself is valid JSON)

## Files
- src/js/abilityActions.js — challenge/end_it_before impls, bellow precheck,
  useAbility turn-last reorder
- src/data/abilities.json — honest copy for both actions
- src/data/build-notes.json — pending-ship entry (player-facing)
- scripts/attack-brawler-20261010.js — proof (17 checks)

Commit: `[needs-eyes]` — the turn-last reorder changes combat feel (bellow
now stops the incoming swing; brace covers the tap-round hit). Steve should
feel it on his phone.
