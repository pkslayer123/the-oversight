# The Moderator (wave-2 apex) — telegraph proof notes (Steve 2026-10-06)

Renders: `moderator-unknown.png`, `moderator-known.png`, `moderator-known-shadowban.png`
(+ `tg-moderator-*.{svg,png}` in `evidence/2026-10-06/`).
Script: `scripts/render-telegraph-moderator-20261006.js` — deterministic, re-runnable.
Summary: `evidence/2026-10-06/telegraph-proof-moderator-20261006.json`.
Method: real combat in node (headless Chromium hangs in this VM), grid drawn through
the REAL `tbAllTelegraphCells()` bucket routing from `src/js/app.js` and the REAL
suppression-field terraform via `Game.tbTerrainAt()`. The script IS the test:
assertions fail the run (exit 1) on any knowledge leak.

## Player verdict

- **DISTINCT: yes.** No other wave-2 monster draws a persistent suppression FIELD —
  a 5×5 (radius 2) purple ⊘ zone in muting, a radius-3 black ◾ zone in shadowban.
  The other five wave-2 telegraphs are transient attack shapes (lock-on cell,
  charge lane, claimed § tiles). The Moderator's visual identity is the field
  itself; the attack is a purple lock-on ring around the player marker. Unmistakable.
- **READABLE AT 390px: yes.** Field glyphs, phase badges
  (👁 CONTENT UNDER REVIEW / 🔇 MUTING / ⬛ SHADOWBAN), muted-verb readout and the
  lock-on ring all survive mobile width.
- **KNOWLEDGE-GATED: yes.** Unknown state paints ZERO direct cells (the
  `if (!known) continue` gate in `tbAllTelegraphCells`) and the cue is the
  uncoached first-contact variant ("It taps you with the flat of the hammer,
  almost gentle. Taking your measure."). The purple field shows in BOTH states
  BY DESIGN — it is diegetic terraform ("It draws a circle on the dirt — purple,
  the color of a bruise"), and the codex unknown stage describes it without
  mechanics. Not leaked in unknown: which verb is muted, the +3/violation
  stacking, the unavoidable-direct nature, Deplatform 22-32.
- **NO BUG FOUND — no game file touched.** The one red flag during capture
  (unknown render painting a direct cell) turned out to be the design working
  as intended: surviving a resolved attack teaches the pattern (`tbLearnPattern`
  at resolve), so a chasing driver can never hold the unknown state. The true
  first-contact capture (stand still, snapshot the first declare) is clean.

## Gaps / nits (no fix applied — judgment calls, not bugs)

1. `modProjectField` comment says "radius r diamond" but implements a Chebyshev
   SQUARE (`Math.max(|dx|,|dy|) <= r`). The render proves the square. Trivial
   comment nit in game.js; left alone on the hot tree.
2. The fighter marker reads "A" in all three renders — faithful to the game:
   `monsterDisplayName` keeps the mdef `unknown` descriptor ("a hovering shape
   with a hammer…") until the village names it or the System arrives. The true
   name never shows pre-System by design.
3. The shadowban known-cue still says "Removal Notice" in the `knownTail`
   ("You know this one: Removal Notice…") while the declare cue is "DEPLATFORMED."
   — the tail names the learned PATTERN (correct: same pattern, escalated phase),
   not a separate attack. Reads fine in context.
