// test-audio-hooks-20261007.js — AUDIO RE-AUDIT + FREAKIER-SYNTH PROOF (Steve 2026-10-06).
//
// Follow-up to scripts/test-audio-hooks-20261006.js (201 pass / 1 fail — the
// 12 silent flyer hooks). A sibling has since registered the 12 flyer synths,
// so this run re-audits against the CURRENT worktree (read-only) and verifies
// three freakier synth proposals (modViolation, exileWalk, horrorSting) that
// are drop-in replacements in the CombatAudio IIFE — app.js is off-limits to
// this worker, so the proposals ship as verified code in this file + notes,
// not as landed edits.
//
// Node cannot play audio: an instrumented mock Web Audio graph records the
// node graph. A synth "verified" here = runs without throwing AND produces a
// layered sound graph (multiple started sources, multiple enveloped layers,
// phone-safe peak gains). Ears-on (Steve's phone) remains the final gate.
//
// Usage: node scripts/test-audio-hooks-20261007.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (mirrors the 2026-10-06 harness) ----------
let nodeSeq = 0;
let nodes = [];
let edges = [];
function mockParam(node, pname, init) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v, t }); },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v, t }); },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v, t }); },
    setTargetAtTime(v) { this.events.push({ op: 'tgt', v }); },
    cancelScheduledValues() {},
  };
  let _v = init;
  Object.defineProperty(p, 'value', {
    get() { return _v; },
    set(v) { p.events.push({ op: 'set', v, t: NaN }); _v = v; },
    enumerable: true,
  });
  return p;
}
function paramDestId(dest) {
  if (!dest || typeof dest !== 'object') return '?';
  const id = dest._id || (dest._node && dest._node._id);
  if (!id) return 'bus';
  return id + (dest._pname ? '.' + dest._pname : '');
}
function mockNode(kind) {
  const n = {
    _id: kind + (++nodeSeq), _kind: kind, _started: false, _stopped: false,
    connect(dest) { edges.push([this._id, paramDestId(dest), this._kind]); },
    disconnect() {},
    start() { this._started = true; },
    stop() { this._stopped = true; },
  };
  if (kind === 'osc') { n.frequency = mockParam(n, 'frequency', 440); n.detune = mockParam(n, 'detune', 0); n.type = 'sine'; }
  if (kind === 'gain') { n.gain = mockParam(n, 'gain', 0); }
  if (kind === 'filter') { n.frequency = mockParam(n, 'frequency', 1000); n.Q = mockParam(n, 'Q', 1); n.type = ''; }
  if (kind === 'noise') { n.buffer = null; n.loop = false; n.playbackRate = mockParam(n, 'playbackRate', 1); }
  if (kind === 'panner') { n.pan = mockParam(n, 'pan', 0); }
  if (kind === 'comp') { ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(k => { n[k] = mockParam(n, k, 0); }); }
  if (kind === 'shaper') { n.curve = null; n.oversample = 'none'; }
  nodes.push(n);
  return n;
}
function MockAudioContext() {
  return {
    sampleRate: 44100, currentTime: 100, state: 'running', destination: mockNode('destination'),
    resume() { return Promise.resolve(); },
    createBuffer(ch, len) { return { numberOfChannels: ch, length: len, getChannelData() { return new Float32Array(len); } }; },
    createBufferSource() { return mockNode('noise'); },
    createOscillator() { return mockNode('osc'); },
    createGain() { return mockNode('gain'); },
    createBiquadFilter() { return mockNode('filter'); },
    createStereoPanner() { return mockNode('panner'); },
    createDynamicsCompressor() { return mockNode('comp'); },
    createWaveShaper() { return mockNode('shaper'); },
  };
}
const sandbox = {
  window: { AudioContext: MockAudioContext },
  localStorage: { getItem() { return null; }, setItem() {} },
  document: { getElementById() { return null; }, createElement() { return { style: {}, classList: { remove() {}, add() {} }, offsetWidth: 0 }; }, body: { appendChild() {} } },
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  Float32Array, console, Math, JSON, Object, Array, Error, Number, String, Boolean,
  Promise, isNaN, parseInt, parseFloat, Infinity, NaN,
  Game: {},
};

