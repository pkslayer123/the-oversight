#!/usr/bin/env node
// KNOWLEDGE-LEAK RECHECK (Steve 2026-10-06): re-verifies the 7 leaks from the
// run-0018 audit against the CURRENT tree and validates the fix patch.
//
// Usage: node scripts/check-knowledge-leaks-20261006b.js
// (plain node, NOT jest — never run concurrent jest on the hot tree)
//
// What it does:
//   1. Runs scripts/test-knowledge-leak-fixes-20261006.js against the CURRENT
//      tree (BEFORE) and reports per-leak verdicts: FAIL on a "gated" check =
//      the leak is still LIVE; PASS = a sibling fixed it.
//   2. Copies src/js/game.js to a temp dir, applies the b-patch
//      (knowledge-leak-fixes-20261006b.patch) with `patch`, runs node --check,
//      then runs the proof test against the patched copy (AFTER) — every
//      gated check must be green there, proving the patch still applies
//      cleanly AND fixes every leak.
//   3. Prints a verdict table. Exit 0 = checker ran clean (verdicts are
//      findings, not failures); exit 1 = harness or patch failure.
//
// The b-patch is the same 10 hunks / 15 replacements as the original patch,
// regenerated against the current worktree so context is exact (zero fuzz,
// zero offset). It lives OUTSIDE the repo by design — NOT applied here,
// because src/js/game.js is dirty under siblings.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TEST = path.join(ROOT, 'scripts', 'test-knowledge-leak-fixes-20261006.js');
const PATCH = path.join(ROOT, '..', 'goals', 'the-scattering-roguelite-survival-game',
  'hidden_files', 'fleshout-20261006', 'knowledge-leak-fixes-20261006b.patch');

// test check name -> leak key. 7 leaks; paparazzo and understudy cover several checks.
const CHECK_TO_LEAK = {
  'rehearsing beat — no ungated coaching': 'understudy-phase-beats',
  'performing beat (exact count + OPENING STEAL) — no ungated coaching': 'understudy-phase-beats',
  'steal resolution — no ungated coaching': 'understudy-steal',
  'improv beat — no ungated coaching': 'understudy-improv',
  'improv hit (attack true name) — no ungated coaching': 'understudy-improv-hit',
  'picket say shows no wave-1 true name': 'union_rep-picket-true-name',
  'walkout beat (+8 / UNTARGETABLE) — no ungated coaching': 'union_rep-walkout',
  'still beat (double-climb mechanic) — no ungated coaching': 'paparazzo-still',
  'flash resolve (prediction parenthetical) — no ungated coaching': 'paparazzo-flash-hit',
  'flash miss (prediction parenthetical) — no ungated coaching': 'paparazzo-flash-miss',
  'exclusive beat (PREDICTION 4 / UNBLOCKABLE) — no ungated coaching': 'paparazzo-exclusive',
  'foreclosure beat (healing coaching) — no ungated coaching': 'landlord-foreclosure',
};
const LEAK_LABELS = {
  'understudy-phase-beats': 'understudy phase-beat coaching (rehearsing 50% / performing 80% + steal)',
  'understudy-steal': 'understudy steal resolution (OPENING STEAL: anticipated)',
  'understudy-improv': 'understudy improv beat (DESPERATE IMPROV: it chains)',
  'understudy-improv-hit': 'understudy improv hit line (raw DESPERATE IMPROV name)',
  'union_rep-picket-true-name': 'union_rep picket summon wave-1 true name',
  'union_rep-walkout': 'union_rep walkout (+8 damage / UNTARGETABLE coaching)',
  'paparazzo-still': 'paparazzo still beat (Prediction climbing double)',
  'paparazzo-flash-hit': 'paparazzo flash resolve (Prediction N/4 — learns your dodge)',
  'paparazzo-flash-miss': 'paparazzo flash miss (Prediction N/4 anyway)',
  'paparazzo-exclusive': 'paparazzo exclusive (PREDICTION 4: UNBLOCKABLE)',
  'landlord-foreclosure': 'landlord foreclosure (Its healing climbs too)',
};

