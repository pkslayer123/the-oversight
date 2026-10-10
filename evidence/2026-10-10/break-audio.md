# Break-it: audio system (2026-10-10)

Target index 9. **No audio canon doc exists** — docs/CANON.md's manifest lists
no audio design doc, so there was no canon to check against; the audit below
is code-vs-code (hook contracts in app.js comments vs. fire sites). The one
canon-adjacent rule in play: Steve 2026-10-06 killed the hushwolf rush
indicator ("Silent Rush gives no warning, it just moves and hits") — verified
held (see Honesty).

## Attacks

### 1. EXPLOIT — context / oscillator / interval leaks — HELD
Drove 200 mixed voices (all 7 pattern windups+resolves, telegraphs, monsterHurt)
through a stubbed AudioContext in `scripts/test-audio-stuck-loops.js`:
- exactly **1** AudioContext minted for all 200 voices (no per-voice leak)
- ≤1 active interval at all times (heartbeat restarts via stopHeartbeat first)
- one-shot oscillators schedule their own stop
- Sustained handles are singleton-guarded: `heartbeat()` stops the old timer
  first; `beamSweep()` reuses the live hum via `sweep.set()`; `humBuild()`
  calls `humStop()` first; `beamCharge()` refuses re-entry while live;
  `monsterHurt` is round-gated (`hurtSndRound`); `humBuild` clamps stacks to 4.
- The two `setTimeout` sites in the region are self-clearing one-shots.

### 2. SOFTLOCK — stuck sustained audio on combat-end bypasses — BROKE, FIXED
**Bug class:** sustained loops (combat heartbeat `setInterval`, beam-sweep hum,
hummice bed, beam-charge) are killed ONLY by `audioEvent('combatEnd')`
(idempotent). The r4 glasswing-trap instance was fixed 2026-10-09; two siblings
remained, both dropping `tbfight` without any hygiene:
1. `Game.load()` (game.js:6551) — restoring a peaceful save mid-session kept
   the previous session's heartbeat thumping forever with no fight.
2. `tbBarrierExit()` corpse-bearer path (game.js:26045) — dissolving the fight
   when the bearer dies mid-fight left the loops running with no fight.
**Fix:** fire `this.audioEvent('combatEnd')` (try/catch, idempotent — silent when
nothing plays, safe headless where Game.audio is undefined) immediately before
each `this.tbfight = null`. All three `tbfight = null` sites now audited:
`load()` ✓, `tbBarrierExit()` ✓, `tbEnd()` (canonical path, fires combatEnd
unconditionally before its finally-null) ✓.
**Proof:** `scripts/test-audio-stuck-loops.js` — dynamic (stubbed AudioContext
records intervals/osc stops; reproduces stuck heartbeat on the no-combatEnd
path, proves combatEnd clears it) + static (every `tbfight=null` in game.js must
sit in a function firing combatEnd). BEFORE (HEAD): 15 pass / 2 fail — fails
exactly on `load()` and `tbBarrierExit()`. AFTER: 17/17 green (seeds 7, 42).
No `[needs-eyes]` — no player-facing feel change; this only kills stuck audio.

### 3. HONESTY — every fired name resolves to a real synth — HELD
- 180 distinct literal `audioEvent('name')` fire sites: **all 180** resolve in
  the Game.audio registry (233 voices).
- 48 `aggroAudio`/`resolveAudio`/`deathAudio` values in monsters.json: all 48
  resolve.
- 76 CX_BEAT_DEFS contest-beat parts: all resolve (beats lazy-compose from
  registered parts; `_cxBeat` no-ops on unknown names by design).
- 6 `mod*` voices fired by game.js: all resolve (the app.js:17 contract holds).
- `DRAMA_AUDIO_MATES` values (drama.js): all resolve.
- Dynamic names: `'wound'+wcap` → woundEnraged/woundCunning/woundDesperate
  (+ generic `wound()` safety net); `syncName` from `D.audioFor`; config-driven
  `aa` — all audited literals.
- victory/defeat fire on the correct outcomes (tbEnd won/lost, trial triumph,
  betrayal_won); contestTaken/contestSpared on the right branches.
- Hushwolf Silent Rush: NO telegraph audio fires on the rush path (bespoke
  no-telegraph branch); `wolfSnarl` fires once per wolf only AFTER first
  contact via tbAggroAudio; `impact({pattern:'rush'})` → `rushHit()` plays only
  when teeth land. The canon silence holds.

### 4. DEAD CODE — HELD
- index.html:79 loads app.js; `Game.audio = CombatAudio` runs at script load,
  before `title()` wires the mute button (no dead toggle). `Game.audioEvent`
  in game.js is a safe no-op when Game.audio is undefined (headless/tests).
- All 233 registered voices reachable: 12 with zero out-of-app.js references
  are internal sub-voices reached through fired dispatchers
  (telegraph→beamCharge/burstWindup/…, impact→beamFire/burstDetonate/…,
  combatStart→combatStartHit+heartbeat, deerNotice→deerCall, combatEnd→humStop).
- Mute toggle: flips `muted`, persists to localStorage, live-ramps master gain
  on an existing context; proved through the stub.

## Sibling sweep
Same bug class ("sustained audio started, stop path missing") swept across the
whole CombatAudio region: heartbeat, beamSweep, hum, beam-charge all terminate
in `combatEnd`; the only starters are combatStart/telegraph/glasswing-trap —
all paired with a stop. The glasswing-trap miss path (r4) was already fixed.
No further instances found. Related pattern elsewhere (fired-but-silent hooks):
none — the registry census is complete per the checks above.

## Verdict
Audio survives the hostile pass except the two stuck-loop bypasses, now fixed
and proof-tested. System earns its "solid" note.
