// PROOF (Steve 2026-10-08): audio cleanup run.
// Part 1 — manager synths: REMOVAL VETOED. The run brief assumed
// managerCircle/managerCharge/managerDebrief/managerFear had zero callers.
// Audit found:
//   - managerCircle has a LIVE runtime caller: the delegateCircle() dispatch
//     entry (app.js) calls it, and game.js fires audioEvent('delegateCircle')
//     (the delegate circle beat). Removing it would silence a live beat.
//   - managerCharge/managerDebrief/managerFear have no production audioEvent
//     callers, BUT five existing proof scripts assert their continued
//     existence (test-knowledge-gate-20261008.js — same day — explicitly
//     documents "kept by design (audio-section owned, no callers outside
//     dispatch)"; test-wave2-groupC.js, test-wave2c.js,
//     test-audio-round3.js, test-audio-deepening-3.js). Removing them would
//     turn those green suites red, and updating sibling tests is outside
//     this run's area. So: all four stay. This test locks that in — no
//     dispatch entry may dangle (every manager* entry must resolve to a
//     defined synth), and the delegateCircle->managerCircle live path must
//     fire cleanly.
// Part 2 — sunbaskerBite: the glasswing-bask run (2ed99bd) added a
// game.js audioEvent('sunbaskerBite') hook that was a silent no-op
// (Game.audioEvent ignores unregistered names). This run adds the bespoke
// freaky-not-generic synth in app.js's audio section and registers it.
// Proves: defined + registered; fires through the REAL game.js audioEvent
// dispatch (extracted verbatim from game.js source); game.js actually fires
// the hook at the bite-land site; the synth passes the freakiness rubric
// (>=3 layers AND (dissonant OR modulation) AND (sweep OR modulation),
// from test-audio-deepening-freaky.js).
//
// Run: node scripts/test-audio-cleanup-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (same harness as test-contest-synths-20261008.js) ----------
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

// ---------- extract the REAL game.js audioEvent dispatch ----------
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const mAE = gameSrc.match(/audioEvent\(name, data\) \{[\s\S]*?\n    \},/);
if (!mAE) { console.log('  FAIL could not extract audioEvent from game.js'); process.exit(1); }
const shim = eval('({ audio: null, ' + mAE[0].replace(/,\s*$/, '') + ' })');
shim.audio = A;

console.log('--- part 1: manager synth removal audit (removal vetoed) ---');
const MANAGERS = ['managerCircle', 'managerCharge', 'managerDebrief', 'managerFear'];
for (const s of MANAGERS) {
  ok(`${s} synth still defined (removal vetoed)`, new RegExp('function ' + s + '\\(').test(appSrc));
  ok(`${s} still registered in dispatch table`, typeof A[s] === 'function');
}
// no dangling dispatch: every manager* entry in the table resolves to a def
{
  const tableHits = [...appSrc.matchAll(/^\s*(manager\w+)\(\) \{ \1\(\); \},/gm)].map(x => x[1]);
  const dangling = tableHits.filter(n => !new RegExp('function ' + n + '\\(').test(appSrc));
  ok(`no dangling manager* dispatch entries (${tableHits.length} checked)`, dangling.length === 0, dangling.join(','));
}
// managerCircle's live caller path is intact: delegateCircle aliases it, game.js fires it
ok('delegateCircle dispatch entry still aliases managerCircle',
  /delegateCircle\(\) \{ managerCircle\(\); \}/.test(appSrc));
ok("game.js fires audioEvent('delegateCircle') (live caller)",
  gameSrc.includes("audioEvent('delegateCircle')"));
// the other three remain production-unfired — documented, not removed
for (const s of ['managerCharge', 'managerDebrief', 'managerFear']) {
  ok(`${s} has no production audioEvent caller (unfired, kept by design)`,
    !gameSrc.includes(`audioEvent('${s}')`));
}
// the kept live path fires cleanly through the real dispatch
{
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let fired = 0, threw = null;
  const orig = A.delegateCircle;
  A.delegateCircle = (...a) => { fired++; return orig.apply(A, a); };
  try { shim.audioEvent('delegateCircle'); } catch (e) { threw = e; }
  A.delegateCircle = orig;
  ok('delegateCircle->managerCircle fires through real dispatch, no error', !threw && fired >= 1,
    threw ? String(threw).slice(0, 120) : `fired=${fired}`);
}

