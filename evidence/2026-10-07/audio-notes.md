# Audio hook audit + freakier synths — 2026-10-07

Worker: flesh-out loop, queue item 8. `node scripts/test-audio-hooks-20261007.js` → **22 pass, 0 fail**.

## Constraint that shaped this run

The task named `src/js/audio.js` as the editable file. **That file does not exist.**
All audio — the entire `CombatAudio` IIFE (195→207 registered synths) — lives in
`src/js/app.js` (~line 1730 `const CombatAudio = (() => {`, exposed at ~9321
`Game.audio = CombatAudio;`). `src/js/app.js` was off-limits to this worker, so
**no shipped synth was modified**. Everything below is read-only audit +
verified-but-unlanded proposal code. Landing the three freakier synths needs a
follow-up worker with `src/js/app.js` in its allowed files — the patch is
insertion-ready in §3.

## Audit findings (read-only, current worktree @ a6bc451)

- **Yesterday's P0 is closed.** The 12 silent flyer hooks (nevermore×4,
  nightcourt×3, statickite×5) reported mute in `evidence/2026-10-06/audio-hook-map-20261006.md`
  are now registered — a sibling landed them with already-freaky designs
  (beak-hammer percussion + detuned corvid croak; negative-space hush with
  sub-bass; detuned kite-string whine + radio-static bursts). Part B of the new
  test pins all 12: registered, driven, sound graphs produced.
- **Unmapped hooks: 0.** Scanned every `audioEvent('x')` / `Game.audio.x` /
  `resolveAudio('x')` dispatch across all of `src/js` (169 dispatch names)
  against the 207-function CombatAudio registry — every fired hook resolves.
  (The sibling's 2026-10-06 test additionally walks `src/data/monsters.json`
  `(notice|aggro|declare|resolve|death)Audio` fields and passed 214/214 today,
  so data-driven hooks are covered too.)
- **Full-registry drive: green.** All 207 synths driven headless with 16 arg
  shapes — zero throws, zero silent non-control synths. Nothing regressed on
  the hot tree since yesterday's run.
- Wave-1 (boar, wolf, heron, turtle, stag, ducks, catfish, lockpick, moth,
  snake) and wave-2 (heckler, union_rep, paparazzo, understudy, moderator,
  flyers) attack arcs all have mapped, sounding hooks.
- `src/data/monsters.json` (HEAD) is a 28-monster list with no audio-hook
  fields — no data-side hooks to audit there.

## The three freakier synths (verified, unlanded)

Each was chosen as a high-traffic beat where the shipped version reads
"competent but generic" on a phone speaker. Verified headless in the test:
no-throw, ≥6 started sources, ≥4 enveloped layers, strictly more layered than
the shipped v1, peak gain ≤ 0.55 (shipped thump level — no clipping risk).

Caller API is unchanged in all three (same names, same params), so no dispatch
site needs touching — pure drop-in inside the CombatAudio IIFE.

### 1. horrorSting v2 — "the sting that notices you noticing"
v1: two detuned saws rising. v2 adds: a tritone pair (darker than v1's minor
2nd); **the wrong descent** — three sines spiraling DOWN an octave while the
sting rises, so the ear can't tell which way is up; static gated by a square
LFO at **17.3 Hz** (a non-musical rate — the System doesn't keep time like you
do); and a sub drop at t+1.3 — the flinch. 2→8 sources.
Anchor: replace `function horrorSting()` at app.js:8599.

### 2. modViolation v2 — "the flag, angrier"
v1: two saw buzzes + thump. v2 adds: WaveShaper bitcrush on the buzzes; a
detuned fifth that slides UP a semitone between buzzes (the second buzz knows
more about you); a **31 Hz AM stutter** (prime — alien throat-clearing); and a
paper-tear static sweep DOWN before the stamp. Violation-count pitch scaling
kept (API stable). 5→8 sources.
Anchor: replace `function modViolation(d)` at app.js:4621.

### 3. exileWalk v2 — "the walk, lonelier"
v1: village hum thinning + 6 even footsteps. v2 adds: each hum voice goes
**flat** as it drops (the village forgets the note); an irregular limping gait
with gravel crunch under every step; a lone wandering wind (detuned pair, slow
pitch-wander LFO) that arrives only after the voices are gone; and one distant
bell partial (660 Hz) that rings once when the last voice drops and never
resolves. 10→22 sources.
Anchor: replace `function exileWalk()` at app.js:7133.

