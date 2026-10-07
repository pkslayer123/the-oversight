// Perception hints tests. Usage: node scripts/test-perceive.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function has(substr) {
  return Game.perceptionHints().some(h => h.toLowerCase().includes(substr.toLowerCase()));
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.monster = null;
  Game.state.scholar.animal = null;
  // determinism: player is NOT observant unless a test says otherwise
  Game.generatedRoster[0].intelligence = { primary: 'steady', secondary: 'practical' };
}
function setCell(kind, cx, cy, mod) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[cy][cx] = kind;
  if (mod) {
    const t = Game.playerTile();
    t.modifiers = t.modifiers || {};
    t.modifiers[cx + ',' + cy] = Object.assign(t.modifiers[cx + ',' + cy] || {}, mod);
  }
  return d;
}
function giveHatchet() {
  Game.state.scholar.inventory.push({ itemId: 'hatchet', name: 'Hatchet', units: 1, kcalEach: 0, kg: 0.8 });
}
function makeObservant() {
  const c = Game.generatedRoster.find(x => x.id === Game.villagerId);
  if (c) c.intelligence = { primary: 'observant', secondary: 'steady' };
}
function putVillagerNextToMe() {
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId);
  v.positions = v.positions || {};
  v.positions[rid] = { mx: 5, my: 4 };
  // ensure villager data exists for displayName/activity
  return rid;
}

(async () => {
await Game.init();

// 1. big tree, no tool → needs axe
freshGame();
setCell('bigtree', 5, 4, { species: 'oak', health: 'healthy' });
ok('tree-no-tool mentions axe', has("need an axe"));
ok('tree-no-tool names species', has("mature oak"));

// 2. big tree, with hatchet → can fell
freshGame();
setCell('bigtree', 5, 4, { species: 'oak', health: 'healthy' });
giveHatchet();
ok('tree-with-axe can fell', has("could fell"));

// 3. big tree, hand saw → branches only
freshGame();
setCell('bigtree', 5, 4, { species: 'hickory', health: 'healthy' });
Game.state.scholar.inventory.push({ itemId: 'hand_saw', name: 'Hand Saw', units: 1, kcalEach: 0, kg: 0.6 });
ok('tree-with-saw branches in reach', has("branches are in reach"));

// 4. person nearby → activity hint
freshGame();
const rid = putVillagerNextToMe();
const hints4 = Game.perceptionHints();
ok('person hint present', hints4.length > 0 && hints4[0].includes(Game.displayName(rid).split(' ')[0]) || has(Game.displayName(rid)));

// 5. monster unknown → knowledge-gated
freshGame();
Game.state.scholar.monster = { id: 'gallowdeer', mx: 5, my: 5 };
const hints5 = Game.perceptionHints();
ok('monster hint present', hints5.length > 0);
ok('unknown monster not named', !hints5.join(' ').toLowerCase().includes('highbeam'));
ok('unknown monster vague', has('something moves'));

// 6. monster known → named
freshGame();
Game.state.scholar.monster = { id: 'gallowdeer', mx: 5, my: 5 };
Game.identifyMonster('gallowdeer');
ok('known monster named', has('Highbeam Deer'));

// 7. priority: danger beats tree
freshGame();
setCell('bigtree', 5, 4, { species: 'oak', health: 'healthy' });
Game.state.scholar.monster = { id: 'gallowdeer', mx: 4, my: 5 };
const hints7 = Game.perceptionHints();
ok('danger first', hints7[0].toLowerCase().includes('something moves') || hints7[0].toLowerCase().includes('close'));

// 8. cap: max 2 for non-observant
freshGame();
setCell('bigtree', 5, 4, { species: 'oak', health: 'healthy' });
putVillagerNextToMe();
Game.state.scholar.monster = { id: 'gallowdeer', mx: 4, my: 5 };
Game.state.scholar.animal = { id: 'cottontail_rabbit', mx: 3, my: 4 };
ok('non-observant capped at 2', Game.perceptionHints().length <= 2);

// 9. observant gets 3
freshGame();
makeObservant();
setCell('bigtree', 5, 4, { species: 'oak', health: 'healthy' });
putVillagerNextToMe();
Game.state.scholar.monster = { id: 'gallowdeer', mx: 4, my: 5 };
Game.state.scholar.animal = { id: 'cottontail_rabbit', mx: 3, my: 4 };
ok('observant gets 3', Game.perceptionHints().length === 3);

// 10. observant tree detail: diseased
freshGame();
makeObservant();
setCell('bigtree', 5, 4, { species: 'pine', health: 'diseased' });
ok('observant sees disease', has('diseased'));

// 11. non-observant doesn't get disease detail
freshGame();
setCell('bigtree', 5, 4, { species: 'pine', health: 'diseased' });
ok('non-observant no disease note', !has('diseased'));

// 12. observant spots monster at distance 2
freshGame();
makeObservant();
Game.state.scholar.monster = { id: 'gallowdeer', mx: 6, my: 4 };
ok('observant sees farther monster', has('something moves') || has('close'));
freshGame();
Game.state.scholar.monster = { id: 'gallowdeer', mx: 6, my: 4 };
ok('non-observant misses far monster', !has('something moves') && !has('close'));

// 13. stash at Haven
freshGame();
Game.map.px = 4; Game.map.py = 4; // Haven (the haven tile; was 3,3 pre-map-rework)
Game.stashState().materials.branch = 12;
Game.stashState().materials.wood = 3;
ok('stash hint lists contents', has('12 branches') && has('3 logs'));

// 14. stash hint not shown away from Haven
freshGame();
Game.map.px = 4; Game.map.py = 3;
Game.stashState().materials.branch = 12;
ok('no stash hint away from haven', !has('village stash'));

// 15. cache on this node
freshGame();
Game.playerCaches().push({ id: 'c1', node: { x: Game.map.px, y: Game.map.py }, found: false });
ok('cache hint on node', has('buried on this ground'));

// 16. robbed cache
freshGame();
Game.playerCaches().push({ id: 'c2', node: { x: Game.map.px, y: Game.map.py }, found: true });
ok('robbed cache hint', has('dug here'));

// 17. murky water
freshGame();
setCell('water', 5, 4, { flow: 'stagnant', clarity: 'murky' });
ok('stagnant water noted', has('stagnant'));

// 18. clear running water → no hint (nothing to say)
freshGame();
setCell('water', 5, 4, { flow: 'running', clarity: 'clear' });
ok('clean water silent', !has('water here'));

// 19. no hints in combat
freshGame();
setCell('bigtree', 5, 4, { species: 'oak', health: 'healthy' });
Game.tbfight = { fighters: [] };
ok('silent in combat', Game.perceptionHints().length === 0);
Game.tbfight = null;

// 20. animal hint
freshGame();
Game.state.scholar.animal = { id: 'cottontail_rabbit', mx: 5, my: 4 };
ok('animal hint', has('rabbit'));

// 21. empty ground → no hints (quiet, not spammy)
freshGame();
ok('empty ground silent', Game.perceptionHints().length === 0);

// 22. syntax: module attaches cleanly
ok('perceptionHints is function', typeof Game.perceptionHints === 'function');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
})();
