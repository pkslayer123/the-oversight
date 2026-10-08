#!/usr/bin/env node
// RETIRED WAVE-2 ID CLEANUP PROOF (Steve 2026-10-08).
// Removes vestigial references to retired wave-2 monsters (delegate_beast,
// camera_swarm, hype_horn) — vestigial audio registry entries, dead game.js
// helpers, stale comments — and proves the removal is safe.
//
// Proves: (a) no retired ids remain in app.js/game.js registry/call-site/
// declare regions; (b) the audio registry has no registered-but-unreachable
// entries owned by this cleanup (via the refreshed audio census); (c) the
// telegraph-judgment test runs clean (it crashed on mdef('delegate_beast')
// before the repair).
// Before/after: the "before" state is read from git HEAD (worktree files were
// read-only at HEAD when this run started); the "after" state is the
// worktree files. Asserting both pins the delta.
//
// Run: node scripts/test-retired-id-cleanup-20261008.js [SEED]
//   (SEED is forwarded to the child suites; this script's own checks are static.)
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}
// Pre-cleanup base, pinned: 1f9a21d is the parent of the cleanup commit.
// The "before" half of this proof reads the frozen pre-cleanup tree so the
// test stays green after landing (HEAD moved on). The "after" half reads
// the live worktree — the real regression guard.
const BEFORE_REF = '1f9a21d';
function headFile(rel) {
  return execSync('git show ' + BEFORE_REF + ':' + rel, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString();
}
const appAfter = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
const gameAfter = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
const appBefore = headFile('src/js/app.js');
const gameBefore = headFile('src/js/game.js');

const RETIRED_HOOKS = ['delegateDebrief', 'managerCircle', 'managerCharge', 'managerDebrief', 'managerFear', 'delegateCircle'];
const RETIRED_IDS = ['delegate_beast', 'camera_swarm', 'hype_horn'];

// ---------- (a1) BEFORE: the vestigial entries really were there ----------
{
  const caIdx = appBefore.indexOf('const CombatAudio');
  const retStart = appBefore.indexOf('return {\n', caIdx);
  const retBlockBefore = appBefore.slice(retStart, appBefore.indexOf('};', retStart) + 2);
  ok('before: 5 vestigial synths + delegateCircle alias registered in pre-cleanup app.js',
    RETIRED_HOOKS.every(n => retBlockBefore.includes(n + '() {') || appBefore.includes('function ' + n + '()')));
}
for (const n of ['managerCircle', 'managerCharge', 'managerDebrief', 'delegateDebrief', 'managerFear']) {
  ok('before: synth function ' + n + '() existed at pre-cleanup base', appBefore.includes('function ' + n + '()'));
}
ok('before: game.js beastCircle existed at pre-cleanup base', gameBefore.includes('beastCircle(m, tgt) {'));
ok('before: game.js beastCircle fired delegateCircle at HEAD', gameBefore.includes("this.audioEvent('delegateCircle')"));

// ---------- (a2) AFTER: registry is clean ----------
{
  const caIdx = appAfter.indexOf('const CombatAudio');
  const retStart = appAfter.indexOf('return {\n', caIdx);
  const retBlock = appAfter.slice(retStart, appAfter.indexOf('};', retStart) + 2);
  const registry = new Set();
  const re = /^\s{4,10}([A-Za-z0-9_]+)\(/gm;
  let m; while ((m = re.exec(retBlock))) registry.add(m[1]);
  for (const n of RETIRED_HOOKS) ok('after: registry has no ' + n, !registry.has(n));
  ok('after: registry still healthy (' + registry.size + ' synths)', registry.size > 200);
}

// ---------- (a3) AFTER: synth functions gone ----------
for (const n of ['managerCircle', 'managerCharge', 'managerDebrief', 'delegateDebrief', 'managerFear']) {
  ok('after: no synth function ' + n + '() in app.js', !appAfter.includes('function ' + n + '()'));
}
ok('after: no delegateCircle alias in app.js', !/delegateCircle\(\)\s*\{/.test(appAfter));

// ---------- (a4) AFTER: zero call sites for the retired hooks ----------
{
  let allSrc = '';
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'js'))) {
    if (f.endsWith('.js')) allSrc += fs.readFileSync(path.join(ROOT, 'src', 'js', f), 'utf8') + '\n';
  }
  for (const n of RETIRED_HOOKS) {
    const hits = (allSrc.match(new RegExp("audioEvent\\('" + n + "'\\)", 'g')) || []).length;
    ok('after: zero audioEvent call sites for ' + n, hits === 0, hits + ' hits');
  }
}

