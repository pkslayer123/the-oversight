# Idle-Village Sim — Evidence (2026-10-09)

**Question (Steve):** What happens when the player does nothing but bare minimum? Is the village capable of winning with a competent group? How long do sims like that last?

**Answer:** No. 12/12 seeds lost the village at days 9–11 (median 9.5). The village cannot feed itself without the player. Roster composition is irrelevant — the food economy is structurally broken for idle play.

## Method

- Headless Node harness: full `src/js/*.js` in index.html order (minus DOM-only), `Math.random` seeded via mulberry32 **before** eval.
- Script: `scripts/sim-idle-village-20261009.js` (modes: `mvc` default, `zero`, `leader`).
- **MVC policy:** player eats from pantry to 95% cap when <85% (avoids "wrung-out morning" 25 dmg/night), sleeps at night. When takes/gives net < −2000, one honest forage trip (travel to nearest stocked wild tile via `travelTargets()`, `doAction('forage')`, donate only the new haul, travel back). Contest auto-driver: `contestChoose(0)` + auto-fighter (strike nearest monster, endTurn).
- **Zero control:** eat + sleep only, no trips. **Leader mode:** each dawn `assignTask(id,'forage')` for all free villagers.
- 12 seeds: 20261009, 7, 424242, 99, 1234, 555, 7777, 31337, 20261008, 42, 9001, 314159. Zero-control on 3 seeds (20261009, 7, 424242).
- Perf: ~20–110 ms/day → full year ≈ 7–40 s/seed. 12 seeds ran in ~11 s.

## Results: all seeds

| Seed | Days | End | Deaths (cause) | Pantry in (kcal) — assignment / autonomous / other |
|------|------|-----|----------------|---------------------------------------------------|
| 20261009 | 9 | village-lost | 2 killed | 0 / 7,861 / 1,240 |
| 7 | 9 | village-lost | 2 killed | 0 / 4,925 / 2,579 |
| 424242 | 9 | village-lost | 3 killed | 0 / 2,625 / 4,072 |
| 99 | 11 | village-lost | 4 killed | 0 / 1,770 / 8,068 |
| 1234 | 10 | village-lost | 3 killed | 0 / 4,673 / 3,010 |
| 555 | 10 | village-lost | 4 killed | 0 / 3,556 / 2,342 |
| 7777 | 9 | village-lost | 4 killed | 0 / 9,968 / 3,147 |
| 31337 | 9 | village-lost | 1 ambushed, 3 killed | 0 / 1,574 / 4,156 |
| 20261008 | 9 | village-lost | 3 killed | 0 / 6,181 / 5,358 |
| 42 | 10 | village-lost | 3 killed | 0 / 1,982 / 1,778 |
| 9001 | 9 | village-lost | 2 killed | 0 / 2,634 / 3,143 |
| 314159 | 10 | village-lost | 6 killed | 0 / 5,818 / 1,130 |

**Distribution:** min 9, max 11, median 9.5 days. **Zero variance in outcome** — every seed scatters.

**Zero-controls (20261009, 7, 424242):** 9, 8, 11 days, all village-lost, **0 exiles**, trust ended at 1, 0, 7.

**Leader mode (20261009):** 9 days, village-lost. 16 forage assignments → 6,428 kcal. Autonomous 6,967. Still starved.

## Why it breaks: the food economy

1. **Villagers produce ~60% of need by design.** `providesPerDay` = 60% of `kcalPerDay` (game.js:729). Each villager runs a ~800 kcal/day deficit, drawn from the pantry. 11 villagers × 800 = ~8,800/day structural deficit.
2. **Pantry drains ~6,000 kcal/day** (measured: 43,460 → 12,050 → 0 over 10 days, seed 99). Starts ~47,000. Gone by day 7–9.
3. **Autonomous foraging is 20–50× too small.** `villageLives()` sends 1–2 villagers/day, yielding ~150–900 kcal/day (measured range). The deficit is ~6,000/day.
4. **The knowledge lever exists but can't engage in time.** `knowledgeFactor` = 1 + 0.10 × knownPlants, capped 1.8×. At 8+ known plants, a villager's 1,200 base becomes 2,160 > 2,000 need — self-sufficient. But villagers learn via fireside shares / word of mouth / observation, which requires hauls that aren't happening. In 9 days, `v.taught` barely grows.
5. **The player cannot close the gap via foraging either.** Knowledge-gating: the player starts with **zero** plant knowledge. Foraged "unknown shoots" have `kcalEach: 0`. Donating them credits 0 to `gives`. The MVC forage trip yields items but 0 kcal — the player is as helpless as the villagers without first learning (talk/taste), which is not "minimum."

## Exile control: the freeloader-exile mechanic does not exist

