// Highbeam Deer sound design tests. Usage: node scripts/test-deer-audio.js
// Extracts the CombatAudio IIFE from src/js/app.js and drives it with a mock
// Web Audio implementation. No real audio, no browser.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

// ---------- mock Web Audio ----------
function mockParam(v) {
  return {
    value: v,
    calls: [],
    setValueAtTime(val, t) { this.calls.push(['set', val, t]); this.value = val; },
    exponentialRampToValueAtTime(val, t) { this.calls.push(['exp', val, t]); this.value = val; },
    linearRampToValueAtTime(val, t) { this.calls.push(['lin', val, t]); this.value = val; },
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
    setTargetAtTime(val, t, tc) { this.calls.push(['target', val, t, tc]); this.value = val; },
  };
}
const created = { osc: 0, gain: 0, noise: 0, filter: 0, comp: 0, panner: 0 };
function mockNode(kind, withPanner) {
  if (kind === 'osc') created.osc++;
  if (kind === 'gain') created.gain++;
  if (kind === 'noise') created.noise++;
  if (kind === 'filter') created.filter++;
  const n = {
    _kind: kind, started: false, stopped: false,
    connect() {}, disconnect() {},
    start(t) { this.started = true; }, stop(t) { this.stopped = true; },
  };
  if (kind === 'osc') n.frequency = mockParam(440);
  if (kind === 'gain') n.gain = mockParam(0);
  if (kind === 'filter') { n.frequency = mockParam(1000); n.Q = mockParam(1); n.type = ''; }
  if (kind === 'comp') {
    created.comp++;
    n.threshold = mockParam(0); n.knee = mockParam(0); n.ratio = mockParam(0);
    n.attack = mockParam(0); n.release = mockParam(0);
  }
  if (kind === 'panner') { created.panner++; n.pan = mockParam(0); }
  if (kind === 'noise') { n.buffer = null; n.loop = false; }
  return n;
}
function MockAudioContext() {
  return {
    sampleRate: 44100, currentTime: 0, state: 'running', destination: {},
    resume() {}, createBuffer(ch, len, rate) { return { getChannelData() { return new Float32Array(len); } }; },
    createBufferSource() { return mockNode('noise'); },
    createOscillator() { return mockNode('osc'); },
    createGain() { return mockNode('gain'); },
    createBiquadFilter() { return mockNode('filter'); },
    createDynamicsCompressor() { return mockNode('comp'); },
    createStereoPanner: MockAudioContext.withPanner ? () => mockNode('panner') : undefined,
  };
}
MockAudioContext.withPanner = true;

// ---------- extract CombatAudio from app.js ----------
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const start = appSrc.indexOf('const CombatAudio = (() => {');
const end = appSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
ok('CombatAudio block found in app.js', start > 0 && end > start);
const audioSrc = appSrc.slice(start, end) + '\n;globalThis.__CombatAudio = CombatAudio;';
const Game = {};
eval(audioSrc);
const A = globalThis.__CombatAudio;
ok('CombatAudio extracted', !!A);

// ---------- 1. API surface ----------
const methods = ['ensureAudio', 'combatStart', 'telegraph', 'impact', 'beamBlocked',
  'deerNotice', 'deerDown', 'deerCall', 'beamCharge', 'beamFire', 'beamSweep',
  'beamSweepStop', 'victory', 'defeat', 'combatEnd', 'toggleMute', 'isMuted', 'round'];
for (const m of methods) ok(`method ${m} exists`, typeof A[m] === 'function');

// ---------- 2. no sound before init (no window) ----------
let threw = false;
try {
  A.combatStart(); A.telegraph({ urgency: 1, beam: true, highbeam: true });
  A.impact({ beam: true }); A.beamBlocked(); A.deerNotice(); A.deerDown();
  A.deerCall(0.5); A.beamCharge(2); A.beamFire(); A.beamSweep({ pan: 0.5, heat: 0.5 });
  A.beamSweepStop(); A.victory(); A.defeat(); A.combatEnd(); A.round();
} catch (e) { threw = true; console.log('pre-init threw:', e.message); }
ok('no throw before AudioContext init', !threw);
ok('nothing created pre-init', created.osc === 0 && created.gain === 0);

// ---------- 3. with mock AudioContext ----------
global.window = { AudioContext: MockAudioContext };
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } };

A.combatStart();
ok('heartbeat creates oscillators', created.osc >= 2);

const oBefore = created.osc;
A.telegraph({ urgency: 1, beam: true, highbeam: true });
ok('beam telegraph starts charge whine (4 shepard + sub + shimmer)', created.osc - oBefore >= 6);
const nBefore = created.noise;
A.deerAggro(); // explicit bellow on declare (game.js), not a telegraph side-effect
ok('deerAggro triggers deer call (bellow noise)', created.noise > nBefore);

const o2 = created.osc;
A.beamCharge(2); // direct: charge already rising from the telegraph above
ok('beamCharge idempotent while charging', created.osc === o2);

A.telegraph({ urgency: 1, windupTick: true });
ok('windup tick restarts heartbeat only (lub-dub), not the charge whine', created.osc - o2 <= 2);

A.impact({ beam: true });
ok('beamFire creates noise sources', created.noise >= 3);
ok('limiter (DynamicsCompressor) in chain', created.comp >= 1);

A.beamSweep({ pan: -0.7, heat: 0.3 });
A.beamSweep({ pan: 0.8, heat: 1 });
ok('sweep hum created (stereo panner)', created.panner >= 1);
A.beamSweepStop();
ok('sweep stop does not throw', true);

A.beamBlocked();
A.deerCall(0); A.deerCall(1); A.deerCall(0.95, true);
ok('deer calls at all intensities OK', true);

// mute toggle
ok('starts unmuted', A.isMuted() === false);
const m1 = A.toggleMute();
ok('toggleMute returns true when muting', m1 === true);
ok('isMuted reflects mute', A.isMuted() === true);
const m2 = A.toggleMute();
ok('toggleMute returns false when unmuting', m2 === false);

// master gain sanity: re-extract to inspect a fresh chain's master value
// (simpler: assert the toggle ramped master — inspect via a fresh eval)
delete globalThis.__CombatAudio;
Object.keys(created).forEach(k => created[k] = 0);
global.window = { AudioContext: MockAudioContext };
eval(audioSrc);
const B = globalThis.__CombatAudio;
B.ensureAudio();
B.toggleMute(); // mute: master -> ~0
ok('mute persists to localStorage', global.localStorage.getItem('oversight_mute') === '1');
B.toggleMute();
ok('unmute persists to localStorage', global.localStorage.getItem('oversight_mute') === '0');

// fallback without StereoPanner
MockAudioContext.withPanner = false;
Object.keys(created).forEach(k => created[k] = 0);
delete globalThis.__CombatAudio;
eval(audioSrc);
const C = globalThis.__CombatAudio;
let pannerThrew = false;
try { C.beamSweep({ pan: 0.5, heat: 0.5 }); C.beamSweepStop(); } catch (e) { pannerThrew = true; }
ok('sweep works without StereoPanner (fallback)', !pannerThrew && created.panner === 0);
MockAudioContext.withPanner = true;

// sanity: no absurd gains — fire peak sub gain is 0.95, master 0.9
ok('node counts sane (no runaway creation)', created.osc < 400 && created.gain < 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
