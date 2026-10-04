# Cognitive diversity — playtest report (2026-10-04)

## What was built
Six intelligence types (analytical, practical, social, observant, creative,
steady) assigned to every NPC: primary from occupation, secondary from
temperament + curiosity. New `theorizeWith` mechanic ("What do you think is
actually going on here?"), intelligence-shaped teaching, overheard NPC-NPC
discussions, intelligence-voiced conversation openers.

## Test results
- New suite `playtests/test_cognitive_diversity.js`: 44/44 (3 runs, 0 failures)
- Regressions: conversations 28/28, journal 24/24, social actions 34/34,
  action-clock 18/18, day-night 42/42, person-tap 19/19, wave2 115/115
- Sim (greedy, n=30): 7% win rate vs 8% baseline — no regression

## Bugs found and fixed during testing
1. `convoOpening` referenced `cg.intelOpeners` but `cg` there is
   `characterGen.convo` — openers silently never entered the pool. Fixed to
   `(this.data.characterGen || {}).intelOpeners`.
2. `overheardDiscussion` cooldown gated on the random roll before incrementing
   the counter — effective fire rate ~0.17%. Fixed to increment-first.
3. Secondary intelligence was shadowed when primary matched an earlier branch
   (e.g. practical/analytical only got the analytical effect). Refactored to
   primary-full + secondary-half application so both minds matter.
4. Background survivors (static JSON) had no intelligence — added per-run
   `bgIntel` in village state, following the existing bgGoals/bgLangs pattern.

## Design notes
- Theorize topics are gated: 'system' only post-arrival (pre-System NPCs
  wouldn't say "the System"). Pre-System: monsters + situation.
- Analytical theorizing grants +2 encounter progress per session; 3 sessions
  (6 progress, threshold 4) teach the skill via 'theorized'.
- Theory lines are no-repeat per villager per topic; exhausted topics fall back
  to "what's YOUR read?" — joint discovery goes both ways.
- Overheard fragments fire roughly every ~11 day-batches, day only, player
  awake — rare enough to feel like life, not broadcast.

## Open / not verified on device
- Conversation theorize UI and voiced lines need a look on the real PWA
  (subagent has no live browser).
- Old saves: villagers generated before this change get steady/practical
  fallback via npcIntel — no migration needed, no crash.
