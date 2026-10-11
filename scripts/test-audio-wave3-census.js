// Break-it audio — wave-3 voice census (HOSTILE: fired-but-silent hooks).
//
// The bug class: Game.audioEvent(name) silently no-ops when `name` is not a
// registered Game.audio voice (game.js audioEvent). Wave-3's signature files
// (sigW3a/b/c.js) fire bespoke voices that were never registered in app.js's
// CombatAudio IIFE — every signature beat plays mute.
//
// This script:
//   1. Parses the CombatAudio IIFE return block -> registered voice names.
//   2. Collects every literal audioEvent('name') fire in src/js (comments stripped).
//   3. Collects every *Audio cue in src/data/monsters.json (nested).
//   4. Collects every DRAMA_AUDIO_MATES voice in drama.js.
//   5. Collects every CX_BEAT_DEFS part in contests.js (beats lazily register;
//      parts must be real voices).
//   6. Adds dynamic dispatches (wound+Enraged/Cunning/Desperate).
//   7. FAILS if any fired name is not registered (silent no-op).
//   8. Runtime-smokes every registered voice against a stub AudioContext:
//      throwing-constructor (no-op, no throw) and a Proxy fake context
//      (runs, no throw) — the "silent path that errors" exploit check.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'src', 'js');

let failures = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) failures.push(msg); };

// ---------- 1. registered voices ----------
const appSrc = fs.readFileSync(path.join(JS, 'app.js'), 'utf8');
const iifeStart = appSrc.indexOf('const CombatAudio = (() => {');
ok(iifeStart > 0, 'CombatAudio IIFE found in app.js');
const assignIdx = appSrc.indexOf('Game.audio = CombatAudio;');
const iifeText = appSrc.slice(iifeStart, appSrc.lastIndexOf('})();', assignIdx) + 5);
const retStart = iifeText.indexOf('return {');
ok(retStart > 0, 'CombatAudio return block found');
const retClose = iifeText.lastIndexOf('};');
const retBlock = iifeText.slice(retStart, retClose);
const JS_KW = new Set(['if', 'while', 'for', 'switch', 'catch', 'with', 'do', 'else', 'try', 'finally']);
const registered = new Set();
for (const m of retBlock.matchAll(/^\s{6}([A-Za-z_$][\w$]*)\([^;]*?\)\s*\{/gm)) {
  if (!JS_KW.has(m[1])) registered.add(m[1]);
}
console.log('registered voices: ' + registered.size);
ok(registered.size > 200, 'registry populated (' + registered.size + ' voices)');

// ---------- 2. literal audioEvent fires ----------
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const fired = new Map(); // name -> files
const encAudioNames = new Set();
for (const f of fs.readdirSync(JS)) {
  if (!f.endsWith('.js')) continue;
  const clean = stripComments(fs.readFileSync(path.join(JS, f), 'utf8'));
  for (const m of clean.matchAll(/audioEvent\(\s*['"`]([A-Za-z0-9_]+)['"`]/g)) {
    if (!fired.has(m[1])) fired.set(m[1], []);
    fired.get(m[1]).push(f);
  }
  // encounters.js encAudio(name) resolves via this.audio[name] — same contract
  for (const m of clean.matchAll(/encAudio\(\s*['"`]([A-Za-z0-9_]+)['"`]/g)) encAudioNames.add(m[1]);
}
console.log('literal audioEvent names fired: ' + fired.size);

// ---------- 3. monsters.json *Audio cues ----------
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
const jsonCues = new Set();
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k.endsWith('Audio') && typeof v === 'string') jsonCues.add(v);
      walk(v);
    }
  }
})(monsters);
console.log('monsters.json *Audio cues: ' + jsonCues.size);

// ---------- 4. drama mates ----------
const dramaSrc = fs.readFileSync(path.join(JS, 'drama.js'), 'utf8');
const matesBlock = dramaSrc.slice(dramaSrc.indexOf('const DRAMA_AUDIO_MATES = {'), dramaSrc.indexOf('};', dramaSrc.indexOf('const DRAMA_AUDIO_MATES')));
const dramaVoices = new Set();
for (const m of matesBlock.matchAll(/:\s*'([A-Za-z0-9_]+)'/g)) dramaVoices.add(m[1]);
console.log('drama mates: ' + dramaVoices.size);

// ---------- 5. contest beat parts ----------
const cxSrc = fs.readFileSync(path.join(JS, 'contests.js'), 'utf8');
const defsStart = cxSrc.indexOf('const CX_BEAT_DEFS = {');
let depth = 0, defsEnd = defsStart;
for (let i = defsStart; i < cxSrc.length; i++) {
  if (cxSrc[i] === '{') depth++;
  else if (cxSrc[i] === '}') { depth--; if (depth === 0) { defsEnd = i; break; } }
}
const defsBlock = cxSrc.slice(defsStart, defsEnd);
const beatParts = new Set();
let beatCount = 0;
for (const m of defsBlock.matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*\[([^\]]*)\]/gm)) {
  beatCount++;
  for (const p of m[2].matchAll(/'([A-Za-z0-9_]+)'/g)) beatParts.add(p[1]);
}
console.log('contest beats: ' + beatCount + ', parts: ' + beatParts.size);

// ---------- 6. dynamic dispatches ----------
const dynamic = ['woundEnraged', 'woundCunning', 'woundDesperate'];

// ---------- 7. census ----------
const mustResolve = new Set([...fired.keys(), ...encAudioNames, ...jsonCues, ...dramaVoices, ...beatParts, ...dynamic]);
const silent = [...mustResolve].filter(n => !registered.has(n));
if (silent.length) {
  console.log('\nSILENT NO-OPS (fired but unregistered):');
  for (const n of silent.sort()) {
    const sites = fired.has(n) ? ' fire:' + [...new Set(fired.get(n))].join(',') : '';
    const js = jsonCues.has(n) ? ' json-cue' : '';
    const dr = dramaVoices.has(n) ? ' drama-mate' : '';
    const bp = beatParts.has(n) ? ' beat-part' : '';
    console.log('  - ' + n + sites + js + dr + bp);
  }
}
ok(silent.length === 0, 'every fired name resolves to a registered voice (' + silent.length + ' silent)');

// registered-but-never-referenced: informational (safety nets like wound() are deliberate)
const directCalls = new Set();
for (const f of fs.readdirSync(JS)) {
  if (!f.endsWith('.js')) continue;
  const clean = stripComments(fs.readFileSync(path.join(JS, f), 'utf8'));
  for (const m of clean.matchAll(/(?:Game\.audio|this\.audio|audio)\.([A-Za-z0-9_]+)\s*\(/g)) directCalls.add(m[1]);
}
const referenced = new Set([...fired.keys(), ...encAudioNames, ...jsonCues, ...dramaVoices, ...beatParts, ...dynamic, ...directCalls]);
const dead = [...registered].filter(n => !referenced.has(n));
console.log('\nregistered but never referenced: ' + dead.length + (dead.length ? ' -> ' + dead.sort().join(', ') : ' (none)'));
ok(dead.length === 0, 'no dead voices in the registry (' + dead.length + ' unreferenced)');

// ---------- 8. runtime smoke: every voice must survive hostile contexts ----------
function audioStub() {
  const f = function () { return audioStub(); };
  return new Proxy(f, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'state') return 'running';
      if (p === 'sampleRate') return 44100;
      if (p === 'currentTime') return 0;
      return audioStub();
    },
    set() { return true; },
    apply() { return audioStub(); },
  });
}
const timers = [];
const realSetInterval = global.setInterval;
global.setInterval = (fn, ms) => { const id = realSetInterval(fn, ms); timers.push(id); return id; };

