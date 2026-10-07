// test-ability-registry-20261007.js — proof test for the Ability Registry scaffold.
// Verifies: registry exists and is complete, validator passes, no dead abilities,
// orphan refs documented, dead active defs documented, all cross-references valid.
// Run: node scripts/test-ability-registry-20261007.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, failCount = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { failCount++; console.log('FAIL: ' + msg); }
}

const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilityRegistry.json'), 'utf8'));
const synergies = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));

// 1. registry exists with schema marker
ok(registry._schema === 'abilityRegistry/1', 'registry has _schema abilityRegistry/1');
ok(registry._docs && registry._docs.length > 100, 'registry has documentation');

// 2. bidirectional coverage
const abilityIds = new Set(abilities.map(a => a.id));
const registryIds = new Set(Object.keys(registry.abilities));
ok(abilityIds.size === 69, `abilities.json has 69 abilities (got ${abilityIds.size})`);
for (const id of abilityIds) ok(registryIds.has(id), `registry covers '${id}'`);
for (const id of registryIds) ok(abilityIds.has(id), `registry '${id}' exists in abilities.json`);

// 3. no duplicate ability IDs
ok(abilities.length === abilityIds.size, 'no duplicate ability IDs');

// 4. every registry entry has required fields
for (const id of registryIds) {
  const e = registry.abilities[id];
  ok(e.id && e.name && e.description, `registry '${id}' has id/name/description`);
  ok(e.tier !== undefined, `registry '${id}' has tier field`);
  ok(e.pool, `registry '${id}' has pool`);
  ok(e.unlock && e.unlock.type, `registry '${id}' has unlock type`);
  ok(e.effects, `registry '${id}' has effects`);
  ok(e.wiring, `registry '${id}' has wiring`);
  ok(['wired', 'partial', 'dead'].includes(e.status), `registry '${id}' has valid status`);
}

// 5. stats match
const actual = { wired: 0, partial: 0, dead: 0 };
for (const id of registryIds) actual[registry.abilities[id].status]++;
ok(registry._stats.wired === actual.wired, `stats.wired matches (${actual.wired})`);
ok(registry._stats.dead === actual.dead, `stats.dead matches (${actual.dead})`);
ok(registry._stats.total === abilityIds.size, 'stats.total matches');

// 6. no dead abilities (all 69 wired)
ok(actual.dead === 0, `no dead abilities (found ${actual.dead})`);

// 7. orphan code refs documented
const orphans = registry.orphanCodeRefs || [];
ok(orphans.length === 2, `2 orphan code refs documented (got ${orphans.length})`);
ok(orphans.some(o => o.id === 'observer'), 'observer orphan documented');
ok(orphans.some(o => o.id === 'social_read'), 'social_read orphan documented');

// 8. dead active defs documented
const deadActive = registry.deadActiveDefs || [];
ok(deadActive.length === 3, `3 dead active defs documented (got ${deadActive.length})`);
for (const id of ['field_medicine', 'herbal_remedy', 'purify']) {
  ok(deadActive.some(d => d.id === id), `dead active def '${id}' documented`);
}

// 9. synergy requires all valid
for (const s of synergies) {
  for (const r of (s.requires || [])) {
    ok(abilityIds.has(r), `synergy '${s.id}' requires valid ability '${r}'`);
  }
}

// 10. validator script passes
try {
  execSync(`node ${path.join(ROOT, 'scripts/validate-ability-registry.js')}`, { encoding: 'utf8', stdio: 'pipe' });
  ok(true, 'validate-ability-registry.js exits 0');
} catch (e) {
  ok(false, `validate-ability-registry.js failed:\n${(e.stdout || '')}`);
}

// 11. endgame build kits reference valid abilities
try {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/ENDGAME-BUILDS.md'), 'utf8');
  const kits = doc.match(/\*\*Ability kit \(\d+\):\*\*\s*([a-z_, ]+)/g) || [];
  let kitRefs = new Set();
  for (const k of kits) {
    const ids = k.replace(/.*:\*\*\s*/, '').split(',').map(s => s.trim());
    ids.forEach(i => kitRefs.add(i));
  }
  for (const r of kitRefs) ok(abilityIds.has(r), `endgame kit ability '${r}' valid`);
  ok(kitRefs.size > 0, `endgame doc has ability kit refs (${kitRefs.size})`);
} catch (e) {
  ok(false, 'could not check ENDGAME-BUILDS.md: ' + e.message);
}

// 12. alien persona kits reference valid abilities
try {
  const apCode = fs.readFileSync(path.join(ROOT, 'src/js/alienPlayers.js'), 'utf8');
  const kitBlock = apCode.match(/apAbilityKit[\s\S]*?return KITS\[pid\]/);
  ok(!!kitBlock, 'alienPlayers.js has apAbilityKit');
  const kitIds = new Set([...apCode.matchAll(/'([a-z_]+)': \[/g)].map(m => null).filter(Boolean));
  // extract from KITS object literal instead
  const kitsMatch = apCode.match(/var KITS = \{([\s\S]*?)\};/);
  if (kitsMatch) {
    const ids = [...kitsMatch[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    const abilityLike = ids.filter(i => abilityIds.has(i) || /^[a-z_]+$/.test(i));
    const unknown = [...new Set(ids)].filter(i => !abilityIds.has(i) && [
      'vex_marlowe','countess_sable','rax_dentist','pip_quindle','sarge','dr_fenwick','old_tam'
    ].indexOf(i) === -1);
    for (const u of unknown) ok(false, `alien kit references unknown ability '${u}'`);
    if (!unknown.length) ok(true, 'alien persona kits reference valid abilities');
  }
} catch (e) {
  ok(false, 'could not check alienPlayers.js: ' + e.message);
}

console.log(`\n${pass} passed, ${failCount} failed.`);
process.exit(failCount ? 1 : 0);
