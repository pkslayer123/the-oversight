#!/usr/bin/env node
/* Test for the content gate: scripts/validate-data.js must exit 0 against
   src/data/schemas.json, and spot-checks must confirm schema<->data conformance
   on the fields that were added during the 2026-10-06 schema refresh.
   Run: node scripts/test-validate-schemas.js */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data');
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra && !cond ? ' :: ' + extra : ''}`);
  if (!cond) failures++;
};

// 1. The gate itself exits 0 and reports OK with zero errors
let out = '';
try {
  out = execFileSync('node', [path.join(__dirname, 'validate-data.js')], { encoding: 'utf8' });
  check('validate-data.js exits 0', true);
} catch (e) {
  check('validate-data.js exits 0', false, (e.stdout || '') + (e.stderr || ''));
}
check('gate reports OK', out.includes('CONTENT GATE: OK'), out.split('\n')[0]);

// 2. Spot-checks: evolved data fields are now schema-legal
const schemas = JSON.parse(fs.readFileSync(path.join(DATA, 'schemas.json'), 'utf8'));
const plants = JSON.parse(fs.readFileSync(path.join(DATA, 'plants.json'), 'utf8'));
const monsters = JSON.parse(fs.readFileSync(path.join(DATA, 'monsters.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(DATA, 'items.json'), 'utf8'));
const animals = JSON.parse(fs.readFileSync(path.join(DATA, 'animals.json'), 'utf8'));
const relics = JSON.parse(fs.readFileSync(path.join(DATA, 'relicEnhancements.json'), 'utf8'));

const dandelion = plants.find(p => p.id === 'dandelion');
check('plant.uses array-of-shape present in schema', Array.isArray(schemas.plant.types.uses));
check('dandelion edibility in enum', schemas.plant.types.edibility.includes(dandelion.edibility));

const glasswing = monsters.find(m => m.id === 'glasswing');
check('monster.encounter/loot/armor/resistances in schema',
  ['encounter', 'loot', 'armor', 'resistances'].every(f => f in schemas.monster.types));
check('glasswing encounter phases is string[]', Array.isArray(glasswing.encounter.phases));

const arrow = items.find(i => i.id === 'arrow');
check("item class 'ammo' in enum", schemas.item.types.class.includes('ammo') && arrow.class === 'ammo');

const rabbit = animals.find(a => a.id === 'cottontail_rabbit') || animals[0];
check('animal butcher/huntText in schema',
  'butcher' in schemas.animal.types && typeof rabbit.butcher === 'object');

check('recipe durable/kg in schema',
  schemas.recipe.types.durable === 'boolean?' && schemas.recipe.types.kg === 'number?');

// 3. The second_skin data fix: offers resolve to a real relic id
const relicIds = new Set(relics.map(r => r.id));
const dangling = [];
items.forEach(it => (it.bondThresholds || []).forEach(bt => (bt.offers || []).forEach(id => {
  if (!relicIds.has(id)) dangling.push(`${it.id} -> ${id}`);
})));
check("no dangling item -> relicEnhancement refs (second_skin fix)", dangling.length === 0, dangling.join(', '));

// 4. grassland allowlist covers the wave-2 monster biome refs
check('grassland in refAllowlist.biome', (schemas.refAllowlist || {}).biome?.includes('grassland'));
const biomeIds = new Set(JSON.parse(fs.readFileSync(path.join(DATA, 'biomes.json'), 'utf8')).map(b => b.id));
const badBiome = [];
monsters.forEach(m => (m.biomes || []).forEach(b => {
  if (!biomeIds.has(b) && !(schemas.refAllowlist.biome || []).includes(b)) badBiome.push(`${m.id} -> ${b}`);
}));
check('all monster biomes resolve (registry or allowlist)', badBiome.length === 0, badBiome.join(', '));

// 5. Negative control: the gate still bites — inject a bad field into a scratch copy
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtest-'));
fs.cpSync(DATA, path.join(tmp, 'src', 'data'), { recursive: true });
fs.cpSync(path.join(__dirname, 'validate-data.js'), path.join(tmp, 'validate-data.js'));
// validate-data.js resolves DATA as <scriptdir>/../src/data; patch the scratch copy's paths
let vsrc = fs.readFileSync(path.join(tmp, 'validate-data.js'), 'utf8');
vsrc = vsrc.replace("path.join(__dirname, '..')", JSON.stringify(tmp));
fs.writeFileSync(path.join(tmp, 'validate-data.js'), vsrc);
const badPlants = JSON.parse(fs.readFileSync(path.join(tmp, 'src', 'data', 'plants.json'), 'utf8'));
badPlants[0].bogusFieldThatShouldFail = 123;
fs.writeFileSync(path.join(tmp, 'src', 'data', 'plants.json'), JSON.stringify(badPlants));
let bit = false, biteOut = '';
try {
  execFileSync('node', [path.join(tmp, 'validate-data.js')], { encoding: 'utf8' });
} catch (e) {
  bit = /unknown field 'bogusFieldThatShouldFail'/.test((e.stdout || '') + (e.stderr || ''));
  biteOut = (e.stdout || '') + (e.stderr || '');
}
check('gate rejects unknown field in scratch copy', bit, biteOut.split('\n').slice(0, 3).join(' | '));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
