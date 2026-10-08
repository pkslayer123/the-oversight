#!/usr/bin/env node
// TEST: Knowledge grant engine (Steve 2026-10-07)
// Verifies Game.grantKnowledge works for each domain:
// - Returns true on new grant, false on repeat/downgrade
// - Records learnedFrom/learnedDay/via metadata consistently
// - Never downgrades levels

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Minimal Game harness - we only need grantKnowledge + its dependencies
// Load the real game.js in a sandbox with stubbed dependencies
const gameSrc = fs.readFileSync(
  process.env.GAMEJS || path.join(ROOT, 'src/js/game.js'),
  'utf8'
);

// Extract just the Game object methods we need by evaluating with stubs
const sandbox = {
  console: console,
  Math: Math,
  JSON: JSON,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  RegExp: RegExp,
  Scattering: {},
};

// Stub out DOM/window references
sandbox.window = sandbox;
sandbox.document = { getElementById: () => null };
sandbox.localStorage = { getItem: () => null, setItem: () => {} };

const vm = require('vm');
const ctx = vm.createContext(sandbox);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Knowledge grant engine test:');

// We can't easily instantiate the full Game, so we test the engine logic
// by extracting the grantKnowledge method and its helpers, then binding
// them to a mock game object.

// Parse out the methods we need
const methodsToExtract = [
  'grantKnowledge',
  '_grantPlant', '_grantRecipe', '_grantAnimal',
  '_grantTechnique', '_grantTree', '_grantMonster',
  'learnSkill', 'identifyPlant',
  'ensureMonsterEntry',
];

const mockGame = {
  state: {
    scholar: { day: 5 },
    codex: { plants: {}, animals: {}, recipes: {}, techniques: {}, skills: {}, trees: {}, monsters: {} },
  },
  data: {
    plants: [{ id: 'dandelion', name: 'Dandelion', knowledgeLevels: { '1': 'Yellow flower.', '2': 'Leaves edible.' } }],
    animals: [{ id: 'rabbit', name: 'Rabbit' }],
    recipes: [{ id: 'stew', name: 'Stew', knowledgeLevels: { '1': 'Basic.', '3': 'Advanced.' } }],
    knowledge: [{ id: 'fire_rain', name: 'Fire in Rain', levels: { '1': 'L1 text', '2': 'L2 text' } }],
  },
  said: [],
  audioEvents: [],
  say(msg) { this.said.push(msg); },
  audioEvent(name, data) { this.audioEvents.push({ name, data }); },
  plantKnown(pid) { return !!(this.state.codex.plants || {})[pid]; },
  skillKnown(id, lvl) { return ((this.state.codex.skills || {})[id] || {}).level >= (lvl || 1); },
  refreshItemNames() {},
  integrate() {},
  drama() {},
  checkKnowledgeAbilitySynergy() {},
  map: { px: 4, py: 4 },
};

// Extract method bodies from game source and attach to mock
// This is fragile but works for testing the grant logic in isolation
for (const mname of methodsToExtract) {
  // Find "    mname(" or "    mname (" in the source
  const pattern = new RegExp(`    ${mname}\\([^)]*\\) \\{`, 'g');
  const match = pattern.exec(gameSrc);
  if (!match) {
    console.log(`  SKIP ${mname} — not found in source`);
    continue;
  }
  // Find matching closing brace by counting
  let depth = 0, start = match.index + match[0].length - 1; // at the {
  let end = start;
  for (let i = start; i < gameSrc.length; i++) {
    if (gameSrc[i] === '{') depth++;
    if (gameSrc[i] === '}') depth--;
    if (depth === 0) { end = i + 1; break; }
  }
  const body = gameSrc.substring(match.index, end);
  // Convert "    mname(args) {" to "function (args) {"
  const fnBody = body.replace(new RegExp(`^    ${mname}`), 'function');
  try {
    const fn = vm.runInContext(`(${fnBody})`, ctx);
    mockGame[mname] = fn.bind(mockGame);
  } catch (e) {
    console.log(`  SKIP ${mname} — parse error: ${e.message}`);
  }
}

// --- Tests ---

// 1. Plant grant (L1 via identifyPlant path is complex; test L1 new plant via _grantPlant)
// Note: _grantPlant delegates L1 to identifyPlant which needs more stubs.
// Test the metadata path for level-ups instead.

