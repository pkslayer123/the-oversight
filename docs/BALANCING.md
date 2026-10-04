# Balancing Framework — The Scattering

Everything rooted in reality, everything balanced. This is how we evaluate changes.

## Target Metrics (the numbers we're aiming for)

### Daily Economy
- **Scholar needs**: 2,200 kcal/day (realistic adult).
- **Village shortfall**: 800–1,200 kcal/day from pantry (the gap you're the margin for).
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
- **Pantry start**: 2,000 kcal (~2 days buffer).
- **Win**: Codex 8+ AND Pantry 5,000+.
- **Loss**: 3 hungry days (pantry empty) OR scholar death.

### Village Lives
- **Food haul**: 400–800 kcal (a real haul for one person, visible on top of abstract provision).
- **Frequency**: 1–2 villagers/day act.
- **Wounds**: Occasional, not crippling.
- **Note**: villageLives food is a *visible bonus*, not the core economy. The 92% abstract provision is the base.

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
