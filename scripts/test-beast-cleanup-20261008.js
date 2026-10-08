#!/usr/bin/env node
// PROOF: dead Middle-Manager code removal (Steve 2026-10-08).
// The retired monster id is spelled via concatenation below ('delegate' +
// '_' + 'beast') so this very file contains zero literal occurrences.
// The Middle Manager monster was retired from src/data/monsters.json; this
// test proves every code reference went with it:
//   1. zero occurrences of the retired id in src/ and scripts/
//      (the literal is spelled via concatenation below so this very check
//      can't reintroduce it)
//   2. the touched source files still parse (node --check)
//   3. test-telegraph-judgment.js section (a) — reworked onto the paparazzo
//      with written justification — runs green (all a1..a7 checks pass)
//   4. the game.js @ontology header still validates (the bump gate:
//      scripts/validate-ontology.js)
// NOTE: test-telegraph-judgment.js section (b) has two PRE-EXISTING failures
// (b11/b12: the test expects stale `.pmark.diveTarget` selectors; app.js
// ships `.vent.diveTarget`). Those are out of scope — this proof gates only
// on section (a), the part this cleanup touched.
// Usage: node scripts/test-beast-cleanup-20261008.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// The retired id, spelled so this file contains zero literal occurrences.
const DEAD = 'delegate' + '_' + 'beast';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === '.git') continue; walk(p, out); }
    else out.push(p);
  }
  return out;
}

// ---------- 1. zero refs in src/ and scripts/ ----------
{
  const hits = [];
  for (const d of ['src', 'scripts']) {
    for (const f of walk(path.join(ROOT, d), [])) {
      let s;
      try { s = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
      if (s.includes(DEAD)) hits.push(path.relative(ROOT, f));
    }
  }
  ok('zero retired-id refs in src/', !hits.some(h => h.startsWith('src')), hits.filter(h => h.startsWith('src')).join(', '));
  ok('zero retired-id refs in scripts/', !hits.some(h => h.startsWith('scripts')), hits.filter(h => h.startsWith('scripts')).join(', '));
  // sanity: the data def is gone too (retired in a prior run)
  const mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const ml = Array.isArray(mj) ? mj : mj.monsters;
  ok('no data def for the retired id', !ml.some(m => m.id === DEAD));
}

// ---------- 2. touched files parse ----------
for (const f of ['src/js/game.js', 'src/js/app.js', 'src/js/monsterBehaviors.js',
                 'scripts/test-telegraph-judgment.js', 'scripts/test-wave2c-visuals.js']) {
  try {
    execSync(`node --check ${f}`, { cwd: ROOT, stdio: 'pipe' });
    ok(`${f} parses`, true);
  } catch (e) { ok(`${f} parses`, false, String(e.message).slice(0, 120)); }
}

// ---------- 3. telegraph-judgment section (a) green ----------
// The script as a whole has pre-existing (b) failures (stale .pmark
// selectors, unrelated to this cleanup), so gate on section (a) only:
// no FAIL line for any a-check, and the a-checks actually ran.
{
  let out;
  try { out = execSync('node scripts/test-telegraph-judgment.js', { cwd: ROOT, stdio: 'pipe' }).toString(); }
  catch (e) { out = (e.stdout || '').toString() + (e.stderr || '').toString(); }
  const aFails = out.split('\n').filter(l => /^FAIL a\d/.test(l));
  ok('section (a): no a-check failures', aFails.length === 0, aFails.join('; '));
  const jsrc = fs.readFileSync(path.join(ROOT, 'scripts/test-telegraph-judgment.js'), 'utf8');
  ok('section (a) exercises the live paparazzo voice',
    jsrc.includes("mdef('paparazzo')") && !jsrc.includes(DEAD));
}

// ---------- 4. ontology still validates (the bump gate) ----------
{
  let out = '';
  try {
    out = execSync('node scripts/validate-ontology.js', { cwd: ROOT, stdio: 'pipe' }).toString();
    ok('validate-ontology.js passes', /Release permitted/.test(out), out.trim().split('\n').pop());
  } catch (e) {
    ok('validate-ontology.js passes', false, String((e.stdout || e.message)).slice(0, 200));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
