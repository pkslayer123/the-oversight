// Break-it audio r11 — static honesty/dead-code audit.
// Extracts: registered voices (CombatAudio IIFE return block), CX_BEAT_DEFS
// keys, contest ids, drama mates, monsters.json audio fields, and diffs them.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

// Extract a balanced {...} starting at the first '{' at or after `startIdx`.
function extractBrace(src, startIdx) {
  let i = src.indexOf('{', startIdx);
  let depth = 0, inStr = null, esc = false, tpl = 0;
  const out0 = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '`') { inStr = c; continue; }
    if (c === '/' && src[i + 1] === '/' ) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(out0, i + 1); }
  }
  throw new Error('unbalanced');
}

function cxB(contestId, kind) {
  const camel = String(contestId || '').replace(/_([a-z])/g, (m, c) => c.toUpperCase());
  const cap = camel.charAt(0).toUpperCase() + camel.slice(1);
  return 'contest' + cap + kind;
}

const report = { fails: [], infos: [] };
function fail(msg) { report.fails.push(msg); console.log('FAIL ' + msg); }
function info(msg) { report.infos.push(msg); console.log('info ' + msg); }
function pass(msg) { console.log('pass ' + msg); }

// ---- 1. Registered voices from the CombatAudio return block ----
const app = read('src/js/app.js');
const retIdx = app.indexOf('return {\n      ensureAudio()');
const retBlock = extractBrace(app, retIdx);
const registered = new Set();
for (const m of retBlock.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\(/gm)) registered.add(m[1]);
console.log(`registered voices: ${registered.size}`);

// ---- 2. Literal fired names across src/js ----
const jsFiles = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js'));
const litRe = /audioEvent\(\s*'([^']+)'/g;
const firedLit = new Set();
for (const f of jsFiles) {
  const src = read('src/js/' + f);
  // strip comments so doc examples like Game.audioEvent('<name>') don't count
  const noComments = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  let m; const re = new RegExp(litRe.source, 'g'); while ((m = re.exec(noComments))) firedLit.add(m[1]);
}
console.log(`literal fired names: ${firedLit.size}`);
const litMissing = [...firedLit].filter(n => !registered.has(n));
if (litMissing.length) fail(`literal names not registered: ${litMissing.join(', ')}`);
else pass('all literal fire names resolve to registered voices');

// ---- 3. CX_BEAT_DEFS keys ----
const contests = read('src/js/contests.js');
const defsBlock = extractBrace(contests, contests.indexOf('const CX_BEAT_DEFS'));
let BEAT_DEFS;
eval('BEAT_DEFS = ' + defsBlock);
const beatKeys = new Set(Object.keys(BEAT_DEFS));
console.log(`CX_BEAT_DEFS keys: ${beatKeys.size}`);
// every beat part must resolve to a registered voice (parts are fired via A[p]())
const badParts = [];
for (const [k, parts] of Object.entries(BEAT_DEFS)) {
  for (const p of parts) if (!registered.has(p)) badParts.push(`${k} -> ${p}`);
}
if (badParts.length) fail(`beat parts unregistered: ${badParts.join('; ')}`);
else pass('all CX_BEAT_DEFS parts resolve to registered voices');

// ---- 4. _cxB coverage: every contest id x Declare/Escalate/Climax/Resolve ----
const contestDefs = JSON.parse(read('src/data/contests.json'));
const missingBeats = [];
for (const c of contestDefs) {
  for (const kind of ['Declare', 'Escalate', 'Climax', 'Resolve']) {
    const n = cxB(c.id, kind);
    if (!beatKeys.has(n)) missingBeats.push(n);
  }
}
if (missingBeats.length) fail(`_cxB names missing from CX_BEAT_DEFS (${missingBeats.length}): ${missingBeats.slice(0, 20).join(', ')}${missingBeats.length > 20 ? '...' : ''}`);
else pass('every contest id has Declare/Escalate/Climax/Resolve beats');

// ---- 5. literal beat: 'x' strings in contests.js must exist ----
const beatLitRe = /beat:\s*'([^']+)'/g;
const badBeats = [];
{ const nc = contests.replace(/\/\/[^\n]*/g, '');
  let m; while ((m = beatLitRe.exec(nc))) {
  if (!beatKeys.has(m[1]) && !registered.has(m[1])) badBeats.push(m[1]);
} }
if (badBeats.length) fail(`beat literals unresolved: ${[...new Set(badBeats)].join(', ')}`);
else pass('all literal beat: strings resolve (beat def or voice)');

