// Audio deepening freakiness test (Steve 2026-10-06).
// The 2026-10-06 audio pass deepened 18 synths from stock/single-oscillator
// toward alien: the glasswing set (circle/dive/land/climb), the sunbasker set
// (baskCharge/baskBreak/baskFlatten), the justice stinger (confront),
// sibling generic (monsterHurt), pattern windup (diveWindup), hypeInflate,
// lockpickGrab, swarmBuild, and the corporate/ambience set
// (droneHum/droneRecalc/eurekaDrift/projectorStatic/mothFlutter).
// catfishStill is minimal BY DESIGN (the horror is the absence) and is only
// asserted for no-throw, not for freakiness.
//
// Node can't play audio, so this is a listening-analysis harness: an
// instrumented mock Web Audio records the full node graph each synth builds,
// then scores it for freakiness markers (same rubric as
// test-audio-wave2c-freaky.js):
//   - layers: >= 3 distinct sound sources (osc/noise)
//   - dissonance: detuned-beating pair (<2% apart) or minor-2nd/tritone
//   - sweep: a voice sweeping >= 1.5x in frequency
//   - modulation: an oscillator patched into another node's frequency/gain
//   - texture: a noise source present
// Each deepened synth must have >= 3 layers AND (dissonant OR modulation)
// AND (sweep OR modulation), and the monster families must have distinct
// spectral fingerprints (cross-family pitch-set Jaccard overlap < 0.4).
// Usage: node scripts/test-audio-deepening-freaky.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (same as test-audio-wave2c-freaky.js) ----------
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
// per-synth invocation args (baskCharge takes the event data object).
// diveWindup has no dispatch key of its own — it is reached through
// patternWindup({pattern:'single'}), so analyze it through that path.
const ARGS = { baskCharge: { charge: 2 }, glasswingShadowClose: { turns: 2 } };
const INVOKE = { diveWindup: (A) => A.patternWindup({ pattern: 'single', urgency: 1 }) };
function analyze(name) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { if (INVOKE[name]) INVOKE[name](A); else A[name](ARGS[name]); } catch (e) { threw = e; }
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
  const midis = new Set(freqs.map(f => Math.round(69 + 12 * Math.log2(f / 440))));
  return { name, threw, layers, oscs: oscs.length, noises: noises.length, dissonant, dissonanceKind, sweep, modulation, texture, median, freqs, midis };
}

const DEEPENED = [
  'glasswingCircle', 'glasswingDive', 'glasswingLand', 'glasswingClimb',
  'glasswingShadowClose',
  'baskCharge', 'baskBreak', 'baskFlatten',
  'confront', 'monsterHurt',
  'diveWindup', 'hypeInflate', 'lockpickGrab', 'swarmBuild',
  'droneHum', 'droneRecalc', 'eurekaDrift', 'projectorStatic', 'mothFlutter',
];
const results = {};
for (const n of DEEPENED) results[n] = analyze(n);

console.log('--- Audio deepening freakiness analysis ---');
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

