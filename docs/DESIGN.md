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
- **Survival safety nets (2026-10-10, `src/js/safetynets.js`):** earned, played, finite — never flat relief. (1) **System aid quests** (days 7–21): the System offers struggling villages played quests (fetch / treat the sick / learn) with real costs and real failure; 1-in-4 help is bizarrely wrong in method (canon: alien, out of touch) while the reward stays real. Max 3/run, trigger-gated (hunger/death/sickness), never pre-day-7. (2) **Crisis relief:** sickness cascades, raid/storm aftermath, and hunger winters open a villager-proposed relief path — triage tents (800 kcal, sick mend sooner), rationing votes (half rations 3d, morale cost), emergency hunts (real meat, real injury risk) — each once per crisis, villager-driven always. (3) **Neighbor-village aid flows:** struggling villages can REQUEST aid (food/medicine/hands) through links — real runner, real decision, real deliveries from finite neighbor pantries; rich neighbors OFFER; thin neighbors BEG. Trust/reputation both ways, ingratitude ledgered and gossiped. The request move is knowledge-gated (learned via gossip/travelers/offers). Anti-farm: triggers + cooldowns + finite pantries + bounded quest count (proof: `scripts/test-survival-nets.js`).

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

## Scale transitions (Steve 2026-10-05; recorded 2026-10-09)

The game grows through four scales — **village → regional → national → global** — and the player must FEEL each one. A transition is **a moment, not a threshold**: a played beat the player lives through, never a number quietly ticking over in the background.

**One system, not two.** Scale progression is a single progressively-manifesting knowledge system, not separate government and alien-interface systems. The System overlay grows from HUD and abilities into coordination and logistics as human cooperation scales — and it is tied to the codex. The chain:

**knowledge → food → power → coordination → species agency**

The Codex/knowledge substrate begins as journal, HUD, and abilities, and grows into increasingly sophisticated cooperation, coordination, governance, and logistics as people learn enough to organize at larger scales. Human institutions and the alien System interface are two faces of the same progression.

**You always walk around as a person.** Combat never leaves. The verbs never change: move, talk, forage, fight, share. No fed village, no power base, no 4X map replacing the local grid — larger coordination raises the number of people and the stakes, but the village-scale game stays relevant all the way up. (A larger tactical grid is expected eventually — longer ranges, bigger AoEs, larger monsters, more people in a fight — but mobile legibility and the one-screen moment-to-moment rule remain the constraint.)

**Transitions are NOT speedrunnable.** Early sketches based on quick thresholds ("three villages plus surplus") were rejected as too gameable. Each scale-up must be earned through:

- deep knowledge and durable relationships (these take seasons, not days),
- rival leaders and village autonomy (other villages have their own agendas),
- coalition logistics (feeding a coalition is exponentially harder than feeding a village),
- audience and System attention (viewership gates System upgrades),
- escalating monsters and contests,
- connected Havens.

**Inter-village relations** (the regional fabric): representatives can link villages with primary/subordinate relations, and the hierarchy is retained. You may NOT end the game at the top — joining another kingdom as subordinate is a legitimate earned outcome. The fun is the climb: trust, proving worth, chafing, bidding for primacy — all earned. Deaths hit hard: succession crises, renegotiation. Every link is a relationship with moving trust. Presence-free membership and remote applications make regional expansion natural.

**Implemented:** the village→regional moment is the **Regional Dawn** — the first Haven link triggers a played transition ("One fire was a village. Two fires is a NETWORK"), the panel becomes ⛓️ NETWORK, and the player makes a real first-gesture choice (gift 2,000 pantry kcal, send a representative away 3 days, or cold ink).

[OPEN] The played moments for regional→national and national→global are not yet designed — each needs its own beat at least as strong as the Regional Dawn. [OPEN] The exact viewership gates for System upgrades at each scale are not yet specified. [OPEN] Monster-wave ties to scale (w4=regional, w5=national) are Steve's leaning, not a locked decision.

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
