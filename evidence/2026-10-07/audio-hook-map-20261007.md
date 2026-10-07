# Audio hook map — 2026-10-07 (dead-synth cleanup + wound temperaments)

Worker: flesh-out loop, queue item 8. Proof: `node scripts/test-audio-20261007.js` (see §5).

Source commit for audit: `291ab71` (worktree). Changes committed as `AUDIO-20261007` (private index, no push).

## 1. Registry state after this run

- CombatAudio registry: **201 keys** (was 207) — 9 dead removed, 3 wound-temperament added.
- Thin-synth layer scan (every registry key driven headless, sources counted):
  only legitimately-silent controls are thin — `beamSweepStop`, `combatEnd`,
  `humStop`. **Zero generic single-blip synths.** Zero throws.
- All 31 `monsters.json` encounter audio fields resolve. All `contests.js`
  audioMap names resolve. `horrorSting` fired from contests.js + app.js:114.
  `patternWindup`/`patternResolve` kept as public sibling API (documented in
  return block). `deerCall` kept (internal voice, reached via wrappers).

## 2. Dead synths removed (9)

All verified at HEAD: registered in the CombatAudio return block, but **zero
dispatch sites** anywhere (`audioEvent('x')` literals, `Game.audio.x` calls,
`resolveAudio`, monsters.json encounter fields, contests.js audioMaps —
searched across `src/js/`, `src/data/`, `index.html`). Inner functions had
exactly def + return-entry references. Designs preserved here so a future
worker can revive + wire any of them from git history:

| synth | design (one line) | why it died |
|---|---|---|
| `understudyLearn` | echo that corrects itself: sure tone → two detuned "searching" throats with pitch-hunting LFO → locked tone + high shimmer. You hear it figure you out. | understudy fires watch/rehearse/copy/perform; no "learn" beat was ever wired |
| `landlordStamp` | heavy thud → paper slide → rubber squeak: two detuned saws beating through a bandpass. Officialdom has a sound, and it is unpleasant. | landlord fires claim/spread/evict; no stamp beat wired |
| `paparazzoFlash` | white burst aimed at YOU + afterimage whine (two thin beating tones, slow flutter) + low thump: you have been seen | paparazzo fires shutter/exclusive; flash never wired |
| `unionRepChant` | picket line finding its beat: three detuned throats over a pitch-dropping sub stomp, fourth pulse lands harder, crowd swells | union_rep fires bullhorn/whistle/walkout/picket; chant never wired |
| `managerAnnounce` | MEETING CALLED TO ORDER: intercom crackle, horn doubled a minor 2nd apart, fluorescent buzz, three paper slaps | nothing fires it (game.js comment claiming data fires it is stale — no monster has it) |
| `ducksRejoin` | tail thrashes back into line: three relieved hisses falling into rhythm, lockstep resumes | ducks formation fires quack/cut/lineUp/march/nip/regroup/screech; rejoin never wired |
| `contractBind` | fine print crawling, accelerating into a heavy STAMP. Paper becomes law becomes weight. | no contract_golem in monsters.json; hook-contract comment claiming it was "wired" was stale |
| `delegateAnnounce` | (shim → managerAnnounce) | never fired |
| `delegateCharge` | (shim → managerCharge) | never fired |

Also fixed: middle-manager return comment ("Middle Manager fires delegate*
names" was false — game.js fires manager* names directly; only
`delegateCircle` is fired, game.js:19087), and the `delegateDebrief`
hook-contract note (actually fired at game.js:19032, not "tbFifoBreather").

## 3. Wound temperaments — NEW unmapped family found + closed

`src/js/encounters.js:2099` fires `'wound' + temperament` on wound-state
shifts (enraged/cunning/desperate) — **the registry had no entries, so every
temperament shift played mute**. Three synths added in app.js (registry-side
only; the encounters.js emitter already existed, no sibling edit needed):

- `woundEnraged` — BLEEDING and it likes it: accelerating low pounding
  (0.3s→0.12s gaps) + two saws a tritone apart climbing together + wet
  tearing noise ripping upward through a bandpass.
- `woundCunning` — goes quiet and clever: near-silence hush, then six
  perfectly-even dry ticks (something counting), under a low watchful tone
  with a slow 0.5Hz scanning LFO that never settles.
- `woundDesperate` — hurt bad and knows it: five erratic detuned stabs at
  irregular gaps over a failing-engine sputter (65Hz saw choking on 29Hz
  square AM — prime, arrhythmic), ending on a gasp that gets cut off.

All synthesis-only, bounded sources (≤14), peak gains ≤0.28 — phone-safe.

## 4. Still unmapped / still mute (emitters live in sibling files — NOT this worker's island)

These are registry-side **gaps**, not dead code. A future worker with
game.js/truth.js/convo-*.js access needs to add the emitters; the synths
already exist where noted:

1. **Knowledge reveals** (the game's core progression beat is SILENT):
   `game.js:3155` (★ Learned: plant), `game.js:9944` (TRADED KNOWLEDGE),
   `game.js:10000` (KNOWLEDGE COMBINES), `game.js:13423` (Deeper knowledge) —
   no `audioEvent` within ±12 lines. No `knowledgeReveal` synth exists yet
   either. **Needs: new synth + 4 dispatch sites** (game.js worker).
2. **truth.js fires zero audioEvents** — the whole social-deduction system
   is mute. `justiceVerdict`/`confront` synths exist and are wired for the
   moot path only; confrontation/revelation/mood-shift beats in truth.js
   have no emitters. **Needs: dispatch sites** (truth.js worker).
3. **convo-*.js (convo-beats, convo-dialogue, convo-mood, convo-wants,
   convoTopics), examine.js, codex-people.js** fire zero audioEvents.
   **Needs: dispatch sites** (conversation worker).
4. game.js:22479 comment still names `(managerAnnounce)` as if data fires
   it — stale after this cleanup. **Needs: comment fix** (game.js worker).
   Also `managerAnnounce`'s design is preserved in §2 if a manager announce
   beat ever gets wired.

## 5. Proof test

`scripts/test-audio-20261007.js` (node, no jest needed):
- (a) every registered synth def is well-formed: inner function exists,
  calls `ensure()` gate, starts ≥1 source, peak gain ≤ 0.6;
- (b) hook map matches registry: every `audioEvent('x')` literal,
  `Game.audio.x` call, monsters.json encounter field, and contests.js
  audioMap name resolves in the registry; every registry key is either
  fired, pattern-dispatched, control, documented sibling API, or internal;
  asserts the 9 removed names are gone and the 3 wound names exist;
- (c) drives every registry key through the instrumented WebAudio mock
  with 9 arg shapes — no throws, no silent non-control synths.
