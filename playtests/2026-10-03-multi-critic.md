# Multi-Character Critic Playthroughs — 2026-10-03

**Method:** Node.js, game loaded via `scripts/simulate.js` pattern. Three full runs, 8 days each (all died day 3-4). Targeted probes for combat, hunting, water, books, pantry.
**Verdict:** The game is **not playable** as a survival game. Every run starved by day 3-4 due to a broken food economy, and multiple game-breaking bugs crash or corrupt core flows.

---

## RUN 1: Jesse (hunter) — live off the land, ignore village

**Strategy:** Forage/hunt in the wild, craft snare, set traps, don't rely on Haven.

**What happened:**
- Day 1: Started with 2200 kcal, trail mix + dried meat (edible, good). `eat()` worked (2200→2500, no NaN — the NaN fix holds for the math).
- Craft messaging is clear: "Need 1 vine (have 0)." Good UX.
- Traveled to creek (11 forageable cells). Foraged 4x: got chickweed x10, **zero vine/stick materials**. Vine is 30%/bush, stick 40%/tree — creek is mostly plants, so the hunter couldn't assemble a snare in 4 forages.
- Day 3: thornback_boar appeared (RNG encounter working). kcal went -940 → -2200. **Died day 3.**
- `codexPlants=0` after foraging — 1 encounter isn't enough to identify (needs 2-4). Correct per design, but the player gets food with no knowledge progress feedback.
- Other villages: all `gen=false` (never got within 2 tiles). Fine.

**Run-specific notes:**
- The hunter fantasy (craft snare day 1, live off traps) is **blocked by material RNG**. Vine/stick rates feel stingy for the core loop.
- Negative kcal (-2200) — `resolveDay` doesn't floor at 0 despite the earlier fix claim.
- Inventory went 5 → 0 items by day 3. The `eat()` gear-deletion bug (see below) ate his starting gear.

---

## RUN 2: Mara (doctor) — social, cautious, pantry-reliant

**Strategy:** Search rooms, talk to villagers, take from pantry, stay near Haven.

**What happened:**
- Searched 8 rooms: found **First aid kit x2, Bottled water, Canned beans**. Searching feels good — exciting, varied. Day did NOT advance (fix worked). kcal 2200→2120.
- `useItem` on first aid: 60→90 HP. Works correctly.
- Talk: 11 villagers positioned. Dialogue is evocative ("Don't sneak up on me. Sorry. Habit." / "The vending machine had coffee. Real coffee."). Trust has 12 keys. **This system feels alive.**
- `takeFromPantry`: works, carry weight enforced (hit 19.5kg cap). Good.
- `nearFire=false` in the school building — **cannot cook at Haven**. The fiction says "the fire is lit" but no fire cell exists in any building layout.
- **Died day 3** (kcal 220→320). She took 1 pantry item/day (~300 kcal) but needs 2400. My script under-fed her, but it reveals the brutal math: the pantry can't sustain anyone.

**Run-specific notes:**
- The social game is the strongest system. Talking, trust, room-searching all work and feel good.
- But the "safe" strategy (stay home, eat pantry) is a death sentence because the pantry is far too small (see Economy section).
- No fire at Haven means the cooking system (a major recent feature) is **unusable where the player starts**.

---

## RUN 3: Theo (selfish) — loot ruins, hoard, never share

**Strategy:** Drain pantry day 1, crawl ruins for loot, never give back.

**What happened:**
- Drained **36 pantry takes** day 1 (carry 19.9kg). Pantry left at 2250 kcal (0 days for 12). **One player can zero the pantry with zero pushback** — no confrontation, no trust loss, no one stops you.
- Ruin at (1,4): "Picked clean. Nothing." — but probes show ruins DO generate loot (3-4 items). The tile-level `loot[]` requires a different action than interacting with rubble cells. **Two loot systems, unclear UX.**
- eod1: 39 items but kcal=240. eod2: 27 items, kcal=250. eod3: 13 items, kcal=210. **Died day 3.**
- He was eating ~12 items/day (~2400 kcal) but the inventory shrank faster than expected. The `eat()` loop eats one unit at a time until 2400 — with raw beans at 150 kcal, that's 16 items/day.
- `depleted tiles: none` — villager competition (`depleteRandomTile`) showed **zero visible effect** across 8 days.
- No books found (10%/ruin × 1 ruin/map = very rare, as designed).

