// Audio deepening pass 3 freakiness test (Steve 2026-10-06).
// Deepened 10 generic synths toward alien and gave 3 hooks their own
// distinct synths:
//   Monster telegraphs: droneBeam (machine beam resolve), lineStrike
//     (heron wire snap), ambushSnap (bear-trap jaws), rushHit (hushwolf
//     arrival), lockonHit (direct-pattern hit)
//   Contest fear beats: hypeDetonate (the detonation is FEARED),
// (break-it audio 2026-10-08: hypeEncourage was a dead synth — registered,
// zero call sites — and was deleted from app.js. Its entries are dropped
// here so this historical proof script stays green.)
//   Animals (pass-2 leftovers): animalBite, animalBolt, animalRattle
//   New distinct synths for hooks with no synth of their own:
//     combatStartHit (combatStart was just a heartbeat), impactWild
//     (impact()'s fallthrough was the stock boom), delegateDebrief
//     (was a pure alias of managerDebrief)
// Node can't play audio, so this is a listening-analysis harness: an
// instrumented mock Web Audio records the full node graph each synth builds,
// then scores it for freakiness markers (same rubric as
// test-audio-deepening-freaky.js):
//   - layers: >= 3 distinct sound sources (osc/noise)
//   - dissonance: detuned-beating pair (<2% apart) or minor-2nd/tritone
//   - sweep: a voice sweeping >= 1.5x in frequency
//   - modulation: an oscillator patched into another node's frequency/gain
//   - texture: a noise source present
// Each deepened synth must have >= 3 layers AND (dissonant OR modulation)
// AND (sweep OR modulation), and each family group must span a wide spectral
// range (max/median ratio >= 4x) so cues are instantly distinguishable.
// Usage: node scripts/test-audio-deepening-3.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (same as test-audio-deepening-freaky.js) ----------
let nodeSeq = 0;
const nodes = [];
function mockParam(node, pname, init) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v, t }); this._v = v; },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v, t }); this._v = v; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v, t }); this._v = v; },
    setTargetAtTime(v) { this.events.push({ op: 'tgt', v }); },
    connect(dest) { edges.push([node._id, dest && dest._id ? dest._id + '.' + dest._pname : '?']); },
  };
  let _v = init;
  Object.defineProperty(p, 'value', {
    get() { return _v; },
    set(v) { p.events.push({ op: 'set', v, t: NaN }); _v = v; },
    enumerable: true,
  });
  return p;
}
const edges = [];
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
  nodes.push(n);
  return n;
}
function MockAudioContext() {
  return {
    sampleRate: 44100, currentTime: 0, state: 'running', destination: {},
    resume() {},
    createBuffer(ch, len, rate) { return { getChannelData() { return new Float32Array(len); } }; },
    createBufferSource() { return mockNode('noise'); },
    createOscillator() { return mockNode('osc'); },
    createGain() { return mockNode('gain'); },
    createBiquadFilter() { return mockNode('filter'); },
    createDynamicsCompressor() {
      const n = mockNode('comp');
      n.threshold = mockParam(n, 'threshold', 0); n.knee = mockParam(n, 'knee', 0);
      n.ratio = mockParam(n, 'ratio', 0); n.attack = mockParam(n, 'attack', 0);
      n.release = mockParam(n, 'release', 0); return n;
    },
    createStereoPanner() { const n = mockNode('panner'); n.pan = mockParam(n, 'pan', 0); return n; },
    createWaveShaper() { const n = mockNode('shaper'); n.curve = null; return n; },
  };
}

// ---------- extract CombatAudio ----------
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const start = appSrc.indexOf('const CombatAudio = (() => {');
const end = appSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
const Game = {};
Game.state = { village: { positions: {} }, scholar: {} };
eval(appSrc.slice(start, end) + '\n;globalThis.__CombatAudio = CombatAudio;');
const A = globalThis.__CombatAudio;
global.window = { AudioContext: MockAudioContext };
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } };
A.ensureAudio();

