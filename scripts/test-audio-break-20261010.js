#!/usr/bin/env node
// Break-it audio proof tests, run 2026-10-10 (target: AUDIO SYSTEM).
// Hostile-player attacks against the CombatAudio engine in src/js/app.js:
//   EXPLOIT   — can audio state drive game logic? (static: zero Game.* refs in the IIFE)
//   SOFTLOCK  — suspended/closed/missing AudioContext; leaked intervals/drones
//   HONESTY   — pattern dispatch (impact/telegraph) plays the voice it promises;
//               mute actually silences everything through master; no mute bypass
//   DEAD CODE — every fired/data/beat/dynamic hook resolves; lockon mapped
//
// CATCHES THIS RUN (fixed, proven below):
//   1. game.js tbMonsterTurn resolve fired bare audioEvent('impact') with the
//      pattern in scope but unpassed -> every non-sweep monster resolve played
//      the generic impactWild instead of its pattern voice (chargeImpact,
//      droneBeam, lineStrike...). Fixed: pass {pattern, beam, highbeam}.
//   2. service_mimic rush resolve fired impact({}) -> impactWild on top of the
//      bespoke serviceRush. Fixed: impact({pattern:'rush'}).
//   3. 'lockon' is a real game.js pattern type (tbMonsterTurn, declare) but the
//      audio dispatch didn't know it -> silent windup / impactWild fallthrough.
//      Fixed: lockon -> lockonTick/lockonHit in telegraph/impact/patternWindup.
//
// Run: node scripts/test-audio-break-20261010.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(0xA0010);

// ---------- fake Web Audio ----------
const ctxInstances = [];
function FakeParam(v) { this.value = v; this.lastRamp = null; }
FakeParam.prototype.setValueAtTime = function (v) { this.value = v; };
FakeParam.prototype.linearRampToValueAtTime = function (v) { this.lastRamp = v; this.value = v; };
FakeParam.prototype.exponentialRampToValueAtTime = function (v) { this.lastRamp = v; this.value = v; };
FakeParam.prototype.setTargetAtTime = function (v) { this.lastRamp = v; this.value = v; };
FakeParam.prototype.cancelScheduledValues = function () {};

function FakeNode(kind, ctx) {
  this.kind = kind; this.ctx = ctx;
  this.started = 0; this.stopped = 0;
  this.connections = [];
  if (kind === 'osc') { this.frequency = new FakeParam(440); this.detune = new FakeParam(0); this.type = 'sine'; }
  if (kind === 'gain') { this.gain = new FakeParam(1); }
  if (kind === 'filter') { this.frequency = new FakeParam(1000); this.Q = new FakeParam(1); this.type = 'lowpass'; }
  if (kind === 'panner') { this.pan = new FakeParam(0); }
  if (kind === 'shaper') { this.curve = null; this.oversample = 'none'; }
  if (kind === 'comp') { this.threshold = new FakeParam(-18); this.knee = new FakeParam(22); this.ratio = new FakeParam(12); this.attack = new FakeParam(0.003); this.release = new FakeParam(0.25); }
}
FakeNode.prototype.connect = function (dst) {
  this.connections.push(dst);
  if (dst === this.ctx.destination) this.ctx.directConnects.push(this.kind);
  return dst;
};
FakeNode.prototype.disconnect = function () {};
FakeNode.prototype.start = function () { this.started++; };
FakeNode.prototype.stop = function () { this.stopped++; };