// ---------- extract & evaluate the CombatAudio IIFE (read-only) ----------
const app = fs.readFileSync(APP, 'utf8');
const start = app.indexOf('const CombatAudio = (() => {');
ok('CombatAudio IIFE found in app.js', start >= 0);
const endMarker = '})();\n  Game.audio = CombatAudio;';
const end = app.indexOf(endMarker, start);
ok('IIFE end marker found', end > start);
const iifeSrc = app.slice(start, end + 5);
const names = Object.keys(sandbox);
const fn = new Function(...names, iifeSrc + '\nreturn CombatAudio;');
const audio = fn(...names.map(k => sandbox[k]));
ok('CombatAudio evaluated to an object', audio && typeof audio === 'object');
const registry = new Set(Object.keys(audio).filter(k => typeof audio[k] === 'function'));
ok('registry holds >= 200 synths (freak-layer era)', registry.size >= 200, `${registry.size} registered`);

function resetGraph() { nodes = []; edges = []; nodeSeq = 0; }
function graphStats() {
  const sources = nodes.filter(n => (n._kind === 'osc' || n._kind === 'noise') && n._started);
  const enveloped = nodes.filter(n => n._kind === 'gain' && n.gain.events.filter(e => e.op === 'exp' || e.op === 'lin').length >= 2).length;
  let peak = 0;
  for (const n of nodes) {
    if (n._kind !== 'gain') continue;
    for (const e of n.gain.events) {
      if ((e.op === 'exp' || e.op === 'lin') && typeof e.v === 'number' && e.v > 0.0002 && e.v > peak) peak = e.v;
    }
  }
  return { sources: sources.length, enveloped, totalNodes: nodes.length, peak };
}
// Control hooks are legitimately silent (stops, mute, accessors, DOM flash).
const CONTROL = new Set(['combatEnd', 'beamSweepStop', 'humStop', 'toggleMute', 'isMuted', 'ensureAudio', 'beamFlash']);

// ---------- Part A: unmapped-hook audit (fired across src/js, resolved in registry) ----------
function firedHooks() {
  const out = new Map();
  const jsDir = path.join(ROOT, 'src', 'js');
  for (const f of fs.readdirSync(jsDir).filter(x => x.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(jsDir, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/audioEvent\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) {
        if (!out.has(m[1])) out.set(m[1], []);
        out.get(m[1]).push(`${f}:${i + 1}`);
      }
      for (const m of ln.matchAll(/Game\.audio\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (!out.has(m[1])) out.set(m[1], []);
        out.get(m[1]).push(`direct:${f}:${i + 1}`);
      }
    });
  }
  return out;
}
const fired = firedHooks();
const unmapped = [...fired.keys()].filter(h => !registry.has(h));
{
  const detail = unmapped.map(h => `${h} (${fired.get(h).slice(0, 3).join(', ')})`).join('; ');
  ok('PART A — every fired hook resolves to a registered synth (no silent no-ops)',
    unmapped.length === 0,
    unmapped.length ? `SILENT NO-OP HOOKS: ${detail}` : `${fired.size} dispatch names checked, all mapped`);
}

// ---------- Part B: flyer regression (yesterday's P0 — must stay closed) ----------
const FLYERS = ['nevermoreCroak', 'nevermoreLand', 'nevermoreClimb', 'nevermoreStrafe',
  'nightcourtSilence', 'nightcourtLand', 'nightcourtClimb',
  'kiteHum', 'kiteBroadcast', 'kiteTransmit', 'kiteClimb', 'kiteMark'];
{
  const missing = FLYERS.filter(h => typeof audio[h] !== 'function');
  ok('PART B — all 12 flyer synths registered', missing.length === 0, missing.join(', '));
  const mute = [];
  for (const h of FLYERS) {
    if (typeof audio[h] !== 'function') continue;
    resetGraph();
    try { audio[h]({}); } catch (e) { mute.push(`${h} threw: ${e && e.message}`); continue; }
    const st = graphStats();
    if (st.sources === 0) mute.push(`${h}: zero started sources (silent again)`);
  }
  ok('PART B — all 12 flyer synths produce sound graphs', mute.length === 0, mute.join('; '));
}