### Drop-in patch (uses the IIFE's closure helpers: ensure/ctx/sfxBus/noise/thump)

```js
    function horrorSting() {
      // THE STING THAT NOTICES YOU NOTICING (Steve 2026-10-07): tritone pair
      // rising, never arriving — under it, three sines spiral DOWN an octave
      // (your ear can't tell which way is up). Static gated at 17.3Hz — the
      // System doesn't keep time like you do — then a sub drop: the flinch.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.8;
      [[110, 165], [155.56, 233]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(320, t);
        f.frequency.exponentialRampToValueAtTime(750, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur);
      });
      [220, 440, 880].forEach((f0, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 / 2, t + dur);
        const a0 = t + i * 0.25;
        g.gain.setValueAtTime(0.0001, a0);
        g.gain.exponentialRampToValueAtTime(0.06, a0 + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(a0); o.stop(t + dur);
      });
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 2;
        const gate = ctx.createOscillator(), gg = ctx.createGain();
        gate.type = 'square'; gate.frequency.value = 17.3; gg.gain.value = 0.5;
        gate.connect(gg); gg.connect(ng.gain);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.12, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 1.6); gate.start(t); gate.stop(t + 1.6);
      }
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine';
      s.frequency.setValueAtTime(64, t + 1.3);
      s.frequency.exponentialRampToValueAtTime(27, t + 1.8);
      sg.gain.setValueAtTime(0.0001, t + 1.3);
      sg.gain.exponentialRampToValueAtTime(0.22, t + 1.42);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      s.connect(sg); sg.connect(sfxBus);
      s.start(t + 1.3); s.stop(t + 1.95);
    }
```

```js
    function modViolation(d) {
      // THE FLAG, ANGRIER (Steve 2026-10-07): bitcrushed buzzes, a detuned
      // fifth sliding up a semitone between buzzes (the second buzz knows
      // more about you), a 31Hz AM stutter — prime, alien throat-clearing —
      // and a paper-tear static sweep down before the stamp lands.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const v = Math.min(8, Math.max(0, (d && d.violations) || 1));
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(3 * x); }
      [0, 0.28].forEach((dt, i) => {
        const bb = ctx.createGain(); bb.connect(sfxBus);
        const f0 = 110 + v * 14 + i * 22;
        [[f0, 1], [f0 * 1.5, 1.0595]].forEach(([fq, slide]) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), ws = ctx.createWaveShaper();
          ws.curve = curve; ws.oversample = '2x';
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(fq, t + dt);
          o.frequency.exponentialRampToValueAtTime(fq * slide, t + dt + 0.22);
          o.connect(ws); ws.connect(g); g.connect(bb);
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(0.08, t + dt + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.24);
          o.start(t + dt); o.stop(t + dt + 0.28);
        });
        const am = ctx.createOscillator(), amg = ctx.createGain();
        am.type = 'square'; am.frequency.value = 31; amg.gain.value = 0.6;
        am.connect(amg); amg.connect(bb.gain);
        am.start(t + dt); am.stop(t + dt + 0.28);
      });
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass';
        nf.frequency.setValueAtTime(6000, t + 0.5);
        nf.frequency.exponentialRampToValueAtTime(800, t + 0.75);
        ng.gain.setValueAtTime(0.0001, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.1, t + 0.58);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.5); nz.stop(t + 0.85);
      }
      thump(t + 0.8, 0.5);
    }
```