// ---------- (a5) AFTER: game.js dead helpers/predicates gone ----------
for (const t of ['beastCircle(m, tgt)', 'beastCircleKeys', 'beastIs(']) {
  ok('after: no ' + t + ' in game.js', !gameAfter.includes(t));
}
ok('after: no managerFear anywhere in game.js', !gameAfter.includes('managerFear'));
ok('after: no delegate_beast in game.js code (only REMOVED-notes in comments)',
  !gameAfter.split('\n').some(l => l.includes('delegate_beast') &&
    !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')));

// ---------- (a6) tbTelegraphCue region has no delegate_beast ----------
{
  const fnStart = gameAfter.indexOf('tbTelegraphCue(m) {');
  const fnEnd = gameAfter.indexOf('    },', fnStart);
  const region = gameAfter.slice(fnStart, fnEnd);
  ok('after: tbTelegraphCue has no delegate_beast', !region.includes('delegate_beast'));
}

// ---------- (a7) retired ids not declared in monsters.json ----------
{
  const mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
  const ids = new Set((mj.monsters || mj).map(m => m.id));
  for (const id of RETIRED_IDS) ok('after: ' + id + ' not in monsters.json', !ids.has(id));
}

// ---------- (a8) removed names still parse-safe: app.js has no dangling references ----------
ok('after: app.js has no stale comment claiming delegateDebrief is wired',
  !/delegateDebrief\(\) \(wired:/.test(appAfter));
ok('after: app.js documents the removal', /delegateDebrief\(\) REMOVED 2026-10-08/.test(appAfter));

// ---------- (b) audio census green (registry consistent, refreshed allow-list) ----------
{
  const seed = process.argv[2] || process.env.SEED || '20261008';
  let out;
  try {
    out = execFileSync('node', ['scripts/test-audio-census-20261008.js'], {
      cwd: ROOT, env: { ...process.env, SEED: String(seed) }, timeout: 300000,
    }).toString();
    const m = out.match(/AUDIO CENSUS: (\d+) pass, (\d+) fail/);
    ok('b: audio census green (seed ' + seed + ')', !!m && m[2] === '0', out.trim().split('\n').pop());
  } catch (e) {
    ok('b: audio census green (seed ' + seed + ')', false, (e.stdout || '').toString().split('\n').filter(l => l.startsWith('FAIL')).join(' / ').slice(0, 300));
  }
}

// ---------- (c) telegraph judgment test runs clean ----------
{
  try {
    const out = execFileSync('node', ['scripts/test-telegraph-judgment.js'], {
      cwd: ROOT, timeout: 300000,
    }).toString();
    const m = out.match(/(\d+) passed, (\d+) failed/);
    ok('c: telegraph-judgment green', !!m && m[2] === '0', out.trim().split('\n').pop());
  } catch (e) {
    ok('c: telegraph-judgment green', false, (e.stdout || '').toString().split('\n').filter(l => l.startsWith('FAIL')).join(' / ').slice(0, 300));
  }
}

console.log('\nRETIRED-ID CLEANUP PROOF: ' + pass + ' pass, ' + fail + ' fail (seed ' + (process.argv[2] || process.env.SEED || '20261008') + ')');
process.exit(fail ? 1 : 0);
