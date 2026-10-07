// test-ability-content-20261007.js
// Verifies the mid-game ability content batch (2026-10-07):
//   - candidate JSON parses as an array
//   - schema: id/name/pool/description/unlock{type} present; modifiers all have target+op
//   - pools and unlock types are from the valid sets
//   - NEW ids (candidate minus HEAD) are unique, collide with nothing at HEAD,
//     and collide with no ids added by sibling staged/worktree hunks
//   - count: candidate = HEAD count + new count
//
// Usage:
//   node scripts/test-ability-content-20261007.js [candidate.json]
//   candidate defaults to the worktree src/data/abilities.json (self-consistency check).
//   For the commit-blob check: node scripts/test-ability-content-20261007.js /tmp/abilities-new.json
'use strict';
const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const git = (args) => execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8' });

const VALID_POOLS = new Set(['care', 'combat', 'craft', 'fieldcraft', 'social', 'exploration', 'investigation', 'system', 'fallback']);
const VALID_UNLOCKS = new Set(['granted', 'trial', 'quest', 'discovery', 'mentorship', 'system_offer', 'fallback']);
const VALID_OPS = new Set(['add', 'multiply']);

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL:', msg); };
const ok = (msg) => console.log('ok:', msg);

// ---- candidate ----
const candidatePath = process.argv[2] || path.join(REPO, 'src/data/abilities.json');
let candidate;
try {
  candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
} catch (e) { fail(`candidate JSON does not parse (${candidatePath}): ${e.message}`); process.exit(1); }
if (!Array.isArray(candidate)) { fail('candidate root is not an array'); process.exit(1); }
ok(`candidate parses: ${candidate.length} abilities (${candidatePath})`);

// ---- schema ----
for (const a of candidate) {
  if (typeof a.id !== 'string' || !a.id) fail(`entry missing id: ${JSON.stringify(a).slice(0, 80)}`);
  if (typeof a.name !== 'string' || !a.name) fail(`${a.id}: missing name`);
  if (typeof a.description !== 'string' || !a.description) fail(`${a.id}: missing description`);
  if (!VALID_POOLS.has(a.pool)) fail(`${a.id}: invalid pool "${a.pool}"`);
  if (!a.unlock || !VALID_UNLOCKS.has(a.unlock.type)) fail(`${a.id}: invalid unlock ${JSON.stringify(a.unlock)}`);
  for (const m of a.modifiers || []) {
    if (typeof m.target !== 'string' || !m.target) fail(`${a.id}: modifier missing target`);
    if (!VALID_OPS.has(m.op)) fail(`${a.id}: modifier bad op "${m.op}"`);
    if (typeof m.value !== 'number') fail(`${a.id}: modifier value not a number`);
  }
}
if (failures === 0) ok('schema: all entries have id/name/pool/description/valid unlock; all modifiers have target+op+numeric value');

// ---- HEAD baseline ----
const head = JSON.parse(git('show HEAD:src/data/abilities.json'));
const headIds = new Set(head.map(a => a.id));
ok(`HEAD baseline: ${head.length} abilities`);

// pre-existing dupes at HEAD are reported, not failed (not this batch's doing)
{
  const counts = {};
  for (const a of head) counts[a.id] = (counts[a.id] || 0) + 1;
  const dupes = Object.keys(counts).filter(k => counts[k] > 1);
  if (dupes.length) console.log('note: pre-existing duplicate ids at HEAD (not from this batch):', dupes.join(', '));
}

// ---- sibling hunks: ids added by staged or worktree diffs vs HEAD ----
const siblingAdded = new Set();
for (const diffArgs of ['diff --cached -- src/data/abilities.json', 'diff -- src/data/abilities.json']) {
  const d = git(diffArgs);
  for (const m of d.matchAll(/^\+(\s*)"id": "([^"]+)"/gm)) siblingAdded.add(m[2]);
}
ok(`sibling-added ids in staged/worktree hunks: ${[...siblingAdded].join(', ') || '(none)'}`);

// ---- new ids ----
const newAbilities = candidate.filter(a => !headIds.has(a.id));
const newIds = newAbilities.map(a => a.id);
{
  const counts = {};
  for (const id of newIds) counts[id] = (counts[id] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) if (n > 1) fail(`new id duplicated in batch: ${id}`);
  for (const id of newIds) {
    if (siblingAdded.has(id)) fail(`new id collides with sibling hunk: ${id}`);
  }
  const EXPECTED_NEW = 12;
  if (candidatePath.includes('abilities-new') && newAbilities.length !== EXPECTED_NEW)
    fail(`expected ${EXPECTED_NEW} new abilities, found ${newAbilities.length}`);
}
if (failures === 0) ok(`new ids unique, no HEAD/sibling collisions: ${newIds.join(', ')}`);

// ---- count ----
if (candidate.length !== head.length + newAbilities.length)
  fail(`count mismatch: candidate ${candidate.length} != HEAD ${head.length} + new ${newAbilities.length}`);
else ok(`count: ${head.length} (HEAD) + ${newAbilities.length} (new) = ${candidate.length}`);

// ---- mid-game batch expectations ----
const noWeek1 = newAbilities.filter(a => ['system_offer', 'granted'].includes(a.unlock.type));
if (noWeek1.length) fail(`mid-game batch must not use system_offer/granted: ${noWeek1.map(a => a.id).join(', ')}`);
else ok('unlock types are mid-game only (trial/quest/discovery/mentorship)');

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nALL CHECKS PASSED');
