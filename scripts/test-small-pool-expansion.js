#!/usr/bin/env node
/* W6 small-pool expansion: proves the 2026-10-06 content additions load,
   grow their pools, carry the full established data shape, have no duplicate
   ids, and keep every cross-reference resolvable (books -> plants/recipes/
   animals/skills; lifeseed templates -> supported placeholder tokens).
   Run: node scripts/test-small-pool-expansion.js */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA = path.join(__dirname, '..', 'src', 'data');
const load = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const animals = load('animals.json');
const books = load('books.json');
const lifeseeds = load('lifeseeds.json');
const plants = load('plants.json');
const recipes = load('recipes.json');
const knowledge = load('knowledge.json');

let pass = 0;
const ok = (cond, msg) => { assert(cond, 'FAIL: ' + msg); pass++; console.log('  ok - ' + msg); };

console.log('animals.json');
const animalIds = new Set();
for (const a of animals) { assert(!animalIds.has(a.id), 'dup animal ' + a.id); animalIds.add(a.id); }
ok(animals.length === 15, `pool grew 12 -> ${animals.length}`);
// full established shape on the 3 new species
for (const id of ['timber_rattlesnake', 'striped_skunk', 'muskrat']) {
  const a = animals.find(x => x.id === id);
  ok(!!a, id + ' loads');
  for (const f of ['id','name','scientific','biomes','description','calories','difficulty',
      'method','knowledgeLevels','unknown','emoji','behavior','behaviorDesc',
      'fleeDifficulty','huntText','tell','butcher','activity']) ok(a[f] !== undefined, `${id}.${f} present`);
  ok(['nocturnal','diurnal','crepuscular','both'].includes(a.activity), `${id}.activity in enum`);
  ok(Object.keys(a.knowledgeLevels).join('/') === '1/2/3/4', `${id} has knowledge levels 1-4`);
  ok(Array.isArray(a.method) && a.method.length > 0, `${id} has hunt methods`);
}

console.log('books.json');
const bookIds = new Set();
for (const b of books) { assert(!bookIds.has(b.id), 'dup book ' + b.id); bookIds.add(b.id); }
ok(books.length === 8, `pool grew 4 -> ${books.length}`);
const plantIds = new Set(plants.map(p => p.id));
const recipeIds = new Set(recipes.map(r => r.id));
const skillIds = new Set(knowledge.map(k => k.id));
for (const id of ['system_field_manual_fauna','smoke_and_salt','almanac_turned_year','scattered_ledger']) {
  const b = books.find(x => x.id === id);
  ok(!!b, id + ' loads');
  ok(b.name && b.description && b.flavor && b.unlocks, `${id} has full shape`);
  for (const pid of (b.unlocks.plants || [])) {
    ok(plantIds.has(pid), `${id} plant ref resolves: ${pid}`);
    const lvl = String(b.unlocks.level || 1);
    ok(plants.find(p => p.id === pid).knowledgeLevels[lvl], `${id} plant ${pid} has level ${lvl}`);
  }
  for (const rid of (b.unlocks.recipes || [])) ok(recipeIds.has(rid), `${id} recipe ref resolves: ${rid}`);
  for (const aid of (b.unlocks.animals || [])) ok(animalIds.has(aid), `${id} animal ref resolves: ${aid}`);
  for (const sid of (b.unlocks.skills || [])) ok(skillIds.has(sid), `${id} skill ref resolves: ${sid}`);
}

console.log('lifeseeds.json');
ok(lifeseeds.events.length === 10, `events pool grew 6 -> ${lifeseeds.events.length}`);
ok(lifeseeds.wants.length === 10, `wants pool grew 6 -> ${lifeseeds.wants.length}`);
ok(lifeseeds.wounds.length === 10, `wounds pool grew 6 -> ${lifeseeds.wounds.length}`);
const home = lifeseeds.places.find(p => p.kind === 'home');
const cache = lifeseeds.places.find(p => p.kind === 'cache');
ok(home.names.length === 6, `home place names 3 -> ${home.names.length}`);
ok(cache.names.length === 6, `cache place names 3 -> ${cache.names.length}`);
// placeholder tokens must all be ones lifeseed.js substitutes
const allowed = ['first','town','workplace','street','place','kin'];
const toks = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
const allStrings = [...lifeseeds.events, ...lifeseeds.wants, ...lifeseeds.wounds,
  ...lifeseeds.places.flatMap(p => p.names), ...Object.values(lifeseeds.skillOrigins).flat()];
for (const s of allStrings) for (const t of toks(s)) ok(allowed.includes(t), `token {${t}} is supported in "${s.slice(0,40)}..."`);
ok(new Set(allStrings).size === allStrings.length, 'no duplicate lifeseed strings');

console.log(`\nALL ${pass} CHECKS PASSED`);
