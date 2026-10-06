// Audio deepening round 3 (Steve 2026-10-06): "go deeper, improve audio".
// The 2026-10-06 round-3 pass deepened 21 synths that were still generic
// (single-voice or layered-but-characterless) toward alien and freaky:
// combat beats (heronStrike, wolfBreak, stagMirror, stagSnort sibling,
// lockonTick, diveImpact, boom, chargeImpact, burstWindup, deerSnort,
// shout), the swarm (swarmFlash), critters (animalChatter, animalFlop,
// animalPinch), the hummice voice-drop (humBreak), the middle-manager
// voice break (staticBreak), and system beats (managerDebrief, levelup,
// talkAttention).
//
// SIBLING CHECK (debug-scenario-iteration.md): the round-2 bug class was
// param-shape mismatch between emitters (game.js calls Game.audioEvent(name,
// data) -> CombatAudio[name](data), always ONE data object) and synth
// signatures. This test re-audits every audioEvent emitted from game.js,
// contests.js, encounters.js, truth.js against the exported CombatAudio
// surface, and re-asserts the previously fixed shapes (swarmShutters,
// holdMusic, beamSweep's object adapter).
//
// Node can't play audio: instrumented mock Web Audio records the node graph
// each synth builds, then scores the same freakiness rubric as
// test-audio-deepening-freaky.js:
//   layers      >= 3 distinct sources (osc/noise)
//   dissonance  beating pair (<0.4 semitones), minor 2nd, or tritone
//   sweep       a voice sweeping >= 1.5x in frequency
//   modulation  an oscillator patched into another node's frequency/gain
//   texture     a noise source present
// Each deepened synth must satisfy: layers>=3 AND (dissonance OR modulation)
// AND (sweep OR modulation).
// Usage: node scripts/test-audio-round3.js
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
const edges = [];
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

// timers: heartbeat uses setInterval (would keep node alive); boom defers via
// setTimeout (we want its deferred impact to run inside the analysis window).
global.setInterval = () => 0;
global.clearInterval = () => {};
global.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; };
global.clearTimeout = () => {};

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
const ARGS = {
  lockonTick: { dur: 1.2 },
  swarmShutters: { urgency: 3 },
  holdMusic: { broken: true },
  beamSweep: { pan: 0.5, heat: 0.8 },
  humRise: { stacks: 3 },
  round: { round: 5 },
  baskCharge: { charge: 2 },
  glasswingShadowClose: { turns: 2 },
  levelup: { quiet: true },
  telegraph: { urgency: 1, windupTick: true },
  impact: { beam: true, highbeam: true },
};
const SETUP = { humBreak: (A) => A.humNotice() };
// boom and burstWindup are not exported directly: they are reached through
// the pattern dispatcher (patternResolve's unpatterned fallthrough, and
// patternWindup({pattern:'burst'})). Analyze them through that path.
const INVOKE = {
  boom: (A) => A.patternResolve({ pattern: '__unclaimed__' }),
  burstWindup: (A) => A.patternWindup({ pattern: 'burst', urgency: 1 }),
};
function analyze(name) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try {
    if (SETUP[name]) SETUP[name](A);
    nodeSeq = 0; nodes.length = 0; edges.length = 0;
    if (INVOKE[name]) INVOKE[name](A);
    else A[name](ARGS[name]);
  } catch (e) { threw = e; }
  const oscs = nodes.filter(n => n._kind === 'osc');
  const noises = nodes.filter(n => n._kind === 'noise');
  const feedsParam = (id) => edges.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
  const isMod = (o) => {
    const outs = edges.filter(e => e[0] === o._id).map(e => e[1]);
    return outs.length > 0 && outs.every(d => /\.(frequency|gain)$/.test(d) || (/^gain/.test(d.split('.')[0]) && feedsParam(d.split('.')[0])));
  };
  const voices = oscs.filter(o => !isMod(o));
  const layers = oscs.length + noises.length;
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

// ---------- round-3 deepened synths ----------
const DEEPENED3 = [
  'heronStrike', 'wolfBreak', 'stagMirror', 'stagSnort',
  'lockonTick', 'diveImpact', 'boom', 'chargeImpact', 'burstWindup',
  'deerSnort', 'shout',
  'swarmFlash',
  'animalChatter', 'animalFlop', 'animalPinch',
  'humBreak',
  'staticBreak',
  'managerDebrief', 'levelup', 'talkAttention',
  // the exile's haven arc (betrayal.js hooks, were unmapped — composed here)
  'joinVillage', 'claimSite', 'chopWood', 'buildShelter', 'foundHaven',
];
const results = {};
for (const n of DEEPENED3) results[n] = analyze(n);

console.log('--- Audio deepening round 3 freakiness analysis ---');
for (const n of DEEPENED3) {
  const r = results[n];
  console.log(`${n}: layers=${r.layers} (osc=${r.oscs},noise=${r.noises}) ` +
    `dissonant=${r.dissonant ? r.dissonanceKind : 'no'} sweep=${r.sweep} ` +
    `modulation=${r.modulation} texture=${r.texture} median=${r.median.toFixed(0)}Hz`);
  ok(`${n} exists and does not throw`, !r.threw, r.threw && (r.threw.stack || r.threw.message));
  ok(`${n} is layered (>=3 sources, not a stock beep)`, r.layers >= 3, `got ${r.layers}`);
  ok(`${n} is alien: dissonant OR modulated`, r.dissonant || r.modulation,
    'no dissonant interval and no modulation edge');
  ok(`${n} moves: a voice sweeps in pitch or wobbles`, r.sweep || r.modulation);
}