// ---- 6. DRAMA_AUDIO_MATES in drama.js ----
let dramaMates = {};
try {
  const drama = read('src/js/drama.js');
  const mi = drama.indexOf('DRAMA_AUDIO_MATES');
  if (mi >= 0) {
    const blk = extractBrace(drama, mi);
    eval('dramaMates = ' + blk);
    const badMates = [];
    for (const [k, v] of Object.entries(dramaMates)) {
      if (v && !registered.has(v)) badMates.push(`${k} -> ${v}`);
    }
    if (badMates.length) fail(`DRAMA_AUDIO_MATES unregistered: ${badMates.join('; ')}`);
    else pass(`DRAMA_AUDIO_MATES all resolve (${Object.keys(dramaMates).length} mappings)`);
  } else info('DRAMA_AUDIO_MATES not found in drama.js');
} catch (e) { fail('could not parse DRAMA_AUDIO_MATES: ' + e.message); }

// ---- 7. drama.js audioFor: the actual mapping the game calls (D.audioFor) ----
try {
  const drama = read('src/js/drama.js');
  // audioFor returns voice names in a switch/object — extract string literals
  // returned near 'audioFor' region
  const ai = drama.indexOf('audioFor');
  if (ai >= 0) {
    const region = drama.slice(ai, ai + 8000);
    // find `return 'name'` / `: 'name'` patterns that look like voice names
    const cands = new Set();
    for (const m of region.matchAll(/return\s+'([a-zA-Z][\w]*)'/g)) cands.add(m[1]);
    const bad = [...cands].filter(n => !registered.has(n));
    if (bad.length) fail(`audioFor candidates unregistered: ${bad.join(', ')}`);
    else pass(`audioFor return-name candidates all resolve (${cands.size} sampled)`);
  }
} catch (e) { fail('audioFor audit: ' + e.message); }

// ---- 8. monsters.json audio fields ----
const monsters = JSON.parse(read('src/data/monsters.json'));
const mBad = [];
for (const m of monsters) {
  for (const f of ['aggroAudio', 'resolveAudio', 'declareAudio', 'noticeAudio', 'deathAudio']) {
    const v = m[f];
    if (v && !registered.has(v)) mBad.push(`${m.id || m.name} ${f}=${v}`);
  }
}
if (mBad.length) fail(`monsters.json audio fields unregistered: ${mBad.join('; ')}`);
else pass(`monsters.json audio fields all resolve (${monsters.length} monsters)`);

// ---- 9. encounters.js b.audio / ENC_AUDIO_FALLBACK ----
const enc = read('src/js/encounters.js');
const fbRe = /ENC_AUDIO_FALLBACK\s*=\s*\{([\s\S]*?)\};/;
const fbm = enc.match(fbRe);
if (fbm) {
  const bad = [];
  for (const mm of fbm[1].matchAll(/['"]([a-zA-Z][\w]*)['"]/g)) {
    if (!registered.has(mm[1])) bad.push(mm[1]);
  }
  if (bad.length) fail(`ENC_AUDIO_FALLBACK unregistered: ${[...new Set(bad)].join(', ')}`);
  else pass('ENC_AUDIO_FALLBACK entries resolve');
}

// ---- 10. dynamic wound+temperament dispatch: 'wound' + X sites ----
const game = read('src/js/game.js');
const dynRe = /audioEvent\(\s*'wound'\s*\+\s*([a-zA-Z_$][\w$.]*)/g;
let dm; const dynNames = new Set();
while ((dm = dynRe.exec(game))) dynNames.add('wound' + dm[1]);
// temperaments come from data — check the three documented ones
for (const t of ['Enraged', 'Cunning', 'Desperate']) {
  if (!registered.has('wound' + t)) fail(`missing wound${t}`);
}
pass('wound+temperament dynamic names resolve (Enraged/Cunning/Desperate)');

// ---- 11. dynamic audioEvent(name) / audioEvent(aa) sites: confirm they pass data names, not built strings ----
const dynCallRe = /audioEvent\(\s*([a-zA-Z_$][\w$.]*)\s*[,)]/g;
const dynCalls = new Set();
for (const f of jsFiles) {
  const src = read('src/js/' + f);
  let m; while ((m = dynCallRe.exec(src))) {
    const v = m[1];
    if (!['name', 'data'].includes(v)) dynCalls.add(`${f}:${v}`);
  }
}
info(`dynamic (variable-name) fire sites: ${[...dynCalls].join(', ')}`);

console.log(`\n==== ${report.fails.length} FAILS, ${report.infos.length} infos ====`);
process.exit(report.fails.length ? 1 : 0);
