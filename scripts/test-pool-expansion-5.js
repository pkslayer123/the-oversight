#!/usr/bin/env node
/* Pool expansion 5 tests (Steve 2026-10-06):
   locations 12->20, recipes 14->22, animals 22->26.
   Asserts minimum counts, id uniqueness, new-entry presence, and field sanity. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DATA = path.join(__dirname, '..', 'src', 'data');

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  FAIL: ' + msg); } };
const load = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const NEW_LOCS = ['cypress_slough', 'beaver_pond', 'pecan_grove', 'hay_field', 'junkyard_edge', 'grain_silo', 'lookout_tower', 'cedar_thicket'];
const NEW_RECIPES = ['minnow_trap', 'rabbit_stick', 'pit_trap', 'frog_gig', 'lean_to', 'fire_plow', 'stone_boiler', 'squirrel_pole'];
const NEW_ANIMALS = ['nine_banded_armadillo', 'american_crow', 'bluegill', 'gray_rat_snake'];
const GEN_KEYS = ['creeks', 'groveBlobs', 'groveSize', 'lootMult', 'meadowSize', 'ruinMaxDist', 'startReveal', 'stockMult', 'thickets', 'trailLines', 'wetlands'];
const MAT_IDS = ['wood', 'branch', 'stone', 'fiber', 'stick', 'vine', 'bait'];

// --- locations ---
const locs = load('locations.json');
console.log(`locations: ${locs.length}`);
ok(locs.length >= 20, `locations >= 20 (got ${locs.length})`);
const locIds = new Set(locs.map(l => l.id));
ok(locIds.size === locs.length, 'location ids unique');
NEW_LOCS.forEach(id => ok(locIds.has(id), `new location present: ${id}`));
locs.forEach(l => {
  GEN_KEYS.forEach(k => ok(typeof (l.gen || {})[k] === 'number', `location ${l.id}: gen.${k} is number`));
  ok(['countryside', 'city'].includes(l.spawnType), `location ${l.id}: spawnType in enum`);
  ok(typeof l.description === 'string' && l.description.length > 40, `location ${l.id}: description present`);
  ok(typeof l.tagline === 'string' && l.tagline.length > 0, `location ${l.id}: tagline present`);
  ok(typeof (l.startMod || {}).waterClean === 'number', `location ${l.id}: startMod.waterClean is number`);
});
ok(locs.filter(l => l.spawnType === 'city').length >= 2, 'at least 2 city spawn locations');

// --- recipes ---
const recipes = load('recipes.json');
const animals = load('animals.json');
console.log(`recipes: ${recipes.length}, animals: ${animals.length}`);
ok(recipes.length >= 22, `recipes >= 22 (got ${recipes.length})`);
const recIds = new Set(recipes.map(r => r.id));
ok(recIds.size === recipes.length, 'recipe ids unique');
NEW_RECIPES.forEach(id => ok(recIds.has(id), `new recipe present: ${id}`));
const animalIds = new Set(animals.map(a => a.id));
recipes.forEach(r => {
  const mats = Object.keys(r.materials || {});
  ok(mats.length > 0, `recipe ${r.id}: has materials`);
  mats.forEach(m => ok(typeof m === 'string' && m.length > 0, `recipe ${r.id}: material '${m}' is a string`));
  // New recipes must use only material ids the game actually spawns (storage.js MAT_DEFS + bait).
  // NOTE: legacy water_filter uses cloth/charcoal/container, which no code path
  // currently puts into inventory — pre-existing gap, flagged, not changed here.
  if (NEW_RECIPES.includes(r.id)) mats.forEach(m => ok(MAT_IDS.includes(m), `new recipe ${r.id}: material '${m}' is a real material id`));
  (r.catches || []).forEach(c => ok(animalIds.has(c), `recipe ${r.id}: catch '${c}' is a real animal id`));
  ['1', '2', '3'].forEach(k => ok(typeof (r.knowledgeLevels || {})[k] === 'string', `recipe ${r.id}: knowledgeLevels[${k}] present`));
  ok(typeof r.description === 'string' && r.description.length > 20, `recipe ${r.id}: description present`);
});

// --- animals ---
console.log(`animals: ${animals.length}`);
ok(animals.length >= 26, `animals >= 26 (got ${animals.length})`);
ok(animalIds.size === animals.length, 'animal ids unique');
NEW_ANIMALS.forEach(id => ok(animalIds.has(id), `new animal present: ${id}`));
animals.forEach(a => {
  ok(['nocturnal', 'diurnal', 'crepuscular', 'both'].includes(a.activity), `animal ${a.id}: activity in enum`);
  ok(['trivial', 'easy', 'medium', 'hard', 'very_hard', 'dangerous'].includes(a.fleeDifficulty), `animal ${a.id}: fleeDifficulty in enum`);
  ['1', '2', '3', '4'].forEach(k => ok(typeof (a.knowledgeLevels || {})[k] === 'string', `animal ${a.id}: knowledgeLevels[${k}] present`));
  ok(typeof a.calories === 'number' && a.calories > 0, `animal ${a.id}: calories positive`);
  ok(typeof a.huntText === 'string' && a.huntText.length > 20, `animal ${a.id}: huntText present`);
  ok(typeof a.unknown === 'string' && a.unknown.length > 0, `animal ${a.id}: unknown (knowledge-gated label) present`);
});

// --- content gate stays green ---
try {
  execFileSync('node', [path.join(__dirname, 'validate-data.js')], { stdio: 'pipe' });
  console.log('validate-data.js: GREEN');
} catch (e) {
  failures++;
  console.error('  FAIL: validate-data.js exited non-zero:\n' + (e.stdout || '') + (e.stderr || ''));
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\npool-expansion-5: ALL GREEN');
