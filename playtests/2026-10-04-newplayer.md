# New Player Playtest — 2026-10-04

**Tester:** Subagent playing as a genuinely new player (no docs read, no prior knowledge)
**Build:** 5c051df (synergy active discovery)
**Method:** Node harness simulating naive → competent play through 8 days

---

## 1. Onboarding: Clear?

**The flavor is excellent. The mechanics are invisible.**

The cold open ("The sky changed on a Tuesday") → origin input → location choice → character choice → item choice is a *great* onboarding sequence emotionally. Each step feels meaningful:
- "WHERE ARE YOU FROM?" with the hint "What you know grows where you're from" is intriguing
- 3 landing zones feel genuinely different (Quarry Edge vs Pine Flat vs Floodplain)
- 6 characters feel like real people (Jesse the line cook, Sanne the ESL teacher)
- Picking 5 items from 8 with flavor text is engaging

**But then:** "This is me. Begin." → quest overlay → dumped into a haven interior (office/sanct/base cells). **No plants visible. No guidance. No tutorial.**

As a new player, I stared at a 9x9 grid of ⬛❓office⬛❓sanct and thought: *what do I do?*

**Critical friction:** The game never tells you:
- You need to LEAVE the haven to find food (travel via the minimap)
- Foraging means walking to a 🌱 cell and tapping it
- The minimap tiles are tappable for travel
- What the day-part structure means for actions

The day-part hints ("Honest work hours. Heat builds.") are flavor, not guidance. A new player needs at least one line like: *"You're inside the haven. The minimap shows nearby land — tap a tile to walk there. Food grows outside."*

**Verdict:** Onboarding is 10/10 for atmosphere, 3/10 for teaching the core loop.

---

## 2. First Unidentified Plant: Do You Understand What's Happening?

**Yes — and it's the best part of the new-player experience.**

When I foraged outside the haven, I got:
- Inventory: "a tree with lobed leaves and acorns x24" (not "White Oak")
- Inventory: "clover-like leaves, tangy taste x16" (not "Wood Sorrel")

The descriptor system works. I as a player genuinely didn't know what I'd picked up, which created curiosity: *what IS this? Can I eat it?*

The Codex tracked encounters. Wood Sorrel hit L3 after repeated foraging. The knowledge-as-progression loop is legible even without tutorial.

**Minor confusion:** The foraged item shows `(? kcal each)` for gear but actual kcal for food — inconsistent display. And `Game.eat()` takes no arguments (auto-eats most perishable first), which is fine once you know, but there's no UI hint that eating is automatic vs. selective.

**Verdict:** 9/10. The mystery-then-discovery loop is the game's strongest hook.

---

## 3. System Arrival on Day 7: Surprising? Confusing? Delightful?

**Delightful — on paper.** I read the full arrival sequence in the code:

- "THE SKY SPLITS OPEN. Not with light. With... interface."
- "We've been CALIBRATING! Getting the cameras focused!"
- "That was your SIGNATURE. You signed up by DOING THINGS. Consent via competence! Our lawyers love it!"
- "Some of you... just sat in the haven? The audience got BORED. So we removed them."
- "They're not betting on your survival — they're betting on your UNDERSTANDING!"

This is *great* writing. Callous, cheerful, completely alien. The calibration lore lands.

**But I couldn't fully experience it in the harness** because:
1. My bot's week-1 tracking had a stale-reference bug (not a game bug — `firstAbilityChoices` works correctly when week1 is properly set)
2. The arrival messages scroll through the log quickly; a real player sees them as toasts/announcements

**Concern:** The arrival is a wall of text (18+ `say()` calls). In the UI, these appear as sequential log entries. A new player might skim past the best writing in the game. Consider pacing — maybe the animated overlay (which exists) carries more of this weight.

**Ability offer:** When week1 is properly tracked, a forager gets `green_thumb, cold_blooded, pocket_sand` — sensible, thematic choices. The System's framing ("We've been watching you...") is good.

**Verdict:** 8/10 for writing, but the delivery (log spam) may undersell it.

---