// ---------- new animal synths (Steve 2026-10-06): the animals worker's beats ----------
// Same freakiness rubric as the deepened set. Animals share Earth DNA, so the
// pairwise bar is looser (Jaccard < 0.7), but a honk must never read as a yowl.
const NEW_ANIMALS = [
  'animalQuill', 'animalHonk', 'animalYowl', 'animalCharge',
  'animalTailSlap', 'animalWhistle', 'animalFlush',
];
const animalResults = {};
for (const n of NEW_ANIMALS) animalResults[n] = analyze(n);
console.log('\n--- New animal synths freakiness analysis ---');
for (const n of NEW_ANIMALS) {
  const r = animalResults[n];
  console.log(`${n}: layers=${r.layers} (osc=${r.oscs},noise=${r.noises}) ` +
    `dissonant=${r.dissonant ? r.dissonanceKind : 'no'} sweep=${r.sweep} ` +
    `modulation=${r.modulation} texture=${r.texture} median=${r.median.toFixed(0)}Hz`);
  ok(`${n} exists and does not throw`, !r.threw, r.threw && r.threw.message);
  ok(`${n} is layered (>=3 sources, not a stock beep)`, r.layers >= 3, `got ${r.layers}`);
  ok(`${n} is alien: dissonant OR modulated`, r.dissonant || r.modulation,
    'no dissonant interval and no modulation edge');
  ok(`${n} moves: a voice sweeps in pitch or wobbles`, r.sweep || r.modulation);
}
let worstAnimalOverlap = 0, worstAnimalPair = '';
for (let i = 0; i < NEW_ANIMALS.length; i++) for (let j = i + 1; j < NEW_ANIMALS.length; j++) {
  const a = animalResults[NEW_ANIMALS[i]].midis, b = animalResults[NEW_ANIMALS[j]].midis;
  const inter = [...a].filter(x => b.has(x)).length;
  const jac = inter / (a.size + b.size - inter);
  if (jac > worstAnimalOverlap) { worstAnimalOverlap = jac; worstAnimalPair = NEW_ANIMALS[i] + '/' + NEW_ANIMALS[j]; }
}
console.log(`worst animal-animal pitch overlap: ${worstAnimalPair} = ${worstAnimalOverlap.toFixed(2)}`);
ok('animal synths are mutually distinguishable (pairwise overlap < 0.7)',
  worstAnimalOverlap < 0.7, `worst: ${worstAnimalPair} = ${worstAnimalOverlap.toFixed(2)}`);

// catfishStill: minimal by design — assert it still sounds (no-throw), not freakiness
{
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { A.catfishStill(); } catch (e) { threw = e; }
  ok('catfishStill (minimal by design) does not throw', !threw, threw && threw.message);
  const layers = nodes.filter(n => n._kind === 'osc' || n._kind === 'noise').length;
  ok('catfishStill stays minimal (<=2 layers, the absence is the instrument)', layers <= 2, `got ${layers}`);
}

// ---------- distinguishability: families must not sound alike ----------
const fam = {
  glasswing: ['glasswingCircle', 'glasswingDive', 'glasswingLand', 'glasswingClimb', 'glasswingShadowClose'],
  sunbasker: ['baskCharge', 'baskBreak', 'baskFlatten'],
  justice: ['confront', 'monsterHurt'],
  corporate: ['droneHum', 'droneRecalc', 'eurekaDrift', 'projectorStatic', 'hypeInflate', 'lockpickGrab'],
  motion: ['diveWindup', 'swarmBuild', 'mothFlutter'],
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
ok('deepened families are pitch-distinguishable (overlap < 0.4)',
  worstOverlap < 0.4, `worst: ${worstPair} = ${worstOverlap.toFixed(2)}`);

// ---------- old-vs-new: every deepened synth must be freakier than its predecessor ----------
let oldSrc;
try { oldSrc = execSync('git show HEAD:src/js/app.js', { cwd: ROOT, encoding: 'utf8' }); }
catch (e) { oldSrc = null; }
if (oldSrc) {
  const ostart = oldSrc.indexOf('const CombatAudio = (() => {');
  const oend = oldSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
  const oldGame = { state: { village: { positions: {} }, scholar: {} } };
  const oldEval = new Function('Game', oldSrc.slice(ostart, oend) + '\n;return CombatAudio;');
  const oldA = oldEval(oldGame);
  console.log('\n--- old vs new layer counts ---');
  for (const n of DEEPENED) {
    nodeSeq = 0; nodes.length = 0; edges.length = 0;
    try { if (INVOKE[n]) INVOKE[n](oldA); else oldA[n](ARGS[n]); } catch (e) {}
    const oldLayers = nodes.filter(x => x._kind === 'osc' || x._kind === 'noise').length;
    const newLayers = results[n].layers;
    console.log(`${n}: old=${oldLayers} layers -> new=${newLayers} layers`);
    ok(`${n} is freakier than its predecessor (>= layers)`, newLayers >= oldLayers && newLayers >= 3,
      `old=${oldLayers} new=${newLayers}`);
  }
} else {
  console.log('\n(no git HEAD available — skipping old-vs-new comparison)');
}

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
