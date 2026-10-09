# Break-it: audio 3rd pass (2026-10-09)

Third adversarial pass on the audio system (CombatAudio IIFE, src/js/app.js,
dispatched via Game.audioEvent -> Game.audio[name]). Pass 1 (2026-10-08) and
pass 2 (2026-10-09, commit 0c0d01c, 35/35 x3 seeds) already covered hook-spam
node leaks, sustained kills via combatEnd, no-AudioContext no-ops,
suspended-ctx no-awaited-resumes, failed-trial silence, hushwolf/turtle
silence, alien beam coverage, specimen_scanner copy, and a dead-code census.
This pass attacked four fresh vectors. Proof: scripts/test-audio-pass3.js.

## Verdict: BROKE + FIXED (1 real break), everything else held

### E3 — BREAK (fixed): AudioContext 'closed' mid-session = permanent silent death
ensure() only rebuilt the context when `ctx` was null, and only resumed when
state was 'suspended'. If the OS closed the context mid-session (iOS memory
pressure, audio route torn down by a call/bluetooth handoff), ensure() saw a
non-null ctx whose state was neither null nor 'suspended', returned true, and
every voice kept building nodes on the dead context — silent forever, no
error, no recovery path anywhere in the codebase (zero statechange listeners).
Repro: stub ctx, flip its state to 'closed', fire any voice -> pre-fix,
no new AudioContext is ever constructed; all subsequent voices feed the corpse.
Fix (src/js/app.js, ensure()): detect `ctx.state === 'closed'` (state-read
itself guarded), tear down sustained handles (heartbeat timer, beam charge,
sweep), null ctx/master/hbBus/sfxBus/noiseBuf (the cached noise AudioBuffer
belongs to the dead context), and rebuild on the normal path. Recovery is
one-shot: the fresh context starts running/suspended, so no rebuild churn.
Proof E3 pre-fix: FAIL ("still on dead ctx — audio silently dead forever");
post-fix: PASS, 32/32 x3 seeds (20261009, 7, 424242).

### Held (attack surface documented)
- E1: 200 full combat cycles (combatStart -> telegraph/impact x4 -> beamSweep
  x2 -> beamSweepStop -> combatEnd) — zero real node leaks, zero live heartbeat
  timers, nodes/cycle bounded, exactly one AudioContext ever built.
- E2: combatStart x200 with no combatEnd between — still exactly one heartbeat
  timer (heartbeat() stopHeartbeats first by construction); combatEnd clears it.
- E4: ensureAudio x50 — no context rebuild, no master-gain restack.
- S1: AudioContext constructor throws (blocked policy) or is entirely absent —
  boot survives, every voice no-ops without throwing, zero contexts/nodes.
- S2: exactly ONE ctx.resume() call site in the codebase, inside ensure(),
  synchronous, never awaited. iOS unlock rides the first gesture-fired voice;
  no timer/promise-only resume path exists. Zero statechange listeners (noted;
  'interrupted' self-heals — see S3).
- S3: ctx.state='interrupted' (iOS call/bluetooth) — voices survive; when the
  OS drops back to 'suspended', the next voice's ensure() resumes. Self-heals.
- H1: mute is REAL, not theater — toggleMute() drives master gain to 0.0001 via
  cancel+set+ramp; un-mute restores 0.9; boot with oversight_mute=1 starts the
  master at 0.0001. isMuted() tracks.
- H2: positional audio is honest — beamSweep pan reaches a real StereoPanner
  (pan=-0.7 verified on the node), sustained sweep.set() moves pan as the beam
  aim tracks (game.js pans by (aim.x - pl.mx)/4, heat rises with proximity).
- H3: 24 named show-voices (trialFanfare, hypeDetonate, contestCall, round,
  droneCount, teethTick, stormFront, horrorSting, victory/defeat, justiceVerdict,
  exileWalk, ...) all fire without throw and actually create nodes.
- H4: all 73 CX_BEAT_DEFS contest beats resolve in the registry and sound.
- D1: all 215 fired names (audioEvent literals across src/js, Game.audio.X
  direct calls, monsters.json *Audio fields, CX_BEAT_DEFS, DRAMA_AUDIO_MATES
  values, encounters encAudio hooks) resolve in the Game.audio registry.
- D2: zero unreachable registry voices. 8 registered-but-never-fired-by-name
  are all reachable via internal dispatch: deerCall (via deerNotice/deerDown/
  deerAggro aliases), beamCharge/beamFire (telegraph/impact highbeam
  sub-dispatch), burstDetonate/lockonHit/lineStrike/diveImpact (impact pattern
  sub-dispatch), humStop (combatEnd), patternWindup (drama DRAMA_AUDIO_MATES).

### Sibling sweep
- encounters.js stale comment ("animalPanic has no registry entry") was false —
  app.js ships a real animalPanic synth (registry fulfills the encAudio
  contract). Comment corrected to the fulfilled state.
- Checked for the same bug class elsewhere: CombatAudio is the only WebAudio
  user; duckHeartbeat guards (!ctx||!hbBus); heartbeat's beat closure reads the
  live ctx var; no other module caches a context. No second instance of the
  dead-context assumption.

### Regressions
- scripts/test-audio-pass3.js: 32/32 x3 seeds (20261009, 7, 424242).
- scripts/attack-audio-20261009.js Part 1: all green. Part 2 B3 hushwolf sim
  hits a pre-existing HARNESS ERROR (tbCurrent undefined) — verified identical
  on unmodified HEAD via stash; unrelated to this change.
- scripts/test-audio-breakit.js: 15/15. test-audio-break-exploit-20261008.js:
  13/13. test-audio-break-honesty-20261008.js: 21/21.
- test-audio-census-20261008.js (2 fails) and test-audio-20261007.js (3 fails)
  fail identically on unmodified HEAD — stale hardcoded counts/allow-lists in
  old scripts; superseded by this pass's D1/D2.
- scripts/validate-ontology.js: all 50 systems validated, release permitted.

### Note
drama.js DRAMA_AUDIO_MATES contains a `secret:` kind key whose value the tool
redactor masked in output; verified programmatically that all 8 mate values
(including it) resolve in the registry — no disclosure needed, no action taken.
