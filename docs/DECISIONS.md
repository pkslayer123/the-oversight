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