- 3 zero-contribution seeds: **0 warnings, 0 votes, 0 exiles.** Trust fell to 0–7; nothing fired.
- Code: exile flows only through moot/justice (murder/ambush/theft charges). The takes/gives ledger: net < −5,000 → −2 trust per take (floors at 0). `theftConfrontation` only for blatant takes (>min(4,000, pantry/2)).
- **A pure freeloader is never exiled.** The "hover just above the exile line" policy collapses — there is no line. (Design gap, Steve's call.)

## Other metrics (all zero across all seeds)

- **Parties/expeditions:** 0 formed without the player (only leader-mode assignments, which are player-directed).
- **Progression:** 0 abilities gained, 0 gear acquired per villager (sampled every 30d). No builds emerge.
- **Contests:** 0 occurred (they start ~day 14–21; the village dies first). The auto-driver was exercised only via trip monster encounters (4 fights in seed 20261009, all won by the auto-fighter).
- **Monster outcomes:** villagers die to monsters (2–6 'killed'/'ambushed' per seed) but no villager-vs-monster *wins* were recorded without player involvement. Deaths are incidental — the village scatters from hunger before starvation kills anyone (no 'starved' deaths recorded).

## Roster variance analysis

**There is no survival variance to explain** — 12/12 scattered at 9–11 days. But roster composition was recorded per seed to test the "who did you get" hypothesis:

- Seed 20261009 roster: 12 villagers incl. **Lena Ruiz (ER nurse, healer-ish)**, **Amelia Vogt (farmer, food-ish)**, plus fishing guide, community gardeners. Ability weights spread across care/fieldcraft/system. **Died day 9** — same as seeds with no healer and no food-ish villagers.
- The 60%-of-need production is set at character generation (`occ.kcalPerDay × 0.60 ± 100`) and does not vary meaningfully by occupation. Temperament/sharing affect *trust-scaled sharing* of surplus, but there is no surplus — everyone is in deficit.
- **Conclusion:** survival variance is ~0% explained by roster. It's ~100% explained by the structural deficit. A healer and a farmer don't move the needle when the problem is 6,000 kcal/day.

## Bug fixed (clear wiring bug, not a design call)

**`villageLives()` was dead code.** The filter `v.roster.filter(id => !this.data.villagers.find(...))` matched nobody after the unified person system (2026-10-06) hydrated all background seeds into `data.villagers`. The "1–2 villagers forage per day" autonomous system never ran. Fixed in worktree (uncommitted): uses all unassigned roster members (minus player) via `getPerson()`. This is what produces the ~150–900 kcal/day autonomous income measured above. Without the fix it would be 0.

## Sim-driver bugs fixed (harness, not game)

1. `travelTo` requires targets from `travelTargets()` — hardcoded grove coords failed silently.
2. Tbfight handling was inside the `activeContest` loop — a trip monster encounter left `tbfight` stuck forever, freezing the game clock (loop ran 365 iterations, game day stuck at 7).
3. `Game.modIs()` is the Moderator-specific gate, not a general monster check — auto-fighter couldn't find targets. Now uses `x.kind === 'monster'`.
4. `pendingEncounter` modal (wanderer) now faced via `startCombat`.

## Answers to Steve's questions

1. **Can the village win with the player idle?** No. 0/12 survived past day 11. Win requires 365 days.
2. **What fraction of the food economy is villager-driven?** Villagers produce ~60% of their own needs (~1,200 of 2,000 kcal/day each). The pantry covers the rest and empties in ~7 days. Autonomous pantry contributions are ~150–900 kcal/day vs ~6,000/day burned — **~3–15% of the deficit**, nowhere near self-sufficiency.
3. **Do parties/gear/builds/contest-wins happen without the player?** No to all four. Zero parties, zero abilities, zero gear, zero contests (village dies before contest season).
4. **Where does it break down?** Starvation spiral, day 7–9. Not monster attrition (2–6 deaths/seed, incidental), not disease (none recorded). The breakdown is structural: villagers are designed as 60%-producers; the 40% gap is the player's job (contribute, assign, or teach). Nobody forages enough because `villageLives` is capped at 1–2 villagers/day and assignments require the player.
5. **How long do sims last?** 9–11 days, median 9.5. ~11 seconds of compute for 12 seeds.

## Design findings (Steve's call, not fixed)

- **No freeloader-exile mechanic.** If the social design intends freeloaders to be exiled, the wiring doesn't exist.
- **The village is not a competent group without the player.** The 60% production figure + 1–2/day autonomous foraging + slow knowledge diffusion = guaranteed collapse in ~9 days. If the design intent is "the village can survive but not thrive without you," the numbers need ~4–6× more autonomous food or faster knowledge spread.
- **Knowledge is the intended lever** (1.8× at 8 plants → self-sufficiency), but the learning loop (fireside shares from hauls) is too slow to matter in the 9-day starvation window. A competent group that *starts* with shared knowledge might survive — untested, would need a seed with pre-taught villagers.
