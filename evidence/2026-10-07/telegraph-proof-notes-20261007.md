# Telegraph visual proof — 2026-10-07 batch (Steve 2026-10-05)

Covers the 14 monsters that had NO telegraph proof as of 2026-10-06.
Method: real combat driven in node (same proven pattern as render-telegraph-wave2new.js),
grid rendered through the REAL `tbAllTelegraphCells()` bucket routing extracted
verbatim from src/js/app.js, rasterized with cairosvg at 390px wide.
Proof assertion: `node scripts/test-telegraph-proof-20261007.js` (all green).

## Proofed — 8 declaring monsters (known + unknown each, 32 files)

| Monster | Attack / pattern | Distinct visual | Known vs unknown |
|---|---|---|---|
| Belltoad | Resonant Croak / burst·resonant | green croak rings (resonantBurst, 25 cells), not generic orange | unknown: cue only, no cells; known: rings + "You know this one" coaching |
| White-Noise Heron | Spearfish Strike / line | white-noise static dashed lane (heronStrike, 4 cells), not the deer's red beam | gated ✓ |
| Hummice | Swarm Hum / burst·swarm | dotted many-bodies (swarmHum, 40 cells) + ◎ throat markers | gated ✓ |
| Voice Mimic Radio | Distress Call / direct | purple lock-on (w2a voice identity) | gated ✓ |
| Mirror Stag | Confrontation / charge | hatched gold charge lane (6 cells, committed lane) | gated ✓ |
| Review Drone | Scored Assessment / beam | projected beam row (6 cells via buckets.mon) | gated ✓ |
| Nightlight Catfish | Lure and Grasp / phase tell | SPECIAL: green shimmer on the catfish tile during `still` via Game.catfishTellCell() | gated ✓ |
| Ducks in a Row | Coordinated Nip / aim lane | SPECIAL: dotted pale-yellow march lane (3 cells) via Game.duckLaneKeys() | gated ✓ |

## No telegraph by design — 3 monsters (6 files)

- **Hushwolf** (rush): never declares over 59 driven rounds. The telegraph IS the silence ("The woods go silent — not quiet. Silent."). Grid rush indicator killed by Steve 2026-10-06.
- **Speedbump Turtle** (ambush): never declares. "No warning. There never is." Fair tells: stillness cue + ROCK phase badge + codex knownCue.
- **Warranty Caller** (rush): never declares. "Dialing: THE RUSH. No telegraph — it just goes."

## Blocked — 3 monsters (no proof possible this run)

**nevermore, nightcourt, statickite** are in COMMITTED monsters.json but a sibling DELETED
them from the dirty worktree `src/data/monsters.json` (uncommitted, 336 lines removed —
do not touch). Proof cannot be rendered against the current worktree. Re-run this
script after their file lands.

## Code gaps found (reported, not fixed — src files are dirty/sibling-owned)

1. **`tbAllTelegraphCells()` is blind to phase-based telegraphs.** The catfish
   (`beamPhase` lure→still→grasp, `Game.catfishTellCell()`) and the ducks
   (`line_up`→march→nip→regroup, `Game.duckLaneKeys()`) never set `m.telegraph`,
   so the generic bucket proof cannot see them. This batch proves them through
   the dedicated surfaces; the renderer flags the blind spot per entry.
2. **Beam cells live in `buckets.mon`, not in a beam bucket** (app.js: "Don't
   double-add beam cells (they have their own renderer)"). The renderer folds
   them back via `monCellKeys`; anyone consuming the bucket JSON needs to know.
3. **Duck aim-lane knowledge gate verified empirically**: unknown → empty lane,
   known → 3 cells. No leak in turn-based combat.
4. **`scripts/render-grid.js` cannot render telegraphs at all** (no bucket
   routing) — the app.js-extraction approach remains the working path for
   telegraph proof.

## Player-feel judgments (read the PNGs as a player)

- Charge lane (mirror stag): reads instantly — hatched gold lane, player standing in it.
- Beam (review drone): reads clearly — orange-red projected row; cue coaches "Step off it."
- Heron static lane: distinct from the deer's beam; cue ("strikes where you were, not where you are") is the star.
- Resonant/swarm bursts: busy but distinct; the swarm's dotted many-bodies fit the fiction.
- Catfish tell: the green-ringed tile on the monster reads; stillness text is the real warning.
- Duck aim lane: pale-yellow dotted lane reads against the formation.
- Voice-mimic lock-on: the purple outline is THIN — readable but the subtlest of the batch; the real UI's w2aStatic ripple (not shown in this static render) presumably carries it. Polish candidate, not a blocker.

## Reproduce

- Render: `node scripts/render-telegraph-20261007.js [only <name>...]`
- Assert: `node scripts/test-telegraph-proof-20261007.js`
- Summary: `evidence/2026-10-07/telegraph-proof-20261007.json`
