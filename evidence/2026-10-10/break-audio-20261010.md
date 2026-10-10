# Break-it: AUDIO SYSTEM (2026-10-10)

Target index 9 (audio). No audio-specific canon doc exists in docs/ (CANON.md
table confirms) — no canon invented; all judgments are code-vs-code.

## Attack surface mapped
- Engine: `CombatAudio` IIFE in src/js/app.js (~8,800 lines, 232 registered
  voices, all synthesized Web Audio, no assets). Dispatch: `Game.audioEvent(name,
  data)` -> `Game.audio[name](data)` with try/catch swallow; silent no-op on
  unknown names.
- Fire sites: 339 literal `audioEvent('x')` calls across src/js, 51 data-declared
  cues in monsters.json (aggroAudio/resolveAudio/declareAudio/noticeAudio/
  deathAudio), 142 composed contest beats (CX_BEAT_DEFS, lazily registered by
  _cxBeat), drama.js DRAMA_AUDIO_MATES, dynamic `wound`+wcap dispatch.
- Sustained handles: heartbeat setInterval, beamCharge stopper, beamSweep hum,
  hummice hum — all with kill switches (combatEnd / heartbeatStop).

## CATCH 1 — pattern-honest resolve (HONESTY, fixed)
`tbMonsterTurn`'s squares-telegraph resolve (game.js) fired BARE
`audioEvent('impact')` with the pattern sitting right there in `tg.pattern`.
The pattern-aware `impact()` dispatch existed and worked — but the caller never
passed data, so EVERY non-sweep monster attack resolve played the generic
`impactWild` fallthrough instead of its pattern voice (chargeImpact for charges,
droneBeam for machine beams, lineStrike, rushHit, diveImpact...). The bespoke
`resolveAudio` still layered on top, so bespoke monsters sounded fine — but
every monster WITHOUT a bespoke resolveAudio (the majority) resolved every
attack with the same generic alien thud. The per-pattern resolve suite was
dead in practice at the game's most-fired resolve site.
Fix: `this.audioEvent('impact', { pattern: _rpt, beam: _rpt === 'beam',
highbeam: /highbeam/i.test(m.name || '') })` — mirrors the sweep-beam site's
convention two functions up. The deer's own beam still resolves via beamFire.

## CATCH 2 — service_mimic rush resolve (HONESTY, fixed)
`audioEvent('serviceRush', {})` followed by `audioEvent('impact', {})` — the
bespoke rush voice fired, then impactWild (generic explosion) played on top.
Per the 27630 convention the pattern voice layers under the bespoke one.
Fix: `impact({ pattern: 'rush' })` -> rushHit under serviceRush.

## CATCH 3 — 'lockon' pattern unmapped (DEAD-CODE, fixed)
'lockon' is a real pattern type in game.js (tbMonsterTurn resolve, declare,
range table) but the audio dispatch only knew the 8 data patterns. A lockon
telegraph got heartbeat-only (no windup synth); a lockon resolve got impactWild.
Fix: `pat === 'lockon'` mapped to lockonTick/lockonHit in telegraph(),
impact(), and patternWindup() (+ dispatch comment).

## Attacks that HELD (solid notes)
- EXPLOIT — audio cannot drive game logic: the IIFE contains zero `Game.*`
  references (one hit was a comment). No progression flag, gate, or callback
  reads audio state; `Game.audioEvent` never throws into game code. Mute is
  player-choice only; no cue carries gameplay information the engine depends on.
- SOFTLOCK — suspended AudioContext: `ensure()` resumes on every voice fire,
  and every cue fires from tap context. Closed context (iOS memory pressure):
  corpse detected and rebuilt (prior r3 fix, re-verified). Constructor throws:
  all voices no-op. Heartbeat/charge/sweep/hum all idempotent with kill
  switches; combatEnd clears everything; double-stops safe. No await on audio
  anywhere in game flow.
- HONESTY — victory/defeat stingers fire on actual victory/defeat (trial,
  combat end, betrayal). beamBlocked fires only when the lane was fully
  blocked. `ambush` telegraphs are silent BY DESIGN (verified: heartbeat only,
  no windup). Contest beats: all 69 declared `beat:` strings + all 74 beat
  parts resolve; _cxBeat's lazy registration verified by construction.
- DEAD CODE — full census: 180 literal fired names, 51 JSON cues, 142 beats,
  wound+Enraged/Cunning/Desperate — ALL resolve, zero silent misfires. The
  `wound()` generic voice has zero fire sites BY CONSTRUCTION (wcap is
  constrained to the three mapped temperaments) — left as the documented
  safety net, not removed.
- MUTE — toggleMute flips master gain (0.0001/0.9), persists via
  oversight_mute, fresh boot reads it. Sweep of all 232 voices: NOTHING connects
  directly to ctx.destination except the compressor — no mute bypass anywhere.

## Sibling sweep
Same bug class ("dispatch exists, caller doesn't pass data"): grepped all
`audioEvent('telegraph')` / `audioEvent('impact')` sites — no other bare calls;
all telegraph sites pass pattern (or windupTick, which returns early by
design). Ontology gate: 52/52 validated.

## Proof
`scripts/test-audio-break-20261010.js` — 36/36 green. Extracts the IIFE,
instruments dispatch probes, fakes AudioContext (suspended/closed/throwing),
asserts: inventory, no-throw sweep over 12 hostile data shapes, dispatch
honesty per pattern, lifecycle recovery, mute persistence + no bypass,
sustained-handle hygiene, and 9 static audits including the two call-site
fixes. Prior `scripts/test-audio-break.js` still 9/9.
