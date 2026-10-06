// Regression: the village pantry rots overnight (forager loop 2026-10-06).
// Expired pantry stacks must be purged by the dawn sweep (announced), and
// pantryKcal must not count them afterwards. Durable stacks must survive.
// Usage: node scripts/test-pantry-rot.js  (exit 1 on failure)
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
const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  v.pantry.push({ name: 'Fresh-picked berries', kcalEach: 100, units: 10, spoilDay: s.day + 1, safe: true, kg: 0.2 });
  v.pantry.push({ name: 'Control beans', kcalEach: 100, units: 500, spoilDay: 9999, safe: true, kg: 0.2 }); // huge: cannot be eaten out in 3 days
  said.length = 0;
  for (let d = 0; d < 3 && !Game.over && !Game.villageLost; d++) {
    s.kcal = 2400; s.hydration = 100; s.health = 100;
    Game.endDay();
  }
  const names = (v.pantry || []).map(i => i.name);
  check('expired pantry stack purged', !names.includes('Fresh-picked berries'), 'pantry=' + names.slice(0, 8).join(','));
  check('durable control stack survives', names.includes('Control beans'));
  const phantom = (v.pantry || []).some(i => Game.isSpoiled(i));
  check('no expired stacks remain in pantry', !phantom);
  const derived = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  check('pantryKcal re-derived from items', Math.round(v.pantryKcal) === Math.round(derived), `pantryKcal=${Math.round(v.pantryKcal)} derived=${Math.round(derived)}`);
  const announced = said.join(' ').toLowerCase();
  check('spoilage announced in village voice', /threw out spoiled|went bad/i.test(announced), said.join(' ').slice(-160));
  if (failures.length) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
  console.log('ALL PANTRY-ROT TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
