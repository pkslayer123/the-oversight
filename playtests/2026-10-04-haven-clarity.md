# Haven Clarity Fixes — 2026-10-04

## What Steve reported
1. No starting water (or not visible)
2. Haven layout varies every game — new players re-learn the map
3. Stuck on a door — buildings visually unclear (wall vs floor vs door)
4. Something blocking action popups
5. Node-tile travel should be removed or gated
6. Pantry broken (take doesn't work)
7. Pantry + water should be one stockpile, independent sliders

## Root causes found
- **Pantry crash**: `takeFromPantry` referenced undefined `stealClean` → ReferenceError when a donor took food. Fixed.
- **Stuck on door**: doors had no action — tapping showed "Leads outside" with zero buttons. There was no way out of the building except minimap travel.
- **Visual collisions**: `wall` and `rubble` both rendered 🧱; `hall` and `door` both rendered 🚪. No CSS distinction.
- **Popup "blocked"**: tile panel renders below the 9x9 grid — off-screen on phones. Added scrollIntoView.
- **Water**: player DID start with 2L, but no UI surfaced it and no haven refill action existed.

## Changes (commit 8d8f755)
- **Standardized Haven**: one canonical 9x9 hall (bunks, central fire, 2 south doors). Same every run.
- **Inside/outside model**: `scholar.insideHaven`. Doors → "Step outside" → Haven grounds (tents, fire pit, lodge). Lodge → "Go inside".
- **Edge-based travel**: minimap is display-only (fog guesses). Walk to 9x9 edge → tap self → "Head east/west/north/south" → travelTo.
- **Visual language**: wall=⬛ dark, door=🚪 green glow, hall=plain floor, rubble=🧱 (now distinct). CSS classes `c-wall`, `c-door`, etc.
- **Pantry slider UI**: per-item sliders with kcal/kg density, live summary (items, kg, kcal, liters). Bulk take.
- **Water in pantry**: one stockpile, independent sliders. Water-only or food-only packing both work.
- **Starting food**: 94,200 kcal (~3.9 days for 12), up from ~34,500.
- **fmtKcal**: auto-scales to Mcal ≥1000 ("2.4 Mcal"). Used in pantry UI + haven panel.
- **New cell types**: `bunk` (rest), `lodge` (enter building).

## Verification
- 66/66 targeted checks pass (5 new games: water, pantry size, layout consistency, doors, exit/enter, bulk take, edge exits, fmtKcal)
- Water-only and food-only packing confirmed independent
- Content gate: OK (all counts unchanged)
- Sims: no crashes (greedy day-1 death is pre-existing bot behavior)
