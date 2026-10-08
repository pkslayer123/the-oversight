# Real fights — evidence (2026-10-08)

Steve's law (his words): "Why are you treating monster encounters like rng? It should be a fight. A hard one." Villager-vs-monster meetings resolve as REAL blow-by-blow fights with real stats and the monster's real behaviors — never a single outcome table. This replaces the parity hunt's stat-weighted outcome table in full.

## What was built

**New module `src/js/fieldFights.js`** (self-attaching, loads after villager-agency.js, @ontology header validated):
- Rounds (cap 15), no grid, no UI, ~5ms per 100 fights. Initiative: monster speed vs villager 3, re-rolled each round.
- Monster acts with its REAL attack data: name, damage range, pattern, speed, pack, wave from monsters.json. The Highbeam Deer's antler thrash (`roll([10,16])` every turn, in addition to the beam) is ported verbatim from `tbAntlerThrash` — closing in has a price here too.
- Villager strikes with the TACTICAL formula verbatim: `roll([4+wb, 8+wb])`, `wb = round(wbonus/2)` via `S.equipment.weaponBonusOf` ("helpers, not heroes").
- Morale-driven flee: villager breakPoint = clamp(0.5 − min(0.3, bravery×0.015) − bold 0.1 + cautious 0.1, 0.15–0.6); monster breaks at hpFrac < 0.25 (0.15 wave≥2); pack breaks when the lead drops (documented hushwolf weakness: broken coordination).
- Villager HP on the 0–100 village scale (`v.health[vid]`); monster HP from the world entity when present (wounds persist back onto `m.hp` — part of the world, not RNG) or rolled from its hp range for ephemeral meetings.
- Pre-fight awareness check ("saw it, gave it room") is kept as a contact check, not an outcome. Once steel is crossed: rounds until someone drops or runs.
- Every fight returns a record: outcome (evade/vKill/mFlee/vFlee/vDie/standoff), rounds, vTaken, mDealt, hp left, pack count, log. `fieldFightSummary()` gives gossip one honest sentence describing the actual fight.

**Rerouted callers (no other code paths resolve villager-vs-monster):**
1. `game.js resolveWildMonsterEncounter` — table deleted; routes the fight record into existing downstream: kill → removeWorldMonster + trust + remember(hero); drive-off → monster flees to adjacent unsafe tile; mauled → `hurtVillager(vid, rec.vTaken)` with REAL wounds; death → 500-damage pipeline + villageEvent('death'). (Also fixed a carried-over typo: duplicate `[-1,0]`, missing `[0,-1]` in the drive-off directions.)
2. `villager-agency.js expeditionMonster` — the flat deathP/hurtP/evade/kill/stand rolls are gone; awareness via `fieldFight(..., {awareness:true})`, outcomes mapped to the existing hurt/death pipelines with the fight's real wounds and fight detail in deeds/gossip. Fights teach: knowledge + bravery XP on contact.

**Table is dead — verified at the source level:** `resolveWildMonsterEncounter.toString()` contains `fieldFight` and no `killP/driveP/mauledP/dieP/deathP/hurtP`. Old 35/25/25/15 table code path removed, not bypassed.

## Design decisions (documented, Steve can overrule)
- Pack monsters fight as a pack: every live member acts each round (same as the tactical engine's `count = mdef.pack || 1`). Three hushwolves vs one unarmed villager is a mauling — honest.
- No armor modeling in field fights (matches the tactical engine's own villager strikes, which apply raw rolls).
- No grid/telegraphs off-screen; pattern type flavors record text, not math.
- Standoff at the 15-round cap: the worse-off side disengages.
- Villagers do NOT get feastburn or ability damage — they fight with steel and nerve only. "No heroics they haven't earned."
- `dist` param kept on expeditionMonster (signature stable); wave-based roll removed.

## Proof results — `scripts/test-real-fights-20261008.js` (15/15, seeds 20261008/7/99)

| Matchup | Result |
|---|---|
| Weak (20 HP) vs hushwolf | 200/200 die or driven off; **0 clean kills** |
| Strong+armed (100 HP, bravery 40, hunting spear) vs bulldozer | 154 kills + 46 drive-offs; **every win took real wounds**, rounds ≥ 1 |
| Strong+armed vs Highbeam Deer (160 HP) | **0 kills** in 200; ~50/50 driven off / dead |
| Record | every fight: valid outcome, rounds ≥ 1, log ≥ 1 line, wounds logged both ways |
| Gossip | summary names real rounds/wounds ("killed the bulldozer alone — 3 rounds, 44 taken") |
| Downstream | kill removes monster / wounds applied / news posted — verified via spies |
| Performance | **100 fights in 5ms** |

## Regression suites
- `test-parity-combat-20261008.js` — rewritten to the fight contract (was asserting the rejected table): 5/5 green.
- `test-villager-agency.js` — 37/37 green (drives the new expeditionMonster in situ). Harness updated to eval fieldFights.js.
- `test-combat-break-honesty-20261008.js` — green (tactical engine untouched, as required).
- Ontology: 49/49 validated, release permitted.
- PRE-EXISTING breakage (not mine, verified the referenced functions exist nowhere in src/js): `test-villager-agency-20261007.js` crashes on `Game.daylifeOf is not a function`; `test-combat-engine-20261007.js` crashes on `C.monsterTacticPlan is not a function`. Both reference functions absent from the codebase — dead tests from earlier refactors. Flagged for a cleanup run; not touched (out of area).

## Bugs caught during this build
1. **Pack liveness flag never updated** — `members[mi].alive` was set at construction but never cleared on death; dead pack members would have kept attacking. Fixed to hp-driven liveness (matches the calibrated sim).
2. **Wrong equipment namespace** — looked up `Scattering.equipment`; equipment.js attaches to `window.S`. The try/catch silently left wb=0 (unarmed everyone). Fixed; strong+armed vs bulldozer went from 0 kills to 154.
3. **Parity test used 30 HP for the Highbeam** — a table-era artifact (HP didn't matter to a table); real spawns use the hp-range base (150 for gallowdeer). Fixed the test to use real spawn HP; the "nobody kills it alone" proof now holds against the real 160-HP benchmark.

## Calibration narrative (seed 20261008, 300 fights)
Unarmed villagers basically never kill: avg vs hushwolf → 293 driven off / 7 dead; strong vs bulldozer → 283 driven off / 17 dead. Steel changes everything: armed vs bulldozer → 74 kills, armed vs hushwolf pack → 87 drive-offs (lead wounded → coordination breaks). Highbeam Deer vs anyone alone: 0 kills, ever. That is the intended "hard fight."
