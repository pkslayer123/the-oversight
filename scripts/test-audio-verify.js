// test-audio-verify.js — dispatch EVERY registered synth through its real return-object
// path with a stubbed AudioContext. No real audio: we capture scheduled calls and
// assert Web-Audio-real rules (exponentialRamp > 0, stop >= start, finite values).
// Usage: node scripts/test-audio-verify.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(REPO, 'src/js/app.js'), 'utf8');
const start = appSrc.indexOf('const CombatAudio = (() => {');
const end = appSrc.indexOf('Game.audio = CombatAudio;');
if (start < 0 || end < 0) { console.error('FAIL: could not locate CombatAudio IIFE'); process.exit(1); }
const iifeSrc = appSrc.slice(start, end);

// ---------- Web-Audio-real rule emulation ----------
const problems = [];
function chk(cond, msg) { if (!cond) problems.push(msg); }

function makeParam(nodeId, pname) {
  return {
    _id: nodeId, _p: pname, value: 0,
    setValueAtTime(v, t) { chk(Number.isFinite(v), `${nodeId}.${pname}: setValueAtTime non-finite ${v}`); this.value = v; },
    linearRampToValueAtTime(v, t) { chk(Number.isFinite(v), `${nodeId}.${pname}: linearRamp non-finite ${v}`); },
    exponentialRampToValueAtTime(v, t) {
      // REAL rule: exponentialRamp throws InvalidStateError for value <= 0.
      chk(Number.isFinite(v) && v > 0, `${nodeId}.${pname}: exponentialRampToValueAtTime(${v}) would THROW in real WebAudio`);
    },
    setTargetAtTime(v, t, tc) { chk(Number.isFinite(v) && Number.isFinite(tc) && tc > 0, `${nodeId}.${pname}: setTargetAtTime bad args`); },
    cancelScheduledValues(t) {},
    setValueCurveAtTime() {},
  };
}

let nodeSeq = 0;
const nodes = [];
function makeNode(type) {
  const id = `${type}#${++nodeSeq}`;
  const n = {
    _id: id, type,
    gain: makeParam(id, 'gain'), frequency: makeParam(id, 'frequency'),
    detune: makeParam(id, 'detune'), Q: makeParam(id, 'Q'),
    playbackRate: makeParam(id, 'playbackRate'), pan: makeParam(id, 'pan'),
    threshold: makeParam(id, 'threshold'), knee: makeParam(id, 'knee'),
    ratio: makeParam(id, 'ratio'), attack: makeParam(id, 'attack'),
    release: makeParam(id, 'release'),
    type: 'sine', loop: false, buffer: null, curve: null,
    startedAt: null, stoppedAt: null, everStarted: false,
    connect(dst) {}, disconnect() {},
    start(t) { this.everStarted = true; this.startedAt = t == null ? 0 : t; this._startExplicit = t != null; },
    stop(t) {
      // REAL rules: (a) stop() before start() in call order throws InvalidStateError;
      // (b) stop(explicit when) with when < start(explicit when) is a zero-length
      // scheduling bug. stop() with NO arg means "stop immediately" — legal even
      // when currentTime is ahead, so it is NOT flagged.
      chk(this.everStarted, `${id}: stop() called before start() — throws InvalidStateError in real WebAudio`);
      this.stoppedAt = t == null ? 0 : t;
      if (t != null && this._startExplicit) chk(this.stoppedAt >= this.startedAt,
        `${id}: stop(${this.stoppedAt}) < start(${this.startedAt}) schedules a zero-length sound`);
    },
  };
  nodes.push(n);
  return n;
}

class FakeCtx {
  constructor() { this.currentTime = 100; this.sampleRate = 44100; this.state = 'running'; this.destination = makeNode('destination'); }
  resume() { return Promise.resolve(); }
  createOscillator() { return makeNode('osc'); }
  createGain() { return makeNode('gain'); }
  createBiquadFilter() { return makeNode('filter'); }
  createBufferSource() { return makeNode('bufsrc'); }
  createDynamicsCompressor() { return makeNode('comp'); }
  createStereoPanner() { return makeNode('panner'); }
  createWaveShaper() { return makeNode('shaper'); }
  createBuffer(ch, len, sr) {
    return { numberOfChannels: ch, length: len, sampleRate: sr,
      getChannelData() { return new Float32Array(len); } };
  }
}