check('grantKnowledge exists', typeof mockGame.grantKnowledge === 'function');
check('_grantRecipe exists', typeof mockGame._grantRecipe === 'function');
check('_grantAnimal exists', typeof mockGame._grantAnimal === 'function');
check('_grantTechnique exists', typeof mockGame._grantTechnique === 'function');
check('_grantTree exists', typeof mockGame._grantTree === 'function');
check('_grantMonster exists', typeof mockGame._grantMonster === 'function');

// Recipe: new grant
mockGame.said = []; mockGame.audioEvents = [];
const r1 = mockGame.grantKnowledge('recipe', 'stew', 3, { type: 'taught', by: 'Mara' });
check('recipe grant returns true', r1 === true);
check('recipe recorded at level 3', mockGame.state.codex.recipes.stew.level === 3);
check('recipe metadata: learnedFrom', mockGame.state.codex.recipes.stew.learnedFrom === 'Mara');
check('recipe metadata: learnedDay', mockGame.state.codex.recipes.stew.learnedDay === 5);
check('recipe metadata: via', mockGame.state.codex.recipes.stew.via === 'taught');
check('recipe fires knowledgeReveal', mockGame.audioEvents.some(e => e.name === 'knowledgeReveal' && e.data.kind === 'recipe'));

// Recipe: repeat (no downgrade)
const r2 = mockGame.grantKnowledge('recipe', 'stew', 3, { type: 'taught', by: 'Mara' });
check('recipe repeat returns false', r2 === false);
const r3 = mockGame.grantKnowledge('recipe', 'stew', 1, { type: 'taught', by: 'Mara' });
check('recipe downgrade returns false', r3 === false);
check('recipe level unchanged after downgrade attempt', mockGame.state.codex.recipes.stew.level === 3);

// Animal: new grant
mockGame.said = []; mockGame.audioEvents = [];
const a1 = mockGame.grantKnowledge('animal', 'rabbit', 2, { type: 'observed' });
check('animal grant returns true', a1 === true);
check('animal recorded at level 2', mockGame.state.codex.animals.rabbit.level === 2);
check('animal metadata: via', mockGame.state.codex.animals.rabbit.via === 'observed');
check('animal fires knowledgeReveal', mockGame.audioEvents.some(e => e.name === 'knowledgeReveal' && e.data.kind === 'animal'));

// Animal: no downgrade
const a2 = mockGame.grantKnowledge('animal', 'rabbit', 1, { type: 'observed' });
check('animal downgrade returns false', a2 === false);

// Technique: new grant (binary)
mockGame.said = []; mockGame.audioEvents = [];
const t1 = mockGame.grantKnowledge('technique', 'steam_veil', 1, { type: 'taught', by: 'Elder' });
check('technique grant returns true', t1 === true);
check('technique metadata: learnedFrom', mockGame.state.codex.techniques.steam_veil.learnedFrom === 'Elder');
const t2 = mockGame.grantKnowledge('technique', 'steam_veil', 1, { type: 'taught', by: 'Elder' });
check('technique repeat returns false', t2 === false);

// Tree: new grant
const tr1 = mockGame.grantKnowledge('tree', 'oak', 1, { type: 'observed' });
check('tree grant returns true', tr1 === true);
check('tree recorded', mockGame.state.codex.trees.oak.level === 1);

// Monster: new grant
const m1 = mockGame.grantKnowledge('monster', 'gallowdeer', 1, { type: 'observed' });
check('monster grant returns true', m1 === true);
check('monster stage set', mockGame.state.codex.monsters.gallowdeer.stage === 'encountered');

// Monster: stage progression
const m2 = mockGame.grantKnowledge('monster', 'gallowdeer', 2, { type: 'observed' });
check('monster stage progression returns true', m2 === true);
check('monster stage advanced', mockGame.state.codex.monsters.gallowdeer.stage === 'observed');

// Monster: no regression
const m3 = mockGame.grantKnowledge('monster', 'gallowdeer', 1, { type: 'observed' });
check('monster stage regression returns false', m3 === false);

// Unknown domain
const u1 = mockGame.grantKnowledge('frobnicator', 'x', 1, {});
check('unknown domain returns false', u1 === false);

// Skill delegation (learnSkill already tested elsewhere, just verify routing)
if (mockGame.learnSkill) {
  mockGame.said = [];
  const s1 = mockGame.grantKnowledge('skill', 'fire_rain', 2, { type: 'background' });
  check('skill grant routes to learnSkill', s1 === true);
  check('skill recorded at level 2', mockGame.state.codex.skills.fire_rain.level === 2);
  check('skill metadata: via', mockGame.state.codex.skills.fire_rain.via === 'background');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
