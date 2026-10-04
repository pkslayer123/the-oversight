# Survival Feel Playtest — Days 1-3 (2026-10-04)

**Method:** Realistic bot play on current build (`7494da7`). Bot navigates the 9x9 detail grid via `microMove` to reach plant cells before foraging — like a human would. Three profiles: competent+packed, new-player (no pack), bad-player (no water management). 4-6 runs each, plus a 7-day trajectory check.

## The headline

**The calorie economy is fixed.** The old "structurally deficit" (15 forages/day to break even) is gone. But it may have overcorrected — food is now so abundant that **water, not food, is the binding survival constraint.** A competent player feels zero food pressure in days 1-3. Whether that's right depends on what days 4-9 feel like (see below).

## 1. Food/water pressure — tense but fair, or hopeless?

**Neither. It's comfortable.** And that's by design ("breathing room to learn").

| Profile | Day 3 state | Verdict |
|---|---|---|
| Competent + packed | kcal ~1100, hyd 45, hp 93-95, inv 21k-30k | No pressure at all |
| New player, no pack | kcal 1200-1460, hyd 45, hp 90-93, inv 0-5k | Mild; starting items carry you |
| Bad player (ignores water) | kcal ~1000, hyd 0, hp 60-64 | Dying — dehydration kills by day 5-6 |

Water is the real game. Ignore it and you spiral: -15 hp/day at 0 hydration. Food, if you forage at all, is a non-issue.

**Feel:** Days 1-3 feel like a camping trip, not a survival situation — for a competent player. The tension is supposed to arrive later (see §6). If Steve wants day-1 tension, it's not here. But the code comments say the breathing room is intentional, so this may be exactly right.

## 2. Starting supplies — is 3.9 days right?

**Yes, for the design intent.** The numbers:

- Village pantry: 94,200 kcal → ~43,700 after 3 days → ~13,000 after 7 days
- Village burn rate: ~11,000-16,000/day for 12 people (~900-1,300/person/day, less than the 2,000 nominal)
- **Pantry hits zero around day 8-9.** That's when the village gets hungry. That's when the game starts.
- Personal pack (density-optimized): 12,700 kcal, lasts 5-7 days with foraging supplement

The arc is: days 1-3 learn, days 4-7 comfortable, day 8+ the pantry's empty and you're the provider. This is a good arc — **if** the mid/late game delivers on the pressure. The 3-day test can't verify that, but the trajectory points the right way.

## 3. Forage yields — do you feel progress?

**Yields are high. Possibly too high.**

- Fresh tiles: 1,000-1,900 kcal/forage (10-15 units × 45-200 kcal/unit × richness)
- Depleted tiles: 400-800 kcal/forage
- Cost: 120 kcal. Return: 8-15x.
- 2 forages/day covers your entire daily need (2,200 + actions). 4 forages = massive surplus.

For comparison, the old balance test measured 193/forage. The `fb6396c` "forage buffed" commit 8x'd yields. The old problem (can't survive by foraging) is solved. The new question: **can you ever go hungry if you forage?**

Natural brakes that exist:
- Tile stock: 1-3 forages per tile, then it's empty
- Regrowth: +1/day (slow)
- Travel costs to find fresh tiles
- Carry weight: 20kg caps what you haul
- Spoilage: greens last 2 days

