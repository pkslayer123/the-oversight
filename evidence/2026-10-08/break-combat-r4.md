# Break-it: combat engine round 4 — hostile re-attack of the turtle fix (2026-10-08)

## Target selection note (queue jump)
Queue said index 3 (social systems), but social was already break-it-tested twice this run-day
(d53be21, d2a0010 — all fixes landed). The fresh turtle fix c73695b had JUST landed and changed
fight-end semantics — a high-value adversarial target. Jumped to index 0 (combat engine);
target index advanced 3 → 1.

## Mission
Hostile re-verification of c73695b ("Break-it turtle: disengage + honest pursuit" — tbEndCheck
disengage at 3+ tiles from non-chasers; barrier flee auto-succeeds vs non-chasers; failed flees
leave stayers behind). Worktree: break-combat-2, commit fe3fdd8 (rebased cleanly onto master
after sibling hunter commits 23556bb/23bfd37/9179c81 moved HEAD; game.js overlap was in a
different region — trap code vs combat code).

## Breaks found (3), all fixed with proof tests

### 1. EXPLOIT — flat 3-tile disengage ignored monster attack reach (fixed)
Walking 3 tiles from a gallowdeer (beam length 9, `follows:false`) ended the fight — a free
escape from the wave-1 apex. 9 of 17 `follows:false` monsters have ranged attacks (reach 3–9).
Fix: new `Game.tbMonsterReach(m)` computes honest striking distance from the attack pattern
(beam/line → `length||5`, direct/single/lockon → `range||3`, burst/ambush → `radius||1`,
else 2; defaults mirror the engine's own gates). Disengage now requires `d > max(2, reach)`
per monster (the 2-floor preserves shipped turtle behavior for the speedbump).

### 2. EXPLOIT — disengage deleted wound-up telegraphs (fixed)
Stepping to distance 3 mid-windup erased committed attacks, contradicting the "no dodging it"
fiction (monsters whose telegraphs resolve get the hit). Fix: an active telegraph holds the
fight until it resolves. Verified telegraphs always resolve/cancel (no softlock); barrier
exit stays available.

### 3. HONESTY — disengage messages were lies (fixed)
"they're still out there, if you want them" / "it's still back there, if you want it" —
wild-encounter monsters are `removeWorldMonster`'d at fight start and never restored.
Messages now say "they melt back into the wilds." Also fixed a stale comment claiming
stayers persist as world monsters. Ontology header + docs/ONTOLOGY.md updated; ontology
gate green.

## Proof
- `scripts/test-combat2-breakit-20261008.js`: 15/15 × 5 seeds (6 Red pre-fix, Green post-fix)
- `scripts/test-turtle-breakit-20261008.js` (the fix's own suite): still 13/13 × 3 seeds
- Regression: softlock 9/9, doubleko 8/8, phantom-pack 7/7, brawler-flee-truth 14/14,
  r3-async 21/21, ember PASS. dive-declare's 1 fail + 3 crashing suites
  (combat-engine, glasswing-bask, party) fail identically on base — pre-existing stale
  tests, out of scope.

## Sibling sweep
- fieldFights.js: no distance disengage (morale-driven) — clean
- betrayal wrapper can't reach disengage — clean
- playerFled is betrayal-only — clean

## Held (attacked, resisted)
- No XP/loot on fled fights
- No re-engage of disengaged monster (it despawns)
- Strike calc applies each bonus exactly once
- monsterBehaviors.js properly wired into the engine
- Only `ducks_in_a_row` lacks `follows` (defaults to chaser — the conservative direction)

## Verdict
Combat engine (turtle-fix surface) BROKE and was REPAIRED. The re-attack earned its keep:
the flat-distance rule was a reach exploit, and disengage wiped committed attacks.
Both now match engine reality. Live: fe3fdd8-20261009-030401 on both endpoints.
