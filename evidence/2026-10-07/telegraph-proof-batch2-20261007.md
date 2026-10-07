# Telegraph visual proof — batch 2 (Steve 2026-10-07)

Played pass through `scripts/render-telegraph-proof-batch2-20261007.js`: REAL
combat driven in node against a pristine `git archive HEAD` snapshot (read-only;
the shared worktree was too dirty to load), telegraphs captured via the same
bucket routing `renderDetail` uses (`tbAllTelegraphCells` extracted from
`src/js/app.js`), rasterized with cairosvg. Engine snapshot: `98041cc8`
(HEAD moved mid-run — sibling commits landed between inventory and capture).

## What changed vs the plan

The three uncovered monsters I inventoried (nevermore / nightcourt /
statickite) were **removed from `src/data/monsters.json` by sibling commit
`98041cc8`** during this run (see Findings). All 25 remaining monsters already
have declare-phase proofs, so batch 2 pivots to the uncovered FIRING
(windup→action) and RECOVERY phases of the benchmark **Highbeam Deer** —
the only monster at HEAD with a firing dwell (`fireTurns`; verified no other
monster has one). 4 renders: firing × unknown/known, recovery × unknown/known.

## Verdicts (judged as a player at 390px)

| Render | Verdict | One-line feel |
|---|---|---|
| tg2-deer-firing-unknown | **PASS** | Red beam lane reads instantly — "MOVE!" lands, no ambiguity where not to stand |
| tg2-deer-firing-known | **PASS** | Same lane; cue becomes earned coaching, meaningfully different from blind |
| tg2-deer-recovery-known | **PASS** | Zero cells + "beam gutters out" narration = your window to act, calm and clear |
| tg2-deer-recovery-unknown | **PASS** | Same calm grid; narration marks recovery without leaking tactics |

Checklist per render:
- (a) Token sits ON the grid, never AS the square: PASS by construction
  (schematic circles overlaid on cells); verified read-only in `app.js` that the
  real grid draws the cell glyph first, then overlays the entity sprite span.
- (b) Monster name above the sprite: **NOT on the live grid** — see Finding 2.
- (c) Telegraph highlight legible at phone size: PASS — beamLane red/orange
  cells are unmistakable against the dark grid in both firing frames.
- (d) knownCue vs unknown cue: PASS — unknown: "The beam is LIVE — light
  lances from its eyes, swinging wild! No warning, no pattern you know — MOVE!";
  known: "The beam is LIVE — a ray from its eyes, swinging toward you! Circle
  it wide or get behind something solid — and keep moving… You know this one:
  Ocular Discharge fires a sweeping beam…" Genuinely different information.
- (e) No silent turn: PASS at design level — declare = grid cells +
  declareAudio (no say, BY DESIGN — `sayTelegraphOnce` is deliberately silent
  in combat; the grid IS the warning); ignition = "💥 … lances FROM ITS EYES …
  MOVE." + impact audio; recovery = "The beam gutters out… It needs a moment."
  + deerSnort + beamSweepStop. All three beats verified in the drive log
  (201 say lines captured).

## Proof files

- `evidence/2026-10-07/tg2-deer-firing-unknown.{svg,png}`
- `evidence/2026-10-07/tg2-deer-firing-known.{svg,png}`
- `evidence/2026-10-07/tg2-deer-recovery-known.{svg,png}`
- `evidence/2026-10-07/tg2-deer-recovery-unknown.{svg,png}`
- `evidence/2026-10-07/telegraph-proof-batch2-20261007.json` — capture summary
  (attack, pattern, turnsLeft, cell counts, full cue text per render)
- `evidence/2026-10-07/telegraph-proof-batch2-20261007-drivelog.json` —
  per-iteration drive log + all 201 say lines (silence audit evidence)

## Findings for the engine owner (findings only — no engine code touched)

1. **Three monsters silently removed from the roster — verify intent.**
   Sibling commit `98041cc8` ("Add pyrokinesis + stormcall abilities; tune
   loot") rewrote `src/data/monsters.json` (311+/635−) and deleted
   `nevermore`, `nightcourt`, `statickite` — all fully-fleshed monsters with
   knownCue/knownTactics, dedicated audio hooks (nevermoreCroak/Strafe/Unfold/
   Land), and debug scenarios. But `src/js/debug-scenarios.js` still references
   them 12× (scenario functions + both monster menu lists), so the debug menus
   now offer fights that throw `startCombat: unknown monster id "nevermore" —
   no silent fallback`. The commit message mentions no removal; this smells
   like a stale-base sweep, not an intentional cull. Engine owner: restore the
   three monsters or remove their scenarios/menu entries/audio hooks.
2. **Monster name is NOT above the sprite on the combat grid.** Read-only
   verification at HEAD: player and villagers render `<span class="vname">`
   above their token; monsters render only `<span data-ent="creature:…">`
   sprite with no name label. Names appear only in the combat strip above the
   grid. If Steve's bar is name-above-sprite for monsters, that's an engine
   change (and note the knowledge-gating nuance: `monsterDisplayName` exists,
   so unnamed-until-known is implementable).
3. **Non-beam telegraphs have no capturable action frame.** Only sweepBeam
   patterns dwell with `firing > 0`; gallowdeer is the sole monster with
   `fireTurns` at HEAD. Burst/line/direct/single resolve instantly — for those
   monsters the declare frame IS the whole telegraph visual; the action beat is
   narration + damage only. The attempted paparazzo firing capture confirmed
   this (declare→fire with no intermediate visual). Not a bug; bounds what
   "windup → action → recovery" proof can show per pattern type.
4. **First-contact players never see the cue text in my renders.** By the INFO
   LEAK FIX design, the danger-bar cue line is gated behind codex knowledge —
   first encounter = beam visuals + audio dread only. The renders capture
   `tbTelegraphCue` output (the text that WOULD show), which remains valid
   proof of telegraph text + cell routing, but judge them accordingly.
5. **Cosmetic:** antler-thrash narration prints "The the thing with
   headlights for eyes…" (double "The") when the monster display name already
   starts with "the". Seen repeatedly in the drive log.
6. **Render schematic limitations (not game bugs):** tokens are circles with
   name initials (T = "The Highbeam Deer") — the real game draws custom SVG
   sprites; "turnsLeft:" header is blank on firing frames (firing uses
   `tg.firing`, the header only reads `turnsLeft`); the known firing cue is
   truncated at 6 wrap lines in the PNG (full text in the JSON summary).

## Method notes

- Script: `scripts/render-telegraph-proof-batch2-20261007.js` (new file; also
  fixes the batch-1 eval list — adds `src/js/monsterBehaviors.js`, which the
  original script predates and now crashes without).
- One full run: ~8s for all 4 targets. No jest used; no worktree files touched.
- Renders are 390px-wide SVGs → PNG via cairosvg, same schematic as batch 1.
