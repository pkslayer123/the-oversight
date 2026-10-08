# break-it: audio — 2026-10-08

Worktree: `~/workspace/worktrees/break-audio` @ `35232b2`
Tests: `scripts/test-audio-break-exploit-20261008.js` (13 checks), `scripts/test-audio-break-honesty-20261008.js` (21 checks) — both green × 4 seeds (20261008, 7, 42, 777).
Regressions green: `test-declare-audio-20261008.js` 15/15, `test-audio-leftover-decisions-20261008.js` 11/11, `test-wiring-fixes-20261007.js` 19/19, `test-audio-w2freakiness-20261008.js` 258/258. Ontology gate passes.

## CATCH 1 (HONESTY, fixed): failed trials played the victory sting

`chooseTrialOption` (game.js) fired `audioEvent('victory')` UNCONDITIONALLY after the
trial branch — including on failure ("An hour of bow-drill with blistered hands, and
nothing but smoke and philosophy" → victory fanfare). Copy said failure; engine said triumph.
**Fix:** `triumphed` flag set in each of the 5 TRIUMPH branches; victory fires only on triumph.
Failed trials keep the "failed BEAUTIFULLY" text beat, no fanfare.
**Proof:** before-fix sim — failure path narrated failure AND played victory (test failed);
after-fix — failure plays nothing, triumph plays victory. 21/21.
**Sibling sweep:** audited every other success-cue site (`victory` ×3, `contestSpared`,
`levelup`) — all sit inside genuine success branches. The trial was the only liar.

## CATCH 2 (DEAD CODE, fixed): nightcourtDive — registered, data-declared, zero fire sites

`nightcourtDive` synth (app.js) + `declareAudio: "nightcourtDive"` (monsters.json) existed,
but the nightcourt's bespoke dive path DELIBERATELY skips declareAudio ("DELIBERATE: no dive
audio. The silence IS the telegraph") and always returns before the generic declare path.
**Proven dead** by a full seeded nightcourt fight sim (dive declared repeatedly, hook never fired).
**Fix (Steve's standing order covers the call):** DELETED the synth, the registry entry, the
monsters.json entry, and updated the contract comment. There is no fiction-honest moment for it —
the dive is silent by design, impact is `diveImpact`, landing is `nightcourtLand`.
Old characterization tests (`test-wiring-fixes-20261007.js`, `test-audio-w2freakiness-20261008.js`)
had their voice lists updated (both green after).

## HELD — exploit/softlock (the engine is well-built)

- **Node leaks:** stubbed-WebAudio harness fired ALL 225 voices + 500× impact spam. Zero real
  leaks — every oscillator is stopped; sustained systems (beamSweep singleton, hum bed,
  heartbeat) are all killed by combatEnd/beamSweepStop/humStop. humRise caps at 4 voices
  (999 stacks → ≤8 live nodes). Initial "leak" flags were false positives: finite non-looping
  buffer sources self-terminate (deerSnort/stagSnort/projectorHum/projectorStatic/paperRustle).
- **Spam/throttle:** 500 impacts → linear node creation (~47/impact, the synth's multi-layer
  design), all stopped; heartbeat restarts never stack intervals (10 telegraphs → 10 sets/10 clears);
  no unbounded queues anywhere. Master chain (0.9 gain → DynamicsCompressor) is the anti-clip seatbelt.
- **Autoplay softlock:** `ensure()` calls `ctx.resume()` fire-and-forget, never awaited; static grep
  confirms zero awaited resumes in src. Suspended-never-resuming context → hooks return instantly.
  No AudioContext at all → every voice is a silent no-op, zero throws. `audioEvent` itself is
  try/catch-guarded. No contest countdown or modal gates on sound finishing.

## HELD — honesty (silent beats stay silent)

- **hushwolf rush:** seeded sim — no `wolfSnarl` before first contact; snarl fires after the hit
  lands (aftermath, not warning). `wolfSilence` noticeAudio fires at combat start.
- **nightcourt dive:** dive-declare steps carry zero monster voice (only the ambient System `round`
  metronome ticks, which fires every round regardless — not a telegraph). `nightcourtSilence`
  noticeAudio fires at combat start.
- **turtle snap:** turtle sits silent on all pre-snap turns; `turtleSnap` + `turtleGrind` fire in
  the snap turn itself (the snap IS the declaration — no advance warning, honest).
- **drama mates:** `phaseShift`→`patternWindup` and `ambush`→`ambushSnap` both dispatch through
  `Game.drama` at runtime (stubbed Drama layer); every DRAMA_AUDIO_MATES value resolves in the registry.
- **noticeAudio:** all 8 data hooks fire via the combat-start dispatch (game.js:17798).
- **patternResolve:** confirmed still removed (dead alias, zero callers).
- **5 census aggro hooks** (turtleGrind, glasswingBuzz, sunbaskerShimmer, hecklerLaugh,
  lockpickFingers): re-verified firing at HEAD via `test-declare-audio-20261008.js` 15/15.
- **catfishLure duplicate:** already cleaned before this run (single definition at HEAD).

## Notes for later

- The `round` metronome ticks during silent beats (dive declare). Deliberate: it's the System
  watching, not the monster speaking. If Steve ever wants total silence, that's the knob.
- `deerSnort`/`stagSnort`/`projectorStatic`/`paperRustle`/`projectorHum` start finite buffer
  sources without explicit `.stop()` — benign (self-terminating), but a future worker adding
  `.stop()` calls would make the intent explicit and silence naive leak-checkers.
