# Water/Fire Reality Audit (2026-10-08)

Steve's five questions, measured before and after.

## MEASUREMENTS (before)

Simulated days 1–7 × 5 seeds, sensible player (drinks, fills at haven):

| Question | Before |
|---|---|
| Q1: Haven fire too simple? | YES. Hall hearth is a permanent map cell — infinite free fire. Boiling/cooking at haven cost only kcal, never fuel. |
| Q2: Water too easy / dirty never drunk? | YES. Villagers never drank (no daily consumption). Cistern 20L → ~18L after 7 days. Water duty produced 2–4L CLEAN/day from nothing. Dirty water nearly unreachable. |
| Q3: Water weight? | Correct already: 1L = 1kg, carry-gated. |
| Q4: Consumption amounts? | Player: 35 hydration/night ≈ 0.7L/day (reality 2–3L). Villagers: 0L/day. |
| Q5: Heat/exertion scaling? | None. No weather or tick effect on thirst. |

## DEATH-PIPELINE SKIPS (break-it travel&map flag — verified, all real)

1. `villageLives()` wound death: roster removal + death line, but no registerDeath/corpse/gossip/dead-mark.
2. `villageEats()` famine death: same skip ("starved. Slowly." with no corpse).
3. `villageSicknessTick()`: lethal sickness (via hurtVillager) could coincide with recovery — "on the mend" announced for a corpse; dead lingered in v.sick.
4. `hurtVillager` lethal: fixed by the DEAD IS DEAD landing (registerDeath + removeVillager('killed') + gossip) — verified it covers the sickness path.

All fixed. `drinkWild()` creek -10 was already tombstoned (zero callers).

## TUNING (Steve: figure it out yourself — overrule anything)

**Villagers drink like people** (`villageDrinks`, endDay): 2L/day each, clean first then dirty, from the cistern. No water: -5 health/day (thirst kills through the real pipeline). 11 villagers ≈ 22L/day demand.

**Water duty hauls DIRTY** (was: 2–4L clean from nothing; now: 10–14L risky creek water). The creek is the risk; the hearth is the answer.

**Hearth boils** (`hearthBoil`, endDay): dirty→clean at 6L/wood from the village woodpile. No wood → no boiling → the village drinks dirty → gut rot (10%/day, the existing vector). The hearth itself stays lit (Haven's heart); boiling is the work.

**Village woodpile** (`v.wood`, starts 10): wood duty stocks it (3–6/day, was: player inventory). Player takes logs via `takeWood()` (fire-cell action at haven, 2kg/log, carry-gated) or harvests their own.

**Player thirst is real** (`hydrationBurn` in calories.js): night 35 + day 15 base; clear (sunny) ×1.5, cold ×0.75; exertion −1 per 32-tick batch. Hard sunny day ≈ 74 (≈1.5L); idle cold day ≈ 46. Sleep preview telegraphs the real number.

**Balance sketch** (1 water duty): day 1 ends ~8L clean; dirty drinking starts ~day 2–3; gut rot follows. Two haulers + wood duty sustains 12 villagers. Water is work now — ~2 villagers on water, wood every couple days — but never a chore: the decisions are "who hauls?" and "is the pile stocked?", not "ugh, water again."

## PROOFS — scripts/test-water-fire-20261008.js: 19/19

- 1L = 1kg in carry model; burn scales (46 → 58 → 74 across idle-cold / mid-rain / hard-clear)
- villagers drink 2L each; dirty sets drankDirty flag; gut rot fires (44 cases / 30 forced dirty days)
- water duty hauls dirty; hearth boils with wood; no wood → no boiling
- wound / sickness / thirst deaths all mark dead + corpse + roster removal; sick record cleaned
- takeWood draws from pile (carry-gated)

## REGRESSIONS

food-reality 90/90, cooking model ALL PASS, parity-disease 6/6, fill-water-cap 12/12, pour-water DONE, cook-water 23/23, meals-like-people 20/20, villager-agency 43/43, monster-diseases ALL PASS, ontology 48/48 (release permitted).

## DESIGN CALLS (Steve can overrule)

1. Villagers 2L/day (realistic) — makes water 25% of village labor. Could drop to 1.5L.
2. Hearth never goes out; only boiling costs wood. (Alternative: hearth needs daily fuel — more pressure, more chore.)
3. Water duty 10–14L/day (a full day's hauling). Boiling 6L/wood.
4. Player's personal boiling at hearth still kcal-only (tending); village boiling costs wood.
5. Poisoning/disease numbers untouched (30% player risky drink, 10% villager gut rot).