## 4. Abilities: Do You Understand Them? How to Level?

**Partially.** The ability offer shows name, flavor, and effect. But:

- **Metabolic cost** is shown as `[object Object]` in my harness (likely a UI rendering bug — the cost object isn't stringified properly in the offer display)
- **No explanation of leveling:** Nothing tells a new player that abilities "deepen" through understanding/use. The concept of L1→L2→L3 isn't introduced at offer time.
- **No explanation of the 6-slot limit:** A new player doesn't know abilities are capped.
- **Synergies are invisible:** By design (discovery!), but a new player has zero hint that combining abilities is even possible. The attempt-1 "flicker" feedback should help, but I didn't test this path.

**Verdict:** 5/10. The offer is clear about *what* you're getting but not about the *system* you're entering.

---

## 5. What's Confusing? What's Boring? Where Do You Get Stuck?

### Confusing

1. **Starting location:** You begin inside the haven. No plants, no water, nothing to interact with. The most important action (leave!) is not suggested.

2. **Travel targets show "undefined" type:** In my test, `Game.travelTargets()` returned tiles with `type: undefined`. Cosmetic, but a new player tapping the minimap sees unnamed tiles.

3. **Dehydration death spiral:** My bot's health crashed 94→16 over 7 days from dehydration, not hunger. The warning "⚠ DEHYDRATED: find and treat water today" appears, but a new player doesn't know *how* to find/treat water. Drinking from a creek costs health (-10, "your stomach turns"). The water system has depth but no onboarding.

4. **Eating is automatic but opaque:** `Game.eat()` eats "most perishable first until kcal >= target." A new player tapping "Eat" might expect to choose *what* to eat.

5. **No feedback on action costs:** Foraging costs kcal and a day-part, but the UI doesn't preview this before you commit. You learn by doing (which is fine) but the first time you forage and see your kcal drop, it's surprising.

### Boring

1. **Day 1 in the haven:** If you don't figure out travel immediately, you sit in an empty building tapping cells that do nothing. This is where new players will quit.

2. **Repetitive foraging:** Forage → walk → forage → walk is the core loop and it's fine, but without the System (days 1-6), there's no progression feedback except Codex levels. The Codex helps, but it's tucked behind a button.

### Stuck Points

1. **Can't find water:** My bot literally could not find water tiles and dehydrated. A human sees the grid, but if the nearest water is 2 tiles away and you don't understand travel yet, you're stuck.

2. **Blocked travel with no explanation:** If a path is blocked (fallen tree, etc.), the UI shows a blockage dialog. I didn't test this as a new player, but it's a potential "what do I do now?" moment if the solutions aren't clear.

3. **The System arrival requires surviving 7 days:** If a new player dies on day 3 from dehydration (very possible), they never see the game's best content. The difficulty curve for days 1-7 might be too steep for true beginners.

---

## Summary Scores

| Aspect | Score | Notes |
|---|---|---|
| Onboarding atmosphere | 10/10 | Cold open through item selection is superb |
| Onboarding mechanics | 3/10 | Core loop is never explained |
| Knowledge/discovery | 9/10 | Descriptor system is the best hook |
| System arrival writing | 9/10 | Callous, cheerful, alien — perfect |
| System arrival delivery | 6/10 | Wall of text in log; may be skimmed |
| Ability clarity | 5/10 | What's offered is clear; the system isn't |
| Early survival fairness | 4/10 | Dehydration kills new players silently |

## Top 3 Recommendations

1. **Add a 3-line tutorial overlay on first expedition screen:** "You're in the haven. Tap the minimap to walk outside. Walk to green cells and tap them to forage. Drink water from blue cells." That's it. Don't over-tutorialize — just bridge the gap.

2. **Surface the Codex more aggressively:** When a plant is identified, show a toast/modal, not just a log line. The knowledge loop is the game's best feature — make it impossible to miss.

3. **Soften days 1-3 dehydration:** Either start the player near water, or make the first dehydration warning actionable ("There's water to the east — tap the minimap"). Dying of thirst before the System arrives means never seeing the game.
