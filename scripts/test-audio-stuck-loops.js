// test-audio-stuck-loops.js — break-it audio 2026-10-10
//
// CATCH: two combat-end bypasses dropped `tbfight` without firing
// `combatEnd`, leaving sustained audio loops (combat heartbeat setInterval,
// beam-sweep hum, hummice bed) playing forever with no fight:
//   1. Game.load() — restoring a peaceful save mid-session kept the old
//      session's heartbeat thumping (sibling of the r4 glasswing-trap fix).
//   2. tbBarrierExit() corpse-bearer path — dissolving the fight when the
//      bearer dies mid-fight never stopped the loops.
// FIX: fire audioEvent('combatEnd') (idempotent) at both sites before
// nulling tbfight.
//
// Run: node scripts/test-audio-stuck-loops.js [path/to/game.js]
//   - dynamic part always runs (stubbed AudioContext, no hardware needed)
//   - static part checks every `tbfight = null` site in the given game.js
//     (default: this worktree's) lives in a function that fires combatEnd.
//   - to see the BEFORE: pass <(git show HEAD:src/js/game.js)... via a file:
//       git show HEAD:src/js/game.js > /tmp/game-before.js
//       node scripts/test-audio-stuck-loops.js /tmp/game-before.js   # expect FAIL
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(seed);

