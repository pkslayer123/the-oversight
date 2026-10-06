// test-audio-wireup-20261006.js — audio worker wiring pass (Steve 2026-10-06).
// 1. Every hook fired anywhere in src/js (literal audioEvent calls, data-driven
//    specs, monsters.json encounter/notice/aggro/resolve/declare/death audio)
//    resolves to a real function on Game.audio — no silent gaps.
// 2. The newly wired hooks (staticScream, serviceRush, contractBind,
//    monsterDown, monsterHurt, animalButcher) run clean with plausible args.
// 3. Dispatch sites exist in source: game.js fires staticScream/serviceRush/
//    monsterDown/monsterHurt; food.js fires animalButcher (x2: self-clean +
//    specialist); monsters.json contract_golem encounter.resolveAudio.
// 4. Freakiness rubric on the two reworked System synths (roundTick, lineCut):
//    >= 3 layers AND (dissonant OR modulation) AND (sweep OR modulation).
// 5. Highbeam Deer synths byte-identical to HEAD (benchmark untouched).
// Node can't play audio — instrumented mock Web Audio records the node graph.
// Usage: node scripts/test-audio-wireup-20261006.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- instrumented mock Web Audio ----------
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
    _id: kind + (++nodeSeq), _kind: kind, _started: false,
    connect(dest) { edges.push([this._id, paramDestId(dest), this._kind]); },
    disconnect() {},
    start() { this._started = true; },
    stop() {},
  };
  if (kind === 'osc') { n.frequency = mockParam(n, 'frequency', 440); n.detune = mockParam(n, 'detune', 0); n.type = 'sine'; }
  if (kind === 'gain') { n.gain = mockParam(n, 'gain', 0); }
  if (kind === 'filter') { n.frequency = mockParam(n, 'frequency', 1000); n.Q = mockParam(n, 'Q', 1); n.type = ''; }
  if (kind === 'noise') { n.buffer = null; n.loop = false; n.playbackRate = mockParam(n, 'playbackRate', 1); }
  if (kind === 'panner') { n.pan = mockParam(n, 'pan', 0); }
  if (kind === 'comp') { ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(k => { n[k] = mockParam(n, k, 0); }); }
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
const timerQueue = [];
const sandbox = {
  window: { AudioContext: MockAudioContext },
  localStorage: { getItem() { return null; }, setItem() {} },
  document: { getElementById() { return null; }, createElement() { return { style: {} }; }, body: { appendChild() {} } },
  setInterval(cb) { timerQueue.push(cb); return timerQueue.length; },
  clearInterval() {},
  setTimeout(cb) { timerQueue.push(cb); return timerQueue.length; },
  clearTimeout() {},
  Float32Array, console, Math, JSON, Object, Array, Error, Number, String, Boolean,
  Promise, isNaN, parseInt, parseFloat, Infinity, NaN,
  Game: {},
};

// ---------- extract & evaluate the IIFE ----------
const app = fs.readFileSync(APP, 'utf8');
const start = app.indexOf('const CombatAudio = (() => {');
ok(start >= 0, 'CombatAudio IIFE found in app.js');
const endMarker = '})();\n  Game.audio = CombatAudio;';
const end = app.indexOf(endMarker, start);
ok(end > start, 'IIFE end marker found');
const iifeSrc = app.slice(start, end + 5);
const names = Object.keys(sandbox);
const fn = new Function(...names, iifeSrc + '\nreturn CombatAudio;');
const audio = fn(...names.map(k => sandbox[k]));
ok(audio && typeof audio === 'object', 'CombatAudio evaluated to an object');