**Run-specific notes:**
- The selfish strategy "works" (you get the food) but kills the village with no social consequence. If this is by design (villagers are passive), it's a missing system. If not, it's a bug.
- Ruin looting UX is confusing: rubble cells vs tile loot are different things.

---

## ISSUES BY SEVERITY

### GAME-BREAKING

**1. `eat()` deletes the player's starting gear.**
`scholar.inventory = scholar.inventory.filter(i => i.kcalEach !== undefined)` removes all gear (knife, rope, lighter, multitool, sentimental items like "Daughter's Drawing") because they have no `kcalEach`. The NaN fix created a worse bug: it deletes inventory instead of skipping non-food in the loop.
*Repro:* New game → `eat()` → starting gear gone. Verified: Mara's 5 gear items → 0.
*Fix:* Don't filter inventory. In the eat loop, `continue` past items with `!it.kcalEach`.

**2. `movePath()` crashes: `CELL_PROPS is not defined`.**
`findPath()` (game.js:1308) references `CELL_PROPS`, which is a `const` local to `microMove()` (game.js:1074). The multi-square movement Steve asked for — tap distant cell, walk path — **throws ReferenceError every time**. The UI's smart-click handler calls `Game.movePath` (fixed from `moveMicro`), so tapping any empty ground crashes the game.
*Repro:* `Game.movePath(5, 5)` → `ReferenceError: CELL_PROPS is not defined`.
*Fix:* Hoist `CELL_PROPS` to module/game scope.

**3. Combat crashes when wearing armor: `incoming is not defined`.**
combat.js:93 references `incoming` outside the `if (!fled)` block where it's declared with `let`. Any combat round where the player wears armor (protection > 0) throws `ReferenceError`.
*Repro:* Equip bark armor → `Game.combatRound('strike')` → crash.
*Fix:* Move the armor reduction inside the `if (!fled)` block, or declare `incoming` in outer scope.

**4. Two disconnected pantry systems; village starves from day 1.**
- `v.pantry[]` (items): what the player sees and takes from. Displayed by `status()`.
- `v.pantryKcal` (number): set to 0 in newGame, incremented by `villageLives` (`+= brought`), decremented by `villageEats`, checked for starvation and win condition.
- These never touch each other. Villagers "bring food" into the phantom number. The village "eats" from the phantom number. The player's takes don't affect what the village eats.
- `villageEats()` checks `if (v.pantryKcal <= 0)` → villagers lose 5 HP/day. Since phantom starts at 0, **the village is starving from day 1** (verified: min health 95 after one `villageEats()`).
- `returnToVillage()` adds `brought` (which is NaN if gear is in inventory — `units * undefined`) to the phantom, then clears player inventory.
*Fix:* Pick one system. The itemized pantry is the right one — `villageEats` should consume actual items, `villageLives` should add actual items.

**5. Starting pantry is ~4x too small; everyone starves by day 3-4.**
Design intent: "1.5-3 days for the group" = 12 × 2000 × 1.5 = **36,000 kcal minimum**.
Actual: beans x20 @150 + rice x15 @200 + soup x10 @250 = **8,500 kcal** (raw). Cooked: ~13,750.
That's 0.35 days for the village, or 3.5 days for ONE person eating 2400/day.
All three runs died of starvation by day 3-4, including the cautious pantry-reliant Mara.
*Fix:* Increase quantities ~4-5x, or reduce to fewer villagers, or lower daily need. The numbers must match the design comment.

**6. No fire exists → cooking is impossible.**
Building layouts (school, church, warehouse, apartment, office) contain **zero fire cells**. The procedural `case 'haven'` (which generates fire/tent) is dead code — haven tiles always use building layouts. There's no "make fire" action. `nearFire()` is false at Haven.
The entire cooking system (raw vs cooked, water cost, "knowledge is calories") — a major recent feature — **cannot be used**.
*Fix:* Add a fire to building layouts (the fiction says "the fire is lit"), or add a make-fire action.