console.log('--- part 2: sunbaskerBite synth ---');
ok('synth defined: sunbaskerBite', new RegExp('function sunbaskerBite\\(').test(appSrc));
ok('registered on CombatAudio: sunbaskerBite', typeof A.sunbaskerBite === 'function');
ok("game.js fires audioEvent('sunbaskerBite') at the bite-land site",
  gameSrc.includes("audioEvent('sunbaskerBite')"));
// fires through the REAL game.js dispatch path (not a hand-rolled shim)
{
  nodeSeq = 0; nodes.length = 0; edges.length = 0;
  let fired = 0, threw = null;
  const orig = A.sunbaskerBite;
  A.sunbaskerBite = (...a) => { fired++; return orig.apply(A, a); };
  try { shim.audioEvent('sunbaskerBite'); } catch (e) { threw = e; }
  A.sunbaskerBite = orig;
  ok("audioEvent('sunbaskerBite') fires the synth via real dispatch", !threw && fired >= 1,
    threw ? String(threw).slice(0, 120) : `fired=${fired}`);
}
// unknown-name dispatch still no-ops (the old sunbaskerBite state), guard intact
{
  let threw = null;
  try { shim.audioEvent('definitelyNotASynth_xyz'); } catch (e) { threw = e; }
  ok('unregistered hook still silent no-op', !threw);
}

// ---------- freakiness analysis (rubric from test-audio-deepening-freaky.js) ----------
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
  const feedsGainFeedingParam = (id) => edges.some(e => {
    const mid = e[1].split('.')[0];
    return e[0] === id && /^gain/.test(mid) && feedsParam(mid);
  });
  const fmEdge = oscs.some(o => feedsParam(o._id) && edges.some(e =>
    e[0] === o._id && /^osc/.test(e[1].split('.')[0]) && /\.frequency$/.test(e[1]))) ||
    oscs.some(o => feedsGainFeedingParam(o._id) && edges.some(e => {
      if (e[0] !== o._id) return false;
      const mid = e[1].split('.')[0];
      return /^gain/.test(mid) && edges.some(e2 => e2[0] === mid && /^osc/.test(e2[1].split('.')[0]) && /\.frequency$/.test(e2[1]));
    }));
  return {
    name, threw, layers: oscs.length + noises.length, oscs: oscs.length, noises: noises.length,
    dissonant, dissonanceKind, sweep, modulation, types, fmEdge, freqs,
  };
}
console.log('--- freakiness (rubric: >=3 layers AND (dissonant OR modulation) AND (sweep OR modulation)) ---');
{
  const r = analyze('sunbaskerBite');
  const freaky = r.layers >= 3 && (r.dissonant || r.modulation) && (r.sweep || r.modulation);
  ok(`sunbaskerBite: freaky (layers=${r.layers} ${r.dissonanceKind || ''}${r.sweep ? ' sweep' : ''}${r.modulation ? ' mod' : ''}${r.fmEdge ? ' FM' : ''})`,
    !r.threw && freaky, r.threw ? 'threw: ' + String(r.threw).slice(0, 100) : `analysis=${JSON.stringify(r)}`);
  // signature markers: the molten pair beats, the jaw is FM, the collapse sweeps down
  ok('sunbaskerBite: detuned beating pair (molten gold)', r.dissonant && r.dissonanceKind === 'beating');
  ok('sunbaskerBite: FM jaw (osc->gain->osc.frequency)', r.fmEdge);
  ok('sunbaskerBite: collapse sweep (600->90Hz)', r.sweep);
  ok('sunbaskerBite: glassy shear present (>=3 noise layers)', r.noises >= 3);
  console.log(`  signature: types=${r.types} osc=${r.oscs} noise=${r.noises} freqs=[${r.freqs.join(',')}]`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
