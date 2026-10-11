# Break-it: AUDIO SYSTEM (2026-10-11)

Target index 9 (audio). No audio-specific canon doc exists in docs/ (CANON.md
table confirms) — no canon invented; all judgments are code-vs-code. Prior
runs (r5, r11, 2026-10-10) had swept the registry clean; this run attacked the
wave-3 signature content that landed AFTER those censuses.

## Attack surface mapped
- Engine: `CombatAudio` IIFE in src/js/app.js (232 registered voices before
  this run, all synthesized Web Audio, no assets). Dispatch:
  `Game.audioEvent(name, data)` -> `Game.audio[name](data)` with try/catch
  swallow; silent no-op on unknown names (game.js). Second dispatch:
  `encAudio(name)` in encounters.js (`this.audio[name]` + ENC_AUDIO_FALLBACK).
- Wave-3 signature files (sigW3a.js batch A, sigW3b.js batch B, sigW3c.js batch
  C) landed 2026-10-10/11 with bespoke `game.audioEvent('...')` fires.

## CATCH 1 — 16 wave-3 signature voices fired, zero registered (HONESTY, fixed)
sigW3a.js fired `redactorPoint`, `gavelVerdict`, `gavelAccuse`; sigW3b.js fired
`chorusBeat`, `chorusDance`, `chorusStumble`, `gravelThrow`, `spoolRecord`,
`spoolReplay`, `spoolReplayStart`, `tosAccept`, `tosClause`, `tosLoophole`,
`tosObject`, `tosPenalty`, `tosRead` — NONE existed in the CombatAudio
registry. Every one of these signature beats (the Redactor's point, the
Gavel's verdict, the spool's record/replay, the chorus's beat, every ToS
clause) played MUTE. Same bug class as the 2026-10-10 pattern-honest catch
("dispatch exists, voice doesn't") — the wave-3 mechanics workers wired the
fires but never registered the synths.
Fix: 16 bespoke synths implemented in app.js's audio section in the file's
existing voice style (marker-squeak + redaction thud, wooden gavel crack +
hollow boom, tape reel click + whir, rewind whine, detuned woodblock tick,
off-kilter plucks, paper + bureaucratic blip, stamp + curdled chime, harsh
buzzer, sly slide, tap + record scratch, page turn), all routed
sfxBus->master->compressor (mute-safe, grep-verified no direct destination
touches), all returning early on blocked AudioContext.

## CATCH 2 — batch C entirely silent (HONESTY, fixed)
sigW3c.js (callback / buffering / ad_break) fired ZERO audio hooks — the
dead villager's face speaking, the frame-stutter announcement, and the ad
glyph unfolding all played mute.
Fix: 3 fire sites + 3 synths: `callbackRing` (wrong phone-ring dissolving
into a murmur) fired in cbSpeak; `bufferStall` (digital stutter grains) fired
in bufAnnounce; `adbreakCut` (bright jingle stab curdling to static) fired
where the ad break starts.

## CATCH 3 — 9 dead return-wrapper entries (DEAD-CODE, removed)
`ensureAudio`, `beamCharge`, `beamFire`, `deerCall`, `burstDetonate`,
`lockonHit`, `lineStrike`, `diveImpact`, `humStop` were registered in the
CombatAudio return object with ZERO external callers — all real dispatch goes
through the internal functions directly (telegraph()/impact()/combatEnd(),
deerNotice wrappers). Removed per the 2026-10-08 dead-alias precedent;
internal synths untouched; ledger comment added.

## Attacks that HELD (solid notes)
- EXPLOIT — audio cannot drive game logic (IIFE has zero Game.* refs, as
  before). Hot-loop storms: humRise clamps stacks to 4; new voices use fixed
  grain counts (bufferStall: 7, gravelThrow: 5); telegraph urgency maps to
  fixed 80/145 bpm. `audioEvent('constructor')` resolves to Object's
  constructor — called harmlessly, no state access (names are code literals,
  never user input). Blocked/throwing AudioContext: all 242 voices no-op
  without throwing (smoke-proven).
- SOFTLOCK — no awaits on audio anywhere; heartbeat/charge/sweep/hum
  idempotent with kill switches; combatEnd clears all. New voices start zero
  sustained handles (no setInterval, one-shot envelopes only). Autoplay: first
  init still on tap.
- HONESTY — new voices verified to actually synthesize (recording fake
  context: every voice schedules oscillators/noise sources for every
  representative data shape, including `{}`), and to survive empty data.
  Mute: nothing connects to ctx.destination except the compressor — no mute
  bypass in the 19 new voices.
- DEAD-CODE — full re-census: 199 literal audioEvent fires + encAudio fires +
  60 monsters.json cues + 7 drama mates + 76 contest beat parts + dynamic
  wound dispatches — ALL resolve, ZERO silent, ZERO unreferenced voices.

## Sibling sweep
Same bug class ("fired-but-unregistered") swept across every dispatch path in
one census script: audioEvent literals, encAudio literals, monsters.json
*Audio cues (nested), DRAMA_AUDIO_MATES, CX_BEAT_DEFS parts, wound+temperament
dynamics. No further instances. Sustained-handle class: new voices start none
(by construction + grep).

## Proof
- `scripts/test-audio-wave3-census.js` — registry census + hostile-context
  smoke (blocked ctor / live stub): ALL GREEN (demonstrated FAIL with 16
  silent before the fix, 0 silent / 0 dead after; 242 voices no-throw).
- `scripts/test-audio-wave3-voices.js` — 19 new voices × data shapes:
  registered, no-throw, synthesizes sound. ALL GREEN.
- Ontology: 63/63 validated.

## Verdict
Audio broke in exactly the way wave-3's speed created: mechanics shipped,
their sounds didn't. Fixed, proof-tested, registry clean. [needs-eyes] —
Steve should hear the 19 new voices on his phone (wave-3 fights).