// ---------- analysis ----------
function baseFreq(osc) {
  const s = osc.frequency.events.find(e => e.op === 'set');
  return s ? s.v : osc.frequency.value;
}
function freqSpan(osc) {
  const vals = osc.frequency.events.filter(e => e.v > 0).map(e => e.v);
  if (!vals.length) return 1;
  return Math.max(...vals) / Math.min(...vals);
}
// impactWild has no dispatch key of its own — it is reached through
// impact({pattern:'<unknown>'}), so analyze it through that path.
const ARGS = {};
const INVOKE = { impactWild: (A) => A.impact({ pattern: 'zzz-unknown' }) };
function analyze(name) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try {
    if (INVOKE[name]) INVOKE[name](A);
    else A[name](ARGS[name]);
  } catch (e) { threw = e; }
  // combatStart arms the heartbeat interval; disarm it so the process exits.
  try { A.combatEnd(); } catch (e) {}
  const oscs = nodes.filter(n => n._kind === 'osc');
  const noises = nodes.filter(n => n._kind === 'noise');
  const feedsParam = (id) => edges.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
  const isMod = (o) => {
    const outs = edges.filter(e => e[0] === o._id).map(e => e[1]);
    return outs.length > 0 && outs.every(d => /\.(frequency|gain)$/.test(d) || (/^gain/.test(d.split('.')[0]) && feedsParam(d.split('.')[0])));
  };
  const voices = oscs.filter(o => !isMod(o));
  const layers = oscs.length + noises.length;
  // A modulator may reach a param through a depth gain (standard AM/FM rig).
  const feedsGainFeedingParam = (id) => edges.some(e => {
    const mid = e[1].split('.')[0];
    return e[0] === id && /^gain/.test(mid) && feedsParam(mid);
  });
  const freqs = voices.map(baseFreq).filter(f => f > 0).sort((a, b) => a - b);
  function semitones(a, b) { return 12 * Math.log2(b / a); }
  let dissonant = false, dissonanceKind = null;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) {
    const st = semitones(freqs[i], freqs[j]) % 12;
    const cls = Math.min(st, 12 - st);
    if (cls < 0.4) { dissonant = true; dissonanceKind = 'beating(' + freqs[i].toFixed(1) + '/' + freqs[j].toFixed(1) + ')'; }
    else if (Math.abs(cls - 1) < 0.15) { dissonant = true; dissonanceKind = 'minor2nd(' + freqs[i].toFixed(1) + '/' + freqs[j].toFixed(1) + ')'; }
    else if (Math.abs(cls - 6) < 0.2) { dissonant = true; dissonanceKind = 'tritone(' + freqs[i].toFixed(1) + '/' + freqs[j].toFixed(1) + ')'; }
  }
  const sweep = voices.some(o => freqSpan(o) >= 1.5);
  const srcs = new Set();
  for (const [s, d] of edges) if (/^osc/.test(s)) srcs.add(s);
  const modulation = [...srcs].some(id => feedsParam(id) || feedsGainFeedingParam(id));
  const texture = noises.length > 0;
  const median = freqs.length ? freqs[Math.floor(freqs.length / 2)] : 0;
  return { name, threw, layers, oscs: oscs.length, noises: noises.length, dissonant, dissonanceKind, sweep, modulation, texture, median };
}

const DEEPENED = [
  'droneBeam', 'lineStrike', 'ambushSnap', 'rushHit', 'lockonHit', 'impactWild',
  'hypeDetonate', 'combatStart',
  'animalBite', 'animalBolt', 'animalRattle',
  'delegateDebrief',
];
const results = {};
for (const n of DEEPENED) results[n] = analyze(n);

console.log('--- Audio deepening pass 3 freakiness analysis ---');
for (const n of DEEPENED) {
  const r = results[n];
  console.log(`${n}: layers=${r.layers} (osc=${r.oscs},noise=${r.noises}) ` +
    `dissonant=${r.dissonant ? r.dissonanceKind : 'no'} sweep=${r.sweep} ` +
    `modulation=${r.modulation} texture=${r.texture} median=${r.median.toFixed(0)}Hz`);
  ok(`${n} exists and does not throw`, !r.threw, r.threw && r.threw.message);
  ok(`${n} is layered (>=3 sources, not a stock beep)`, r.layers >= 3, `got ${r.layers}`);
  ok(`${n} is alien: dissonant OR modulated`, r.dissonant || r.modulation,
    'no dissonant interval and no modulation edge');
  ok(`${n} moves: a voice sweeps in pitch or wobbles`, r.sweep || r.modulation);
}

// ---------- family distinctness: each group must span a wide spectral range
// so cues are instantly distinguishable from their siblings ----------
const GROUPS = {
  'monster telegraphs': ['droneBeam', 'lineStrike', 'ambushSnap', 'rushHit', 'lockonHit', 'impactWild'],
  'contest fear beats': ['hypeDetonate', 'combatStart'],
  'animals': ['animalBite', 'animalBolt', 'animalRattle'],
};
console.log('\n--- Pass-3 family spectral spread ---');
for (const [gname, names] of Object.entries(GROUPS)) {
  const meds = names.map(n => results[n].median).filter(m => m > 0).sort((a, b) => a - b);
  const spread = meds.length > 1 ? meds[meds.length - 1] / meds[0] : 0;
  console.log(`${gname}: medians ${meds.map(m => Math.round(m) + 'Hz').join(', ')} (spread ${spread.toFixed(1)}x)`);
  ok(`${gname} span a wide spectral range (>=4x max/median)`, spread >= 4, `spread ${spread.toFixed(1)}x`);
}
// delegateDebrief must no longer be the managerDebrief synth: its graph must
// differ from managerDebrief's (different layer count or median band).
const dd = results['delegateDebrief'];
const md = analyze('managerDebrief');
console.log(`\ndelegateDebrief vs managerDebrief: layers ${dd.layers}/${md.layers}, median ${dd.median.toFixed(0)}/${md.median.toFixed(0)}Hz`);
ok('delegateDebrief is its own synth, not the managerDebrief alias',
  dd.layers !== md.layers || Math.abs(dd.median - md.median) / md.median > 0.2,
  'graph indistinguishable from managerDebrief');

console.log(`\nPASS-3: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
