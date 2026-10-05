// Care & Explore tests. Usage: node scripts/test-carexplore.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.monster = null;
  Game.state.scholar.animal = null;
  Game.generatedRoster[0].intelligence = { primary: 'steady', secondary: 'practical' };
}

function giveFoodItem(units, kcalEach) {
  Game.state.scholar.inventory.push({ itemId: 'testfood', name: 'Test Berries', units, kcalEach: kcalEach || 50, kg: 0.1 });
}

function getVillager() {
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId);
  v.positions = v.positions || {};
  v.positions[rid] = { mx: 5, my: 4 }; // adjacent
  return rid;
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

(async () => {
await Game.init();

// ============ GIVE FOOD ============
freshGame();
giveFoodItem(10, 50);
let vid = getVillager();
Game.npcNeeds(vid).hunger = 50;

// meal is the default
let r = Game.giveFood(vid, 'meal');
ok('giveFood meal returns ok', r && r.ok);
ok('giveFood meal takes 3 units', r.units === 3);
ok('giveFood reduces hunger', Game.npcNeeds(vid).hunger < 50);
ok('giveFood raises trust', (Game.state.village.trust[vid] || 10) > 10);

// bite to a starving person can sting
freshGame();
giveFoodItem(10, 50);
vid = getVillager();
Game.npcNeeds(vid).hunger = 90;
const trustBefore = Game.state.village.trust[vid] || 10;
// force the sting path by running multiple times isn't deterministic; just verify bite works
r = Game.giveFood(vid, 'bite');
ok('giveFood bite returns ok', r && r.ok);
ok('giveFood bite takes 1 unit', r.units === 1);

// full feeds generously
freshGame();
giveFoodItem(10, 50);
vid = getVillager();
Game.npcNeeds(vid).hunger = 80;
r = Game.giveFood(vid, 'full');
ok('giveFood full returns ok', r && r.ok);
ok('giveFood full clears hunger', Game.npcNeeds(vid).hunger === 0);

// no food = null
freshGame();
vid = getVillager();
r = Game.giveFood(vid, 'meal');
ok('giveFood with no food returns null', r === null);

// options reflect inventory
freshGame();
giveFoodItem(2, 50);
const opts = Game.giveFoodOptions();
ok('giveFoodOptions has bite', opts.some(o => o.id === 'bite'));
ok('giveFoodOptions meal limited by inventory', opts.find(o => o.id === 'meal').units === 2);

// private gift = deeper trust (no witnesses)
freshGame();
giveFoodItem(10, 50);
vid = getVillager();
// ensure no other villagers nearby (positions only has our target adjacent)
Game.state.village.positions = {};
Game.state.village.positions[vid] = { mx: 5, my: 4 };
Game.state.village.trust[vid] = 10;
r = Game.giveFood(vid, 'meal');
ok('private giveFood not public', r.public === false);
ok('private giveFood trust bonus', (Game.state.village.trust[vid] || 0) > 10);

// ============ COMFORT ============
freshGame();
vid = getVillager();
// force mood to scared via needs
Game.npcNeeds(vid).fear = 80;
const mood = Game.npcMood(vid);
ok('can set up scared mood (or grieving/hungry)', ['scared','grieving','hungry'].includes(mood));

if (mood === 'scared' || mood === 'grieving' || mood === 'hungry') {
  const fearBefore = Game.npcNeeds(vid).fear;
  r = Game.comfort(vid, 'silent');
  ok('comfort silent returns ok', r && r.ok);
  ok('comfort silent reduces fear', Game.npcNeeds(vid).fear <= fearBefore);

  // space approach
  Game.npcNeeds(vid).fear = 80;
  r = Game.comfort(vid, 'space');
  ok('comfort space returns ok', r && r.ok);
  ok('comfort space raises trust', (Game.state.village.trust[vid] || 10) > 10);

  // options exist
  const copts = Game.comfortOptions(vid);
  ok('comfortOptions has 5 approaches', copts.length === 5);
  ok('comfortOptions has silent', copts.some(o => o.id === 'silent'));
  ok('comfortOptions has space', copts.some(o => o.id === 'space'));
}

// comfort with no need = null
freshGame();
vid = getVillager();
Game.npcNeeds(vid).fear = 0;
Game.npcNeeds(vid).hunger = 0;
// mood might still be something; just verify the gate exists
const m2 = Game.npcMood(vid);
if (m2 !== 'scared' && m2 !== 'grieving' && m2 !== 'hungry') {
  r = Game.comfort(vid, 'silent');
  ok('comfort with no need returns null', r === null);
}

// ============ EXAMINE ============
freshGame();
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;

// examine a tree (adjacent)
setCell('tree', 5, 4, { species: 'oak', health: 'healthy' });
r = Game.examineCell(5, 4);
ok('examineCell tree returns ok', r && r.ok);
ok('examineCell tree cell type', r.cell === 'tree');
ok('examineCell records depth', (Game.state.codex.examined['3,3,5,4'] || 0) >= 1);

// examine too far = null
r = Game.examineCell(0, 0);
ok('examineCell too far returns null', r === null);

// examine water
setCell('water', 4, 5, { flow: 'running', clarity: 'clear' });
r = Game.examineCell(4, 5);
ok('examineCell water returns ok', r && r.ok);

// examine rubble
setCell('rubble', 3, 4);
r = Game.examineCell(3, 4);
ok('examineCell rubble returns ok', r && r.ok);

// examine dirt (may find features)
setCell('dirt', 5, 5);
r = Game.examineCell(5, 5);
ok('examineCell dirt returns ok', r && r.ok);

// tileFeature is deterministic
const f1 = Game.tileFeature(3, 3, 5, 5, 'dirt');
const f2 = Game.tileFeature(3, 3, 5, 5, 'dirt');
ok('tileFeature deterministic', f1 === f2);

// examine feeds knowledge encounters (track_read from trees)
freshGame();
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
setCell('tree', 5, 4, { species: 'oak', health: 'healthy' });
Game.examineCell(5, 4);
const enc = (Game.state.codex.encounters || {})['track_read'] || 0;
ok('examine feeds track_read encounters', enc >= 1);

// examine costs ticks
freshGame();
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
setCell('tree', 5, 4, { species: 'oak', health: 'healthy' });
const ticksBefore = Game.state.scholar.dayTicks || 0;
Game.examineCell(5, 4);
ok('examine costs ticks', (Game.state.scholar.dayTicks || 0) > ticksBefore);

// examine tent
freshGame();
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
const d = Game.genDetail(Game.map.px, Game.map.py);
d[4][5] = 'tent';
const t = Game.playerTile();
t.secrets = t.secrets || {};
t.secrets['5,4'] = { known: false, condition: 'good' };
r = Game.examineCell(5, 4);
ok('examineCell tent returns ok', r && r.ok);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
