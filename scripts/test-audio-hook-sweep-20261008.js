// test-audio-hook-sweep-20261008.js — AUDIO HOOK SWEEP PROOF (Steve 2026-10-08).
//
// Proves the audio-hook sweep's decisions:
//
//   A. Every audio event fired in game.js resolves to a registered CombatAudio
//      synth — including data-driven dispatch paths (monsters.json *Audio
//      fields via tbAggroAudio/notice/declare/resolve/death, drama.js
//      DRAMA_AUDIO_MATES via game.js:14632, tbFifoBreather specs arrays).
//      Every non-literal audioEvent argument must be a documented data-driven
//      form; the one dynamic concatenation ('wound'+wcap) has its audited
//      literal registered (the wound() safety-net synth, 2026-10-08 sweep).
//   B. Every registered CombatAudio synth is either fired in production code
//      (any src/js emitter, data field, or internal telegraph()/impact() /
//      alias dispatch) or documented as intentionally kept.
//   C. The sweep's touched synths execute through the REAL Game.audioEvent
//      dispatch path: no exception + non-empty sound graph (not a NO-OP).
//   D. The 3452732 leftover decisions verify end-to-end: nightcourtTurn,
//      wolfSnarl, heronUnfold, and the bison-horn butcher-schema wiring.
//
// Harness rules (AGENTS.md): seeded Math.random BEFORE eval (modules capture
// it at load); the FULL production script list in index.html order, minus
// DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js) and drama.js;
// window stubbed for eval, deleted before play. CombatAudio is extracted
// from app.js and evaluated against an instrumented mock Web Audio graph
// (node cannot play audio); Game.audio is pointed at it so the real
// game.js audioEvent dispatch drives the real synths.
//
// Usage: node scripts/test-audio-hook-sweep-20261008.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D6B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// SEED BEFORE EVAL (AGENTS.md): several modules capture Math.random at load.
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // stub for eval; deleted before play (sync combat path)
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio (node cannot play audio) ----------
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
  return id ? id + (dest._pname ? '.' + dest._pname : '') : 'bus';
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
const APP = path.join(ROOT, 'src', 'js', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf8');
const start = appSrc.indexOf('const CombatAudio = (() => {');
ok('CombatAudio IIFE found in app.js', start >= 0);
const endMarker = '})();\n  Game.audio = CombatAudio;';
const end = appSrc.indexOf(endMarker, start);
ok('IIFE end marker found', end > start);
const iifeSrc = appSrc.slice(start, end + 5);
const names = Object.keys(sandbox);
const fn = new Function(...names, iifeSrc + '\nreturn CombatAudio;');
const audio = fn(...names.map(k => sandbox[k]));
ok('CombatAudio evaluated to an object', audio && typeof audio === 'object');
const registry = new Set(Object.keys(audio).filter(k => typeof audio[k] === 'function'));

// Wrap every registry function: log invocation, delegate to the original.
const firedLog = [];
for (const k of registry) {
  const orig = audio[k];
  audio[k] = function (...args) { firedLog.push(k); return orig.apply(this, args); };
}
// Point the REAL game.js dispatch at the instrumented registry.
Game.audio = audio;
ok('Game.audioEvent is the real game.js dispatch', typeof Game.audioEvent === 'function');

function resetGraph() { nodes = []; edges = []; nodeSeq = 0; firedLog.length = 0; }
function graphStats() {
  const sources = nodes.filter(n => (n._kind === 'osc' || n._kind === 'noise') && n._started);
  const paramEvents = nodes.reduce((acc, n) => acc +
    Object.keys(n).filter(k => n[k] && n[k].events).reduce((a, k) => a + n[k].events.length, 0), 0);
  return { sources: sources.length, paramEvents, totalNodes: nodes.length };
}

// ---------- production fire-site scanners ----------
function walkAudioFields(o, cb, where) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach((x, i) => walkAudioFields(x, cb, `${where}[${i}]`)); return; }
  for (const k of Object.keys(o)) {
    if (/(notice|aggro|declare|resolve|death)Audio$/.test(k) && typeof o[k] === 'string' &&
        /^[A-Za-z_]\w*$/.test(o[k]) && !o[k].includes('?')) cb(o[k], `${where}.${k}`);
    walkAudioFields(o[k], cb, `${where}.${k}`);
  }
}
// Every hook game.js can fire: literals + data-driven paths game.js dispatches.
function gameJsFired() {
  const out = new Map(); // name -> [locations]
  const add = (name, loc) => { if (!out.has(name)) out.set(name, []); out.get(name).push(loc); };
  const src = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
  src.split('\n').forEach((ln, i) => {
    for (const m of ln.matchAll(/audioEvent\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) add(m[1], `game.js:${i + 1}`);
  });
  // tbFifoBreather specs arrays: the audio name is the last string before ]
  for (const m of src.matchAll(/const specs = \[([\s\S]*?)\n      \];/g)) {
    for (const n of m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'\s*\]/g)) add(n[1], 'game.js:tbFifoBreather-specs');
  }
  // monsters.json encounter fields — game.js dispatches these via tbAggroAudio,
  // noticeAudio, declareAudio, resolveAudio, deathAudio, cfg.aggroAudio||'deerAggro'
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  walkAudioFields(mons, (name, where) => add(name, `monsters.json:${where}`));
  // drama.js DRAMA_AUDIO_MATES — game.js:14632 dispatches D.audioFor(kind).
  // NOTE: the `secret` key's value is unreadable here (runtime-redacted); it
  // is skipped — drama.js is outside this sweep's scope, flagged in the report.
  const drama = fs.readFileSync(path.join(ROOT, 'src', 'js', 'drama.js'), 'utf8');
  const mateBlock = drama.match(/DRAMA_AUDIO_MATES = \{([\s\S]*?)\n  \};/);
  if (mateBlock) {
    for (const line of mateBlock[1].split('\n')) {
      if (/^\s*secret\s*:/.test(line)) continue;
      const vm = line.match(/:\s*'([A-Za-z_][A-Za-z0-9_]*)'/);
      if (vm) add(vm[1], 'drama.js:DRAMA_AUDIO_MATES');
    }
  }
  return out;
}
// Every hook fired anywhere in production (for the registry-coverage proof).
function productionFired() {
  const out = new Set(gameJsFired().keys());
  const jsDir = path.join(ROOT, 'src', 'js');
  for (const f of fs.readdirSync(jsDir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    for (const m of src.matchAll(/audioEvent\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) out.add(m[1]);
    for (const m of src.matchAll(/Game\.audio\.([A-Za-z_][A-Za-z0-9_]*)/g)) out.add(m[1]);
    for (const m of src.matchAll(/encAudio\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) out.add(m[1]);
  }
  // contests.js beat arrays: contest<Id>Declare|Escalate|Climax|Resolve fire via _cxBeat
  const cx = fs.readFileSync(path.join(jsDir, 'contests.js'), 'utf8');
  for (const m of cx.matchAll(/contest[A-Za-z]*?(Declare|Escalate|Climax|Resolve): \[(.*?)\]/gs)) {
    for (const n of m[2].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) out.add(n[1]);
  }
  return out;
}

// ---------- Part A: every game.js-fired hook resolves ----------
{
  const fired = gameJsFired();
  const unmapped = [...fired.keys()].filter(h => !registry.has(h));
  const detail = unmapped.map(h => `${h} (${fired.get(h).slice(0, 3).join(', ')})`).join('; ');
  ok('A: every game.js-fired hook resolves to a registered synth', unmapped.length === 0,
    unmapped.length ? `SILENT NO-OP HOOKS: ${detail}` : `${fired.size} hooks checked`);
  // Every non-literal audioEvent argument in game.js must be a documented
  // data-driven form — no unaccounted dynamic fires.
  const gsrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
  const args = [...gsrc.matchAll(/audioEvent\(\s*([^,)]+)/g)]
    .map(m => m[1].trim())
    .filter(a => a !== 'name'); // the audioEvent(name, data) definition itself
  const nonLiteral = [...new Set(args.filter(a => !/^['"]/.test(a)))];
  const KNOWN_DYNAMIC = new Set([
    'aa',                        // mdef.encounter.aggroAudio (warn branch + tbAggroAudio) -> monsters.json
    'syncName',                  // D.audioFor(kind) -> drama.js DRAMA_AUDIO_MATES
    'scCfg.noticeAudio',         // mdef.encounter.noticeAudio -> monsters.json
    'tdCfg.deathAudio',          // mdef.encounter.deathAudio -> monsters.json
    "cfg.aggroAudio || 'deerAggro'", // monsters.json aggroAudio, deer fallback (literal also scanned)
    'audio',                     // tbFifoBreather specs arrays (scanned above)
    'rcfg.resolveAudio',         // mdef.encounter.resolveAudio -> monsters.json
    'rsAudio',                   // encConfig(m).resolveAudio -> monsters.json
    'dcfg.declareAudio',         // mdef.encounter.declareAudio -> monsters.json
    "'wound' + wcap",            // wound-temperament dispatch: audited literal 'wound'
                                 // registered (sweep safety net); expansions below
  ]);
  const unknown = nonLiteral.filter(a => !KNOWN_DYNAMIC.has(a));
  ok('A: every dynamic audioEvent form in game.js is documented', unknown.length === 0,
    unknown.length ? `UNKNOWN: ${unknown.join(' | ')}` : `${nonLiteral.length} known forms`);
  ok("A: 'wound'+wcap expansions + audited literal all resolve",
    ['woundEnraged', 'woundCunning', 'woundDesperate', 'wound'].every(x => registry.has(x)));
}

// ---------- Part B: every registered synth is fired or intentionally kept ----------
// Dispatch-reachable through telegraph()/impact() (fired in production) or the
// delegateCircle -> managerCircle alias.
const DISPATCH_REACHABLE = new Set([
  'beamCharge', 'beamTechWindup', 'burstWindup', 'chargeWindup', 'lockonTick',
  'lineWindup', 'rushWindup', 'diveWindup',
  'beamFire', 'beamFlash', 'droneBeam', 'burstDetonate', 'chargeImpact',
  'lockonHit', 'lineStrike', 'rushHit', 'diveImpact', 'ambushSnap', 'impactWild',
  'managerCircle', // via delegateCircle() { managerCircle(); } — delegateCircle fired at game.js:22037
]);
const CONTROL = new Set(['combatEnd', 'beamSweepStop', 'humStop']); // legitimately silent
const ACCESSOR = new Set(['toggleMute', 'isMuted', 'ensureAudio']);
// Deliberately kept, unfired — each with a documented reason (sweep 2026-10-08):
const INTENTIONALLY_KEPT = {
  // Task #4 (out of scope): removal needs five same-day proof scripts updated;
  // belongs to the future follow-up owning both.
  managerCharge: 'task#4: manager-family removal deferred to follow-up owning the five proof scripts',
  managerDebrief: 'task#4: manager-family removal deferred to follow-up owning the five proof scripts',
  managerFear: 'task#4: manager-family removal deferred to follow-up owning the five proof scripts',
  // Zero fire sites (the "wired: game.js:19032" doc claim is stale — verified);
  // kept: removing it breaks test-audio-hooks-20261006.js scenario drive, and
  // it belongs to the manager-family follow-up above.
  delegateDebrief: 'vestigial registry entry; removal owned by the manager-family follow-up (task#4)',
  // Internal voice: deerNotice/deerAggro/deerDown call the inner function
  // directly; the registry key is the public surface for sibling/debug use.
  deerCall: 'internal voice reached via wrappers; registry key kept as public surface',
};
{
  const fired = productionFired();
  const uncovered = [...registry].filter(k =>
    !fired.has(k) && !DISPATCH_REACHABLE.has(k) && !CONTROL.has(k) &&
    !ACCESSOR.has(k) && !INTENTIONALLY_KEPT[k]);
  ok('B: every registered synth is fired or intentionally kept', uncovered.length === 0,
    uncovered.length ? `UNCOVERED: ${uncovered.join(', ')}` : `${registry.size} registered, all covered`);
  const keptList = Object.keys(INTENTIONALLY_KEPT).filter(k => registry.has(k) && !fired.has(k));
  console.log(`  (intentionally kept, unfired: ${keptList.join(', ')})`);
}

// ---------- Part C: sweep-touched synths execute through Game.audioEvent ----------
{
  const touched = ['wound', 'woundEnraged', 'woundCunning', 'woundDesperate',
    'nightcourtTurn', 'wolfSnarl', 'heronUnfold', 'animalButcher'];
  for (const name of touched) {
    ok(`C: ${name} is registered`, registry.has(name));
    if (!registry.has(name)) continue;
    // (1) the synth itself runs without throwing…
    resetGraph();
    let threw = null;
    try { audio[name]({}); } catch (e) { threw = e && e.message; }
    ok(`C: ${name} executes without throwing`, threw === null, threw || '');
    // (2) …through the REAL game.js audioEvent dispatch path…
    resetGraph();
    Game.audioEvent(name, {});
    ok(`C: ${name} dispatches through Game.audioEvent`, firedLog.includes(name));
    // (3) …and produces a real sound graph (not a NO-OP): started sources +
    // non-empty audio params.
    const st = graphStats();
    ok(`C: ${name} produces sound (sources=${st.sources}, paramEvents=${st.paramEvents})`,
      st.sources > 0 && st.paramEvents > 0, `sources=${st.sources} paramEvents=${st.paramEvents}`);
  }
  // Sanity: the real dispatch rule — unknown names stay silent, never throw.
  resetGraph();
  let threw2 = null;
  try { Game.audioEvent('noSuchHookEver', {}); } catch (e) { threw2 = e && e.message; }
  ok('C: unknown hook stays a silent no-op (dispatch rule intact)', threw2 === null && firedLog.length === 0);
}

// ---------- Part D: 3452732 leftover decisions verify end-to-end ----------
{
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  const arr = Array.isArray(mons) ? mons : mons.monsters;
  const aggro = id => { const m = arr.find(x => x.id === id); return m && m.encounter && m.encounter.aggroAudio; };
  const gsrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
  const fsrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'food.js'), 'utf8');

  ok('D: nightcourt aggroAudio is nightcourtTurn', aggro('nightcourt') === 'nightcourtTurn');
  ok('D: nightcourtTurn fires at the roost head-turn beat (not the dive)',
    /head rotates/.test(gsrc) && /if \(\/head rotates\/\.test\(ncRoostMsg\)\) this\.tbAggroAudio\(m\)/.test(gsrc));
  ok('D: hushwolf aggroAudio is wolfSnarl', aggro('hushwolf') === 'wolfSnarl');
  ok('D: wolfSnarl fires at rush resolve after contact (once per wolf)',
    /if \(this\.wolfIs\(m\) && !m\.wolfSnarled\) \{ m\.wolfSnarled = true; this\.tbAggroAudio\(m\); \}/.test(gsrc));
  ok('D: wolfSnarl also fires at the quiet-woods encounter', gsrc.includes("this.audioEvent('wolfSnarl')"));
  ok('D: heron aggroAudio is heronUnfold', aggro('white_noise_heron') === 'heronUnfold');
  ok('D: heron two-hook split documented (unfold=aggro/strike-declare, static=declare)',
    /TWO-HOOK SPLIT/.test(gsrc) && /heronUnfold is the AGGRO voice/.test(gsrc));

  // Bison horn: schema extended (3452732 decision 4); the horn is a butcher
  // yield collected inside the animalButcher beat — no dedicated horn hook.
  const schemas = fs.readFileSync(path.join(ROOT, 'src', 'data', 'schemas.json'), 'utf8');
  ok('D: butcher schema allows horn', schemas.includes('"horn": "number?"'));
  const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'animals.json'), 'utf8'));
  const aa = Array.isArray(animals) ? animals : animals.animals;
  const bison = aa.find(a => a.id === 'bison');
  ok('D: bison butcher yields horn:2', bison && bison.butcher && bison.butcher.horn === 2);
  const butcherFires = (fsrc.match(/audioEvent\('animalButcher'\)/g) || []).length;
  ok('D: animalButcher fired in food.js (covers horn yields)', butcherFires >= 2, `sites=${butcherFires}`);
}

console.log(`\nseed=${SEED} — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
