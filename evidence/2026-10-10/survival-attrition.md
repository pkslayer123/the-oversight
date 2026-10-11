# Survival Attrition — Part A2 Combat/Attrition Numbers (2026-10-10)

## Scope
Numbers tuning only. No structural difficulty restructure. No blanket easy-mode. No late-game spike mechanisms.

## Baseline (40 seeds, competent policy, 200-day cap, current master)
- Median survival: **32 days** (max 200, 36/40 village-lost, 4 survived)
- Deaths/run: **13.22** total
- Early (d1–30) deaths/run: **11.53**
  - PLAYER-combat: 3.46 | PLAYER-the night: 1.65 | V-combat: 1.65 | V-wounds: 0.70 | V-sickness: 0.50 | V-starvation: 0.33

### Diagnosis: what actually kills
1. **The 1v2 hushwolf pack is a death sentence.** 96% of solo encounters spawned 2 wolves; 76% of all fights killed the player. The player enters fights at ~67 HP avg (ground down by attrition) and loses the DPS race 1v2 in ~3 rounds. Fleeing is effectively impossible (4 moves to edge while taking hits).
2. **Overnight attrition grinds the player down.** Avg -19.4 HP/night: dehydration (-15), starvation spiral (cap -25), disease ticks (-8/day), cold nights (-18). Sleep healed +20 (hall) → net +1/night. The player treaded water and entered fights hurt.
3. **Wave-2/3 monsters in the d11–30 kill zone.** Callback [30,50] and bright_idea [31,48] unlock at day 8/25 vs 100-HP players.
4. **Villager attrition:** wounds (-20..-35 events), sickness (4-6/night unmedicated), famine (-5/day).

### Policy gaps (documented, NOT fixed — out of scope)
The competent policy inflates measured deaths vs a human:
- Fights **unarmed the entire game** (never crafts/equips weapons; unarmed DPS ~13/round).
- **Never fills water at the haven well** ('haven' doesn't match its creek|well|spring|river|pond regex) → chronic dehydration.

## Changes

### Monster damage bands (src/data/monsters.json)
31 monsters trimmed ~15–20% (wave 1: hushwolf [14,20]→[12,17]; wave 2: bright_idea [31,48]→[26,41]; wave 3: top-shave only, e.g. gavel [40,60]→[37,55]). Full list in git diff. Wave-3 stays brutal; wave-1 stays scary.

### Hushwolf pack: solo 2→1 (src/data/monsters.json)
**Design call for Steve's overrule.** partyTactics.js comment states intent: "solo scouts keep a fair duel, parties face the pack." The 1v2 produced 96% player death. 1v1 at [12,17] is a desperate race:
- 100 HP: 10/10 survive, avg 63 HP left (takes ~37 damage — traumatic, winnable)
- 85 HP: 8/10 survive | 67 HP: 2/10 survive | 50 HP: 0/10 survive

"Every animal might kill you" — intact. Pack identity preserved for parties (4). Revert is one line.

### Attrition curves
- **Hydration burn** (engine/calories.js): 35+15 → 30+12 (~55/day vs ~70)
- **Dehydration** (engine/calories.js): -15 → -12/night
- **Starvation** (engine/calories.js): cap -25 → -20, divisor 150 → 180
- **Sleep heal** (game.js): hall 20→30, bunk 35→44, tent 25→33, fireside 18→24, ground 12→16. Net vs -18 attrition: +12/night (was +1). ~3 nights to recover from a wolf mauling. Costs: a night + full daily food/water — the economy, not an exploit.
- **Cold night exposed** (game.js): -18 → -15. **Tent smoke**: -10 → -8.
- **Villager sick** (game.js): 2+sev*2-healer → 1+sev*2-healer (sev1: 4→3/night)
- **Wound events** (game.js): -20..-35 → -15..-28
- **Famine** (game.js): -5 → -4/day; recovery +2 → +3/day when fed

### Bug fix (found during exploit test)
`field_medicine` set the day-part gate BEFORE the 100-kcal check, so a refused (too-hungry) attempt consumed the use. Moved gate after the check, per the break-it r3 rule ("refused tap never eats the turn").

## Results (40 seeds, competent policy)

| Metric | Base | Tuned | Δ |
|---|---|---|---|
| Median days | 32 | **43** | +34% |
| Early deaths d1–30/run | 11.53 | **10.17** | **-12%** |
| PLAYER-combat (d1–30)/run | 3.46 | 3.13 | -10% |
| PLAYER-the night/run | 1.65 | 0.95 | **-42%** |
| V-combat/run | 1.65 | 1.20 | -27% |
| V-wounds/run | 0.70 | 0.33 | **-53%** |
| V-sickness/run | 0.50 | 0.45 | -10% |
| Villager deaths/run | 4.3 | 3.0 | **-30%** |

Late game still hard: 38/40 runs end village-lost (famine fuse intact). 2/40 survive to 200.

## Feel check
- Monsters still scary: 1v1 hushwolf at 67 HP kills 8/10. Wave-3 [28,46]+ still mauls.
- Violence desperate/traumatic: winning a wolf fight costs ~37 HP. Not power fantasy.
- Villagers are individuals: deaths come from wounds/sickness/combat situations, not flat scaling. No HP inflation.

## Proof tests
- `scripts/test-survival-attrition-20261010.js`: 20 checks, green ×3 seeds (11, 23, 42). Sensitive: 4/20 on base.
- `scripts/test-survival-attrition-exploit-20261010.js`: 16 checks, green ×3 seeds. No infinite-HP loop: rest gates on crisis, field_medicine costs 100 kcal + once/part, sleep costs a day + food/water, heal capped at maxHealth.
- Regressions: `test-disease-break-20261010.js` (53 pass), `test-combat-break-20261010.js` (19 pass).

## Open questions for Steve
1. Hushwolf solo 2→1 — revert is one line if the pack feel matters more.
2. Wave-2/3 bands vs day-8/25 unlock pacing: bands trimmed, but is the unlock pacing itself right? (Out of numbers scope.)
3. Policy gaps (unarmed fighting, haven-well regex) inflate measured deaths — a policy/harness fix would shift numbers substantially.
4. Famine fuse untouched — food economy is bal-survival lane.
