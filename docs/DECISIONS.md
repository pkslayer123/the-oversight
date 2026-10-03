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
