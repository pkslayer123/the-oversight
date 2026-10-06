// Prey-beat audio test (Steve 2026-10-06): the five animal synths added to
// the CombatAudio dispatch — animalKill, animalHiss, animalSnort,
// animalRustle, animalPant — each exist, each are wired in the dispatch
// table, each are fired from encounters.js at the right beats, and each is
// a real (guarded, sane-parameter) synth. Parse-level: node can't play
// audio. Usage: node scripts/test-audio-animals.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'src', 'js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const NEW = ['animalKill', 'animalHiss', 'animalSnort', 'animalRustle', 'animalPant'];
const app = fs.readFileSync(path.join(JS, 'app.js'), 'utf8');
const enc = fs.readFileSync(path.join(JS, 'encounters.js'), 'utf8');

// ---------- 1-5. synth functions exist in app.js ----------
for (const n of NEW) {
  ok(`synth function ${n}() exists in app.js`,
    new RegExp(`function ${n}\\(\\)`).test(app));
}

// ---------- 6. all five are in the CombatAudio dispatch table ----------
const hdr = app.indexOf('=========== AUDIO COMPLETION (Steve 2026-10-05): every audioEvent must');
const ret = app.indexOf('    return {', hdr);
const end = app.indexOf('})();', ret);
const table = app.slice(ret, end);
const tableKeys = [...table.matchAll(/^      ([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/gm)].map(m => m[1]);
const missingTable = NEW.filter(n => tableKeys.indexOf(n) < 0);
ok('all five prey beats in CombatAudio dispatch table', missingTable.length === 0,
  missingTable.length ? `missing: ${missingTable.join(', ')}` : '');

// ---------- 7. every name fired from encounters.js resolves to a real synth ----------
const fired = new Set();
const re = /audioEvent\(\s*["']([A-Za-z0-9_:-]+)["']/g;
let m;
while ((m = re.exec(enc))) { if (NEW.indexOf(m[1]) >= 0) fired.add(m[1]); }
const unfired = NEW.filter(n => !fired.has(n));
ok('all five names are fired from encounters.js', unfired.length === 0,
  unfired.length ? `never fired: ${unfired.join(', ')}` : '');

// ---------- 8. right beats: each firing sits next to its expected cue text ----------
const beats = [
  ['animalKill', 'It never moved. One clean strike'],
  ['animalKill', 'Got it — '],
  ['animalHiss', 'hisses and lunges'],
  ['animalSnort', 'white tail up — explodes into motion'],
  ['animalRustle', 'Movement — '],
  ['animalPant', 'sides heaving'],
];
const misplaced = [];
for (const [name, cue] of beats) {
  const ci = enc.indexOf(cue);
  if (ci < 0) { misplaced.push(`${name}: cue text missing`); continue; }
  // the audioEvent(name) call must be within 300 chars after the cue
  const seg = enc.slice(ci, ci + 400);
  if (seg.indexOf(`audioEvent('${name}')`) < 0 && seg.indexOf(`audioEvent("${name}")`) < 0) {
    misplaced.push(`${name} not fired near cue "${cue.slice(0, 30)}"`);
  }
}
ok('each synth fires at its narrative beat', misplaced.length === 0, misplaced.join('; '));

// ---------- 9. dispatch bodies are real calls, not no-ops ----------
const noop = NEW.filter(n => !new RegExp(`^      ${n}\\(\\)[^}]*\\{[^}]*${n}\\(\\)`, 'm').test(table));
ok('no silent no-op dispatch bodies for the five', noop.length === 0,
  noop.length ? `no-ops: ${noop.join(', ')}` : '');

// ---------- 10. each synth guards on ensure() before touching ctx ----------
const audioRegion = app.slice(app.indexOf('// Web Audio, all synthesized'), end);
const unguarded = NEW.filter(fn => {
  const fstart = audioRegion.indexOf(`function ${fn}(`);
  if (fstart < 0) return true;
  return audioRegion.slice(fstart, fstart + 400).indexOf('ensure()') < 0;
});
ok('all five synths guard on ensure()', unguarded.length === 0, unguarded.join(', '));

// ---------- 11. parameter sanity over the new synth bodies ----------
function bodyOf(fn) {
  const s = audioRegion.indexOf(`function ${fn}(`);
  if (s < 0) return '';
  let depth = 0, i = audioRegion.indexOf('{', s);
  for (; i < audioRegion.length; i++) {
    if (audioRegion[i] === '{') depth++;
    else if (audioRegion[i] === '}') { depth--; if (depth === 0) break; }
  }
  return audioRegion.slice(s, i + 1);
}
const bodies = NEW.map(bodyOf).join('\n');
const zeroRamps = bodies.match(/exponentialRampToValueAtTime\(\s*0(?![\d.])/g) || [];
const freqLits = bodies.match(/\.frequency\.(?:value|setValueAtTime)\(\s*-?\d*\.?\d+/g) || [];
const badFreq = freqLits.filter(s => { const v = parseFloat(s.replace(/.*\(\s*/, '')); return v <= 0 || v > 22000; });
const gainLits = bodies.match(/\.gain\.(?:value|setValueAtTime)\(\s*\d*\.?\d+/g) || [];
const hotGain = gainLits.filter(s => parseFloat(s.replace(/.*\(\s*/, '')) > 2.0);
ok('new synths have sane Web Audio parameters',
  zeroRamps.length === 0 && badFreq.length === 0 && hotGain.length === 0,
  `zeroRamps=${zeroRamps.length} badFreq=${badFreq.join(' ')} hotGain=${hotGain.join(' ')}`);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
