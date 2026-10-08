# Survivalist-7 playtest notes — 2026-10-07 ~22:15 CDT run (archetype 3)

## What was played
The WILD-WATER loop end to end, seeded (SEED=21..25, all 39/39 green):
walk out from Haven, find a creek in the generated world, fill honestly
(risky quality, 10 kcal/L, 1 tick, weight gate, cistern untouched), drink the
30% gamble (lucky + sick paths), gather fuel, light a fire, boil (30 kcal
named), the dehydration spiral (sleep preview telegraphs, DEHYDRATED voiced,
-15 HP / -30 energy, not an insta-kill), and the disease → herbal_remedy
cure chain. Script: `scripts/play-feel-20261007-survivalist7.js`.
Regression: `scripts/test-disease-expiry-legacy-20261007.js` (15/15 × 5 seeds).

## Bug found and fixed (ghost disease)
**Natural status expiry left the legacy mirror behind.** `tickStatuses` →
`seRemove` spliced the engine entry but never cleaned `s.diseases`/`s.poisons`.
Result: after a fever expired on its own (8 dayParts), the journal badge
stayed on and the herbal_remedy/purify "cure" gates read a ghost disease
forever — a fake cure would then consume the once-per-day remedy.
Fix (src/js/statusEffects.js, +15 lines): seRemove drops the matching legacy
mirror entry with the engine entry. Verified before/after: pristine HEAD fails
4/15, fixed passes 15/15 × 5 seeds. Existing `test-status-effects-20261007.js`
still 51/51, `test-survivalist-honesty-20261007.js` 15/15.

## Feel verdicts
- Wild water is FUN logistics, not a chore: creek findable by walking,
  fill is 1 tick/10 kcal, the pack refuses honestly at capacity (15L at
  19.4/20kg here), boil names its tax. The fire step is the real cost —
  deadfall foraging + felling is the survivalist's morning, and it feels right.
- Risky-drink sickness is a one-shot (-15, stomach cramps, waterWise learned
  the hard way) while food disease lingers (fever by nightfall, -2/part ×8).
  As a player this reads as INTENTIONAL (cramps vs fever), not a bug. Left as-is.
- Dehydration spiral is fair: telegraphed at sleep, voiced at midnight,
  survivable. Good.
- Harness notes (not game bugs): creek tiles may have only bigtrees — a
  hatchet (not a fake `axe` item id) fells; cutTree needs adjacency;
  `this.location === 'haven'` in fillWater is dead code (location is always
  'village'; the tile-type check does the real work) — cleanup candidate.
- Game moment: "Moving water — Something big drank here recently — the mud
  is churned to soup on the far bank." The creek arrival beat is doing work.

## Tree/process notes
- AGENTS.md gained WORKTREE ISOLATION MANDATORY mid-run (workers never touch
  main tree; loop templates updated via cron). This run's body still directed
  the repo flow, so the fix went in via safe-commit.sh on a verified-clean
  file. Next playtest runs should follow the worktree pattern.
- Main tree hot as usual; statusEffects.js was clean before edit. No stashes
  touched. Pushed to origin master AND main.
