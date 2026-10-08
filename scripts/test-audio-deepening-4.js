// test-audio-deepening-4.js (Steve 2026-10-06) — structural verification for the
// audio-deepening run: wave-2 synths (swarm trio, droneCorrect, mothFlash,
// projectorPull/Break), beasts (stagConfused, wolfSilence, heronStatic,
// lockpickChitter, turtleSnap/Bunker, boarCharge, snakeSplit, catfish
// Snap/Lure, toadSwell, eurekaSpent/Disperse), drama (contestSpared,
// hypeDeflate), the new animalButcher hook, and the two param-mismatch fixes
// (swarmShutters {urgency}, holdMusic {broken}/{watching}).
//
// Node can't play audio, so this is the established listening-analysis
// pattern (see test-audio-wave2c-freaky.js): an instrumented mock Web Audio
// records the node graph each synth builds, then scores freakiness markers:
//   layers      >= 3 distinct sources (osc/noise)
//   dissonance  a beating pair (<0.4 semitones), minor 2nd, or tritone
//   sweep       a voice sweeping >= 1.5x in frequency
//   modulation  an oscillator patched into another node's frequency/gain
//   texture     a noise source present
// Each deepened synth must satisfy: layers>=3 AND (dissonance OR modulation)
// AND (sweep OR modulation).
// Plus param-behavior checks: holdMusic honors broken/watching without
// throwing. (swarmShutters/swarmScatter were dead synths — registered, zero
// call sites — deleted from app.js by the break-it audio run 2026-10-08;
// their entries are dropped here so this historical proof script stays green.)
// Usage: node scripts/test-audio-deepening-4.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio ----------
let nodeSeq = 0, nodes = [], edges = [];
function mockParam(node, pname) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v }); },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v }); },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v }); },
    setTargetAtTime(v) { this.events.push({ op: 'tgt', v }); },
  };
  let _v = 0;
  Object.defineProperty(p, 'value', {
    get() { return _v; },
    set(v) { p.events.push({ op: 'set', v }); _v = v; },
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
    _id: kind + (++nodeSeq), _kind: kind,
    connect(dest) { edges.push([this._id, paramDestId(dest)]); },
    disconnect() {}, start() {}, stop() {},
  };
  if (kind === 'osc') { n.frequency = mockParam(n, 'frequency', 440); n.type = 'sine'; }
  if (kind === 'gain') { n.gain = mockParam(n, 'gain', 0); }
  if (kind === 'filter') { n.frequency = mockParam(n, 'frequency', 1000); n.Q = mockParam(n, 'Q', 1); n.type = ''; }
  if (kind === 'noise') { n.buffer = null; n.loop = false; }
  if (kind === 'panner') { n.pan = mockParam(n, 'pan', 0); }
  if (kind === 'comp') {
    for (const pn of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[pn] = mockParam(n, pn, 0);
  }
  nodes.push(n);
  return n;
}
class FakeCtx {
  constructor() { this.currentTime = 100; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
  resume() { return Promise.resolve(); }
  createBuffer(ch, len, rate) { return { getChannelData() { return new Float32Array(len); } }; }
  createBufferSource() { return mockNode('noise'); }
  createOscillator() { return mockNode('osc'); }
  createGain() { return mockNode('gain'); }
  createBiquadFilter() { return mockNode('filter'); }
  createDynamicsCompressor() { return mockNode('comp'); }
  createStereoPanner() { return mockNode('panner'); }
}

const appSrc = fs.readFileSync(path.join(REPO, 'src/js/app.js'), 'utf8');
const start = appSrc.indexOf('const CombatAudio = (() => {');
const end = appSrc.indexOf('Game.audio = CombatAudio;');
const sandbox = {
  console, Math, JSON, Object, Array, Float32Array, Number, String, Boolean, Promise,
  Error, isNaN, parseInt, parseFloat, Infinity, NaN,
  window: { AudioContext: FakeCtx },
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: () => null, createElement: () => ({ style: {} }), body: {} },
  setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
  Game: {},
};
vm.createContext(sandbox);
vm.runInContext(appSrc.slice(start, end) + '\nGame.audio = CombatAudio;', sandbox, { filename: 'audio-iife.js' });
const A = sandbox.Game.audio;
A.ensureAudio();

// ---------- analysis ----------
function baseFreq(osc) {
  const s = osc.frequency.events.find(e => e.op === 'set' && e.v > 0);
  return s ? s.v : 0;
}
function freqSpan(osc) {
  const vals = osc.frequency.events.filter(e => e.v > 0).map(e => e.v);
  if (!vals.length) return 1;
  return Math.max(...vals) / Math.min(...vals);
}
function analyze(name, args) {
  nodeSeq = 0; nodes = []; edges = [];
  let threw = null;
  try { A[name](...(args || [])); } catch (e) { threw = e; }
  const oscs = nodes.filter(n => n._kind === 'osc');
  const noises = nodes.filter(n => n._kind === 'noise');
  const feedsParam = (id) => edges.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
  const feedsGainFeedingParam = (id) => edges.some(e => {
    const mid = e[1].split('.')[0];
    return e[0] === id && /^gain/.test(mid) && feedsParam(mid);
  });
  const isMod = (o) => {
    const outs = edges.filter(e => e[0] === o._id).map(e => e[1]);
    return outs.length > 0 && outs.every(d => /\.(frequency|gain)$/.test(d) ||
      (/^gain/.test(d.split('.')[0]) && feedsParam(d.split('.')[0])));
  };
  const voices = oscs.filter(o => !isMod(o));
  const layers = oscs.length + noises.length;
  const freqs = voices.map(baseFreq).filter(f => f > 0).sort((a, b) => a - b);
  let dissonant = false, dissonanceKind = null;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) {
    const st = (12 * Math.log2(freqs[j] / freqs[i])) % 12;
    const cls = Math.min(st, 12 - st);
    if (cls < 0.4) { dissonant = true; dissonanceKind = `beating(${freqs[i].toFixed(1)}/${freqs[j].toFixed(1)})`; }
    else if (Math.abs(cls - 1) < 0.15) { dissonant = true; dissonanceKind = `minor2nd(${freqs[i].toFixed(1)}/${freqs[j].toFixed(1)})`; }
    else if (Math.abs(cls - 6) < 0.2) { dissonant = true; dissonanceKind = `tritone(${freqs[i].toFixed(1)}/${freqs[j].toFixed(1)})`; }
  }
  const sweep = voices.some(o => freqSpan(o) >= 1.5);
  const srcs = new Set(edges.filter(([s]) => /^osc/.test(s)).map(([s]) => s));
  const modulation = [...srcs].some(id => feedsParam(id) || feedsGainFeedingParam(id));
  return { name, threw, layers, oscs: oscs.length, noises: noises.length, dissonant, dissonanceKind, sweep, modulation };
}

