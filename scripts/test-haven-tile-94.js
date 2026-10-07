#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07): haven tile identity after the 9x9 migration.
// BUG: commit fe374bf ("World map 7x7 -> 9x9 ... haven at 4,4") moved the player
// spawn to (4,4) and the map UI's haven icon to (4,4), but left the actual
// haven TILE at (3,3). The player woke on a wild tile wearing haven's costume:
//   - atCamp() false -> sortBag refused ("do it at camp") — the camp ritual dead on day 1
//   - pantryInReach() false -> villageMeal said "You camp wild tonight" at spawn
//   - villagerTurn() simulated villagers on genDetail(3,3) while the player stood at (4,4)
//   - a dozen `v.px ?? 3` stragglers disagreed with the `?? 4` majority
// BEFORE (pre-fix evidence): tileAt(4,4).type !== 'haven', atCamp() === false
// at spawn (fresh newGame: map.px/py = 4,4, village.px/py unset).
// AFTER (this test, post-fix): all assertions below pass.
// Run: node scripts/test-haven-tile-94.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(parseInt(process.env.SEED || '94', 10));
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  console.log('haven tile identity (9x9 migration repair):');

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;

  // 1. the haven tile IS at 4,4 where the player spawns
  check('tile (4,4) is the haven tile', Game.tileAt(4, 4).type === 'haven', 'type=' + Game.tileAt(4, 4).type);
  check('player spawns on the haven tile', Game.map.px === 4 && Game.map.py === 4);
  check('playerTile() is haven at spawn', Game.playerTile().type === 'haven');

  // 2. camp identity: the ritual works where you wake up
  check('atCamp() true at spawn', Game.atCamp() === true);
  check('pantryInReach() true at spawn', Game.pantryInReach() === true);
  check('playerAtHaven() true at spawn', Game.playerAtHaven() === true);

  // 3. the dawn meal serves at spawn (was: "You camp wild tonight")
  says.length = 0;
  s.kcal = 500; // make room so the meal has somewhere to go
  Game.villageMeal();
  const mealServed = says.join(' ').includes('Village meal') || (s.kcal || 0) > 500;
  const campWildMsg = says.join(' ').includes('camp wild tonight');
  check('villageMeal serves at spawn (no "camp wild" refusal)', mealServed && !campWildMsg, says.join(' ').slice(0, 120));

  // 4. sortBag (the camp ritual) is not refused at spawn
  let tries = 0;
  outer:
  for (const [tx, ty] of [[5, 4], [4, 5], [3, 4], [4, 3], [5, 5]]) {
    Game.map.px = tx; Game.map.py = ty;
    const d = Game.genDetail(tx, ty);
    for (let y = 1; y < 8 && tries < 10; y++) for (let x = 1; x < 8 && tries < 10; x++) {
      const c = d[y] && d[y][x];
      if (!['grass', 'plant', 'bush', 'tree'].includes(c)) continue;
      const li0 = (s.inventory || []).findIndex(it => it.lump && Object.keys(it.lump).length);
      if (li0 >= 0) break outer;
      s.mx = x; s.my = y;
      try { Game.doAction('forage', { cx: x, cy: y }); } catch (e) {}
      tries++;
    }
    const li1 = (s.inventory || []).findIndex(it => it.lump && Object.keys(it.lump).length);
    if (li1 >= 0) break;
  }
  Game.map.px = 4; Game.map.py = 4; // walk home
  const li = (s.inventory || []).findIndex(it => it.lump && Object.keys(it.lump).length);
  check('foraged a lump to sort', li >= 0);
  if (li >= 0) {
    says.length = 0;
    Game.sortBag(null, li, s.inventory);
    const refused = says.join(' ').includes('flat surface and good light');
    check('sortBag not refused at haven ("flat surface" gate passes)', !refused, says.join(' ').slice(0, 120));
  }

  // 5. returnToVillage lands on the haven tile
  Game.map.px = 6; Game.map.py = 6;
  Game.returnToVillage();
  check('returnToVillage lands on haven tile', Game.map.px === 4 && Game.map.py === 4 && Game.playerTile().type === 'haven',
    `at (${Game.map.px},${Game.map.py}) type=${Game.playerTile().type}`);

  // 6. breadbasket: genMap plants a grove on a door-adjacent tile most maps
  // (one random door is chosen; skipped only if that door rolled the ruin.
  // measured 21/24 across seeds — assert a generous majority, not certainty)
  const doors = [[3, 4], [5, 4], [4, 3], [4, 5]];
  const savedRandom = Math.random;
  let groveMaps = 0;
  const SEEDS = [];
  for (let sd = 1; sd <= 12; sd++) SEEDS.push(sd * 7919);
  for (const sd of SEEDS) {
    Math.random = mulberry32(sd);
    Game.genMap();
    if (doors.some(([x, y]) => Game.tileAt(x, y).type === 'grove')) groveMaps++;
  }
  Math.random = savedRandom;
  check(`breadbasket grove adjacent to haven in most maps (${groveMaps}/${SEEDS.length})`, groveMaps >= 8,
    `${groveMaps}/${SEEDS.length} maps had an adjacent grove`);

  // 7. no wild tile at (3,3) anymore
  check('(3,3) is not a second haven', Game.tileAt(3, 3).type !== 'haven', 'type=' + Game.tileAt(3, 3).type);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