// ---------- Part C: full-registry drive (no-throw + no silent non-controls) ----------
const argShapes = [{}, { round: 5 }, { cause: 'bulldozer' }, { quiet: true }, { fidelity: 0.8 },
  { pan: 0.3, heat: 0.6 }, { urgency: 1, pattern: 'burst' }, { stacks: 3 }, { turns: 2 },
  { charge: 0.5 }, { dur: 1.2 }, { beam: true, highbeam: true }, { violations: 3 }, { final: true },
  { shame: 7 }, { mood: 'watching' }];
const thrown = [], silent = [];
const baseline = {}; // per-synth source counts for the freakier-proposal comparison
for (const key of registry) {
  if (key === 'toggleMute' || key === 'isMuted' || key === 'ensureAudio') continue;
  resetGraph();
  if (key === 'beamSweep') { try { audio.beamSweepStop(); } catch (e) {} }
  let threw = null;
  for (const a of argShapes) {
    try { audio[key](a); } catch (e) { threw = e && e.message; break; }
  }
  if (threw) { thrown.push(`${key}: ${threw}`); continue; }
  if (CONTROL.has(key)) continue;
  const st = graphStats();
  baseline[key] = st.sources;
  if (st.sources === 0) silent.push(key);
}
try { audio.combatEnd(); } catch (e) {}
try { audio.toggleMute(); audio.toggleMute(); } catch (e) {} // restore mute state
ok('PART C — no registered synth throws headless', thrown.length === 0, thrown.join('; '));
ok('PART C — no non-control synth is silent', silent.length === 0, silent.join(', '));
ok('PART C — isMuted/ensureAudio accessors behave', typeof audio.isMuted() === 'boolean' && audio.ensureAudio() === true);

// ---------- Part D: freakier synth proposals (Steve: "freaky not generic") ----------
// Drop-in replacements for three existing synths, verified here against the
// mock graph. The real edits belong in the CombatAudio IIFE (app.js) —
// off-limits to this worker — so the verified code ships in
// evidence/2026-10-07/audio-notes.md as an insertion-ready patch.
// Each proposal takes (actx, bus, H) where H = {noise, thump} helpers.

function proposalEnv() {
  const actx = MockAudioContext();
  const bus = actx.createGain(); bus.connect(actx.destination);
  const H = {
    noise() { const n = actx.createBufferSource(); n.buffer = null; n.loop = true; return n; },
    thump(when, vol) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = 55;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
      o.connect(g); g.connect(bus); o.start(when); o.stop(when + 0.3);
    },
  };
  return { actx, bus, H };
}

