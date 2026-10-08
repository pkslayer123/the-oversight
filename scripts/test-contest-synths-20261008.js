// PROOF (Steve 2026-10-08): bespoke contest synths for the 30 older contests.
// The 30 older contests' per-phase beats (CX_BEAT_DEFS, contests.js) were
// composed over EXISTING synths; six beats had fiction too strong for
// borrowed voices and got their own alien textures, defined + registered in
// app.js's audio section:
//   altarCurdle (tithe Declare), hungerGnaw (starve Escalate),
//   predatorListen (hide Declare), teethTick (wheel Escalate),
//   mindMoth (quiet Escalate), engineVoices (riddle Declare).
//
// Proves: every new synth is defined and registered on CombatAudio; NO beat
// hook name in CX_BEAT_DEFS is unmapped; each new synth fires (no-throw)
// when its beat's composition runs; each new synth scores freaky
// (>=3 layers AND (dissonant OR modulation) AND (sweep OR modulation), the
// rubric from test-audio-deepening-freaky.js); and no two new synths share
// the same waveform+envelope shape.
//
// Run: node scripts/test-contest-synths-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (same harness as test-audio-deepening-freaky.js) ----------
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

// ---------- parse CX_BEAT_DEFS from contests.js ----------
const cxSrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
const defBlock = cxSrc.slice(cxSrc.indexOf('const CX_BEAT_DEFS = {'), cxSrc.indexOf('G._cxB = function'));
const BEATS = {};
for (const m of defBlock.matchAll(/(\w+): \[(.*?)\]/g)) {
  BEATS[m[1]] = [...m[2].matchAll(/'([\w]+)'/g)].map(x => x[1]);
}
const ALL_HOOKS = [...new Set(Object.values(BEATS).flat())];

const NEW = {
  altarCurdle: 'contestTitheDeclare',
  hungerGnaw: 'contestStarveEscalate',
  predatorListen: 'contestHideDeclare',
  teethTick: 'contestWheelEscalate',
  mindMoth: 'contestQuietEscalate',
  engineVoices: 'contestRiddleDeclare',
};

console.log('--- contest synth wiring ---');
// 1. defined + registered
for (const name of Object.keys(NEW)) {
  ok(`synth defined: ${name}`, typeof A[name] === 'function');
}
// 2. no unmapped hook in any beat def
const unmapped = ALL_HOOKS.filter(h => typeof A[h] !== 'function');
ok(`no unmapped beat hook (${ALL_HOOKS.length} hooks across ${Object.keys(BEATS).length} beats)`, unmapped.length === 0, `unmapped=${unmapped.join(',')}`);
// 3. each new synth is wired into its beat's composition
for (const [synth, beat] of Object.entries(NEW)) {
  ok(`${beat} composition includes ${synth}`, (BEATS[beat] || []).includes(synth), `parts=${(BEATS[beat] || []).join('+')}`);
}

console.log('--- beat fire (headless smoke) ---');
// 4. run each target beat's composition through the real CombatAudio under
// mock WebAudio — the new synth must actually fire, and nothing may throw.
for (const [synth, beat] of Object.entries(NEW)) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let fired = 0, threw = null;
  const orig = A[synth];
  A[synth] = (...a) => { fired++; return orig.apply(A, a); };
  try {
    for (const part of BEATS[beat]) A[part]();
  } catch (e) { threw = e; }
  A[synth] = orig;
  ok(`${beat} fires ${synth} without error`, !threw && fired >= 1, threw ? String(threw).slice(0, 120) : `fired=${fired}`);
}