**7. Village water is never replenished.**
`village.water.clean` starts at 20L. Cooking consumes 1L/item. Nothing refills it — no well, no rain, no `fillWater` action (doesn't exist). Once 20L is gone, beans/rice are permanently uncookable.
*Fix:* Add a water source (well at Haven, creek trips with a container).

### SERIOUS

**8. City spawns never happen.**
`newGame` (line 103) reads `this.state.spawnType` to choose the building pool, but `genMap()` (line 173) sets it afterward. Always falls back to `'countryside'`. The 30% city content (apartment/office buildings) is unreachable. *This was flagged in the previous critic run as "fixed" — it wasn't.*

**9. Scholar starts with `mx/my = undefined`.**
`newScholar()` doesn't initialize micro-position. First move produces NaN. *Also flagged previously as fixed — wasn't.*

**10. `codex.recipes` is an Array, code treats it as Object.**
`newCodex()` returns `recipes: []`. Jesse's snare is set via `recipes['snare'] = {...}` (string key on array — works in JS but `JSON.stringify` shows `[]`, and `.length`/`.filter`/`.map` misbehave). Fragile hack that will break.

**11. Deadfall and water filter can never be crafted.**
Recipes require stone, bait, cloth, charcoal, container — none obtainable. Vine (30%/bush) and stick (40%/tree) exist. Stone from rubble was "intended" but not implemented. 2 of 4 recipes are dead ends.

**12. `resolveDay` allows negative kcal.**
`scholar.kcal -= need` with no floor. Observed -940, -2200. *Also flagged previously as fixed.*

**13. Fog of war is barely foggy.**
13/49 tiles revealed at start. All 12 travel targets visible, 0 unknown. The "walk into ?" mechanic rarely triggers.

**14. Ruin looting has two disconnected systems.**
Tile-level `loot[]` (3-4 items, works) vs rubble cells in detail grid (separate interaction). Player sees rubble, interacts, gets materials or nothing — but the real loot needs a different (undiscoverable) action. Theo's "Picked clean" was this confusion.

### POLISH / OBSERVATIONS

**15. One player can zero the pantry with no social consequence.** Theo drained 36 takes day 1. No confrontation, no trust hit, no one stops him. If villagers are "alive," they'd react. (Design question, not just a bug.)

**16. Villager competition is invisible.** `depleteRandomTile` ran for 8 days across 3 runs; zero depleted tiles observed. Either villagers aren't foraging or the effect is too small to notice.

**17. Deer as 20,000-kcal single item.** Trap gives a 20kg "deer (trapped)" — maxes the 20kg carry cap in one item. Not physically coherent (you can't pocket a deer). Consider butchering into parts.

**18. Hunt at 95% cap feels too easy.** 20/20 rabbits with spear. Tuning, not a bug.

**19. Snare materials too stingy for the hunter fantasy.** 4 forages in a creek yielded zero vine/stick (creek has few bushes/trees). Jesse's core loop — craft snare day 1 — was blocked by RNG. Consider guaranteeing materials in the starting area or a "gather materials" action.

**20. Books are extremely rare.** 10%/ruin × 1 ruin/map = ~10% of games have a book. Fine if "treasure," but the codex then grows only via slow foraging.

**21. `status().invKcal` doesn't guard undefined kcalEach.** Same NaN vector as the old `eat()` bug: `i.units * i.kcalEach` with gear → NaN. (Gear gets deleted by eat() first, masking it — but a fresh game calling status before eat would show NaN.)

---

## WHAT'S WORKING (credit where due)

- **Room searching** feels great — varied finds, good pacing, day doesn't advance.
- **Villager dialogue** is evocative and characterful. Trust system is legible.
- **Craft messaging** ("Need 1 vine (have 0)") tells the player exactly what's missing.
- **Weapon/armor bonuses** compute correctly (+30 spear, +10 bark).
- **Carry weight** enforced (19.5-19.9kg caps observed).
- **`useItem`** heals correctly.
- **RNG monster encounters** fire (thornback on day 3).
- **Ruin loot** generates (3-4 items/map).
- **Talk/giveFood** don't crash; trust tracks 12 villagers.

## THE CORE PROBLEM

The game has strong systems (social, knowledge, exploration) but the **survival economy doesn't function**. The pantry is too small, the village eats from a phantom number, the player can't cook (no fire), water can't be refilled, and gear gets deleted by eating. Every run ends the same way: starvation by day 3-4, regardless of strategy.

Fix the food economy first (issues #4, #5, #6, #7). Then the crashes (#1, #2, #3). Then the wiring (#8-#14). The polish can wait.