function FakeAudioContext() {
  this.state = FakeAudioContext.nextState || 'running';
  this.currentTime = 1000;
  this.sampleRate = 44100;
  this.destination = {};
  this.resumeCount = 0;
  this.nodes = [];
  this.directConnects = []; // node kinds wired straight to destination (mute bypass)
  ctxInstances.push(this);
}
FakeAudioContext.nextState = null;
FakeAudioContext.prototype._n = function (k) { const n = new FakeNode(k, this); this.nodes.push(n); return n; };
FakeAudioContext.prototype.createOscillator = function () { return this._n('osc'); };
FakeAudioContext.prototype.createGain = function () { return this._n('gain'); };
FakeAudioContext.prototype.createBiquadFilter = function () { return this._n('filter'); };
FakeAudioContext.prototype.createStereoPanner = function () { return this._n('panner'); };
FakeAudioContext.prototype.createWaveShaper = function () { return this._n('shaper'); };
FakeAudioContext.prototype.createDynamicsCompressor = function () { return this._n('comp'); };
FakeAudioContext.prototype.createBuffer = function (ch, len) {
  return { getChannelData: () => new Float32Array(len), length: len };
};
FakeAudioContext.prototype.createBufferSource = function () {
  const n = this._n('bufsrc'); n.buffer = null; n.loop = false; return n;
};
FakeAudioContext.prototype.resume = function () {
  this.resumeCount++;
  if (this.state === 'suspended') this.state = 'running';
  return Promise.resolve();
};
function ThrowingAudioContext() { throw new Error('no webaudio'); }

const fakeWindow = { AudioContext: FakeAudioContext };
function freshLS(preset) {
  const s = { _s: Object.assign({}, preset) };
  s.getItem = function (k) { return this._s[k] ?? null; };
  s.setItem = function (k, v) { this._s[k] = String(v); };
  return s;
}

// ---------- extract + instrument the CombatAudio IIFE ----------
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const iifeStart = appSrc.indexOf('const CombatAudio = (() => {');
const iifeEndMark = 'Game.audio = CombatAudio;';
const iifeEnd = appSrc.indexOf(iifeEndMark);
if (iifeStart < 0 || iifeEnd < 0) { console.error('IIFE not found'); process.exit(2); }
let src = appSrc.slice(iifeStart, iifeEnd + iifeEndMark.length);

// probes: record which internal synth actually ran (dispatch honesty)
const PROBES = ['beamCharge', 'beamFire', 'droneBeam', 'beamTechWindup', 'burstWindup', 'burstDetonate',
  'chargeWindup', 'chargeImpact', 'lockonTick', 'lockonHit', 'lineWindup', 'lineStrike',
  'rushWindup', 'rushHit', 'diveWindup', 'diveImpact', 'ambushSnap', 'impactWild',
  'heartbeat', 'stopHeartbeat', 'humBuild', 'humStop', 'sting'];
for (const n of PROBES) {
  const re = new RegExp('(function ' + n + '\\([^)]*\\) \\{)');
  if (!re.test(src)) { console.error('probe target missing: ' + n); process.exit(2); }
  src = src.replace(re, '$1 __fired.push("' + n + '");');
}

function boot(opts) {
  opts = opts || {};
  const fired = [];
  let liveIntervals = 0;
  const realSet = setInterval;
  const sandbox = {
    __fired: fired,
    Game: {},
    window: opts.window || fakeWindow,
    localStorage: opts.localStorage || freshLS(),
    Math, console, Promise, Float32Array,
    setInterval: (fn, ms, ...a) => { liveIntervals++; return realSet(fn, ms, ...a); },
    clearInterval: (id) => { liveIntervals = Math.max(0, liveIntervals - 1); return clearInterval(id); },
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'combataudio.js' });
  return { Game: sandbox.Game, fired, live: () => liveIntervals, ls: sandbox.localStorage };
}
function masterOf(ctx) {
  return ctx.nodes.find(n => n.kind === 'gain' && n.connections.some(d => d && d.kind === 'comp'));
}

// ================= ENGINE TESTS =================
console.log('\n[engine] cue inventory');
{
  ctxInstances.length = 0;
  const { Game } = boot();
  const keys = Object.keys(Game.audio);
  ok(keys.length >= 200, 'registry has 200+ voices', 'got ' + keys.length);
  ok(keys.every(k => typeof Game.audio[k] === 'function'), 'every registry key is a function');
}

console.log('\n[engine] no-throw sweep — every voice fires with hostile/empty data');
{
  ctxInstances.length = 0;
  const { Game } = boot();
  const datas = [{}, { pattern: 'charge', urgency: 1 }, { beam: true, highbeam: true },
    { stacks: 9 }, { round: 3 }, { quiet: true }, { cause: 'x' }, { pan: 0.5, heat: 0.7 },
    { dur: 1.5 }, null, 'junk', 42];
  const threw = [];
  for (const k of Object.keys(Game.audio)) {
    if (k === 'toggleMute' || k === 'isMuted' || k === 'ensureAudio') continue;
    for (const d of datas) {
      try { Game.audio[k](d); } catch (e) { threw.push(k + ': ' + e.message); }
    }
  }
  Game.audio.combatEnd(); Game.audio.heartbeatStop();
  ok(threw.length === 0, 'no voice throws on any data', threw.slice(0, 3).join(' | '));
}

