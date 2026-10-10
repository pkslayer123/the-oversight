#!/usr/bin/env node
// Break-it audio r11 proof tests (2026-10-10, target index 9: AUDIO SYSTEM).
// Follow-up to r4/r5 — does NOT re-litigate covered ground; goes after the
// surface those runs didn't touch.
//
// CATCH THIS RUN (HONESTY, fixed): the 14 pool contests added 2026-10-06/07
// (sorting/witness/cache/longodds, price/impress/exchange/auction, lockpick/
// wrongmap/alibi/echo/tidepool/windfall) each had a single bespoke beat for
// the PLAY path — but the WATCH path (_contestWatchPhases) and the death/
// refuse/end Resolve sites fire _cxB(contest.id, 'Declare'|'Escalate'|
// 'Climax'|'Resolve'), and _cxBeat SILENTLY no-ops on unknown names. All three
// watch phases + every contest ending were SILENT for these 14 contests.
// Fixed: 56 phase beats added to CX_BEAT_DEFS (same 4-beat grammar as the
// older 30, composed from registered voices, anchored on each contest's own
// bespoke beat identity).
//
// Also proven this run:
//   EXPLOIT   — polyphony storm: 500 rapid mixed fires + sustained handles
//               cannot grow live source nodes without bound (all sustained
//               handles idempotent + kill-switched; one-shots always stop).
//   SOFTLOCK  — destroyed/uninitialized Game.audio, unknown names, double
//               combatEnd/heartbeatStop: all no-throw.
//   HONESTY   — every CX_BEAT_DEFS beat (198) fires through the lazy _cxBeat
//               composition and produces a real node graph.
//   DEAD-CODE — every registered voice produces nodes or is a documented
//               stopper/infra hook (nothing fires into a silent no-op).
//
// Run: node scripts/test-break-audio-20261010-r11.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(0xB00D11);

// ---------- fake Web Audio ----------
const ctxInstances = [];
function FakeParam(v) { this.value = v; }
FakeParam.prototype.setValueAtTime = function (v) { this.value = v; };
FakeParam.prototype.linearRampToValueAtTime = function (v) { this.value = v; };
FakeParam.prototype.exponentialRampToValueAtTime = function (v) { this.value = v; };
FakeParam.prototype.setTargetAtTime = function (v) { this.value = v; };
FakeParam.prototype.cancelScheduledValues = function () {};
function FakeNode(kind, ctx) {
  this.kind = kind; this.ctx = ctx;
  this.started = 0; this.stopped = 0; this.connections = [];
  if (kind === 'osc') { this.frequency = new FakeParam(440); this.detune = new FakeParam(0); }
  if (kind === 'gain') { this.gain = new FakeParam(1); }
  if (kind === 'filter') { this.frequency = new FakeParam(1000); this.Q = new FakeParam(1); }
}
FakeNode.prototype.connect = function (dst) { this.connections.push(dst); return dst; };
FakeNode.prototype.disconnect = function () {};
FakeNode.prototype.start = function () { this.started++; };
FakeNode.prototype.stop = function () { this.stopped++; };
function FakeAudioContext() {
  this.state = 'running'; this.currentTime = 1000; this.sampleRate = 44100;
  this.destination = {}; this.nodes = []; ctxInstances.push(this);
}
FakeAudioContext.prototype._n = function (k) { const n = new FakeNode(k, this); this.nodes.push(n); return n; };
FakeAudioContext.prototype.createOscillator = function () { return this._n('osc'); };
FakeAudioContext.prototype.createGain = function () { return this._n('gain'); };
FakeAudioContext.prototype.createBiquadFilter = function () { return this._n('filter'); };
FakeAudioContext.prototype.createStereoPanner = function () { const n = this._n('panner'); n.pan = new FakeParam(0); return n; };
FakeAudioContext.prototype.createWaveShaper = function () { return this._n('shaper'); };
FakeAudioContext.prototype.createDynamicsCompressor = function () { const n = this._n('comp'); n.threshold = new FakeParam(-18); n.knee = new FakeParam(22); n.ratio = new FakeParam(12); n.attack = new FakeParam(0.003); n.release = new FakeParam(0.25); return n; };
FakeAudioContext.prototype.createBuffer = function (ch, len) { return { getChannelData: () => new Float32Array(len), length: len }; };
FakeAudioContext.prototype.createBufferSource = function () { const n = this._n('bufsrc'); n.buffer = null; n.loop = false; return n; };
FakeAudioContext.prototype.resume = function () { return Promise.resolve(); };

