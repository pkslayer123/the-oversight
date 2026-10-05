# Content Audit: How Much Game Is There?
**Date:** 2026-10-04 | **Method:** Two passes — (1) genuine bot playthroughs through the engine, day-by-day decisions; (2) systematic code catalog. Then reconciled.

---

## PASS 1 — PLAY: The Travelogue

### The runs
Three explorer-archetype bots played through the real engine (`Game.newGame` → `depart` → forage/eat/talk/travel/sleep loops, with the full food-reality chain: forage cell → lump → return to haven → sort/test at camp → put away → eat). A fourth pair ran to 100 days (capped by step budget).

| Run | Days survived | Died? | Monsters met | Codex plants | End state |
|-----|--------------|-------|--------------|--------------|-----------|
| A | 13 | No | 3 (heron, turtle, belltoad) | 14 | Thriving, pantry 45k |
| B | 12 | **Yes, day 12** | 1 (hushwolf) | 12 | Starved, pantry 0 |
| C | 10 | No | 1 (belltoad) | 8 | Starving, pantry 0 |
| D | 10 | No | 5 (incl. **gallowdeer@d1**, **delegate_beast@d8** — Wave 2!) | 12 | 1 real combat |
| E | 10 | **Yes, day 10** | 1 (boar) | 7 | Starved, pantry 0 |

### What play feels like, day by day
- **Days 1–3: genuinely alive.** Foraging teaches (lumped unknowns → camp sort ritual → cautious testing → identification is a real gameplay loop with tension). Villagers talk, gossip coheres, the 9×9 grid is physical. Novelty: ~60–85 unique text beats/day.
- **Day 7: the arrival lands.** System transition fires, Wave 2 enters the pool. This is the best-paced beat in the game.
- **Days 8–10: the pantry cliff.** The starting pantry (~95k kcal) hits zero. The village goes from "non-factor" to starving in ~48 hours of game time. This is THE wall — see below.
- **Days 10–13: the grind.** If you survive the cliff (Run A did, via aggressive forage→test→cook), the days feel the same: forage, process, eat, sleep, occasional monster. Novelty stays high (~50–70/day) but it's *variety within the same loop*, not new problems.

### Monster meetings in real play
- Rate: **1–5 monsters per 10 days** of travel-heavy play (40–70 tile visits). Spawn chance is 8%/tile (15% thicket, 5% meadow).
- All meetings were "something moves out there — [descriptor]" → stance machine (curious/territorial/hungry) → either flees or turn-based combat. The generic path WORKS — hushwolf pack (3 of them!) and belltoad (2) both produced real fights.
- **Wave 2 is reachable**: delegate_beast met organically on day 8. But in ~200 tile-visits across all runs, only ONE Wave 2 meeting. At this rate, meeting all 20 takes **40–80 days of dedicated hunting** — and that's just the first sighting, not the kill/learn/naming arc.
- The Highbeam Deer (gallowdeer) spawned once on day 1. Its bespoke encounter (beam, phases, telegraphs) did not trigger in bot play — the bot avoided it.

