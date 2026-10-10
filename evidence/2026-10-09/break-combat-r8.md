# Break-it: combat engine — round 8 (2026-10-09)

Hostile pass, fresh ground only. Rounds 1–7 vectors NOT re-attacked; their
suites re-ran green (r7 29/29, r3-honesty 18/18, disease-breaks 26/26,
wave2-harden green, ontology 52/52). Proof:
`scripts/test-combat-break8-20261009.js` — 28/28 AFTER on seeds 20261009, 1,
7, 99. BEFORE: 6 checks fail on stashed pre-fix code (B6b, B7a, B7b, B8a,
B8b, B8c).

Canon: docs/CANON.md read first; combat has no dedicated canon doc beyond
CANON.md's standing rules (said-vs-engine honesty, monsters-fought-not-rolled,
knowledge gating). docs/DISEASES.md consulted for the mosquito/tick vectors.
Nothing invented.

## KILLS (broke + fixed, all with proof)

### F1. HONESTY: "Armor absorbs 0." (stated-zero class)
`tbDamage`'s player block and villager block printed the absorption line
unconditionally: `absorb = min(final-1, round(final*r))` is 0 on chip hits
(e.g. P=5 vs 1–2 damage, P=20 vs 1 damage) → "Armor absorbs 0." reads like a
broken promise. The monster-hide block already gated on `absorbed > 0`.
**Fix (game.js):** both player and villager absorption lines now fire only
when absorb > 0. Proof B6b: 6 (P, hit) combos asserted silent; fails BEFORE.

### F2. HONESTY (comment): fieldFights "same as threatLevel sums them" was false
The RANGED COUNTS comment claimed the off-screen weapon-bonus formula matched
threatLevel — but threatLevel sums melee+ranged WITHOUT halving, while the
field fight computes round((melee+ranged)/2). The formula itself is the
deliberate 2026-10-09 design (no grid off-screen; "helpers, not heroes" half
rule, same as tactical); only the comparison was wrong. **Fix
(fieldFights.js):** comment now describes the real formula and names the
threatLevel difference. Proof B4: melee-only gear matches across engines;
tactical halves melee-only, field halves the sum.

### F3. EXPLOIT + HONESTY: terrain-step damage was dodgeable
`tbTerrainStep` (paper/leased/shadowban/scorch) ran through `tbDamage`
without `undodgeable` — you could slip aside from the ground you stepped on.
Two breaks: (a) HONESTY — "You slip aside — it misses clean. (footwork)"
followed by "Paper cuts! The fine print bites. (0)"; (b) EXPLOIT —
risk-free agi farm: ping-pong two paper tiles, +1 agi practice per dodged
step, zero damage (r6's "dodge farming has real risk" note didn't cover this
vector). **Fix (game.js):** terrain damage is undodgeable (same rule as the
tick's latched feed — unavoidable contact), and the terrain lines gate on
landed > 0 (covers the brace edge). Proof B8: 100% dodge chance still takes
the 1 damage; line states (1); no "(0)" line. Fails BEFORE.

### F4. HONESTY: dodged mosquito drink still "drank" and still went heavy
`tbMosquitoTurn` dive→drink: on a footwork dodge (landed=0) the old code
still said "It lands on you — the proboscis slides in. (0 damage)" and still
transitioned to heavy ("It lifts off heavy and slow, drunk on blood") —
handing a free punish window for a drink that never happened. **Fix
(game.js):** landed > 0 → drink/heavy/virus as before; miss → back to
'circle', same as the wobbled-dive miss path. The design doc says heavy
follows DRINKING; a miss isn't a drink. Proof B7: no proboscis line, phase
back to circle, no virus on a miss. Fails BEFORE. [needs-eyes]: monster
rhythm behavior change.

## HELD (attacked, resisted — the deeper level)
- **30-monster census (B1):** every monster takes a turn through the
  production `tbMonsterTurn` path without throwing; every monster dies
  cleanly via `tbDamage` + `tbEndCheck` (fight resolves); exactly one corpse
  per kill (no dup, no drop). No dead modules, no crash turns, no death
  softlocks anywhere in the 30-monster roster.
- **Sweep-hold state machine (B2):** gallowdeer mid-sweep-windup holds lethal
  damage at 1 HP ("the light is already gathered"), repeat hits hold at 1
  (return 0), and it becomes killable the moment `hasFired` is set — no
  perma-1-HP softlock. Death-throes beam fires when killed after a canceled
  telegraph (scream), per design.
- **Mosquito virus honesty (B3):** landed drink applies eurika OR east_nile
  50/50 per landed bite, narrated via applyStatus's never-silent rule —
  exactly the docs/DISEASES.md contract ("50/50 which virus on a landed
  bite"; min-maxers may seek both). Both-held bite: no crash, no stack.
- **Feastburn refusal honesty (B5):** out-of-range strike refusal burns no
  kcal and prints no FEASTBURN line (r6 note re-verified).
- **Armor invariants (B6a):** across P ∈ {0,5,20,54,100,500} × hits 1–60:
  at least 1 always lands, absorption never exceeds hit−1, no immunity cliff.
- **Brace:** "Reduce next incoming damage by 60%" applies post-armor per-hit
  with both numbers stated (`dmg → reduced`) — honest.
- **Footwork:** tiers are qualitative ("You are hard to hit."), no stated %
  to contradict the formula.
- **Feastburn gorged:** `feastState()` returns 'gorged' at ≥75% of max bank —
  matches the BALANCING.md doc.

## Regressions
- test-combat-break8 28/28 ×4 seeds (20261009, 1, 7, 99); 6/28 fail BEFORE.
- test-combat-r7 29/29; r3-honesty 18/18; disease-breaks 26/26; wave2-harden green; ontology 52/52.
- Pre-existing failures UNCHANGED (verified identical on stashed original):
  test-monster-vectors 1 fail — "no second virus when already carrying" is a
  stale expectation superseded by disease break-it B4 (second virus reachable
  by design; DISEASES.md canon). test-terraform FATALs on `seMoveMod`
  (harness/module-order, both versions). test-combat-engine-20261007
  references removed `monsterTacticPlan` (stale test, both versions).

## Sibling-sweep notes
- Swept all `${landed}`/`${absorbed}` say-lines in the combat path for the
  stated-zero class: shrapnel, heavy-blunder, tick-feed, monster-hide,
  stolen-guard, resist lines all already gated. Only F1's two lines and the
  F3/F4 cases were live.
- Tick latch "(0)" edge (braced latch): the latch is positional and real;
  the number states what landed — honest, left alone.

## Files changed
- `src/js/game.js` — armor absorb lines gated (F1); terrain-step
  undodgeable + landed gates (F3); mosquito drink-miss → circle (F4).
- `src/js/fieldFights.js` — RANGED COUNTS comment honesty (F2).
- `scripts/test-combat-break8-20261009.js` — 28-check proof (new).
