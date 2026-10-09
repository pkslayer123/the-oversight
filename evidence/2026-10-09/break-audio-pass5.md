# Break-it: audio 5th pass (2026-10-09)

Fifth adversarial pass on the audio system (CombatAudio IIFE, src/js/app.js,
dispatched via Game.audioEvent -> Game.audio[name]). Passes 1–4 already
covered: census, sustained-stops, context death, contest beats, tap-to-init
race, mute side-channels, heartbeat honesty, glasswing-trap + tithe heartbeat
leaks (FIXED r4), mosquito/tick voices (FIXED r4). This pass went DEEP on new
angles: fog-of-war audio leaks, hushwolf silence canon, true-name leaks,
horrorSting honesty, mute-mid-sustained, the _contestRenderPhase re-fire
pass4 flagged, and a census re-run against commits that landed AFTER pass4.
Proof: scripts/test-audio-pass5.js (29/29 x3 seeds: 20261009, 7, 424242).

No dedicated audio canon doc exists (per the brief: stated, not invented).
Designs follow the in-code synth vocabulary and the firing code's own text
cues. docs/MONSTER-WAVES.md and docs/CONTESTS.md were read; hushwolf silence
canon comes from Steve's standing rule (rush indicator killed 2026-10-06).

## Verdict: BROKE + FIXED (4 real breaks), everything else held

### B1 — BREAK (fixed): 'phoenix' fired with no registry voice
The godhood worker's commit (456506fa, "break-it godhood kickoff") added
`this.audioEvent('phoenix')` at game.js:30526 — the phoenix-link rebirth
("You come up out of their ashes, gasping, 1 HP") — with no Game.audio
voice. The godhood moment played nothing. Same bug class as pass4's D4
(fired-but-unregistered); the census caught it on the re-run.
Fix: new `phoenix` voice in the CombatAudio IIFE + registry entry, in the
established synth style: ash-hush (filtered noise wash collapsing), three
crackling flare licks climbing out of the ash, then a fragile held tone
with a waver — rebirth at 1 HP is not triumph. Self-terminating, no timers.
Note (out of scope, not invented): the villager-bearer path
(phoenixWitnessAftermath) never fired 'phoenix' — only the player-bearer
path did. Whether the witnessed rebirth should also sound is a content call
for Steve, not a break.

### B2 — BREAK (fixed): show beats declared but never defined
The audit-shows commit added showPhases/showWatchPhases/showTogetherPhases
declaring beats 'showDeclare', 'showWatchDeclare', 'showTogetherDeclare' —
none existed in CX_BEAT_DEFS. `_cxBeat` returns silently on unknown names,
so every show entrance played NOTHING.
Fix: three composed beats added to CX_BEAT_DEFS from registered voices:
- showDeclare: ['contestCall', 'paparazzoShutter'] — the call + cameras rolling. You're ON.
- showWatchDeclare: ['contestCall', 'contestSpared'] — the call + relief's shadow. Someone else is on; you're glad, and it's your person.
- showTogetherDeclare: ['contestCall'] — the call alone. Communal watch: no cameras on you, no dread, just the show starting.
All parts resolve in the registry (proven); _cxBeat lazily composes them.

### B3 — BREAK (fixed): ratings summons declared NO beat
`ratingsSummonsPhases` had no `beat:` key — the summons entrance was silent
while every show pull got one. Same bug class as B2.
Fix: `beat: 'showDeclare'` on the summons phase (it's a TV appearance like
any show pull).

### B4 — BREAK (fixed): _contestRenderPhase's idempotency guard was DEAD CODE
`_cxRendered` was READ at the end of _contestRenderPhase but NEVER SET
anywhere — and the check sat AFTER the audio fire. A re-rendered phase
re-fires its beat (duplicate sting). Forward-only phase indices mean no
reachable re-fire in normal play today, but the guard's own comment claimed
idempotency that didn't exist.
Fix: check BEFORE the beat fires, set on first render. Safe: phase objects
are built fresh per contest run (contestPlayable builders return new
arrays; the choice path Object.assign-copies), and contestChoose only moves
forward — the flag only ever suppresses a genuine re-render. Proven:
triple-render fires once; a new phase still fires.

