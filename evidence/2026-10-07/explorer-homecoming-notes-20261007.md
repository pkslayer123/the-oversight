# Explorer run 2026-10-07 (~21:00 CDT) — the arrival beat + homecoming

Archetype: explorer (rotation idx 1). Angle NOT covered by today's
corner-walk (plants/edge/map-fill), curiosity (whisper→examine→reveal), or
return (out-and-back) runs: the ARRIVAL BEAT itself — does every first-visit
arrival speak, and what does the homecoming feel like.
Play script: `scripts/play-feel-20261007-explorer-arrival.js` — seeded
(mulberry32, SEED env), HEAD-frozen engine (/tmp/explorer-head) with this
run's fixes. Green on 3 seeds (20261007, 42, 777): 25 hops, 25 first-visit
arrivals, 0 silent, home reached every time.

## What I played
- ACT 1: greedy wander toward unvisited nodes (~25 hops), capturing every
  travel message; asserted non-empty flavor paragraph on each first visit,
  no "undefined"/"null" leaks, per-tile-type arrival variety.
- ACT 2: walk back to haven (4,4); capture nodeDetail() — the homecoming card.

## Bugs found and fixed (both committed, live)
1. **Haven nodeDetail().text was undefined (latent, 2 days old).** be3b5f2
   (2026-10-05) migrated ARRIVAL pools from `{title, text}` to
   `{title, texts:[]}` and updated travelTo + the non-haven nodeDetail
   branch, but the haven branch kept reading `arr.text` — which no longer
   exists. Fix (game.js, 1 line via pristine-extract + private index —
   sibling's worktree copy untouched): `text: this.arrivalTextFor(t)`.
   Proof: `scripts/test-haven-nodedetail-text-20261007.js` — ALL GREEN on
   4 seeds (20261007, 42, 777, 31337).
2. **Haven arrival pool had 1 text (recorded verdict from the 08:30
   curiosity run, still true at HEAD).** Fixed in data, not code:
   `src/data/arrivalText.json` haven pool 1→6 texts (append-only splice,
   prefix byte-identical, style-matched). The fix is cross-run variety —
   each world rolls one homecoming line and pins it.
   Proof: `scripts/test-arrivaltext-haven-pool-20261007.js` — ALL GREEN
   (pool count, uniqueness, no template leaks, tile-shape contract).

Commit: 3454157 (private index: exactly 5 files — 3 new scripts,
arrivalText.json +6/-1, game.js +1/-1; sibling's staged/worktree content
never touched). Bump f0d289d `3454157-20261008-021142` via detached
worktree. LIVE VERIFIED: GitHub raw master + main + Vercel all serve the tag.
Revert-watch markers for the next sibling pass: `arrivalTextFor(t), here`
in game.js nodeDetail haven branch; haven pool = 6 texts in arrivalText.json.

## Verified good (this run)
- The arrival beat is healthy: 25/25 first-visit arrivals spoke, zero
  silent, zero undefined. Per-node pinning works as designed — creek showed
  3 unique lines over 7 visits, forest_floor 5 over 9.
- Homecoming speaks: nodeDetail() at haven returns a real pooled line.
- Creek blockages are honest and solvable: census over 3 seeds showed
  creek needsBridge dominating blockages (56/66 on one seed); the blockage
  message names the verbs and both exist (buildBridge 4 wood; swimmer
  ability gates swimming). The pinch is by design, not a dead end.

## Feel verdicts
- The arrival beat earns its keep — lyrical, varied, never silent. The
  per-node pinning reads as place identity, not wallpaper.
- Homecoming still lands as a single line per world (pinned on first
  visit). Cross-run variety is now real; within-run mood-reactive
  homecoming text (return with a haul vs empty-handed) would be the next
  step, but that's a game.js design change for a cool tree.

## Flagged, not fixed (sibling territory)
- `scripts/test-explorer-worldedge-20261006.js` is RNG-flaky (untracked,
  sibling's file — left untouched): ~1 in 6 runs, world gen puts a
  needsBridge creek at (1,3) and the test's "in-bounds travel still moves"
  assumption fails. The GAME is correct (honest blockage message); the
  TEST should seed Math.random and pick a blockage-free travel target.
  Reproduced on pristine HEAD extract too — not caused by this run's fixes.
- Recorded curiosity-run verdict #2 (feature reveals single-text except
  tracks) still open — sibling mid-rework of carexplore.js featureText.
