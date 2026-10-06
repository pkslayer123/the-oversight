// test-audio-hooks.js — audio audit for The Oversight (Steve 2026-10-06).
// 1. Extracts the CombatAudio IIFE from src/js/app.js and evaluates it with
//    a mock Web Audio stack (no browser needed).
// 2. Asserts every hook name fired anywhere in src/js (literal audioEvent
//    calls, data-driven specs arrays, resolveAudio values, encounter
//    resolveAudio in monsters.json, direct Game.audio.* references) resolves
//    to a defined function on Game.audio — no silent gaps.
// 3. Calls EVERY exported synth with plausible arg shapes and asserts none
//    throws (param-range / undefined-node audit).
// 4. Asserts no duplicate keys in the export block (silent overwrites).
//
// Run: node scripts/test-audio-hooks.js   (exit 0 = green)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src', 'js', 'app.js');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); }
  else { failures++; console.log('  FAIL ' + msg); }
}

// ---------- mock Web Audio ----------
function paramMock() {
  return {
    value: 0,
    setValueAtTime() {}, exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {}, cancelScheduledValues() {},
    setTargetAtTime() {}, cancelAndHoldAtTime() {},
  };
}
function nodeMock(extra) {
  return Object.assign({ connect() {}, disconnect() {} }, extra || {});
}
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = nodeMock();
  }
  resume() {}
  createDynamicsCompressor() {
    return nodeMock({ threshold: paramMock(), knee: paramMock(), ratio: paramMock(), attack: paramMock(), release: paramMock() });
  }
  createGain() { return nodeMock({ gain: paramMock() }); }
  createOscillator() { return nodeMock({ type: '', frequency: paramMock(), detune: paramMock(), start() {}, stop() {} }); }
  createBiquadFilter() { return nodeMock({ type: '', frequency: paramMock(), Q: paramMock(), gain: paramMock() }); }
  createBuffer(ch, len) { return { getChannelData() { return new Float32Array(len); } }; }
  createBufferSource() { return nodeMock({ buffer: null, loop: false, start() {}, stop() {} }); }
  createWaveShaper() { return nodeMock({ curve: null }); }
  createStereoPanner() { return nodeMock({ pan: paramMock() }); }
}

// ---------- sandbox ----------
const sandbox = {
  window: { AudioContext: MockAudioContext },
  localStorage: { getItem() { return null; }, setItem() {} },
  document: {
    getElementById() { return null; },
    createElement() {
      const cls = { remove() {}, add() {} };
      return { classList: cls, style: {}, offsetWidth: 0 };
    },
    body: { appendChild() {} },
  },
  setInterval() { return 0; },   // heartbeat timers: no-op (we call combatEnd-style stops manually)
  clearInterval() {},
  setTimeout(fn) { try { fn(); } catch (e) { throw e; } return 0; }, // run boom-style deferred bodies inline
  Float32Array,
  console,
  Math, JSON, Object, Array, Error,
};

// ---------- extract & evaluate the IIFE ----------
const app = fs.readFileSync(APP, 'utf8');
const start = app.indexOf('const CombatAudio = (() => {');
ok(start >= 0, 'CombatAudio IIFE found in app.js');
const endMarker = '})();\n  Game.audio = CombatAudio;';
const end = app.indexOf(endMarker, start);
ok(end > start, 'IIFE end marker found');
const iifeSrc = app.slice(start, end + 5); // include })();
const names = Object.keys(sandbox);
const fn = new Function(...names, iifeSrc + '\nreturn CombatAudio;');
const audio = fn(...names.map(k => sandbox[k]));
ok(audio && typeof audio === 'object', 'CombatAudio evaluated to an object');

