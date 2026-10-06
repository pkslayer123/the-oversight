# Playtest — forager KNOWLEDGE loop (2026-10-05, 23:00 CDT loop run, rotation 0)

**Character**: ignorant forager (street artist / accountant backgrounds — no plant knowledge).
**Question**: does learn → recognize → forage deliberately actually change how a forage day feels and pays?

## What I did
Played 2 full blind→knowledge days via node (honest adjacent-step walking, area-sweep foraging, real sort ritual at camp), then probed each mechanic in isolation: glyph reveal, deliberate-vs-blind kcal, harvests→level-2, testCautiously, villager teaching paths, lump rot, pantry trajectory.

## The loop is real and honest (verified)
- **Glyphs flip**: unknown plants render 🌱 / berry bushes 🫐 until identified, then species glyphs (🌼🍇🧅…). Verified on fresh tiles pre/post knowledge.
- **Knowledge pays ~4x/press**: blind 73 true-kcal/press vs deliberate known-species targeting 317/press (measured with honest lump-composition accounting — lumps carry kcalEach: 0 by design).
- **Depth accrues**: familiar + identified harvests → level 2 at 5 harvests ("Deeper knowledge… Yield +50%"), level 4 at 15 (2x). Verified via instrumented sweep.
- **testCautiously is a great workhorse**: staged inspect→skin→lips→taste→meal, always identifies the plurality species, risk scales with edibility. The cautious-test naming moment lands.
- **No kcal leaks**: splitLumpOut restores kcalEach from plant data on identification; returnToVillage keeps a day's food (2000) and unloads surplus as real items (73dce8e semantics — the old "vacuum everything" starved the player).

## Feel verdict: the teaching moment is structurally unreachable when it matters (Steve call)
- **Blind hauls are nutritionally worthless for ~2 days.** Day-1/2 hauls are all unknowns (kcalEach 0); they sit on the counter with a **~2-day rot clock** (verified: unidentified lumps vanish on day 3) while the village burns **~6k/day** from the 47k starting pantry. The forager feeds no one until they identify.
- **Villagers can't help.** Across the village ~3 species known total (only botanist/forager/cook backgrounds seed any); `whoKnowsLump` almost never matches a real haul. `teachPlant` has **no player-initiated entry point** — no conversation topic asks "what's this plant?". Teaching fires only via the 50% return-home lottery (gated on trust > 30, days away) or the slow fireside drip (35% × 60%).
- So the practical on-ramp is solo `testCautiously` — one species per afternoon + risk — i.e. **trial-and-error, not the social teaching** Steve's design centers ("Returning to haven with a new haul is the key teaching moment — villagers teach the player and vice versa"). The design says slow-and-manual; the current shape says lonely-and-manual. Whether to add a player-initiated "ask about this lump" (conversation or sort-flow) is Steve's call — did NOT change it.
- The pressure itself is correct: ~7 days of pantry runway vs the identification pace IS the early game. It just needs the teaching moment to be reachable inside that window.

## Bugs found (all stale tests, fixed)
1. `test-food-reality.js` (8 fails): butchering byproducts (feathers/bones, 6abf40a) shifted hardcoded inventory indices → `cleanCarcass(2)`/`cookAll`/`preserveFood(2)` hit the wrong items. Fixed with dynamic index lookup. 90/90 now.
2. `test-pantry-real.js` (6 fails): keep-a-day's-food (73dce8e) changed unload semantics; test expected full unload. Updated to assert keep-2000 + surplus-unloads-as-real-items. Also fixed hickory assertion for tap-to-step (bae8c1e moved the player onto the oak tile; second tap was "Too far"). 16/16 now.
3. `test-forage-bugs.js` (1 fail): witness line ("…was watching. Now they know Chickweed too.") legitimately names the plant a second time — restricted the count to the IDENTIFIED line. 24/24 now.

## New test
- `scripts/test-forage-rot.js` (9/9): the rot deadline pinned — unidentified lumps rot by day 3; cautious test identifies plurality → real food with honest kcal; sort-with-knower teaches and splits real food.

## Probe notes (for future runs)
- `doAction('forage', {cx, cy})` sweeps the 3×3 around the PLAYER, not the tapped cell — the tap only steps you there if adjacent. Probes must walk the player (mx/my) first or results are nonsense.
- Lump true-kcal = Σ composition units × plant.caloriesPerUnit — kcalEach/hiddenKcal on the lump itself are 0 by design.
- `Game.state` (and `.scholar`) can be replaced mid-flow; re-capture references after travelTo/endDay in long probes.
