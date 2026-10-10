# Break-it: AUDIO SYSTEM r5 (2026-10-10)

Target index 9 (audio) — follow-up to this morning's r4 audio run, which left
one half of its own fix unapplied. No audio-specific canon doc exists in
docs/ — all judgments are code-vs-code.

## Attack summary
- **DEAD-CODE**: all 232 `CombatAudio` voices in app.js reachable. 199 fired
  names (literal `audioEvent('x')` calls + monsters.json `*Audio` config) all
  resolve to defined hooks. The 33 defined-but-unreferenced names all fire
  through: contest `CX_BEAT_DEFS` arrays (altarCurdle, engineVoices,
  hungerGnaw, mindMoth, predatorListen, swarmBuild/Flash, teethTick, ...),
  drama.js `DRAMA_AUDIO_MATES` (patternWindup, paperRustle), internal
  telegraph/impact pattern dispatch (burstDetonate, chargeImpact, diveImpact,
  lineStrike, lockonHit, rushHit, ambushSnap), dynamic `'wound'+wcap` dispatch
  (woundEnraged/Cunning/Desperate), wrapper indirection (beamCharge, beamFire,
  deerCall), or DOM infra (toggleMute/isMuted/ensureAudio — sound toggle).
  Zero dead synths. Zero fired-but-undefined hooks (dispatch no-ops safely,
  but nothing fires into the void).
- **EXPLOIT**: sustained voices all idempotent (heartbeat stops before
  restart, beamCharge refuses while active, beamSweep reuses its handle,
  humBuild stops first). No stacking, no runaway nodes. Audio contains zero
  `Game.*` reads — it cannot drive logic.
- **SOFTLOCK**: every fire site wrapped in try/catch; `ensure()` rebuilds a
  closed AudioContext (r3 fix, re-verified in code); muted gain 0.0001 with
  live ramp + localStorage persistence.
- **HONESTY**: one catch (below). Glasswing-trap heartbeat hygiene re-verified
  (miss path stops it — r4 fix intact; hit path goes through combatEnd).
  Mute toggle honest. Telegraph urgency→heartbeat-bpm mapping honest.

## CATCH — line-pattern windup/resolve voice mismatch (HONESTY, fixed)
`tbMonsterTurn`'s sweep-capable telegraph declare (game.js) fired
`audioEvent('telegraph', { pattern: pat.type, beam: pat.type === 'beam' ||
pat.type === 'line', ... })`. The `|| pat.type === 'line'` was a 2026-10-04
leftover from the deer sound-design era. This morning's r4 fix made the
RESOLVE side pattern-honest (`beam: _rpt === 'beam'`, so line resolves play
`lineStrike`) but left the WINDUP side untouched — so every line-pattern
attack (White Noise heron's Spearfish Strike, The Unkind Cut) wound up
sounding like a machine beam (`beamTechWindup`) and resolved sounding like a
line strike (`lineStrike`). The bespoke `lineWindup` synth was unreachable:
no fire site ever passed pattern:'line' without beam:true.
Fix: `beam: pat.type === 'beam'` (one token + comment). The deer's
Ocular Discharge is unaffected (type 'beam' + gallowdeer id → beamCharge).

## SIBLING SWEEP
Checked every other telegraph/impact fire site for the same beam-flag
half-application: `encDeclareBeam` (pattern:'beam', beam:true — memory
projector is a machine beam, correct), sweep ignition (beam: type==='beam',
highbeam name-test — deer only, correct), rush resolve site
(`pattern:'rush'` → rushHit, r4 fix intact). No other mixed sites.

## Proof
`scripts/test-audio-pattern-honesty.js` — parses the real ordered dispatch
branches from telegraph()/impact() in app.js and the real beam-flag
expressions from the game.js fire sites, then simulates dispatch for all 8
pattern types in monsters.json. Before: `FAIL pattern=line
windup=beamTechWindup (beam) resolve=lineStrike (line)`. After: 8/8 PASS.

## Verdict
Broke (1 honesty catch), fixed, proof green. Landed as 2dc11e10, merged
locally, pending ship. Index advanced 9 → 10 (travel & map next).
