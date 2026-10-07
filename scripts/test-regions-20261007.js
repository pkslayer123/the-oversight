#!/usr/bin/env node
// Proof test: regions scaffold (Steve 2026-10-07)
// Verifies regions.json schema, origin mapping, animal/plant references,
// characterGen tags, and game.js helpers.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = '/home/hatch/workspace/the-scattering';
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}
function headJSON(p) {
  const out = execSync(`git show HEAD:${p}`, { cwd: REPO }).toString();
  return JSON.parse(out);
}

// Load from /tmp (the new/edited files)
const regions = JSON.parse(fs.readFileSync('/tmp/regions.json', 'utf8'));
const characterGen = JSON.parse(fs.readFileSync('/tmp/characterGen.json', 'utf8'));
const animals = JSON.parse(fs.readFileSync('/tmp/animals-new.json', 'utf8'));
const plants = JSON.parse(fs.readFileSync('/tmp/plants-new.json', 'utf8'));
const gameSrc = fs.readFileSync('/tmp/game-new.js', 'utf8');

// 1. Eight regions, unique IDs
check('8 regions', regions.length === 8);
const ids = regions.map(r => r.id);
check('unique IDs', new Set(ids).size === 8);
const expected = ['middle_america','southwest_desert','pacific_northwest','deep_south_bayou','great_plains','appalachian','northeast','florida'];
for (const e of expected) check(`has ${e}`, ids.includes(e));

// 2. Required fields on each region
const asOriginFields = ['knownAnimals','knownPlants','familiarTiles','alienTiles','culture'];
const asHavenFields = ['gen','animalAdd','animalRemove','animalDensity','challenge','monsters','strategy','seasons','weather','hazards'];
for (const r of regions) {
  check(`${r.id} has name/flavor/description`, !!(r.name && r.flavor && r.description));
  check(`${r.id} has originKeys[]`, Array.isArray(r.originKeys) && r.originKeys.length > 0);
  for (const f of asOriginFields) check(`${r.id}.asOrigin.${f}`, r.asOrigin && (f in r.asOrigin));
  for (const f of asHavenFields) check(`${r.id}.asHaven.${f}`, r.asHaven && (f in r.asHaven));
  check(`${r.id} has 2 scaffold monsters`, r.asHaven.monsters.length === 2 && r.asHaven.monsters.every(m => m.scaffold === true && m.id && m.name && m.concept && m.wave));
  check(`${r.id} challenge has mechanics[]`, Array.isArray(r.asHaven.challenge.mechanics));
}

// 3. Origin keys exist in characterGen
const okKeys = new Set(Object.keys(characterGen.originKeywords));
for (const r of regions) {
  for (const k of r.originKeys) check(`originKey ${k} in characterGen`, okKeys.has(k));
}

// 4. characterGen tags include region IDs
for (const r of regions) {
  for (const k of r.originKeys) {
    const tags = characterGen.originKeywords[k];
    check(`characterGen[${k}] tagged ${r.id}`, Array.isArray(tags) && tags.includes(r.id));
  }
}

// 5. Animal references valid
const animalIds = new Set(animals.map(a => a.id));
for (const r of regions) {
  for (const aid of [...r.asOrigin.knownAnimals, ...r.asHaven.animalAdd, ...r.asHaven.animalRemove]) {
    check(`${r.id} animal ${aid} exists`, animalIds.has(aid));
  }
}

// 6. Plant references valid
const plantIds = new Set(plants.map(p => p.id));
for (const r of regions) {
  for (const pid of Object.keys(r.asOrigin.knownPlants)) {
    check(`${r.id} plant ${pid} exists`, plantIds.has(pid));
    const lvl = r.asOrigin.knownPlants[pid];
    check(`${r.id} plant ${pid} level 1-4`, lvl >= 1 && lvl <= 4);
  }
}

// 7. New animals have regions field matching a real region
for (const a of animals) {
  if (a.regions) {
    for (const rg of a.regions) {
      if (rg !== 'north_america') check(`animal ${a.id} region ${rg} valid`, ids.includes(rg));
    }
  }
}

// 8. game.js helpers present
for (const fn of ['regionDef(id)', 'regionsForOrigin(tags)', 'regionKnownPlants(tags)', 'regionKnownAnimals(tags)']) {
  check(`game.js has ${fn}`, gameSrc.includes(fn.split('(')[0] + '('));
}
check('game.js loads regions.json', gameSrc.includes("'regions.json'"));
check('locParams merges region gen', gameSrc.includes("region.asHaven") && gameSrc.includes("state.region"));
check('pawpaw hardcoded block replaced', !gameSrc.includes("OHIO ROOTS"));
check('region-driven seeding present', gameSrc.includes("REGIONAL ROOTS"));

// 9. middle_america gen matches old defaults (no behavior change)
const ma = regions.find(r => r.id === 'middle_america');
const g = ma.asHaven.gen;
check('middle_america gen = old defaults',
  g.creeks === 1 && g.wetlands === 3 && g.groveBlobs === 2 && g.groveSize === 4 &&
  g.meadowSize === 5 && g.thickets === 5 && g.trailLines === 1);

// 10. middle_america keeps pawpaw:2 (Columbus behavior preserved)
check('middle_america pawpaw level 2', ma.asOrigin.knownPlants.pawpaw === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
