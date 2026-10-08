#!/usr/bin/env node
// Proof: catfishLure dedup (Steve 2026-10-08) — app.js audio registry cleanup.
// app.js had TWO `function catfishLure()` definitions in the CombatAudio IIFE
// (2026-10-05 "NIGHTLIGHT LURE" + 2026-10-07 "NIGHTLIGHT AGGRO" rewrite) and
// TWO registry keys. JS hoisting meant only the later (aggro) one ever ran.
// This test proves: exactly one definition survives (the aggro voice), exactly
// one registry key resolves it, monsters.json's aggroAudio reference resolves,
// and the surviving synth actually schedules the documented voice graph.
// Also verifies warrantyCall has zero references anywhere in src/.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'src/js/app.js');
const src = fs.readFileSync(APP, 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- 1. static: exactly one definition ----------
const defs = (src.match(/^    function catfishLure\(\) \{/gm) || []).length;
check('exactly one catfishLure definition', defs === 1, `found ${defs}`);

// ---------- 2. static: exactly one registry key ----------
const keys = (src.match(/^      catfishLure\(\) \{ catfishLure\(\); \},/gm) || []).length;
check('exactly one catfishLure registry key', keys === 1, `found ${keys}`);

// ---------- 3. monsters.json reference resolves ----------
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const cat = monsters.find(m => m.id === 'nightlight_catfish');
check('nightlight_catfish exists in monsters.json', !!cat);
const aggro = cat && ((cat.encounter || {}).aggroAudio || cat.aggroAudio);
check('nightlight_catfish aggroAudio is catfishLure', aggro === 'catfishLure', `got ${aggro}`);
check('registry key matches aggroAudio reference', keys === 1 && aggro === 'catfishLure');

// ---------- 4. the surviving definition is the AGGRO voice (2026-10-07) ----------
const startIdx = src.indexOf('    function catfishLure() {');
const bodyStart = src.indexOf('{', startIdx);
const endMarker = '\n    }\n    function glasswingBuzz()';
const endIdx = src.indexOf(endMarker, startIdx);
check('surviving definition extractable', startIdx > 0 && endIdx > startIdx);
const fnSrc = src.slice(startIdx, endIdx + '\n    }'.length);
check('surviving voice is NIGHTLIGHT AGGRO (not the stale LURE)',
  fnSrc.includes('NIGHTLIGHT AGGRO') && !fnSrc.includes('NIGHTLIGHT LURE'));
check('no stale 3.7x inharmonic partials (dead LURE fingerprint)',
  !fnSrc.includes('3.7'));

// ---------- 5. functional: run the synth against a mocked WebAudio graph ----------
function param() {
  const calls = [];
  return {
    value: 0,
    _calls: calls,
    setValueAtTime(v, t) { calls.push(['set', v, t]); this.value = v; },
    exponentialRampToValueAtTime(v, t) { calls.push(['ramp', v, t]); },
    linearRampToValueAtTime(v, t) { calls.push(['linear', v, t]); },
  };
}
const created = [];
const ctx = {
  currentTime: 100,
  createOscillator() { const n = { kind: 'osc', type: '', frequency: param(), detune: param(), _conns: [], connect(d) { this._conns.push(d); }, start(t) { this._start = t; }, stop(t) { this._stop = t; } }; created.push(n); return n; },
  createGain() { const n = { kind: 'gain', gain: param(), _conns: [], connect(d) { this._conns.push(d); } }; created.push(n); return n; },
  createBiquadFilter() { const n = { kind: 'filter', type: '', frequency: param(), Q: param(), _conns: [], connect(d) { this._conns.push(d); } }; created.push(n); return n; },
};
const thumpCalls = [];
const stubs = {
  ensure: () => true,
  ctx,
  noise: (dur) => { const n = { kind: 'noise', dur, _conns: [], connect(d) { this._conns.push(d); }, start(t) { this._start = t; }, stop(t) { this._stop = t; } }; created.push(n); return n; },
  sfxBus: { kind: 'bus' },
  thump: (when, vol) => thumpCalls.push([when, vol]),
};
const fnBody = fnSrc.slice(fnSrc.indexOf('{') + 1, fnSrc.lastIndexOf('}'));
let ran = false, runErr = null;
try {
  new Function('ensure', 'ctx', 'noise', 'sfxBus', 'thump', fnBody)(
    stubs.ensure, stubs.ctx, stubs.noise, stubs.sfxBus, stubs.thump);
  ran = true;
} catch (e) { runErr = e; }
check('surviving catfishLure runs clean against mocked WebAudio', ran, runErr && runErr.message);

const oscs = created.filter(n => n.kind === 'osc');
const filters = created.filter(n => n.kind === 'filter');
const freqs = oscs.map(o => o.frequency.value);
check('breathing pulse: 220Hz sine osc', oscs.some(o => o.type === 'sine' && o.frequency.value === 220),
  `osc freqs: ${freqs.join(',')}`);
check('breath LFO: 0.7Hz sine feeding a gain (the patient swell)',
  oscs.some(o => o.type === 'sine' && o.frequency.value === 0.7 &&
    o._conns.some(c => c && c.kind === 'gain')),
  `lfo conns: ${JSON.stringify(oscs.filter(o => o.frequency.value === 0.7).map(o => o._conns.map(c => c && c.kind)))}`);
check('underwater voice: lowpass at 900Hz', filters.some(f => f.type === 'lowpass' && f.frequency.value === 900),
  `filters: ${filters.map(f => f.type + '@' + f.frequency.value).join(',')}`);
check('the glug: bandpass 300Hz Q=4', filters.some(f => f.type === 'bandpass' && f.frequency.value === 300 && f.Q.value === 4));
const graspLP = filters.find(f => f.type === 'lowpass' &&
  f.frequency._calls.some(c => c[0] === 'set' && c[1] === 800) &&
  f.frequency._calls.some(c => c[0] === 'ramp' && c[1] === 150));
check('THE GRASP: suction drags lowpass 800→150', !!graspLP);
check('grasp scheduled at t+1.5 (the lure, then the grab)',
  oscs.some(o => o._start === 101.5), `starts: ${oscs.map(o => o._start).join(',')}`);
check('thump lands at grasp+0.55 (q+0.55, vol 0.4)',
  thumpCalls.some(([w, v]) => Math.abs(w - 102.05) < 1e-9 && v === 0.4),
  `thump calls: ${JSON.stringify(thumpCalls)}`);

// ---------- 6. warrantyCall: zero references anywhere in src/ ----------
const srcFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|json|css|html)$/.test(e.name)) srcFiles.push(p);
  }
})(path.join(ROOT, 'src'));
const hits = srcFiles.filter(f => fs.readFileSync(f, 'utf8').includes('warrantyCall'));
check('warrantyCall has zero references in src/', hits.length === 0, hits.join(', '));

// ---------- 7. syntax ----------
try { execSync(`node --check ${APP}`, { stdio: 'pipe' }); check('app.js syntax valid', true); }
catch (e) { check('app.js syntax valid', false, 'node --check failed'); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