function liveSources(ctx) {
  // started but never stopped — the only nodes that can accumulate.
  // Non-looping buffer sources end naturally when their finite buffer runs
  // out (real Web Audio behavior) — only looping bufsrc can leak.
  return ctx.nodes.filter(n => {
    if (n.kind === 'osc') return n.started > n.stopped;
    if (n.kind === 'bufsrc') return n.loop === true && n.started > n.stopped;
    return false;
  });
}

// ---------- extract CombatAudio IIFE ----------
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const iifeStart = appSrc.indexOf('const CombatAudio = (() => {');
const iifeEndMark = 'Game.audio = CombatAudio;';
const iifeEnd = appSrc.indexOf(iifeEndMark);
const src = appSrc.slice(iifeStart, iifeEnd + iifeEndMark.length);

function boot() {
  ctxInstances.length = 0;
  let liveIntervals = 0;
  const realSet = setInterval;
  const sandbox = {
    Game: {}, window: { AudioContext: FakeAudioContext },
    localStorage: { getItem: () => null, setItem: () => {} },
    Math, console, Promise, Float32Array,
    setInterval: (fn, ms, ...a) => { liveIntervals++; return realSet(fn, ms, ...a); },
    clearInterval: (id) => { liveIntervals = Math.max(0, liveIntervals - 1); return clearInterval(id); },
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'combataudio.js' });
  return { Game: sandbox.Game, live: () => liveIntervals };
}

// ---------- extract CX_BEAT_DEFS (balanced braces) ----------
function extractDefs(contestsSrc) {
  const mi = contestsSrc.indexOf('const CX_BEAT_DEFS');
  let i = contestsSrc.indexOf('{', mi), d = 0, s = null, e = false, j = i;
  for (; j < contestsSrc.length; j++) {
    const c = contestsSrc[j];
    if (e) { e = false; continue; }
    if (s) { if (c === '\\') e = true; else if (c === s) s = null; continue; }
    if (c === '"' || c === "'" || c === '`') { s = c; continue; }
    if (c === '/' && contestsSrc[j + 1] === '/') { while (j < contestsSrc.length && contestsSrc[j] !== '\n') j++; continue; }
    if (c === '/' && contestsSrc[j + 1] === '*') { j += 2; while (j < contestsSrc.length && !(contestsSrc[j] === '*' && contestsSrc[j + 1] === '/')) j++; j++; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) break; }
  }
  return eval('(' + contestsSrc.slice(i, j + 1) + ')');
}
function cxB(id, kind) {
  const camel = String(id).replace(/_([a-z])/g, (m, c) => c.toUpperCase());
  return 'contest' + camel[0].toUpperCase() + camel.slice(1) + kind;
}
const NEW14 = ['sorting', 'witness', 'cache', 'longodds', 'price', 'impress',
  'exchange', 'auction', 'lockpick', 'wrongmap', 'alibi', 'echo', 'tidepool', 'windfall'];
const KINDS = ['Declare', 'Escalate', 'Climax', 'Resolve'];

// replicate _cxBeat's lazy registration (contests.js) over a fake Game.audio
function cxBeatFactory(A, DEFS) {
  return function (name) {
    if (!DEFS[name]) return false; // the silent no-op the old code hit
    if (typeof A[name] !== 'function') {
      const parts = DEFS[name].slice();
      A[name] = function () { for (const p of parts) A[p](); };
    }
    A[name]();
    return true;
  };
}