const DEEPENED = {
  // name -> representative args
  swarmEscalate: [[]],
  droneCorrect: [[]],
  mothFlash: [[]],
  projectorPull: [[]],
  projectorBreak: [[]],
  stagConfused: [[]],
  wolfSilence: [[]],
  heronStatic: [[]],
  lockpickChitter: [[]],
  turtleSnap: [[]],
  turtleBunker: [[]],
  boarCharge: [[]],
  snakeSplit: [[]],
  catfishSnap: [[]],
  catfishLure: [[]],
  toadSwell: [[]],
  eurekaSpent: [[]],
  eurekaDisperse: [[]],
  contestSpared: [[]],
  hypeDeflate: [[]],
  holdMusic: [[{ broken: true }], [{ watching: true }], [{}]],
  animalButcher: [[]],
};
console.log('--- deepening-4 freakiness analysis ---');
const results = {};
for (const [name, argSets] of Object.entries(DEEPENED)) {
  let agg = null;
  for (const a of argSets) {
    const r = analyze(name, a);
    ok(`${name}${a.length ? ' ' + JSON.stringify(a[0]) : ''} does not throw`, !r.threw, r.threw && r.threw.message);
    if (!agg) agg = r;
  }
  results[name] = agg;
  console.log(`${name}: layers=${agg.layers} dissonant=${agg.dissonant ? agg.dissonanceKind : 'no'} ` +
    `sweep=${agg.sweep} modulation=${agg.modulation} texture=${agg.noises > 0}`);
  ok(`${name} is layered (>=3 sources)`, agg.layers >= 3, `got ${agg.layers}`);
  ok(`${name} is alien: dissonant OR modulated`, agg.dissonant || agg.modulation,
    'no dissonant interval and no modulation edge');
  ok(`${name} moves: sweep OR modulation`, agg.sweep || agg.modulation);
}

// ---------- param-behavior: the sibling-check fixes ----------
ok('holdMusic registered in dispatch with param passthrough', typeof A.holdMusic === 'function');
ok('animalButcher registered in dispatch', typeof A.animalButcher === 'function');

// holdMusic moods: broken adds the warble LFO (extra osc vs plain)
const plain = analyze('holdMusic', [{}]);
const broken = analyze('holdMusic', [{ broken: true }]);
const watching = analyze('holdMusic', [{ watching: true }]);
ok('holdMusic({broken:true}) does not throw', !broken.threw);
ok('holdMusic({watching:true}) does not throw', !watching.threw);
console.log(`holdMusic oscs: plain=${plain.oscs} broken=${broken.oscs} watching=${watching.oscs}`);

console.log(`\ndeepening-4: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