// horrorSting v2 — THE STING THAT NOTICES YOU NOTICING.
// v1: two detuned saws rising. v2 adds: the wrong descent (three sines
// spiraling DOWN an octave while the sting rises — your ear can't tell which
// way is up), bitcrushed static gated at a non-musical 17.3Hz (the System
// doesn't keep time like you do), and a sub drop at the end — the flinch.
function horrorStingV2(actx, bus, H) {
  const t = actx.currentTime, dur = 1.8;
  [[110, 165], [155.56, 233]].forEach(([f0, f1]) => { // tritone pair, darker
    const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(750, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur);
  });
  [220, 440, 880].forEach((f0, i) => { // the wrong descent
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 / 2, t + dur);
    const a0 = t + i * 0.25;
    g.gain.setValueAtTime(0.0001, a0);
    g.gain.exponentialRampToValueAtTime(0.06, a0 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(a0); o.stop(t + dur);
  });
  const nz = H.noise(), nf = actx.createBiquadFilter(), ng = actx.createGain();
  nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 2;
  const gate = actx.createOscillator(), gg = actx.createGain();
  gate.type = 'square'; gate.frequency.value = 17.3; gg.gain.value = 0.5;
  gate.connect(gg); gg.connect(ng.gain);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.12, t + 0.5);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); // cut dead
  nz.connect(nf); nf.connect(ng); ng.connect(bus);
  nz.start(t); nz.stop(t + 1.6); gate.start(t); gate.stop(t + 1.6);
  const s = actx.createOscillator(), sg = actx.createGain(); // the flinch
  s.type = 'sine';
  s.frequency.setValueAtTime(64, t + 1.3);
  s.frequency.exponentialRampToValueAtTime(27, t + 1.8);
  sg.gain.setValueAtTime(0.0001, t + 1.3);
  sg.gain.exponentialRampToValueAtTime(0.22, t + 1.42);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
  s.connect(sg); sg.connect(bus);
  s.start(t + 1.3); s.stop(t + 1.95);
}

// modViolation v2 — THE FLAG, angrier.
// v1: two saw buzzes + thump. v2 adds: WaveShaper bitcrush on the buzzes,
// a detuned fifth sliding up a semitone between buzzes (the second buzz
// knows more about you), a 31Hz AM stutter (prime — alien throat-clearing),
// and a paper-tear static sweep down before the stamp.
function modViolationV2(actx, bus, H, d) {
  const t = actx.currentTime;
  const v = Math.min(8, Math.max(0, (d && d.violations) || 1));
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(3 * x); }
  [0, 0.28].forEach((dt, i) => {
    const bb = actx.createGain(); bb.connect(bus);
    const f0 = 110 + v * 14 + i * 22; // violations scale kept (API stable)
    [[f0, 1], [f0 * 1.5, 1.0595]].forEach(([fq, slide]) => {
      const o = actx.createOscillator(), g = actx.createGain(), ws = actx.createWaveShaper();
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
    const am = actx.createOscillator(), amg = actx.createGain();
    am.type = 'square'; am.frequency.value = 31; amg.gain.value = 0.6;
    am.connect(amg); amg.connect(bb.gain);
    am.start(t + dt); am.stop(t + dt + 0.28);
  });
  const nz = H.noise(), nf = actx.createBiquadFilter(), ng = actx.createGain();
  nf.type = 'highpass';
  nf.frequency.setValueAtTime(6000, t + 0.5);
  nf.frequency.exponentialRampToValueAtTime(800, t + 0.75);
  ng.gain.setValueAtTime(0.0001, t + 0.5);
  ng.gain.exponentialRampToValueAtTime(0.1, t + 0.58);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  nz.connect(nf); nf.connect(ng); ng.connect(bus);
  nz.start(t + 0.5); nz.stop(t + 0.85);
  H.thump(t + 0.8, 0.5); // the stamp (kept)
}

// exileWalk v2 — THE WALK, lonelier.
// v1: village hum thinning + 6 footsteps. v2 adds: each hum voice goes FLAT
// as it drops (the village forgets the note), an irregular limping gait with
// gravel crunch under every step, a lone wandering wind that arrives after
// the voices are gone, and one distant bell partial that rings once and
// never resolves.
function exileWalkV2(actx, bus, H) {
  const t = actx.currentTime;
  [130, 131.2, 138.5, 140].forEach((fq, i) => {
    const v = actx.createOscillator(), vg = actx.createGain();
    v.type = 'triangle';
    const stopAt = t + 0.6 + i * 0.7;
    v.frequency.setValueAtTime(fq, t);
    v.frequency.exponentialRampToValueAtTime(fq * 0.94, stopAt); // goes flat, then gone
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
    vg.gain.setValueAtTime(0.07, stopAt - 0.15);
    vg.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    v.connect(vg); vg.connect(bus); v.start(t); v.stop(stopAt + 0.05);
  });
  const gait = [0.55, 0.62, 0.51, 0.58, 0.66, 0.55]; // a limp, not a march
  let dt = t + 0.3;
  gait.forEach((step, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, dt);
    o.frequency.exponentialRampToValueAtTime(55, dt + 0.12);
    f.type = 'lowpass'; f.frequency.value = 900 - i * 120;
    g.gain.setValueAtTime(0.2 - i * 0.028, dt);
    g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
    o.connect(f); f.connect(g); g.connect(bus); o.start(dt); o.stop(dt + 0.2);
    const nz = H.noise(), nf = actx.createBiquadFilter(), ng = actx.createGain();
    nf.type = 'highpass'; nf.frequency.value = 2500;
    ng.gain.setValueAtTime(Math.max(0.012, 0.05 - i * 0.006), dt);
    ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
    nz.connect(nf); nf.connect(ng); ng.connect(bus);
    nz.start(dt); nz.stop(dt + 0.1);
    dt += step;
  });
  [196, 196.9].forEach(fq => { // the lone wind, arriving late
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = fq;
    const lfo = actx.createOscillator(), lg = actx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.07; lg.gain.value = 1.2;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.035, t + 2.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    o.connect(g); g.connect(bus);
    o.start(t + 1.5); o.stop(t + 5.6); lfo.start(t + 1.5); lfo.stop(t + 5.6);
  });
  const lastDrop = t + 0.6 + 3 * 0.7; // the bell that doesn't resolve
  [[660, 0.05], [1320, 0.018]].forEach(([fq, peak]) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = fq;
    g.gain.setValueAtTime(0.0001, lastDrop);
    g.gain.exponentialRampToValueAtTime(peak, lastDrop + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, lastDrop + 2.6);
    o.connect(g); g.connect(bus);
    o.start(lastDrop); o.stop(lastDrop + 2.7);
  });
}

