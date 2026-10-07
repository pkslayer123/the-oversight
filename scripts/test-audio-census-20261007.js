#!/usr/bin/env node
// AUDIO CENSUS (Steve 2026-10-07):
// Static census over a git ref (default HEAD) — never the worktree, which is
// a hot shared tree with uncommitted sibling edits. Asserts every audio fire
// resolves to a registered Game.audio voice whose synth callees all exist.
//   1. static audioEvent('X') / audio('X') fires in src/js/*.js
//   2. config-driven names: DRAMA_AUDIO_MATES values (drama.js),
//      CX_BEAT_DEFS keys+values (contests.js), audio-ish config values in
//      src/js objects (aggroAudio/noticeAudio/declareAudio/...) and
//      src/data/*.json
//   3. every voice registered on the Game.audio object (app.js `return { ... }`)
// The brawler haymaker whiff fired audioEvent('miss') with no voice — silent.
// 'miss' MUST resolve after the fix. Remaining orphans are reported, not fixed.
//
// Usage: node scripts/test-audio-census-20261007.js [git-ref]

const { execSync } = require('child_process');

const REF = process.argv[2] || 'HEAD';
const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const show = (p) => execSync(`git show ${REF}:${p}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ls = (dir) => execSync(`git ls-tree -r ${REF} --name-only -- ${dir}`, { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log(`Audio census @ ${REF}:`);

// ---------- 1. collect fires ----------
const jsFiles = ls('src/js/').filter(f => f.endsWith('.js'));
const fires = new Map(); // name -> [{file, line}]
const dynamicSites = [];
for (const f of jsFiles) {
  const src = show(f);
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const tag = `${f}:${i + 1}`;
    let m;
    const re1 = /\baudioEvent\(\s*['"]([A-Za-z_$][\w$]*)['"]/g;
    while ((m = re1.exec(line))) {
      if (!fires.has(m[1])) fires.set(m[1], []);
      fires.get(m[1]).push(tag);
    }
    const re2 = /(?<![\w$.])audio\(\s*['"]([A-Za-z_$][\w$]*)['"]/g;
    while ((m = re2.exec(line))) {
      if (!fires.has(m[1])) fires.set(m[1], []);
      fires.get(m[1]).push(tag);
    }
    if (/audioEvent\(\s*[^'"\s)]/.test(line) && !/audioEvent\(\s*name\s*,\s*data\s*\)/.test(line)) dynamicSites.push(`${tag}: ${line.trim().slice(0, 90)}`);
  });
}

// ---------- 2a. DRAMA_AUDIO_MATES (drama.js) ----------
const drama = show('src/js/drama.js');
const matesBlock = drama.slice(drama.indexOf('const DRAMA_AUDIO_MATES = {'));
const mates = new Map();
{
  const body = matesBlock.slice(0, matesBlock.indexOf('};'));
  const re = /^    (\w+):\s*(?:'([A-Za-z_$][\w$]*)'|null)/gm;
  let m;
  while ((m = re.exec(body))) if (m[2]) mates.set(m[1], m[2]);
}

// ---------- 2b. CX_BEAT_DEFS (contests.js) ----------
const contests = show('src/js/contests.js');
const beatBlock = contests.slice(contests.indexOf('const CX_BEAT_DEFS = {'));
const beatShims = new Map(); // key -> [parts]
{
  const body = beatBlock.slice(0, beatBlock.indexOf('};'));
  const re = /^    (\w+):\s*\[([^\]]*)\]/gm;
  let m;
  while ((m = re.exec(body))) {
    const parts = [...m[2].matchAll(/'([A-Za-z_$][\w$]*)'/g)].map(x => x[1]);
    beatShims.set(m[1], parts);
  }
}

// ---------- 2c. config-driven audio keys in src/js + src/data/*.json ----------
const configFires = new Map();
const audioKeyRe = /\b([A-Za-z$][\w$]*[Aa]udio)\s*:\s*['"]([A-Za-z_$][\w$]*)['"]/g;
for (const f of jsFiles) {
  const src = show(f);
  let m;
  while ((m = audioKeyRe.exec(src))) {
    const key = `${m[1]}:${m[2]}`;
    if (!configFires.has(key)) configFires.set(key, []);
    configFires.get(key).push(`${f} (${m[1]})`);
  }
}
for (const f of ls('src/data/').filter(x => x.endsWith('.json'))) {
  const src = show(f);
  const re = /"([A-Za-z$][\w$]*[Aa]udio)"\s*:\s*"([A-Za-z_$][\w$]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const key = `${m[1]}:${m[2]}`;
    if (!configFires.has(key)) configFires.set(key, []);
    configFires.get(key).push(`${f} (${m[1]})`);
  }
}

// ---------- 3. registry + defined synths (app.js) ----------
const app = show('src/js/app.js');
const regStart = app.indexOf('    return {\n      ensureAudio() { return ensure(); },');
if (regStart < 0) { console.log('FAIL: audio registry anchor not found'); process.exit(1); }
const regEnd = app.indexOf('\n    };', regStart);
const regSrc = app.slice(regStart, regEnd);
// parse entries: key at 6-space indent, brace-balanced body
const entries = new Map();
{
  const lines = regSrc.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^      ([A-Za-z_$][\w$]*)\s*\(/);
    if (!km) continue;
    const name = km[1];
    let depth = 0, started = false, body = '', j = i;
    for (; j < lines.length; j++) {
      const ln = lines[j];
      for (const ch of ln) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
        if (started && !(depth === 0 && ch === '}' && body === '')) body += ch;
        if (started && depth === 0) break;
      }
      if (started && depth === 0) { body += '\n'; break; }
      body += '\n';
    }
    entries.set(name, body);
    i = j;
  }
}
// defined identifiers: function X( and const/let/var X =
const defined = new Set();
{
  let m;
  const re1 = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  while ((m = re1.exec(app))) defined.add(m[1]);
  const re2 = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  while ((m = re2.exec(app))) defined.add(m[1]);
}
// callees inside a body, minus known WebAudio/DOM/JS builtins
const STOOP = new Set(('setValueAtTime exponentialRampToValueAtTime linearRampToValueAtTime ' +
  'setTargetAtTime setValueCurveAtTime cancelScheduledValues cancelAndHoldAtTime ' +
  'connect disconnect start stop resume suspend close createOscillator createGain ' +
  'createBiquadFilter createBuffer createBufferSource createAnalyser createDynamicsCompressor ' +
  'createDelay createStereoPanner getChannelData getFloatTimeDomainData getByteFrequencyData ' +
  'forEach map filter reduce slice push pop shift unshift find findIndex includes indexOf join ' +
  'split replace match test exec search floor ceil round random min max abs pow sqrt sin cos tan ' +
  'atan2 log exp isFinite isNaN parseInt parseFloat String Number Boolean Array Object JSON Math ' +
  'Promise setTimeout setInterval clearTimeout clearInterval requestAnimationFrame ' +
  'addEventListener removeEventListener appendChild removeChild querySelector querySelectorAll ' +
  'getElementById setAttribute getAttribute hasAttribute add remove toggle contains getContext ' +
  'fillRect clearRect beginPath arc moveTo lineTo stroke fill drawImage save restore translate ' +
  'scale rotate now getTime toFixed toString valueOf charAt fromCharCode keys values entries ' +
  'assign freeze defineProperty hasOwnProperty concat sort reverse every some fill flat from ' +
  'isArray create then catch finally resolve reject log warn error debug info assert trace time ' +
  'timeEnd profile getBoundingClientRect scrollIntoView focus blur click preventDefault ' +
  'stopPropagation dispatchEvent postMessage require module exports ' +
  'if for while switch catch return typeof function new else do try with delete void in of ' +
  'instanceof case default').split(' '));
function danglingCallees(name) {
  const raw = entries.get(name);
  if (!raw) return ['<no registry entry>'];
  // strip comments: identifiers inside prose ("slow dread (80bpm)") are not calls
  const body = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set();
  let m;
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(body))) {
    const id = m[1];
    if (STOOP.has(id) || defined.has(id)) continue;
    // locally declared inside the body?
    if (new RegExp(`\\b(?:const|let|var|function)\\s+${id}\\b`).test(body)) continue;
    out.add(id);
  }
  return [...out];
}

// ---------- 4. resolve every fired name ----------
const allNames = new Set([...fires.keys()]);
for (const v of mates.values()) allNames.add(v);
for (const parts of beatShims.values()) for (const p of parts) allNames.add(p);
for (const k of configFires.keys()) allNames.add(k.split(':')[1]);
const orphans = [];
for (const name of [...allNames].sort()) {
  if (!entries.has(name)) { orphans.push(name); continue; }
  const d = danglingCallees(name);
  if (d.length) orphans.push(`${name} (dangling: ${d.join(',')})`);
}
const sites = (n) => (fires.get(n) || []).join(' ');
console.log(`\n${allNames.size} distinct fired names, ${entries.size} registry voices, ${fires.size} static audioEvent/audio sites.`);
check("'miss' is fired (haymaker whiff, game.js)", (fires.get('miss') || []).length >= 1, 'no fire site');
check("'miss' resolves to a registered voice", entries.has('miss') && danglingCallees('miss').length === 0,
  entries.has('miss') ? `dangling: ${danglingCallees('miss').join(',')}` : 'no registry entry');
check('DRAMA_AUDIO_MATES values resolve', [...mates.values()].every(v => entries.has(v)),
  [...mates.values()].filter(v => !entries.has(v)).join(', ') || undefined);
check('CX_BEAT_DEFS parts resolve', [...beatShims.values()].flat().every(p => entries.has(p)),
  [...beatShims.values()].flat().filter(p => !entries.has(p)).join(', ') || undefined);
check('config-driven audio names resolve',
  [...configFires.keys()].every(k => entries.has(k.split(':')[1])),
  [...configFires.keys()].filter(k => !entries.has(k.split(':')[1])).map(k => `${k} <- ${configFires.get(k).join(',')}`).join('; ') || undefined);
check('no orphaned fired names', orphans.length === 0, orphans.join(', '));

// CX beat shim keys are registered at runtime by _cxBeat; verify they only compose resolved parts
const badShims = [...beatShims.entries()].filter(([k, parts]) => parts.some(p => !entries.has(p)));
check('CX beat shims compose only resolved voices', badShims.length === 0, badShims.map(([k]) => k).join(', '));

console.log(`\nDynamic dispatch sites (manual review, not asserted): ${dynamicSites.length}`);
dynamicSites.slice(0, 12).forEach(s => console.log(`  - ${s}`));
if (orphans.length) {
  console.log('\nREMAINING ORPHANS (reported, out of scope to fix):');
  for (const o of orphans) {
    const name = o.split(' ')[0];
    console.log(`  - ${o}${sites(name) ? '  fired at ' + sites(name) : ''}`);
  }
}
console.log(`\n${pass} pass, ${fail} fail.`);
process.exit(fail ? 1 : 0);