console.log('\n[engine] pattern dispatch honesty (impact/telegraph/patternWindup)');
{
  const { Game, fired } = boot();
  const last = () => fired[fired.length - 1];
  // NOTE: resolve synths call stopHeartbeat() internally, so assert on
  // includes() (the right voice ran) and absence of impactWild (wrong one).
  fired.length = 0; Game.audio.impact({ pattern: 'charge' });
  ok(fired.includes('chargeImpact') && !fired.includes('impactWild'),
    "impact({pattern:'charge'}) -> chargeImpact (not impactWild)", fired.join(','));
  fired.length = 0; Game.audio.impact({ pattern: 'beam' });
  ok(fired.includes('droneBeam') && !fired.includes('impactWild'),
    "impact({pattern:'beam'}) -> droneBeam (machine beam, not impactWild)", fired.join(','));
  fired.length = 0; Game.audio.impact({ beam: true, highbeam: true });
  ok(fired.includes('beamFire'), 'impact({beam,highbeam}) -> beamFire (the deer)', fired.join(','));
  fired.length = 0; Game.audio.impact({});
  ok(fired.includes('impactWild'), 'impact({}) -> impactWild fallthrough', fired.join(','));
  fired.length = 0; Game.audio.impact({ pattern: 'lockon' });
  ok(fired.includes('lockonHit') && !fired.includes('impactWild'),
    "impact({pattern:'lockon'}) -> lockonHit (new mapping)", fired.join(','));
  fired.length = 0; Game.audio.impact({ pattern: 'ambush' });
  ok(fired.includes('ambushSnap') && !fired.includes('impactWild'),
    "impact({pattern:'ambush'}) -> ambushSnap", fired.join(','));
  fired.length = 0; Game.audio.telegraph({ pattern: 'burst', urgency: 1 });
  ok(fired.includes('burstWindup'), "telegraph({pattern:'burst'}) -> burstWindup", fired.slice(-3).join(','));
  fired.length = 0; Game.audio.telegraph({ pattern: 'lockon', urgency: 1 });
  ok(fired.includes('lockonTick'), "telegraph({pattern:'lockon'}) -> lockonTick (new mapping)", fired.slice(-3).join(','));
  fired.length = 0; Game.audio.telegraph({ pattern: 'ambush', urgency: 1 });
  ok(!fired.some(f => /Windup|Charge/.test(f)) && fired.includes('heartbeat'),
    "telegraph({pattern:'ambush'}) stays silent by design (heartbeat only)", fired.slice(-3).join(','));
  fired.length = 0; Game.audio.patternWindup({ pattern: 'rush' });
  ok(last() === 'rushWindup', "patternWindup({pattern:'rush'}) -> rushWindup", 'got ' + last());
  Game.audio.combatEnd();
}

console.log('\n[softlock] AudioContext lifecycle — suspended / closed / missing');
{
  ctxInstances.length = 0;
  FakeAudioContext.nextState = 'suspended';
  const b1 = boot();
  b1.Game.audio.shout();
  const c1 = ctxInstances[ctxInstances.length - 1];
  ok(c1.resumeCount > 0, 'suspended context: ensure() calls resume()', 'resumeCount=' + c1.resumeCount);
  b1.Game.audio.combatEnd();
  FakeAudioContext.nextState = null;

  // closed context (iOS memory pressure): must rebuild, not build on the corpse
  ctxInstances.length = 0;
  const b2 = boot();
  b2.Game.audio.shout();
  const before = ctxInstances.length;
  const dead = ctxInstances[ctxInstances.length - 1];
  dead.state = 'closed';
  b2.Game.audio.shout();
  ok(ctxInstances.length === before + 1, 'closed context: ensure() rebuilds a fresh context',
    'instances ' + before + ' -> ' + ctxInstances.length);
  b2.Game.audio.combatEnd();

  // no Web Audio at all: every voice must no-op, never throw
  const b3 = boot({ window: { AudioContext: ThrowingAudioContext } });
  let threw = null;
  try { b3.Game.audio.combatEnd(); b3.Game.audio.victory(); b3.Game.audio.impact({ pattern: 'charge' }); } catch (e) { threw = e; }
  ok(!threw, 'AudioContext constructor throws: all voices no-op silently', threw && threw.message);
}

