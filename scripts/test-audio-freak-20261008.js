#!/usr/bin/env node
// test-audio-freak-20261008.js — proof for the 2026-10-08 freak pass on wave-2
// aggro/resolve synths in src/js/app.js (CombatAudio registry).
//
// What this PROVES (static analysis only — audio cannot be heard in node):
//  A. The 5 deepened synths are still registered under their ORIGINAL keys,
//     with the same call signature (arity), so dispatch is byte-identical.
//  B. Each deepened synth body contains its new freak-layer markers and a
//     layered voice count (oscillators + noise sources), i.e. the "freakier"
//     config is statically present, not just claimed.
//  C. Registry integrity: every audioEvent/encAudio literal fired anywhere in
//     src/js + every audio hook named in monsters.json + every DRAMA_AUDIO_MATES
//     mate resolves to a registry key; every registry key dispatches to a
//     function defined exactly once; the dead patternResolve alias is gone and
//     nothing calls it.
// What this does NOT prove: perceived freakiness. That needs a phone listen.
//
// Run: node scripts/test-audio-freak-20261008.js   (no jest; plain node)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
}

// ---------- locate the CombatAudio return block ----------
const iifeStart = appSrc.indexOf('const CombatAudio = (() => {');
check('CombatAudio IIFE exists', iifeStart >= 0);
const retIdx = appSrc.indexOf('    return {', iifeStart);
check('registry return block found', retIdx > iifeStart);
const retEnd = appSrc.indexOf('\n    };', retIdx);
check('registry return block closed', retEnd > retIdx);
const retBlock = appSrc.slice(retIdx, retEnd);

