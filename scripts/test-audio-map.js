// Audio map test (Steve 2026-10-06): every Game.audioEvent('name') fired
// anywhere in src/js must resolve to a REAL synth in the app.js CombatAudio
// dispatch — no silent no-ops. Also sanity-checks synth parameters
// (no exponentialRampToValueAtTime(0), no zero/negative frequencies,
// no wild gains), because node can't play audio — parse, don't execute.
// Usage: node scripts/test-audio-map.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'src', 'js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- 1. call sites ----------
const called = new Map(); // name -> [file:line]
for (const f of fs.readdirSync(JS).filter(f => f.endsWith('.js'))) {
  const lines = fs.readFileSync(path.join(JS, f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const re = /audioEvent\(\s*["']([A-Za-z0-9_:-]+)["']/g;
    let m;
    while ((m = re.exec(ln))) {
      if (!called.has(m[1])) called.set(m[1], []);
      called.get(m[1]).push(`${f}:${i + 1}`);
    }
  });
}
ok('found audioEvent call sites', called.size > 0, `n=${called.size}`);
console.log(`  ${called.size} unique event names fired across src/js`);

// ---------- 2. dispatch keys ----------
const app = fs.readFileSync(path.join(JS, 'app.js'), 'utf8');
const hdr = app.indexOf('=========== AUDIO COMPLETION (Steve 2026-10-05): every audioEvent must');
ok('audio region header present', hdr >= 0);
const ret = app.indexOf('    return {', hdr);
const end = app.indexOf('})();', ret);
const table = app.slice(ret, end);
const keys = new Map(); // name -> body source
const kre = /^      ([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/gm;
let m2;
while ((m2 = kre.exec(table))) {
  const name = m2[1];
  // find matching closing brace (no nesting deeper than one level of {})
  let depth = 0, i = m2.index + m2[0].length;
  for (; i < table.length; i++) {
    if (table[i] === '{') depth++;
    else if (table[i] === '}') { if (depth === 0) break; depth--; }
  }
  keys.set(name, table.slice(m2.index, i + 1));
}
ok('dispatch table parsed', keys.size > 0, `n=${keys.size}`);
console.log(`  ${keys.size} dispatch keys in CombatAudio`);

// ---------- 3. coverage ----------
const missing = [...called.keys()].filter(c => !keys.has(c));
ok('every fired event resolves to a dispatch key', missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')}` : '');
if (missing.length) missing.forEach(n => console.log(`  unmapped: ${n} (fired at ${called.get(n).join(' ')})`));

// ---------- 4. no empty/comment-only bodies (the round() trap) ----------
const noops = [];
for (const [name, body] of keys) {
  const noComments = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const inner = noComments.slice(noComments.indexOf('{'));
  const stripped = inner
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/[{};\s]/g, '');
  if (stripped.length === 0) noops.push(name);
}
ok('no silent no-op dispatch bodies', noops.length === 0,
  noops.length ? `no-ops: ${noops.join(', ')}` : '');

// ---------- 5. each body references a real inner function ----------
// Known inner helpers (not all in the audio region but defined): collect all
// `function NAME(` declarations in the whole app.js first.
const declared = new Set();
const fre = /function\s+([A-Za-z0-9_]+)\s*\(/g;
let m3;
while ((m3 = fre.exec(app))) declared.add(m3[1]);
const badRefs = [];
for (const [name, body] of keys) {
  const bodyNC = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const inner2 = bodyNC.slice(bodyNC.indexOf('{'));
  // call targets: fn( — take the first call inside the body
  const calls = [...inner2.matchAll(/(?<![\w$.])([A-Za-z0-9_]+)\s*\(/g)].map(x => x[1]);
  const targets = calls.filter(c => c !== name && !['if', 'return', 'try', 'catch', 'Math'].includes(c));
  for (const t of targets) {
    if (!declared.has(t)) badRefs.push(`${name} -> ${t}`);
  }
}
ok('every dispatch body calls a declared synth function', badRefs.length === 0,
  badRefs.length ? badRefs.join(', ') : '');

// ---------- 6. Web Audio parameter sanity over the audio region ----------
const audioRegion = app.slice(app.indexOf('// Web Audio, all synthesized'), end);
function count(pat, src) { const r = new RegExp(pat, 'g'); return [...src.matchAll(r)].length; }

// exponentialRampToValueAtTime(0...) — literal zero target throws DOMException
const zeroRamps = audioRegion.match(/exponentialRampToValueAtTime\(\s*0(?![\d.])/g) || [];
ok('no exponentialRampToValueAtTime with literal 0', zeroRamps.length === 0, `n=${zeroRamps.length}`);

// frequency literals: zero or negative, or above human hearing
const freqZero = audioRegion.match(/\.frequency\.(?:value|setValueAtTime)\(\s*-?\d*\.?\d+/g) || [];
const badFreq = freqZero.filter(s => { const v = parseFloat(s.replace(/.*\(\s*/, '')); return v <= 0 || v > 22000; });
ok('no zero/negative/ultrasonic frequency literals', badFreq.length === 0, badFreq.join(' '));

// gain literals above 2.0 (per-voice; master compressor is the seatbelt)
const gains = audioRegion.match(/\.gain\.(?:value|setValueAtTime)\(\s*\d*\.?\d+/g) || [];
const hotGain = gains.filter(s => parseFloat(s.replace(/.*\(\s*/, '')) > 2.0);
ok('no per-voice gain literals above 2.0', hotGain.length === 0, hotGain.join(' '));

// every synth function must guard on ensure() before touching ctx
const synthFns = ['crash', 'levelup', 'passiveUnlock', 'roundTick', 'sting', 'talkAttention',
  'droneCount', 'swarmFilm', 'beamFire', 'beamCharge', 'deerCall', 'humBuild'];
const unguarded = synthFns.filter(fn => {
  const fstart = audioRegion.indexOf(`function ${fn}(`);
  if (fstart < 0) return true;
  const seg = audioRegion.slice(fstart, fstart + 400);
  return !seg.includes('ensure()');
});
ok('synth functions guard on ensure()', unguarded.length === 0, unguarded.join(', '));

// ---------- 7. audioEvent dispatcher still swallows gracefully ----------
ok('game.js audioEvent swallows missing keys safely',
  /typeof this\.audio\[name\] === 'function'/.test(fs.readFileSync(path.join(JS, 'game.js'), 'utf8')));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