Natural brakes that DON'T exist yet:
- Seasons (plants available year-round)
- Competition (villagers don't forage against you yet)

**Feel:** Foraging feels GREAT — you fill a bag, not a pocket. But it never feels desperate. A "skilled forager thrives" is the design goal, and they do. The risk is that food becomes a solved problem by day 3 and never threatens again. The village pantry depletion (day 8-9) is supposed to be the counterweight.

**Recommendation:** Don't nerf yields yet. Instead, verify that days 8-14 create real pressure via village demand + tile depletion + travel distance. If the player can still easily feed themselves AND the village, then consider tuning.

## 4. Pantry packing — does the density tradeoff feel strategic?

**Yes. This is one of the best-feeling systems.**

The math the player does (consciously or not):
| Food | kcal/kg | Verdict |
|---|---|---|
| Peanuts | 1,700 | The winner. Pack these. |
| Dried meat | 1,333 | Great. |
| Canned soup | 625 | Fine. Ready to eat. |
| Rice (raw) | 400 | Trap. Needs cooking for 700. |
| Dried beans (raw) | 300 | Trap. Needs cooking for 600. |

Skipping the raw beans/rice unless you know how to cook them is exactly the "knowledge is calories" design. A smart player packs 40 peanuts + 10 dried meat + 6 soup = ~12,700 kcal in ~10kg. A naive player packs beans and gets half the value.

**BUG FOUND:** `takeFromPantryBulk` double-counts food weight when water is included in the same call. The water path computes `carry = inventory + waterWeight + totalKg`, but inventory already includes the food just taken (and `totalKg` tracks it again). Result: packing food + water in one call silently blocks the water. Workaround: two separate calls. **This needs a fix** — it's the exact UI flow Steve asked for (one stockpile, two sliders, one pack action).

Water independence works: taking 4L water doesn't touch food, and vice versa. The design Steve asked for is correct; the implementation has this one bug.

## 5. When do you first feel real danger?

| Profile | First danger |
|---|---|
| Competent + packed | Never (7 days tested) |
| New player, no pack | Never in 3 days (hp 90s, stable) |
| Bad player (no water) | Day 3 (dehydration warnings, hp declining) |

**The game doesn't scare a competent player in week 1.** The fear is supposed to come from the village pantry emptying (day 8-9) and the System arriving (day 7). For a survival game, days 1-3 being safe is a choice — the "breathing room" choice. It's defensible, but Steve should know: **if he wants day-1 tension, it's not here.**

The dehydration death spiral for bad players is well-tuned: telegraphed (warnings), escapable (find water), lethal if ignored (dead by day 6). This is the model for how food pressure should eventually feel.

## 6. Is the calorie economy fixed or still broken?

**Fixed, but possibly overcorrected.**

| Metric | Old (balance test) | New |
|---|---|---|
| Forage yield | ~193 kcal | ~1,300 kcal |
| Forages to break even | 15.5/day (impossible) | ~2/day (easy) |
| Competent 3-day outcome | Spiral, 0 kcal | Stable, 21k-30k banked |
| Village pantry | 36,000 (1.5 days) | 94,200 (~8 days) |

The old game was a countdown timer. The new game is a camping trip (days 1-3) that becomes a logistics challenge (day 8+). That's a massive improvement and matches the design intent.

**The open question:** does the pressure actually arrive on day 8+? The trajectory says yes (pantry → 0, tiles deplete, travel farther). But it's untested. If a competent forager can feed themselves + 11 villagers indefinitely, the "food is a real scarcity" thesis fails.

## Friction found

1. **Map-tile vs detail-grid disconnect.** Traveling to a tile with "rich pickings" and hitting forage can return "Nothing edible within reach" — because the 9x9 detail grid has no plant cells adjacent to you. You must manually walk the grid to find plants. This is INTENTIONAL ("the world is not a slot machine"), but it's the biggest feel friction in the foraging loop. The new contextual action strip should mitigate it — verify that a human can easily spot and walk to plants.

2. **Bot couldn't find plants in 2/3 no-pack runs** (0 forages). A human with eyes will do better, but if plants are hard to spot in the 9x9, this will frustrate. Worth a visual clarity check.

3. **D1 kcal trajectory is suspiciously identical** (2200→1020) across all runs regardless of map or yields. The eating logic normalizes it, but it's worth confirming there's no hidden kcal clamping.

## Recommendations (ranked)

1. **Fix the pantry water double-count bug.** It's the exact flow Steve demoed. One-line fix in `takeFromPantryBulk`.
2. **Don't touch forage yields yet.** Verify days 8-14 first. The village pantry cliff is the designed pressure point — test whether it actually bites.
3. **7-day+ playtest with village focus.** Does the player feel the village's hunger? Is there social pressure to share? Can one forager feed 12?
4. **Visual clarity check on plant cells** in the 9x9. If a bot can't find them, some humans won't either.
5. **Consider:** should the competent player feel ANY food pressure in days 1-3? Currently no. If Steve wants "tense but fair" from the start, the breathing room needs to be shorter or the starting pack smaller.

## Raw data

- 4 runs × 3 days (competent+packed): all survived, no warnings, hp 93-95
- 4 runs × 7 days (competent+packed): all survived, no warnings, hp 80-95, pantry → ~14k
- 3 runs × 3 days (no pack): all survived, hp 90-93
- 6 runs × 5 days (bad player): hp 12-15 by day 5, dehydration spiral from day 3
- Scripts: `/tmp/survival-v3.js`, `/tmp/survival-v7.js`, `/tmp/bad-player.js`
