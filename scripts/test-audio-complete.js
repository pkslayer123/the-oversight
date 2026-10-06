// Audio completion test. Usage: node scripts/test-audio-complete.js
// Verifies EVERY audioEvent fired in the codebase resolves to a working synth.
// Drives the CombatAudio IIFE from src/js/app.js with a mock Web Audio impl.
// For each event: calls it, asserts no throw, asserts audio nodes were created
// (a synth that creates zero nodes is a silent no-op — FAIL).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ` (${detail})` : '')); console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ---------- mock Web Audio ----------
function mockParam(v) {
  return {
    value: v, calls: [],
    setValueAtTime(val, t) { this.calls.push(['set', val, t]); this.value = val; },
    exponentialRampToValueAtTime(val, t) { this.calls.push(['exp', val, t]); this.value = val; },
    linearRampToValueAtTime(val, t) { this.calls.push(['lin', val, t]); this.value = val; },
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
    setTargetAtTime(val, t, tc) { this.calls.push(['target', val, t, tc]); this.value = val; },
  };
}
const created = { osc: 0, gain: 0, noise: 0, filter: 0, comp: 0, panner: 0 };
function mockNode(kind) {
  if (created[kind] !== undefined) created[kind]++;
  const n = { _kind: kind, connect() {}, disconnect() {}, start() {}, stop() {} };
  if (kind === 'osc') n.frequency = mockParam(440);
  if (kind === 'gain') n.gain = mockParam(0);
  if (kind === 'filter') { n.frequency = mockParam(1000); n.Q = mockParam(1); n.type = ''; }
  if (kind === 'comp') {
    n.threshold = mockParam(0); n.knee = mockParam(0); n.ratio = mockParam(0);
    n.attack = mockParam(0); n.release = mockParam(0);
  }
  if (kind === 'panner') n.pan = mockParam(0);
  if (kind === 'noise') { n.buffer = null; n.loop = false; }
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
    createDynamicsCompressor() { return mockNode('comp'); },
    createStereoPanner() { return mockNode('panner'); },
  };
}

// ---------- extract CombatAudio ----------
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const start = appSrc.indexOf('const CombatAudio = (() => {');
const end = appSrc.indexOf('Game.audio = CombatAudio;') + 'Game.audio = CombatAudio;'.length;
ok('CombatAudio block found', start > 0 && end > start);
const Game = {};
// Stub out Game.* references used inside the IIFE scope
Game.state = { village: { positions: {} }, scholar: {} };
eval(appSrc.slice(start, end) + '\n;globalThis.__CombatAudio = CombatAudio;');
const A = globalThis.__CombatAudio;
ok('CombatAudio extracted', !!A);

// ---------- collect all fired events ----------
const events = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  // Both quote styles (data-driven dispatch uses double quotes); skip
  // doc-comment placeholders like '<name>' which are not real events.
  for (const m of src.matchAll(/audioEvent\(["']([^"']+)["']\)/g)) {
    if (/^[A-Za-z0-9_]+$/.test(m[1])) events.add(m[1]);
  }
}
const eventList = [...events].sort();
ok('events collected from codebase', eventList.length > 0);
console.log(`\nFired events: ${eventList.length}`);

// ---------- init mock audio ----------
global.window = { AudioContext: MockAudioContext };
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } };
A.ensureAudio();

// Snapshot counters helper
function snap() { return { ...created }; }
function nodesCreated(before) {
  return (created.osc - before.osc) + (created.gain - before.gain) +
         (created.noise - before.noise) + (created.filter - before.filter);
}

// Events that are intentionally control/utility (no sound of their own)
const CONTROL = new Set(['ensureAudio', 'toggleMute', 'isMuted', 'round', 'combatEnd',
  'beamSweepStop', 'humStop']);

// Events needing special setup before they'll sound (state-conditional by design)
const NEEDS_SETUP = {
  // humBreak only sounds when the hum is active — start it first
  humBreak: () => { A.humNotice(); },
};

// ---------- test each event ----------
console.log('\n--- Per-event verification ---');
let sounded = 0, silent = 0;
for (const name of eventList) {
  const fn = A[name];
  if (typeof fn !== 'function') {
    ok(`event '${name}' has registered synth`, false, 'NO REGISTRY ENTRY — silent no-op');
    silent++;
    continue;
  }
  ok(`event '${name}' has registered synth`, true);
  // Call it — must not throw
  const before = snap();
  if (NEEDS_SETUP[name]) NEEDS_SETUP[name]();
  const beforeSound = snap(); // count nodes only after setup
  let threw = null;
  // impact -> boom() defers via setTimeout ("silence, then impact" by design).
  // Capture the deferred call by flushing a fake timer.
  let deferredNodes = 0;
  const realSetTimeout = global.setTimeout;
  if (name === 'impact') {
    global.setTimeout = (fn) => { try { fn(); } catch (e) {} deferredNodes = nodesCreated(beforeSound); };
  }
  try { fn({}); } catch (e) { threw = e; }
  global.setTimeout = realSetTimeout;
  ok(`event '${name}' does not throw`, !threw, threw ? threw.message : null);
  if (threw) { silent++; continue; }
  // Must create audio nodes (not a silent no-op)
  const n = nodesCreated(beforeSound) + deferredNodes;
  if (CONTROL.has(name)) {
    ok(`event '${name}' (control) OK`, true);
  } else if (n > 0) {
    sounded++;
  } else {
    ok(`event '${name}' creates audio nodes`, false, `0 nodes — SILENT NO-OP`);
    silent++;
  }
}

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
console.log(`Events with real sound: ${sounded}/${eventList.length - CONTROL.size}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(fail ? 1 : 0);
