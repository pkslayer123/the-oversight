# Critic Playthrough — 2026-10-03

**Player:** Muse (as critic, not cheerleader)
**Character:** Jesse Calhoun (hunter)
**Method:** Node.js, loaded via scripts/simulate.js pattern, 3 full runs + targeted probes
**Verdict:** The game is currently **unplayable**. Multiple game-breaking bugs prevent surviving past Day 3.

---

## Game-Breaking Bugs

### 1. `eat()` produces NaN — eating kills your save
**Severity:** CRITICAL — corrupts the entire game state.

**Repro:**
1. `Game.newGame('ohio', 'jesse_calhoun', [])`
2. `Game.eat()`
3. `Game.state.scholar.kcal` → `NaN`

**Root cause:** Jesse starts with 5 gear items (Grandfather's Knife, Rope 50Ft, Lighter, Tin Cup, Camo Jacket) that have `kcalEach: undefined`. The `eat()` loop does `scholar.kcal += it.kcalEach` for every item in inventory, including non-food. `2200 + undefined = NaN`. Once kcal is NaN, every subsequent calculation (metabolism, health, pantry days) is poisoned.

**Fix:** `eat()` must skip items where `!it.kcalEach || it.kcalEach <= 0`.

### 2. `searchRoom()` advances the clock — searching kills you
**Severity:** CRITICAL — core early-game action is lethal.

**Repro:**
1. New game, Day 1
2. Search 4 rooms via `Game.searchRoom(x, y)`
3. Each call triggers `endDayPart()`. After 4 searches, `endDay()` runs metabolism.
4. Searching 17 rooms (a full building) = 4+ days pass. Scholar kcal drops by 8800+.

**Root cause:** `searchRoom()` calls `this.endDayPart()` at the end. Searching a room is a small action (should cost kcal, maybe 20-50), not a full day-part.

**In my playthrough:** Searching all rooms on Day 1 advanced to Day 3 with kcal at -4400. Every run died.

### 3. Jesse doesn't start with the snare recipe
**Severity:** HIGH — documented feature doesn't work.

**Repro:**
1. `Game.newGame('ohio', 'jesse_calhoun', [])`
2. `Game.state.codex.recipes` → `[]` (empty array, not object)
3. `Game.craft('snare')` → `null` ("You don't know how to make...")

**Root cause (two bugs):**
- `newGame()` sets `this.state.codex.recipes = {}` then adds snare, but later calls `this.state.codex = S.state.newCodex()` which **wipes it**.
- `newCodex()` returns `recipes: []` (array) but all game code treats it as an object (`recipes['snare']`, `(recipes || {})[r.id]`).

### 4. `Game.moveMicro` doesn't exist (smart-click handler is broken)
**Severity:** HIGH — clicking empty ground crashes.

**Repro:** In the UI, tap any cell with no decisions (e.g., grass). The click handler at `src/js/app.js:384` calls `Game.moveMicro(cx, cy)`, but the method is named `Game.microMove`. This throws `TypeError: Game.moveMicro is not a function`.

**Introduced in:** commit 9fb2500 ("smart click").

### 5. City spawns never happen
**Severity:** MEDIUM — 30% of content is unreachable.

**Repro:**
1. `Game.newGame(...)` → `Game.state.spawnType` → `undefined`
2. Building is always from countryside pool.

**Root cause:** `newGame()` reads `this.state.spawnType` at line 80 to choose the building pool, but `genMap()` (which sets `spawnType` with the 30% city roll) isn't called until line ~145, at the end of `newGame()`. The building selection always falls back to `'countryside'`.

### 6. Scholar starts with `mx/my = undefined`
**Severity:** MEDIUM — causes NaN positions.

**Repro:**
1. New game → `Game.state.scholar.mx` → `undefined`
2. `Game.microMove(undefined + 1, undefined)` → position becomes `NaN,undefined`

**Root cause:** `newScholar()` doesn't initialize `mx`/`my`. `microMove` uses `s.mx ?? 4` for reading but writes the NaN result.

### 7. `resolveDay()` allows negative kcal
**Severity:** MEDIUM — negative kcal breaks "honest math" promises.

`S.calories.resolveDay()` does `scholar.kcal -= need` without clamping. Kcal goes to -4400, -2270, etc. Should floor at 0.

---

## Friction Points (not bugs, but bad feel)

### F1. The pantry is a lie, then it's gone
- Pantry starts at 2000 kcal for 12 people who need 24,000/day.
- Day 1: pantry → 0. The "honest math" says 0 days, which is correct, but the player starts with **no chance**. There's no tutorial, no warning, no "here's how you get food on day 1."
- As a new player, I searched rooms, found canned beans, but couldn't eat them (Bug #1). I died confused.

### F2. Searching is too rewarding, then too punishing
- 17 rooms in a school, 8 with loot. That's generous.
- But each search costs a full day-part (Bug #2). The game punishes you for engaging with its own content.
- The log after searching shows "— MIDDAY —" not what you found. The announcement bar would show the wrong thing.

### F3. Villagers are invisible
- 11 villagers have grid positions, but in my test the Haven grid showed only walls/rooms. The `ensureVillagerPositions()` either didn't run or placed them on walls.
- I could `talkTo()` via API, but a real player tapping the grid wouldn't see them.

### F4. Travel targets are all revealed
- `travelTargets()` returned 12 targets, 0 unknown. The fog of war isn't visible because the initial reveal radius covers everything within travel range.
- The "?" mechanic exists in code but I never encountered it in 3 runs.

### F5. Foraging requires pixel-perfect positioning
- `cellInteract` on a plant says "Too far. Step closer." You must be adjacent. That's fine as a mechanic, but there's no UI hint. A new player taps a bush, gets "Too far," and doesn't know what to do.

---

## What's Fun (it exists!)

- **The building variety is great.** School gym vs. warehouse vs. church basement feel different. The room layouts are evocative.
- **Room searching is exciting** (when it doesn't kill you). Finding a first aid kit feels good.
- **Villager dialogue has personality.** Mara's "I don't know you. But you're here, so... we figure it out." is a great line.
- **The trust system is legible.** 5-20 for strangers, 100 for self. I understand the social game.
- **Other villages exist.** Emberhold, Stonebridge, Thornfield on the map. I want to visit them.

---

## What's Missing

1. **A tutorial or opening guidance.** Day 1: I have 2200 kcal, 2000 in the pantry, 12 mouths. What do I DO? The game doesn't say.
2. **Food in the starting inventory.** Jesse is a hunter with no food. Give him a day's worth, or make the first forage obvious.
3. **Visible villagers.** They should be on the grid where I can see them.
4. **Working recipes.** Jesse's snare should work (Bug #3).
5. **Eating that doesn't NaN.** (Bug #1)

---

## Recommended Fix Priority

1. **Bug #1 (eat NaN)** — 1-line fix, game-breaking
2. **Bug #2 (searchRoom clock)** — change `endDayPart()` to a kcal cost
3. **Bug #3 (snare wiped)** — move `newCodex()` before recipe assignment, fix array/object
4. **Bug #4 (moveMicro)** — rename to `microMove` in app.js:384
5. **Bug #7 (negative kcal)** — add `Math.max(0, ...)` in resolveDay
6. **Bug #5 (city never)** — move `genMap()` before building selection, or set spawnType earlier
7. **Bug #6 (mx/my undefined)** — initialize in `newScholar()`

All 7 are fixable in under an hour. The game is close — the systems are there, they're just broken at the seams.