// hostile context A: constructor throws (very old browser / blocked API)
let threw = 0, ran = 0;
{
  const g = { window: { AudioContext: function () { throw new Error('blocked'); } } };
  const factory = new Function('window', iifeText + '\nreturn CombatAudio;');
  let CA;
  try { CA = factory(g.window); } catch (e) { ok(false, 'IIFE builds when AudioContext constructor throws: ' + e.message); }
  if (CA) {
    for (const name of registered) {
      try { CA[name]({ n: 99, beat: 4, downbeat: true, pattern: 'beam', urgency: 1, round: 3, cause: 'bulldozer', quiet: false }); ran++; }
      catch (e) { threw++; console.log('  THREW (ctor-blocked): ' + name + ' — ' + e.message); }
    }
  }
}
ok(threw === 0, 'no voice throws when AudioContext is blocked (' + ran + ' voices no-op cleanly)');

// hostile context B: fake live context — voices must run without throwing
{
  const g = { window: { AudioContext: function () { return audioStub(); } } };
  const factory = new Function('window', iifeText + '\nreturn CombatAudio;');
  let CA;
  try { CA = factory(g.window); } catch (e) { ok(false, 'IIFE builds with stub context: ' + e.message); }
  if (CA) {
    let bthrew = 0;
    for (const name of registered) {
      try { CA[name]({ n: 99, beat: 4, downbeat: true, pattern: 'beam', urgency: 1, round: 3, cause: 'bulldozer', quiet: false }); }
      catch (e) { bthrew++; console.log('  THREW (live stub): ' + name + ' — ' + e.message); }
    }
    ok(bthrew === 0, 'no voice throws against a live AudioContext stub (' + registered.size + ' voices)');
  }
}
timers.forEach(clearInterval);
global.setInterval = realSetInterval;

console.log('\n' + (failures.length ? failures.length + ' FAILURE(S)' : 'ALL GREEN'));
process.exit(failures.length ? 1 : 0);
