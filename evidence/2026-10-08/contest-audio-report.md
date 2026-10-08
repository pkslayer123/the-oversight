# Contest audio beats — 30 older contests (2026-10-08)

Worker: contest-audio worktree, base 5b266b2. Owns `src/js/contests.js` only;
`src/js/app.js` untouched (read-only). No new synths added — every beat is a
named, composed dispatch over already-registered `Game.audio` synths, per the
existing `CX_BEAT_DEFS` / `_cxBeat` / `phase.beat` pattern from the 14 newer
contests (Steve 2026-10-06).

## What was built

- **122 new beat defs** in `CX_BEAT_DEFS`, named `contest<Id>Declare |
  Escalate | Climax | Resolve` via the new `Game._cxB(contestId, kind)` helper
  (handles `calorie_run` → `ContestCalorieRun` camel-casing). Unknown names
  still no-op in `_cxBeat`, so watch/generic paths call it blind.
- Every phase of all 30 older contests declares its beat: 16 bespoke builders
  (`_contestPit/Gauntlet/Hide/Duel/Tithe/Siege/Maw/Oath/Beastmaster/Riddle/
  Confession/Honey/Secrets/Quiet/Guest/Vigil`), 7 category templates
  (Endurance/Moot/Weird/Puzzle/Detective/Forage/Chance — beat chosen by
  `contest.id`, so drop≠starve, box≠pattern, etc.), the generic fallback, the
  30%-choice prepend phase, and all 3 watch phases.
- **Resolution**: `_contestEnd` (won/lost), `_contestDie`, and `_contestRefuse`
  now fire the contest's Resolve beat.
- **Intro dedupe** (the small finding from the 00:20 report): the choice-phase
  text no longer re-says `name. desc` (contestInterruption says it two lines
  earlier). New text: "The System waits. The cameras are already rolling."
- Ontology header updated (`beat_audio` extended, `no_intro_repeat` rule).

## Beat table (declare / escalate / climax / resolve)

- pit: hecklerHeadliner+contestCall / woundCunning+deerAggro / chargeImpact+horrorSting / victory+monsterDown
- gauntlet: droneCount+contestCall / woundEnraged+swarmEscalate / lockonTick+chargeImpact / victory+crash
- duel: trialFanfare+contestCall / lockonTick+hecklerTaunt / chargeImpact+monsterHurt / victory+lineCut
- drop: stormFront+droneCount / animalPant+nightcourtSilence / rushHit+crash / victory+exileWalk
- starve: contestCall+holdMusic / statusApplied+lineCut / hypeDetonate+shout / victory+contestSpared
- moot: trialFanfare+paperRustle / confront+justiceVerdict / justiceVerdict+horrorSting / lineCut+exileWalk
- lies: droneCorrect+contestCall / liarConfront+lineCut / staticScream+modViolation / justiceVerdict+lineCut
- cookfight: systemCooking+contestCall / catfishSnap+animalChatter / eurekaTick+horrorSting / victory+animalButcher
- fetch: animalWhistle+contestCall / animalRustle+lockpickChitter / eurekaTick+hypeInflate / victory+traderArrive
- hide: droneCount+nightcourtSilence / nightcourtSilence+woundCunning / ambushSnap+staticScream / victory+nightcourtClimb
- box: lockpickChitter+contestCall / eurekaTick+paperRustle / eurekaDetonate+victory / lineCut+passiveUnlock
- pattern: systemCooking+holdMusic / statusApplied+lineCut / eurekaTick+crash / victory+animalPant
- whoate: paperRustle+contestCall / liarConfront+lineCut / justiceVerdict+horrorSting / victory+paperRustle
- informant: modNotice+contestCall / woundCunning+droneCount / ambushSnap+horrorSting / victory+exileWalk
- calorie_run: droneCount+animalWhistle / animalRustle+rushHit / eurekaTick+hypeDetonate / victory+animalPant
- pantry_raid: shout+animalChatter / shout+animalBolt / ambushSnap+crash / victory+exileWalk
- wheel: contestCall+eurekaCharge / eurekaTick+round / eurekaDetonate+crash / victory+hypeDeflate
- lottery: hypeInflate+droneCount / holdMusic+lineCut / ambushSnap+eurekaDetonate / victory+hypeDeflate
- tithe: statusApplied+holdMusic / woundDesperate+heartbeat / horrorSting+lineCut / victory+horrorSting
- siege: unionRepWhistle+contestCall / shout+unionBullhorn / crash+woundEnraged / victory+unionWalkout
- maw: nightcourtSilence+contestCall / nightcourtSilence+woundCunning / catfishSnap+staticScream / victory+nightcourtClimb
- oath: confront+contestCall / lineCut+modViolation / modNotice+horrorSting / victory+round
- beastmaster: animalSnort+hecklerHeadliner / animalPant+lockonTick / ambushSnap+woundEnraged / victory+paperRustle
- riddle: droneHum+contestCall / eurekaTick+droneCount / staticCry+horrorSting / victory+staticBreak
- confession: liarConfront+contestCall / lineCut+justiceVerdict / justiceVerdict+modViolation / victory+staticScream
- honey: swarmBuild+contestCall / swarmEscalate+hypeInflate / ambushSnap+swarmFlash / victory+hypeDeflate
- secrets: paperRustle+holdMusic / round+lineCut / staticScream+crash / victory+paperRustle
- quiet: nightcourtSilence+holdMusic / staticCry+lineCut / staticScream+horrorSting / victory+nightcourtClimb
- guest: trialFanfare+systemCooking / eurekaTick+horrorSting / trialFanfare+horrorSting / victory+systemCooking
- vigil: nightcourtSilence+droneCount / droneHum+woundCunning / stormFront+staticScream / victory+nightcourtLand
- generic (fallback): contestCall / round / horrorSting / victory

## Test results

- `scripts/test-contest-beats-20261008.js` (new): **1045/1045 green** (seed
  20261008), **1046/1046 green** (seed 7). Asserts per contest × 4 paths
  (grab / 30%-choice / refuse / watch): every visited phase's declared beat
  fired an audioEvent; Resolve fired on completion; choice-phase fires Declare
  and does not repeat the desc; all 138 CX_BEAT_DEFS entries resolve to
  registered `Game.audio` synths; every def name matches `Game._cxB`.
- `scripts/test-contest-play-20261008.js` re-run: **1007/1007 green** — the
  beats changed nothing about playability.
- Arc trace (pit): contestTaken → contestPitDeclare → contestPitEscalate →
  contestPitClimax → contestPitResolve. Same shape verified for hide, quiet.

## Gotchas hit (for future workers)

- `rushWindup` is NOT a registered `Game.audio` key (only `rushHit` is) —
  caught by the static synth-resolution check before it ever shipped.
- Trailing `// comments` after a beat-def line break line-anchored tooling;
  keep def lines bare, put notes in the per-contest header comment.
- tithe/quiet define climax phases as consts before the return array, so
  body-order ≠ play-order — their beats were wired by hand, not positionally.

## New-synth wishlist (needs app.js edits — for a later run)

These beats are the best available compositions, but each would breathe more
with one dedicated synth:
- `pitGate` — arena gate slam + beast roar (declare)
- `titheDrip` — blood threading into the basin (declare/escalate)
- `quietEcho` — your voice speaking your thoughts a half-second early (escalate)
- `wheelRatchet` — the teeth clicking past the pointer (escalate)
- `guestToast` — alien glassware chiming in a wrong interval (climax)
- `vigilLamp` — the lamp flame leaning away from the dark (escalate)