console.log('\n[honesty] mute actually mutes everything, persists');
{
  ctxInstances.length = 0;
  const { Game, ls } = boot();
  ok(Game.audio.isMuted() === false, 'starts unmuted (clean localStorage)');
  Game.audio.toggleMute(); // mute BEFORE any context exists
  ok(Game.audio.isMuted() === true && ls.getItem('oversight_mute') === '1', 'toggleMute flips + persists');
  Game.audio.shout(); // build the graph while muted
  const ctx = ctxInstances[ctxInstances.length - 1];
  const m = masterOf(ctx);
  ok(!!m && m.gain.value === 0.0001, 'muted boot: master gain built at 0.0001 (silent)',
    m ? 'master gain=' + m.gain.value : 'no master found');
  Game.audio.toggleMute(); // unmute with live ctx -> ramps to 0.9
  ok(m.gain.lastRamp === 0.9, 'unmute ramps master back to 0.9', 'lastRamp=' + m.gain.lastRamp);
  ok(Game.audio.isMuted() === false && ls.getItem('oversight_mute') === '0', 'toggle back restores + persists');
  // fresh boot with persisted mute: starts muted
  const b2 = boot({ localStorage: freshLS({ oversight_mute: '1' }) });
  ok(b2.Game.audio.isMuted() === true, 'persisted mute=1: fresh boot starts muted');
  b2.Game.audio.combatEnd(); Game.audio.combatEnd();
}

console.log('\n[honesty] no mute bypass — every voice routes through master');
{
  ctxInstances.length = 0;
  const { Game } = boot();
  for (const k of Object.keys(Game.audio)) {
    if (k === 'toggleMute' || k === 'isMuted' || k === 'ensureAudio') continue;
    try { Game.audio[k]({ pattern: 'burst', urgency: 1, stacks: 3 }); } catch (e) {}
  }
  Game.audio.combatEnd(); Game.audio.heartbeatStop();
  const bad = [];
  for (const c of ctxInstances) for (const kind of c.directConnects) {
    if (kind !== 'comp') bad.push(kind); // only the compressor may touch destination
  }
  ok(bad.length === 0, 'no voice connects directly to destination (all through master)', bad.slice(0, 5).join(','));
}

console.log('\n[softlock] sustained handles — no leaked intervals / drones');
{
  const { Game, live } = boot();
  Game.audio.heartbeat(); Game.audio.heartbeat(); Game.audio.heartbeat();
  ok(live() === 1, 'heartbeat() x3: exactly one interval (idempotent)', 'live=' + live());
  Game.audio.beamSweep(0.5, 0.5); Game.audio.beamSweep(-0.5, 0.9);
  Game.audio.beamSweepStop(); Game.audio.beamSweepStop(); // double stop safe
  ok(true, 'beamSweepStop() double-call safe');
  const b2 = boot();
  b2.fired.length = 0;
  const oscCount = () => ctxInstances[ctxInstances.length - 1].nodes.filter(n => n.kind === 'osc').length;
  b2.Game.audio.beamCharge(1.5); const n1 = oscCount();
  b2.Game.audio.beamCharge(1.5); const n2 = oscCount(); // idempotent: second call no-ops
  ok(n2 === n1 && n1 > 0, 'beamCharge() double-start idempotent (no stacked drones)', n1 + ' -> ' + n2);
  Game.audio.combatEnd(); b2.Game.audio.combatEnd();
  ok(live() === 0, 'combatEnd(): heartbeat interval cleared', 'live=' + live());
}