function runTest(env) {
  const r = spawnSync('node', [TEST], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 300000 });
  if (r.error) return { crashed: String(r.error) };
  const out = (r.stdout || '') + '\n' + (r.stderr || '');
  const results = {}; // check name -> 'PASS' | 'FAIL'
  // FAIL lines append " — LEAK while unknowing: <quoted text>", which can
  // itself contain ' — ', so match keys by prefix instead of splitting.
  for (const line of out.split('\n')) {
    for (const key of Object.keys(CHECK_TO_LEAK)) {
      if (line.trimEnd() === '  PASS ' + key) results[key] = 'PASS';
      else if (line.startsWith('  FAIL ' + key)) results[key] = 'FAIL';
    }
  }
  const resLine = (out.match(/RESULT: (\d+) passed, (\d+) failed/) || []).slice(1, 3);
  return { results, pass: +(resLine[0] || 0), fail: +(resLine[1] || 0), crashed: null };
}

function verdicts(run) {
  const v = {}; // leak -> 'LIVE' | 'FIXED' | 'UNKNOWN'
  for (const [check, leak] of Object.entries(CHECK_TO_LEAK)) {
    const r = run.results[check];
    if (r === undefined) { v[leak] = 'UNKNOWN'; continue; }
    if (r === 'FAIL') v[leak] = 'LIVE';            // leak check failed => leak demonstrated
    else if (v[leak] === undefined) v[leak] = 'FIXED'; // leak check passed => already fixed
  }
  return v;
}

let failed = false;
console.log('=== KNOWLEDGE-LEAK RECHECK 20261006b ===');
console.log('repo:', ROOT);
console.log('test:', TEST);
console.log('patch:', PATCH, fs.existsSync(PATCH) ? '(exists)' : '(MISSING)');
if (!fs.existsSync(TEST) || !fs.existsSync(PATCH)) { console.error('HARNESS FAIL: test or patch missing'); process.exit(1); }

// ---------- BEFORE: current tree ----------
console.log('\n[BEFORE] current tree, patch NOT applied');
const before = runTest({});
if (before.crashed) { console.error('HARNESS FAIL (before):', before.crashed); process.exit(1); }
console.log(`suite: ${before.pass} passed, ${before.fail} failed`);
const beforeV = verdicts(before);

// ---------- apply patch to a /tmp copy ----------
console.log('\n[PATCH] apply b-patch to a /tmp copy of current game.js');
const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'kleak-'));
const tmpGame = path.join(tmpd, 'game.js');
fs.copyFileSync(path.join(ROOT, 'src', 'js', 'game.js'), tmpGame);
const pr = spawnSync('patch', ['-s', '-p1', '-i', PATCH, tmpGame], { encoding: 'utf8' });
console.log('patch exit:', pr.status, pr.status === 0 ? '(clean apply)' : pr.stderr || pr.stdout);
if (pr.status !== 0) { console.error('HARNESS FAIL: patch did not apply cleanly'); failed = true; }
const nc = spawnSync('node', ['--check', tmpGame], { encoding: 'utf8' });
console.log('node --check:', nc.status === 0 ? 'OK' : 'FAILED\n' + (nc.stderr || ''));
if (nc.status !== 0) { console.error('HARNESS FAIL: patched copy fails syntax check'); failed = true; }

// ---------- AFTER: patched copy ----------
let afterV = {}, after = { pass: 0, fail: 0 };
if (!failed) {
  console.log('\n[AFTER] patched copy, same suite');
  after = runTest({ GAMEJS: tmpGame });
  if (after.crashed) { console.error('HARNESS FAIL (after):', after.crashed); process.exit(1); }
  console.log(`suite: ${after.pass} passed, ${after.fail} failed`);
  afterV = verdicts(after);
}

// ---------- verdict table ----------
console.log('\n=== PER-LEAK VERDICTS ===');
let liveCount = 0, fixedByPatch = 0;
for (const leak of Object.keys(LEAK_LABELS)) {
  const b = beforeV[leak] || 'UNKNOWN';
  const a = afterV[leak] || 'UNKNOWN';
  if (b === 'LIVE') liveCount++;
  if (b === 'LIVE' && a === 'FIXED') fixedByPatch++;
  console.log(`${b === 'LIVE' ? 'LIVE ' : b === 'FIXED' ? 'FIXED' : '???  '} before | after-patch: ${a.padEnd(6)} | ${LEAK_LABELS[leak]}`);
}
console.log(`\nsummary: ${liveCount}/11 checks LIVE on current tree; patch fixes ${fixedByPatch}/${liveCount} of the live ones (AFTER suite ${after.pass}/${after.pass + after.fail} green)`);
if (failed || after.fail > 0) { console.error('RECHECK INCOMPLETE: patch/harness failure'); process.exit(1); }
console.log('RECHECK COMPLETE');