const PROPOSALS = [
  ['horrorSting', horrorStingV2, []],
  ['modViolation', modViolationV2, [{ violations: 3 }]],
  ['exileWalk', exileWalkV2, []],
];
for (const [current, v2, args] of PROPOSALS) {
  resetGraph();
  // proposalEnv created AFTER resetGraph so its nodes land in the fresh log.
  const env2 = proposalEnv();
  let threw = null;
  try { v2(env2.actx, env2.bus, env2.H, ...args); } catch (e) { threw = e && e.message; }
  ok(`PART D — ${current} v2 runs without throwing`, threw === null, threw);
  if (threw) continue;
  const st = graphStats();
  ok(`PART D — ${current} v2 is layered (>=6 sources, >=4 enveloped layers)`,
    st.sources >= 6 && st.enveloped >= 4,
    `${st.sources} sources, ${st.enveloped} enveloped layers, ${st.totalNodes} nodes`);
  // Compare against the SHIPPED v1 driven once with the same args
  // (baseline[] in Part C is cumulative across arg shapes — not comparable).
  resetGraph();
  let v1threw = null, v1sources = 0;
  try { audio[current](...args); v1sources = graphStats().sources; }
  catch (e) { v1threw = e && e.message; }
  ok(`PART D — ${current} v2 is more layered than the shipped v1`,
    v1threw === null && st.sources > v1sources,
    v1threw ? `shipped v1 threw: ${v1threw}` : `v2=${st.sources} sources vs shipped=${v1sources}`);
  ok(`PART D — ${current} v2 is phone-safe (peak gain <= 0.55, shipped thump level)`,
    st.peak <= 0.55, `peak=${st.peak.toFixed(3)}`);
}

// ---------- summary ----------
console.log(`\nREGISTRY SIZE: ${registry.size} | FIRED HOOKS: ${fired.size} | UNMAPPED: ${unmapped.length}`);
console.log(`${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
