# Balancing Framework — The Scattering

Everything rooted in reality, everything balanced. This is how we evaluate changes.

## Target Metrics (the numbers we're aiming for)

### Daily Economy
- **Scholar needs**: 2,200 kcal/day (realistic adult).
- **Village shortfall**: 800–1,200 kcal/day from pantry (the gap you're the margin for). Measured 2026-10-04: ~2,000/day at low trust, shrinking toward ~200/day as trust rises (surplus sharing is trust-gated) — the "earn trust, stabilize the pantry" arc emerges from the mechanics.
- **Villager need**: 1,600 (kids), 1,700 (elders), 2,000 (adults), 2,200 (Jesse).
- **Village self-provision**: ~92% of need (they work; you're not feeding helpless mouths).

### Forage Yields (per action, 5–8 units)
- **Grove**: 1,000–1,400 kcal (the breadbasket, but not infinite).
- **Wetland/Creek**: 700–900 kcal.
- **Meadow/Thicket**: 500–700 kcal.
- **Forest floor/Trail**: 400–600 kcal.
- **Stock**: Grove 3, others 2, forest floor 1. (Breadbasket grove: 2.)

### Win/Loss
- **Greedy bot win rate**: 60–80% (optimal play should usually win; humans will be 30–50%).
- **Avg win days**: 12–18.
- **Pantry start**: ~94,000 kcal as real items (beans, rice, soup, meat, peanuts — ~4 days at full need). NOTE (2026-10-04): doc previously said 2,000; the "real food" redesign made it 94k. With ~92% village self-provision this is ~2 months of buffer — the pantry-pressure half of the game is currently absent. Steve call whether to shrink it.
- **Win** (as coded): Codex 10+ AND Pantry 8,000+. NOTE: pantry half is trivially satisfied from the start (94k >> 8k) — the win is effectively codex-only until the starting pantry is rebalanced.
- **Loss**: 3 hungry days (pantry empty) OR scholar death.
- **Greedy bot win rate, measured 2026-10-04**: ~20% pre-fix; ~2-8% after honest tree yields (oak→acorns, hickory→nuts — trees no longer a species slot machine for codex entries). The bot doesn't identify strategically; human path to 10 entries via plant/bush cells is intact. If the win-rate target matters, the lever is codex acquisition, not tree honesty.

### Village Lives
- **Food haul**: 400–800 kcal (a real haul for one person, visible on top of abstract provision).
- **Frequency**: 1–2 villagers/day act.
- **Wounds**: Occasional, not crippling.
- **Note**: villageLives food is a *visible bonus*, not the core economy. The 92% abstract provision is the base.

### Food Reality (2026-10-04)
The foraging loop was "grab unlimited free food." Now food is a system to learn:
- **Recognition is gated**: unknown plants aren't food (0 kcal, uneaten, uncounted) until identified. Nuts need shelling (net 75% of gross). The codex is survival, not completion.
- **Turkey pipeline** (reference): carcass (not food, spoils ~2d) → cleaned raw 40% (risky 35%/-12, ~2d) → cooked 100% (safe, ~5d) → smoked 90-95% (~30d). Blind attempts work messy and teach; specialists do it better (butcher 44-52%, cook +5%/level).
- **Prey flees**: graze → wary → bolt, plus a reaction roll on the strike (tracker/hunter/night help). Weapon range is real (bow 5, spear 2, melee 1) — stalking, not statues.
- **Pantry**: 120,000 kcal / 40L water caps, expandable ×1.5/+20L per tier (materials + labor; builders halve cost). Ingredients (carcasses, unknown hauls) store free of cap — the pantry is where specialists transform them.
- **Balance check**: scholar 2,200/day intact. A day-1 ignorant player eating raw unknown berries gets sick; a knowledgeable player with fire, knife, and a butcher friend eats well. First turkey = project, tenth = routine. Village haul target 400–800 unchanged — processing multiplies what the haul is *worth*.

## How to Evaluate a Change (the framework)

Before changing a number, answer:
1. **What's the real-world anchor?** (2000 kcal/day is a human. 140 kcal is a snack.)
2. **What breaks if this is wrong?** (Too high = trivial. Too low = impossible.)
3. **What does the sim say?** Run `node scripts/simulate.js 30` and check:
   - Greedy win rate in 20–40%?
   - Avg days in 12–18?
   - Pantry doesn't explode or collapse?
4. **What does it FEEL like?** Play 3 days. Does the pressure feel real but fair?
5. **Does it respect the fiction?** (Villagers work. The System is alien but trying.)

## Playtest Log Format

Each entry in `playtests/`:
- **Date, character, duration** (track your time!)
- **What you did** (3–5 days of actions)
- **What you felt** (pressure? boredom? confusion?)
- **Numbers** (pantry start/end, codex, deaths)
- **Friction** (numbered, specific)
- **Verdict** (balanced? too easy/hard?)

## Time Tracking

Steve asked: "How long does it take you?"
- Log start/end time for each playtest session.
- Sim runs: ~2 min for 30 runs.
- Manual playtest (3 days): ~15 min via engine, longer on phone.
- Track in the playtest log header.

## Deep Playthrough Findings (2026-10-03)
- Win 8+5000: too fast (13 days), too easy (100% greedy, 19k pantry).
- Win 10+8000: 26 days, depletion hits 5x. Still 100% greedy, but the game breathes.
- **When it breaks**: Day 10, the bot has a buffer and coasts. The mid-game needs pressure.
- **Codex feel**: 8 entries in 13 days is fast. 10 (all plants) forces exploration.
- **Regrowth**: +1/day (not full reset). Strip a grove, wait 3 days. State persists.
- **New content timing**: Day 10-15 needs something (System quests at 40% integration? A crisis?).
  The basics are mastered by day 10; the game needs a second act.
