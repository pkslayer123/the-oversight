#!/usr/bin/env node
/* W6 small-pool expansion 2 (2026-10-06): proves the second-round content
   additions load and grow their pools with the full established data shape:
   recipes 7->14, books 8->12, locations 8->12. Checks no duplicate ids,
   cross-references resolve (recipe materials are craftable MAT_DEFS keys or
   the special 'bait'; trap catches resolve to animal ids; book unlocks
   resolve to plants/recipes/animals/knowledge ids; locations carry the full
   gen param set with sane values and a valid spawnType), and knowledgeLevels
   1/2/3 exist on every new recipe.
   Run: node scripts/test-small-pool-expansion-2.js */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA = path.join(__dirname, '..', 'src', 'data');
const load = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const recipes = load('recipes.json');
const books = load('books.json');
const locations = load('locations.json');
const animals = load('animals.json');
const plants = load('plants.json');
const knowledge = load('knowledge.json');

let pass = 0;
const ok = (cond, msg) => { assert(cond, 'FAIL: ' + msg); pass++; console.log('  ok - ' + msg); };
const noDup = (arr, label) => {
  const seen = new Set();
  for (const x of arr) { assert(!seen.has(x.id), `dup ${label} ${x.id}`); seen.add(x.id); }
  ok(true, `${label}: no duplicate ids (${arr.length})`);
};

console.log('recipes.json');
noDup(recipes, 'recipes');
ok(recipes.length >= 14, `pool grew 7 -> ${recipes.length} (dynamic)`);
// craftable material keys: MAT_DEFS in storage.js + the special-cased 'bait'
const MAT_KEYS = new Set(['wood', 'branch', 'stone', 'fiber', 'stick', 'vine', 'bait']);
const animalIds = new Set(animals.map(a => a.id));
const NEW_TRAPS = ['spring_snare', 'fish_basket', 'noose_pole', 'trotline'];
const NEW_TOOLS = ['drying_rack', 'stone_axe', 'braided_cord'];
for (const id of [...NEW_TRAPS, ...NEW_TOOLS]) {
  const r = recipes.find(x => x.id === id);
  ok(!!r, id + ' loads');
  ok(r.name && r.description && r.materials && r.knowledgeLevels, `${id} has full shape`);
  for (const m of Object.keys(r.materials)) ok(MAT_KEYS.has(m), `${id} material '${m}' is craftable`);
  ok(Object.keys(r.knowledgeLevels).join('/') === '1/2/3', `${id} has knowledge levels 1-3`);
  ok(typeof r.materials === 'object' && Object.values(r.materials).every(n => Number.isInteger(n) && n > 0), `${id} material counts are positive ints`);
}
for (const id of NEW_TRAPS) {
  const r = recipes.find(x => x.id === id);
  ok(Number.isInteger(r.uses) && r.uses > 0, `${id} is a trap with uses=${r.uses}`);
  ok(Array.isArray(r.catches) && r.catches.length > 0, `${id} has catches`);
  for (const c of r.catches) ok(animalIds.has(c), `${id} catch resolves: ${c}`);
}
for (const id of NEW_TOOLS) {
  const r = recipes.find(x => x.id === id);
  ok(r.uses == null && !r.catches, `${id} is a pack-item tool (no uses/catches -> durable path)`);
  ok(r.durable === undefined && r.kg === undefined, `${id} avoids schema-unknown fields (durable/kg)`);
}

console.log('books.json');
noDup(books, 'books');
ok(books.length >= 12, `pool grew 8 -> ${books.length} (dynamic)`);
const plantIds = new Set(plants.map(p => p.id));
const recipeIds = new Set(recipes.map(r => r.id));
const skillIds = new Set(knowledge.map(k => k.id));
for (const id of ['system_manual_traps', 'basket_weavers_primer', 'smokehouse_ledger', 'butchers_notes']) {
  const b = books.find(x => x.id === id);
  ok(!!b, id + ' loads');
  ok(b.name && b.description && b.flavor && b.unlocks, `${id} has full shape`);
  for (const pid of (b.unlocks.plants || [])) ok(plantIds.has(pid), `${id} plant ref resolves: ${pid}`);
  for (const rid of (b.unlocks.recipes || [])) ok(recipeIds.has(rid), `${id} recipe ref resolves: ${rid}`);
  for (const aid of (b.unlocks.animals || [])) ok(animalIds.has(aid), `${id} animal ref resolves: ${aid}`);
  for (const sid of (b.unlocks.skills || [])) ok(skillIds.has(sid), `${id} skill ref resolves: ${sid}`);
}

console.log('locations.json');
noDup(locations, 'locations');
ok(locations.length >= 12, `pool grew 8 -> ${locations.length} (dynamic)`);
const GEN_KEYS = ['creeks', 'groveBlobs', 'groveSize', 'lootMult', 'meadowSize', 'ruinMaxDist',
  'startReveal', 'stockMult', 'thickets', 'trailLines', 'wetlands'];
for (const id of ['burn_scar', 'swamp_hummock', 'mill_town', 'old_campground']) {
  const l = locations.find(x => x.id === id);
  ok(!!l, id + ' loads');
  ok(l.name && l.description && l.hazard && l.tagline, `${id} has full shape`);
  ok(['countryside', 'city'].includes(l.spawnType), `${id} spawnType valid: ${l.spawnType}`);
  for (const k of GEN_KEYS) {
    ok(typeof l.gen[k] === 'number', `${id}.gen.${k} is a number`);
  }
  ok(l.gen.lootMult >= 0.5 && l.gen.lootMult <= 2.0, `${id} lootMult sane: ${l.gen.lootMult}`);
  ok(l.gen.stockMult >= 0.5 && l.gen.stockMult <= 1.5, `${id} stockMult sane: ${l.gen.stockMult}`);
  ok(Number.isInteger(l.startMod.waterClean) && l.startMod.waterClean >= 0, `${id} startMod.waterClean sane`);
}

console.log(`\nALL ${pass} CHECKS PASSED`);
