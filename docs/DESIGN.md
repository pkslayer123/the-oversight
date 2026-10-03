# DESIGN — decided mechanics (2026-10-03)

Living record. New decisions go in DECISIONS.md with dates; this file holds the current consolidated state.

## Core loop

**Village → Expedition → Return (or death) → Village → next scholar.**

- **Village (hub):** menus between runs — check pantry, assign tasks, consult the Codex-holder, choose next scholar, resupply. Living sim on expedition clock.
- **Expedition:** region node map (branching paths, StS-readable). Each region is a small fog-of-war tile grid explored day by day. Travel legs between regions cost days + food.
- **Day = 1 turn.** 4 action points (proposed). Actions: Forage / Hunt / Craft / Explore / Rest / Treat Water (1 AP each, some 2). Evening: eat, manage spoilage, resolve events.

## Survival systems

- **Stats:** Health, Hunger (kcal), Hydration, Energy, Morale. Hunger/water are the primary pressures.
- **Calorie economy:** everything costs energy — travel, combat, crafting, System abilities. Needs never decrease with level; powerful abilities cost serious kcal.
- **Foraging:** target known plants (Codex, safe, lower yield) vs unknown (risk/reward). Yield depends on biome + season + skill + tile. Misidentification is a fictional minigame — the game never presents real dangerous plants as safe.
- **Water:** separate axis — find, carry (capacity-limited), purify (fire/time/tablets). Not "hunger but blue."
- **Spoilage & seasons:** food rots; winter is the big bad. Preservation (smoking, drying, fermentation, root cellars) is the real tech tree.
- **Death spiral:** missed meals → fewer AP → failed checks → harder recovery. Attritional, honest, telegraphed before it arrives.

## Combat

- Turn-based, StS-style telegraphed intents, ~3 actions/round. Secondary to survival.
- **High stakes, high reward, usually avoidable.** Sneak/flee/go around are always options; fighting is a decision.
- **Monster Codex** parallels the plant Codex: first encounter, intents obscured (*"the creature shifts — you can't read it"*); survive/observe/kill to fill it in. Knowledge compounds.
- **Monsters are food.** Big kills = top-tier calories + crafting materials. Combat is hunting with consequences. Injuries persist (mauled leg = −AP for days).
- XP weighting: discoveries + survival days > kills, so combat never becomes the "real" progression.

## People & abilities

- No classes. Each villager: backstory + personality + 5 personal items + favorite clothes, System-assessed kit of 2–4 abilities drawn from pools (Fieldcraft, Combat, Craft, Care, System/weird), weighted by situation/personality.
- **Ability cap: 6.** New earns past the cap force a choice: release one. System-granted abilities are releasable too — no sacred cows.
- **Earning abilities:** Trials (survive events → System offers a pick of 3), Discovery (ability combos surface hidden ones), Mentorship (villagers teach each other over time).
- **Parties:** up to 3 per expedition. More AP, task-splitting — but every member eats (~2,500 kcal/day each). Solo = efficient/fragile; party = capable/hungry.
- **Utility lives:** some scholars' kits make their run a different game (the cook's run: keep everyone fed through the cold snap). Win conditions per life vary.

## The Codex

- Village artifact held by one NPC (the Codex-holder, a character with opinions).
- Entries: plants (real info, conservative), monsters, recipes, terrain. Earned by correct identification + survival.
- Persists across deaths — the roguelite meta-progression. *You*, the player, are genuinely learning.

## The System (litRPG layer)

- Arrives at the **Integration** — proposed: after 7 days of pure pre-System survival (tutorial as before/after contrast).
- Grants: stats, levels, ability assessments, trial offers. Cold alien voice, survival-probability estimates.
- Late game: abilities that look like magic; the game winks. Magic ≡ sufficiently advanced alien tech.

## World & content

- **Biomes (v1):** Southeast woodlands, Pacific Northwest, Southwest desert. Real plant data per biome + season (~15–20 plants each to start, conservative and safe).
- **The Scattering (onboarding):** player states real home region → System places village in a *different* biome deliberately. Home biome = thick starting Codex; placed biome = thin. Knowledge vs. displacement is the opening tension.
- **Village cast:** displaced people (sushi chef from Seattle, rancher from Texas...), each with 5 personal items (mechanical effects) + sentimental items (morale mechanics).
- **Seasons/year:** full year = campaign arc. Winter is the boss.
- **Endgame:** survive the year + uncover why the aliens forgot survival basics → credits → endless mode (deeper alien zones, harsher biomes).

## Platform & tech

- Mobile-first PWA: installable, offline-capable, fullscreen. No app store for v1.
- Deploy: Vercel, preview URL per push for phone testing.
- Aesthetic: modern terminal — monospace, restrained color, ASCII flourishes. Zero art pipeline.
- Static site, no backend for v1. State in localStorage. Turn-based structure kept async-friendly for potential future multiplayer.
- App Store later: wrap with Capacitor, no rewrite.
