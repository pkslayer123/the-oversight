# Movement + Contextual Actions — 2026-10-04

## The stuck bug: two root causes

**1. `villagerId` ReferenceError (the real killer).** In `app.js` `cellPopup`, the branch
`else if (villagerId)` referenced a variable that was never declared anywhere.
Strict mode → ReferenceError → the tap handler threw silently → no panel rendered.
Single adjacent steps worked (they bypass `cellPopup`); *everything else* died quietly.
This is exactly what Steve felt: "move one space, then stuck."
Fixed by computing `villagerId` from `Game.state.village.positions` at the top of `cellPopup`.

**2. Dead "Too far to reach." panels.** For blocked cells (tree, water, tent, fire) at
distance > 1, `cellPopup` offered zero actions. Tapping a distant tree was a dead end.
Fixed with `walkCloser(cx, cy)`: paths to the nearest adjacent walkable cell via
`Game.movePath`, then re-opens the popup. Also added for distant animals and villagers.
Walls excluded (no point walking to a wall).

## Contextual action strip

New quiet `.contextbar` below the grid in the expedition screen:
- Scans your cell + 8 neighbors via `Game.cellActions`, dedupes labels.
- Small pill buttons ("nearby: Forage · Cut down · Talk …"). No modal, no takeover.
- `doContextAction` dispatcher maps all 14 labels to real Game calls.
- Rebuilds on every render (every move/step). Hidden during combat/game-over.
- Empty strip renders nothing (`:empty { display: none }`).

## Verification

- `node --check` clean; content gate OK.
- Engine multi-move: 10/10 across fresh runs (was never broken — UI was).
- Extracted function tests: 20/20 pass —
  - `nearbyActionItems` returns valid adjacent-only items;
  - `contextBarHTML` renders;
  - `walkCloser` moves + reopens popup;
  - `doContextAction` no-throw on every nearby label.
- Full sims (random + greedy): no crashes, no regressions.
- `genDetail` is tile-cached, so the 18 calls/render are cheap.

## Commit

`7494da7` — pushed to `pkslayer123/the-oversight`, live via Pages. SW version bumped
(update banner will fire).
