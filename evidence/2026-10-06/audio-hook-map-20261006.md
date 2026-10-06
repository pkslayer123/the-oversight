# Audio hook map — 2026-10-06

Verification run: `node scripts/test-audio-hooks-20261006.js` → **201 pass, 1 fail**
(The 1 fail is the documented bug below — the test fails LOUD on it by design.)

**Counts**
- Hooks fired across src/js + src/data: **182**
- Synths registered in CombatAudio: **195**
- Firing + resolving: **170** (driven headless, no-throw, sound graph produced)
- Fired but NO synth (silent no-ops): **12** ← the bug
- Registered but never fired (dead): **13** (classified below)
- Thin/generic candidates by objective layer scan: **0** — every fired synth
  starts ≥2 layered sources or is a legitimately-silent control hook.
  No ears-on was possible headless; freakiness verdicts need Steve's phone.

## 🔴 BUG: 12 silent flyer hooks (nevermore / nightcourt / statickite)

`Game.audioEvent` (game.js:16167) silently skips names with no registry
function. These 12 hooks fire from game.js but have no synth — the flyer
fights play mute at every signature beat:

| hook | dispatch sites (game.js) | fiction beat |
|---|---|---|
| nevermoreCroak | 15309, 20895 | first contact: the crow that has been watching |
| nevermoreLand | 19829 | strafe run ends in the dirt, grounded |
| nevermoreClimb | 20839 | hammers beak shut, climbs back into the dark |
| nevermoreStrafe | 20880 | strafe attack |
| nightcourtSilence | 15319 | first contact: "no wingsound — that's the problem" (could be an intentional hush, but currently no registry entry at all — not a design choice, an omission) |
| nightcourtLand | 19848 | lands after dive |
| nightcourtClimb | 20924 | climb beat |
| kiteHum | 15329, 21028, 21077 | first contact: kite with no string |
| kiteBroadcast | 19860 | broadcast beat |
| kiteTransmit | 21001 | dips to transmit — the melee-height window |
| kiteClimb | 21006 | climb beat |
| kiteMark | 21061 | marks a 3x3 square |

Fix: register 12 synths in the CombatAudio return block (app.js ~8900),
freaky not generic — e.g. nevermore = beak-hammer percussion + detuned
corvid croak; nightcourt = negative space / hush with sub-bass; statickite
= detuned kite-string whine + radio-static bursts. After registering,
`node scripts/test-audio-hooks-20261006.js` goes 202/202.

## Dead synths (registered, never fired, not dispatch-reachable): 13

- `understudyLearn`, `landlordStamp`, `paparazzoFlash`, `unionRepChant`,
  `managerAnnounce`, `ducksRejoin` — written for beats that were never wired.
  Either wire dispatch sites or delete. (union_rep fires unionBullhorn, not
  unionRepChant; paparazzo fires paparazzoShutter, not paparazzoFlash.)
- `contractBind` — orphan: monsters.json has NO contract_golem entry
  (the hook-contract comment in app.js:1698 claims it was "wired" via
  encounter.resolveAudio — stale). Wire a golem or delete the synth.
- `delegateAnnounce`, `delegateCharge` — alias shims to manager* that nothing
  fires (only `delegateCircle` is fired). Harmless; keep or delete.
- `delegateDebrief` — comment says "was fired by tbFifoBreather, silent";
  no dispatch site exists anymore. Stale comment + orphan synth.
- `patternWindup`, `patternResolve` — public API for sibling workers
  (hook contract); fine to keep, but currently unused.
- `deerCall` — internal voice used BY deerNotice/deerAggro/deerDown;
  reachable through the wrappers. Not dead, just indirect.

Not dead (dispatch-reachable, verified in test): `beamCharge`, `beamFire`,
`burstDetonate`, `chargeImpact`, `lockonTick/Hit`, `lineStrike`, `rushHit`,
`diveImpact`, `ambushSnap`, `impactWild`, `droneBeam`, `beamFlash` — all
reached through `telegraph()`/`impact()` pattern dispatch.

## Thin/generic candidates: none found objectively

Full-registry sweep drove every synth under the mock graph: zero throws,
zero silent synths (after accounting for the stateful beamSweep sustained
hum and the legitimately-silent control hooks: combatEnd, beamSweepStop,
humStop, toggleMute/isMuted/ensureAudio). No single-oscillator placeholder
synths remain. Freakiness is a human judgment — candidates for ears-on
spot-checks on Steve's phone: hecklerTaunt (shame-scaled), modViolation,
unionWalkout, exileWalk, horrorSting.

## Missing cues entirely (no dispatch site anywhere)

