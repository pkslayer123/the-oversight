# Break-it: audio 4th pass (2026-10-09)

Fourth adversarial pass on the audio system (CombatAudio IIFE, src/js/app.js,
dispatched via Game.audioEvent -> Game.audio[name]). Passes 1–3 already
covered: hook-spam node leaks, sustained kills via combatEnd,
no-AudioContext no-ops, suspended-ctx resume, failed-trial silence,
hushwolf/turtle deliberate silence, alien beam coverage, specimen_scanner
copy, dead-code census (215 names), closed-ctx death (FIXED r3), mute
honesty, pan honesty, 73 contest beats, 8 internal voices. This pass attacked
five FRESH vectors. Proof: scripts/test-audio-pass4.js (28/28 x3 seeds:
20261009, 7, 424242).

There is NO dedicated audio canon doc (per the task brief: say so instead of
inventing). Designs below follow the established in-code synth style and the
firing code's own text cues; nothing invents new canon.

## Verdict: BROKE + FIXED (3 real breaks), everything else held

### W2a — BREAK (fixed): glasswing trap MISS leaves the combat heartbeat thumping forever
The trap trigger (game.js:14812) fires audioEvent('heartbeat') — 72bpm dread
while the shadow closes over 3 turns. On the HIT path this is seamless
(startCombat re-heartbeats; tbEnd's combatEnd kills it). On the MISS path
(gwTrapTick: shadow hits empty dirt, s.gwTrap=null), NOTHING stopped the
heartbeat timer. It thumped forever outside combat — through travel, haven,
the next ten minutes of play — until the next combatStart/combatEnd.
Repro (game-level, real Game.gwTrapTick via full module eval): trigger
heartbeat, tick the trap to a miss (player 4 tiles off the tile), count thump
nodes over 2.2s — pre-fix, 4+ kept spawning. Post-fix: zero.
Fix: new registry kill switch `heartbeatStop() { stopHeartbeat(); }`
(app.js), fired by the miss branch (game.js). combatEnd stays the full kill
switch (heartbeat + charge + sweep + hum); heartbeatStop is the precise one
for non-combat paths.

### W2b — BREAK (fixed): contest end never stops the tithe escalate heartbeat
CX_BEAT_DEFS' contestTitheEscalate is ['woundDesperate', 'heartbeat'] — the
only beat of 139 whose parts start sustained audio. _contestEnd, _contestDie,
and _contestRefuse all fire the Resolve beat but never stopped the heartbeat.
After any tithe contest (won, lost, died, refused), the 72bpm combat heartbeat
thumped forever outside the show.
Fix: all three end paths now fire audioEvent('heartbeatStop') next to the
Resolve beat. Idempotent; harmless if no heartbeat is live.

### D4 — BREAK (fixed): six fired-but-silent voices (mosquito/tick)
Commit 6d31d75 ("giant mosquito + alien tick as real monster fights", Steve
2026-10-09, this morning — AFTER pass3's census) added audioEvent hooks in
game.js with no registry voices: mosquitoWhine (x2 sites), mosquitoDive,
mosquitoDrink, tickClick (x2), tickLatch, tickRelease. Every one was a silent
no-op — the wave-2 alien vectors' signature moments (the too-loud whine, the
dive lineup, the drink, questing clicks, the latch, the pop of release) played
nothing. Same bug class as the Alien Players lesson (dead fire sites).
Fix: six one-shot voices added to the CombatAudio IIFE + registry, in the
established synth style, named plainly (Steve's rule: the shock is that it's
just a mosquito — just a tick):
- mosquitoWhine: thin high sine, slow wingbeat wobble, climbs a third and holds wrong
- mosquitoDive: the whine climbs an octave and steadies — locked
- mosquitoDrink: low wet pulses, ~3Hz draw, 1s
- tickClick: six dry irregular highpassed clicks, one harder ("it's found something")
- tickLatch: soft puncture — low thud + tiny high barb snap
- tickRelease: a pop — quick pitch-down blip

### Held (attack surface documented)
- E1 voice-spam DoS: no rate cap exists on audioEvent, but per-voice cost is
  bounded (worst: exileWalk, 56 nodes/fire, 0.8ms/fire). 231 voices x500 fires:
  none throw, and every voice cleans up after its documented stopper
  (combatEnd) — zero unstopped nodes, zero stacked timers. 10k combatStart
  burst: 4.8s of jank, exactly one heartbeat timer live throughout, fully
  recovered by combatEnd. Not player-reachable as a burst (voices fire via
  game events, not player loops); self-inflicted at worst, always recoverable.
  Verdict: no cap needed — the cost ceiling and the kill switch hold.
- H3 contest-beat moment honesty: all 139 CX_BEAT_DEFS beats resolve; every
  phase-declared beat exists; no phase beat is attributed to the wrong
  contest; Resolve fires on all three end paths; _contestRenderPhase fires
  phase.beat at presentation; every beat part resolves in the registry; every
  contest has the full Declare/Escalate/Climax/Resolve arc except the 14
  legacy single-beat designs (contestSort/Witness/Cache/Dice/Lock/Map/Price/
  Impress/Exchange/Auction/Tide/Wind/Alibi/Echo — one beat fired at each of
  the 3 phase presentations; the name promises no phase, the moment is
  honest). Observed, not a break: _contestRenderPhase re-fires a phase's beat
  on re-render (the _cxRendered idempotency guard covers text, not audio) —
  harmless for heartbeat (self-guarding restart), a duplicate sting at worst
  for others.
- S5 tap-to-init race: webkitAudioContext-only (old iOS) builds working
  audio; first voice on a suspended pre-gesture context constructs + resumes
  without throwing; closed-context rebuild DURING a live sustained sweep
  (pass3's closed-guard) rebuilds without throwing and the new voice sounds
  on the fresh context.
- Heartbeat bpm honesty (re-verified): urgency=turnsLeft — 2+ turns: slow
  dread 80bpm; 1 turn: frantic 145bpm. Documented in code, matches.
- Mute side-channels: exactly ONE ctx.destination connection in the codebase
  (master bus); no navigator.vibrate/haptic anywhere in src/js. Mute covers
  every sound path.

### Sibling sweep
- Bug class A (sustained audio without a stop on every exit): audited ALL
  sustained starts — combatStart (4 sites, all real combats -> tbEnd),
  telegraph (8 sites, all in-combat), humNotice/humRise (in-combat),
  beamSweep (in-combat, tbBeamEndFiring + combatEnd), beamCharge (via
  telegraph; stopCharge/beamFire/combatEnd). The ONLY non-combat starts were
  the two fixed above. Clean.
- Bug class B (fired-but-unregistered): full census re-run — 361 fired names
  across src/js audioEvent/encAudio/Game.audio literals, monsters.json
  *Audio fields, CX_BEAT_DEFS names+parts, DRAMA_AUDIO_MATES, encounters
  fallback — zero unregistered after the fix; 139 beat names resolve via the
  _cxBeat lazy path (every part verified in the registry); 8 registered-never-
  fired are all internal dispatch (pass3 list) + heartbeatStop (r4).
- monsters.json *Audio fields and other src/data/*.json audio refs: covered
  by the census walk. Clean.

### Regressions
- scripts/test-audio-pass4.js: 28/28 x3 seeds (20261009, 7, 424242).
  Pre-fix: 13 red (W2a registry+game, W2b x3 contest ends, D4 six silent
  voices + heartbeatStop missing).
- scripts/test-audio-pass3.js: 32/32. test-audio-breakit.js: 15/15.
  test-audio-break-exploit-20261008.js: 13/13.
  test-audio-break-honesty-20261008.js: 21/21.
- scripts/validate-ontology.js: all 50 systems validated, release permitted
  (docs/ONTOLOGY.md regenerated).

### Canon note
No dedicated audio canon doc exists (DISEASES.md/BEAR.md/PRESERVATION.md/
MONSTER-WAVES.md/CONTESTS.md were read per the brief; none covers audio).
The six new voices were designed from the firing code's own text cues and
the established synth vocabulary — not from invented canon. If Steve wants
an AUDIO.md, that's his call.
