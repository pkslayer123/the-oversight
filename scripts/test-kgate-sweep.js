// Knowledge-gating leak sweep (Steve 2026-10-06): "If you don't know, it doesn't show."
// Audits ALL monster/animal/plant/item surfaces for knowledge leaks.
// Leak classes:
//   A. True-name words in unknown-facing descriptors (data-level)
//   B. Missing unknown descriptors (falls back to 'something' — safe but content gap)
//   C. Runtime surfaces showing true names pre-knowledge
// Usage: node scripts/test-kgate-sweep.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const STOP = new Set(['white', 'tailed', 'common', 'virginia', 'eastern', 'american', 'gray', 'grey', 'wild', 'the', 'a', 'an', 'of', 'in']);

function nameWords(name) {
  return name.toLowerCase().replace(/-/g, ' ').split(' ')
    .filter(w => w.length > 4 && !STOP.has(w));
}

function checkDescriptorLeak(def, descField, label) {
  const desc = (def[descField] || '').toLowerCase();
  for (const w of nameWords(def.name)) {
    if (desc.includes(w)) return `${def.id}:${w}`;
  }
  return null;
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  Game.log = [];
  return s;
}

(async () => {
  await Game.init();

  // --- A. Animal unknown descriptors: no true-name leaks ---
  {
    let leak = null;
    for (const a of Game.data.animals) {
      leak = checkDescriptorLeak(a, 'unknown', 'animal');
      if (leak) break;
    }
    ok('A1: no animal unknown-descriptor name leaks', !leak, leak || '');
  }

  // --- A. Monster unknown descriptors: no true-name leaks ---
  {
    let leak = null;
    for (const m of Game.data.monsters) {
      leak = checkDescriptorLeak(m, 'unknown', 'monster');
      if (leak) break;
    }
    ok('A2: no monster unknown-descriptor name leaks', !leak, leak || '');
  }

  // --- A. Plant descriptions (unknown-facing): no true-name leaks ---
  {
    let leak = null;
    for (const p of Game.data.plants) {
      leak = checkDescriptorLeak(p, 'description', 'plant');
      if (leak) break;
    }
    ok('A3: no plant description name leaks', !leak, leak || '');
  }

  // --- B. All monsters have unknown descriptors ---
  {
    const missing = Game.data.monsters.filter(m => !m.unknown).map(m => m.id);
    ok('B1: all monsters have unknown descriptors', missing.length === 0, missing.join(','));
  }

  // --- B. All animals have unknown descriptors ---
  {
    const missing = Game.data.animals.filter(a => !a.unknown).map(a => a.id);
    ok('B2: all animals have unknown descriptors', missing.length === 0, missing.join(','));
  }

  // --- C. Runtime: encDescribeAnimal gates pre-knowledge ---
  {
    const s = freshGame();
    const deer = Game.data.animals.find(a => a.id === 'white_tailed_deer');
    // ensure no prior knowledge
    Game.state.codex.animalEncounters = {};
    const desc = Game.encDescribeAnimal(deer);
    ok('C1: animal gated pre-knowledge', desc === deer.unknown, `got: ${desc}`);
    ok('C2: animal descriptor has no "deer"', !/deer/i.test(desc));
  }

  // --- C. Runtime: encDescribeMonster gates pre-knowledge ---
  {
    const s = freshGame();
    const m = Game.data.monsters[0];
    const desc = Game.encDescribeMonster(m);
    const nameLeak = nameWords(m.name).some(w => desc.toLowerCase().includes(w));
    ok('C3: monster gated pre-knowledge (no name leak)', !nameLeak, `monster ${m.id}: ${desc}`);
  }

  // --- C. Runtime: monsterNoun gates pre-knowledge ---
  {
    const s = freshGame();
    const m = Game.data.monsters.find(x => x.id === 'highbeam_deer') || Game.data.monsters[0];
    const noun = Game.monsterNoun(m.id);
    const nameLeak = nameWords(m.name).some(w => noun.toLowerCase().includes(w));
    ok('C4: monsterNoun gated pre-knowledge', !nameLeak, `monster ${m.id}: ${noun}`);
  }

  // --- C. Runtime: codex kcal gating ---
  {
    const s = freshGame();
    const entries = Game.codexEntries();
    // fresh game: no plants identified, so entries should be empty OR all kcal null
    const leaked = entries.filter(e => e.kcal !== null && !e.prepKnown);
    ok('C5: codex kcal gated on prepKnown', leaked.length === 0, leaked.map(e => e.pid).join(','));
  }

  // --- C. Runtime: foraged plant items don't show true names pre-knowledge ---
  {
    const s = freshGame();
    // Simulate what a foraged item looks like: check plantKnown gating in item naming
    const p = Game.data.plants[0];
    const known = Game.plantKnown(p.id);
    ok('C6: fresh game has no plant knowledge', !known, p.id);
    // The item name should be the description, not the true name
    const itemName = known ? p.name : (p.description || 'a plant');
    const nameLeak = nameWords(p.name).some(w => itemName.toLowerCase().includes(w));
    ok('C7: foraged item name gated', !nameLeak, `${p.id}: ${itemName}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
