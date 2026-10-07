#!/usr/bin/env node
// Audio emitter wiring audit — re-derives the emitter→registry wiring matrix
// at a single captured HEAD and reports orphaned emitters + dead synths.
// (Steve 2026-10-07, flesh-out loop queue #8)
//
// What it checks (all queries run against ONE captured HEAD, so the result is
// deterministic for a fixed tree):
//   1. every literal audioEvent('name') fire-site in src/js + index.html
//   2. every G.encAudio('name') site (encounters.js fallback dispatcher)
//   3. the CombatAudio registry keys (return block of the IIFE in app.js)
//   4. data-driven names: monsters.json audio-ish fields, drama.js audioFor
//      returns, contests.js CX_BEAT_DEFS composites + parts,
//      direct Game.audio.name() calls
//   5. the ENC_AUDIO_FALLBACK table (orphans with a composed fallback are not silent)
//
// Classification:
//   ORPHAN  = emitted (or composite part) but no registry entry and no
//             fallback -> the dispatcher no-ops -> the player hears SILENCE.
//   DEAD    = registry entry with no emitter of any kind (literal, data,
//             dynamic string constant, or internal-voice reachability).
//   Runtime-registered contest composites (contestSort, …) self-register on
//   first fire via G._cxBeat; they are wired as long as every part resolves.
//
// Exit code: 1 when orphans exist (prints the orphan list with file:line
// sites); 0 otherwise. Dead entries are warnings, printed in both cases.
//
// Usage: node scripts/test-audio-wiring-audit-20261007.js   (run from repo root)
'use strict';
const { execSync } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
function sh(cmd) {
  try {
    return execSync(cmd, { cwd: REPO, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return ''; // git grep exit 1 (no matches) lands here
  }
}

const HEAD = sh('git rev-parse HEAD').trim();
if (!/^[0-9a-f]{40}$/.test(HEAD)) { console.error('cannot resolve HEAD'); process.exit(2); }
const show = (p) => sh(`git show ${HEAD}:${p}`);
// shell double-quote a grep pattern (patterns used here contain no $, `, ", or newline)
const dq = (s) => `"${s}"`;
function grepRows(pattern, paths) {
  const out = sh(`git grep -n ${dq(pattern)} ${HEAD} -- ${paths.join(' ')}`);
  const rows = [];
  for (const ln of out.split('\n')) {
    if (!ln) continue;
    const m = ln.match(/^(?:HEAD|[0-9a-f]{40}):([^:]+):(\d+):(.*)$/);
    if (m) rows.push({ file: m[1], line: parseInt(m[2], 10), text: m[3] });
  }
  return rows;
}

// ---- 1. literal fire-sites ----
const litRows = grepRows("audioEvent('[A-Za-z0-9_]*'", ['src/js', 'index.html']);
const emitters = []; // [name, file, line]
for (const r of litRows) {
  const m = r.text.match(/audioEvent\('([A-Za-z0-9_]+)'/);
  if (m) emitters.push({ name: m[1], file: r.file, line: r.line });
}
// ---- 2. encAudio sites ----
const encRows = grepRows("encAudio('[A-Za-z0-9_]*'", ['src/js']);
const encNames = [];
for (const r of encRows) {
  const m = r.text.match(/encAudio\('([A-Za-z0-9_]+)'/);
  if (m) encNames.push({ name: m[1], file: r.file, line: r.line });
}
// ---- 3. registry keys: return-block entries at exactly 6-space indent ----
const app = show('src/js/app.js');
const iifeStart = app.indexOf('const CombatAudio = (() => {');
const iifeEnd = app.indexOf('Game.audio = CombatAudio', iifeStart);
const seg = app.slice(iifeStart, iifeEnd);
const rb = seg.slice(seg.lastIndexOf('return {'));
const registry = [...new Set([...rb.matchAll(/^      ([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1]))].sort();
// ---- 4a. monsters.json audio-ish string values ----
const mon = JSON.parse(show('src/data/monsters.json'));
const monVals = new Set();
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && (k.toLowerCase().includes('udio') || k === 'audio')) monVals.add(v);
      walk(v);
    }
  }
})(mon);
// ---- 4b. drama.js audioFor return values ----
const drama = show('src/js/drama.js');
const afBody = drama.slice(drama.indexOf('audioFor(kind, spec)'), drama.indexOf('})(typeof globalThis'));
const dramaVals = new Set([...afBody.matchAll(/return '([A-Za-z0-9_]+)'/g)].map(m => m[1]).filter(n => n !== 'null'));
// ---- 4c. contests.js CX_BEAT_DEFS composites ----
const cont = show('src/js/contests.js');
const cxm = cont.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\};/);
const composites = {};
const compParts = new Set();
if (cxm) {
  for (const m of cxm[1].matchAll(/(\w+): \[([^\]]+)\]/g)) {
    const parts = [...m[2].matchAll(/'([A-Za-z0-9_]+)'/g)].map(x => x[1]);
    composites[m[1]] = parts;
    parts.forEach(p => compParts.add(p));
  }
}
// ---- 4d. direct Game.audio.name() calls ----
const directRows = grepRows('Game\\.audio\\.([A-Za-z0-9_]+)\\(', ['src/js', 'index.html']);
const direct = new Set();
for (const r of directRows) {
  const m = r.text.match(/Game\.audio\.([A-Za-z0-9_]+)\(/);
  if (m) direct.add(m[1]);
}
// ---- 5. encAudio fallback table ----
const enc = show('src/js/encounters.js');
const fbm = enc.match(/var ENC_AUDIO_FALLBACK = \{([\s\S]*?)\};/);
const fallback = {};
if (fbm) {
  for (const m of fbm[1].matchAll(/(\w+): \[([^\]]*)\]/g)) {
    fallback[m[1]] = [...m[2].matchAll(/'([A-Za-z0-9_]+)'/g)].map(x => x[1]);
  }
}

