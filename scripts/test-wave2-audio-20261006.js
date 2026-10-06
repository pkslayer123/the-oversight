// Wave-2 audio hook audit + hecklerTaunt depth check (Steve 2026-10-06).
//
// Part 1 — MECHANICAL HOOK AUDIT: every audioEvent('name') literal fired in
//   game.js and app.js, plus every data-driven audio hook in src/data/*.json
//   (notice/aggro/declare/resolve/deathAudio), must resolve to a key in the
//   Game.audio registry (the CombatAudio return object in src/js/app.js).
//   Fails on any unresolved (silent no-op) hook.
// Part 2 — HECKLERTAUNT DEPTH: the deepened hecklerTaunt must play without
//   throwing under a mock Web Audio context, be layered (>=4 sources),
//   carry a detuned-beating/dissonant pair and an LFO wobble (freaky, not
//   generic), stack with shame (more sound at shame 7 than shame 0), and
//   never be a silent no-op (every voice audible, every started node
//   stopped, every node connected).
// Usage: node scripts/test-wave2-audio-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ================= Part 1: hook resolution =================
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');

// Registry keys: eval the CombatAudio IIFE slice exactly like the game does
// (Game.audio = CombatAudio) and read the real keys — no regex fragility.
const start = appSrc.indexOf('const CombatAudio = (() => {');
const end = appSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
ok('CombatAudio IIFE slice locatable in app.js', start > 0 && end > start);
const Game = {};
eval(appSrc.slice(start, end) + '\n;globalThis.__CombatAudio = CombatAudio;');
const A = globalThis.__CombatAudio;
const registry = new Set(Object.keys(A));
ok('registry extracted from CombatAudio', registry.size > 100, `got ${registry.size}`);

// Literal call sites: audioEvent('name') / audioEvent("name") in game.js + app.js.
// Only word-char names count — doc comments use '<name>'-style placeholders.
const fired = new Set();
for (const src of [gameSrc, appSrc]) {
  const re = /audioEvent\(\s*['"]([^'"]+)['"]/g;
  let m; while ((m = re.exec(src))) { if (/^\w+$/.test(m[1])) fired.add(m[1]); }
}
// Data-driven hooks: walk every src/data/*.json for *Audio config keys.
const dataDir = path.join(ROOT, 'src/data');
const audioKeyRe = /(notice|aggro|declare|resolve|death)Audio$/;
function walk(o) {
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (audioKeyRe.test(k) && typeof v === 'string' && !v.includes('?')) fired.add(v);
      walk(v);
    }
  }
}
for (const f of fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
  try { walk(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))); }
  catch (e) { /* schemas.json is stale; a parse failure is not an audio failure */ }
}
console.log(`--- hook audit: ${fired.size} distinct hooks fired, ${registry.size} voices registered ---`);
const orphans = [...fired].filter(n => !registry.has(n)).sort();
for (const o of orphans) console.log(`ORPHAN hook fired but unregistered: ${o}`);
ok('zero orphaned audio hooks (no silent no-ops)', orphans.length === 0,
  orphans.length ? `orphans: ${orphans.join(', ')}` : undefined);
// Regression: the heckler aggroAudio orphan this run fixed.
ok("hecklerLaugh resolves (was an orphan: monsters.json heckler aggroAudio)",
  registry.has('hecklerLaugh'));
// The moderator suite must all resolve.
for (const m of ['modNotice', 'modNoted', 'modMute', 'modViolation', 'modRemoval', 'modShadow', 'modDown'])
  ok(`moderator voice resolves: ${m}`, registry.has(m));

// ================= Part 2: hecklerTaunt plays, deep, shame-scaled =================
// Instrumented mock Web Audio: records nodes, edges, starts/stops, gain peaks.
let nodeSeq = 0; const nodes = [], edges = [];
function paramDestId(dest) {
  if (!dest || typeof dest !== 'object') return '?';
  const id = dest._id || (dest._node && dest._node._id);
  return id ? id + (dest._pname ? '.' + dest._pname : '') : 'bus';
}
function mockParam(node, pname, init) {
  const p = {
    _node: node, _pname: pname, events: [],
    setValueAtTime(v, t) { this.events.push({ op: 'set', v, t }); this._v = v; },
    linearRampToValueAtTime(v, t) { this.events.push({ op: 'lin', v, t }); this._v = v; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ op: 'exp', v, t }); this._v = v; },
    connect(dest) { edges.push([node._id, paramDestId(dest)]); },
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
  return id ? id + (dest._pname ? '.' + dest._pname : '') : 'bus';
}
function mockNode(kind) {
  const n = {
    _id: kind + (++nodeSeq), _kind: kind, _started: 0, _stopped: 0,
    connect(dest) { edges.push([this._id, paramDestId(dest)]); },
    disconnect() {},
    start() { this._started++; }, stop() { this._stopped++; },
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
  };
}
global.window = { AudioContext: MockAudioContext };
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } };
A.ensureAudio();

