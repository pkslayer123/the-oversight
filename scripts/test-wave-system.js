// Wave/threat system test (Steve 2026-10-05)
// Verifies: threat rating calculation, wave unlocks, monster casting, loot caps
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  
  // Setup basic game
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  
  console.log('=== Wave System Tests ===\n');
  
  // Test 1: New player has low threat, wave 1
  let rating = Game.threatRating();
  ok('new player threat < 30', rating < 30, `got ${rating}`);
  ok('new player wave 1', Game.unlockedWave() === 1, `got ${Game.unlockedWave()}`);
  
  // Test 2: All monsters have wave assigned
  const noWave = Game.data.monsters.filter(m => !m.wave);
  ok('all monsters have wave', noWave.length === 0, `missing: ${noWave.map(m => m.id).join(',')}`);
  
  // Test 3: Wave 1 monsters available, wave 2+ not
  ok('hummice (w1) available', Game.monsterWaveAvailable('hummice'));
  ok('hushwolf (w2) NOT available at wave 1', !Game.monsterWaveAvailable('hushwolf'));
  ok('gallowdeer (w4) NOT available at wave 1', !Game.monsterWaveAvailable('gallowdeer'));
  
  // Test 4: Cast monster returns wave-appropriate
  for (let i = 0; i < 10; i++) {
    const id = Game.castMonster();
    const m = Game.data.monsters.find(x => x.id === id);
    ok(`cast ${id} wave <= 1`, (m.wave || 1) <= 1, `wave ${m.wave}`);
  }
  
  // Test 5: Give player a spear (+25 bonus, range 2) -> threat increases
  const s = Game.state.scholar;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Spear', range: 2 } };
  // Mock the item def
  Game.data.items.push({ id: 'fire_hardened_spear', name: 'Spear', weapon: { bonus: 25, range: 2 } });
  rating = Game.threatRating();
  console.log(`\nWith spear: threat = ${rating}`);
  ok('spear increases threat', rating >= 30, `got ${rating}`);
  ok('spear unlocks wave 2', Game.unlockedWave() >= 2, `got ${Game.unlockedWave()}`);
  
  // Test 6: Loot tier capped by wave
  const hummice = Game.data.monsters.find(m => m.id === 'hummice');
  ok('hummice wave 1', hummice.wave === 1);
  ok('hummice loot tier 1', hummice.loot.tier === 1);
  
  const boar = Game.data.monsters.find(m => m.id === 'thornback_boar');
  ok('boar wave 2', boar.wave === 2);
  ok('boar loot tier 2', boar.loot.tier === 2);
  
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
