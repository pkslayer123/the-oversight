// Cache dig-up location rule. Usage: node scripts/test-cache-location.js
// A buried cache is WHERE you buried it: digging up from another node
// must refuse and point at the journal, not hand over the goods.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  Game.log.length = 0;
}
const packKcal = () => (Game.state.scholar.inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);

(async () => {
  await Game.init();
  freshGame();

  // bury at the haven node
  Game.state.scholar.inventory.push({ name: 'Test jerky', kcalEach: 200, units: 3, spoilDay: 99, kg: 0.1 });
  const idx = Game.state.scholar.inventory.findIndex(i => i.name === 'Test jerky');
  const hx = Game.map.px, hy = Game.map.py;
  Game.buryCache('food', idx, 2);
  const c = Game.playerCaches()[0];
  ok('cache recorded at the burial node', c.node.x === hx && c.node.y === hy);

  // walk away (direct placement: this tests digUpCache, not travel)
  Game.map.px = hx + 3; Game.map.py = hy + 3;
  Game.state.scholar.insideHaven = false;
  const before = packKcal();
  said.length = 0;
  Game.digUpCache(c.id);
  ok('remote dig-up gives nothing', packKcal() === before);
  ok('remote dig-up keeps the cache', Game.playerCaches().length === 1);
  ok('remote dig-up is honest about where', said.some(t => /Not here/i.test(t)));

  // walk back: digging up at the node works
  Game.map.px = hx; Game.map.py = hy;
  said.length = 0;
  Game.digUpCache(c.id);
  ok('dig-up at the node returns the goods', packKcal() === before + 400);
  ok('dug cache is gone', Game.playerCaches().length === 0);
  ok('dig-up at the node feels good', said.some(t => /Still yours/.test(t)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
