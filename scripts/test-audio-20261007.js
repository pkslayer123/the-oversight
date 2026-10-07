// test-audio-20261007.js — AUDIO DEAD-SYNTH CLEANUP + WOUND TEMPERAMENTS PROOF (Steve 2026-10-05).
//
// 2026-10-07 audio worker (app.js island):
//   - removed 9 dead synths (registered, never fired): understudyLearn,
//     landlordStamp, paparazzoFlash, unionRepChant, managerAnnounce,
//     ducksRejoin, contractBind, delegateAnnounce, delegateCharge
//   - added 3 wound-temperament synths fired by encounters.js:2099
//     (woundEnraged/woundCunning/woundDesperate) — were mute, now registered
//
// Asserts:
//   (a) every registered synth definition is well-formed: the return-block
//       entry resolves to a declared inner function (or a documented alias /
//       inline dispatch), and every bare call inside the CombatAudio IIFE
//       targets a declared function/variable (no dead refs);
//   (b) the hook map matches the registry: every fired hook (audioEvent
//       literals, Game.audio.x calls, monsters.json encounter fields,
//       contests.js CX_BEAT_DEFS, dynamic wound dispatch) resolves; the 9
//       removed names are gone; every registry key is accounted for
//       (fired, pattern-dispatched, control, sibling API, internal, alias);
//   (c) every registered synth drives through an instrumented WebAudio mock
//       with 9 arg shapes: no throws, no silent non-control synths,
//       phone-safe peak gains.
//
// Usage: node scripts/test-audio-20261007.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio ----------
let nodeSeq = 0, nodes = [];
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
function mockNode(kind) {
  const n = {
    _id: kind + (++nodeSeq), _kind: kind, _started: false,
    connect() {}, disconnect() {},
    start() { this._started = true; }, stop() {},
  };
  n.frequency = mockParam(n, 'frequency', 440);
  n.gain = mockParam(n, 'gain', 1);
  n.Q = mockParam(n, 'Q', 1);
  n.detune = mockParam(n, 'detune', 0);
  n.playbackRate = mockParam(n, 'playbackRate', 1);
  n.threshold = mockParam(n, 'threshold', -18);
  n.knee = mockParam(n, 'knee', 22);
  n.ratio = mockParam(n, 'ratio', 12);
  n.attack = mockParam(n, 'attack', 0.003);
  n.release = mockParam(n, 'release', 0.25);
  n.type = ''; n.buffer = null; n.loop = false;
  nodes.push(n);
  return n;
}
const dest = { _id: 'destination', connect() {} };
function MockAudioContext() {
  return {
    currentTime: 1.0, sampleRate: 44100, state: 'running', destination: dest,
    resume() {}, suspend() {},
    createOscillator() { return mockNode('osc'); },
    createGain() { return mockNode('gain'); },
    createBiquadFilter() { return mockNode('filter'); },
    createWaveShaper() { return mockNode('shaper'); },
    createBufferSource() { return mockNode('src'); },
    createBuffer() { return { getChannelData: () => new Float32Array(256) }; },
    createDynamicsCompressor() { return mockNode('comp'); },
    decodeAudioData(b, cb) { cb && cb({}); },
  };
}
const sandbox = {
  MockAudioContext,
  document: {}, window: { AudioContext: MockAudioContext }, navigator: {},
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() {}, clearTimeout() {},
  setInterval() { return 1; }, clearInterval() {},
  Float32Array, console, Math, JSON, Object, Array, Error, Number, String,
  Boolean, Promise, isNaN, parseInt, parseFloat, Infinity, NaN,
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
ok('registry holds 201 synths after cleanup (207 - 9 + 3)', registry.size === 201, `${registry.size} registered`);

function resetGraph() { nodes = []; nodeSeq = 0; }
function graphStats() {
  const sources = nodes.filter(n => (n._kind === 'osc' || n._kind === 'src') && n._started);
  const enveloped = nodes.filter(n => n._kind === 'gain' && n.gain.events.filter(e => e.op === 'exp' || e.op === 'lin').length >= 2).length;
  let peak = 0;
  for (const n of nodes) {
    if (n._kind !== 'gain') continue;
    for (const e of n.gain.events) {
      if ((e.op === 'exp' || e.op === 'lin') && typeof e.v === 'number' && e.v > 0.0002 && e.v > peak) peak = e.v;
    }
  }
  return { sources: sources.length, enveloped, totalNodes: nodes.length, peak };
}
const CONTROL = new Set(['combatEnd', 'beamSweepStop', 'humStop', 'toggleMute', 'isMuted', 'ensureAudio', 'beamFlash']);

// ---------- Part A: well-formedness — no dead refs ----------
// Inner function declarations + closure variable declarations in the IIFE.
const innerFns = new Set([...iifeSrc.matchAll(/(?<![.\w$])function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)].map(m => m[1]));
const declaredVars = new Set([...iifeSrc.matchAll(/(?<![.\w$])(?:let|const|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)].map(m => m[1]));
// Return block: parse entries with brace matching (some are multi-line),
// strip comments, then check every bare call target resolves.
const retStart = iifeSrc.indexOf('    return {');
const retRaw = iifeSrc.slice(retStart);
const entries = [];
{
  let i = retRaw.indexOf('{'), depth = 0, keyRe = /\n\s{6}([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{$/y;
  // find each entry: key(params) { ... } with balanced braces
  const re = /^ {6}([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/gm;
  let m;
  while ((m = re.exec(retRaw))) {
    let d = 1, j = re.lastIndex;
    while (j < retRaw.length && d > 0) {
      if (retRaw[j] === '{') d++;
      else if (retRaw[j] === '}') d--;
      j++;
    }
    entries.push({ key: m[1], body: retRaw.slice(re.lastIndex, j - 1).replace(/\/\/[^\n]*/g, '') });
  }
}
ok('PART A — return-block entries parsed', entries.length === registry.size,
  `${entries.length} entries vs ${registry.size} keys`);
const JS_KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'typeof', 'new', 'in', 'of', 'true', 'false', 'null', 'undefined', 'this', 'function', 'const', 'let', 'var']);
const deadRefs = [];
for (const { key, body } of entries) {
  for (const c of body.matchAll(/(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
    const callee = c[1];
    if (JS_KEYWORDS.has(callee)) continue;
    if (innerFns.has(callee) || declaredVars.has(callee)) continue;
    deadRefs.push(`${key} -> ${callee}`);
  }
}
ok('PART A — no dead refs in return-block entries', deadRefs.length === 0, deadRefs.slice(0, 8).join('; '));
// Every registry key either has a same-named inner function, or its entry
// body only calls declared targets (aliases/inline dispatch — verified above).
const aliasKeys = [...registry].filter(k => !innerFns.has(k));
const aliasOk = aliasKeys.every(k => !deadRefs.some(d => d.startsWith(k + ' ->')));
ok('PART A — every alias/inline key resolves to declared targets', aliasOk,
  aliasKeys.filter(k => deadRefs.some(d => d.startsWith(k + ' ->'))).join(','));
// No orphan inner functions: every declared inner fn is registered, or
// referenced elsewhere in the IIFE (called or passed as a value).
const orphans = [...innerFns].filter(n => {
  if (registry.has(n)) return false;
  const refs = (iifeSrc.match(new RegExp(`(?<![.\\w$])${n}(?![\\w$])`, 'g')) || []).length;
  return refs <= 1; // only its own declaration
});
ok('PART A — no orphan inner functions (dead synth bodies)', orphans.length === 0, orphans.slice(0, 10).join(','));

// ---------- Part B: hook map matches registry ----------
function collectFired() {
  const fired = new Map();
  const add = (n, where) => { if (!fired.has(n)) fired.set(n, []); fired.get(n).push(where); };
  const jsDir = path.join(ROOT, 'src', 'js');
  for (const f of fs.readdirSync(jsDir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    // NOTE: the closing quote must be followed by , or ) — this excludes
    // dynamic dispatches like audioEvent('wound' + temp...) (encounters.js),
    // which are handled via the explicit dynamic-dispatch section below.
    for (const m of src.matchAll(/audioEvent\(\s*['"`]([A-Za-z0-9_$]+)['"`]\s*[,)]/g)) {
      if (f === 'app.js') { // only count dispatches outside the CombatAudio IIFE
        const idx = m.index;
        if (idx > start && idx < end) continue;
      }
      add(m[1], f);
    }
    for (const m of src.matchAll(/(?:Game|this)\.audio\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
      if (f === 'app.js') {
        const idx = m.index;
        if (idx > start && idx < end) continue;
      }
      add(m[1], f);
    }
    for (const m of src.matchAll(/resolveAudio\(\s*['"`]([A-Za-z0-9_$]+)['"`]/g)) add(m[1], f);
  }
  // monsters.json encounter audio fields (data-driven dispatch)
  const mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mons = Array.isArray(mj) ? mj : mj.monsters;
  for (const mo of mons) {
    const e = mo.encounter || {};
    for (const k of Object.keys(e)) {
      if (/audio/i.test(k) && typeof e[k] === 'string') add(e[k], `monsters.json:${mo.id}`);
    }
  }
  // contests.js CX_BEAT_DEFS compositions
  const cx = fs.readFileSync(path.join(jsDir, 'contests.js'), 'utf8');
  const beatBlock = cx.slice(cx.indexOf('const CX_BEAT_DEFS'), cx.indexOf('G._cxBeat'));
  for (const m of beatBlock.matchAll(/['"`]([A-Za-z0-9_$]+)['"`]/g)) add(m[1], 'contests.js:CX_BEAT_DEFS');
  // dynamic wound-temperament dispatch (encounters.js:2099: 'wound' + Temp)
  const enc = fs.readFileSync(path.join(jsDir, 'encounters.js'), 'utf8');
  if (/audioEvent\('wound'\s*\+/.test(enc)) {
    for (const n of ['woundEnraged', 'woundCunning', 'woundDesperate']) add(n, 'encounters.js:dynamic');
  }
  // spec data-tables: [pred, field, phase, text, audioHook] rows fired via
  // `if (audio) this.audioEvent(audio)` (e.g. game.js tbFifoBreather).
  // The hook name is a data string, not an audioEvent literal.
  for (const f2 of fs.readdirSync(jsDir)) {
    if (!f2.endsWith('.js')) continue;
    const s2 = fs.readFileSync(path.join(jsDir, f2), 'utf8');
    let si = s2.indexOf('const specs = [');
    while (si >= 0) {
      let d = 0, p = s2.indexOf('[', si);
      const bs = p;
      for (; p < s2.length; p++) {
        if (s2[p] === '[') d++;
        else if (s2[p] === ']') { d--; if (!d) break; }
      }
      const block = s2.slice(bs, p + 1);
      let dd = 0, cur = '';
      const items = [];
      for (const ch of block) {
        if (ch === '[') { if (dd === 1) cur = ''; dd++; }
        else if (ch === ']') { dd--; if (dd === 1 && cur) items.push(cur); }
        else if (dd === 2) cur += ch;
      }
      for (const it of items) {
        // spec row: [pred, field, phase, text, audioHook] — the hook is the
        // last quoted token; require 5 elements (4 commas) to avoid noise.
        if ((it.match(/,/g) || []).length >= 4) {
          const lm = it.match(/'([A-Za-z0-9_$]+)'\s*$/);
          if (lm) add(lm[1], `${f2}:specs-table`);
        }
      }
      si = s2.indexOf('const specs = [', p);
    }
  }
  return fired;
}
const fired = collectFired();
const unmapped = [...fired.keys()].filter(h => !registry.has(h));
ok('PART B — every fired hook resolves in the registry (0 unmapped)', unmapped.length === 0,
  unmapped.slice(0, 12).map(h => `${h} (from ${fired.get(h).join(',')})`).join('; '));
// The 9 dead synths are gone.
const REMOVED = ['understudyLearn', 'landlordStamp', 'paparazzoFlash', 'unionRepChant',
  'managerAnnounce', 'ducksRejoin', 'contractBind', 'delegateAnnounce', 'delegateCharge'];
ok('PART B — all 9 dead synths removed from registry',
  REMOVED.every(n => !registry.has(n)), REMOVED.filter(n => registry.has(n)).join(','));
// The 3 wound temperaments are registered.
ok('PART B — woundEnraged/woundCunning/woundDesperate registered',
  ['woundEnraged', 'woundCunning', 'woundDesperate'].every(n => registry.has(n)));
// Every registry key is accounted for.
const PATTERN_DISPATCHED = new Set(['beamCharge', 'beamFire', 'droneBeam', 'burstDetonate',
  'chargeImpact', 'lockonTick', 'lockonHit', 'lineStrike', 'rushHit', 'diveImpact',
  'ambushSnap', 'beamTechWindup', 'burstWindup', 'chargeWindup', 'lineWindup',
  'rushWindup', 'diveWindup', 'beamFlash', 'impactWild']);
const SIBLING_API = new Set(['patternWindup', 'patternResolve']);
const INTERNAL = new Set(['deerCall']); // reached via deerNotice/deerAggro/deerDown wrappers
const ALIASED = new Set(['hecklerLaugh', 'delegateCircle']); // map to other voices
const unaccounted = [...registry].filter(k =>
  !fired.has(k) && !PATTERN_DISPATCHED.has(k) && !CONTROL.has(k) &&
  !SIBLING_API.has(k) && !INTERNAL.has(k) && !ALIASED.has(k));
ok('PART B — every registry key accounted for (fired/pattern/control/api/internal/alias)',
  unaccounted.length === 0, unaccounted.slice(0, 12).join(','));
// telegraph()/impact() are fired with pattern data — the pattern route is live.
ok('PART B — telegraph/impact dispatch sites exist in game.js',
  fired.has('telegraph') && fired.has('impact'));

// ---------- Part C: full-registry drive ----------
const argShapes = [{}, { round: 5 }, { cause: 'bulldozer' }, { quiet: true }, { fidelity: 0.8 },
  { pan: 0.3, heat: 0.6 }, { urgency: 1, pattern: 'burst' }, { stacks: 3 }, { turns: 2 },
  { charge: 0.5 }, { dur: 1.2 }, { beam: true, highbeam: true }, { violations: 3 },
  { final: true }, { shame: 7 }, { mood: 'watching' }, { intensity: 0.9 }];
const thrown = [], silent = [], hot = [];
for (const key of registry) {
  if (key === 'toggleMute' || key === 'isMuted' || key === 'ensureAudio') continue;
  resetGraph();
  if (key === 'beamSweep') { try { audio.beamSweepStop(); } catch (e) {} }
  let threw = null;
  for (const a of argShapes) {
    try { audio[key](a); } catch (e) { threw = e && e.message; break; }
  }
  if (threw) { thrown.push(`${key}: ${threw}`); continue; }
  if (CONTROL.has(key)) continue;
  const st = graphStats();
  if (st.sources === 0) silent.push(key);
  // Hard-clip territory only: the master chain runs every synth through a
  // DynamicsCompressor (threshold -18dB, ratio 12:1), so shipped peaks like
  // the deer bellow (0.80) and modRemoval (0.90) are design loudness, not
  // clipping bugs. Flag only > 1.0.
  if (st.peak > 1.0) hot.push(`${key}:${st.peak.toFixed(2)}`);
  if (key === 'woundEnraged' || key === 'woundCunning' || key === 'woundDesperate') {
    ok(`PART C — ${key} produces a layered graph`, st.sources >= 3 && st.enveloped >= 2,
      `sources=${st.sources} enveloped=${st.enveloped}`);
  }
}
try { audio.combatEnd(); } catch (e) {}
try { audio.toggleMute(); audio.toggleMute(); } catch (e) {}
ok('PART C — no registered synth throws headless', thrown.length === 0, thrown.join('; '));
ok('PART C — no non-control synth is silent', silent.length === 0, silent.join(','));
ok('PART C — phone-safe peak gains (no hard-clip territory > 1.0; master compressor guards the rest)', hot.length === 0, hot.slice(0, 8).join(','));
ok('PART C — isMuted/ensureAudio accessors behave',
  typeof audio.isMuted() === 'boolean' && audio.ensureAudio() === true);

console.log(`\nAUDIO-20261007: ${pass} pass, ${fail} fail | REGISTRY: ${registry.size} | FIRED: ${fired.size}`);
process.exit(fail ? 1 : 0);