// ---------- 1. duplicate export keys ----------
{
  const retStart = iifeSrc.indexOf('return {');
  const retEnd = iifeSrc.lastIndexOf('};');
  const block = iifeSrc.slice(retStart, retEnd);
  // export entries sit at exactly 6-space indent; inner call sites are deeper
  const keys = [...block.matchAll(/^      ([A-Za-z_][A-Za-z0-9_]*)\(/gm)].map(m => m[1]);
  const seen = new Set(), dupes = new Set();
  keys.forEach(k => { if (seen.has(k)) dupes.add(k); seen.add(k); });
  ok(dupes.size === 0, 'no duplicate export keys' + (dupes.size ? ' (dupes: ' + [...dupes] + ')' : ''));
  console.log('  info exported hooks: ' + keys.length);
}

// ---------- 2. every fired hook resolves ----------
function firedHooks() {
  const hooks = new Set();
  const jsFiles = fs.readdirSync(path.join(ROOT, 'src', 'js')).filter(f => f.endsWith('.js'));
  const code = jsFiles.map(f => fs.readFileSync(path.join(ROOT, 'src', 'js', f), 'utf8')).join('\n');
  // literal audioEvent('name')
  for (const m of code.matchAll(/audioEvent\(\s*['"]([A-Za-z_]+)['"]/g)) hooks.add(m[1]);
  // data-driven specs: ['xIs', 'field', 'phase', 'text', 'audioName']
  for (const m of code.matchAll(/\[\s*'[a-zA-Z]+Is'\s*,\s*'[a-zA-Z]+'\s*,\s*'[a-zA-Z]+'\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*'([A-Za-z_]+)'\s*\]/g)) hooks.add(m[1]);
  // resolveAudio: 'name' in game.js
  for (const m of code.matchAll(/resolveAudio\s*:\s*['"]([A-Za-z_]+)['"]/g)) hooks.add(m[1]);
  // direct Game.audio.NAME references
  for (const m of code.matchAll(/Game\.audio\.([A-Za-z_]+)/g)) hooks.add(m[1]);
  // monsters.json encounter.resolveAudio
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  const walk = o => {
    if (!o || typeof o !== 'object') return;
    if (o.encounter && typeof o.encounter.resolveAudio === 'string') hooks.add(o.encounter.resolveAudio);
    if (Array.isArray(o)) o.forEach(walk); else Object.values(o).forEach(walk);
  };
  walk(mons);
  return hooks;
}
{
  const hooks = firedHooks();
  console.log('  info fired hook names: ' + hooks.size);
  const missing = [...hooks].filter(h => typeof audio[h] !== 'function');
  ok(missing.length === 0, 'all fired hooks resolve to a function' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
}

// ---------- 3. every synth runs without error ----------
{
  const argShapes = [
    undefined, {}, { quiet: true }, { quiet: false },
    { beam: true, highbeam: true }, { beam: true },
    { pattern: 'beam', urgency: 1 }, { pattern: 'burst', urgency: 2 },
    { pattern: 'charge', urgency: 1 }, { pattern: 'direct', urgency: 2 },
    { pattern: 'line', urgency: 1 }, { pattern: 'rush', urgency: 1 },
    { pattern: 'single', urgency: 1 }, { pattern: 'ambush', urgency: 1 },
    { pattern: 'nope', urgency: 1 }, { urgency: 1, windupTick: true },
    { round: 3 }, { cause: 'bulldozer' }, { stacks: 4 }, { close: true },
    { charge: 0.7 }, { count: 3 }, { n: 2 }, { broken: true }, { watching: true },
    { binding: true }, { dur: 1.2 }, 0.9, 'victory', 'defeat', 1.5, 0.22, true,
  ];
  let ran = 0, synthFails = [];
  const keyList = Object.keys(audio);
  for (let ki = 0; ki < keyList.length; ki++) {
    const key = keyList[ki];
    const f = audio[key];
    if (ki % 25 === 0) console.log('  ... synth sweep ' + ki + '/' + keyList.length + ' (' + key + ')');
    if (typeof f !== 'function') { synthFails.push(key + ': not a function'); continue; }
    for (const args of argShapes) {
      ran++;
      try {
        if (args === undefined) f.call(audio);
        else f.call(audio, args);
      } catch (e) {
        synthFails.push(key + '(' + JSON.stringify(args) + '): ' + (e && e.message));
        break; // one failure per synth is enough signal
      }
    }
  }
  try { audio.combatEnd(); } catch (e) {}
  console.log('  info synth invocations: ' + ran + ' across ' + Object.keys(audio).length + ' hooks');
  ok(synthFails.length === 0, 'every synth runs clean across arg shapes' + (synthFails.length ? '\n    ' + synthFails.slice(0, 12).join('\n    ') : ''));
}

// ---------- 4. pattern dispatch sanity ----------
{
  // telegraph/impact must not throw for any known pattern and must route
  // beam+highbeam through the deer's path (smoke: no error, returns quietly).
  for (const p of ['beam', 'burst', 'charge', 'direct', 'line', 'rush', 'single', 'ambush', 'zzz']) {
    audio.telegraph({ pattern: p, urgency: 1 });
    audio.impact({ pattern: p });
  }
  audio.telegraph({ beam: true, highbeam: true, urgency: 1 });
  audio.impact({ beam: true, highbeam: true });
  audio.patternWindup({ pattern: 'burst', urgency: 2 });
  audio.patternResolve({ pattern: 'charge' });
  try { audio.combatEnd(); } catch (e) {}
  ok(true, 'pattern dispatch smoke pass (no throws)');
}

console.log(failures === 0 ? '\nAUDIO AUDIT: GREEN' : '\nAUDIO AUDIT: ' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