```js
    function exileWalk() {
      // THE WALK, LONELIER (Steve 2026-10-07): each hum voice goes flat as it
      // drops — the village forgets the note. A limping gait with gravel
      // under every step. A lone wandering wind arrives after the voices are
      // gone. One distant bell partial rings once and never resolves.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [130, 131.2, 138.5, 140].forEach((fq, i) => {
        const v = ctx.createOscillator(), vg = ctx.createGain();
        v.type = 'triangle';
        const stopAt = t + 0.6 + i * 0.7;
        v.frequency.setValueAtTime(fq, t);
        v.frequency.exponentialRampToValueAtTime(fq * 0.94, stopAt);
        vg.gain.setValueAtTime(0.0001, t);
        vg.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
        vg.gain.setValueAtTime(0.07, stopAt - 0.15);
        vg.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        v.connect(vg); vg.connect(sfxBus); v.start(t); v.stop(stopAt + 0.05);
      });
      const gait = [0.55, 0.62, 0.51, 0.58, 0.66, 0.55];
      let dt = t + 0.3;
      gait.forEach((step, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, dt);
        o.frequency.exponentialRampToValueAtTime(55, dt + 0.12);
        f.type = 'lowpass'; f.frequency.value = 900 - i * 120;
        g.gain.setValueAtTime(0.2 - i * 0.028, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        o.connect(f); f.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.2);
        const nz2 = noise(0.08), nf2 = ctx.createBiquadFilter(), ng2 = ctx.createGain();
        if (nz2) {
          nf2.type = 'highpass'; nf2.frequency.value = 2500;
          ng2.gain.setValueAtTime(Math.max(0.012, 0.05 - i * 0.006), dt);
          ng2.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
          nz2.connect(nf2); nf2.connect(ng2); ng2.connect(sfxBus);
          nz2.start(dt); nz2.stop(dt + 0.1);
        }
        dt += step;
      });
      [196, 196.9].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 0.07; lg.gain.value = 1.2;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t + 1.5);
        g.gain.exponentialRampToValueAtTime(0.035, t + 2.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
        o.connect(g); g.connect(sfxBus);
        o.start(t + 1.5); o.stop(t + 5.6); lfo.start(t + 1.5); lfo.stop(t + 5.6);
      });
      const lastDrop = t + 0.6 + 3 * 0.7;
      [[660, 0.05], [1320, 0.018]].forEach(([fq, peak]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, lastDrop);
        g.gain.exponentialRampToValueAtTime(peak, lastDrop + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, lastDrop + 2.6);
        o.connect(g); g.connect(sfxBus);
        o.start(lastDrop); o.stop(lastDrop + 2.7);
      });
    }
```

## Feel judgment (would these read alien/wrong/freaky on a phone speaker?)

Honest assessment, no ears-on possible headless:

- **horrorSting v2** — the strongest of the three for phone speakers. Phone
  speakers murder sub-bass, but the wrongness here lives in the midrange: the
  Shepard-style descent-against-ascent is perceptible even on tiny drivers,
  and the 17.3 Hz gate reads as an unnatural judder rather than a rhythm. The
  sub drop is a bonus on real speakers. High confidence this reads "wrong."
- **modViolation v2** — the WaveShaper bitcrush is the riskiest layer on a
  phone: cheap drivers already distort, so intentional crush can blur into
  generic harshness. The 31 Hz AM stutter and the paper-tear sweep carry the
  freakiness in the mids/highs, which is where the phone lives. Medium-high
  confidence; worth Steve's ears-on.
- **exileWalk v2** — the flattening voices and the limping gait are the most
  *narrative* layers, but also the subtlest: a 6% pitch sag and irregular
  footstep timing are felt more than heard. The gravel crunch and the lone
  unresolved bell do the most work on a phone. Medium confidence — it deepens
  the beat rather than transforming it.
- The already-landed flyer synths (sibling's) are the freakiest material in
  the registry by design: beak-hammer percussion, deliberate silence-as-telegraph,
  dead-television static. Nothing proposed here needs to out-freak those.

## Blocked items (report, don't touch)

1. **Landing the v2 synths** — needs `src/js/app.js` edit permission
   (off-limits to this worker). Patch above is ready; the proof test already
   verifies the exact code against the mock graph.
2. **Knowledge-reveal cue (sibling's P1)** — still silent. Needs dispatch
   calls in `src/js/game.js` (game.js:3155 ★ Learned, :9944 traded knowledge,
   :10000 knowledge combines, :13423 deeper knowledge). game.js is dirty AND
   off-limits — a content worker owning game.js should add
   `Game.audioEvent('knowledgeReveal', ...)` at those four sites; the synth
   itself can be registered alongside the v2 landing.
3. **truth.js / convo-*.js audio** — those systems fire zero audioEvents; adding
   beats needs dispatch sites in files owned by other workers.
4. **Dead-synth cleanup (sibling's P2)** — understudyLearn, landlordStamp,
   paparazzoFlash, unionRepChant, managerAnnounce, ducksRejoin, contractBind,
   delegateDebrief remain registered-but-unfired; wire-or-delete needs app.js.
5. `node --check` on `src/js/audio.js` was N/A — the file doesn't exist
   (verified: `ls src/js/` has no audio.js). The real audio file,
   `src/js/app.js`, was not syntax-checked by this worker beyond the IIFE
   extraction + evaluation the tests perform (which passed).

## Files

- `scripts/test-audio-hooks-20261007.js` — proof test, 22 pass / 0 fail.
- `evidence/2026-10-07/audio-notes.md` — this file (audit + patch + blockers).