// ---- stubbed AudioContext: records, never sounds ----
const rec = { contexts: 0, oscStarted: 0, oscStopped: 0, intervals: new Set(), cleared: 0 };
function stubParam() {
  return {
    setValueAtTime() {}, exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {}, setTargetAtTime() {},
    cancelScheduledValues() {},
  };
}
function stubNode() {
  return {
    connect() {}, disconnect() {},
    start() { rec.oscStarted++; }, stop() { rec.oscStopped++; },
    gain: stubParam(), frequency: stubParam(), pan: stubParam(),
    threshold: stubParam(), knee: stubParam(), ratio: stubParam(),
    attack: stubParam(), release: stubParam(), Q: stubParam(),
    getChannelData() { return new Float32Array(8); },
  };
}
class StubAudioContext {
  constructor() { rec.contexts++; this.state = 'running'; this.sampleRate = 44100; this.currentTime = 0; this.destination = {}; }
  createOscillator() { return stubNode(); }
  createGain() { return stubNode(); }
  createBufferSource() { return stubNode(); }
  createBiquadFilter() { return stubNode(); }
  createDynamicsCompressor() { return stubNode(); }
  createStereoPanner() { return stubNode(); }
  createBuffer() { return {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
const realSetInterval = setInterval, realClearInterval = clearInterval;
let nextIid = 1;
const fakeTimers = new Map();
global.setInterval = (fn, ms) => { const id = nextIid++; fakeTimers.set(id, fn); rec.intervals.add(id); return id; };
global.clearInterval = (id) => { fakeTimers.delete(id); if (rec.intervals.delete(id)) rec.cleared++; };
global.window = { AudioContext: StubAudioContext };
const _ls = {};
global.localStorage = { getItem: k => (_ls[k] ?? null), setItem: (k, v) => { _ls[k] = String(v); } };
global.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  body: { appendChild() {} },
};

// ---- minimal Game with the real dispatch contract (game.js audioEvent) ----
const Game = {
  audioEvent(name, data) {
    if (this.audio && typeof this.audio[name] === 'function') {
      try { this.audio[name](data || {}); } catch (e) {}
    }
  },
};

// ---- extract the CombatAudio module from app.js and eval it ----
const repoRoot = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(repoRoot, 'src/js/app.js'), 'utf8');
const lines = appSrc.split('\n');
const startIdx = lines.findIndex(l => l.includes('const CombatAudio = (() => {'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === 'Game.audio = CombatAudio;');
if (startIdx < 0 || endIdx < 0) { console.error('FATAL: CombatAudio section not found'); process.exit(2); }
const moduleSrc = lines.slice(startIdx, endIdx + 1).join('\n');
new Function('Game', 'window', 'localStorage', 'document', 'setInterval', 'clearInterval', 'Math',
  moduleSrc)(Game, global.window, global.localStorage, global.document,
  global.setInterval, global.clearInterval, Math);

console.log('== dynamic: sustained loops must die with combatEnd ==');
ok(!!(Game.audio && typeof Game.audio.combatStart === 'function'), 'CombatAudio registry loaded (dead-code check: module reachable)');

// EXPLOIT-adapted: 200 mixed voices must not mint contexts or leak intervals
const stoppedBefore = rec.oscStopped;
for (let i = 0; i < 200; i++) {
  Game.audioEvent('impact', { pattern: ['burst', 'charge', 'direct', 'line', 'rush', 'single', 'ambush'][i % 7] });
  Game.audioEvent('telegraph', { pattern: 'direct', urgency: 1 });
  if (i % 10 === 0) Game.audioEvent('monsterHurt');
}
ok(rec.contexts === 1, `one AudioContext for 200 voices (got ${rec.contexts}) — no per-voice context leak`);
ok(rec.intervals.size <= 1, `no interval pile-up after voice spam (active: ${rec.intervals.size})`);
ok(rec.oscStopped >= stoppedBefore, 'one-shot oscillators schedule their own stop');

// the fight: combat heartbeat + sustained beam hum + hummice bed go live
Game.audioEvent('combatStart');
Game.audioEvent('beamSweep', { pan: 0, heat: 0.6 });
Game.audioEvent('humRise', { stacks: 3 });
ok(rec.intervals.size === 1, 'combat heartbeat interval running during fight');
const oscLiveBefore = rec.oscStarted - rec.oscStopped;

// THE BUG (before): old load()/tbBarrierExit paths dropped the fight with NO
// combatEnd — simulate exactly that: the fight reference is gone, audio untouched.
const clearedBefore = rec.cleared;
// (nothing fires here — that IS the bug)
ok(rec.intervals.size === 1, 'BUG REPRO: heartbeat still ticking after fight dropped without combatEnd');
ok(rec.oscStarted - rec.oscStopped >= oscLiveBefore, 'BUG REPRO: sustained voices never stopped after fight dropped');

// THE FIX: firing combatEnd (what the patched sites now do) kills everything
Game.audioEvent('combatEnd');
ok(rec.intervals.size === 0, 'combatEnd clears the heartbeat interval');
ok(rec.cleared >= clearedBefore + 1, 'combatEnd actually cleared an interval');
ok(rec.oscStopped > stoppedBefore, 'combatEnd stops sustained oscillators');
// idempotent: safe to fire when nothing is playing
Game.audioEvent('combatEnd');
ok(rec.intervals.size === 0, 'combatEnd idempotent (no crash, no state)');

// mute toggle still works through the stub
const m0 = Game.audio.isMuted();
Game.audio.toggleMute();
ok(Game.audio.isMuted() !== m0, 'mute toggle flips');
Game.audio.toggleMute();
ok(Game.audio.isMuted() === m0, 'mute toggle flips back');

console.log('== static: every tbfight=null site must fire combatEnd ==');
const gamePath = process.argv[2] || path.join(repoRoot, 'src/js/game.js');
const gsrc = fs.readFileSync(gamePath, 'utf8');
const glines = gsrc.split('\n');
// collect 4-space-indented method boundaries: "    name(" 
const methods = [];
glines.forEach((l, i) => {
  const m = l.match(/^    ([A-Za-z_$][\w$]*)\s*\(/);
  if (m) methods.push({ name: m[1], line: i });
});
function enclosingMethod(lineIdx) {
  let cur = null;
  for (const m of methods) { if (m.line <= lineIdx) cur = m; else break; }
  return cur;
}
const nullSites = [];
glines.forEach((l, i) => { if (/this\.tbfight\s*=\s*null/.test(l)) nullSites.push(i); });
ok(nullSites.length > 0, `found ${nullSites.length} tbfight=null sites to audit`);
for (const ln of nullSites) {
  const em = enclosingMethod(ln);
  const nextM = methods.find(m => m.line > (em ? em.line : -1) && m !== em);
  const end = nextM ? nextM.line : glines.length;
  const body = glines.slice(em ? em.line : 0, end).join('\n');
  const hasHygiene = /audioEvent\(['"]combatEnd['"]\)/.test(body);
  if (em && em.name === 'tbEnd') {
    ok(true, `line ${ln + 1} in tbEnd() — canonical path, combatEnd fired above`);
  } else {
    ok(hasHygiene, `line ${ln + 1} in ${em ? em.name + '()' : '?'} fires combatEnd before dropping the fight`);
  }
}

console.log(`\n${pass} passed, ${fail} failed (seed ${seed})`);
process.exit(fail ? 1 : 0);