// ---------- freakiness analysis ----------
function baseFreq(osc) {
  const s = osc.frequency.events.find(e => e.op === 'set');
  return s ? s.v : osc.frequency.value;
}
function freqSpan(osc) {
  const vals = osc.frequency.events.filter(e => e.v > 0).map(e => e.v);
  if (!vals.length) return 1;
  return Math.max(...vals) / Math.min(...vals);
}
function analyze(name) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { A[name](); } catch (e) { threw = e; }
  const oscs = nodes.filter(n => n._kind === 'osc');
  const noises = nodes.filter(n => n._kind === 'noise');
  const feedsParam = (id) => edges.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
  const freqs = oscs.map(baseFreq).filter(f => f > 0).sort((a, b) => a - b);
  let dissonant = false, dissonanceKind = null;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) {
    const st = (12 * Math.log2(freqs[j] / freqs[i])) % 12;
    const cls = Math.min(st, 12 - st);
    if (cls < 0.4) { dissonant = true; dissonanceKind = 'beating'; }
    else if (Math.abs(cls - 1) < 0.15) { dissonant = true; dissonanceKind = 'minor2nd'; }
    else if (Math.abs(cls - 6) < 0.2) { dissonant = true; dissonanceKind = 'tritone'; }
  }
  const sweep = oscs.some(o => freqSpan(o) >= 1.5);
  const modulation = oscs.some(o => feedsParam(o._id)) ||
    edges.some(e => /^gain/.test(e[0]) && /\.(frequency|gain)$/.test(e[1]));
  const types = [...new Set(oscs.map(o => o.type))].sort().join('+');
  const subPedal = freqs.some(f => f < 60);
  const infrasound = freqs.some(f => f < 20);
  const feedsGainFeedingParam = (id) => edges.some(e => {
    const mid = e[1].split('.')[0];
    return e[0] === id && /^gain/.test(mid) && feedsParam(mid);
  });
  // FM edge: an osc reaching another osc's frequency, directly or through a
  // depth gain (the standard FM rig: mod -> depth gain -> carrier.frequency)
  const fmEdge = oscs.some(o => feedsParam(o._id) && edges.some(e =>
    e[0] === o._id && /^osc/.test(e[1].split('.')[0]) && /\.frequency$/.test(e[1]))) ||
    oscs.some(o => feedsGainFeedingParam(o._id) && edges.some(e => {
      if (e[0] !== o._id) return false;
      const mid = e[1].split('.')[0];
      return /^gain/.test(mid) && edges.some(e2 => e2[0] === mid && /^osc/.test(e2[1].split('.')[0]) && /\.frequency$/.test(e2[1]));
    }));
  return {
    name, threw, layers: oscs.length + noises.length, oscs: oscs.length, noises: noises.length,
    dissonant, dissonanceKind, sweep, modulation, types, subPedal, infrasound, fmEdge, freqs,
  };
}
console.log('--- freakiness (rubric: >=3 layers AND (dissonant OR modulation) AND (sweep OR modulation)) ---');
const results = {};
for (const name of Object.keys(NEW)) {
  const r = analyze(name);
  results[name] = r;
  const freaky = r.layers >= 3 && (r.dissonant || r.modulation) && (r.sweep || r.modulation);
  ok(`${name}: freaky (layers=${r.layers} ${r.dissonanceKind || ''}${r.sweep ? ' sweep' : ''}${r.modulation ? ' mod' : ''})`, !r.threw && freaky,
    r.threw ? 'threw: ' + String(r.threw).slice(0, 100) : undefined);
}
// per-synth signature markers — each must have its own alien fingerprint
ok('altarCurdle: triangle notes + off-scale sub pedal', results.altarCurdle.types.includes('triangle') && results.altarCurdle.subPedal);
ok('hungerGnaw: FM growl (osc->osc.frequency)', results.hungerGnaw.fmEdge);
ok('predatorListen: infrasound pressure', results.predatorListen.infrasound);
ok('teethTick: percussive tick storm (>=10 noise nodes)', results.teethTick.noises >= 10);
ok('engineVoices: detuned beating saw pair', results.engineVoices.dissonant && results.engineVoices.dissonanceKind === 'beating' && results.engineVoices.types.includes('sawtooth'));
// mindMoth: reverse-swell — a noise gain whose attack ramp spans >= 0.5s
{
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  A.mindMoth();
  let reverseSwell = false;
  for (const n of nodes.filter(n => n._kind === 'gain')) {
    const evs = n.gain.events;
    const first = evs[0], peak = evs.find(e => e.v > 0.1);
    if (first && peak && typeof peak.t === 'number' && typeof first.t === 'number' && (peak.t - first.t) >= 0.5) reverseSwell = true;
  }
  ok('mindMoth: reverse-swell envelope (>=0.5s attack)', reverseSwell);
}
// no two new synths share the same waveform+envelope shape
{
  const sigs = Object.entries(results).map(([name, r]) =>
    `${name}: ${r.types}|osc${r.oscs}n${r.noises}|${r.fmEdge ? 'FM' : ''}${r.infrasound ? 'INFRA' : ''}${r.subPedal && !r.infrasound ? 'SUB' : ''}${r.sweep ? 'SWEEP' : ''}`);
  const vals = sigs.map(s => s.split(': ').slice(1).join(': '));
  ok('six distinct waveform+envelope signatures', new Set(vals).size === vals.length, sigs.join(' ; '));
  console.log('  signatures: ' + sigs.join(' ; '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
