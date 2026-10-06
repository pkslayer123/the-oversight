// Reproduce Highbeam Deer scenario bugs. Usage: node scripts/repro-highbeam.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // Run the headlight scenario
  Game.debugScenario('headlight');

  const s = Game.state.scholar;
  console.log('\n=== SCENARIO STATE ===');
  console.log('player at:', s.mx, s.my, 'node:', Game.map.px, Game.map.py);
  console.log('monster:', JSON.stringify(s.monster));

  // Check villagers
  const vpos = Game.state.village.positions;
  console.log('\nvillager positions:', JSON.stringify(vpos));

  // Check npcNode for each placed villager
  for (const rid of Object.keys(vpos || {})) {
    try {
      const n = Game.npcNode ? Game.npcNode(rid) : 'no npcNode fn';
      console.log(`  ${rid}: node=`, JSON.stringify(n), 'pos=', JSON.stringify(vpos[rid]));
    } catch (e) { console.log(`  ${rid}: npcNode error:`, e.message); }
  }

  // Simulate: walk toward the deer, check if villagers get wiped
  console.log('\n=== WALK TOWARD DEER ===');
  // move player east toward deer at (7,4)
  for (let i = 0; i < 5; i++) {
    s.mx += 1;
    // trigger whatever happens on move (monster turn etc)
    try { Game.monsterTurn(); } catch (e) { console.log('monsterTurn err:', e.message); }
    const m = s.monster;
    console.log(`step ${i+1}: player (${s.mx},${s.my}), monster:`, m ? `(${m.mx},${m.my}) stance=${m.stance} fearTurns=${m.fearTurns}` : 'GONE',
      '| tbfight:', !!Game.tbfight,
      '| villagers:', Object.keys(Game.state.village.positions || {}).length);
    if (!m || Game.tbfight) break;
  }

  // Check threat queue / targeting
  console.log('\n=== TARGETING ===');
  console.log('tbfight:', s.tbfight);
  console.log('threatQueue:', JSON.stringify(s.threatQueue || s.threat_queue || 'none'));

  process.exit(0);
})();