// ---- assemble emitted set ----
const emitted = new Set();
emitters.forEach(e => emitted.add(e.name));
encNames.forEach(e => emitted.add(e.name));
monVals.forEach(v => emitted.add(v));
dramaVals.forEach(v => emitted.add(v));
Object.keys(composites).forEach(k => emitted.add(k));
compParts.forEach(p => emitted.add(p));
direct.forEach(d => emitted.add(d));

const CONTROLS = new Set(['isMuted', 'toggleMute', 'ensureAudio']);
const SIBLING_API = new Set(['patternWindup', 'patternResolve']);

// ---- internal-voice reachability: entry bodies calling other inner functions ----
const innerDefs = new Set([...seg.matchAll(/function ([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]));
const entryHeaders = [...rb.matchAll(/^      ([A-Za-z0-9_]+)\s*\(/gm)];
const calls = {};
for (let i = 0; i < entryHeaders.length; i++) {
  const name = entryHeaders[i][1];
  const bodyStart = entryHeaders[i].index + entryHeaders[i][0].length;
  const bodyEnd = i + 1 < entryHeaders.length ? entryHeaders[i + 1].index : rb.length;
  const body = rb.slice(bodyStart, bodyEnd);
  const called = new Set();
  for (const m of body.matchAll(/(?<![A-Za-z0-9_.])([A-Za-z0-9_]+)\s*\(/g)) {
    if (innerDefs.has(m[1]) && m[1] !== name) called.add(m[1]);
  }
  calls[name] = called;
}
const live = new Set([...emitted, ...CONTROLS, ...SIBLING_API]);
let changed = true;
while (changed) {
  changed = false;
  for (const k of [...live]) {
    for (const c of (calls[k] || [])) {
      if (registry.includes(c) && !live.has(c)) { live.add(c); changed = true; }
    }
  }
}

// ---- orphans: emitted, no registry entry, no fallback, not a runtime composite ----
const regSet = new Set(registry);
const compNames = new Set(Object.keys(composites));
const orphans = [...emitted].filter(n => !regSet.has(n) && !fallback[n] && !compNames.has(n)).sort();
// composite parts that do NOT resolve are real orphans too
const badParts = [...compParts].filter(p => !regSet.has(p)).sort();

// ---- dead: registered, not live; rescue via bare string-literal reference ----
let dead = registry.filter(k => !live.has(k));
if (dead.length) {
  const litHits = sh(`git grep -n -F ${dead.map(k => `-e "'${k}'"`).join(' ')} ${HEAD} -- src/js`);
  const rescued = new Set();
  for (const ln of litHits.split('\n')) {
    const m = ln.match(/^(?:HEAD|[0-9a-f]{40}):([^:]+):(\d+):(.*)$/);
    if (!m || m[1] === 'src/js/app.js') continue; // def site doesn't count
    for (const k of dead) if (m[3].includes(`'${k}'`)) rescued.add(k);
  }
  dead = dead.filter(k => !rescued.has(k));
}

// ---- report ----
const byHook = {};
for (const e of emitters) { (byHook[e.name] = byHook[e.name] || []).push(`${e.file}:${e.line}`); }
console.log(`audio wiring audit @ ${HEAD}`);
console.log(`fire-sites: ${emitters.length} literal (${new Set(emitters.map(e => e.name)).size} hooks), ` +
  `${encNames.length} encAudio, registry keys: ${registry.length}, ` +
  `monsters.json audio values: ${monVals.size}, contest composites: ${compNames.size}`);
if (orphans.length || badParts.length) {
  console.log('ORPHANED EMITTERS (fire -> silence):');
  for (const n of orphans) {
    const sites = byHook[n] || [];
    const extra = [];
    if (monVals.has(n)) extra.push('monsters.json');
    if (dramaVals.has(n)) extra.push('drama.audioFor');
    if (direct.has(n)) extra.push('direct Game.audio call');
    if (encNames.some(e => e.name === n)) extra.push('encAudio');
    console.log(`  ${n}: ${sites.length} literal site(s)${extra.length ? ' [' + extra.join(', ') + ']' : ''}`);
    sites.slice(0, 12).forEach(s => console.log(`    - ${s}`));
  }
  badParts.forEach(p => console.log(`  ${p}: contest composite part with no registry entry`));
}
const orphanFb = [...emitted].filter(n => !regSet.has(n) && fallback[n]);
if (orphanFb.length) console.log('ORPHAN WITH FALLBACK (never silent): ' + orphanFb.join(', '));
console.log('RUNTIME-REGISTERED contest composites (self-register via G._cxBeat, all parts resolve): ' +
  (compNames.size ? [...compNames].sort().join(', ') : 'none'));
console.log(dead.length ? `DEAD REGISTRY ENTRIES (${dead.length}): ${dead.join(', ')}` : 'DEAD REGISTRY ENTRIES: none');
process.exit(orphans.length || badParts.length ? 1 : 0);