### Pass4 test-shape updates (not code breaks)
The commits since pass4 legitimately extended the beat namespace, so two
pass4 assertions needed their shape updated (same as pass4's own "test
setup update for post-r6 fight shape" precedent):
- test-audio-pass4.js D4/H3 beat-name regexes now accept the `show*`
  namespace (`(?:contest|show)[A-Za-z0-9_]+`).
- H3's full-arc check exempts `show*` beats: shows are single-phase by
  design (one phase, three choices, terminal WIN/LOSE/MIXED — audit-shows),
  so Declare/Escalate/Climax/Resolve doesn't apply.

## Held (attack surface documented)

- FOG-OF-WAR (the big one): fieldFights.js fires ZERO audio — offscreen
  villager-vs-monster fights are silent (proven statically). evHushwolfPack
  ("HOWLS in the distance") is text-only, no audioEvent. Alien-player hooks
  (impact beam, telegraph beam, stasisBlock, fanPackageDrop) are all in
  player-involved paths: the beam hits YOU, raises AT you, blocks YOUR
  flee. encounter-area sounds (animalBolt etc.) fire on the player's tile
  or adjacent. Broadcast mode adds no audio (text ticker only) — the
  contest's own beats carry the sound; no claim violated.
- HUSHWOLF SILENCE CANON: the rush branch (game.js) fires NO audioEvent
  before first contact — no telegraph, no hum, no sting. The wolfSnarl
  fires only AFTER the teeth land (documented design: "the rush itself
  stays SILENT — no warning, just teeth"). combatStart's heartbeat is the
  player's own dread, not a monster telegraph. Canon holds at the audio
  level. (Distant pack howls exist only as TEXT in evHushwolfPack —
  the rush itself never sounds.)
- TRUE-NAME LEAKS: voice names contain monster ids (glasswingDive etc.)
  but they're internal keys — never rendered to the player. All quoted id
  occurrences in app.js are internal logic (sprite classes, telegraph
  sets). No audio-paired UI text names an unnamed monster.
- horrorSting honesty: fire sites are first-contact monster flash
  (mflash), the quiet_woods pack reveal, storm front, and dread-genuine
  contest climax beats (auction/pit/moot/cookfight/whoate/informant,
  witness/echo fabrications). Every site is an actual dread moment —
  no cry-wolf.
- MUTE MID-SUSTAINED: mute ducks master to 0.0001; the heartbeat timer
  keeps scheduling SILENT thumps (design, not a leak — every thump node
  self-terminates, zero accumulation). Unmute restores. combatEnd still
  the kill switch. Held as designed.
- SPAM: no audioEvent in tbAdvance/tbEndCheck/refresh paths; every
  combat-AI hook is per-declare gated; startCombat refuses re-entry;
  mflash guards against stacking. No player-reachable burst.
- SOFTLOCK (non-combat exits): death-in-combat goes through tbEnd ->
  combatEnd; exile is a village-phase event (no sustained live);
  save/load can't resurrect timers; no resolveContest path fires
  mid-tbfight (day-part ticks don't run during combat).
- Sibling sweep (bug class: fired-but-unregistered): full census re-run —
  362 fired names across src/js literals, monsters.json *Audio fields,
  CX_BEAT_DEFS names+parts, DRAMA_AUDIO_MATES, encounters fallback —
  zero unregistered after the fix; registered-never-fired are all
  internal dispatch + heartbeatStop. (Bug class: dead guards: no other
  read-never-set audio flags.)

## Regressions
- scripts/test-audio-pass5.js: 29/29 x3 seeds (20261009, 7, 424242).
  Pre-fix: 4 red (phoenix unregistered, 3 missing show beats, summons
  beatless, _cxRendered never set) — all proven red, then green.
- scripts/test-audio-pass4.js: 28/28 x3 seeds (2 red pre-fix: phoenix +
  show beats; test-shape updated for the show namespace, see above).
- scripts/test-audio-pass3.js: 32/32. test-audio-breakit.js: 15/15.
  test-audio-break-exploit-20261008.js: 13/13.
  test-audio-break-honesty-20261008.js: 21/21.
- scripts/validate-ontology.js: all 52 systems validated, release
  permitted. docs/ONTOLOGY.md byte-identical (no regeneration needed).

## Canon note
No dedicated audio canon doc exists (DISEASES.md/BEAR.md/PRESERVATION.md/
MONSTER-WAVES.md/CONTESTS.md read per the brief; none covers audio). The
phoenix voice and show beats were designed from the firing code's own text
cues and the established synth vocabulary — not invented canon. If Steve
wants an AUDIO.md, that's his call.
