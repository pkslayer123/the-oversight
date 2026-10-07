# Telegraph proof — wave-2 monsters missing it (2026-10-07)

Base SHA: `f21d9bfa56aeb1a7914dd2015394103cab613e17`
Engine: pristine HEAD extract (`git archive HEAD | tar -x -C /tmp/w-tgproof`), real combat, `tbAllTelegraphCells()` bucket routing extracted from `src/js/app.js` (same fn `renderDetail` uses). PNG raster via cairosvg. Headless Chromium broken in this VM — not used, per standing note.

## Inventory

Wave-2 roster **at HEAD** (`git show HEAD:src/data/monsters.json`, 13 monsters):

| id | name | proof pair exists |
|---|---|---|
| voice_mimic_radio | Static | ✅ tg-voicemimic (2026-10-07) |
| mirror_stag | Grief Counselor | ✅ tg-mirrorstag (2026-10-07) |
| review_drone | Performance Review | ✅ tg-reviewdrone (2026-10-07) |
| bright_idea | Inspiration | ✅ tg-inspiration-* incl. -bihot (2026-10-06) |
| memory_projector | Nostalgia | ✅ tg-nostalgia-* (2026-10-06) |
| warranty_caller | Extended Warranty | ✅ tg-warrantycaller-nodesign (2026-10-07) |
| understudy | The Understudy | ✅ tg-understudy-* (2026-10-06) |
| landlord | The Landlord | ✅ tg-landlord-* (2026-10-06) |
| heckler | The Heckler | ✅ tg-heckler-* (2026-10-06) |
| paparazzo | The Paparazzo | ✅ tg-paparazzo-* (2026-10-06) |
| union_rep | The Union Rep | ✅ tg-unionrep-* (2026-10-06) |
| moderator | The Moderator | ✅ tg-moderator-* (2026-10-06) |
| statickite | The Static Kite | ❌ **MISSING — rendered this run** |

The task-body roster (Influencer, Motivational Speaker, Customer Service, Terms & Conditions, Middle Manager) does **not** exist in `monsters.json` at HEAD — `docs/MONSTER-WAVES.md` lists them as design concepts. `tg-middlemanager-*` proofs exist (2026-10-06) but target the legacy `delegate_beast` id, which is not in HEAD's monster data. None of that is in scope to change; recorded for the coordinator.

## Rendered this run (6 pairs)

Scenario: `debugScenario('statickite')` — Static Kite three tiles east, filming. Player held at (4,4), kite at (6,4). Driven 80 rounds until the first Broadcast declare. The Broadcast: burst, radius 1 (3×3 scan-zone), windup 2. Design phases: rise → **mark** (declare/windup) → **transmit** (resolve, alt drops to low) → recover (alt back to high).

- `tg-statickite-mark-known.svg/.png` — mark windup declared, `turnsLeft=2`, alt=high. 9 scan-grid cells highlighted (orange burst bucket). Codex PATTERN LEARNED.
- `tg-statickite-mark-unknown.svg/.png` — same moment, first-contact codex. No grid highlight (see knowledge gate below). Cue: "The ground lights up in a grid under you. It's framing the shot."
- `tg-statickite-hot-known.svg/.png` — final windup beat, `turnsLeft=1`, alt=high. Same 9 cells.
- `tg-statickite-hot-unknown.svg/.png` — same moment, unknown codex. No highlight.
- `tg-statickite-dip-known.svg/.png` — the Broadcast fired, telegraph cleared, kite DIPPED to alt=low. No grid telegraph — the dip IS the tell (green monster ring). Melee-vulnerable window (+50% dmg) per knownCue.
- `tg-statickite-dip-unknown.svg/.png` — same dip moment, unknown codex.

Known cue (learned): "Scan-grid on the ground — a 3×3 square of your life. TWO beats. MOVE. You know this one: The Broadcast hits everything close around it. When the ground lights up, you're already framed — MOVE. When it dips, it's yours. The mark is generous — two full beats to leave the square. When it dips to transmit it's at melee height and takes +50%: that's the only window. Sling/bow can touch it while high."

## Telegraph-truth checks (all against HEAD engine behavior)

1. **Windup cells == resolve cells.** Declared cells at `turnsLeft=2` and `turnsLeft=1` are identical sets (3..5 × 3..5, centered on the player at declare time). The grid you see during the two-beat windup is exactly the grid the Broadcast hits. ✅
2. **Bucket routing == declare data.** Known captures: `tbAllTelegraphCells()` burst bucket holds exactly the 9 declared cells (set-equality checked). kind='squares' → burst bucket. ✅
3. **Unknown renders show NO highlight — BY DESIGN.** `tbAllTelegraphCells` (`src/js/app.js`, "TELEGRAPH KNOWLEDGE GATE", Steve 2026-10-06): *"If pattern not learned, skip entirely — no telegraph markers at all… if you don't know the pattern, you don't see the telegraph."* The unknown proofs truthfully show an empty grid + the first-contact cue. This is the codex gate working, not a missing render.
4. **First-contact naming.** The first-ever declare names the attack `the attack` (generic); after it resolves once, subsequent declares show "The Broadcast" with the full tactics coaching even without explicit codex learning (observed-stage auto-learn). Recorded, not flagged: the fiction ("the village agrees on names through talk") supports learn-on-observation.
5. **Dip state truth.** Post-resolve: `m.telegraph` cleared, `m.altitude` flips high → low → high on subsequent rounds, matching the design doc comment (mark 3×3 2-beat windup → dip to transmit, melee-vulnerable, +50% → recover climbs). The proof renders the dip with no grid cells and a green kite ring.

## Gaps found (recorded, not fixed — per assignment)

- **GAP 1 (friction, not bug):** The unknown cue says "The ground lights up in a grid under you" — the fiction narrates a visible lit grid, but the UI deliberately renders zero highlighted cells for unknown patterns (knowledge gate). A player reading "the ground lights up" may look for a lit square and find none. Whether the narration should say "the ground shimmers — you can't read it" instead is a Steve/design call. The gate itself is intended.
- **GAP 2 (roster/doc drift):** `docs/MONSTER-WAVES.md` wave-2 list (Influencer, Motivational Speaker, Customer Service, Terms & Conditions, Middle Manager) names monsters that do not exist in `monsters.json` at HEAD; the actual wave-2 set is 13 (see table). `tg-middlemanager-*` proofs target a removed monster id (`delegate_beast`) and are stale relative to HEAD. Someone re-running the missing-proof sweep off the doc roster would chase ghosts; the inventory table above is the source of truth.
- **GAP 3 (minor):** `tg-statickite-*` capture has the kite hovering directly over the player tile (4,4) during marks after the first declare — the engine lets the kite drift onto the player's square at alt=high. Fiction-plausible ("it is COVERING you") but the player and kite overlap in the render; the mark zone is centered on the player, who is inside the blast by design — the proof shows why "MOVE" is the only coaching that matters.

## Structural spot-checks

All 6 SVG files: well-formed XML (parsed), 81 grid cells each, telegraph-highlight rects: 9 in mark-known / hot-known (orange burst), 0 in unknown renders (gate), 0 in dip renders (no cells, by design). All 6 PNGs: valid PNG magic, 21–29 KB, 390px-wide.