// registry keys: method-shorthand entries like `landlordClaim() { landlordClaim(); },`
const keyRe = /^\s{6}(\w+)\(([^)]*)\)\s*\{/gm;
const registry = new Map(); // key -> {params, body}
let m;
while ((m = keyRe.exec(retBlock))) {
  // entry terminator: first "}," after the match. Single-line entries end
  // mid-line (possibly with a trailing comment); multi-line entries end on a
  // 6-space "}," line. No "}," occurs inside entry bodies (verified).
  const term = retBlock.indexOf('},', m.index);
  const end = term > m.index ? term : m.index + 200;
  const body = retBlock.slice(m.index, end);
  registry.set(m[1], { params: m[2].trim(), body });
}
check('registry has 200+ keys', registry.size >= 200, 'got ' + registry.size);

// all function definitions in the IIFE
const defRe = /function (\w+)\(([^)]*)\)\s*\{/g;
const defs = new Map(); // name -> {count, params}
while ((m = defRe.exec(appSrc))) {
  const e = defs.get(m[1]) || { count: 0, params: null };
  e.count++; e.params = m[2].trim();
  defs.set(m[1], e);
}
// scope to the IIFE body for body-extraction
const iifeEnd = appSrc.indexOf('})();', retEnd);
function fnBody(name) {
  const idx = appSrc.indexOf('function ' + name + '(', iifeStart);
  if (idx < 0 || idx > iifeEnd) return null;
  // find matching close brace from the opening brace
  let depth = 0, i = appSrc.indexOf('{', idx);
  const start = i;
  for (; i < appSrc.length; i++) {
    if (appSrc[i] === '{') depth++;
    else if (appSrc[i] === '}') { depth--; if (depth === 0) break; }
  }
  return appSrc.slice(start, i + 1);
}

// ---------- A. touched synths: wiring unchanged ----------
const touched = {
  landlordClaim:   ['77.78', 'thump(t + 0.15'],          // tritone notary drone + stamping
  hecklerPileOn:   ['1.0178', 'whisper-crowd'],           // sour 30-cents stream + whisper crowd
  modNotice:       ['Math.pow(8, i / steps)', 'DENIED'],  // stepped handshake + verdict
  sunbaskerShimmer:['8.93', '7.3'],                        // inharmonic scale partials + mirage AM
  unionBullhorn:   ['155.6', 'thump(t + 0.2'],            // tritone choir + stomp line
};
for (const [fn, markers] of Object.entries(touched)) {
  check(fn + ' defined exactly once', defs.get(fn) && defs.get(fn).count === 1,
    'count=' + (defs.get(fn) || {}).count);
  const reg = registry.get(fn);
  check(fn + ' registered under original key', !!reg);
  // self-dispatch: the entry body calls the same-named function
  const selfCall = reg && new RegExp('(?<![.\\w])' + fn + '\\s*\\(').test(reg.body);
  check(fn + ' registry dispatches to self', !!selfCall);
  check(fn + ' arity unchanged (0 params)', defs.get(fn) && defs.get(fn).params === '',
    'params=' + JSON.stringify((defs.get(fn) || {}).params));
  const body = fnBody(fn);
  check(fn + ' body found', !!body);
  if (body) {
    const voices = (body.match(/\bcreateOscillator\s*\(/g) || []).length
                 + (body.match(/\bnoise\s*\(/g) || []).length
                 + (body.match(/\bthump\s*\(/g) || []).length;
    check(fn + ' layered (>=4 voice sources)', voices >= 4, 'voices=' + voices);
    for (const mk of markers) {
      check(fn + ' freak-layer marker present: ' + JSON.stringify(mk), body.includes(mk));
    }
    const types = new Set((body.match(/\.type\s*=\s*'(\w+)'/g) || []).map(s => s.match(/'(\w+)'/)[1]));
    check(fn + ' uses oscillator types', types.size >= 1, [...types].join(','));
  }
}
// neighbor sanity: the hecklerLaugh -> hecklerTaunt alias dispatch untouched
check('hecklerLaugh still dispatches to hecklerTaunt',
  registry.get('hecklerLaugh') && /(?<![.\w])hecklerTaunt\s*\(/.test(registry.get('hecklerLaugh').body));

// ---------- C. registry integrity ----------
// Every call a registry entry makes must target a defined IIFE function.
// (Entries are one-liner shorthands or small dispatchers; keywords and
// Math.* / obj.method calls are excluded.)
const JS_KW = new Set(['if','for','while','return','const','let','var','new','else','switch',
  'case','typeof','function','do','in','of','try','catch','void','delete','instanceof','break','continue']);
// Entries that make no function calls at all (state accessors) — legit, allow-listed.
const NO_CALL_OK = new Set(['isMuted']);
let calleeFails = 0;
for (const [key, r] of registry) {
  // inner = text INSIDE the entry braces; strip trailing // comments (they
  // contain parentheticals like "(Steve 2026-10-06)" that fake calls)
  const inner = r.body.slice(r.body.indexOf('{') + 1).replace(/\/\/[^\n]*/g, '');
  const calls = new Set();
  let cm; const callRe = /(?<![.\w])(\w+)\s*\(/g;
  while ((cm = callRe.exec(inner))) { if (!JS_KW.has(cm[1])) calls.add(cm[1]); }
  if (calls.size === 0) {
    if (!NO_CALL_OK.has(key)) { calleeFails++; failures.push('registry entry makes no calls: ' + key); }
    continue;
  }
  for (const c of calls) {
    const d = defs.get(c);
    if (!d || d.count !== 1) { calleeFails++; failures.push('registry callee broken: ' + key + ' calls ' + c); }
  }
}
check('all ' + registry.size + ' registry entries call once-defined functions', calleeFails === 0,
  calleeFails + ' broken');

// audioEvent('X') / encAudio('X') literals across src/js
const fired = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  for (const re of [/audioEvent\(\s*'([^']+)'/g, /audioEvent\(\s*"([^"]+)"/g,
                     /encAudio\(\s*'([^']+)'/g, /encAudio\(\s*"([^"]+)"/g]) {
    let mm; while ((mm = re.exec(src))) fired.add(mm[1]);
  }
}
// data-driven hooks from monsters.json
for (const mon of Object.values(monsters)) {
  const enc = (mon && mon.encounter) || {};
  for (const k of ['declareAudio', 'aggroAudio', 'deathAudio', 'resolveAudio', 'noticeAudio']) {
    if (enc[k]) fired.add(enc[k]);
  }
}
// drama audio mates
const dramaSrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
const matesBlock = dramaSrc.match(/DRAMA_AUDIO_MATES\s*=\s*\{([\s\S]*?)\};/);
if (matesBlock) {
  let mm; const re = /['"](\w+)['"]\s*:\s*['"](\w+)['"]/g;
  while ((mm = re.exec(matesBlock[1]))) fired.add(mm[2]);
}
// dynamic names the census verified (constructed at runtime)
for (const dyn of ['woundEnraged', 'woundCunning', 'woundDesperate']) fired.add(dyn);
// scrape false positives, documented: '<name>' is a doc-comment example in
// app.js:8094 (not a real hook); 'wound' is the dynamic prefix of the three
// wound* hooks above (game.js:20348), verified by the 2026-10-08 census.
const SCRAPE_EXCLUDE = new Set(['<name>', 'wound']);

const unfired = [...fired].filter(n => !registry.has(n) && !SCRAPE_EXCLUDE.has(n));
check('every fired hook resolves to a registry key', unfired.length === 0,
  unfired.slice(0, 10).join(', ') + (unfired.length > 10 ? ' ...' : ''));
check('registry size sane vs fired names', registry.size >= fired.size,
  'registry=' + registry.size + ' fired=' + fired.size);

// patternResolve: dead alias fully gone
check('patternResolve removed from registry', !registry.has('patternResolve'));
const prCalls = (appSrc.match(/audioEvent\(\s*['"]patternResolve['"]/g) || []).length
  + [...fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'))]
    .reduce((n, f) => n + (fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')
      .match(/\bpatternResolve\s*\(/g) || []).length, 0);
check('no patternResolve call sites anywhere', prCalls === 0, prCalls + ' found');

console.log('\nAUDIO-FREAK PROOF: ' + pass + ' pass, ' + fail + ' fail');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); }
console.log('NOTE: static wiring + config distinctness only. Freakiness needs a phone listen.');
process.exit(fail ? 1 : 0);
