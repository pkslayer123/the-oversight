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
  
  // Test 3: Wave gating — wave-2 monsters are locked until the gate opens.
  // (2026-10-08: the old availability helper is gone — removed as dead
  // code, zero game callers. The live gate is unlockedWave(); availability
  // = data wave <= it. Old assertions here named hushwolf/gallowdeer as
  // w2/w4 — both are wave 1 now — and cited a retired boar id. Assert
  // current data instead.)
  const w1ids = Game.data.monsters.filter(m => (m.wave || 1) === 1).map(m => m.id);
  const w2ids = Game.data.monsters.filter(m => (m.wave || 1) === 2).map(m => m.id);
  ok('hummice is wave 1', w1ids.includes('hummice'));
  ok('hushwolf is wave 1 (animal shock)', w1ids.includes('hushwolf'));
  ok('gallowdeer is wave 1 (the 160 HP benchmark)', w1ids.includes('gallowdeer'));
  ok('wave-2 pool is non-empty', w2ids.length > 0, `got ${w2ids.length}`);
  ok('wave 1: no wave-2 monster passes the gate',
    w2ids.every(id => (Game.data.monsters.find(m => m.id === id).wave || 1) > Game.unlockedWave()));
  
  // Test 4: Cast monster returns wave-appropriate
  for (let i = 0; i < 10; i++) {
    const cast = Game.castMonster();
    const id = cast.id || cast;
    const m = Game.data.monsters.find(x => x.id === id);
    ok(`cast ${id} wave <= 1`, (m.wave || 1) <= 1, `wave ${m.wave}`);
  }
  
  // Test 5: Day-based gates (Steve 2026-10-05 revised)
  // Wave 2 requires day 8+ AND 4 wave-1 kills (not gear)
  const s = Game.state.scholar;
  s.day = 10;
  Game.state.waveKills = {1: 5};
  ok('day 10 + 5 kills unlocks wave 2', Game.unlockedWave() >= 2, `got ${Game.unlockedWave()}`);
  // Without kills, still wave 1 (gate requires kills)
  Game.state.waveKills = {1: 2};
  ok('day 10 but only 2 kills = wave 1', Game.unlockedWave() === 1, `got ${Game.unlockedWave()}`);
  
  // Test 6: Loot tier capped by wave
  const hummice = Game.data.monsters.find(m => m.id === 'hummice');
  ok('hummice wave 1', hummice.wave === 1);
  ok('hummice loot tier 1', hummice.loot.tier === 1);

  // (2026-10-08: the retired boar id is gone — assert live wave-2
  // monsters instead.)
  const drone = Game.data.monsters.find(m => m.id === 'review_drone');
  ok('review_drone wave 2', drone.wave === 2);
  ok('review_drone loot tier 2', drone.loot.tier === 2);
  const mimic = Game.data.monsters.find(m => m.id === 'voice_mimic_radio');
  ok('voice_mimic_radio wave 2, loot tier 2-3', mimic.wave === 2 && mimic.loot.tier >= 2 && mimic.loot.tier <= 3);
  // Apex tiers are earned on their own terms (Steve 2026-10-07), not
  // "one apex per wave": both apexes carry tier 4 at low chance.
  const apexes = Game.data.monsters.filter(m => m.apex);
  ok('apexes carry tier 4', apexes.length > 0 && apexes.every(m => m.loot.tier === 4),
    `got ${apexes.map(m => m.id + ':' + m.loot.tier).join(',')}`);
  
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
