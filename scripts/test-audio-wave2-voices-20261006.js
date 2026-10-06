// test-audio-wave2-voices-20261006.js — wave-2 voice deepening proof (Steve 2026-10-06).
//
// Covers the 5 new wave-2 monster voices (understudy, landlord, heckler,
// paparazzo, union_rep) + the 3 NEWLY FIRED union hooks (unionBullhorn,
// unionWalkout, unionPicket — fired at game.js:19563/19571/19586, previously
// unmapped).
//
// Before/after freakiness analysis: an instrumented mock Web Audio records
// the node graph each synth builds (oscillator types, frequency schedules,
// gain envelopes, noise layers, modulation edges), then scores:
//   - layers: >= 3 distinct sound sources (osc/noise)
//   - dissonance: beating pair (<0.4 semitones), minor-2nd, or tritone
//   - sweep: >= 1.5x frequency span on a voice
//   - modulation: osc patched into another node's frequency/gain
//   - texture: noise source present
// Rubric (same as wave2c-freaky): layers >= 3 AND (dissonant OR modulation)
// AND (sweep OR modulation).
//
// Also asserts: dispatch keys resolve, every synth runs clean with arg
// shapes, and the Highbeam Deer synths are byte-identical to HEAD.
//
// Usage:
//   node scripts/test-audio-wave2-voices-20261006.js            # working tree
//   node scripts/test-audio-wave2-voices-20261006.js --before  # HEAD (before)
//   APP_SRC=/tmp/stage2/src/js/app.js node ...                 # staged copy
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP_SRC = process.env.APP_SRC || path.join(ROOT, 'src', 'js', 'app.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (from test-audio-wave2c-freaky.js) ----------
let nodeSeq = 0;
const nodes = [];
const edges = [];
function mockParam(node, pname, init) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v, t }); this._v = v; },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v, t }); this._v = v; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v, t }); this._v = v; },
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
    _id: kind + (++nodeSeq), _kind: kind, _started: false,
    connect(dest) { edges.push([this._id, paramDestId(dest), this._kind]); },
    disconnect() {},
    start() { this._started = true; },
    stop() {},
  };
  if (kind === 'osc') { n.frequency = mockParam(n, 'frequency', 440); n.detune = mockParam(n, 'detune', 0); n.type = 'sine'; }
  if (kind === 'gain') { n.gain = mockParam(n, 'gain', 0); }
  if (kind === 'filter') { n.frequency = mockParam(n, 'frequency', 1000); n.Q = mockParam(n, 'Q', 1); n.type = ''; }
  if (kind === 'noise') { n.buffer = null; n.loop = false; n.playbackRate = mockParam(n, 'playbackRate', 1); }
  if (kind === 'panner') { n.pan = mockParam(n, 'pan', 0); }
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
    createDynamicsCompressor() {
      const n = mockNode('comp');
      n.threshold = mockParam(n, 'threshold', 0); n.knee = mockParam(n, 'knee', 0);
      n.ratio = mockParam(n, 'ratio', 0); n.attack = mockParam(n, 'attack', 0);
      n.release = mockParam(n, 'release', 0); return n;
    },
    createWaveShaper() { return mockNode('shaper'); },
  };
}

// ---------- load CombatAudio from working tree or HEAD ----------
const BEFORE = process.argv.includes('--before');
let appSrc;
if (BEFORE) {
  appSrc = execSync('git show HEAD:src/js/app.js', { cwd: ROOT, encoding: 'utf8' });
} else if (process.env.APP_SRC) {
  console.log(`(verifying staged copy: ${process.env.APP_SRC})`);
  appSrc = fs.readFileSync(process.env.APP_SRC, 'utf8');
} else {
  appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
}
const start = appSrc.indexOf('const CombatAudio = (() => {');
ok(start >= 0, 'CombatAudio IIFE found' + (BEFORE ? ' (HEAD)' : ''));
const end = appSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
const Game = {};
Game.state = { village: { positions: {} }, scholar: {} };
eval(appSrc.slice(start, end) + '\n;globalThis.__CA = CombatAudio;');
const A = globalThis.__CA;
global.window = { AudioContext: MockAudioContext };
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } };
A.ensureAudio();
ok(A && typeof A === 'object', 'CombatAudio evaluated');

