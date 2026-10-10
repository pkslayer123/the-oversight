# Trap Balance: Pit Traps vs Food Methods (2026-10-10)

Steve's call: "Those pit traps seem too strong. Or it means the other methods are too weak. Consider deeply and balance."

## Measurement (before)

`scripts/trap-balance-20261010.js` — 30-day net edible-kcal EV per method via real
engine paths (setTrap/craft/checkTraps/checkNets, daily clean+cook, seeded RNG).
3 seeds. Net = after the real 40%-clean + cook pipeline. Ticks counted.

| method | net kcal/day | ticks/day | kcal/tick | risk |
|---|---|---|---|---|
| pit_trap | 3,240–4,119 | ~17–21 | 160–196 | self-fall 50%/re-entry, boar free (was) |
| forage (L4 berries, 2 sweeps) | 1,830–1,930 | ~5* | 343* | knowledge-gated, patch/pack-limited |
| spring_snare | 149–187 | ~6 | 23–29 | minimal |
| snare | 51–110 | ~4 | 15–20 | minimal |
| gill_net | 15–21 | ~3 | 6–7 | none |

*forage ticks undercounted (early returns on pack pressure); net/day is the honest number.

**Verdict:** one pit trap = 1.5–1.9× the scholar's 2,200 kcal/day need, fully passive,
for ~20 ticks/day of amortized labor. Against BALANCING.md's design ("the player is
the 800–1,200/day margin, not the whole supply"; "food scarcity pressure high"),
the pit trap solved food. The gill net, meanwhile, was insulting: 15–21 net/day for
a 12-use item — ~12× worse than a snare for the same passive effort.

## The balance call

Per Steve's rules (min-maxing welcome; declining returns > hard caps; numbers rooted
in reality; buff weak toward strong where apt):

1. **Pit trap: TRAP SHYNESS (declining returns), not a nerf.** `t.trapShy[recipeId]`
   = {level, day}: +1 per catch (cap 3), trapChance × 0.65^level (floor 0.05),
   relaxes 1 level per 3 quiet days. The first pit on fresh ground still hits full
   40% odds; the same hollow stops fooling the locals. Rest it or move the line —
   rotation (96-tick re-digs) is the trapper's real cost. A loud hint fires at
   level ≥2 ("the game trails bend around the hollow now").
2. **Pit trap: BOAR RETRIEVAL beat (honesty).** The L3 recipe warns "a boar in a pit
   is a butchering problem with teeth — spear it from above before you climb down";
   the engine handed the carcass over silently. Now: L3 readers spear from above
   (10% goring, 5–10 dmg); the careless climb down (35% goring, 12–20 dmg). Same
   lie class as the box-trap rattlesnake (fixed 2026-10-10). Carcass math untouched.
3. **Gill net: multi-haul (buff the weak).** A real net doesn't take one fish a night:
   successful nights now haul 1–3 fish (60/30/10), each from the tile's real stock,
   each costing one of the 12 uses. Species-honest kcal preserved (E7). Nets are
   loot-only (no recipe), so this stays a bonus method.
4. **Snare / spring_snare / forage / active hunt: untouched.** Snare is the starter
   tool; forage at L4 is the intended knowledge→food path working as designed;
   active hunting is the high-skill/high-risk path.

## Measurement (after)

| method | net kcal/day (before → after) |
|---|---|
| pit_trap | 3,240–4,119 → **1,920–2,720** (~50%) |
| gill_net | 15–21 → **26–46** (~2–3×) |
| snare / spring_snare / forage | unchanged |

One pit trap now ≈ covers the scholar (~2,200/day) — the trapper fantasy works —
but feeding the village margin takes a real trapline with rotation labor and honest
boar/fall risk. The trapper build stays top-tier (as it should: knowledge-gated,
labor-gated) without printing 2× need from one hole.

## Proof

`scripts/test-trap-balance-20261010.js` — 9 checks × 4 seeds (20261010, 7, 99, 424242),
ALL GREEN:
- shyness threshold: fresh catches on 0.30 roll, shy3 misses (0.30 > 0.11), shy3 still
  catches on 0.05 (floor holds) — deterministic via Math.random override.
- shyness relaxes after quiet days; shy-hint message fires at level ≥ 2.
- boar beat: L3 "spear from above / like the recipe says"; L1 careless framing.
- gill net: multi-haul nights observed; total ≤ 12 fish (finite).
- snare regression: still catches.

Regressions: `test-hunter-ecology-20261008` 20/20; `attack-hunter-20261010` ALL GREEN
×4 seeds (E8 made RNG-robust — the net rebalance shifted the shared stream; test fix,
not game fix); `test-hunter-breakit-20261009` 15/0. Ontology 52/52.

## Files

- `src/js/game.js` — shyness (checkTraps), boar beat (checkTraps), net haul (checkNets)
- `scripts/trap-balance-20261010.js` — EV measurement (before/after)
- `scripts/test-trap-balance-20261010.js` — proof tests
- `scripts/attack-hunter-20261010.js` — E8 RNG-robustness fix
