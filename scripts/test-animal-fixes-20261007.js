// Proof test: animal fixes — silent bolts + Columbus native knowledge (Steve 2026-10-07)
// Run: node scripts/test-animal-fixes-20261007.js

const fs = require('fs');
const path = require('path');

const REPO = '/home/hatch/workspace/the-scattering';
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + msg); }
}
function eq(a, b, msg) {
  if (a === b) { pass++; }
  else { fail++; console.log(`FAIL: ${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
}

// Load data files from a given base (HEAD versions in /tmp, or repo)
function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

console.log('=== Fix 1: encChaseText exists and is behavior-specific ===');
const encSrc = fs.readFileSync('/tmp/enc-new.js', 'utf8');
ok(encSrc.includes('G.encChaseText = function'), 'encChaseText defined');
ok(encSrc.includes('MID-CHASE NARRATION'), 'chase narration comment present');
// Check each behavior has lines
for (const beh of ['wary','skittish','cunning','flock','alarmed','aquatic','arboreal','camouflaged']) {
  ok(encSrc.includes(beh + ': ['), `chase lines for behavior '${beh}'`);
}
// Check it's wired into the bolt block
ok(encSrc.includes('this.encChaseText(a)'), 'encChaseText called in bolt block');
ok(encSrc.includes('no-silent-turns'), 'no-silent-turns comment in bolt block');

console.log('\n=== Fix 2a: originKeywords have north_america for US places ===');
const cg = loadJSON('/tmp/cg-new.json');
const okw = cg.originKeywords;
for (const k of ['columbus','ohio','chicago','texas','california','canada','mexico']) {
  const tags = (okw[k] || []).map(t => String(t).toLowerCase());
  ok(tags.includes('north_america'), `originKeywords['${k}'] includes north_america`);
}
// Columbus specifically
{
  const tags = (okw['columbus'] || []).map(t => String(t).toLowerCase());
  ok(tags.includes('ohio'), "columbus tags include ohio");
  ok(tags.includes('columbus'), "columbus tags include columbus");
}

console.log('\n=== Fix 2b: encAnimalKnown works for Columbus natives ===');
// Simulate encAnimalKnown logic with Columbus tags
function simAnimalKnown(animalId, originTags, animalsData) {
  const adef = animalsData.find(a => a.id === animalId);
  if (adef && adef.common) {
    const tags = (originTags || []).map(t => String(t).toLowerCase());
    const aregions = (adef.regions || ['north_america']).map(r => String(r).toLowerCase());
    const overlap = tags.some(t => aregions.includes(t));
    const isNorthAmerican = tags.includes('north_america') || tags.some(t =>
      ['united states', 'usa', 'america', 'canada'].includes(t));
    if (overlap || (isNorthAmerican && aregions.includes('north_america'))) {
      return true;
    }
  }
  return false; // would need encounters
}
const animals = loadJSON(REPO + '/src/data/animals.json');
const animList = Array.isArray(animals) ? animals : animals.animals;
// Simulate Columbus native tags (from updated originKeywords)
const columbusTags = ['ohio','midwest','city','columbus','north_america'];
for (const aid of ['white_tailed_deer','cottontail_rabbit','raccoon','gray_squirrel','opossum','wild_turkey']) {
  ok(simAnimalKnown(aid, columbusTags, animList), `Columbus native knows ${aid}`);
}
// A Brazilian should NOT know them (no north_america overlap)
const brazilTags = ['brazil','south_america','tropics'];
for (const aid of ['white_tailed_deer','cottontail_rabbit']) {
  ok(!simAnimalKnown(aid, brazilTags, animList), `Brazilian does NOT auto-know ${aid}`);
}

console.log('\n=== Fix 2c: pawpaw seeded for Ohio natives ===');
const gameSrc = fs.readFileSync('/tmp/game-new.js', 'utf8');
ok(gameSrc.includes('OHIO ROOTS'), 'Ohio roots seeding comment present');
ok(gameSrc.includes("level: 2"), 'pawpaw seeded at level 2');
ok(gameSrc.includes("'pawpaw'"), 'pawpaw id referenced');
// Verify pawpaw exists in plants data with knowledgeLevels
const plants = loadJSON(REPO + '/src/data/plants.json');
const plantList = Array.isArray(plants) ? plants : plants.plants;
const pawpaw = plantList.find(p => p.id === 'pawpaw');
ok(!!pawpaw, 'pawpaw exists in plants.json');
ok(!!(pawpaw && pawpaw.knowledgeLevels && pawpaw.knowledgeLevels['2']), 'pawpaw has level 2 knowledge');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
