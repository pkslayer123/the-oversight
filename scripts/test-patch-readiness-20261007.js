#!/usr/bin/env node
/* Patch-set readiness gate (Steve 2026-10-07).
 *
 * Reusable go/no-go verification for the three staged patch sets against a
 * PRISTINE HEAD extract (never the live worktree, which runs hot). Usage:
 *
 *   node scripts/test-patch-readiness-20261007.js <head-extract-dir>
 *
 * Patch-set roots default to the goal workspace; override with PATCH_SETS_ROOT:
 *   PATCH_SETS_ROOT=<dir> node scripts/test-patch-readiness-20261007.js <dir>
 *
 * Set A — wave2-escalation-patches-20261007/ (10 .diff against
 *           src/data/monsters.json): apply to a scratch copy, assert valid
 *           JSON + all 13 wave-2 monsters present, re-run the escalation
 *           audit (seeded) — every wave-2 monster must PASS.
 * Set B — dialogue-rethink-20261007/ (6 .diff against src/js): git apply
 *           --check -p1 against the fresh extract, apply in numeric order
 *           (02 and 06 both touch convo-wants.js), run the dialogue
 *           coherence proof — expects 17/17 PASS on patched.
 * Set C — events-expansion-20261007.json (6 new event defs): scratch-merge
 *           onto the extract's src/data/events.json, run the expansion
 *           proof — expects ALL GREEN.
 *
 * Exit code: 0 when every set is GO, 1 otherwise. The extract dir itself is
 * never modified — all patching happens under os.tmpdir().
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = process.env.HOME || '/home/hatch';
const PATCH_ROOT = process.env.PATCH_SETS_ROOT ||
  path.join(HOME, 'workspace', 'goals', 'the-scattering-roguelite-survival-game', 'hidden_files');
const SET_A_DIR = path.join(PATCH_ROOT, 'wave2-escalation-patches-20261007');
const SET_B_DIR = path.join(PATCH_ROOT, 'dialogue-rethink-20261007');
const SET_C_FILE = path.join(PATCH_ROOT, 'events-expansion-20261007.json');

const failures = [];
const ok = (cond, label) => {
  console.log((cond ? '  PASS ' : '  FAIL ') + label);
  if (!cond) failures.push(label);
};

const extractDir = process.argv[2];
if (!extractDir || !fs.existsSync(extractDir) || !fs.existsSync(path.join(extractDir, 'src', 'data', 'monsters.json'))) {
  console.error('usage: node scripts/test-patch-readiness-20261007.js <head-extract-dir>');
  process.exit(2);
}

// Scratch copy of the extract — recursive copy via shell (node-only copying
// of 28-monster repo trees is slower and error-prone).
function scratchCopy(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchready-'));
  execFileSync('cp', ['-r', src + '/.', dir + '/']);
  return dir;
}
function sh(cmd, args, opts = {}) {
  // stdin must be a pipe for opts.input to be delivered; 'ignore' swallows it.
  const stdio = opts.input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'];
  const { input, ...rest } = opts;
  return execFileSync(cmd, args, { encoding: 'utf8', ...rest, stdio, ...(input !== undefined ? { input } : {}) });
}
function gitApplyCheck(dir, file) {
  try { sh('git', ['apply', '--check', '-p1'], { input: fs.readFileSync(file), cwd: dir }); return true; }
  catch (e) { console.log('    apply --check failed: ' + String(e.message).split('\n')[0]); return false; }
}
function gitApply(dir, file) {
  try { sh('git', ['apply', '-p1'], { input: fs.readFileSync(file), cwd: dir }); return true; }
  catch (e) { console.log('    apply failed: ' + String(e.message).split('\n')[0]); return false; }
}

// ---------------------------------------------------------------- Set A ---
console.log('\n=== SET A: wave-2 escalation patches (src/data/monsters.json) ===');
const setAResults = { go: false, per: [] };
{
  const diffs = fs.readdirSync(SET_A_DIR).filter(f => f.endsWith('.diff')).sort();
  ok(diffs.length === 10, `set A holds 10 diffs (got ${diffs.length})`);
  const scratch = scratchCopy(extractDir);
  const preOk = diffs.map(f => gitApplyCheck(scratch, path.join(SET_A_DIR, f)));
  diffs.forEach((f, i) => ok(preOk[i], `A/${f}: git apply --check -p1`));
  const applied = diffs.map(f => gitApply(scratch, path.join(SET_A_DIR, f)));
  diffs.forEach((f, i) => ok(applied[i], `A/${f}: applied to scratch extract`));
  let valid = false, wave2 = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(scratch, 'src', 'data', 'monsters.json'), 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.monsters || Object.values(raw));
    wave2 = arr.filter(m => m.wave === 2);
    valid = true;
  } catch (e) { console.log('    JSON parse failed: ' + e.message); }
  ok(valid, 'A: patched monsters.json is valid JSON');
  ok(wave2.length === 13, `A: all 13 wave-2 monsters present (got ${wave2.length})`);
  if (valid && wave2.length === 13) {
    const auditOut = sh('node', ['scripts/audit-wave2-escalation-20261007.js',
      '--file', path.join(scratch, 'src', 'data', 'monsters.json'),
      '--appjs', path.join(scratch, 'src', 'js', 'app.js'),
      '--seed', '20261007', '--json'], { cwd: extractDir });
    const audit = JSON.parse(auditOut);
    let allPass = true;
    for (const r of audit.results) {
      const pass = r.verdict === 'PASS';
      setAResults.per.push(`${r.id}: ${pass ? 'PASS' : r.verdict}`);
      ok(pass, `A: wave-2 audit PASS — ${r.id} (${r.name})`);
      allPass = allPass && pass;
    }
    ok(audit.results.length === 13, `A: audit covered 13 wave-2 monsters (got ${audit.results.length})`);
    setAResults.go = allPass && audit.results.length === 13;
  }
}
console.log(setAResults.go ? 'SET A: GO' : 'SET A: NO-GO');

// ---------------------------------------------------------------- Set B ---
console.log('\n=== SET B: dialogue rethink (src/js) ===');
const setBResults = { go: false, per: [] };
{
  const diffs = fs.readdirSync(SET_B_DIR).filter(f => f.endsWith('.diff')).sort();
  ok(diffs.length === 6, `set B holds 6 diffs (got ${diffs.length})`);
  const scratch = scratchCopy(extractDir);
  const preOk = diffs.map(f => gitApplyCheck(scratch, path.join(SET_B_DIR, f)));
  diffs.forEach((f, i) => { ok(preOk[i], `B/${f}: git apply --check -p1`); setBResults.per.push(`${f}: check ${preOk[i] ? 'clean' : 'FAILED'}`); });
  const applied = diffs.map(f => gitApply(scratch, path.join(SET_B_DIR, f))); // numeric order; 02+06 both touch convo-wants.js
  diffs.forEach((f, i) => ok(applied[i], `B/${f}: applied to scratch extract (in order)`));
  if (applied.every(Boolean)) {
    try {
      const out = execFileSync('node', [path.join(extractDir, 'scripts', 'test-dialogue-coherence-20261007.js')],
        { encoding: 'utf8', env: { ...process.env, DLG_ROOT: scratch }, cwd: scratch });
      const m = out.match(/=== Results: (\d+) pass, (\d+) fail ===/);
      const passes = m ? parseInt(m[1], 10) : -1, fails = m ? parseInt(m[2], 10) : -1;
      ok(passes === 17 && fails === 0, `B: dialogue coherence 17/17 PASS on patched (got ${passes}/${fails})`);
      setBResults.per.push(`coherence: ${passes} pass, ${fails} fail`);
      setBResults.go = passes === 17 && fails === 0;
    } catch (e) {
      ok(false, `B: coherence test ran without crashing (${String(e.message).split('\n')[0]})`);
    }
  }
}
console.log(setBResults.go ? 'SET B: GO' : 'SET B: NO-GO');

// ---------------------------------------------------------------- Set C ---
console.log('\n=== SET C: events expansion (src/data/events.json) ===');
const setCResults = { go: false, per: [] };
{
  ok(fs.existsSync(SET_C_FILE), 'set C fragment file exists');
  let fragOk = false;
  try {
    const frag = JSON.parse(fs.readFileSync(SET_C_FILE, 'utf8'));
    fragOk = Array.isArray(frag) && frag.length === 6;
  } catch (e) { console.log('    fragment parse failed: ' + e.message); }
  ok(fragOk, 'set C: fragment is a JSON array of 6 event defs');
  try {
    const out = execFileSync('node',
      [path.join(extractDir, 'scripts', 'test-events-expansion-20261007.js'),
       SET_C_FILE, path.join(extractDir, 'src', 'data', 'events.json')],
      { encoding: 'utf8', cwd: extractDir });
    const failCount = (out.match(/^  FAIL /gm) || []).length;
    const green = /RESULT: ALL GREEN/.test(out);
    ok(green && failCount === 0, `set C: expansion proof ALL GREEN (${failCount} FAIL lines)`);
    setCResults.per.push(`expansion proof: ${green ? 'ALL GREEN' : 'not green'}, ${failCount} FAIL lines`);
    setCResults.go = green && failCount === 0;
  } catch (e) {
    ok(false, `set C: expansion test exited cleanly (${String(e.message).split('\n')[0]})`);
  }
}
console.log(setCResults.go ? 'SET C: GO' : 'SET C: NO-GO');

// ---------------------------------------------------------------- verdict -
console.log('\n============================================================');
const overall = setAResults.go && setBResults.go && setCResults.go;
console.log(`SET A (wave-2 escalation): ${setAResults.go ? 'GO' : 'NO-GO'}`);
console.log(`SET B (dialogue rethink):  ${setBResults.go ? 'GO' : 'NO-GO'}`);
console.log(`SET C (events expansion):  ${setCResults.go ? 'GO' : 'NO-GO'}`);
console.log(`OVERALL: ${overall ? 'GO — all three patch sets ready to apply' : 'NO-GO — see failures above'}`);
if (failures.length) console.log('failures: ' + failures.length);
process.exit(overall ? 0 : 1);
