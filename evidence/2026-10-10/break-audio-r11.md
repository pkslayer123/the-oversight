# Break-it: AUDIO SYSTEM r11 (2026-10-10)

Target index 9 (audio) — third audio attack today (r4, r5 earlier). No
audio-specific canon doc exists in docs/ (CANON.md table confirms; r4/r5
verified too) — no canon invented; all judgments are code-vs-code. Did NOT
re-litigate r4/r5 ground (pattern-honest resolve, lockon mapping, line
windup, voice census, mute, sustained-handle hygiene). Went after the surface
those runs didn't touch: convention-built beat names, polyphony bounds,
drama-mate honesty, per-voice node-graph reachability.

## Attack surface mapped
- Engine: `CombatAudio` IIFE in src/js/app.js (234 registered voices, all
  synthesized Web Audio). Dispatch: `Game.audioEvent(name, data)` ->
  `Game.audio[name](data)` with full guards (null-audio, typeof, try/catch);
  silent no-op on unknown names.
- Fire sites: 180 literal `audioEvent('x')` calls (comments excluded), 51
  monsters.json cues, 198 CX_BEAT_DEFS beats (was 142), 8 DRAMA_AUDIO_MATES,
  dynamic `wound`+temperament dispatch, variable-name pass-through sites
  (b.audio, syncName, aa, rsAudio, ...).
- Sustained handles: heartbeat setInterval, hum (capped 4 voices),
  beamSweep hum, beamCharge stopper — all idempotent + kill-switched.

## CATCH 1 — 14 pool contests had NO phase beats (HONESTY, fixed)
The 14 pool contests added 2026-10-06/07 (sorting/witness/cache/longodds,
price/impress/exchange/auction, lockpick/wrongmap/alibi/echo/tidepool/
windfall) each got a single bespoke beat for the PLAY path (e.g.
`contestTide`) — but the WATCH path (`_contestWatchPhases`) and the
death/refuse/end Resolve sites fire `_cxB(contest.id, 'Declare'|'Escalate'|
'Climax'|'Resolve')`, and `_cxBeat` SILENTLY no-ops on unknown names. So all
three watch phases AND every contest ending were completely silent for these
14 contests: the whole show, no sound. The 30 older contests each had 4
composed phase beats; the expansion contests were added to the pool without
theirs, and nobody noticed because the no-op is silent by design.
Fix: 56 phase beats added to CX_BEAT_DEFS in src/js/contests.js — the same
4-beat grammar the older 30 use (Declare announces, Escalate tightens, Climax
peaks, Resolve lands victory + signature texture), composed from registered
voices and anchored on each contest's own bespoke beat identity (e.g.
tidepool's beats reuse contestTaken/rushHit/exileWalk from `contestTide`).
Proof: scripts/test-break-audio-20261010-r11.js — BEFORE (git HEAD): all 56
absent + `_cxBeat('contestTidepoolDeclare')` produces 0 nodes (silent no-op
replicated); AFTER: all 56 present, all parts resolve to registered voices,
all 56 fire real node graphs. Static audit scripts/audit-audio-r11.js: 0
fails (234 voices, 180 literal names resolve, 198/198 beats resolve, every
contest id × 4 phases covered).

## Attacks that HELD (solid notes)
- EXPLOIT — polyphony storm (proof test): 500 rapid mixed voice fires +
  sustained handles interleaved. Live (started-never-stopped) source nodes
  stay bounded; after combatEnd+heartbeatStop+humStop, zero live. All
  sustained handles idempotent (stop-before-rebuild, refuse-while-active);
  one-shots all have scheduled stops or natural finite-buffer ends
  (deerSnort/stagSnort/projectorHum/projectorStatic/paperRustle buffer
  sources end naturally — verified in code, not leaks). Audio contains zero
  Game.* reads — cannot drive logic. Mute is player-choice; nothing bypasses
  master (re-verified r4's compressor-only finding).
- SOFTLOCK — destroyed/uninitialized Game.audio, unknown names, double
  combatEnd/heartbeatStop: all no-throw (proof test). AudioContext death
  (r3) and suspended-context resume (r4) re-verified intact in code.
- HONESTY — all 198 CX_BEAT_DEFS beats fire real node graphs through the
  lazy _cxBeat composition (proof test). DRAMA_AUDIO_MATES: 8 keys match
  game.js's documented voiced list exactly; all 25 unvoiced drama kinds
  spot-checked to fire audio at their own sites (trialFanfare, horrorSting,
  fanPackageDrop...) or be pure-visual primitives. monsters.json 30
  monsters' audio fields all resolve. wound+temperament: provably
  constrained (temp defaults 'enraged'; only cunning/desperate/enraged).
- DEAD-CODE — every registered voice builds a node graph or is a documented
  stopper/infra hook (proof test sweeps all 234). The two convention-built
  name sites (`_cxB`, `'wound'+wcap`) are the only ones in the codebase and
  both now resolve completely.

## Sibling sweep
Same bug class ("convention-built audio name, silent no-op when the data
side is missing"): only two sites exist (`_cxB` — fixed this run;
`'wound'+wcap` — provably constrained). Drama-mate "quiet by design" claims
re-verified against actual fire sites. No other instances.

## Verdict
Broke (1 honesty catch: 14 silent contests), fixed, proofs green (11/11),
ontology 52/52. Merged locally, pending ship. No [needs-eyes]: no feel or
perception change — this restores audio the design already promised.
