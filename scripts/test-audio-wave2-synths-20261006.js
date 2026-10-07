// test-audio-wave2-synths-20261006.js — PROOF: the 12 wave-2 flyer synths
// (Steve 2026-10-06).
//
// The flyer redesign fired 12 hooks (nevermore / nightcourt / statickite)
// with no registered synth — every signature beat played mute. This script
// proves each of the 12 now:
//   1. is registered in the CombatAudio return block,
//   2. executes through the registry with a dummy context WITHOUT throwing,
//   3. produces a real sound graph (started + connected source nodes),
//   4. is actually fired by game.js (the dispatch sites still exist).
//
// Headless: same instrumented mock Web Audio technique as
// test-audio-hooks-20261006.js. Sound QUALITY (freaky?) is Steve's phone's
// verdict; this proves presence + no-throw + real graph.
//
// Usage: node scripts/test-audio-wave2-synths-20261006.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');
const GAME = path.join(ROOT, 'src', 'js', 'game.js');

const HOOKS = [
  'nevermoreCroak', 'nevermoreStrafe', 'nevermoreLand', 'nevermoreClimb',
  'nightcourtSilence', 'nightcourtLand', 'nightcourtClimb',
  'kiteHum', 'kiteMark', 'kiteTransmit', 'kiteBroadcast', 'kiteClimb',
];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (same as test-audio-hooks) ----------
let nodeSeq = 0, nodes = [], edges = [];
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

// ---------- extract & evaluate the CombatAudio IIFE ----------
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

// ---------- 1. registered ----------
for (const h of HOOKS) {
  ok(`${h}: registered in CombatAudio return block`, registry.has(h));
}

// ---------- 2+3. drive each through the registry: no-throw + real graph ----------
function resetGraph() { nodes = []; edges = []; nodeSeq = 0; }
function startedConnectedSources() {
  const ids = new Set(edges.map(e => e[0]));
  return nodes.filter(n => (n._kind === 'osc' || n._kind === 'noise') && n._started && ids.has(n._id));
}
const gameSrc = fs.readFileSync(GAME, 'utf8');
for (const h of HOOKS) {
  resetGraph();
  let err = null;
  try { audio[h]({}); } catch (e) { err = e; }
  ok(`${h}: executes without throwing`, err === null, err && String(err && err.stack || err).slice(0, 200));
  const srcs = startedConnectedSources();
  ok(`${h}: produces a sound graph (${srcs.length} started+connected sources)`, srcs.length >= 1,
    srcs.length === 0 ? 'SILENT — no started sources' : undefined);
  // 4. the dispatch site still exists in game.js
  const fired = gameSrc.includes(`audioEvent('${h}')`) || gameSrc.includes(`audioEvent("${h}")`);
  ok(`${h}: still fired by game.js`, fired);
}

// ---------- nightcourtSilence is deliberately near-silent, not empty ----------
// (Steve 2026-10-06): the hush is the telegraph. It must be a deliberate
// synth with a real graph, not a missing entry — already asserted above,
// plus it must duck the heartbeat (check the source).
ok('nightcourtSilence: deliberate — ducks the heartbeat (source check)',
  /function nightcourtSilence\(\) \{[^}]*duckHeartbeat/.test(
    iifeSrc.slice(iifeSrc.indexOf('function nightcourtSilence'))));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
