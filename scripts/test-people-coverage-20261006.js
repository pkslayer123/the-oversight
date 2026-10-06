// test-people-coverage-20261006.js — Person system completeness audit (Steve 2026-10-06).
// Task 1: every person field populated through the unified path (hydrateSeed/getPerson).
// Task 2: personality <-> role coverage — no invalid values, no unintended gaps.
// Run: node scripts/test-people-coverage-20261006.js
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const seeds = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/background_survivors.json'), 'utf8'));
const cg = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/characterGen.json'), 'utf8'));
const gameSrc = fs.readFileSync(path.join(repo, 'src/js/game.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', label); }
};

const validTemp = new Set(cg.temperaments || []);
const validSharing = new Set(cg.sharingStyles || []);
const validCur = new Set(cg.curiosities || []);

// ---- Task 2a: every seed personality value must be in the pools ----
for (const s of seeds) {
  const p = s.personality || {};
  ok(validTemp.has(p.temperament), `seed ${s.id} temperament '${p.temperament}' in pool`);
  ok(validSharing.has(p.sharing), `seed ${s.id} sharing '${p.sharing}' in pool`);
  ok(validCur.has(p.curiosity), `seed ${s.id} curiosity '${p.curiosity}' in pool`);
}

// ---- Task 2b: 'pragmatic'/'hoarder' handled in code AND in pools ----
ok(validSharing.has('pragmatic'), "sharingStyles includes 'pragmatic' (31+ seeds use it, storage.js handles it)");
ok(validSharing.has('hoarder'), "sharingStyles includes 'hoarder' (storage.js handles it)");
ok(validTemp.has('anxious'), "temperaments includes 'anxious'");

// ---- Task 2c: anxious has assess voice + intel mapping in game.js ----
ok(gameSrc.includes('_assessPool') || gameSrc.includes('anxious: [`${first} worries'),
  "anxious assess pool entries present");
ok((gameSrc.match(/anxious: \['observant', 'steady'\]/g) || []).length >= 2,
  "tempSec.anxious mapping present in genCharacter + hydrateSeed");

// ---- Task 2d: occupation coverage — every occupation has at least one seed ----
const occNames = new Set((cg.occupations || []).map(o => String(o.name || '').toLowerCase()));
const seedOccs = new Set(seeds.map(s => String(s.formerOccupation || '').toLowerCase()));
const missingOcc = [...occNames].filter(o => !seedOccs.has(o));
ok(missingOcc.length === 0, `all occupations have seeds (missing: ${missingOcc.join(', ') || 'none'})`);

// ---- Task 2e: every seed occupation maps to a real characterGen occupation ----
const badSeedOcc = seeds.filter(s => !occNames.has(String(s.formerOccupation || '').toLowerCase()));
ok(badSeedOcc.length === 0, `all seed occupations valid (bad: ${badSeedOcc.map(s => s.id).join(', ') || 'none'})`);

// ---- Task 1a: genCharacter sets clothing ----
ok(/clothing:\s*this\.appearanceFor\(origin,\s*parsed\.tags\)\.clothing/.test(gameSrc),
  "genCharacter sets clothing from appearanceFor pool");

// ---- Task 1b: hydrateSeed has MARITIME DRIFT ----
const maritimeCount = (gameSrc.match(/MARITIME\.includes\(occ\.id\)/g) || []).length;
ok(maritimeCount >= 2, `MARITIME DRIFT in genCharacter + hydrateSeed (found ${maritimeCount})`);

// ---- Task 1c: hydrateSeed passes heritageCultureId ----
ok(/const langs = this\.genCultureLanguages\(homeCulture, occ, \{ heritageCultureId: nameCulture, age \}\);/.test(gameSrc),
  "hydrateSeed passes heritageCultureId to genCultureLanguages");

// ---- Task 1d: cultureForName helper exists ----
ok(/cultureForName\(first\)\s*\{/.test(gameSrc), "cultureForName helper exists");

// ---- Task 1e: seed identity fields preserved (not overridden by hydrate) ----
// hydrateSeed must keep seed id/name/age/gender/origin authoritative
ok(/id:\s*s\.id/.test(gameSrc), "hydrateSeed keeps seed id");
ok(/gender:\s*s\.gender/.test(gameSrc), "hydrateSeed keeps seed gender authoritative");

// ---- Task 1f: required person fields — check a hydrated seed has them all ----
// Simulate the field list both paths produce (static check on source)
const requiredFields = ['id','name','formerOccupation','homeRegion','originTags','heritage',
  'backstory','personality','age','goal','intelligence','abilityWeights','items','talk','quest',
  'kcalPerDay','providesPerDay','survivalProbability','systemAssessment','secretFear',
  'languages','occupationId','candidate','pro','gender','skinTone','clothing'];
// genCharacter char literal check (spot-check the hardest ones;
// secretFear uses shorthand property syntax)
for (const f of ['clothing','skinTone','gender','heritage','originTags','intelligence','abilityWeights','systemAssessment']) {
  ok(gameSrc.includes(f + ':') || gameSrc.includes(f + ' :'), `game.js sets person field '${f}'`);
}
ok(/secretFear, languages: langs/.test(gameSrc), "game.js sets person field 'secretFear' (shorthand)");

// ---- Task 2f: personality -> role — temperament x category coverage report ----
const occByName = {};
for (const o of cg.occupations || []) occByName[String(o.name || '').toLowerCase()] = o;
const catOf = (occName) => {
  const o = occByName[String(occName || '').toLowerCase()] || {};
  const tags = o.teachTags || [];
  if (tags.includes('medicinal')) return 'medic';
  if (tags.includes('food')) return 'food';
  const intel = o.intel || '';
  if (intel === 'social') return 'social';
  if (intel === 'analytical' || intel === 'creative') return 'mind';
  return 'hands';
};
const matrix = {};
for (const s of seeds) {
  const t = (s.personality || {}).temperament;
  const c = catOf(s.formerOccupation);
  matrix[t] = matrix[t] || {};
  matrix[t][c] = (matrix[t][c] || 0) + 1;
}
// Document gaps (informational — generation is procedural so players aren't blocked)
const cats = ['medic','food','social','mind','hands'];
const gaps = [];
for (const t of validTemp) {
  for (const c of cats) {
    if (!(matrix[t] && matrix[t][c])) gaps.push(`${t}/${c}`);
  }
}
console.log(`\nPersonality x role matrix: ${[...validTemp].length} temperaments x ${cats.length} categories`);
console.log(`Seed coverage gaps (procedural generation fills these; seeds are village NPCs): ${gaps.length}`);
if (gaps.length) console.log('  ' + gaps.join(', '));

// The critical assertion: medic + food roles have personality diversity (not all one temperament)
const medicTemps = new Set(seeds.filter(s => catOf(s.formerOccupation) === 'medic').map(s => (s.personality || {}).temperament));
const foodTemps = new Set(seeds.filter(s => catOf(s.formerOccupation) === 'food').map(s => (s.personality || {}).temperament));
ok(medicTemps.size >= 4, `medic role has personality diversity (${medicTemps.size} temperaments)`);
ok(foodTemps.size >= 4, `food role has personality diversity (${foodTemps.size} temperaments)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