// setInterval: capture callback, drain once (bounded) so heartbeat/hum loops get exercised.
const timerQueue = [];
const sandbox = {
  console,
  Math, JSON, Object, Array, Float32Array, Number, String, Boolean, Promise,
  Error, isNaN, parseInt, parseFloat, Infinity, NaN,
  window: { AudioContext: FakeCtx },
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: () => null,
    createElement: () => ({ classList: { add() {}, remove() {} }, style: {}, offsetWidth: 0, appendChild() {}, id: '' }),
    body: { appendChild() {} },
  },
  setInterval(cb) { timerQueue.push(cb); return timerQueue.length; },
  clearInterval() {},
  setTimeout(cb) { timerQueue.push(cb); return timerQueue.length; },
  clearTimeout() {},
  Game: {},
};
vm.createContext(sandbox);
vm.runInContext(iifeSrc + '\nGame.audio = CombatAudio;', sandbox, { filename: 'audio-iife.js' });
const audio = sandbox.Game.audio;
if (!audio) { console.error('FAIL: Game.audio not set'); process.exit(1); }

// Drain captured timer callbacks once (heartbeat beat, etc.), bounded.
for (let i = 0; i < Math.min(timerQueue.length, 40); i++) {
  try { timerQueue[i](); } catch (e) { problems.push('timer callback threw: ' + e.message); }
}

