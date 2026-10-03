# DESIGN — consolidated mechanics (2026-10-03)

Living record. New decisions go in DECISIONS.md with dates; this file holds the current consolidated state.

## Core loop

**Village → Departure ritual → Expedition → Return ritual (or death) → Village → next scholar.**

- **Day structure (nested):** 4 day-parts (DAWN / MIDDAY / DUSK / NIGHT), 1 AP each for major actions (forage, hunt, craft, travel, treat water, rest). Nodes afford free *minor* actions (drink at water, tend fire at camp — maintenance, never production). Travel between adjacent nodes costs 1 AP. Day-part character: dawn/dusk favor hunting, midday heat drains, night is camp-only (or risky).
- **Evening:** eat ("eat to full," game picks sensibly), spoilage tick, water check.
- **Metabolism:** the master clock (`src/js/engine/calories.js`). Missed meals → the spiral, telegraphed before it arrives.

## Survival systems

- **Stats:** Health, Hunger (kcal), Hydration, Energy, Morale. Hunger/water are the primary pressures.
- **Foraging:** target known plants (Codex, safe, lower yield) vs unknown (risk/reward). Yield = biome + season + skill + tile, through the modifier pipeline. Misidentification is a fictional minigame — real dangerous plants are never presented as safe.
- **Water:** separate axis — find, carry (capacity-limited), purify. Not "hunger but blue."
- **Spoilage & preservation:** food rots; preservation (smoking, drying, fermentation) is the real tech tree. One-tap crafting — the decision is the AP and materials, never the process.
- **Starter content:** 10 real SE-woodland plants, conservative and safe (`src/data/plants.json`).

## Combat (spec pending — concept agreed)

- Turn-based, telegraphed intents, usually avoidable, high stakes/high reward. Injuries persist. Monsters are food — big kills = top-tier calories. Monster Codex parallels plant Codex (unknown → observed → slain). XP: discoveries + survival days > kills.

## People, abilities, items

- **No classes.** Villagers: backstory + personality + 5 personal items + favorite clothes, System-assessed kit from pools (Fieldcraft, Combat, Craft, Care, System), weighted by situation.
- **Ability cap: 6.** Earned via trials (pick 1 of 3), discovery, mentorship. Releasing one is required past the cap — no sacred cows.
- **The Five Items** (full spec: `docs/ITEMS.md`): onboarding pick — *"The sky is changing. You can carry five things."* Classes (tool/clothing/sentimental) determine enhancement pools. **Relic bonding:** passive bond through use (+1/day meaningful use; sentimental bonds by keeping + story moments); thresholds at 10/25/50 → System offers optimization, pick 1 of 3. Loss happens at story moments, never durability bars.
- **Loot taxonomy:** bonded relics (grown) / System awards (attuned) / fan packages (attuned, wacky, never dinner) / scavenged-taken (base effects only; re-bondable from 0 with awkward System provenance note). **Bond is non-transferable.**
- **Broken builds:** ability + relic combos may break a single dimension; never the stomach.

## Villages (character, not base)

- **Independent sims:** `state.villages = {id: villageState}` — multi-village in the data model from day one. Each ticks 1 expedition day/day, present or not. Stats: population, stores, water, cohesion, morale, defense, leadership.
- **Internal threats:** the hoarder, the demagogue, resentment of absence, despair, succession, exile. The village has agency — it can close the gate.
- **Standing ladder (per village):** stranger → guest → member → trusted → leader. Mechanics gate on standing. Earned through contributions and crises, visibly, in words. Two ways to lead: beloved or feared.
- **Departure ritual** (scales with standing): deputy (leanings visible) + 2-3 standing orders + party/supplies + expected return date. The game asks; the player never remembers. **Reliability contract:** legible sim, no punishment without a traceable choice. "Whatever" is an explicit choice.
- **Return ritual:** bond-weighted digest (critical/notable/ambient tiers) + deputy's report + orders vs reality. The System doubles as messenger for critical news.
- **News, not omniscience:** away villages report via traders — delayed, possibly wrong. Full truth only when present.
- **Delegation:** absent leaders appoint a second with their own leanings.
- **The Codex travels with you;** villages hold degraded copies.

## Party system

- You + 2 max. Companions are people: they eat (~2200 kcal/day — every member is a calorie decision), opine, refuse, bond, die permanently. You lead, not micromanage: abilities join your pipeline, voices surface at decisions. Recruitment is relational. The System names your group without asking; fans have favorites.

## The System & broadcast layer

- **Voice:** earnest alien, cheerful game-show host, technically-right-spiritually-wrong. Knows your resting heart rate; can't understand why you're crying.
- **Overlay UI:** literal second visual layer over the grounded terminal — slides over post-Integration, never replaces, works around the hunger meter. Occasional untranslated-glyph glitches.
- **Favor (currency):** earned via entertainment (dramatic wins, close calls, novel solutions). **Galactic shop:** fan care packages — wacky, never dinner.
- **Audience votes** (event rooms), **spotlight elites** (opt-in broadcast fights), **sponsor conditions** (packages with strings), **rerun episodes** (seeded dailies), **unauthorized companion** (the pet the System keeps trying to optimize), **syndication** (ascension-framed endless mode).
- **Temperament profile:** prosocial vs dominance markers, visible only through the System's commentary. Trials customize to the student. No good/evil meter.

## Content architecture

- **Everything is data** (`src/data/`, schemas in `src/data/schemas.json`). **Validator gate** (`scripts/validate-data.js`) fails on bad fields, ranges, dup ids, dangling refs. **Modifier pipeline** (`src/js/engine/modifiers.js`): abilities declare `{target, op, value}` — new abilities never touch engine code. Safety rules encoded: plants require `confidence: high`; shop items can't carry calories. Full guide: `docs/CONTENT.md`, `docs/ARCHITECTURE.md`.

## Platform & tech

- Mobile-first PWA, offline-capable, one-thumb, 3-5 minute days. Terminal aesthetic + System overlay. Vercel deploys; Capacitor later for app stores. localStorage saves, versioned. Async-friendly turn structure.
