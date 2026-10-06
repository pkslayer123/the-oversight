# Batch C — system debug scenarios (2026-10-05)

Headless Node sweep of the 7 system scenarios. Each scenario ran in its own
child `node` process with a 60s wall-clock guard; none timed out (all finished
in 0.8–2.0s). Load order: engine files → game.js → all systems → debug-scenarios.js
→ build.js, then `await Game.init()`, then `Game.debugScenario(name)`.

**Nothing was fixed. Nothing was committed. This is inventory only.**

Raw per-scenario JSON: `results/batchC-<name>.json` in this directory.
Probe scripts: `one-scenario-C.js`, `run-batch-C.js`, `probe-pantry.js`,
`probe-uprising.js`, `probe-day7.js`, `probe-language.js`.

## Results

| scenario | loads? | error (if any) | premise holds? | notes |
|---|---|---|---|---|
| day7 | yes | — | **YES — fully working** | `debugDay7Experience()` seeds 6 days of life: day=7, trust 12 entries, 6/11 names learned, journal learning fires, gossip seeded, pantry thinned to ~8.7k kcal, week1 activity stats, `_day7Armed=true`. Probed the actual transition: one `tickAction(1)` later, `checkSystemArrival()` fires — `systemArrived=true`, the full arrival-beat sequence plays (journal shimmer, party system, calibration fauna), 3 ability choices granted. This is a real feature, not junk. |
| uprising | yes | — | **YES — fully working** | `startVillageUprising()` builds a real `tbfight`: player + 4 hostile villagers (lowest-trust first, capped at 4, `uprising:true` flag on each). Trust was set to 3–8 so correctly *no* defenders ("Nobody steps between. You earned this alone."). Probed the fight: it advances without throwing; a passive player is beaten down in ~4 rounds → "You go down." → death → **mantle transfer fires live** (Kelsey Healy picks up the journal, codex turns the page). Death pipeline verified working in this path. |
| day1 | yes | — | **YES, with one real bug** | Fresh expedition: day 1, 12-person roster, map, scholar at full stats. **BUG (verified):** `v.pantryKcal` field = 0 while `v.pantry` holds 47,250 kcal of real items (beans/rice/soup/meat/peanuts). The field is marked "kept for compat, computed from pantry" and is only re-derived at end-of-day sync (`villageEats`) and on stock. Anything reading the field on day 1 before first sync sees an empty pantry: `pantryLow` check (game.js:7546), the `havenSecured` journal gate (game.js:4102, needs ≥8000), the "look lean — hungry" note (game.js:4406, fires at ≤0), the status report (game.js:3940). Day-1 flavor/logic reads wrong until the first night. |
| language | yes | — | **YES — fully working** | 11/11 villagers get non-English native tongues (italian/mandarin/spanish/…), zero English anywhere, `knownNames` cleared. Probed the actual feature: `startConvo()` on a villager → `commLevel` = `{level:'none', lang:'italian'}` → barrier stated in-fiction ("You share no language at all"), name learned via gesture ("It sounds like a name: Rosa"), `nvOpen` path fires ("No shared words at all — just eyes, hands, and patience"). Real foreign-language gameplay, not a stub. |
| night | yes | — | **YES (setup)** | `dayPart=3` (night), gray fox placed adjacent (mx 5, my 4), fire-hardened spear equipped, player outside Haven on a wild node. Premise is a *setup* — the hunt itself wasn't exercised here. Nothing broken in the setup. |
| liars | yes | — | **YES (setup)** | 5 villagers get forced lies via `npcLies()` + injected covers: `{occupation: {told:'Brain surgeon', truth:'lawyer', motive:'shame'}, origin: {told:'Chicago', truth:'Minneapolis, USA', motive:'hiding'}}`. Structure matches what the truth system expects. Detection/catching gameplay was NOT exercised — scenario plants the lies, doesn't test the catching. |
| starving | yes | — | **YES** | Day 4, scholar at kcal 400 / energy 40 / hydration 50, pantry = 6× canned soup + 3× dried meat (2,700 kcal real — ~0.11 days for 12 people, genuinely dire), trust strained at 8–15. Same `pantryKcal`-field staleness as day1 (field=0 vs 2,700 computed) — cosmetically consistent here since the pantry is nearly empty anyway. |

## Readout

- **Surprise: none of this is junk.** All 7 scenarios load, run without throwing,
  and their premises hold. Three scenarios (`day7`, `uprising`, `language`) were
  probed *past* their setup into the actual feature, and the features work:
  System arrival cinematic + ability grant, uprising combat + death + mantle
  transfer, language barrier + gesture-naming + nonverbal conversation open.
- **One real bug found: the `pantryKcal` compat field is stale on day 1.**
  `newGame` fills `v.pantry` with ~47k kcal of items but leaves `v.pantryKcal = 0`
  ("kept for compat, computed from pantry"), re-derived only at end-of-day sync
  and on stock. Four day-1 code paths read the field directly and get the wrong
  answer (game.js:7546, :4102, :4406, :3940). Fix direction (not applied): re-derive
  the field once at the end of `newGame`, or make the readers compute from items.
- **One probe artifact, not a bug:** the batch-C probe looked for journal entries
  at `state.journal` and found 0 keys — the journal actually lives at
  `state.codex.people` (`journalPerson()` in journal.js). The day7 log proves
  learning works ("📓 Journal: learned James's name"). My probe path was wrong.
- **Not covered by this batch:** night-hunt gameplay past setup, liar *detection*
  gameplay, and whether the uprising's post-fight village state (trust/morale
  fallout) is coherent. Those need interactive probing, not scenario setup.