// ---------- entry enumeration ----------
const retBlock = iifeSrc.slice(iifeSrc.indexOf('return {'), iifeSrc.lastIndexOf('};'));
const entries = [...new Set([...retBlock.matchAll(/^\s{6}([A-Za-z_][\w$]*)\s*\(/gm)].map(m => m[1]))];
console.log(`registered dispatch entries: ${entries.length}`);

// Representative args per entry (arrays of arg-lists to try).
const ARGS = {
  telegraph: [[{ urgency: 2 }], [{ urgency: 1, pattern: 'burst' }], [{ urgency: 3, pattern: 'direct' }],
    [{ beam: true, highbeam: true, urgency: 2 }], [{ pattern: 'line', urgency: 1 }], [{ pattern: 'rush' }],
    [{ pattern: 'single' }], [{ pattern: 'ambush' }], [{ windupTick: true }], [{}]],
  impact: [[{ beam: true, highbeam: true }], [{ pattern: 'burst' }], [{ pattern: 'charge' }],
    [{ pattern: 'direct' }], [{ pattern: 'line' }], [{ pattern: 'rush' }], [{ pattern: 'single' }],
    [{ pattern: 'ambush' }], [{}]],
  humRise: [[{ stacks: 5 }], [{}]], baskCharge: [[{ charge: 0.7 }], [{}]],
  glasswingShadowClose: [[{ turns: 2 }], [{}]], round: [[{ round: 7 }], [{}]],
  crash: [[{ cause: 'bulldozer' }], [{}]], levelup: [[{ quiet: false }], [{}]],
  passiveUnlock: [[{ quiet: true }], [{}]], beamSweep: [[{ pan: -0.5, heat: 0.8 }], [0.5, 0.3]],
  deerCall: [[0.5], [0.9, true]], deerNotice: [[]], beamCharge: [[1.5]],
  patternWindup: [[{ pattern: 'charge', urgency: 2 }], [{ pattern: 'beam', urgency: 1 }], [{}]],
  patternResolve: [[{ pattern: 'burst' }], [{ pattern: 'ambush' }], [{}]],
  lockonTick: [[{ dur: 1.2 }], [{}]], eurekaTick: [[{ tick: 3 }], [{}]],
  paperRustle: [[{ pages: 3 }], [{}]], hypeEncourage: [[{ stacks: 2 }], [{}]],
  projectorHum: [[{ heat: 0.4 }], [{}]], droneCount: [[{ n: 3 }], [{}]],
  staticCry: [[{ panic: 1 }], [{}]],
};
// Entries expected to be silent by design (stoppers / state, not synths).
const SILENT_OK = new Set(['ensureAudio', 'toggleMute', 'isMuted', 'combatEnd', 'humStop',
  'beamSweepStop', 'patternWindup', 'patternResolve']);
// beamSweep is a sustained hum: idempotent — the second call creates no nodes.
// Exercise its creation path by stopping any prior hum first (beamFire() starts one).
function preArgs(name) {
  if (name === 'beamSweep') { try { audio.beamSweepStop(); } catch (e) {} }
}

let pass = 0, fail = 0;
const failures = [];
const silent = [];
for (const name of entries) {
  preArgs(name);
  const before = nodes.length;
  const argSets = ARGS[name] || [[], [{}]];
  let threw = null;
  for (const a of argSets) {
    try { audio[name](...a); }
    catch (e) { threw = e; break; }
  }
  // drain any timers the call scheduled
  for (let i = 0; i < Math.min(timerQueue.length, 20); i++) {
    try { timerQueue[i](); } catch (e) { threw = threw || e; }
  }
  timerQueue.length = 0;
  const newNodes = nodes.length - before;
  if (threw) { fail++; failures.push(`${name}: threw ${threw.constructor.name}: ${threw.message}`); }
  else if (newNodes === 0 && !SILENT_OK.has(name)) { silent.push(name); pass++; }
  else pass++;
}

console.log(`dispatch: ${pass} passed, ${fail} failed of ${entries.length}`);
if (failures.length) { console.log('--- THROWING SYNTHS ---'); failures.forEach(f => console.log('FAIL ' + f)); }
if (silent.length) { console.log('--- SYNTHS THAT SCHEDULED ZERO NODES (suspect silent) ---'); silent.forEach(s => console.log('SILENT ' + s)); }
if (problems.length) { console.log('--- WEB-AUDIO RULE VIOLATIONS ---'); [...new Set(problems)].slice(0, 30).forEach(p => console.log('RULE ' + p)); }

// ---------- static: internal synths with no dispatch path ----------
const internal = [...new Set([...iifeSrc.matchAll(/function\s+([A-Za-z_][\w$]*)\s*\(/g)].map(m => m[1]))];
const unreach = internal.filter(fn => {
  if (entries.includes(fn)) return false;
  const uses = (iifeSrc.match(new RegExp(`\\b${fn}\\s*\\(`, 'g')) || []).length;
  return uses <= 1; // only its own definition
});
console.log(`internal synth funcs with no reachable dispatch: ${unreach.length}${unreach.length ? ' -> ' + unreach.join(', ') : ''}`);

// ---------- static: fired-but-unregistered (grep all of src/js + data) ----------
const fired = new Set();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!p.includes('_archive')) walk(p); }
  else if (/\.(js|json)$/.test(p)) {
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/audioEvent\(\s*['"]([A-Za-z_0-9]+)['"]/g)) fired.add(m[1]);
    for (const m of s.matchAll(/(?:noticeAudio|deathAudio|declareAudio|aggroAudio|resolveAudio)\s*[:=]\s*['"]([A-Za-z_0-9]+)['"]/g)) fired.add(m[1]);
  }
});
walk(path.join(REPO, 'src'));
const orphan = [...fired].filter(n => !entries.includes(n));
console.log(`fired-but-unregistered audio names: ${orphan.length}${orphan.length ? ' -> ' + orphan.join(', ') : ''}`);

const totalFail = fail + problems.length + unreach.length + orphan.length;
console.log(totalFail === 0 ? 'AUDIO-VERIFY: ALL GREEN' : `AUDIO-VERIFY: ${totalFail} issue(s)`);
process.exit(totalFail === 0 ? 0 : 1);
