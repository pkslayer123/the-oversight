# Perception Hints

Peripheral vision, not UI. When you're standing next to something interesting,
you notice it — quietly, without tapping anything.

## The line

A single subtle line under the 9×9 grid (`.perceiveline`: 12px, italic,
62% opacity, no animation). It updates every render, so it cycles as you
move — but each render is just still text. Ignorable by design. Steve's rule:
"get right up next to it and you get a couple perception hints" / "make it
not obtrusive."

## Priority (most interesting wins)

1. **Danger** (100) — monster close by. Name only if the Codex knows it
   (`monsterDesc`); otherwise "Something moves nearby."
2. **Person** (80) — nearest villager + their observed activity line.
3. **Cache** (65/60) — disturbed earth (robbed) or "something of yours is
   buried on this ground."
4. **Stash** (55) — at Haven: "The village stash: 12 branches, 3 logs."
5. **Resource** (50/45) — big trees (tool-aware via `cutInfo()`), stagnant
   water. Clean running water stays silent — nothing to say.
6. **Flavor** (40) — nearby animals.

## Observant characters

Observant primary/secondary: 3 hints instead of 2, plus finer detail —
tree health ("It looks diseased."), monsters spotted at distance 2.

## Anti-spam rules

- One hint per category per render (nearest wins).
- Silent on empty ground, in combat, on game over.
- Never flashes, never pops, never demands a tap. The full examine action
  still exists for deeper inspection.

## Implementation

`src/js/perceive.js` — self-attaching module, `Game.perceptionHints()`.
Rendered by `perceiveHTML()` in app.js. Tests: `scripts/test-perceive.js`.
