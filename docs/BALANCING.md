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
- **Pantry start**: ~47,250 kcal as real items (dried beans, rice, canned soup, dried meat, peanuts — long-spoil staples). CORRECTED 2026-10-10 (was 94k in this doc, stale): measured day-0 pantry is 47,250 kcal across 40 seeds. At the real early deficit (~3.5k/day with strangers who don't know the land) that's a 3–4 week buffer while the village learns — a neglectful village is in crisis by week two; a learning village stretches it. The scarcity comes fast, by design.
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
- **Turkey pipeline** (reference): carcass (not food, spoils ~2d) → cleaned raw 40% (risky 35%/-12, ~2d) → cooked 100% (safe, ~5d) → smoked 90-95% (~30d). Blind attempts work messy and teach (clean 30%, cook 85%, preserve 80%/+15d); specialists do it better (butcher 44-52%, cook +5%/level).
- **Prey flees**: graze → wary → bolt, plus a reaction roll on the strike (tracker/hunter/night help). Weapon range is real (bow 5, spear 2, melee 1) — stalking, not statues.
- **Pantry**: 120,000 kcal / 40L water caps, expandable ×1.5/+20L per tier (materials + labor; builders halve cost). Ingredients (carcasses, unknown hauls) store free of cap — the pantry is where specialists transform them.
- **Balance check**: scholar 2,200/day intact. A day-1 ignorant player eating raw unknown berries gets sick; a knowledgeable player with fire, knife, and a butcher friend eats well. First turkey = project, tenth = routine. Village haul target 400–800 unchanged — processing multiplies what the haul is *worth*.

### Haven Tiers (2026-10-10, survival-food pass)

Resource thresholds for the 12→24 population ladder. Tiers unlock on stockpiles only — never deeds, calendar, or knowledge.

- **Tier 1 — The Longhouse** (pop cap 16): food 8,000 kcal + wood 12. Hearth stretches meals 10%, pantry capacity +25%.
- **Tier 2 — The Palisade** (pop cap 20): food 14,000 + wood 350 + stone 60. Raiders take wall damage; safe sleep.
- **Tier 3 — The Granary** (pop cap 24): food 20,000 + wood 500 + preserved 2,000 kcal. Spoilage slows (+3d fresh, +14d preserved); famine buffer 3→5 days.

**Why tier 1's wood bar is 12, not 200** (5-question evaluation):
1. **Real-world anchor**: a village woodpile for the hearth + timber to start. The old 200 assumed a "2 wood-duty" village banking +23/day — a staffing level the competent policy never fields.
2. **What breaks if wrong**: 200 = unreachable (measured 1/40 seeds); 12 = reachable but not trivial (starts at 10, must be maintained up; 34/40 reach, median day 12).
3. **What the sim says**: 40 seeds × competent policy (villagerTurn-corrected) × 200 days. Baseline: tier-1 reach 1/40, peak wood p10=11/med=13/p75=15 (the policy staffs wood duty for hearth maintenance only — pile < 8 — so the pile equilibrates at 8 + one duty yield). After (wood bar 12, wood duty R(5,9)): 34/40 reach tier 1, median day 12. The 6 misses are early combat deaths (4, out of scope) or genuinely non-thriving villages (2, working as designed — tier 1 is a thriving check).
4. **What it feels like**: tier 1 fires in weeks 1–3 when the village has its act together (healthy buffer + full woodpile). The longhouse rises before the System arrives (day 7) — the village thrives on its own, then the System raises the stakes.
5. **Does it respect the fiction**: villagers work (they staff the wood duty); the System announces exact bars; the wood bar is the "the pile isn't empty" check while the food bar (8,000 = buffer healthy) carries the meaning.

**Wood duty yield**: R(3,6) → R(5,9) per part. R(3,6) was unrealistically low (3–6 small logs for 4 hours of axe work); R(5,9) is still conservative but game-balanced against the 6L/wood boil burn. The village must still staff wood duty to keep the hearth going — the fuel economy is intact.

**Tiers 2–3 are stretch goals** (out of scope for this pass): the competent policy never staffs stone duty or preserves food, so 350/500 wood, 60 stone, and 2,000 preserved remain unreachable. Breaking the palisade vicious cycle needs a village that staffs toward the announced bars — a policy/behavior question for Steve.

### The Bank — food is humanity's superpower (2026-10-04, refined: no separate pool)
Steve's rule: NO second pool. The kcal bar IS the bank — one energy economy, conservation of energy. Digesting organic matter grants mana reserves other species can't match:
- **One pool, one cap**: `kcalCap = 2400 × metabolicMult × bankMult`. Baseline human banks ~a day (2400). The "fed" line is `2400 × metabolicMult`; kcal above it is **banked** — the war chest.
- **Skillsets expand the bank**: `food.bank_mult` (new) — **Deep Reserves** (System body-horror, ×5 → 12,000 kcal war chest); `food.eat_target_mult` (Extra Stomach, legacy, ×2) stacks → ×10 = 24,000. The glutton-warrior is a real build: the trade is you must EAT that much to fill it.
- **Fill**: **Eat** fills the bar to cap. Past "fed", the message says so ("Past full — the bank takes it"). Pool quality (`kcalQ`, weighted average of meal quality — raw 0.5, safe raw 0.7, cooked 1.0, preserved 1.1, specialist-made 1.3) is tracked for the burn.
- **Burn**: **FEASTBURN** — player attacks with ≥300 banked auto-burn 300 (400 when gorged, i.e. ≥75% of max bank) for ×1.5 (×1.75 gorged) damage, stated every time: "the feast was the weapon." Specialist fuel burns hottest (×1.15), scraps burn dirty (×0.85).
- **Decay**: −20%/night on the banked portion only. The body pool below "fed" is untouched. Use it or lose it.
- **UI**: no RESERVE row. The FOOD bar shows `kcal/cap`, glows gold past the fed line, carries the GORGED tag. No Feast button — Eat is the ritual.
- **Migration**: old `reserveKcal` folds into the bar once via `migrateReserve()` in `status()`.
- **Headroom**: a deep-reserves + smoker + butcher + full pantry late game can plausibly become overwhelming. Endgame payoff: later.
- Early game stays honest: baseline cap IS the fed line, so there's no bank to burn — the superpower is earned, not given.

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
