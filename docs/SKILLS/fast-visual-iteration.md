# Fast Visual Iteration Skill

**Purpose:** Get visuals at the speed of node scripts, not the 5-minute browser task.

## The Problem
Browser tasks take 5-10 minutes. Node scripts are instant but have no visuals.
Steve wants to SEE the game during iteration without waiting.

## The Solution: SVG Grid Renderer

```bash
# Render any scenario's grid as SVG in ~600ms
node scripts/render-grid.js [scenario]

# Examples:
node scripts/render-grid.js headlight    # Highbeam Deer fight
node scripts/render-grid.js bulldozer    # Bulldozer fight
node scripts/render-grid.js              # Current game state (no scenario)
```

Output: `/tmp/oversight-grid.svg` — open in any browser.

### What It Shows
- 9x9 grid at 390px mobile width
- Player position (🧍)
- Monster position (emoji + red highlight)
- HP, hunger, monster name, HP range, armor

### What It Doesn't Show
- Full game UI (dialogue boxes, combat strip, menus)
- Animations or interactions
- Real CSS styling

For full UI verification, use the browser task. For quick "where is everything" checks during iteration, use this.

## When to Use Which

| Need | Tool | Speed |
|------|------|-------|
| Quick layout check | `render-grid.js` | ~600ms |
| Full UI screenshot | Browser task | 5-10 min |
| Playthrough feel | Node playtest + browser | Varies |
| Balance numbers | `test-monster-balance.js` | ~2s |

## The Rule

**"Always get mobile screenshots along the way and look for playability errors, knowledge that wasn't earned, balance or fun issues."** — Steve, 2026-10-05

Use the fast renderer during iteration. Use the browser task for final verification before asking Steve to look.

## Adding to the Renderer

The renderer is in `scripts/render-grid.js`. To show more:
1. Add fields to the SVG template
2. Pull from `Game.state.scholar` or monster definitions
3. Keep it fast — no browser, no dependencies, just SVG strings
