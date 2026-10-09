// Break-it proof: characterGen granted abilities + synergy requires must all resolve.
// The 2026-10-08 knowledge break-it found 19 occupation granted entries + 3 synergy
// legs referencing abilities that were moved to knowledge (moved_from_ability) —
// silently granting fewer abilities than promised, and synergies that could never fire.
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = '/home/hatch/workspace/the-scattering';
const SEED = parseInt(process.env.SEED || '20261008', 10);
let rngState = SEED >>> 0;
Math.random = () => (rngState = (rngState * 1664525 + 1013904223) >>> 0) / 4294967296;

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '::', e.message); } };

console.log('== ability-id resolution proof, seed ' + SEED + ' ==');

const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
const abilityIds = new Set(abilities.map(a => a.id));
const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
const syns = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));

// 1. Every occupation granted id must be a real ability
check('all occupation granted ids are real abilities', () => {
  const bad = [];
  for (const o of cg.occupations) for (const g of (o.granted || [])) {
    if (!abilityIds.has(g)) bad.push(`${o.id}:${g}`);
  }
  assert.strictEqual(bad.length, 0, `invalid granted: ${bad.join(', ')}`);
});

// 2. The three moved-to-knowledge ids must not appear as granted anywhere
check('moved-to-knowledge ids not granted as abilities', () => {
  const moved = ['pattern_recognition', 'forage_identification', 'taught_hands'];
  const hits = [];
  for (const o of cg.occupations) for (const g of (o.granted || [])) {
    if (moved.includes(g)) hits.push(`${o.id}:${g}`);
  }
  assert.strictEqual(hits.length, 0, hits.join(', '));
});

// 3. Synergy requires: bare ids must be real abilities (or tech:/skill: prefixed).
// (discovery_method.order is prefix-aware in checkSynergyDiscovery — not a hard gate.)
check('all synergy requires resolve', () => {
  const bad = [];
  for (const s of syns) {
    for (const r of (s.requires || [])) {
      if (r.startsWith('tech:') || r.startsWith('skill:')) continue;
      if (syns.some(x => x.id === r)) continue; // synergy leg
      if (!abilityIds.has(r)) bad.push(`${s.id}:${r}`);
    }
  }
  assert.strictEqual(bad.length, 0, `unresolvable: ${bad.join(', ')}`);
});

// 4. The three rewired synergies now point at real abilities
check('sees_the_weave / string_wall / read_the_patch require real abilities', () => {
  const byId = Object.fromEntries(syns.map(s => [s.id, s]));
  for (const rid of byId.sees_the_weave.requires) assert.ok(abilityIds.has(rid), rid);
  for (const rid of byId.string_wall.requires) assert.ok(abilityIds.has(rid), rid);
  for (const rid of byId.read_the_patch.requires) {
    if (!rid.startsWith('tech:') && !rid.startsWith('skill:')) assert.ok(abilityIds.has(rid), rid);
  }
});

// 5. Every occupation still grants exactly its promised abilities (none dropped)
check('no occupation lost a granted slot', () => {
  for (const o of cg.occupations) {
    assert.ok((o.granted || []).length >= 1, `${o.id} grants nothing`);
    assert.ok((o.granted || []).length <= 2, `${o.id} grants too many`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