// ---------- 1. every fired hook resolves ----------
function firedHooks() {
  const hooks = new Set();
  const jsFiles = fs.readdirSync(path.join(ROOT, 'src', 'js')).filter(f => f.endsWith('.js'));
  const code = jsFiles.map(f => fs.readFileSync(path.join(ROOT, 'src', 'js', f), 'utf8')).join('\n');
  for (const m of code.matchAll(/audioEvent\(\s*['"]([A-Za-z_]+)['"]/g)) hooks.add(m[1]);
  for (const m of code.matchAll(/Game\.audio\.([A-Za-z_]+)/g)) hooks.add(m[1]);
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  const walk = o => {
    if (!o || typeof o !== 'object') return;
    for (const k of ['noticeAudio', 'aggroAudio', 'resolveAudio', 'declareAudio', 'deathAudio'])
      if (typeof o[k] === 'string') hooks.add(o[k]);
    if (Array.isArray(o)) o.forEach(walk); else Object.values(o).forEach(walk);
  };
  walk(mons);
  return hooks;
}
{
  const hooks = firedHooks();
  const missing = [...hooks].filter(h => typeof audio[h] !== 'function');
  ok(missing.length === 0, 'all fired hooks resolve to a function',
    missing.length ? `missing: ${missing.join(', ')}` : `${hooks.size} hooks checked`);
}

// ---------- 2. newly wired hooks run clean ----------
{
  const argShapes = [undefined, {}, { round: 5 }, { cause: 'bulldozer' }, { quiet: true }];
  const targets = ['staticScream', 'serviceRush', 'contractBind', 'monsterDown', 'monsterHurt', 'animalButcher', 'round', 'lineCut'];
  const bad = [];
  for (const key of targets) {
    if (typeof audio[key] !== 'function') { bad.push(key + ': not a function'); continue; }
    for (const a of argShapes) {
      // reset graph between synths
      nodes.length = 0; edges.length = 0; nodeSeq = 0;
      try { a === undefined ? audio[key]() : audio[key](a); }
      catch (e) { bad.push(`${key}(${JSON.stringify(a)}): ${e && e.message}`); break; }
    }
  }
  try { audio.combatEnd(); } catch (e) {}
  ok(bad.length === 0, 'newly wired + reworked synths run clean', bad.join('; '));
}

// ---------- 3. dispatch sites exist in source ----------
{
  const game = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
  const food = fs.readFileSync(path.join(ROOT, 'src', 'js', 'food.js'), 'utf8');
  ok(game.includes("audioEvent('staticScream')"), 'game.js fires staticScream');
  ok(game.includes("audioEvent('serviceRush')"), 'game.js fires serviceRush');
  ok(game.includes("audioEvent('monsterDown')"), 'game.js fires monsterDown (death fallthrough)');
  ok(game.includes("audioEvent('monsterHurt')"), 'game.js fires monsterHurt (wound beat)');
  const butcherSites = (food.match(/audioEvent\('animalButcher'\)/g) || []).length;
  ok(butcherSites === 2, 'food.js fires animalButcher at both clean beats', `n=${butcherSites}`);
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  const golem = mons.find(m => m.id === 'contract_golem');
  ok(golem && golem.encounter && golem.encounter.resolveAudio === 'contractBind',
    'monsters.json contract_golem encounter.resolveAudio = contractBind');
}

// ---------- 4. freakiness rubric on reworked synths ----------
function firstFreq(osc) {
  const ev = osc.frequency.events.find(e => typeof e.v === 'number');
  return ev ? ev.v : null;
}
function analyze(key, arg) {
  nodes.length = 0; edges.length = 0; nodeSeq = 0;
  arg === undefined ? audio[key]() : audio[key](arg);
  const sources = nodes.filter(n => (n._kind === 'osc' || n._kind === 'noise') && n._started);
  const layers = sources.length;
  const freqs = sources.filter(n => n._kind === 'osc').map(firstFreq).filter(v => v && v > 0);
  let dissonant = false;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) {
    const ratio = Math.max(freqs[i], freqs[j]) / Math.min(freqs[i], freqs[j]);
    if ((ratio > 1.0005 && ratio <= 1.02) || (ratio >= 1.05 && ratio <= 1.07) || (ratio >= 1.40 && ratio <= 1.43)) dissonant = true;
  }
  let sweep = false;
  for (const n of sources) {
    if (n._kind !== 'osc') continue;
    const evs = n.frequency.events.filter(e => typeof e.v === 'number' && e.v > 0).map(e => e.v);
    if (evs.length >= 2) {
      const r = Math.max(...evs) / Math.min(...evs);
      if (r >= 1.5) sweep = true;
    }
  }
  const modulation = edges.some(([from, to, kind]) => kind === 'osc' && /\.(frequency|gain)$/.test(to));
  const texture = sources.some(n => n._kind === 'noise');
  return { layers, dissonant, sweep, modulation, texture };
}
for (const [key, arg] of [['round', { round: 5 }], ['lineCut', undefined]]) {
  const a = analyze(key, arg);
  const passR = a.layers >= 3 && (a.dissonant || a.modulation) && (a.sweep || a.modulation);
  ok(passR, `${key} passes freakiness rubric`,
    `layers=${a.layers} dissonant=${a.dissonant} sweep=${a.sweep} modulation=${a.modulation} texture=${a.texture}`);
}

// ---------- 5. deer benchmark untouched ----------
function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
{
  let headApp;
  try { headApp = execSync('git show HEAD:src/js/app.js', { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { headApp = null; }
  ok(!!headApp, 'HEAD version of app.js readable');
  if (headApp) {
    const fns = ['deerCall', 'beamCharge', 'beamFire', 'beamSweep', 'beamSweepStop', 'beamBlocked', 'deerSnort'];
    const changed = fns.filter(f => fnBody(headApp, f) !== fnBody(app, f));
    ok(changed.length === 0, 'Highbeam Deer synths byte-identical to HEAD', changed.join(', '));
  }
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
