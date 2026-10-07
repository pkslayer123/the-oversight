#!/usr/bin/env node
// VERIFICATION (Steve 2026-10-07): arrival text data migration.
// Asserts:
// 1. arrivalText.json exists and has all 9 tile types with exact structure
// 2. Text content matches the original hardcoded ARRIVAL (spot-check key strings)
// 3. regionOverrides structure is present and empty (ready for 8 regions)
// 4. game.js loads arrivalText.json in init()
// 5. game.js has arrivalPoolFor helper with region override logic
// 6. No hardcoded ARRIVAL const remains in game.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Arrival text migration verification:');

// 1. JSON structure
const jsonPath = path.join(ROOT, 'src/data/arrivalText.json');
const at = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
check('JSON exists and parses', !!at);

const expectedTiles = ['forest_floor', 'grove', 'meadow', 'thicket', 'wetland', 'creek', 'trail_edge', 'ruin', 'haven'];
check('all 9 tile types present',
  expectedTiles.every(t => at.tiles && at.tiles[t]),
  'missing: ' + expectedTiles.filter(t => !(at.tiles && at.tiles[t])).join(','));

check('each tile has title and texts array',
  expectedTiles.every(t => at.tiles[t] && typeof at.tiles[t].title === 'string' && Array.isArray(at.tiles[t].texts)));

// 2. Spot-check exact text preservation (including special chars)
check('forest_floor has 6 texts', at.tiles.forest_floor.texts.length === 6);
check('haven has 1 text', at.tiles.haven.texts.length === 1);
check('ruin has 0 texts (ruinStory fills)', at.tiles.ruin.texts.length === 0);
check('apostrophe preserved',
  at.tiles.forest_floor.texts[3].includes("can't see"),
  'escaped apostrophe lost');
check('em-dash preserved',
  at.tiles.haven.texts[0].includes('—'),
  'em-dash lost');
check('fairy ring text intact',
  at.tiles.forest_floor.texts[5].includes('fairy ring'),
  'text content changed');

// 3. Region override structure
check('regionOverrides key exists', 'regionOverrides' in at);
check('regionOverrides is empty object ready for regions',
  typeof at.regionOverrides === 'object' && Object.keys(at.regionOverrides).length === 0);

// 4. game.js loads the JSON
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
check('init() loads arrivalText.json', gameSrc.includes("'arrivalText.json'"));
check('arrivalText in destructuring', gameSrc.includes('lifeseeds, arrivalText'));
check('arrivalText in this.data', gameSrc.includes('lifeseeds, arrivalText }') || gameSrc.includes('foreignSpeech, lifeseeds, arrivalText'));

// 5. Helper exists with region logic
check('arrivalPoolFor helper exists', gameSrc.includes('arrivalPoolFor(tileType)'));
check('region override logic present',
  gameSrc.includes('at.regionOverrides') && gameSrc.includes('this.state.region'));

// 6. No hardcoded const remains
const codeLines = gameSrc.split('\n').filter(l => !l.trim().startsWith('//'));
const hasConstArrival = codeLines.some(l => l.includes('const ARRIVAL = {'));
check('no hardcoded const ARRIVAL', !hasConstArrival);
check('no ARRIVAL[ code references',
  !codeLines.some(l => /[^a-zA-Z]ARRIVAL\[/.test(l)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
