# Explorer run 2026-10-07 (~08:30 CDT) — the curiosity-feature loop

Archetype: explorer (rotation idx 1). Angle NOT covered by the earlier
20261007 corner-walk run: the whisper→examine→reveal loop, arrival-text
variety over a long wander, traveler-rumor payoff. Play script:
`scripts/play-feel-20261007-explorer-curiosity.js` — seeded (mulberry32),
HEAD-frozen engine (/tmp/headjs), full production script list. Green on 5
seeds (20261007, 42, 777, 31337, 99).

## What I played
- ACT 1: long wander — snake path over ~27 nodes, 58–118 node hops,
  collecting every arrival line (96–211 lines per run).
- ACT 2: curiosity-feature density census over all 81 nodes.
- ACT 3: examined up to 24 features across 10 nodes — whisper → reveal,
  checking for silence, template leaks, knowledge feeding.
- ACT 4: repeat-examine depth on trees (surface → deep text).
- ACT 5: examined features go quiet (featKey marked, whisper loop closes).
- ACT 6: plain dirt/grass examines speak; examineCell return shape sane.
- ACT 7: traveler-rumor payoff — 60 days of village ticks, then walk to the
  rumored village.

## Verified good (HEAD)
- The curiosity loop closes: whisper invites → examine reveals →
  examined[featKey] marked → whisper goes quiet. No silent examines
  (24/24 voiced), no template leaks, repeat examines go deeper (3/3).
- Feature examines feed knowledge encounters (track_read/track_human/
  old_world_cache/system_theology/read_people) — the knowledge→power
  loop is reachable purely by looking closely at the world.
- Arrival pools healthy: 6 texts per tile type (forest_floor pool measured
  28 unique lines in the wild — node identity is per-node, rolls once).
  Density 6.3–6.8 features/tile, near the ~5 design target.
- Hollow-tree caches still pay out occasionally (material find in 3/5 seeds).
- Node travel costing 0 ticks is by design (Steve 2026-10-05: the boundary
  hop is free, grid steps cost) — not a bug, my first measurement was
  harness artifact.

## Feel verdicts (recorded, not fixed — see below)
1. **Haven arrival is a single fixed line.** ARRIVAL.haven has exactly 1 text
   ("Canvas, cookfire, twelve people who are glad you're back…") while every
   other tile type has 6. Coming home is the most-repeated arrival in the
   game AND the emotional payoff beat of the explorer loop (return with a
   haul → teaching moment). Hearing the identical sentence every homecoming
   is wallpaper on the beat that matters most. Fix: 5 more haven texts in
   the ARRIVAL pool (src/js/game.js ~line 161 on HEAD). NOT fixed this run:
   a sibling has staged + uncommitted hunks in src/js/game.js — committing
   my hunk there would clobber their staged work. One-line content job for
   the next flesh-out/content run.
2. **Feature reveals are single-text except tracks.** oldcamp, strange,
   remnant, banktracks, hollow each have exactly one reveal paragraph on
   HEAD; only tracks has 3 hash-rotated variants. An explorer who examines
   5 oldcamps reads the identical fire-pit paragraph 5 times. Fix: 3x
   hash-rotated variant pools per feature (the tracks pattern). NOT fixed
   this run: a sibling is mid-rework of this exact system (uncommitted
   featureText with skill-level gating in src/js/carexplore.js) — their
   version keeps single base texts, so the gap persists there too. Flagged
   for their pass or the next content run.

## Traveler rumors
- 60 village-tick days fired village rumors; the rumor text names a real
  village with real coordinates, and walking there is reachable. (Payoff
  arrival verified reachable on the seeds that fired rumors.)

## Regression signal (sibling's in-flight work — flagged, not fixed)
- `scripts/test-explorer-worldedge-20261006.js` and
  `scripts/test-examine-recognition-20261006.js` FAIL against the current
  worktree but PASS on pristine HEAD (verified via /tmp/headjs extract).
  Bisected to src/js/game.js: worktree + HEAD's game.js passes.
- Cause: a sibling has a major in-flight game.js rewrite in the worktree
  (+1687/-160 lines vs their staged copy; staged copy itself is ~1,500
  lines slimmer than HEAD). Failing assertions: "in-bounds travel still
  moves" (travelTo(1,3) from (0,3) no longer moves), "arrival said something"
  (/Travel 1 tile/ no longer matches), and the recognition-beat assertion.
- Not touched: it's their active work. They'll need to update the tests or
  fix the regression on their pass. My play script runs against the
  HEAD-frozen engine (/tmp/headjs) so it's immune to this churn.

## Not tested
- followTracks / lingerCell: exist only as uncommitted sibling work in the
  worktree (not on HEAD) — left alone, not committed, not tested.

## No src changes this run — no version bump
Tooling-only commit (play script + these notes). Bumping the build tag with
zero player-facing changes would just churn Steve's update banner, so no
bump this run.
