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

## SECOND PASS (2026-10-08, worktree break-audio @ c6a4545) — census sweep

The morning run covered exploit/softlock/honesty/dead-code deeply. This pass
ran the CENSUS the morning pass didn't: every literal `audioEvent('name')`
across src/js + every data-declared hook (declareAudio/noticeAudio/aggroAudio/
deathAudio/resolveAudio in JSON, schemas.json excluded) + every
DRAMA_AUDIO_MATES value, cross-checked against the CombatAudio registry;
and every registry voice checked for wiring (audioEvent literal,
Game.audio.X call, or bare-function call inside the IIFE minus its own shim).

### CATCH (DEAD HOOK, fixed): `stasisBlock` — fired, never voiced

`alienPlayers.js:2210` fires `this.audioEvent('stasisBlock')` when Rax's
stasis field eats the barrier exit ("The air goes still — ... You leave when
Rax says you leave"). The voice never existed — `audioEvent()` silently
no-ops on unknown names, so this dramatic diegetic beat played NOTHING since
the stasis system landed. The bug class is invisible by design (anti-crash
no-op), so it can only be caught by census.
**Fix:** added `stasisBlock` synth + registry entry (app.js). Fiction-fit:
metallic snap (field engaging), one held detuned high tone (frozen time) over
a rising sub that is CUT, never resolved. One-shot, self-terminating — no
sustained nodes, routes through sfxBus→master (mute-honest).
**Proof:** scripts/test-audio-break.js — 9/9. BEFORE: hook absent from registry
(git show HEAD:src/js/app.js census); AFTER: resolves, fires without throwing,
zero leaked nodes, fires only in the stasis-field branch (context-honest).
**Sibling sweep:** the census IS the sweep — it covered every module and data
file. `stasisBlock` was the ONLY fired-silent hook; DRAMA_AUDIO_MATES all
resolve; registry dead-voice count = 0. The `string?` hit was a schemas.json
artifact (schema type annotations), not a real hook.
Regressions: test-audio-break-exploit-20261008.js 13/13,
test-audio-break-honesty-20261008.js 21/21, test-declare-audio-20261008.js
15/15, validate-ontology.js 48/48.

### Structural guard landed with the fix

`scripts/test-audio-break.js` now contains the census as a regression test:
any future fired-but-unregistered hook fails the run. The bug class (silent
no-op on unknown names) is now guarded, not just patched.

### HELD — what resisted

- **Mute honesty:** toggleMute ramps master gain live (not just at ensure);
  isMuted paints the 🔊/🔇 button. No lie.
- **Per-frame hooks:** zero audioEvent call sites in render/tile/animation
  paths (tile-scenes.js, sprites.js, move-anim.js are clean).
- **No audio assets:** system is 100% WebAudio synth — no asset 404 / missing
  file surface at all. Nothing to go missing.
- **Dynamic dispatch:** `syncName` (drama audioFor) and data-driven hooks
  (`cfg.aggroAudio || 'deerAggro'` etc.) all resolve; fallbacks exist where
  data can be sparse.

Commit: c6a4545 (src/js/app.js +46, scripts/test-audio-break.js new).

---

## Run 2 — dead-synth census (2026-10-08 ~18:35 CDT, break-it target #8)

**Attacks:** exploit (audio as info-leak / callback vector), softlock (await chains,
AudioContext failure modes, iOS autoplay), honesty (every fired name resolves;
victory/defeat/combatEnd contexts; `{quiet:true}` honored), dead-code (full
registry reachability; index.html load order).

**Held:** exploit (pure output-side; no callbacks into logic; no offscreen leaks —
fieldFights fires zero audio; drama mates gated on systemArrived), softlock (no
awaits, sync try/catch dispatch, ensure() fails closed, Game.audioEvent no-ops
headless), honesty (212 referenced names — 174 fired + 54 configured + 7 drama
mates + 73 beat parts — ALL resolve; wound trio registered; quiet honored).

**CATCH 3 (DEAD CODE): 4 registered-but-never-fired synths** — `swarmFilm`,
`swarmScatter`, `swarmShutters`, `hypeEncourage`. Real implementations, zero call
sites anywhere (direct, config, drama mate, beat-def, internal composition).
Siblings all live (swarmBuild/Escalate/Flash in honey-contest beats;
hypeInflate/Detonate/Deflate in beats). Fix: deleted bodies + registry entries
(162 lines, app.js), zero refs remaining, node --check + ontology 50/50 green.
**LANDING BLOCKED:** safe-commit.sh refused the 162-line src/ deletion
(stale-revert guard); --force-delete needs coordinator approval. Deletion sits
uncommitted in this worktree; scripts landed in 7c6fb2b.

**Proof:** `scripts/test-audio-breakit.js [worktree|HEAD]` — HEAD: 14/15, flags
exactly the 4 dead synths (red); worktree+deletion: 15/15 (green). deepening-4:
94/94; deepening-3: 47 pass / 5 fail (5 pre-existing on HEAD, delegateDebrief
alias — unrelated).

**Sibling sweep:** DRAMA_AUDIO_MATES 7/7 resolve; ENC_AUDIO_FALLBACK resolves;
CX_BEAT_DEFS 73/73 resolve; encounters beat `audio:` property unused (comment-only).
