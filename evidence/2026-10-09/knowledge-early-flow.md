# Knowledge acquisition repair — evidence (2026-10-09)

Steve: "knowledge might be a bit too hard to acquire right now, or villagers aren't inclined to improve their knowledge."

## Diagnosis (verified in code)

- `identifyPlant` callers: taught, gratitude (15% event), fireside (after returns), traded,
  sample (30% event), background/book/shared. Examine built observations but never identified.
- `testCautiously` (food.js) already self-identifies — full afternoon protocol, full risk.
  It did not benefit from prior examination: 3 looks gave you nothing at test time.
- Villager objectives: FORAGE, WATER, TRAPS, VISIT, HAVEN_CHORE, EXPLORE — no LEARN drive.
  Villagers learned via two RNG rolls (25% assigned-forage, 35% ambient) on RANDOM plants.
- Result: survival clock (~day 13 starvation on 0-kcal "unknown shoots") beat the knowledge clock.

## Changes (all in worktree know-early)

1. **Curious villagers examine as they work** (game.js, assigned-forage resolution).
   `personality.curiosity` ∈ {curious, hungry-to-learn} → each forage resolution adds a
   field note on an undiscovered plant (`v.fieldNotes[vid][pid]`); 3 looks = they know it
   by sight → `villagerLearnsPlant(vid, pid, 'fieldwork')` + sharedKnowledge + rumor.
   Presence-gated beats, throttled narration. Inclination, not free knowledge.
2. **Curiosity ask at fireside** (game.js, firesideTeaching). A curious non-knower prompts
   the lesson with a real beat ("but what IS it?"). Never silent.
3. **Early fireside reliability** (game.js, firesideTeaching). Days 1–5: the fire teaches
   every time something is learnable (RNG gate bypassed; empty-teach still returns).
4. **Brisk word of mouth** (game.js, spreadPlantKnowledge). Was 1 roll @ 0.35/part/rumor
   (~8 days for full village). Now 2 rolls @ 0.5/part/rumor (~2.5–3 days). Still "days,
   not instants" per canon; distrusted-teacher filter preserved.
5. **Fieldwork-assisted cautious testing** (food.js, testCautiously). 3+ examinations
   (obs.count ≥ 3, via examine OR forage-handling) unlock the short protocol: the
   inspect/skin/lips work is done, one careful taste + wait settles it. ~8 ticks vs a
   full afternoon, risk ×0.6, source 'fieldwork'. Teaching stays instant and free —
   the earned gradient is: taught (instant) > fieldwork (cheap exam + taste) > cold test
   (full afternoon + full risk).

Deviation from the brief: the brief's recipe said "3 examines + tasting + a night to
think." The examinations already span time (separate 8-tick actions across parts);
forcing a sleep would make the *prepared* path slower than the *unprepared* full
protocol — backwards. The time cost is the fieldwork itself.

Constraints honored: no silent actions (every ID path narrates); wrong-teaching untouched
(fireside wrong branch preserved verbatim); pre-codex journal framing untouched;
curiosity varies by trait (only curious/hungry-to-learn examine; others use old paths).

## Proof

`scripts/test-knowledge-early-flow.js` — 9 assertions, fixed seeds:

| seed | before (5e2d602f) | after |
|------|-------------------|-------|
| 20261009 | 4/9 | 9/9 |
| 777 | 4/9 | 9/9 |
| 424242 | 4/9 | 9/9 |

Before failures: 0 field-note looks, 'tested' not 'fieldwork', 3/12 firesides, 10→5 learners left.
After: all green.

Regressions green: firesidewrong, haul-teaching, knowledge-progression, exploit-sweep,
honesty-sweep, teach-dialogue-path, gating, wrongwipe, break-knowledge4-teach-wrong,
break-knowledge4-study-codex, softlock. Ontology 52/52.
Pre-existing (fails on 5e2d602f too, unrelated): test-knowledge-grant-engine-20261007.js
`_noteAnimalDepth is not a function`.

## Sweep

60 seeds × 30d competent, before→after:

| metric | before | after |
|---|---|---|
| codex@day5 (med) | 4 | 5 |
| codex@day10 (med) | 11 | 10 |
| median game-days | 13 | 13 |
| P(survive ≥20d) | 1/60 | 0/60 |

Village-side probe (10 days, no player policy, 3 seeds): taughtTotal 98 → 118 (+20%),
fieldNotes 0 → 2–4 active, sharedKnowledge 8.3 → 10.

Honest read: the four mechanisms work (proof 9/9 vs 4/9) and village knowledge rises,
but the competent-policy survival curve doesn't move. Two reasons, both verified:
(1) the policy's conversation push already saturates early player knowledge (4–5 by
day 5), so marginal knowledge paths wash out in sims; (2) the binding constraint is
food INCOME, not knowledge — a forage trip yields ~270 kcal against ~24k/day village
need (BALANCING.md targets 400–800/haul for the player margin; the village's 92%
self-provision isn't materializing). The early starvation needs the food-economy
balance pass, not more knowledge paths. The knowledge repair stands on its own for
the human game: more beats, more agency, villagers visibly inclined.
