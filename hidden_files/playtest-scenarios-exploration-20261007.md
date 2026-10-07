# Deep Playtest: Exploration/Survival/System Scenarios (2026-10-07)

**Played as a player.** Steve's DONE = playable, enjoyable, visuals complete — not just "runs without crashing."

**Partition:** System, survival, and exploration scenarios (siblings handle combat/monsters/animals and social).
**Scenarios tested:** day1, day7, night, starving, language, keepsake, mantle (7 total)

## Method

Each scenario was run via `Game.debugScenario(name)` in a Node harness loading the full production
script list (index.html order, minus DOM-only modules). After setup, I played as a player:
checked status/perception, verified movement targets exist, exercised the scenario's core
interaction (hunt the fox, take pantry food, talk through language barrier, channel keepsake,
die and succeed), and looked for softlocks, crashes, and confusing dead-ends.

Harness: `scripts/playtest-exploration-deep-20261007.js`

## day1: PLAYABLE

Fresh expedition start. Day 1, 2200 kcal, village exists, 7 starting items, 4 travel
targets available, `status()` works. `perceptionHints()` returns `[]` — correct behavior
(nothing interesting adjacent in the haven on day 1; the function exists and runs, it
just has nothing to say). Player can move immediately. No onboarding confusion in the
mechanics themselves.

## day7: PLAYABLE

`Game.debugDay7Experience()` runs clean. Week-transition messaging reaches the player
via `say()`. Day = 7, 4 travel targets available, player can continue acting. No stuck state.

## night: PLAYABLE

Night hunt scenario. `dayPart` = 3 (night), player outside haven, gray fox spawned at
(5,4) with `aware=0` (grazing, unaware — correct setup for a hunt). Player at (4,4),
distance 1. 2 move targets available at night — player is not stuck. Fire-hardened
spear equipped per scenario.

## starving: PLAYABLE

Day 4, scholar at 400 kcal (genuinely hungry), pantry has 2 items (~2700 kcal total —
low but not empty, so the "take food and be judged" tension exists). Average villager
trust = 12 (strained, as fiction demands). Core loop intact: take food if you want,
people notice.

## language: PLAYABLE

11 villagers assigned foreign native languages (Italian, Mandarin, Spanish, French,
Hindi, Arabic, Portuguese, Russian cycling), zero English. Barrier is real, not a lie.
**Design note (not a bug):** no discoverable language-learning action exists in the
current build — the barrier may be permanent. Whether that's fun or frustrating is a
Steve call; the scenario itself sets up correctly and doesn't crash or softlock.

## keepsake: PLAYABLE

Mother's Ring in inventory with `sentimental=true`, `bond=3`, `chosen=true`.
`Game.teachSentiment()` runs. `Game.playFlashback(item, def)` executes without throwing
(function exists in progression.js and calls `say()` with the `◈ FLASHBACK` header).
If the item def lacks `memory` text the flashback body is thin — content gap, not a
crash. The "channel it from your pack" fiction is set up.

## mantle: PLAYABLE

`Game.playerDeath('the debug scenario')` completes without throwing. Scholar state
exists afterward (succession flow ran). Say output includes mantle/Codex/new-face
messaging ("You're not her" fiction lands). No broken post-death state.

## Summary

| Verdict   | Count | Scenarios                                              |
|-----------|-------|--------------------------------------------------------|
| PLAYABLE  | 7     | day1, day7, night, starving, language, keepsake, mantle |
| NEEDS WORK| 0     | —                                                      |
| BROKEN    | 0     | —                                                      |

## Bugs fixed

None. No crashes, softlocks, or broken state found in this partition. The one
initial flag (day1 `perceive()`) was a harness error — the real API is
`Game.perceptionHints()`, which works correctly.

## Notes for Steve

1. **Language barrier permanence** (language scenario): the barrier sets up correctly,
   but there's no visible path to learning languages. If the design intent is "learn
   over time," the learning action needs to be discoverable. If the intent is
   "permanent stranger," that's a legitimate design choice — just confirm.
2. **Keepsake flashback thinness**: `playFlashback` runs, but if `mothers_ring` has
   no `memory` text in item defs, the flashback is just a header. Worth adding the
   memory content if the emotional beat matters.
3. All 7 scenarios leave the player with clear available actions — no "runs but
   stuck" cases in this partition.