// ---------- analysis ----------
function baseFreq(osc) {
  const s = osc.frequency.events.find(e => e.op === 'set');
  return s ? s.v : osc.frequency.value;
}
function freqSpan(osc) {
  const vals = osc.frequency.events.filter(e => typeof e.v === 'number' && e.v > 0).map(e => e.v);
  if (!vals.length) return 1;
  return Math.max(...vals) / Math.min(...vals);
}
function analyze(name, arg) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { arg === undefined ? A[name]() : A[name](arg); } catch (e) { threw = e; }
  if (threw) return { name, threw };
  const oscs = nodes.filter(n => n._kind === 'osc');
  const noises = nodes.filter(n => n._kind === 'noise');
  const feedsParam = (id) => edges.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
  const isMod = (o) => {
    const outs = edges.filter(e => e[0] === o._id).map(e => e[1]);
    return outs.length > 0 && outs.every(d =>
      /\.(frequency|gain)$/.test(d) || (/^gain/.test(d.split('.')[0]) && feedsParam(d.split('.')[0])));
  };
  const voices = oscs.filter(o => !isMod(o));
  const layers = oscs.length + noises.length;
  const freqs = voices.map(baseFreq).filter(f => typeof f === 'number' && f > 0).sort((a, b) => a - b);
  let dissonant = false, dissonanceKind = null;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) {
    const st = 12 * Math.log2(freqs[j] / freqs[i]);
    const cls = Math.min(st % 12, 12 - (st % 12));
    if (cls < 0.4) { dissonant = true; dissonanceKind = `beating(${freqs[i].toFixed(1)}/${freqs[j].toFixed(1)})`; }
    else if (Math.abs(cls - 1) < 0.15) { dissonant = true; dissonanceKind = `minor2nd(${freqs[i].toFixed(1)}/${freqs[j].toFixed(1)})`; }
    else if (Math.abs(cls - 6) < 0.2) { dissonant = true; dissonanceKind = `tritone(${freqs[i].toFixed(1)}/${freqs[j].toFixed(1)})`; }
  }
  const sweep = voices.some(o => freqSpan(o) >= 1.5);
  const srcs = new Set();
  for (const [s] of edges) if (/^osc/.test(s)) srcs.add(s);
  const modulation = [...srcs].some(id => feedsParam(id) ||
    edges.some(e => e[0] === id && /^gain/.test(e[1].split('.')[0]) && feedsParam(e[1].split('.')[0])));
  const texture = noises.length > 0;
  return { name, threw, layers, oscs: oscs.length, noises: noises.length,
    dissonant, dissonanceKind, sweep, modulation, texture };
}

const NEW_HOOKS = ['unionBullhorn', 'unionWalkout', 'unionPicket',
  'understudyWatch', 'understudyRehearse', 'understudyPerform',
  'landlordSpread', 'landlordEvict',
  'hecklerHeadliner', 'hecklerJibe', 'paparazzoExclusive'];
const DEEPENED = ['unionRepChant', 'unionRepWhistle', 'understudyLearn', 'understudyCopy',
  'landlordStamp', 'landlordClaim', 'hecklerPileOn', 'paparazzoShutter', 'paparazzoFlash'];
const ALL = NEW_HOOKS.concat(DEEPENED);

console.log(`--- wave-2 voice analysis (${BEFORE ? 'BEFORE (HEAD)' : 'AFTER (working tree)'}) ---`);

// 1. dispatch keys resolve
for (const n of NEW_HOOKS) {
  ok(`${n} resolves to a dispatch key`, typeof A[n] === 'function');
}

// 2. every synth runs clean with arg shapes
for (const n of ALL) {
  if (typeof A[n] !== 'function') { ok(`${n} runs clean`, false, 'not a function'); continue; }
  let bad = null;
  for (const a of [undefined, {}, { prediction: 2 }]) {
    nodeSeq = 0; nodes.length = 0; edges.length = 0;
    try { a === undefined ? A[n]() : A[n](a); }
    catch (e) { bad = `${n}: ${e && e.message}`; break; }
  }
  ok(`${n} runs clean (no-arg, {}, {prediction})`, !bad, bad || '');
}

// 3. freakiness analysis + rubric
const results = {};
for (const n of ALL) {
  if (typeof A[n] !== 'function') continue;
  const arg = n === 'paparazzoShutter' ? { prediction: 2 }
    : n === 'hecklerJibe' ? { shame: 5 } : undefined;
  results[n] = analyze(n, arg);
}
for (const n of ALL) {
  const r = results[n];
  if (!r || r.threw) continue;
  console.log(`${n}: layers=${r.layers} (osc=${r.oscs},noise=${r.noises}) ` +
    `dissonant=${r.dissonant ? r.dissonanceKind : 'no'} sweep=${r.sweep} ` +
    `modulation=${r.modulation} texture=${r.texture}`);
}
if (!BEFORE) {
  for (const n of ALL) {
    const r = results[n];
    if (!r || r.threw) continue;
    const rubric = r.layers >= 3 && (r.dissonant || r.modulation) && (r.sweep || r.modulation);
    ok(`${n} passes freakiness rubric`, rubric,
      `layers=${r.layers} dissonant=${r.dissonant} sweep=${r.sweep} modulation=${r.modulation}`);
  }
}

// 4. deer benchmark untouched (AFTER only)
if (!BEFORE) {
  const headApp = execSync('git show HEAD:src/js/app.js', { cwd: ROOT, encoding: 'utf8' });
  const fnBody = (src, name) => {
    const i = src.indexOf(`function ${name}(`);
    if (i < 0) return null;
    let depth = 0, j = src.indexOf('{', i);
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
    }
    return null;
  };
  const fns = ['deerCall', 'beamCharge', 'beamFire', 'beamSweep', 'beamSweepStop', 'beamBlocked', 'deerSnort'];
  const changed = fns.filter(f => fnBody(headApp, f) !== fnBody(appSrc, f));
  ok('Highbeam Deer synths byte-identical to HEAD', changed.length === 0, changed.join(', '));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
