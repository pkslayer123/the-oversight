# Telegraph visual proof — 2026-10-06

Worker: visual-proof (telegraph screenshots). 15 captures in `evidence/2026-10-06/tg-*.png`
(+ `.svg` sources, `telegraph-proof-20261006.json` summary). Capture helper:
`scripts/render-telegraph-proof.js` (new file, scripts-only, no game edits).

## Method
`scripts/fast-screenshot.js` could NOT be used: headless Chromium hangs on EVERY
page load in this VM (verified 2026-10-06 — even `data:` URLs hang; a sibling
worker independently verified the same today and switched to cairosvg). So
captures drive REAL combat in node (debug scenario → re-seat monster adjacent →
`Game.startCombat` → pass player turns until `m.telegraph` declares → hold
windup), then render the grid through the REAL `tbAllTelegraphCells()` bucket
routing extracted verbatim from `src/js/app.js`, rasterized with cairosvg at
390px wide. Bucket colors mirror renderDetail: red beamLane, orange burstRadius,
yellow chargeLane, amber encircle, purple lockOn, red targetTile, gold sbHeat,
dark diveShadow, white whiteHot. Player = white P circle, monster = red initial
circle (cairosvg has no emoji font — tofu boxes otherwise).

## Readability verdicts (390px, player eye)

- **Highbeam Deer (benchmark)** — PASS. Unknown: dread cue only, no lane
  ("It freezes. Like a deer in headlights…"). Known: red beam lane (4 cells,
  diagonal sweep) + coaching "You know this one: Ocular Discharge fires a
  sweeping beam that tracks you while it burns — outrun it". The unknown→known
  contrast is exactly the design.
- **Middle Manager (wave-2C)** — PASS (known). Encircle zone renders as an
  amber ring with a ➤ direction arrow; cue "let's take this OFFLINE" is
  distinct; coaching "sidestep FARTHER than feels necessary" is earned-only.
- **Inspiration (wave-2C)** — PASS (known). 5×5 orange burst radius (25 cells),
  crisp. Cue "It's brightening. Two beats from glow to boom" + "When it
  flares, RUN." Capture was at turnsLeft=2 (orange); white-hot biHot bucket
  triggers at turnsLeft≤1 per app.js — not captured, but the code path is
  one line and sibling-verified in data tests.
- **Nostalgia (wave-2C)** — PASS (known). 5-cell red beam lane; player
  visibly standing IN the lane — the "MOVE" cue lands.
- **Glasswing dive shadow** — PASS. Dark shadow cell + ▼ marker renders at the
  dive tile, distinct from every bucket visual. Renders UNGATED (visible in the
  unknown capture too) — matches the app.js comment ("diegetic-ungated …
  so the dive keeps its own visual voice"). New 15811df visuals confirmed
  rendering.
- **Sunbasker heat halo** — PASS. Gold charge fill on the monster cell + dashed
  gold 8-cell ring; molten-gold sbLock on the tracked target. Renders ungated.
  New 15811df visuals confirmed rendering.
- **Wave-1 comparisons** — bulldozer charge lane (sibling's known capture shows
  the yellow hatched 5-cell lane; my unknown capture correctly shows nothing),
  flashbulb burst (25 cells, known-only). Consistent with the gating rule.

## Knowledge gating — verified working as designed
Every bucket-based telegraph (beam lane, charge/encircle, burst, lock-on) is
EMPTY until the pattern is learned (`tbAllTelegraphCells`: "If pattern not
learned, skip entirely"; deer lane additionally hidden while not firing).
Unknown captures show cue text + dread only. This is Steve's "if you don't
know, it doesn't show" law, applied consistently. NOT a bug.

## Broken / missing — none found in telegraph rendering
Everything assigned rendered. Two capture-time notes (script-side, not game
bugs): (1) sunbasker fight can fizzle if it wanders into tree-shade — the
scenario has a SUN GUARANTEE but my driver needed the sibling's shadeless-grid
override for determinism; (2) lockpick declares NO grid telegraph ever — it
steals and bolts on round 0–1 (thematic thief); its tell is the opening
narration. Captured at fight start, labeled as such.

## Observations for Steve / later runs (not bugs, judgment calls)
1. **Middle Manager unknown cue vs. empty grid.** The unknown cue says "It is
   staring down a line on the ground. You should not be on that line." — but
   no line is visible until the pattern is learned. The fiction says "the
   telegraph IS the circling", so this may be intentional dread, but a player
   reading "you should not be on that line" with no visible line may feel
   cheated rather than scared. Steve-call whether the cue should avoid
   promising a visible line pre-learning.
2. **Dive shadow under the player's own tile.** When the shadow lands on the
   player's tile (tile=4,4 = player pos in the capture), the white player
   marker is drawn over the dark shadow cell, partially obscuring it. Check
   app.js layering — the shadow may need to ring/highlight the player marker
   itself when they coincide.
3. **Sunbasker sbLock on the player** is subtle — the molten-gold target
   highlight sits under the white P marker and is easy to miss next to the
   loud heat halo. The halo carries the read; probably fine.
4. **Inspiration biHot (white-hot final tick)** was not captured (my run broke
   at turnsLeft=2). Worth one capture at turnsLeft=1 to confirm the white-hot
   flip reads as "about to break loose".
