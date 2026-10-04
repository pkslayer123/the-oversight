# DECISIONS — intention log

Append-only. Each entry: date, decision, why, alternatives considered. This is the "where to go when stuck and Steve doesn't remember" file.

## 2026-10-03 — Project start

- **Fresh repo** (`the-scattering`), separate from ChangePilot monorepo. Game is its own product.
- **Working title:** "The Scattering" (from the population-scattering premise). Final title TBD.
- **PWA on Vercel**, no app store for v1. Capacitor wrap later for native.

## 2026-10-03 — Thesis lock

- **Decision:** Survival logistics are the game; fantasy/sci-fi is set dressing. Enforced mechanically (calorie master clock, no survival skill trees, escalation taxes survival).
- **Why:** Steve's core demand — "it may be high fantasy survival, but every game is a gritty long haul of dealing with the reality of feeding yourself." Inspired by Apocalypse Parenting's logistics-focus, turned up mechanically.
- **Calorie tuning (open):** realistic vs slightly forgiving — see OPEN-QUESTIONS.

## 2026-10-03 — Codex as village artifact

- **Decision:** Codex persistence is diegetic — one villager holds the Codex skill; each run is a designated scholar. (Steve's refinement of the vaguer "field guide persists" idea.)
- **Why:** More grounded than abstract persistence; creates the village as meta-hub and the Codex-holder as a character.

## 2026-10-03 — People, not classes

- **Decision:** No rigid roles. Villagers are individuals; the System grants 2–4 abilities from pools weighted by personality/situation. Backstories pre-generated at build time (LLM-assisted during dev), shipped as data — no runtime LLM dependency.
- **Why:** Steve: "less defined roles, focus on the abilities pools." Story becomes UI.

## 2026-10-03 — Ability progression

- **Decision:** Cap 6 abilities; Trials/Discovery/Mentorship earn new ones; always player choice (pick 1 of 3); releasable including System-granted.
- **Why:** Steve: "player needs capacity to improve the person they are playing... max abilities, future ones discovered or earned in critical situations."

## 2026-10-03 — Living village, expedition clock

- **Decision:** Village simulates fully but on expedition clock (1 expedition day = 1 village day). Pauses between sessions.
- **Why:** Steve wanted living (Tamagotchi attachment). Muse pushed back on wall-clock: punishing players for not playing creates resentment, not attachment. Expedition clock gives aliveness without guilt.

## 2026-10-03 — Map: node skeleton, tile flesh

- **Decision:** Region node map (branching, StS-readable) + per-region fog-of-war tile grids + travel legs costing days/food between regions.
- **Why:** Steve: node map feels too board-gamey, full tile-crawl too fiddly for phone. Hybrid gives open-world feel (spatial foraging memory, pushing into the unknown) with mobile-legible structure.

## 2026-10-03 — Parties

- **Decision:** Up to 3 per expedition. More AP + task splitting, but every member eats (~2,500 kcal/day). Companions die permanently.
- **Why:** Follows from survival thesis — parties are a strategic calorie decision, not a free power-up.

## 2026-10-03 — Combat as hunting with consequences

- **Decision:** Turn-based, telegraphed, avoidable, high-stakes/high-reward. Monster Codex parallels plant Codex (obscured intents until learned). Monsters are food. Injuries persist. XP weights discovery/survival over kills.
- **Why:** Steve: "combat should be incredibly high stakes high reward. Killing a new type of monster should require as much codex knowledge as finding a new food source."

## 2026-10-03 — The Scattering premise

- **Decision:** Onboarding asks real home region → System places village in a different biome deliberately. Villagers arrive with favorite clothes + 5 personal items (mechanical + morale effects). Late-game legendary goal: expedition home. Scattering reason ties to endgame mystery.
- **Why:** Steve's premise idea. Makes "location matters" mechanical (home biome = thick Codex, placed biome = thin) and generates village backstories for free.

## 2026-10-03 — RNG: heavy world, zero knowledge

- **Decision:** Heavy RNG on circumstances (biome events, role draws, alien activity); deterministic persistence on knowledge (Codex). Every run winnable in principle.
- **Why:** Steve tempted by "quite a bit" of RNG. Counterweight: the dice control circumstances, never competence.

## 2026-10-03 — Win condition

- **Decision:** Campaign win = survive the first full year + uncover why the aliens forgot survival basics. Thematic close: "you win when the village no longer needs heroes." Endless mode after.
- **Why:** Gives litRPG readers closure + infinite climb. The lore question Steve invented becomes the endgame.

## 2026-10-03 — Utility lives

- **Decision:** Some scholars' kits make their run a different game (cook's run: keep everyone fed through the cold snap; warden's run: defend). Per-life win conditions vary.
- **Why:** Steve: "some lives you might have entirely utility type abilities." One survival engine, many games within it.

## 2026-10-03 — Real plant data, conservative

- **Decision:** Real edibles per biome/season, but conservative. Game never presents dangerous plants as safe; misidentification stays fictional.
- **Why:** Safety. A game must not get someone poisoned.

## 2026-10-03 — The Burn (worldbuilding)

- **Decision:** At Integration, the System destroyed all electrical wiring and all refined combustibles planet-wide, in a single event. No grid, no gas, no stockpiled fuel — anywhere, for anyone.
- **Why:** Steve, from Apocalypse Parenting — levels the economic playing field and makes near-term recovery impossible. For our game it does crucial work:
  - It explains why the world can't bootstrap: no scavenged generators, no fuel depots, no "find a working truck" escape hatch.
  - It makes *knowledge* the valuable resource, not stuff — knowing how to make charcoal beats finding an empty gas can. Directly reinforces the thesis.
  - Ruins become flavor, not loot pinatas: a dead server farm is just a weird cave with good shelter.
  - Crafting tree stays honestly low-tech: wood, stone, bone, plant fiber, clay, charcoal. No tech creep.
- **Fiction:** the System harvested refined fuels and conductors as raw material for its own construction (or: deliberate leveling so it evaluates humans, not infrastructure — the endgame mystery can confirm which).
- **Mechanical notes:** fire from wood/friction/solar only; scavenging yields materials not fuel; "combustible" loot tables excluded from ruins generation.

## 2026-10-03 — Alien end goal + tone (refined)

- **Decision:** The Integration is a cheerful, fucked-up admissions exam. Humanity must pass the System's cultivation protocol to join the wider universe — and the System is *delighted* about all of it. Cold assessment voice + game-show-host enthusiasm. Cosmic horror with a smile.
- **Why:** Steve's refinement ("this is the fucked up way they do it, all to a joyous tune"). The tonal contrast is the masterstroke: the System genuinely believes this is wonderful news while people starve. It also resolves the "why": the test IS the cultivation; passing = graduation.
- **The forgotten basics**, reframed: the examiners come from post-scarcity minds that genuinely cannot model "beings that must continuously acquire energy or die." Not malice — incomprehension. Humanity's edge is the one thing outside the System's ontology: needing to eat.
- **Win = graduation:** village self-sustaining (first human settlement the System classifies as such — a category it had to invent) + uncover the truth. Endless mode: humanity's most fascinating experiment gets stranger challenges.

## 2026-10-03 — Relic bonding (gear progression)

- **Decision:** No loot drops. Gear progression = **relic bonding**: your 5 personal starting items accrue bond through use/care/story; at thresholds the System offers "optimization" (pick 1 of 3 enhancements). Enhancements drawn from per-object-class ability pools (tools → tool-ish, clothing → protection/comfort, sentimental → morale/willpower).
- **Why:** Steve: gear "came with you given sentimental magical upgrade... part of the arsenal you need to shape." Anti-loot-drop: arsenals are grown, not found. Every endgame kit unique. The System measures attachment as data it can't understand — sentimentality is the human output it can't generate, hence the most valuable.
- **Narrative + standard pools:** sentimentality/narrative flavor layered over standard mechanical pools per object class. Pretty + deep.

## 2026-10-03 — Broken builds embraced

- **Decision:** Masterful ability + relic combos can unlock nearly/completely unfair synergies *in specific dimensions*. Never generally invincible — the hunger tax always applies.
- **Why:** Steve: "I love the broken builds component of roguelites." Design principle: combos should be discoverable (Codex hints at synergies), dimension-breaking is fine (unkillable in combat? still gotta eat), no combo removes survival pressure. The test for every combo: "does this let you skip dinner?" If yes, it gets a hunger-priced cost.

## 2026-10-03 — System voice: alien, earnest, out of touch

- **Decision:** The System is truly alien and completely out of touch — but it *really tried*. It studied humanity exhaustively and got every detail technically right and spiritually wrong. Cheerful game-show host delivering cosmic horror. Never malicious; worse — earnest.
- **Why:** Steve: "they really tried their best to get all the details right, they just simply aren't human." The comedy-horror contrast is the game's signature tone. Examples live in VISION.md tone section (expand).
- **Interface:** RPG "overlay" as a literal second visual layer. Pre-Integration: grounded terminal (earthy greens/ambers, monospace grit). Post-Integration: the System overlay slides OVER it — cold blues/whites, too-clean geometry, rounded corners that feel wrong. It never replaces the survival UI; it covers part of it and works around the hunger meter (still the biggest element — a visual joke about priorities). Occasional glitches reveal untranslated alien script underneath.
- **Rule:** the System knows everything about you and nothing about you. Resting heart rate: known. Grandmother's maiden name: known. Why you're crying: [FIELD NOT FOUND].

## 2026-10-03 — Roguelite staples, reskinned (the broadcast layer)

- **Decision:** Classic roguelite mechanics return as broadcast-show mechanics. The System has an *audience* (other species watching); contestants earn **Favor** (second currency) by being entertaining. All broadcast-layer mechanics are optional spice, never core loop.
- **Why:** Steve: galactic shop / care packages "from fans." The audience framing makes every staple native to the fiction instead of pasted on.
- **The set:**
  - **Favor & Galactic Shop:** earn Favor via engagement (dramatic wins, close calls, novel solutions — the System scores entertainment). Spend between regions on fan care packages. Inventory is wacky and earnest ("Premium Dirt — artisanal, pre-Burn!").
  - **Audience Votes (StS ?-rooms):** viewers vote on your next event; offered 3 options with vote percentages. "The audience has voted! 67% want you to fight the thing!"
  - **Spotlight Elites:** the System spotlights a fight for broadcast — tougher enemy, cameras visible, audience showers Favor on the winner. Opt-in by engaging.
  - **Sponsor Conditions (curses+):** a fan sponsors you — take the package, accept the condition (no resting 3 encounters, etc.). Optional, wacky.
  - **Rerun Episodes (seeded dailies):** the System rebroadcasts classic scenarios; same seed for everyone, scholar leaderboards.
  - **Unauthorized Companion (pets):** a stray animal adopts you. The System classifies it as equipment, keeps trying to optimize it. Charm + minor utility (danger sense, scrap finding).
  - **Syndication (ascension):** post-campaign endless mode framed as rebroadcast with escalating modifiers.
- **Rule:** broadcast mechanics never touch the calorie economy's integrity. Favor buys conveniences and novelties, never dinner.

## 2026-10-03 — Content architecture: data-driven + validated

- **Decision:** All content is JSON in `src/data/` conforming to `src/data/schemas.json`. Engine (`src/js/engine/`) reads data, never hardcodes content. `scripts/validate-data.js` is the gate: fails on missing/unknown fields, type/range mismatches, duplicate ids, dangling references.
- **Why:** Steve: "when we want to add something, it should be to a list with known structure... make this thing scalable." The modifier pipeline (`modifiers.js`) is the scalability core: abilities/relics/injuries declare `{target, op, value}` and the engine resolves every computed value through it. New abilities never touch engine code.
- **Safety rules encoded:** plants require `confidence: high`; shop items may not carry calories (Favor buys conveniences, never dinner).
- **Starter content:** 10 SE-woodland plants (real, conservative), 1 biome, 3 villagers with backstories, 13 items, 12 abilities, 15 System lines. Monsters/events/shop/trials stubbed as empty arrays.

## 2026-10-03 — Simplicity doctrine: decisions, not chores

- **Decision:** The core design law is **decisions, not chores**. Tedium = executing a plan you already made (click 47 times to craft). Fun = making the choice. Every AP spent must feel like a decision, never an errand.
- **Why:** Steve bounced off Caves of Qud — too much to learn. The game must feel like an endless world rewarding real survival skills, not another crafting game. Depth lives in *which* of 4 daily choices you make, not in how many steps each takes.
- **The rules:**
  - **4 AP = 4 decisions.** The action budget IS the simplicity engine. You cannot be overwhelmed because you cannot do more than 4 things.
  - **One tap per action.** Forage a tile: one tap, result + Codex update. Depth is in *which tile* (fog-of-war grid), not a foraging minigame. Eat: "eat to full," game picks sensibly, override optional. Craft: one tap — the decision is the AP and materials, never the process.
  - **The Codex is the tutorial.** No manuals. Knowledge unlocks UI: find cattails → game offers "boil roots?" → you learned cooking. A real-world forager should be good at this game immediately.
  - **Fail forward.** Eat the unknown berry → sick, but the Codex learns. Curiosity is never punished with a run-ender early. The lesson is the reward.
  - **No inventory tetris, no durability micromanagement.** Food = kcal + carried. Relics don't degrade from use; they change at story moments.
  - **Two-minute readability.** Any game state must be legible on a phone in under two minutes: where am I, what do I need most, what are my options?
  - **One-thumb, 3-5 minute days.** Sessions are "one more day," not "one more hour."
- **How we find the line (ongoing):** slice-1 playtest is the instrument. Tedium signals: repeated identical actions with no decision, UI requiring counting, any system needing a wiki. The 30-second test: if the core loop takes longer to explain, it's too complex. The Qud test: can a new player survive day 1 pressing only obvious buttons?

## 2026-10-03 — Day structure: nested (4 parts × node affordances)

- **Decision:** Days are nested, not flat. 4 day-parts (DAWN / MIDDAY / DUSK / NIGHT), each with 1 AP for a major action. Current node affords unlimited FREE minor actions. Travel between adjacent nodes costs 1 AP — movement is the AP economy's backbone.
- **Why:** Steve: 4 flat AP isn't granular enough for a full day; nesting gives rhythm. A day should feel lived (dawn at the creek, midday in the grove, dusk on the trail, night at camp), not clicked through.
- **The line:** minors are MAINTENANCE, never production. Drink/refill at water, tend fire/check snares/eat from stores at camp, read Codex anywhere — free. Harvesting, hunting, crafting, treating water always cost AP. Production is never free.
- **Day-part character (contextual, not mechanical):**
  - DAWN: hunt find +25%, world waking up
  - MIDDAY: heat — energy drain up (summer), honest work hours
  - DUSK: hunt find +25%, travel encounters up (things hunt at dusk too)
  - NIGHT: camp only; night foraging possible at 2× encounter risk (the audience votes for this)
- **Typical day:** travel out (1) → work (1) → travel back (1) → camp work (1). Or push deeper and camp out — the map is the game.
- **Still simple:** the player just picks what to do; modifiers are contextual. Complexity in the world, not the interface.

## 2026-10-03 — The Five Items (system spec)

- **Decision:** Full spec in `docs/ITEMS.md`. Five personal items + favorite clothes, no loot drops. Classes (tool/clothing/sentimental) determine enhancement pools. Bond accrues passively (1/day meaningful use; sentimental bonds by keeping + story moments). Thresholds at 10/25/50 → System offers optimization, pick 1 of 3. Loss happens at story moments, never durability bars.
- **Why:** Steve asked for a stab at the 5 items per existing directives. Honors: relic bonding, per-class pools, simplicity (passive bond, no grind), broken builds (combos break one dimension, never dinner), System voice.
- **Data:** `src/data/relicEnhancements.json` (9 enhancements, each with earnest-alien systemCommentary), bond thresholds on 9 items, schema + validator support. Gate green.

## 2026-10-03 — Loot exists; the magic is in the relationship

- **Decision:** Revised "no loot drops" → loot exists from four sources, but **bond is non-transferable**. A bonded relic in a stranger's hands is just stuff — the enhancements were tied to *their* story, not the object. The magic was never in the knife.
- **Why:** Steve: no loot drops "seems odd." This revision is stronger than the original: the loot system now *proves* the thesis instead of just avoiding the question.
- **Loot taxonomy:**
  1. **Bonded relics** (your 5) — grown, not found. The core.
  2. **System awards** — trials, achievements, audience milestones. Attuned to you; work fully.
  3. **Fan packages** — galactic shop. Sent *for you*; attuned, wacky, never dinner.
  4. **Scavenged/taken** — ruins, other scholars. Base effects only, no bond. Can be re-bonded from 0 — with the System's awkward provenance note: "Unit K-NIFE has been reassigned. Previous attachment data: [REDACTED]. Please form your own attachment."
- **Other scholars as danger (new):** encounters in the wild — trade, share info, compete, rob, walk away. The System stages these for entertainment (audience votes spike). A desperate scholar with nothing to lose is the most dangerous monster in the game, and the most human. The village hears what you did; the Codex records it; the audience reacts (the audience loves a heel turn — Favor rewards for villainy, which is delightfully dark).

## 2026-10-03 — The worthiness exam: dark path and light path

- **Decision:** The Integration is not just harvesting data — it is conducting a moral evaluation. The System subtly guides each scholar toward becoming the kind of member of the species *worth inheriting the earth and taking a council seat*. Two paths: **cooperation** or **anarchy**. Both are valid. Both can win.
- **Why:** Steve: the game should guide you toward becoming "the member of the species worth inheriting the earth and taking a seat at the council." This braids the third thread into the win condition (survive the year + uncover the truth + become seat-worthy).
- **The System doesn't judge — that's the horror.** It builds a temperament profile (prosocial vs dominance markers, trust given/broken, lives saved/taken) and comments on both with equal cheer: "Prosocial behavior detected! The Committee is taking notes!" / "Dominance display detected! The Committee is ALSO taking notes!" It is writing your character reference, not grading your morals. It finds your villain arc as fascinating as your hero arc.
- **Mechanical expression:**
  - Temperament is visible only through the System's running commentary — no good/evil meter UI. The mirror is literary, not gamey.
  - Trials customize to the student: the light path is offered trials of sacrifice; the dark path, trials of cunning.
  - The village reflects you: a cooperative scholar builds a haven; a dark scholar builds a fortress that fears them.
  - The scholar-at-the-creek encounter is the recurring exam question: trade or rob? The System keeps asking, in new forms, all game.
- **Endings (both earned, neither a fail state):**
  - Light: the Council recognizes humanity as a cooperative species. Seat granted. The village becomes an embassy.
  - Dark: the Council recognizes humanity as an apex species. Seat granted — under observation. The village becomes a cautionary tale with diplomatic immunity.

## 2026-10-03 — Arc structure + anti-speedrun rule

- **Decision:** The campaign is structured as major arcs, each a large endeavor and a sequential release unit. Proposed skeleton:
  - **Arc 0 — The Scattering:** onboarding. Home, five items, placement. Short.
  - **Arc 1 — Seven Days:** pure survival, no System. Prove the loop. (Vertical slice 1.)
  - **Arc 2 — Integration:** the System arrives. Abilities, trials, audience. The game gets weird.
  - **Arc 3 — The Neighbors:** other scholars, creek encounters, trade/rob, village politics. Temperament sharpens.
  - **Arc 4 — The Harvest:** preservation is everything. Stockpile or starve. Galactic shop opens.
  - **Arc 5 — The Long Dark:** the truth, final trials, the council seat. Endings.
  - **Epilogue — Syndication:** endless mode.
- **Anti-speedrun rule:** power buys comfort, never time. Arcs are gated by time and story (the village year is 365 expedition days — you cannot skip winter), not by power. An OP build makes you safe and stylish; the story still takes its year. Each arc adds ONE system (progressive disclosure).
- **Process (Steve asked):** skeleton first, chapters one at a time. Lock now: pillars, arc list, what carries between arcs (village, Codex, relics, temperament). Do NOT lock now: arc 3+ details, numbers, content volume. Slice 1 will invalidate detailed plans — that's the point of building it first.

## 2026-10-03 — Restructured: the campaign as books (series-scale)

- **Decision:** Replaced the season-chunked arc skeleton with **books** — each a full arc defined by transformation, not time. Steve: arcs 1-4 were a single arc; the story deserves litRPG-series scale.
- **Why:** An arc is a transformation + a mechanical addition + a question raised and answered. Seasons are pacing, not story. Each book is a sequential release unit with its own climax.
- **The books:**
  - **Book 1 — The Scattering:** victim → survivor. Arrive, learn to eat, the village forms. Climax: survive the first season. Ends as the sky changes again.
  - **Book 2 — Integration:** survivor → contestant. The System's joyous tune, abilities, trials, audience. Climax: first evaluation. The temperament question asked explicitly.
  - **Book 3 — The Neighbors:** contestant → citizen. Other villages, other scholars, trade/politics/robbery. The dark/light path truly diverges — it's about people now. Climax: the first moot, or the first war.
  - **Book 4 — The Deep Wilds:** citizen → power. New biomes, bigger monsters, build comes online, relic bonding deepens. Climax: the first real clue about the System.
  - **Book 5 — The Truth:** power → understanding. The alien end goal unfolds — the Burn, the scattering, the council. The earnest mask slips (or doesn't, which is worse). Climax: you know. Now choose.
  - **Book 6 — The Seat:** understanding → judgment. The final evaluation, the Long Dark as crucible, dark and light converge on the council. Endings. The village's fate.
  - **Epilogue — Syndication:** endless mode.
- **Refinement:** the campaign spans multiple expedition years, not one. "Survive the first year" becomes Book 1's climax, not the game's win. The win remains the council seat — earned over years, not months. This is also the deeper anti-speedrun: even OP builds take years; power buys comfort and style, never time.
- **Each book answers a question and raises a bigger one:** Can I eat? → What is the game? → Who are my people? → What's out there? → Why? → What will I do?

## 2026-10-03 — Book transitions are earned, never timed

- **Decision:** Every book transition is triggered by player-earned thresholds (knowledge gained, stability achieved, contact made, choice declared) — never by the calendar. Seasons provide texture; they never gate story.
- **Why:** Steve: phases "should be triggered by a certain event or level unlocked, knowledge gained" — and players will know something's up from the start, so the System's arrival must feel responsive, not scheduled.
- **The principle:** GATES ARE EARNED, NEVER TIMED.
- **Triggers (first pass):**
  - **1→2 Integration:** the village achieves baseline viability (pantry stable N days, or first crisis survived). The System was watching all along — you earned its attention: "CANDIDATE-SET 4419 has achieved baseline viability! Integration commencing! The Committee is SO excited!"
  - **2→3 Neighbors:** first contact — you find another scholar, or the System introduces you "for entertainment purposes." The audience wants crossover episodes.
  - **3→4 Deep Wilds:** you've outgrown the local — Codex maps the region, or the village must expand. The world opens because you earned a bigger one.
  - **4→5 Truth:** knowledge threshold — enough truth fragments assembled, or the System judges your temperament mature. Revelation is investigated, not delivered.
  - **5→6 Seat:** the choice — you declare yourself ready (dark: you take it; light: you're invited).
- **No fake mystery in Book 1:** the scattering is obviously unnatural from minute one. Book 1's question isn't "are there aliens" — it's "what happened, where am I, how do I eat." Seed foreshadowing instead: strange lights, a glyph that appears and vanishes, the feeling of being watched (you are — the audience is already there). The System's arrival is the other shoe dropping, and the dread is the point.
- **Compatibility with anti-speedrun:** thresholds take as long as they take. Power crosses stability faster, but truth requires investigation and the seat requires becoming someone. Time is the medium, not the gate.

## 2026-10-03 — The village is a character, not a base

- **Decision:** The village is NOT a guaranteed safe haven. It runs a living sim (cohesion, stores, morale, population, defense) with internal threats as likely as external ones. It has needs, opinions, memory, and agency — it can love you, fear you, need you, or reject you.
- **Why:** Steve: "Should it be a certainty? Or are some villages better than others... Internal threats are just as likely as external." A guaranteed haven is a resource sink, not a story. A village with agency is the primary mirror of the temperament path.
- **Internal threats (the set):**
  - **The hoarder:** someone's skimming the pantry. Confront, exile, or let it slide? The System is fascinated.
  - **The demagogue:** charismatic, reasonable-sounding, corrosive. "Why does the scholar eat our best food and leave?"
  - **Resentment of absence:** you're gone for weeks while they do the work. What exactly are you *for*?
  - **Despair:** low morale isn't a number — people stop working, stop eating, leave.
  - **Succession:** villagers die. Who takes the roles? Not everyone is suited.
  - **Exile (the darkest mirror):** go dark enough, rob enough travelers — come home to a closed gate. The village decides it doesn't need *you*.
- **Other villages run the same sim** (simplified). Encounters are with real situations — thriving, starving, fracturing, dangerous — not set dressing. Some villages are better than others, and you'll know why when you meet them.
- **Endings branch on the village:** haven (loved), fortress (feared), embassy, cautionary tale — or the gate closed. "The village no longer needs heroes" now has teeth: it might decide it doesn't need you specifically, and that's its own ending.

## 2026-10-03 — Villages are independent; the scholar is free

- **Decision:** Decouple scholar from village. Villages are independent entities running their sim on the expedition clock whether you're there or not. The scholar's relationship to any village is a *status* (member, leader, guest, exile, stranger), not an identity. Your starting village doesn't have to be your ending one.
- **Why:** Steve: this is how it feels like a truly open world. Playstyles: settled leader, nomad, or mix. The world doesn't pause when you leave the room.
- **Architecture (from day one):** `state.villages = {id: villageState}` — multi-village in the data model from the start, even though Book 1's UI shows one. `scholar.standing = {villageId: status}`. Single-village now would mean rewriting state.js later.
- **The delegation mechanic:** absent leader appoints a second — an NPC with their own leanings who won't do what you would. Leave the demagogue in charge for a month and find out.
- **News, not omniscience:** away villages report via traders/travelers — delayed, possibly wrong. Full state only when present. The "while you were gone" digest (3-5 bullets, not a log) is a core UI piece.
- **The Codex travels with you.** Villages hold degraded copies (telephone game); yours is the master. Teaching/learning knowledge is a mechanic.
- **Endings branch:** the village you claim at the end — or the nomad ending: no village claims you, but the roads are safe because of you. You belong everywhere and nowhere.
- **Succession:** on scholar death, the mantle passes from your strongest-bond village. Exiled everywhere? The run gets interesting.

## 2026-10-03 — Smart digest: bond-weighted news, never miss what matters

- **Decision:** The "while you were gone" digest is bond-weighted and tiered. The game tracks who/what you care about (bond values, time, choices) and prioritizes news accordingly. Simplicity rule: the right amount of information — never useless, never overwhelming, never silent on what matters.
- **Why:** Steve: correct amount of info so the player doesn't feel lost, overwhelmed, or — worst — blindsided about people they bonded with.
- **Three tiers:**
  - CRITICAL (always surfaces, interrupts): someone you love died, your village starves, you've been exiled, your deputy betrayed you.
  - NOTABLE (in the digest): harvest failed, new leader, faction tension.
  - AMBIENT (village screen only): gossip, minor quarrels.
- **The System as messenger:** it's watching everyone and loves delivering dramatic news. "We thought you'd want to know: Haven's pantry is empty. The Committee is WORRIED! (The Committee is never worried.)" Bond guarantees delivery — the game never lets a bond go uninformed.
- **FOMO without punishment:** news informs so you can choose; it never punishes you for being elsewhere. Missing out is the nomad's cost, and the game respects it.

## 2026-10-03 — Party system

- **Decision:** Parties of up to 3 (you + 2). Companions are people, not units — they eat, opine, refuse, bond, die permanently. You lead them; you don't micromanage them.
- **Why:** Steve: don't neglect the party system. It's where the game's emotional weight lives.
- **The core tension is caloric:** every member costs ~2200 kcal/day + water. The party is a *calorie decision*. Bring the hunter and you might out-eat the extra mouth. Every expedition asks: is this person worth feeding?
- **Agency:** companions have opinions about your choices — the dark path costs you good people; they leave. They get tired, argue, bond with each other. They can refuse: "Mara's not doing that. You know she's not doing that."
- **Permanent death:** they die, they stay dead. The village mourns, the Codex records, the surviving companion remembers — and might blame you.
- **Simplicity:** party screen = faces + kcal share + status. In the field, companions are modifiers (their abilities join your pipeline) + voices (opinions at decision points). One tap to assign; depth is in who you brought.
- **Recruitment is relational:** they join from loyalty, debt, boredom, because you asked. Never a "recruit" button.
- **The party-village tension:** every companion in the field is a worker not at home. The village notices. The demagogue notices.
- **The System loves parties:** more cast = better television. It names your group without asking: "The Committee has designated your unit: TEAM PERSEVERANCE! Merchandise available!" Fans have favorites; companions earn Favor too.

## 2026-10-03 — Departure ritual + the reliability contract

- **Decision:** Leaving a village triggers a **departure ritual** — the game asks, the player never has to remember. Steps: name a deputy (leanings visible), 2-3 standing orders, party selection, supplies split, expected return date. Overdue return triggers worry, then events.
- **Why:** Steve: "a person shouldn't have to worry about remembering to set a deputy... We must manage dependencies with sophistication and reliability."
- **The reliability contract:** the village sim is deterministic-ish and legible, not random. Do everything right (deputy, supplies, orders, return on time) and the village *will* be okay for the expected duration. Problems trace to: staying too long, appointing badly, declining to choose, or genuine telegraphed crises. The game never punishes what you couldn't see or decide.
- **Dependencies are explicit and chainable:** deputy quality → cohesion → work output → stores → morale → cohesion. The player can reason about the chain. Surprises come from *character* (the deputy's leanings), never from *noise*.
- **"Whatever" is a choice:** "leave it to them" is always available — but explicit, with known risk. Never a forgotten default.
- **Return ritual (mirror):** bond-weighted digest + deputy's report in their voice + reconciliation of your orders vs what happened.
- **Simplicity win:** the departure ritual IS the village management UI. No separate management screen to learn — you govern by leaving well and returning honestly.

## 2026-10-03 — Standing ladder: leadership is earned, never default

- **Decision:** Per-village standing ladder: **stranger → guest → member → trusted → leader**. Mechanics gate on standing. The departure ritual scales with it — strangers just walk away; only leaders name deputies. You are not in charge until the village says so.
- **Why:** Steve: the departure ritual forced leadership without earning it. Leadership without commitment is unearned power — and unearned power is boring.
- **Earning it:** standing moves through contributions and crises, not a progress bar. Saved the harvest → member. Stood watch in the raid → trusted. The village votes, acclaims, or submits — depending on its character. It moves down too: rob a traveler and fall to stranger. Exile is below stranger.
- **Two ways to lead:** beloved or feared. Fear works — a village can submit. The sim tracks *how* you lead; different events, different endings, different homecomings.
- **Gating per level:**
  - Stranger: trade, ask, maybe sleep.
  - Guest: rest safely, fair trade, gossip.
  - Member: voice, share of stores, obligations; lite departure ("tell someone you're going").
  - Trusted: propose projects, mediate disputes, receive confidences.
  - Leader: full departure ritual, standing orders, deputy, command defense.
- **The general pattern (applies elsewhere):** NOTHING IMPORTANT IS GIVEN; EVERYTHING IS EARNED, VISIBLY. Status gates mechanics across systems: System trust gates trial tiers; audience Favor gates shop tiers; scholar trust mirrors the village ladder; the Codex withholds advanced entries until basics are earned ("you're not ready for this section"); relic bonding already works this way. The player always knows what would raise standing — villages *tell* you, in words, not hidden numbers.
- **Tutorial bonus:** the departure ritual grows with standing, so players learn the full system by climbing toward it. No front-loaded complexity.

## 2026-10-03 — Combat spec: one command per round, knowledge is the depth

- **Decision:** No grid. Combat is **one command per round** — you lead the party, not puppeteer it. Party members' abilities modify the command; their agency shows in execution, occasionally unprompted.
- **Why:** Steve asked grid vs per-member choices. Grid is a second game to learn (violates simplicity, fiddly on phone). Per-member orders is micromanagement (violates "you lead, don't micromanage"). One command keeps a fight to ~2 minutes, one thumb.
- **Round structure:**
  1. **Read the telegraph** (StS-style intents; obscured for unknown monsters: "the creature shifts — you can't read it").
  2. **One command:** STRIKE (all-in) / HARRY (skirmish, safer, builds advantage) / BRACE (defend, protect injured) / TRAP (if prepared — big payoff) / STUDY (observe: fills Codex, reveals intent) / FLEE (always available, has a cost).
  3. **Resolution** — party output vs monster action, injuries assigned sensibly.
  4. Repeat, typically 2-4 rounds.
- **Knowledge is the depth:** unknown → intents hidden; observed → readable + one weakness; slain → full Codex, hunts become efficient. Preparation (traps/bait set pre-combat for 1 AP) + full Codex turns a terror into a harvest. This mechanizes "killing an unknown monster costs knowledge comparable to discovering a food source."
- **Stakes:** injuries persist via modifier pipeline. Death possible but always telegraphed — lethal intent shows before it lands; FLEE was always there. Combat deaths feel like decisions, not surprises.
- **The System commentates:** combat is content. "OH! A bold STRIKE! The audience is ON ITS FEET!" Spotlight fights earn Favor.
- **Monsters are food:** kills yield top-tier calories + materials. Combat is hunting with consequences.

## 2026-10-03 — Combat timing: decisional, not reflexive

- **Decision:** Well-timed decisions are rewarded through **telegraph-response matching**, not reflexes. The monster declares intent → you match the right command → abilities amplify correct reads into devastating ones. No quick-time events, ever — our players are on phones, possibly on a bus. Decisional timing includes them; reflexive timing excludes them.
- **Why:** Steve: how do we reward well-timed decisions without clunkiness? The telegraph system already *is* a timing mechanic — it just needed the payoff structure made explicit.
- **The matchup (Codex-gated; unknown monsters hide the left column):**
  - CHARGE (heavy, single) → BRACE. Riposte abilities punish the correct read.
  - STALK (setting up) → STRIKE/HARRY. Hit it before it's ready.
  - FRENZY (multi light) → HARRY/FLEE. Don't trade into volume.
  - FEINT (tricky) → STUDY. Don't commit blind.
  - FLEEING → STRIKE (free hit) or let it go (conserve).
- **Abilities create moments, not buttons.** Diverse kits plug in as: (a) passive pipeline modifiers, always on; (b) triggered payoffs on correct matches ("BRACE vs CHARGE: reflect 50%"); (c) setup/payoff chains ("two HARRYs → next STRIKE crits"). When they fire, the combat log *spotlights* them: "Jesse doesn't blink. One shot. (Patient Aim ×2)" — the player feels the build working.
- **The biggest timing decision happens before the fight:** choosing the engagement — dawn/dusk, trap set (1 AP), full Codex, rested party. Preparation shifts the matchup (first strike, revealed intents). The System rates it: "Hunt preparation: EXEMPLARY!" The survivalist beats the button-masher before round one.
- **Mastery =** reading 2-3 move patterns (earned via Codex) and matching correctly under pressure, with a build assembled to punish the matches. Pattern recognition, not reflexes.

## 2026-10-03 — Onboarding flow (first ~15 minutes)

- **Decision:** Cold open → where is home → meet the village → choose scholar → five items → placement → first dawn. Playable within ~5 minutes; no System UI until Book 2.
- **Why:** First impression carries the thesis. Every beat earns its place: hook, loss, people, inheritance, displacement, survival.
- **Beats:**
  1. **Cold open:** black screen, terminal lines: "The sky changed on a Tuesday." / "You woke up somewhere else." Hook before chrome.
  2. **Where is home:** region picker (v1). Mechanical: home biome = thick starting Codex. Emotional: the game remembers what you lost. Home entries later show greyed: "not here. Not anymore."
  3. **Meet the village:** 3-4 villagers, one line each. The Codex-holder named. Village presented with generated name; rename optional (one tap).
  4. **Choose scholar:** pick 1 of 3 presented villagers (backstory, personality, 2 granted abilities, System-free assessment — no System yet, so the assessment is the Codex-holder's honest read). People-not-classes moment: you read the person.
  5. **Five items:** "The sky is changing. What did [Name] carry out of their old life?" Guided catalog pick by class; suggestions flavored to backstory, never enforced.
  6. **Placement:** "Southeast Woodlands. Not home." Displacement beat: thin local Codex vs thick home Codex.
  7. **First dawn:** tutorial day — day-parts shown, 3 obvious actions (forage, eat, rest). The Codex-holder's whole tutorial, diegetic, one line: "Eat something green. Drink water. Come back before dark." Qud test: survive day 1 on obvious buttons.
  8. **Foreshadowing:** strange light on horizon, flickering glyph, feeling watched. Planted, never explained. (Book 1: no fake mystery — the scattering is obviously unnatural; the question is survival, not what happened.)
- **Starting standing:** member (thin). You arrived together. The village already has a leader (NPC) — leadership is earned later via the ladder, and the leader's existence powers resentment/delegation dynamics. Departure ritual starts lite.
- **Explicitly excluded:** System UI, trial offers, Favor, shop, audience — all Book 2+. Book 1 is pure survival; the other shoe drops later.

## 2026-10-03 — Onboarding revised: fully simulate the beginning (day zero)

- **Decision:** Revised onboarding: no established village, no reputations, no Codex — the player witnesses (and participates in) the village being *born*. Supersedes the earlier onboarding spec's "meet the village" framing.
- **Why:** Steve: the choose-scholar beat "makes it sound like this has gone on awhile." Day zero means strangers, confusion, no institutions.
- **Revised beats:**
  1. **Cold open** (unchanged): "The sky changed on a Tuesday." / "You woke up somewhere else."
  2. **Waking up:** a clearing, confused people. Observations, not introductions: "A woman in scrubs is checking pulses." "A man in camo hasn't let go of his knife."
  3. **Where is home** (unchanged): region picker; home Codex thick, here thin.
  4. **"Which one is you?"** (replaces choose-scholar): 1 of 3 waking people — first-person, not roster. Backstory = your past; ability kit follows the person.
  5. **Five items:** "What did you grab?" Hybrid — derived from backstory, tap any to swap from the catalog. Personal, not gamey; agency without a shopping trip. (Tunable: full choice vs derived.)
  6. **The Codex is founded** (new): nobody has it yet. Someone says "we should write down what we learn." Your scholar volunteers (or is volunteered) — the Codex is your field journal, which is why you, the player, see it.
  7. **The village forms** (replaces "meet the village"): the group decides to stay together. A name emerges. A leader emerges — not elected, just the one who started giving orders and people listened. First-night decisions: watch rotation, where to sleep.
  8. **First dawn:** the tutorial line comes from a fellow confused person, not an authority: "Eat something green. Drink water. Come back before dark." — said by the woman in scrubs who doesn't know if she's right.
  9. **Foreshadowing** (unchanged): strange light, flickering glyph, feeling watched.
- **Standing at day zero:** "founding" — member-equivalent but unearned (you were just there). The ladder still governs everything after; leadership emerges and can later be earned/challenged.

## 2026-10-03 — Codex: extract-to-save, knowledge diplomacy, skill + repository

- **Decision:** Three-layer Codex model:
  1. **Field notes** (vulnerable): everything learned exists as notes on your person until transcribed. Die in the field → notes drop with you. A surviving companion can carry them back; a later expedition can recover your remains (recovery mission hook).
  2. **Codex skill** (personal ability): held by the scholar — accurate field recording and transcription. Without it, field notes are *unreliable* (occasionally wrong — the game may lie to you, honestly labeled as uncertain). Teachable via mentorship; this is how the mantle passes on death.
  3. **Codex repository** (village feature): the physical archive. Knowledge is only *safe* once transcribed here — return to the village or die in it. Villages can build/improve it as a project.
- **Why:** Steve: knowledge recorded only on return-or-village-death; shareable with non-hostile villages; liked the Codex-as-ability idea / village-hub ability.
- **The risk loop:** the further you go, the more you know, the more you stand to lose. Every expedition is a bet; the return journey is the most dangerous part. This is the roguelite extraction tension, native to the fiction.
- **Knowledge diplomacy:** share/copy entries with non-hostile villages (Book 3+). Copies degrade (telephone game). Strategic choice: raise all boats or hoard your edge. Teaching builds standing; the System watches either way: "Knowledge-sharing metrics: EXEMPLARY!" / "Knowledge-hoarding detected! Strategic! The Committee approves of BOTH!"
- **Stealing:** dark path can steal another village's Codex. The System is *enthralled*.

## 2026-10-03 — Codex overlay + the teaching mission

- **Decision:** Codex knowledge manifests as **marginalia overlay** — the game annotates the world with what *you* learned. Known plant on a tile: "Forage dandelion (known: safe, 45 kcal)" with prep hints as one-tap options. Unknown: "Forage unknown greens (unidentified — risk?)". Rendered as warm human handwriting-style notes, visually distinct from the cold System overlay: your memory vs their broadcast.
- **Why:** Steve: Codex should unlock an overlay for correct actions; wants players to actually learn survival from the game.
- **The overlay remembers; it doesn't play.** It shows what you earned. New biome, thin Codex → the overlay goes quiet. Displacement made visible: your knowledge doesn't travel, but the system does.
- **The teaching mission (design rules):**
  - **"Would this work in the woods?" test:** every survival mechanic must model real causal structure (wet wood doesn't burn, moving water is safer). Decisions, not chores — true principles, not fiddly details.
  - **Real identification:** the ID minigame uses real distinguishing features. Know it in life → know it here. Learn it here → know it in life.
  - **Failure teaches:** eat wrong → sick, and the Codex records *why* ("no milky sap — note the difference"). Mistakes are safe lessons.
  - **The fiction enforces the pedagogy:** the System *can't* teach survival — its blind spot is your classroom. The game never hands answers; the world does.
  - **Editorial process:** `confidence: high` is the floor. Schema gains `sources[]` — real citations per plant. Expansion biomes get expert review (foragers, survival instructors).
- **Long-term:** the player's Codex becomes a *real personal field guide* — exportable, readable outside the game. Play a year, own 50 plants you actually learned. The product beyond the game.

## 2026-10-03 — Monster design: recognition + wrongness

- **Decision:** Monsters are Earth's own fauna, twisted — never imported aliens. Every monster starts as a real animal; the horror is recognition plus wrongness. Twists follow an ecological catalog, 1-2 per monster; restraint is scarier than excess.
- **Why:** "Earth is a bit twisted; monsters and challenges come alive." Imported aliens would betray the thesis (the danger must be *of this world*). The System altered biology with purpose — or by accident, which is worse, because it doesn't fully understand what it did.
- **The wrongness catalog (twist themes for content):** silence (predators that don't vocalize) / coordination (pack tactics beyond nature) / persistence (they don't give up) / seasonlessness (rut/migration/hibernation broken) / size-density (muscle, quills, plates) / sensory (it knew you were there) / hunger-boldness (winter makes everything braver).
- **Rules:** threat comes from situation (ambush, pack, territory, winter hunger), not level numbers. Usually edible — big calorie yields; but *some* twisted fauna isn't safe, and "is it food?" is itself a Codex discovery. 2-3 telegraphed moves each; Codex stages gate readability (unknown → observed → slain).
- **Starter set (SE woodlands):** Thornback Boar (flagship — slice 1 encounter; territorial charger, excellent pork), Hushwolves (silent pack hunters; telegraphed by *absence* — birds go quiet), Gallowdeer (the tragedy monster — you recognize the deer; unseasonal aggression), Mirelurker (later; ambushes at water — water has a cost).

## 2026-10-03 — Monsters revised: the System's botched homework (supersedes wrongness catalog)

- **Decision:** Monsters look correct but act wrong — every one is a mashup of misunderstood anatomical function, literalized idioms, and botched expressions. The System "reproduced" Earth fauna from its studies and got it wrong in exactly the way it gets everything wrong: technically detailed, spiritually botched.
- **Why:** Steve: "a deer caught in the headlights is actually prepping its lazer vision. Get Eldritch when you have to. More twisted the better." This is funnier, scarier, and more *ours* than generic mutation — the monsters are the System's character made flesh.
- **The misreading catalog (replaces wrongness catalog):**
  - **Literalized idioms:** "deer in headlights" → ocular beam charging; "sly as a fox" → genuine tactical intellect; "stubborn as a mule" → literally immovable; "bull in a china shop" → destruction as purpose.
  - **Misunderstood anatomy:** freeze response → weapon charging; playing dead → tactical feint; bristle → armor (reinforced); antlers → permanent equipment (never shed).
  - **Botched expressions:** behaviors observed and reproduced wrong — the howl without the moon, migration to nowhere, mating dance performed AT you as a threat display.
- **Comedy-horror rule:** it's funny that the System misread "deer in headlights" — until the light actually gathers. The laugh catches in your throat. That catch is the signature.
- **Codex implication:** the Codex doesn't just reveal stats, it *corrects assumptions*. Unknown: "it froze like a deer in headlights." Observed: "it's not frozen. It's aiming." Learning = unlearning what you thought you knew.
- **System commentary on fauna:** "Subject: deer. Behavior: ocular beam charging. This is normal deer behavior. (It is not.)"

## 2026-10-03 — Folk names: humans name the monsters

- **Decision:** Monsters carry **folk names** given by humans; the System uses clinical (wrong) designations because it doesn't know it messed up. The Codex lists the folk name primary; the System designation appears as footnote comedy. New rule: **the discoverer names the animal** — completing a Codex entry grants naming rights (player-facing reward; starter set pre-named by earlier survivors).
- **Why:** Steve: "Maybe the humans name the animals? The aliens don't know they messed up." The naming contrast IS the joke, and folk names encode warnings ("HIGHBEAM!" means move).
- **Renames:**
  - Gallowdeer → **Highbeam Deer** (System: "Odocoileus virginianus (standard)")
  - Thornback Boar → **Bulldozer** (System: "Sus scrofa (standard)")
  - Hushwolf → **Hushpuppy** (System: "Canis familiaris (standard)")
- **Convention:** folk names are descriptive, wry, warning-encoded. Survivors cope by naming scary things funny — "the hushpuppies got Joren" is darkly funny and instantly communicative.

## 2026-10-03 — Slice 1 built: "Seven Days" playable

- **Built:** full playable vertical slice — onboarding (cold open → home → scholar → 5 items) → nested day loop (4 day-parts, move + 1 action each) → 7×7 fog-of-war region → forage/eat/drink/rest/treat-water → calorie clock with telegraphed spiral → Bulldozer combat encounter (telegraphs, STUDY/BRACE/STRIKE/HARRY/FLEE) → Codex journal → win (7 days) / lose screens.
- **Tuning from sim runs:** forage 5-11 units/action; ACTIVE_DAY 2200; starvation curve softened (2 + deficit/150). Random play survives worn (hp 7-25); smart play (affinity tiles) surpluses. Combat: winnable in 3 rounds, costs ~60% hp if played bluntly.
- **Delivery:** web artifact build (the-scattering-slice-1-playtest) for phone playtest.

## 2026-10-03 — Living world: monsters wander, behaviors read

- **Decision:** Monsters are visible map entities with observable behavior patterns, not encounter triggers. They move on their own schedule; the player reads them through the Codex. The world must feel alive in all ways.
- **Why:** Steve: "Monsters must wander, display behavior patterns etc." A trigger tile is a jump scare; a visible Bulldozer pacing its thicket is a *decision* (go around, wait, engage).
- **Behavior patterns (Codex-gated readability):**
  - **Bulldozer — patrol:** loops its territory; charges anything in its path. Unknown: "something big moving." Observed: marginalia "pacing — territorial. Don't be in the way."
  - **Hushpuppy — hunt:** pack moves toward the player when close, spreads then converges. Observed: "spreading out — they're hunting."
  - **Highbeam — graze/aim:** drifts between meadows; freezes when approached. Unknown: "a deer." Observed: "it's not frozen. It's aiming. Move."
  - **Mirelurker (later) — ambush:** stationary at water; strikes when you drink.
- **Alive in all ways (the set):** wandering monsters + ambient wildlife signs (tracks/scat as tile flavor; rabbits flee) + moving weather (affects visibility/forage) + day-part map changes + plant regrowth + village sims + (Book 3+) roaming scholars.
- **Slice 1:** Bulldozer wanders from day 3 (visible glyph, patrol behavior, encounter on contact). Ambient signs + regrowth in the iteration after playtest.

## 2026-10-03 — Pack weight + finite ruin pantries

- **Decision:** 15 kg pack capacity. Forage/scavenge blocked when full ("eat something, or leave it"). Ruins contain 3-5 cans (300-500 kcal, no spoilage) — finite, deplete permanently.
- **Why:** Steve: pack weight mechanic; ruins as a real strategy (canned goods). The finite pantry *is* the thesis in miniature: the houses feed you until they don't, and then you have to actually learn the land. Early game has an easy calorie source; it runs out.
- **Biomes:** map tiles reflect their biome (SE woodlands = woods, correctly). Non-woods biomes arrive with new regions (Book 2+); the region-node system is built for exactly this.

## 2026-10-03 — Haven comes alive (village v1)

- **Decision:** The village is now a place, not a lobby. Mara gives a 5-line quest on first arrival (stakes: pantry won't last the month; role: scholar; job: 7 days, learn what's edible, bring back food, write it down). Each villager has rotating talk dialogue (tips + character, not just flavor). Village actions: fill water at the well, sit by the fire. Return deposits pack kcal into the pantry and triggers villager reactions (Aki's "bring me something green" pays off).
- **Why:** Steve: "Haven isn't alive yet. Nothing to do there. Nothing to talk to. No real intro into the narrative." The quest is the narrative intro the cold open was missing — it answers *why seven days*.
- **Also:** localStorage autosave (save on action/day-part/depart, Continue on title, wipe on game over). Phones kill background tabs; a 7-day run must survive a refresh. Builder's "sessionSave P0" was a misread — there was no save at all. Now there is.
- **Also:** fixed stale "Good boots +1 travel AP" text (never implemented) in villagers.json + items.json.

## 2026-10-03 — Nodes redesign: tiles are the nodes, travel consumes time

- **Decision:** Steve corrected the model: the 7x7 tiles ARE the nodes. Tapping a highlighted tile travels there immediately — travel consumes the day-part and advances time automatically. Each node has a detail screen (title, description, what's here, contextual actions). All actions (forage/scavenge/treat/rest/wait) happen on the node and auto-advance. Removed: travel mode toggle, END DAY PART button, AP checks.
- **Why:** "Having to select travel and then end the day is pretty annoying." "Everything else you should just be able to do on each node. We want less friction, just watching stocks/supplies and making decisions." The map is now a pure decision screen: status + map + log. Every tap is a decision; every decision moves time.
- **Wait:** explicit WAIT action (passes the part, no cost/benefit) replaces END PART. Rest is the recovery choice (costs kcal).
- **Sim check:** 4/6 wins with a no-combat bot; deaths on days 5-6, close. Difficulty feels right for slice 1.

## 2026-10-03 — Node identity: epithets + close-up map

- **Decision:** Each node gets a generated epithet from its dominant type + neighbors (creekside grove vs drowned grove vs deep grove; old pasture; creekmouth marsh; the shallows). The node screen now leads with the epithet and renders a 5x5 close-up map (player centered, larger tiles) — the detailed view players actually follow. The 7x7 stays as the click-through navigation geography.
- **Why:** Steve: nodes should represent the dominant biome/land structure as a consistent clear geography; the close-up is what most people follow. Pacing confirmed: 1/4 day per node = 28 node-visits per 7-day expedition.

## 2026-10-03 — Geographic bounty: the land's character drives forage

- **Decision:** Each epithet maps to a bounty (favored plant 3x weight + richness 0.7-1.4x yield + a "why"). Real ecology: edge thickets → blackberries (edge effect), creekside → cattails (riparian), old pasture → dandelions (disturbed ground), deep grove → hickory (mast), forest floor → poor (deep shade). The why is taught via Codex on first forage. Foraging a tile labels it: tile.knownPlant renders as a tiny Codex label on the close-up map, and the node "Here:" line reads "dandelion country".
- **Why:** Steve: geographic persistence should intelligently assign forage chances; the Codex should label the detailed map. The player who learns WHERE to look is learning real foraging. Stats: favored plant 14/40 picks; rich ground yields ~2x poor.

## 2026-10-03 — Open expeditions: no fixed length

- **Decision:** Removed the 7-day timer entirely. Expeditions are player-length: depart, roam, walk home when you choose (costs the rest of the day). The village eats 800 kcal/day while you're out (the pantry clock is the arc). 3 hungry days → Haven scatters (lose). Win: 8+ Codex entries + 5000+ pantry on return — "Haven will make it." Earned, not timed.
- **Why:** Steve: "An expedition shouldn't be forced to a fixed length, not even the first one." The fixed timer contradicted our own rule (gates earned, never timed).
- **Economy:** richness now has a type-based floor (grove 1.5, wetland 1.4...) + water bonus, so every map grows food; skill finds the best food. Top richness 1.8, favored plant 4x weight. Skilled play nets ~+200/day over the 3000 need — tight but positive. Real scarcity.
- **Save:** unified on the engine's versioned S.state.save (state.run holds map/dayPart/location/log). Fixed a real collision: two writers, one key, incompatible formats. Also removed the engine's duplicate village-eating (6600/day!) — game.js villageEats is the single owner.
- **Quest/title:** Mara's quest no longer says "seven days"; title says "open expeditions."

## 2026-10-03 — One screen: Haven is a tile, no view switching

- **Decision:** Deleted villageScreen/gameMain/nodeScreen/renderCloseup/combatIntro/combatScreen. One expeditionScreen: status bars + 7x7 map + context panel + log. The panel adapts (Haven / node / ruin / encounter / combat). Haven is the center tile (type 'haven', glyph 🏠) — walking onto it deposits pack→pantry, triggers villager reactions + win check. No location split; walkHome() deleted (walking home = tapping 🏠). depart() no longer switches location. Travel and actions re-render the same screen.
- **Why:** Steve: "I kinda hate changing views. Ideally we find a system that works for everything in game. One mobile screen."

## 2026-10-03 — Action costs: time and/or calories, never AP

- **Decision:** Every cost is time, time+calories, or calories. Buttons show explicit costs ("1 part · 120 kcal"). Node stock (3/2/1 by richness) sets how many times a place can be worked — the biome sets pulls and results. Natural goods regrow daily; cans are finite.
- **Why:** Steve: "Everything should either cost time, time and calories, or just calories. Number of times and results of you doing them depends on the biome."

## 2026-10-03 — Cast expansion: people, not survival archetypes

- **Decision:** 6 villagers. Added Ruth Delgado (67, retired bus driver — dry, unimpressed, funny), Theo Park (19, dropout speedrunner — sees patterns, treats it like a game), Priya Nair (34, tax accountant — ledgers the pantry, secretly funny). Talk lines are people-first (grief, humor, boredom, quirks); survival advice is at most half. Mara's quest rewritten: opens with a scene ("you were out a full day, and we carried you, so you owe us"), names the System's failure ("it forgot dinner"), gives the scholar job, ends with character.
- **Why:** Steve: survivors only talked about survival; dialog actions weak; story start weak. A village of only useful people isn't a village.

## 2026-10-03 — Energy deferred: future mana system, not a dead bar

- **Decision:** Energy bar removed from HUD; Rest button removed from the node panel (without energy it was a worse Wait). The scholar.energy field stays for save compat but is dormant. FUTURE DESIGN (not slice 1): eating past full (2400 kcal cap) charges ENERGY as mana; energy fuels skill uses — combat maneuvers (powerful blow, dodge), later abilities. Introduce alongside the skill/combat systems, not before.
- **Why:** Steve: "I would rather we introduce it like a mana system later. Eating more than what gets you to full adds to your energy bar for skill uses."

## 2026-10-03 — Visual progression: the HUD fills out as you progress (CONFIRMED)

- **Decision:** Start simple; graphics and interface get better as the player progresses. The interface is a reward — it mirrors the scholar learning the land (and the System learning the scholar). Stages are independently shippable; each must earn its keep in playtesting before the next.
- **The ladder:**
  - **Stage 0 — Terminal (now):** emoji map, text panels, basic bars. Readable, finishable.
  - **Stage 1 — Annotated:** the Codex starts writing on the world. Plant labels on learned tiles, epithet headers, bounty hints. (Partially live.)
  - **Stage 2 — Pixel entities:** the ● becomes a scholar sprite, 🐗 a pixel boar, 🏠 a pixel camp. Bounded sprites only — no tileset yet.
  - **Stage 3 — Arrival vignettes:** small pixel scenes on first visit per biome/epithet. A deep grove *looks* like a deep grove once.
  - **Stage 4 — Full tileset:** only if earned. The game must prove it needs it.
- **Triggers (v1, provisional):** stage advances on Codex depth + days survived, never on timers. HUD elements unlock with systems: the energy/mana bar appears when the mana system arrives, combat maneuvers appear with the first technique, Haven panel gains depth as relationships grow.
- **Why:** Steve: "Start simple, but it would be cool if as you progress, the game graphics and interface keep getting better and better." Solo-dev finishable stays the constraint — each stage is a contained art task, never a rewrite. And the real leverage: staging lets us put more into the later stages *if* the game catches people's interest — art investment follows validated interest, not the other way around.

## 2026-10-03 — Simulation pass: the economy was broken, now it's honest

- **Built:** `scripts/simulate.js` — bots play the full loop (random vs greedy), plus a per-tile EV table from 2000 real forage samples. Answers: win rate, days, pantry trajectory, and the actual math of every tile.
- **Found (bugs):**
  - Yields were 5x too high (grove ~3000 kcal/forage). A random button-masher won 50% on day one. Cut units 10-18 → 5-8. Grove now ~1140/forage, stock 3.
  - `villageLost` never reset in `newGame` — lose once, every later run broken without refresh. Fixed (also reset wanderer/fight/pendingEncounter).
  - (My own surgery briefly gutted `endDay`; restored from commit. The sim caught it.)
- **Found (design):** Map gen was pure RNG — a bad roll could doom you with no good land near home. Fixed thematically: Haven was built where the land is good; a grove is now guaranteed adjacent to home (the breadbasket). Twelve people didn't settle on barren ground.
- **The math (EV per forage):** grove 1144 (stock 3) > wetland 789 (2) > creek 758 (2) > thicket 532 (2) > meadow 515 (2) > forest floor 483 (1) > trail 361 (2). Daily need: 3000 (2200 scholar + 800 village). A good day (3x grove + travel) nets ~+1200 to pantry. Win (8 codex + 5000 pantry) takes ~5-7 good days.
- **Results:** greedy bot 23% win / 14 days; random 0%. The bot doesn't learn; a human with Codex memory should beat it. Balance is "earned, not given" — in range for slice 1.
- **Visible stakes:** Haven panel now shows the win condition (Codex 8+, Pantry 5000+) with live progress. You can't want what you can't see.
- **Why:** Steve asked for the math behind the cadences and whether this analysis was needed. It was — the sim found the game had no economic tension at all, just UI confusion masquerading as difficulty.

## 2026-10-03 — Discovery, not given: the close-up, the journal, earned knowledge

- **Decision:** (1) The 5x5 close-up is back — inline on the one screen, larger tiles, tappable. The 7x7 shrinks to a travel minimap. Tap a close-up tile → what you know about that ground (or "you haven't worked this ground"). (2) The Codex starts as a **Journal** (your handwriting). At 4 plant entries, the System designates it a CODEX — diegetic upgrade with a log ceremony. (3) Knowledge is earned: removed the guaranteed first favored plant and the free arrival Codex lessons. First forage is pure RNG; whatever you find labels the tile ("hickory country" = YOU found hickory here). After discovery, the known plant gets 3x weight — you know where to look. The land's "why" is told after you find something, not before.
- **Why:** Steve: the close-up made it feel like a world (node panel alone was abstract); the game gave away information instead of letting it be discovered; symbols should be tappable for codex info and eventually direct effort. The journal→codex beat makes the interface itself a progression reward.

## 2026-10-03 — the village has a metabolism
- Roster: 6 mains (story, dialogue) + 6 drawn from 36 background survivors (variety). Different faces each run.
- Every villager has kcalPerDay (consumption) and providesPerDay (a few contribute: Jesse's snares, Aki's lines, etc.).
- villageEats sums the rates. Pantry display shows the math: "12 mouths eat 883/day · Jesse, Aki bring in 250."
- Net drain 612-722/day (was flat 800). Variation between runs is a feature.
- Quest giver: random main who isn't the player. Mara isn't the only intro.
- Roster UI: mains with Talk buttons, background as compact "Name (occupation)" — info, not management.

## 2026-10-03 — the village lives, the System integrates
- villageLives(): each day, 1-2 background villagers do something. Bring food (+100-300 kcal),
  get wounded, discover plants (adds to YOUR codex!), or barter. They're at risk too.
- integration (0-100): starts at 5. Grows with discovery (+3), quests (+5), barter (+2).
  Thresholds: 20 (system messages), 40 (quest protocol), 60 (codex/inventory overlay), 80 (deep integration).
  The UI will shift from journal → video game overlay as the System integrates into your neural pathways.
- Passive quests: village asks (human) before integration 40. One at a time, simple:
  bring X, visit Y. Rewards: pantry, knowledge (+integration), or barter.
  System quests come later (not yet implemented).
- HUD shows SYSTEM integration %. Active quest shows in expedition screen.

## 2026-10-03 — find the part you need to play
- Knowledge feeds: each codex entry +80 kcal/day village-wide. The scholar's contribution isn't always calories.
- Big days: 5% chance someone brings 1500-2500 (two days of food from one person).
- Death: 3 wounds = gone. Starvation (2+ days empty pantry) kills the weakest. Roster shrinks.
- Depletion: every 7 days, maxStock -1 (min 1). The easy food dries up.
- Role hint: Haven panel shows what the village needs from you right now.
  Not always the forager — sometimes the scholar.

## 2026-10-03 — Act 0: 12 strangers (Steve's correction)
Steve: "Don't just make stuff up. Adding little numbers like plant identities equals
more calories is way too simplistic. Your wound system is bad."

REMOVED:
- Magic +80/entry knowledge bonus. Knowledge works when TAUGHT via dialogue,
  then villagers forage better (+15% per plant they learn). Real mechanism.
- 3-strike wound system. Now health bars (0-100).
- Instant starvation death. Now -5 health/day (slow), +2/day recovery.
- Role hint ("Haven tells you"). Information via observation and dialogue.

ACT 0 (the opening — not glossed over):
- 12 strangers from all over the world. Everyone spawns in a different building.
- Trust starts 5-20. It's earned: talk (+3), give food (+12), teach (+?).
- Villagers share food based on trust: <30: 20%, <60: 50%, <80: 80%, 80+: 100%.
- The question "do we work together?" is the first arc. Not assumed.
- Intros rewritten: guarded, practical, wondering if this is a good idea.

STILL NEEDED (not yet built):
- Food linked to detail grid: tile stock = sum of plant cells' yield. Plants produce on cycles.
- Teach system: dialogue option to teach a plant you know.
- Trust affects more than food (quests, knowledge sharing, leaving?).
- The "shouldn't go the same way" — personalities that drive different Act 0 outcomes.

## 2026-10-03 — Architecture: macro=travel, micro=interaction (Steve's direction)
Steve: "The top detailed map should be about interactions while the tile one is about
travel between places. How will monsters actually be encountered?"

NEW ARCHITECTURE:
- Macro map (7x7): STRATEGIC TRAVEL. Tap a tile -> travel there (costs day-part + kcal by distance).
- Detail grid (9x9): YOU ARE IN THE WORLD. You have a position (mx, my).
  Tap adjacent cells to STEP (10 kcal/step). Tap plants to forage. Tap monsters to engage.
- Monsters: exist IN the detail grid (mx, my). Move turn-based when you move.
  If they reach your cell: combat. No more "whole node" encounters.
- Forage: (TODO) should target the specific plant cell you're on/adjacent to, not the tile.

BUGS FIXED:
- Intros no longer mention "the System" (Act 0: they don't know it yet).
- Detail grid taps no longer hop macro tiles (was confusing). Now: step within the tile.
- Player position shown as 🧍 in the detail grid.

STILL NEEDED:
- Forage targeting specific cells (not tile-level).
- Monster spawning in detail grid (currently macro-level wanderer).
- Forage/examine/fight actions on specific cells.

## 2026-10-03 — Blocking terrain (Steve: "essential world building")
- BLOCKS movement: wall, water (deep), bigtree, tree, tent, fire.
- DIFFICULT: rubble (20 kcal/step vs 10).
- RIVERS: creek tiles get a continuous meandering river (2 wide), not random puddles.
  One bridge (🌉) is the only crossing. Water blocks; bridge is passable.
- The world is physical. You go around, or you cross at the bridge.
