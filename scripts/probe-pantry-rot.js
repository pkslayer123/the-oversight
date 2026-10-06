// Probe: does the village PANTRY ever rot? Inject perishable stacks, run
// endDay, and watch whether expired stacks are purged or eaten at full value.
// Usage: node scripts/probe-pantry-rot.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const said = [];
Game.say = function (t) { said.push(String(t)); return t; };
const drain = () => { const m = said.join(' '); said.length = 0; return m; };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  const pan = (label) => console.log(label, 'day=' + s.day,
    'pantry=' + Math.round(Game.pantryKcal()),
    'stacks=' + JSON.stringify((v.pantry || []).map(i => `${i.name}×${i.units}@sp${i.spoilDay}`)));
  // inject: perishable (spoils tomorrow) + durable control
  v.pantry.push({ name: 'Fresh-picked berries', kcalEach: 100, units: 10, spoilDay: s.day + 1, safe: true, kg: 0.2 });
  v.pantry.push({ name: 'Control beans', kcalEach: 100, units: 10, spoilDay: 9999, safe: true, kg: 0.2 });
  pan('before endDay:');
  for (let d = 0; d < 4; d++) {
    s.kcal = 2400; s.hydration = 100; s.health = 100;
    drain(); Game.endDay(); drain();
    pan(`after endDay #${d + 1}:`);
    if (Game.over || Game.villageLost) { console.log('GAME OVER'); break; }
  }
  console.log('\nQ1: were expired pantry stacks purged? (expect: yes with announcement)');
  console.log('Q2: did villagers keep eating expired food at full value?');
  console.log('DONE');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
