// test-synergy-content-20261007.js
// Content test for the 20 new synergies appended 2026-10-07 (Steve: every ability
// needs a synergy path; priority = zero-synergy pools: brawler/social/exploration/
// investigation + cross-boundary tech+skill+ability entries).
// Asserts:
//  1. synergies.json parses as JSON (worktree copy).
//  2. All IDs unique across HEAD content + worktree content (sibling hunks).
//  3. Every requires[] resolves: real ability ID (abilities.json at HEAD) OR
//     tech:<village technique> OR skill:<codex skill>.
//  4. Every entry has discovery_method with type, hint, tease1, tease2.
// Usage: node scripts/test-synergy-content-20261007.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = '/home/hatch/workspace/the-scattering';
let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL:', msg); };
const ok = (msg) => console.log('ok:', msg);

// 1. parse worktree copy
let syns;
try {
  syns = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/synergies.json'), 'utf8'));
  ok(`synergies.json parses (${syns.length} entries)`);
} catch (e) {
  fail('synergies.json does not parse: ' + e.message);
  process.exit(1);
}
if (!Array.isArray(syns)) { fail('top level is not an array'); process.exit(1); }

// 2. uniqueness vs HEAD + worktree (sibling hunks live in index/worktree; check both)
const headSyns = JSON.parse(execSync('git show HEAD:src/data/synergies.json', { cwd: REPO }).toString());
const headIds = new Set(headSyns.map(s => s.id));
const worktreeIds = syns.map(s => s.id);
const seen = new Set();
for (const id of worktreeIds) {
  if (seen.has(id)) fail(`duplicate id in worktree: ${id}`);
  seen.add(id);
}
ok(`all ${worktreeIds.length} worktree IDs unique within file`);
const newOnes = worktreeIds.filter(id => !headIds.has(id));
console.log(`ok: ${newOnes.length} new IDs vs HEAD: ${newOnes.join(', ')}`);

// 3. requires[] resolution
const abilities = JSON.parse(execSync('git show HEAD:src/data/abilities.json', { cwd: REPO }).toString());
const abilityIds = new Set(abilities.map(a => a.id));
const TECHS = new Set(['net_mending','tide_reading','smoke_preserving','seed_saving','soil_reading',
  'root_cellaring','plant_tracking','season_reading','trail_blazing','salvage_sight','tool_repair','ruin_reading']);
const SKILLS = new Set(['fishing','farming','foraging']); // codex skills seen in existing cross-boundary synergies
const newIdSet = new Set(newOnes);
const checkReq = (s, strict) => {
  for (const r of (s.requires || [])) {
    let bad = null;
    if (r.startsWith('tech:')) {
      if (!TECHS.has(r.slice(5))) bad = `unknown tech ${r}`;
    } else if (r.startsWith('skill:')) {
      if (!SKILLS.has(r.slice(6))) bad = `unknown skill ${r}`;
    } else if (!abilityIds.has(r)) {
      bad = `unknown ability id ${r}`;
    }
    if (bad) {
      if (strict) fail(`${s.id}: requires ${bad}`);
      else console.log(`note (pre-existing, not this batch): ${s.id}: requires ${bad}`);
    }
  }
};
for (const s of syns) checkReq(s, newIdSet.has(s.id));
ok('every NEW requires[] resolves to a real ability id or valid tech:/skill: prefix');

// 4. discovery_method completeness
const TYPES = new Set(['sequential', 'simultaneous', 'sustained']);
for (const s of syns) {
  const dm = s.discovery_method;
  if (!dm) { fail(`${s.id}: missing discovery_method`); continue; }
  if (!TYPES.has(dm.type)) fail(`${s.id}: bad discovery_method.type ${dm.type}`);
  for (const k of ['hint', 'tease1', 'tease2']) {
    if (typeof dm[k] !== 'string' || !dm[k].length) fail(`${s.id}: discovery_method.${k} missing/empty`);
  }
  if (dm.type === 'sequential' && !Array.isArray(dm.order)) fail(`${s.id}: sequential missing order[]`);
}
ok('every entry has discovery_method with hint + teases');

// 5. modifiers sanity (op/target/value present; ops limited to add|multiply)
for (const s of syns) {
  for (const m of (s.modifiers || [])) {
    if (!['add','multiply'].includes(m.op)) fail(`${s.id}: bad modifier op ${m.op}`);
    if (typeof m.target !== 'string' || !m.target.length) fail(`${s.id}: modifier missing target`);
    if (typeof m.value !== 'number') fail(`${s.id}: modifier value not a number`);
  }
}
ok('all modifiers well-formed');

// 6. spot coverage: the priority zero-synergy pools now have paths
const covered = new Set();
for (const s of syns) for (const r of (s.requires || [])) if (!r.includes(':')) covered.add(r);
const priority = ['brawler_instinct','adrenaline_control','intimidating_presence','silver_tongue',
  'gossip_network','peacemaker','pathfinder','eagle_eye','lie_detector','evidence_board'];
const missing = priority.filter(p => !covered.has(p));
if (missing.length) fail('priority abilities still without synergy: ' + missing.join(', '));
else ok('all 10 priority pool abilities now have a synergy path');

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nALL SYNERGY CONTENT TESTS PASSED');