// ================= STATIC AUDITS =================
console.log('\n[deadcode] static audits');
{
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const ctSrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');

  // registry keys (from the return block)
  const retStart = appSrc.lastIndexOf('return {', appSrc.indexOf('Game.audio = CombatAudio;'));
  const retEnd = appSrc.indexOf('};', retStart);
  const regBody = appSrc.slice(retStart, retEnd);
  const regKeys = new Set([...regBody.matchAll(/^\s{6}([A-Za-z0-9_]+)\([^)]*\)\s*\{/gm)].map(m => m[1]));

  // S1: every literal audioEvent('x') resolves (telegraph/impact are dispatchers)
  const fired = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    if (!f.endsWith('.js')) continue;
    const t = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
    for (const m of t.matchAll(/audioEvent\(\s*['"]([A-Za-z0-9_]+)['"]/g)) fired.add(m[1]);
  }
  const DISPATCH = new Set(['telegraph', 'impact']);
  const misfire = [...fired].filter(n => !regKeys.has(n) && !DISPATCH.has(n));
  ok(misfire.length === 0, 'every literal audioEvent(name) resolves in the registry', misfire.join(','));

  // S2: monsters.json audio fields resolve
  const mons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const jset = new Set();
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if (/audio$/i.test(k) && typeof v === 'string') jset.add(v);
      walk(v);
    }
  })(mons);
  const jmiss = [...jset].filter(n => !regKeys.has(n));
  ok(jmiss.length === 0, 'every monsters.json *Audio cue resolves', jmiss.join(','));

  // S3: contest beat defs + declared beats resolve
  const bm = ctSrc.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\n  \};/);
  const beats = new Set([...bm[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map(m => m[1]));
  const parts = new Set();
  for (const m of bm[1].matchAll(/\[(.*?)\]/g)) for (const p of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) parts.add(p[1]);
  const pmiss = [...parts].filter(n => !regKeys.has(n));
  ok(pmiss.length === 0, 'every CX_BEAT_DEFS part resolves in the registry', pmiss.join(','));
  const declared = new Set([...ctSrc.matchAll(/beat:\s*['"]([A-Za-z0-9_]+)['"]/g)].map(m => m[1]));
  const dmiss = [...declared].filter(n => n !== 'name' && !beats.has(n) && !regKeys.has(n));
  ok(dmiss.length === 0, 'every declared contest beat resolves', dmiss.join(','));

  // S4: dynamic wound dispatch names resolve
  ok(['woundEnraged', 'woundCunning', 'woundDesperate'].every(n => regKeys.has(n)),
    "dynamic 'wound'+wcap dispatch (Enraged/Cunning/Desperate) resolves");

  // S5: EXPLOIT — audio engine cannot run game logic (no Game.* refs inside IIFE;
  // strip comments first — the HOOK CONTRACT comment mentions Game.audioEvent)
  const iifeOnly = appSrc.slice(iifeStart, iifeEnd).replace(/\/\/[^\n]*/g, '');
  const gameRefs = [...iifeOnly.matchAll(/\bGame\./g)].length;
  ok(gameRefs === 0, 'CombatAudio IIFE has zero Game.* references (audio cannot drive game logic)',
    gameRefs + ' refs');

  // S6: honesty fix — the telegraph-resolve site passes pattern data (was: bare impact -> impactWild)
  ok(/const _rpt = \(tg\.pattern \|\| \{\}\)\.type;\s*\n\s*this\.audioEvent\('impact', \{ pattern: _rpt, beam: _rpt === 'beam', highbeam: [^}]+\}\);/.test(gameSrc),
    "tbMonsterTurn resolve passes pattern data to impact() (not bare impactWild)");
  ok(/audioEvent\('impact', \{ pattern: 'rush' \}\)/.test(gameSrc),
    "service_mimic rush resolve passes pattern:'rush' to impact()");

  // S7: lockon mapped in all three dispatchers
  const lockonMaps = (appSrc.match(/pat === 'lockon'\)/g) || []).length;
  ok(lockonMaps >= 3, "'lockon' pattern mapped in telegraph/impact/patternWindup dispatch", lockonMaps + ' sites');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (failures.length) { console.log('failures:\n - ' + failures.join('\n - ')); process.exit(1); }