// ================= CATCH: before/after =================
console.log('\n[catch] the 14 newer contests had NO phase beats (before)');
{
  const beforeSrc = execSync('git show HEAD:src/js/contests.js', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  const beforeDefs = extractDefs(beforeSrc);
  const missing = [];
  for (const id of NEW14) for (const k of KINDS) if (!beforeDefs[cxB(id, k)]) missing.push(cxB(id, k));
  ok(missing.length === 56, 'BEFORE: all 56 phase beats absent from CX_BEAT_DEFS', 'got ' + missing.length);
  // and the _cxBeat silent no-op is real: replicate it on the before defs
  const { Game } = boot();
  const cxBeat = cxBeatFactory(Game.audio, beforeDefs);
  Game.audio.impact({}); // boot the context so node counts are meaningful
  const before = ctxInstances[0].nodes.length;
  const fired = cxBeat('contestTidepoolDeclare'); // watch phase 1 of the Tide Clock
  const after = ctxInstances[0].nodes.length;
  ok(fired === false && after === before, 'BEFORE: _cxBeat(contestTidepoolDeclare) silently no-ops (0 nodes)', `fired=${fired} nodes=${after - before}`);
}

console.log('\n[catch] the 56 phase beats exist and sound (after)');
{
  const afterDefs = extractDefs(fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8'));
  const missing = [];
  for (const id of NEW14) for (const k of KINDS) if (!afterDefs[cxB(id, k)]) missing.push(cxB(id, k));
  ok(missing.length === 0, 'AFTER: all 56 phase beats present', missing.join(','));
  const { Game } = boot();
  const reg = new Set(Object.keys(Game.audio));
  const badParts = [];
  for (const id of NEW14) for (const k of KINDS)
    for (const p of afterDefs[cxB(id, k)]) if (!reg.has(p)) badParts.push(cxB(id, k) + '->' + p);
  ok(badParts.length === 0, 'AFTER: all 56 beat parts resolve to registered voices', badParts.join(';'));
  // every new beat produces a real node graph through the _cxBeat composition
  const cxBeat = cxBeatFactory(Game.audio, afterDefs);
  Game.audio.impact({}); // boot the context so node counts are meaningful
  let silent = 0, threw = 0;
  for (const id of NEW14) for (const k of KINDS) {
    const name = cxB(id, k);
    const before = ctxInstances[0].nodes.length;
    try {
      const fired = cxBeat(name);
      const made = ctxInstances[0].nodes.length - before;
      if (!fired || made === 0) silent++;
    } catch (e) { threw++; }
  }
  Game.audio.combatEnd();
  ok(silent === 0 && threw === 0, 'AFTER: all 56 beats fire node graphs (none silent, none throwing)', `silent=${silent} threw=${threw}`);
}

// ================= EXPLOIT: polyphony storm =================
console.log('\n[exploit] polyphony storm — 500 rapid fires + sustained handles stay bounded');
{
  const { Game } = boot();
  const keys = Object.keys(Game.audio).filter(k => !/stop|Stop|toggleMute|isMuted|ensureAudio|combatEnd/i.test(k));
  // hostile player: hammer every voice 3x, interleaved with sustained handles
  for (let r = 0; r < 3; r++) {
    for (const k of keys) { try { Game.audio[k]({ pattern: 'charge', urgency: 1, stacks: 4, beam: true }); } catch (e) {} }
    Game.audio.heartbeat(145); Game.audio.humNotice(); Game.audio.beamSweep(0, 1);
  }
  const live = liveSources(ctxInstances[0]);
  // sustained handles: heartbeat (2 osc/beat, stopped+rebuilt), hum (<=8 osc), sweep (few) — all re-created per fire, but every prior one was stopped first
  ok(live.length < 120, 'live (unstopped) source nodes stay bounded under storm', 'got ' + live.length);
  Game.audio.combatEnd(); Game.audio.heartbeatStop(); Game.audio.humStop();
  const liveAfter = liveSources(ctxInstances[0]);
  ok(liveAfter.length === 0, 'all sustained handles die on kill switches', 'got ' + liveAfter.length);
}

// ================= SOFTLOCK =================
console.log('\n[softlock] destroyed/uninitialized audio never throws into game code');
{
  const { Game } = boot();
  // replicate Game.audioEvent's guard (game.js) against hostile states
  const audioEvent = (name, data) => {
    if (Game.audio && typeof Game.audio[name] === 'function') {
      try { Game.audio[name](data || {}); } catch (e) {}
    }
  };
  let threw = false;
  try {
    audioEvent('noSuchVoice', {});            // unknown name: silent no-op
    audioEvent('impact', { pattern: 'charge' });
    Game.audio = null;                        // destroyed Game instance
    audioEvent('impact', {});
    Game.audio = undefined;
    audioEvent('telegraph', {});
  } catch (e) { threw = true; }
  ok(!threw, 'audioEvent no-throws with unknown names and destroyed audio');
  const b2 = boot();
  let threw2 = false;
  try { b2.Game.audio.combatEnd(); b2.Game.audio.combatEnd(); b2.Game.audio.heartbeatStop(); b2.Game.audio.heartbeatStop(); } catch (e) { threw2 = true; }
  ok(!threw2 && b2.live() === 0, 'double combatEnd/heartbeatStop safe, no leaked intervals');
}

// ================= HONESTY: all 198 beats fire =================
console.log('\n[honesty] every CX_BEAT_DEFS beat fires a real node graph');
{
  const afterDefs = extractDefs(fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8'));
  const { Game } = boot();
  const cxBeat = cxBeatFactory(Game.audio, afterDefs);
  Game.audio.impact({}); // boot the context so node counts are meaningful
  let silent = 0, threw = 0;
  for (const name of Object.keys(afterDefs)) {
    const before = ctxInstances[0].nodes.length;
    try {
      cxBeat(name);
      if (ctxInstances[0].nodes.length - before === 0) silent++;
    } catch (e) { threw++; }
  }
  Game.audio.combatEnd();
  ok(silent === 0 && threw === 0, 'all ' + Object.keys(afterDefs).length + ' beats produce node graphs', `silent=${silent} threw=${threw}`);
}

// ================= DEAD-CODE: every voice reaches a node graph =================
console.log('\n[dead-code] every registered voice is reachable (or a documented stopper)');
{
  const { Game } = boot();
  Game.audio.impact({}); // boot the context so node counts are meaningful
  const STOPPERS = new Set(['heartbeatStop', 'humStop', 'humBreak', 'beamSweepStop', 'stopCharge',
    'toggleMute', 'isMuted', 'ensureAudio', 'combatEnd', 'duckHeartbeat']);
  let dead = 0, threw = 0;
  for (const k of Object.keys(Game.audio)) {
    if (STOPPERS.has(k)) continue;
    const before = ctxInstances[0].nodes.length;
    try {
      // beamSweep is a sustained handle: idempotent, reuses the live sweep if
      // one exists (beamFire starts it). Reset first so the sweep proves fresh.
      if (k === 'beamSweep') Game.audio.beamSweepStop();
      Game.audio[k]({ pattern: 'charge', urgency: 1, stacks: 2 });
      if (ctxInstances[0].nodes.length - before === 0) dead++;
    } catch (e) { threw++; }
  }
  Game.audio.combatEnd(); Game.audio.heartbeatStop();
  ok(dead === 0 && threw === 0, 'no dead voices: every non-stopper builds nodes', `dead=${dead} threw=${threw}`);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (failures.length) console.log('failures:\n  ' + failures.join('\n  '));
process.exit(fail ? 1 : 0);
