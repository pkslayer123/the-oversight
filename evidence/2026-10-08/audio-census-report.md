# Audio census report — 2026-10-08

Worktree: `~/workspace/worktrees/audio-census` @ `5c5b48e`
Test: `scripts/test-audio-census-20261008.js` — 42/42 pass, stable across 5 seeds (20261008, 1, 42, 777, 12345).
READ-ONLY on src: no source edits. Everything below is findings + fix pointers for a later run.

## 1. Static census: ZERO fired-but-undefined (holds at HEAD)

- 183 `audioEvent('...')` literal call sites, 57 data-driven names in `src/data/monsters.json`
  (declareAudio/aggroAudio/deathAudio/resolveAudio/**noticeAudio**), 7 drama audio mates —
  all resolve to the 225-key `CombatAudio` registry in `src/js/app.js`.
- Dynamic dispatches verified, not just literals:
  - `audioEvent('wound' + wcap)` (game.js:20336) → woundEnraged/Cunning/Desperate ✓
  - drama `phaseShift` → `patternWindup` via `D.audioFor` (drama.js:76, game.js:14615) ✓
  - `encAudio('animalPanic')` ×3 cornered branches (encounters.js:1590/1609/1634) ✓
  - `delegateDebrief` via tbFifoBreather spec array (game.js:21937→21942) ✓
- Pattern coverage complete: every attack pattern type in monsters.json
  (ambush, beam, burst, charge, direct, line, rush, single) has a voice in
  `telegraph()`/`impact()` ('ambush' windup silent BY DESIGN).
- Yesterday's closeout zero holds. One census-script trap found and fixed along the
  way: drama.js also holds a signature-*VISUAL* registry (`triage: 'sigTriage'`, …) —
  a naive `key: 'value'` scrape misreads those as audio hooks. The test scopes
  extraction to the `DRAMA_AUDIO_MATES` block only.

## 2. Fired-in-combat proof (seeded node sims, full module list, window stub deleted before play)

**Resolve hooks — all FIRE** (monster attack resolves → `resolveAudio` at game.js:22470):
staticBreak (voice_mimic_radio), eurekaDetonate (bright_idea — requires `Game.dayPart=3`;
it disperses at dawn by design), projectorFire (memory_projector), understudyPerform,
landlordEvict, hecklerHeadliner, paparazzoExclusive, unionWalkout.

**Aggro hooks via generic declare — all FIRE**: gallowdeerAim, mirrormothFlash, catfishLure
(catfish fires it from its bespoke `tbCatfishTurn`, game.js:21507 — the pattern to copy).

**Aggro hooks via bespoke turn phases — all FIRE**: staticCry (voice_mimic call/approach,
game.js:23201/23209/23269), understudyWatch (24597), landlordClaim (24720),
unionBullhorn (25021), modNotice (25111).

**animalPanic — FIRES** (cornered-prey sim via `encAudio`; registry entry wins over the
bolt+rustle fallback). **turtleSnap — FIRES** when adjacent (resolveAudio path works).

**warrantyCall — does not exist.** No synth, no fire site, no data hook anywhere in
src/scripts/evidence/docs. The warranty_caller monster's actual aggro voice is `lineCut`.

## 3. The hunt's catch: 5 registered-but-unreachable aggro hooks

Each is registered in app.js AND named as `aggroAudio` in monsters.json, but the
monster's bespoke turn code `return`s before the generic declare dispatch
(game.js:25434 `this.audioEvent(dcfg.aggroAudio || 'deerAggro')`). Confirmed by
code-path analysis + full-fight sims (hook never requested):

| hook | monster | bypass (file:line) |
|---|---|---|
| `turtleGrind` | speedbump_turtle | never declares by design — ambush snap, no warning (game.js:25200) |
| `glasswingBuzz` | glasswing | bespoke circle/dive path fires `glasswingDive`, returns (game.js:23826) |
| `sunbaskerShimmer` | sunbasker | bespoke bask path via `encDeclareDirect` (game.js:24213) |
| `hecklerLaugh` | heckler | bespoke warming_up/heckling fires `hecklerPileOn`/`hecklerHeadliner` only (game.js:24788) |
| `lockpickFingers` | lockpick_raccoon | bespoke `tbLockpickTurn` consumes the turn (game.js:22998); generic declare only on the cornered fallthrough edge case |

Structural cause: **`encDeclareDirect` (game.js:21710) fires `telegraph` but never the
monster's aggroAudio** — 9 bespoke declare sites use it (23257, 24213, 24501, 24619,
24645, 24771, 24891, 25084, 25193). Fix options for a later run: (a) fire
`audioEvent((m.mdef.encounter||{}).aggroAudio)` inside `encDeclareDirect`, or
(b) fire the aggro hook in each bespoke path like the catfish does (game.js:21507),
or (c) delete the vestigial data entries. Note the turtle is "no warning by design" —
for it, (c) or a non-declare surface (bunker/unseal) fits the fiction better than (a).

Also **registered-but-no-call-site**: `patternResolve` — exposed as "callable directly"
per the contract comment, zero callers. Wire it or remove it. (Encoded as a documented
gap in the test's allow-list so the census stays green while it's tracked.)

## 4. Freaky-not-generic judgment (read all wave-2 synth defs)

Verdict: **no generic beeps found.** Every wave-2 voice is multi-layer with at least one
"wrong" element: staticBreak (formant "ah" dissolving into top-down-thinning static +
dry click), eurekaDetonate (major chord vs tritone ghost cluster + minor-2nd ring),
projectorFire (overdrive whine → cold pull + inharmonic shimmer + hard cut),
understudyPerform (exact mirror → sour beating pair + ring-mod edge + locking drone),
landlordEvict (hammer knocks + paper + descending zap), hecklerHeadliner (spotlight
fanfare that curdles), paparazzoExclusive (motor whirr + flash bloom), unionWalkout
(thinning → picket stomp + two never-agreeing wails), gallowdeerAim (capacitor whine),
mirrormothFlash (flash-charge whine), lockpickFingers (5-against-7 metallic taps),
turtleGrind (sub groan), glasswingBuzz (detuned wingbeat pair + bandpass tear),
sunbaskerShimmer (highpass haze sweep), animalPanic, lineCut (dropout + line
trying to come back). Freaky quota met.

Code hygiene (non-blocking): `catfishLure` is defined TWICE in the CombatAudio IIFE
(app.js:6073 older "NIGHTLIGHT LURE", app.js:8906 newer "NIGHTLIGHT AGGRO" wins).
Dead first definition should be deleted by a later run. Also `cgIs` (game.js:20821)
still matches `contract_golem`, removed from monsters.json — dead branch at 24501.

## 5. Unmapped hooks (beats that should have audio but fire nothing)

Swept: telegraph declares (always fire), phase transitions (drama→patternWindup, day-7+),
resolve beats ('impact' always fires), contests (contestCall/Taken/Spared + `_cxBeat`
compositions), justice (justiceVerdict/exileWalk in betrayal.js), liar confronts
(liarConfront), victory/defeat/combatEnd, levelup, knowledgeReveal. Coverage is good.
Two observations, neither a clear bug:
- **Ambush-zone arming beat** fires `audioEvent('telegraph', {pattern:'ambush-zone'})`
  (game.js, tbAmbushZoneTick) which matches no telegraph branch → heartbeat only, no
  distinct arming voice. Text-forward by design; flagging in case an arming voice was intended.
- The 5 unreachable aggro hooks (§3) are the real unmapped-beat story: the declare
  moment for those monsters plays a generic `telegraph` (+heartbeat) with no monster
  voice.

## 6. Repro

`node scripts/test-audio-census-20261008.js [SEED]` — Part A static census, Part B
seeded combat sims. 42 checks. Never run concurrent jest; if jest is needed use
`--cacheDirectory=/tmp/jest-cache-audio-census`.