// ---------- distinguishability: the round-3 set must not blur together ----------
let worst = 0, worstPair = '';
for (let i = 0; i < DEEPENED3.length; i++) for (let j = i + 1; j < DEEPENED3.length; j++) {
  const a = results[DEEPENED3[i]].midis, b = results[DEEPENED3[j]].midis;
  if (!a.size || !b.size) continue;
  const inter = [...a].filter(x => b.has(x)).length;
  const jac = inter / (a.size + b.size - inter);
  if (jac > worst) { worst = jac; worstPair = DEEPENED3[i] + '/' + DEEPENED3[j]; }
}
console.log(`worst round-3 pairwise pitch overlap: ${worstPair} = ${worst.toFixed(2)}`);
ok('round-3 synths are mutually distinguishable (pairwise overlap < 0.8)',
  worst < 0.8, `worst: ${worstPair} = ${worst.toFixed(2)}`);

// ---------- sibling duck system: resolve + no-throw (their voice, their rubric) ----------
// A sibling is concurrently authoring the duck monster's voice (duckQuackAt-
// based: ducksQuack, ducksQuackCut, duckLineUp, duckMarch, duckNip,
// duckRegroup, duckScreech, ducksRejoin). Round 3 must not break it: assert
// every duck export resolves and survives the dispatcher call shape.
for (const n of ['ducksQuack', 'ducksQuackCut', 'duckLineUp', 'duckMarch',
                 'duckNip', 'duckRegroup', 'duckScreech', 'ducksRejoin']) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { A[n]({}); } catch (e) { threw = e; }
  ok(`sibling duck synth ${n} resolves and does not throw`,
    typeof A[n] === 'function' && !threw, threw && threw.message);
}

// ---------- sibling check: param shapes ----------
// The dispatch contract: game.js calls Game.audioEvent(name, data), which
// calls CombatAudio[name](data) — exactly one data object, always.
// Previously fixed: swarmShutters, holdMusic (round 2). Re-assert here, plus
// the object-adapter shims and the exported dispatcher names.
function voices(name, arg) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { A[name](arg); } catch (e) { threw = e; }
  return { threw, n: nodes.filter(x => x._kind === 'osc' || x._kind === 'noise').length };
}
{
  const low = voices('swarmShutters', { urgency: 1 });
  const high = voices('swarmShutters', { urgency: 5 });
  ok('swarmShutters({urgency}) honors urgency (more voices at 5 than 1)',
    !low.threw && !high.threw && high.n > low.n, `1:${low.n} 5:${high.n}`);
  const hm = voices('holdMusic', { broken: true });
  ok('holdMusic({broken:true}) does not throw', !hm.threw, hm.threw && hm.threw.message);
  const bs = voices('beamSweep', { pan: 0.5, heat: 0.8 });
  ok('beamSweep({pan,heat}) object adapter does not throw', !bs.threw, bs.threw && bs.threw.message);
  A.beamSweepStop();
  const hr = voices('humRise', { stacks: 3 });
  ok('humRise({stacks:3}) does not throw', !hr.threw, hr.threw && hr.threw.message);
  A.humStop();
  const rd = voices('round', { round: 5 });
  ok('round({round:5}) does not throw', !rd.threw, rd.threw && rd.threw.message);
  const tg = voices('telegraph', { urgency: 1, windupTick: true });
  ok('telegraph({urgency,windupTick}) does not throw', !tg.threw, tg.threw && tg.threw.message);
  const im = voices('impact', { beam: true, highbeam: true });
  ok('impact({beam,highbeam}) does not throw', !im.threw, im.threw && im.threw.message);
  const cs = voices('combatStart', undefined);
  ok('combatStart() with no args does not throw', !cs.threw, cs.threw && cs.threw.message);
  A.combatEnd();
}

// ---------- sibling check: every emitted event must resolve ----------
// Extract every audioEvent('name', ...) from the emitter files and assert the
// exported CombatAudio surface has a function for it (the round-1/2 bug class
// was silent no-ops: emitted names with no synth).
{
  const files = ['src/js/game.js', 'src/js/contests.js', 'src/js/encounters.js',
                 'src/js/truth.js', 'src/js/betrayal.js'];
  const emitted = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/audioEvent\(\s*['"]([\w]+)['"]/g)) emitted.add(m[1]);
  }
  const missing = [...emitted].filter(n => typeof A[n] !== 'function');
  console.log(`emitted audio events: ${emitted.size}, missing synths: ${missing.length}`);
  ok('every emitted audioEvent resolves to a real synth', missing.length === 0, missing.join(', '));
  // every resolved synth must also survive the dispatcher's actual call shape:
  // CombatAudio[name](data || {}) — always an object, possibly empty
  let threwOn = [];
  for (const n of emitted) {
    nodeSeq = 0; nodes.length = 0; edges.length = 0;
    try { A[n]({}); } catch (e) { threwOn.push(n + ':' + e.message); }
  }
  A.combatEnd(); try { A.humStop(); } catch (e) {}
  ok('all emitted synths survive the dispatcher call shape (data={})',
    threwOn.length === 0, threwOn.slice(0, 5).join('; '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
