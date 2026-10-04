# Playtest — forager loop (2026-10-04, ~2h sim+fix session)

**Character**: forager archetype (scheduled loop, rotation 0). Engine-driven play via node: depart → travel to neighbor tile → walk the 9x9 tapping every forageable cell → eat from pack → return to Haven → unload → 3 in-game days.

## What I did
Played 3 full forager days (grove/creek/thicket tiles): 9–19 forages/day, ~250–380 ticks/day (about half the 512 day budget), hauling 10,500–14,300 kcal/day. Ate from the pack when low. Returned to Haven each evening.

## What I found (bugs, all fixed this run)

1. **Player hauls evaporated overnight.** `returnToVillage` added the haul to the phantom `pantryKcal` counter but never to the real pantry item list; `villageEats`' end-of-day sync re-derives the counter from items, wiping the haul. The forager's core loop — feed the village — was mechanically broken. Fix: haul moves as real items into `v.pantry`; new `stockPantry(kcal, name)` helper for all NPC contributions (assignment forage/hunt/scout/kill-loot, NPC wilds returns, gratitude, ambient, quest rewards, villageLives hauls) so every kcal is a real item.
2. **`returnToVillage` wiped the entire inventory** — including the 5 bonded relics, tools, materials, books. Coming home deleted everything. Fix: only food items (kcalEach > 0) move to the pantry; everything else stays in the pack.
3. **Trees lied.** Tapping an oak said "Nuts — about 3 worth. You take them." then the biome roll handed you dandelion greens. Fix: oak → acorns, hickory → hickory nuts (targeted harvest, like bushes); pine message no longer promises nuts it can't deliver (no pine-nut plant in the content pool).
4. **Generated villagers produced 0 food.** `genCharacter` never set `providesPerDay`, so 6 of 12 villagers ate full need and produced nothing — the village burned ~12,400/day from the pantry (the forager could never keep up). Fix: `providesPerDay ≈ 0.92 × need / 1.227`, calibrated so total provision (with starting background-knowledge multiplier) lands near the doc's 92% self-provision; static `villagers.json` / `background_survivors.json` scaled the same.

## Feel verdict
The loop works now and the pressure is right: a good forage day (~10–14k kcal) covers the village's ~2k/day shortfall with margin, but nearby tiles strip in 2–3 days (regrow in 3) so you must range farther — scarcity is real, the pantry visibly grows when you haul. Eating from the pack mid-day feels natural. The trust arc emerged unplanned: at low trust the village draws ~2k/day, shrinking toward ~200/day as trust rises — earning trust literally stabilizes the pantry.

## Open tensions (Steve calls, not worker fixes)
- Starting pantry is ~94k kcal of real food (~2 months at the calibrated burn). The win's pantry half (8,000) is trivially satisfied from minute one — the win is effectively codex-only. Doc said 2,000; the "real food" redesign blew past it.
- Greedy bot win rate fell 20% → 2–8% after honest tree yields (trees were a species slot machine for codex entries). The bot doesn't identify strategically; the human path is intact. Lever is codex acquisition, not tree honesty.
- Pine trees still forage the biome roll (no pine-nut content). Minor fiction gap, documented in code.

## Tests
- `scripts/test-pantry-real.js` (15 tests): haul lands as real items, survives endDay, relics survive, stockPantry real, oak/hickory nuts, pine message honest.
- `scripts/test-village-econ.js` (5 tests): all roster members produce, provision near 92%, sane daily burn, 5 idle days don't starve/explode.
- Full suite: green except pre-existing `test-conversation-discovery` (1 fail, fails on unmodified code too) and `test-ui-audit2` (2 fails tracking a sibling agent's in-flight action-bar reorder — not this run's files).