1. **Knowledge-gating reveals** — the game's core progression beat is
   SILENT. `game.js:3155` (★ Learned: plant), `game.js:9944` (TRADED
   KNOWLEDGE), `game.js:10000` (KNOWLEDGE COMBINES), `game.js:13423`
   (Deeper knowledge) — none fire any audioEvent within ±12 lines.
   The "if you don't know, it doesn't show" reveal moment deserves a
   signature sound (this is the knowledge→food→power loop's payoff).
2. **truth.js fires zero audioEvents** (noted in the app.js hook-contract
   comment) — the whole truth/social-deduction system is mute.
3. **convo-*.js (convo-beats, convo-dialogue, convo-mood, convo-wants,
   convoTopics), examine.js, codex-people.js** fire zero audioEvents —
   conversation and codex beats have no sound at all.
4. Covered already (not missing): exile arc (exileWalk, justiceVerdict,
   joinVillage, claimSite, chopWood, buildShelter, foundHaven), contest
   beats (contestCall/Taken/Spared), wave-2 five, Highbeam Deer full arc,
   all 8 pattern telegraphs, forager loop (23 animal hooks), glasswing,
   sunbasker, projector, eureka, swarm/drone, belltoad, wave-1 batch beasts.

## Prioritized fix list (for the future audio pass)

1. **P0 — register the 12 flyer synths** (table above). Currently the
   newest flyer content ships mute. Test proves green after.
2. **P1 — knowledge-reveal cue.** One signature synth + dispatch at the
   four knowledge-grant sites (game.js:3155, 9944, 10000, 13423).
3. **P2 — dead-synth cleanup:** wire-or-delete understudyLearn,
   landlordStamp, paparazzoFlash, unionRepChant, managerAnnounce,
   ducksRejoin, contractBind, delegateDebrief; fix the stale
   contract_golem comment (app.js:1698).
4. **P3 — social/conversation audio:** truth.js + convo-*.js dispatch sites
   (even 2–3 beats: confrontation, revelation, mood shift).
5. **P4 — test hygiene:** `scripts/test-audio-wireup-20261006.js`
   section 3 calls `ok(cond, 'label')` with (name, cond) SWAPPED —
   every check passes vacuously (the label string is always truthy).
   The contract_golem assertion it "verifies" is false (no such monster
   in monsters.json). Fix the arg order so it actually guards.

## Hook → synth table (all 182 fired hooks)

All resolve except the 12 flyer hooks marked 🔴. Driven headless via the
real dispatch rule; each verified fired + resolved + no-throw + sound graph.

deer: deerNotice, deerAggro, deerSnort, deerDown, beamCharge(via telegraph),
beamSweep, beamSweepStop, beamBlocked, beamFire(via impact) · patterns:
telegraph/impact × (beam, burst, charge, direct, line, rush, single, ambush)
· wave2: hecklerTaunt, hecklerLaugh, hecklerPileOn, hecklerHeadliner,
hecklerJibe, unionBullhorn, unionPicket, unionWalkout, unionRepWhistle,
paparazzoShutter, paparazzoExclusive, understudyWatch, understudyRehearse,
understudyCopy, understudyPerform, modNotice, modNoted, modMute,
modViolation, modRemoval, modShadow, modDown · 🔴 flyers: nevermoreCroak,
nevermoreLand, nevermoreClimb, nevermoreStrafe, nightcourtSilence,
nightcourtLand, nightcourtClimb, kiteHum, kiteBroadcast, kiteTransmit,
kiteClimb, kiteMark · forager: animalStalk, animalRustle, animalSnort,
animalBolt, animalKill, animalButcher, animalBite, animalPinch,
animalSplash, animalFlop, animalChatter, animalPant, animalRattle,
animalSpray, animalQuill, animalHonk, animalYowl, animalCharge,
animalTailSlap, animalWhistle, animalFlush, animalHiss · contest:
contestCall, contestTaken, contestSpared · social: confront,
justiceVerdict, exileWalk, joinVillage, claimSite, chopWood,
buildShelter, foundHaven · system: combatStart, combatEnd, round, crash,
levelup, passiveUnlock, waveUnlock, genesis_plant, gravity_well, victory,
defeat, heartbeat, shout, talkAttention, horrorSting · glasswing:
glasswingCircle, glasswingDive, glasswingLand, glasswingClimb,
glasswingShadowClose · sunbasker: baskCharge, baskBreak, baskFlatten ·
projector: projectorHum, projectorStatic, projectorBreak, projectorPull,
projectorFire · eureka: eurekaTick, eurekaCharge, eurekaDetonate,
eurekaSpent, eurekaDisperse, eurekaDrift · swarm/hummice: swarmFilm,
swarmBuild, swarmFlash, swarmEscalate, swarmScatter, swarmShutters,
humNotice, humRise, humBreak · drone: droneHum, droneCount, droneBeam,
droneRecalc, droneCorrect · belltoad: belltoadCroak, belltoadStun,
belltoadChorus, toadSwell · wave1: boarNotice, boarSnort, boarCharge,
boarTrample, wolfSilence, wolfSnarl, wolfBreak, heronStatic, heronUnfold,
heronStrike, turtleSnap, turtleBunker, stagMirror, stagSnort, stagCharge,
stagConfused, ducksQuack, ducksQuackCut, duckLineUp, duckMarch, duckNip,
duckRegroup, duckScreech, catfishLure, catfishSnap, catfishStill,
lockpickChitter, lockpickGrab, mothFlash, mothFlutter, snakeSplit ·
manager: managerCircle, managerCharge, managerDebrief, managerFear,
delegateCircle · generic: monsterDown, monsterHurt, staticScream,
staticCry, staticBreak, serviceRush · misc: holdMusic, lineCut,
paperRustle, hypeInflate, hypeEncourage, hypeDetonate, hypeDeflate,
landlordClaim, landlordSpread, landlordEvict.
