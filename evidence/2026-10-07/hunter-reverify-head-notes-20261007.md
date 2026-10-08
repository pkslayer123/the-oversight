# Hunter path re-verify at HEAD cc37d20 — evidence notes (2026-10-07, ~21:25 CDT)

- **HEAD:** `cc37d20` ("Run note 2048…")
- **Proof script:** `scripts/test-hunter-reverify-head-20261007.js` (new file; ported 1:1, all 44 check sites, from `scripts/test-hunter-reverify-20261007.js` at HEAD)
- **Method:** pristine extract `git archive cc37d20 | tar -x -C /tmp/hunterhead` — never evals the dirty worktree. drama.js excluded (top-level `document` crash at current HEAD, confirmed). `global.window = global` stub for eval, deleted before play. Mulberry32 seeded; run at SEED=7 and SEED=42.
- **Result: 52/52 GREEN on both seeds** (44 check sites, loop-expanded to 52 assertions). Exit 0.
- Tree NOT touched beyond the two new files; no commits, no pushes (per assignment).

## Per-finding verdicts

| Finding (parent proof) | Verdict at cc37d20 | Evidence |
|---|---|---|
| A. 3 synergies discoverable (clean_kill, blood_tracker, apex_predator) | **STILL FIXED** | discovery_method present; clean_kill + blood_tracker unlock after 3 combined uses (attempts=3, unlocked=true) |
| B. apex_predator satisfiable; requires_any gates activation | **STILL FIXED** | unlocks via [clean_kill(discovered) + animal_ken]; active while legs held; NOT permanently active after legs stripped |
| C. 13 actions execute via useAbility | **STILL FIXED** | all 7 explore actions execute + narrate; stalk drops aware 0.8→≤0.2; seeded A/B over real preyReaction: unarmed bolts 65/200, stalked 0/200; clean_shot arms cleanShotReady; lay_wait arms flag; dress_game net +3860, names "Field Dressing ×"; set_ambush outside combat refuses honestly |
| D. Combat actions (take_aim 2.5x, dead_aim_shot 3x+ignoreArmor, set_ambush 2x, read_stance first-use, ambush passive round-1) | **STILL FIXED** | all arm/consume correctly; aimed strike 45+ (2.5x), dead-aim 30+ (3x); ambush honesty rewrite (e3608b6) did NOT break the "AMBUSH: they never saw it coming" strike line |
| D2. Dead Aim vs armor (hushwolf, armor 2) | **STILL FIXED** | "hide might as well not be there" fires; ignoreArmorNext consumed |
| E. modifier consumption (was PARTIAL: 3 consumed / 7 dead) | **IMPROVED → PARTIAL (4 consumed / 6 dead)** | `hunt.first_shot_damage` now consumed by `src/js/game.js:19183` (clean_shot path) — wired by cf3049d, which landed AFTER the parent proof. Still dead: `animal.behavior_read`, `hunt.intimidate`, `hunt.track_wounded`, `hunt.wounded_find`, `hunt.wounded_time`, `stealth.move_silent`. (Note: stealth.move_silent *resolves* 0.3 via the modifier engine — the stalk promise rides the aware-drop + the A/B-proven pipeline, not this hook.) |
| F. meat bonus naming (was PARTIAL: dress_game names it, encKillLine silent — deferred) | **FIXED** | Deferred fix LANDED in cf3049d: kill line now reads "About 3900 kcal of meat on the bone. (Field Dressing ×2.54 — your skill kept more of the carcass.)" |
| G. doAction old route | **STILL FIXED** | warns "unknown kind" for all 13 — useAbility remains the live route |
| H. night hunt play-feel | **STILL FIXED** (chain intact) + 2 new feel warts (below) | stalk → lay in wait → hidden encounter (boar, aware 0) → synergy coaching fires at 2/3 ("Something is waiting in that combination") |

## New feel findings (pre-existing, NOT regressions — surfaced by playing)

1. **"The the thing with headlights…"** — `game.js:18593` composes `` `The ${m.name}` `` for the gallowdeer's antler-thrash, but an unnamed monster's `m.name` IS the unknown descriptor, which carries its own article (`monsters.json:271` "the thing with headlights for eyes, standing too still") → "The the thing with headlights for eyes, standing too still thrashes its antlers at you". A `monsterNoun(mid)` helper exists (game.js:12606) that strips the article exactly for this — the thrash line doesn't use it. Line dates to 2026-10-04 (5150fb4), predates the re-verify window.
2. **Opener lowercase** — "You don't know what that was. the thing with headlights for eyes, standing too still." The 8b21c94 punctuation fix appended the period but the descriptor starts lowercase. Capitalize first letter of unkP.

## Play-feel (night hunt, stalk → lay in wait → hidden encounter → gallowdeer)

The loop reads like a hunt now: stalking makes you "uninteresting, just another shadow," laying in wait gives you the blind spot and the downwind side, and the encounter arrives hidden (aware 0) with a real telegraph — "It paws the ground before it charges." The gallowdeer fight has genuine tension: while you spend turns on read_stance and take_aim, its antler-thrash is chewing 11–14 HP off you per round and the beam telegraph keeps burning where you were standing, so the setup has a real cost and the 45-damage TAKE AIM payoff (with the synergy-coaching whisper at 2/3 attempts) lands as earned, not free. The warts are prose, not systems: "The the thing with headlights" and the lowercase opener undercut an otherwise strong sequence. Verdict: the hunter path is a real game loop at HEAD — no regressions from the commits since the parent proof; two improvements (first_shot wired, kill-line naming) and two prose fixes flagged.

## Commits in window checked (1d0f696..cc37d20, hunter-relevant)
- `cf3049d` Hunter wiring: 2 modifiers wired + 5 honestly removed, encKillLine names bonus (improvements caught above)
- `8b21c94` Hunter playtest honesty (track state-honest, read_sign knowledge-gated) — no regressions; cold-ground track line still clears the narration threshold
- `e3608b6` ambush honesty (noDodgeNext removed) — 2x mult + strike text intact
- `afd50c9` chase narration + region common-knowledge — no effect on preyReaction A/B
- `3454157` explorer haven fix, `d5db19d` content expansion, `9709eba` audio round 5 — no hunter-path regressions observed
