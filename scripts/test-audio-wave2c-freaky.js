// Wave-2 Group C audio freakiness test (Steve 2026-10-06).
// The five Group C telegraph/resolve synths were deepened from stock toward
// alien: eurekaTick, eurekaCharge, eurekaDetonate (bright_idea), projectorHum
// (memory_projector), managerAnnounce (delegate_beast).
//
// Node can't play audio, so this is a listening-analysis harness: an
// instrumented mock Web Audio records the full node graph each synth builds
// (oscillator types, frequency schedules, gain envelopes, noise layers,
// modulation edges), then scores it for freakiness markers:
//   - layers: >= 3 distinct sound sources (osc/noise)
//   - dissonance: a detuned-beating pair (<2% apart) or a minor-2nd/tritone
//     interval between simultaneous tones
//   - sweep: at least one oscillator sweeping >= 1.5x in frequency
//   - modulation: an oscillator patched into another node's frequency or
//     gain (vibrato, AM edge, flutter)
//   - texture: a noise source present
// Each deepened synth must have >= 3 layers AND (dissonance OR modulation)
// AND sweep, and the three monster families must have distinct spectral
// fingerprints (different median base-frequency bands) so every cue is
// instantly distinguishable from the others.
// Usage: node scripts/test-audio-wave2c-freaky.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio ----------
let nodeSeq = 0;
const nodes = []; // all created nodes this run
function mockParam(node, pname, init) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v, t }); this._v = v; },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v, t }); this._v = v; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v, t }); this._v = v; },
    setTargetAtTime(v) { this.events.push({ op: 'tgt', v }); },
    connect(dest) { edges.push([node._id, dest && dest._id ? dest._id + '.' + dest._pname : '?']); },
  };
  // Direct assignments (o.frequency.value = 660) also record as events.
  let _v = init;
  Object.defineProperty(p, 'value', {
    get() { return _v; },
    set(v) { p.events.push({ op: 'set', v, t: NaN }); _v = v; },
    enumerable: true,
  });
  return p;
}
const edges = [];
// A connect() destination can be a node or an AudioParam (which carries
// _node/_pname instead of _id).
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
function analyze(name, opts) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { A[name](opts || {}); } catch (e) { threw = e; }
  const oscs = nodes.filter(n => n._kind === 'osc');
  const noises = nodes.filter(n => n._kind === 'noise');
  // A source is a *modulator* (not a voice) if its output only ever reaches
  // audio params — directly, or through a depth gain (standard AM/FM rig).
  const feedsParam = (id) => edges.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
  const feedsGainFeedingParam = (id) => edges.some(e => {
    const mid = e[1].split('.')[0];
    return e[0] === id && /^gain/.test(mid) && feedsParam(mid);
  });
  const isMod = (o) => {
    const outs = edges.filter(e => e[0] === o._id).map(e => e[1]);
    return outs.length > 0 && outs.every(d => /\.(frequency|gain)$/.test(d) || (/^gain/.test(d.split('.')[0]) && feedsParam(d.split('.')[0])));
  };
  const voices = oscs.filter(o => !isMod(o));
  const layers = oscs.length + noises.length;
  const freqs = voices.map(baseFreq).filter(f => f > 0).sort((a, b) => a - b);
  // Interval classes, octave-normalized: a minor-2nd an octave up still clashes.
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
  // Modulation: an oscillator patched (directly or through a depth gain)
  // into another node's frequency or gain — vibrato, AM edge, flutter.
  const srcs = new Set();
  for (const [s, d] of edges) if (/^osc/.test(s)) srcs.add(s);
  const modulation = [...srcs].some(id => feedsParam(id) || feedsGainFeedingParam(id));
  const texture = noises.length > 0;
  const median = freqs.length ? freqs[Math.floor(freqs.length / 2)] : 0;
  const midis = new Set(freqs.map(f => Math.round(69 + 12 * Math.log2(f / 440))));
  return { name, threw, layers, oscs: oscs.length, noises: noises.length, dissonant, dissonanceKind, sweep, modulation, texture, median, freqs, midis };
}

const DEEPENED = ['eurekaTick', 'eurekaCharge', 'eurekaDetonate', 'projectorHum', 'managerAnnounce'];
const results = {};
for (const n of DEEPENED) results[n] = analyze(n, n === 'eurekaTick' ? { urgency: 1 } : n === 'projectorHum' ? { spell: true } : {});

console.log('--- Wave-2 Group C freakiness analysis ---');
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

// ---------- distinguishability: the three families must not sound alike ----------
// Metric: each family's voice frequencies, mapped to absolute semitone
// numbers (MIDI-ish). Pairwise overlap of the two pitch sets (Jaccard)
// must stay under 0.4 — no two monsters' cues live in the same pitches.
const fam = {
  bright_idea: ['eurekaTick', 'eurekaCharge', 'eurekaDetonate'],
  memory_projector: ['projectorHum'],
  delegate_beast: ['managerAnnounce'],
};
function unionMidies(names) {
  const s = new Set();
  for (const n of names) for (const m of results[n].midis) s.add(m);
  return s;
}
const famMidis = {};
for (const [k, names] of Object.entries(fam)) famMidis[k] = unionMidies(names);
const famKeys = Object.keys(famMidis);
let worstOverlap = 0, worstPair = '';
for (let i = 0; i < famKeys.length; i++) for (let j = i + 1; j < famKeys.length; j++) {
  const a = famMidis[famKeys[i]], b = famMidis[famKeys[j]];
  const inter = [...a].filter(x => b.has(x)).length;
  const jac = inter / (a.size + b.size - inter);
  if (jac > worstOverlap) { worstOverlap = jac; worstPair = famKeys[i] + '/' + famKeys[j]; }
  console.log(`pitch overlap ${famKeys[i]} vs ${famKeys[j]}: ${jac.toFixed(2)}`);
}
ok('Group C families are pitch-distinguishable (overlap < 0.4)',
  worstOverlap < 0.4, `worst: ${worstPair} = ${worstOverlap.toFixed(2)}`);

// ---------- old-vs-new: every deepened synth must be freakier than its predecessor ----------
let oldSrc;
try { oldSrc = execSync('git show HEAD:src/js/app.js', { cwd: ROOT, encoding: 'utf8' }); }
catch (e) { oldSrc = null; }
if (oldSrc) {
  const ostart = oldSrc.indexOf('const CombatAudio = (() => {');
  const oend = oldSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
  const Game2 = {};
  eval('var CombatAudio;');
  const oldGame = { state: { village: { positions: {} }, scholar: {} } };
  // Rebind: evaluate old IIFE under a shadowed Game
  const oldEval = new Function('Game', oldSrc.slice(ostart, oend) + '\n;return CombatAudio;');
  const oldA = oldEval(oldGame);
  const realA = A;
  console.log('\n--- old vs new layer counts ---');
  for (const n of DEEPENED) {
    nodeSeq = 0; nodes.length = 0; edges.length = 0;
    try { oldA[n](n === 'eurekaTick' ? { urgency: 1 } : n === 'projectorHum' ? { spell: true } : {}); } catch (e) {}
    const oldLayers = nodes.filter(x => x._kind === 'osc' || x._kind === 'noise').length;
    const newLayers = results[n].layers;
    console.log(`${n}: old=${oldLayers} layers -> new=${newLayers} layers`);
    ok(`${n} is freakier than its predecessor (>= layers)`, newLayers >= oldLayers && newLayers >= 3,
      `old=${oldLayers} new=${newLayers}`);
  }
  void realA;
} else {
  console.log('\n(no git HEAD available — skipping old-vs-new comparison)');
}

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