function run(name, opts) {
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let threw = null;
  try { A[name](opts || {}); } catch (e) { threw = e; }
  return { threw, nodes: [...nodes], edges: [...edges] };
}
function baseFreq(osc) {
  const s = osc.frequency.events.find(e => e.op === 'set');
  return s ? s.v : osc.frequency.value;
}
// A voice is a source whose output reaches the mix — i.e. NOT a pure
// modulator. Modulators only feed audio params, directly or through a
// depth gain (the standard LFO->gain->osc.frequency rig).
function feedsParam(id, edgeList) {
  return edgeList.some(e => e[0] === id && /\.(frequency|gain)$/.test(e[1]));
}
function isModulator(o, edgeList) {
  const outs = edgeList.filter(e => e[0] === o._id).map(e => e[1]);
  if (!outs.length) return false;
  return outs.every(d => {
    if (/\.(frequency|gain)$/.test(d)) return true;
    const mid = d.split('.')[0];
    return /^gain/.test(mid) && feedsParam(mid, edgeList);
  });
}
function hasModulation(edgeList, nodeList) {
  for (const o of nodeList.filter(n => n._kind === 'osc')) {
    if (feedsParam(o._id, edgeList)) return true;
    for (const e of edgeList.filter(x => x[0] === o._id)) {
      const mid = e[1].split('.')[0];
      if (/^gain/.test(mid) && feedsParam(mid, edgeList)) return true;
    }
  }
  return false;
}
function analyze(r) {
  const oscs = r.nodes.filter(n => n._kind === 'osc');
  const noises = r.nodes.filter(n => n._kind === 'noise');
  const voices = oscs.filter(o => !isModulator(o, r.edges));
  const freqs = voices.map(baseFreq).filter(f => f > 0).sort((a, b) => a - b);
  let dissonant = false, kind = null;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) {
    const st = (12 * Math.log2(freqs[j] / freqs[i])) % 12;
    const cls = Math.min(st, 12 - st);
    if (cls < 0.4) { dissonant = true; kind = 'beating(' + freqs[i].toFixed(1) + '/' + freqs[j].toFixed(1) + ')'; }
    else if (Math.abs(cls - 1) < 0.15 || Math.abs(cls - 6) < 0.2) { dissonant = true; kind = 'clash(' + freqs[i].toFixed(1) + '/' + freqs[j].toFixed(1) + ')'; }
  }
  const modulation = hasModulation(r.edges, r.nodes);
  const audible = r.nodes.filter(n => n._kind === 'gain')
    .some(g => g.gain.events.some(e => e.v >= 0.03));
  const allStopped = r.nodes.every(n => n._started === 0 || n._stopped >= n._started);
  const allConnected = [...oscs, ...noises].every(n => r.edges.some(e => e[0] === n._id));
  return { layers: oscs.length + noises.length, dissonant, kind, modulation, audible, allStopped, allConnected, voices: voices.length };
}

const clean = run('hecklerTaunt', { shame: 0 });
const deep = run('hecklerTaunt', { shame: 7 });
const alias = run('hecklerLaugh', { shame: 3 });
const noarg = run('hecklerTaunt');
const ac = analyze(clean), ad = analyze(deep), aa = analyze(alias);
ok('hecklerTaunt(shame 0) plays without throwing', !clean.threw, clean.threw && clean.threw.message);
ok('hecklerTaunt(shame 7) plays without throwing', !deep.threw, deep.threw && deep.threw.message);
ok('hecklerLaugh plays without throwing', !alias.threw, alias.threw && alias.threw.message);
ok('hecklerTaunt() with no arg plays without throwing', !noarg.threw, noarg.threw && noarg.threw.message);
ok('taunt is layered, not a lone beep (>=4 sources)', ac.layers >= 4, `got ${ac.layers}`);
ok('taunt has a detuned/dissonant edge', ac.dissonant || ad.dissonant, 'no beating pair or clash');
ok('taunt has an LFO wobble (modulation)', ac.modulation || ad.modulation, 'no osc->param edge');
ok('shame stacks: shame 7 builds more sound than shame 0',
  ad.layers > ac.layers, `shame0=${ac.layers} shame7=${ad.layers}`);
ok('every started node is stopped (no runaway voices)',
  ac.allStopped && ad.allStopped && aa.allStopped);
ok('every created source is connected (no dropped nodes)',
  ac.allConnected && ad.allConnected && aa.allConnected);
ok('the taunt is audible (a gain peaks >= 0.03, not a silent no-op)',
  ac.audible && ad.audible && aa.audible);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