### The survival wall: the village can't feed itself
The village metabolism (game.js:3896–3906):
- Each villager **eats 2,000 kcal/day**, **forages 400–800 kcal/day**. Net: **−1,200 to −1,600 per person per day.**
- 12 villagers × −1,400 = **−17k/day**. The 95k starting pantry lasts ~6–7 days at full burn (observed: hits 0 around day 10 with the player's contributions).
- The code comment claims "KNOWLEDGE FEEDS: each codex entry teaches the village what's edible. they forage better because of you." **This boost does not exist in code** — the 400–800 rate is flat. The village is in structural, unfixable deficit.
- When the pantry hits 0: 30%/day chance to lose a villager to starvation. The player cannot close a 17k/day gap via foraging (350–700 kcal per successful forage+process cycle). **This is a balance bug, not a design choice** — the game as coded cannot sustain a village past the starting pantry.

### Where the days start repeating
Around **day 10–12**, the *problems* stop changing: it's always food. The text stays fresh (procedural generators are deep), but the strategic situation is static: keep the pantry above zero or die. No new systems unlock after day 7 except Wave 2 monsters (rare) and ability slots (slow). The "need something new" feeling arrives at **~day 12**, not because content runs out, but because the survival pressure crowds everything else out.

---

## PASS 2 — CATALOG: The Spreadsheet

### Monster census (20 designed)

| # | ID | Village name | Wave | In code | Reachable organic | Reachable debug | Bespoke encounter cfg |
|---|----|--------------|------|---------|-------------------|-----------------|----------------------|
| 1 | thornback_boar | Bulldozer | 1 | ✅ | ✅ (day-3 wanderer + spawns) | ❌ | ❌ (generic) |
| 2 | hushwolf | Hushpuppy | 1 | ✅ | ✅ | ❌ | ❌ |
| 3 | gallowdeer | Highbeam Deer | 1 | ✅ | ✅ | ✅ (`headlight`) | ✅ **only one** |
| 4 | mirrormoth | Flashbulb Moth | 1 | ✅ | ✅ | ❌ | ❌ |
| 5 | belltoad | Choir Toad | 1 | ✅ | ✅ | ❌ | ❌ |
| 6 | lockpick_raccoon | Lockpick | 1 | ✅ | ✅ | ❌ | ❌ |
| 7 | white_noise_heron | White Noise | 1 | ✅ | ✅ | ❌ | ❌ |
| 8 | hummice | Hummice | 1 | ✅ | ✅ | ❌ | ❌ |
| 9 | speedbump_turtle | Speedbump | 1 | ✅ | ✅ | ❌ | ❌ |
| 10 | nightlight_catfish | Nightlight | 1 | ✅ | ✅ | ❌ | ❌ |
| 11 | voice_mimic_radio | Static | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 12 | mirror_stag | Grief Counselor | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 13 | review_drone | Performance Review | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 14 | camera_swarm | Influencer | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 15 | hype_horn | Motivational Speaker | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 16 | service_mimic | Customer Service | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 17 | contract_golem | Terms & Conditions | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 18 | delegate_beast | Middle Manager | 2 | ✅ | ✅ (verified d8) | ❌ | ❌ |
| 19 | bright_idea | Inspiration | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |
| 20 | memory_projector | Nostalgia | 2 | ✅ | ✅ (post-day-7) | ❌ | ❌ |

**Wave 3: vapor.** No monsters designed. The wave-gate exists (`integration >= 80`) but points at nothing.

**Summary:** 20 designed / 20 implemented / 20 reachable-organic / 1 reachable-debug / 0 vapor. But only **1 of 20** has the bespoke encounter config (beam phases, codex-gated telegraphs). The other 19 run the generic stance→combat path — which works and has distinct voices/cues, but isn't the "alive" encounter Steve designed the framework for.

### System completeness ratings

| System | Rating | Notes |
|--------|--------|-------|
| Food reality (forage→lump→sort→test→cook→eat) | ✅ Complete loop | The best system in the game. Physically grounded, teaches real skills. |
| Village metabolism | 🔴 Broken | Structural deficit (−1.2k to −1.6k/person/day). Cannot sustain. Balance bug. |
| Water (fill→boil→drink) | ✅ Complete | Cistern, creeks, risk/disease. Works. |
| Day 7 System arrival | ✅ Complete | Staged cinematic, lands well. |
| Monster spawn/stance/combat | 🟡 Scaffold+ | Generic path works for all 20; bespoke for 1. Naming-via-gossip exists. |
| Trials/justice | ✅ Complete loop | 10% wild days, bribery, exile reachable. |
| Betrayal/ambush | ✅ Complete loop | Micro-quests → ambush → aftermath. Symmetric. |
| Exile | ✅ Complete | Real phase, other villages exist. |
| Progression (ability slots) | 🟡 Scaffold | Slots earnable, cap 6. Synergy discovery exists but thin. |
| Keepsakes/sentiment | ✅ Complete loop | Bond, evolution, flashbacks all fire. |
| Codex (plants) | ✅ Complete | 6 knowledge levels, "they said" vs "you know." |
| Codex (people) | 🟡 In flight | Agent working on six depths as of audit. |
| Corpses | ✅ Complete | Decay stages, looting, trauma, disease. |
| Conversation/gossip | ✅ Complete | 35-talk coherence verified. Line retirement, lie-catching. |
| Leadership vector/endings | 🟡 Scaffold | Tracked (ledger.js) but endings not reachable in play yet. No galactic table. |
| Show challenges/arenas | 🔴 Vapor | Designed in detail, **zero code**. No teleport, countdown, or arena. |
| Inter-village | 🟡 Scaffold | Villages exist, catch-up sim works, but trade/threats/gossip are thin. |
| Villager agency | 🟡 In flight | Ranging/progression agent active as of audit. |

### Debug coverage gaps (Steve's two-tap rule)
13 active scenarios: `deer`, `day7`, `uprising`, `day1`, `language`, `liars`, `night`, `starving`, `headlight`, `ambush`, `exile`, `keepsake`, `mantle`.

**No debug scenario for:** 19 of 20 monsters (only deer/headlight), trial flow, betrayal aftermath resolution, village starvation spiral, Wave 2 unlock, ability synergy discovery, inter-village contact, leadership challenge. Per the two-tap rule, these are untested by Steve.

---

## RECONCILIATION: Where the Two Passes Disagree

1. **Catalog says "20 monsters"; play says "you'll meet 3."** The spawn rate + avoidance means a real player meets a handful per run. The 19 without bespoke configs will feel samey — the descriptor and voice differ, but the beat structure (stance → warn → fight/flee) is identical. The framework's promise ("next monster is a config file") is unfulfilled for 19/20.

2. **Catalog says "food system complete"; play says "the village starves on day 10."** The complete loop serves the *player*, but the *village* metabolism is broken. The most complete system in the game has a hole in its foundation.

3. **Catalog says "Wave 2 unlocked day 7"; play says "met 1 in 200 tile-visits."** Reachable ≠ meetable. The pool dilutes: 20 monsters sharing an 8% spawn chance means any *specific* monster is ~0.4%/tile. The Monster Codex will take months to fill.

4. **Catalog says "endings tracked"; play never gets there.** The leadership vector accrues, but no run survived past day 13 in testing — the endings (Indispensable, Feared, etc.) and the galactic table are beyond the survival wall. **We are building endgame content for a game that kills you on day 12.**

---

## THE THIN LIST (priority order)

1. **Village food balance (P0 — the game is unwinnable as coded).** Villagers eat 2000, forage 400–800, no knowledge scaling. Fix: implement the promised "KNOWLEDGE FEEDS" boost, raise base forage, or lower consumption. Nothing else matters until a village can survive its own metabolism.

2. **Monster encounter configs (P1 — 19/20 are generic).** The framework exists; the content doesn't. Each monster needs its `encounter` block: telegraphs, phases, codex gates. Priority: the Wave 1 monsters players actually meet (boar, hushwolf, heron, belltoad), then Wave 2.

3. **Show challenge arenas (P1 — designed, zero code).** This is the mid-game novelty engine Steve designed (televised, mandatory teleport, 20% leaderboard cut). Without it, days 14+ have no new problems.

4. **Monster meeting rate (P2).** 0.4%/tile per specific monster means the codex fills never. Options: biome/activity weighting, the "population system" TODO at game.js:8303, or guaranteed first-meetings per wave.

5. **Debug scenarios for monsters + trials (P2).** Per the two-tap rule, 19 monsters and the trial flow are untested by Steve.

6. **Late-arc events (P3).** Nothing day-gated after day 7. The contest (day 14–21), inter-village drama, and leadership challenges need timers.

7. **Endings/galactic table (P3 — build after P0).** The vector tracks, but the destination doesn't exist. Don't build the table until the village can live to see it.
