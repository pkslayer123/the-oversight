# Playtest — explorer loop, interior examine (2026-10-04)

**Character**: explorer archetype (scheduled loop, rotation 1). This run: long expedition (20 hops, biome sampling) + Haven interior/building-room examine depth.

## What I did
- Ran a 20-hop expedition sim outward from Haven: travel honesty held (30 kcal/tile, 32 ticks/node, blockages offered solutions), fog pushes felt good, arrival texts landed.
- Sampled 5 fresh maps for biome distribution: forest_floor dominates (12–21/49 tiles), creek walks are big (9–18), trail_edge is 0–1 tiles, meadow blobs can be a single tile. In the 20-hop run: creek×7, forest_floor×6, thicket×3, grove×2, ruin×1, wetland×1 — meadow and trail_edge never reached. Biome variety exists on the map; the explorer's path just didn't find it.
- Verified the curiosity-whisper loop end to end: whisper adjacent to a hidden 'strange' feature → examine reveals the spiral-grass story → whisper goes quiet. Clean.
- Found and fixed: **Haven interior cells (hall/bunk/lodge) and pre-Burn building rooms (gym/class/office/…) said "It declines to be interesting." when examined closely.** The previous explorer run's fix for this was lost (uncommitted working tree, sibling never landed it).

## What I found (fixed this run)

1. **Interior examine dead.** `examineCell` had no branch for `hall`/`bunk`/`lodge` or building-room cells — all fell through to "It declines to be interesting." Fix: `carexplore.js` now has depth 1/2 content for all three Haven interior cells (hall: mug shelf, whose-is-whose, blanket-fold character reading, tally-marked table; bunk: the sleeping row, small personal things carried to sleep; lodge: the worn threshold step) plus 12 pre-Burn room types with old-world texture feeding `old_world_cache`. Interior cells feed `track_human`. Costs stay honest (2 ticks, time-only). The tap panel (`app.js`) now offers 🔍 Examine closely on these cells — previously the examine wasn't even reachable from the UI (deep-examine lives in the panel by design, matching dirt/grass/bush/plant/rubble).
2. **Remote village meal on expedition.** Each new day out in the wilderness draws a full village meal from the communal pantry remotely (`villageMeal()` in `newDay`: "the village eats whether you're there or not — YOU EAT TOO"). Intentional design, documented in code — but as an explorer feel note: long expeditions never face food pressure because home feeds you daily. Flagging, not changing (Steve call).

## Feel verdict
The examine verb is now complete across the whole world: wilderness cells had stories, and now home does too. The hall read — mugs, blanket folds, tally marks — is the right texture for "people, not classes": you learn the village by its objects. Nothing here was chores; the whisper→examine→story→codex loop is the game's best discovery beat.

## Open tensions (Steve calls, not worker fixes)
- trail_edge is nearly vestigial on generated maps (0–1 tiles survive the trail-line pass; most get overwritten). If trails should matter as exploration arteries, the generator needs a second pass. If they're set dressing, fine.
- Meadow blobs can be 1 tile — a "meadow" you step through in one hop reads as a clearing, not a biome.

## Tests
- `scripts/test-explorer-interior.js` (20 tests, new): hall/bunk/lodge depth 1≠2, no "declines", time-only cost, door regression, pre-Burn room content, panel reachability in app.js.
- Regressions green: test-explorer (19), test-carexplore (33), test-continuous-travel (21).
- test-perceive: 24 pass, 2 pre-existing fails ("known monster named", "animal hint") — verified identical on a clean HEAD worktree; stale expectations vs the monster-naming design (village-agreed names, not true names), not this run's change.

## Process notes (for the loop)
- A `git stash push` with an untracked-file pathspec failed and the follow-up `git stash pop` grabbed the sibling's stash@{0} instead. No damage (stash kept, working tree verified clean afterward), but: never use stash in the shared tree — use `git worktree` for clean-tree comparisons.
- The main session swept this run's app.js panel edit into their d-pad commit (6a38b0e) mid-run. Shared-tree reality: commit promptly, verify with `git show` before claiming what's yours.
