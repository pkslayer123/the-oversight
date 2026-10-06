// Forage bug-fix tests. Usage: node scripts/test-forage-bugs.js
// Covers: water bar [object Object], jumbled forage messages, doubled
// identification names, targeted foraging, bush-species harvests,
// 16-tick cost, perception hints for forageables, depletion tracking.
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

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.inventory = []; s.monster = null; s.animal = null;
  s.kcal = 3000;
  Game.generatedRoster[0].intelligence = { primary: 'steady', secondary: 'practical' };
  const t = Game.playerTile();
  t.stock = 10; t.maxStock = 10;
  return t;
}
function setCell(kind, cx, cy) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[cy][cx] = kind;
  return d;
}

(async () => {
  await Game.init();

  // 1. WATER BAR: no [object Object] leak.
  freshGame();
  let st = Game.status();
  ok('waterCleanL is a number', typeof st.waterCleanL === 'number');
  ok('water bar text has no [object Object]', !(`WATER ${st.hydration}% · ${st.waterCleanL}L clean`.includes('[object Object]')));
  // villageAction('water') (dead code path) must still produce bottles, not a bare number
  Game.villageAction('water');
  ok('well fill produces bottle objects', Array.isArray(Game.state.scholar.water) && Game.state.scholar.water.every(b => typeof b === 'object' && b.quality === 'clean'));
  st = Game.status();
  ok('waterCleanL numeric after well fill', typeof st.waterCleanL === 'number' && st.waterCleanL >= 4);

  // 2. FORAGE MESSAGE GRAMMAR: no spliced templates.
  freshGame();
  setCell('plant', 5, 4);
  // force second encounter (newEnc=2) to hit the "looks familiar" template
  const t2 = Game.playerTile();
  const S = globalThis.Scattering;
  // find which plant the tile will give is random; just forage twice via targeted cell
  Game.cellInteract(5, 4); // encounter 1 (or identification)
  const log1 = Game.log.slice(-6).join(' | ');
  ok('no "You take looks familiar" splice', !log1.includes('You take looks familiar'));
  ok('no "like the a " article clash', !log1.includes('like the a ') && !log1.includes('like the an '));
  // forage the same plant cell again if still there, else place another
  setCell('plant', 5, 4); t2.stock = 10;
  Game.state.codex.encounters = Game.state.codex.encounters || {};
  Game.cellInteract(5, 4);
  const log2 = Game.log.slice(-8).join(' | ');
  ok('second-encounter message is grammatical', !log2.includes('You take looks familiar') && !/like the a(n)? /.test(log2));

  // 3. IDENTIFICATION: name appears once.
  freshGame();
  Game.identifyPlant('chickweed', 'observation');
  const idLog = Game.log.slice(-3).join(' | ');
  ok('identified message has no doubled name', !idLog.includes('Chickweed. Chickweed') && !idLog.includes('Chickweed, Chickweed'));
  // the witness line ("...was watching. Now they know Chickweed too.") is a
  // separate beat and legitimately names it again — count only the IDENTIFIED line.
  const idLine = Game.log.slice(-3).find(l => l.includes('IDENTIFIED')) || '';
  ok('identified message names it once', (idLine.match(/Chickweed/g) || []).length === 1);

  // 4. TARGETED FORAGING: the tapped cell depletes, not a random neighbor.
  freshGame();
  setCell('bush', 5, 4); // tapped
  setCell('bush', 3, 4); // neighbor — must NOT deplete
  const t4 = Game.playerTile();
  Game.cellInteract(5, 4);
  const regrow = t4.detailRegrow || {};
  ok('tapped bush cell is tracked depleted', !!regrow['5,4']);
  ok('neighbor bush untouched', !regrow['3,4']);
  const d4 = Game.genDetail(Game.map.px, Game.map.py);
  ok('neighbor bush still a bush', d4[4][3] === 'bush');

  // 5. BUSH SPECIES: an IDENTIFIED bush yields its own fruit, named.
  // (Redesign contract: reveal-to-the-game is not identification. Unknown
  // species lump at camp per the knowledge model — test-forage.js.)
  freshGame();
  setCell('bush', 5, 4);
  const species = Game.revealBush(5, 4); // e.g. blackberry
  Game.identifyPlant(species, 'taught'); // the player learns it (camp ritual, teacher, book...)
  Game.cellInteract(5, 4);
  const got = (Game.state.scholar.inventory.find(i => i.plantId === species));
  ok(`identified ${species} bush yields ${species}`, !!got);

  // 6. TICK COST: 16 ticks per forage press.
  freshGame();
  setCell('plant', 5, 4);
  const before = Game.state.scholar.dayTicks || 0;
  Game.cellInteract(5, 4); // cellInteract adds 1 tick + doAction adds 16
  const spent = (Game.state.scholar.dayTicks || 0) - before;
  ok(`forage costs ~17 ticks (16+1 interact), got ${spent}`, spent >= 15 && spent <= 20);

  // 7. YIELD: engine returns 5-8 units base.
  freshGame();
  const r = S.forage.forage(Game.playerTile(), Game.biome(), Game.data.plants, Game.state.scholar, Game.state.codex, [], null, {});
  ok(`engine yield 5-8 base units, got ${r.units}`, r.units >= 5 && r.units <= 8);

  // 8. PERCEPTION: forageables produce hints; they persist after foraging.
  freshGame();
  setCell('bush', 5, 4);
  const hBefore = Game.perceptionHints();
  ok('bush nearby produces a perception hint', hBefore.length > 0 && hBefore.some(h => /bush|berr/i.test(h)));
  Game.cellInteract(5, 4);
  let hAfter = [];
  try { hAfter = Game.perceptionHints(); } catch (e) { /* caught below */ }
  ok('perceptionHints does not throw after forage', true);
  ok('perception still reports after forage (picked-clean state)', hAfter.length > 0);

  // 9. DEPLETION: plant cell becomes dirt (visible); message says picked clean.
  freshGame();
  setCell('plant', 5, 4);
  Game.cellInteract(5, 4);
  const d9 = Game.genDetail(Game.map.px, Game.map.py);
  ok('foraged plant cell becomes dirt', d9[4][5] === 'dirt');
  ok('packed message says patch picked clean (honest copy)', Game.log.slice(-4).join(' ').includes('picked clean'));

  // 10. PACKED message reports actual haul (redesign format: the sweep message
  // names units, e.g. "8× Hickory Nuts").
  freshGame();
  setCell('plant', 5, 4);
  Game.identifyPlant(Game.cellPlantSpecies(Game.playerTile(), 5, 4, 'plant'), 'taught');
  Game.cellInteract(5, 4);
  const invItem = Game.state.scholar.inventory.find(i => i.plantId);
  const haulLine = Game.log.slice(-6).join(' ');
  ok('packed line matches inventory units', !!invItem && haulLine.includes(`${invItem.units}\u00d7`));

  // 11. REGROW: stock follows the grid. A stripped node recovers in ~3 days —
  // the sweep's "it'll recover in a few days" promise. (Was: detail cells
  // regrew in 3 days but stock crept at +1/day, so regrown grids read
  // "nothing left to take here today" — green lies.)
  freshGame();
  const t11 = Game.playerTile();
  const d11 = Game.genDetail(Game.map.px, Game.map.py);
  t11.maxStock = 40;
  t11.stock = 0; // stripped bare
  t11.foragePressure = 0; t11.foragedToday = false;
  const today = Game.state.scholar.day;
  t11.detailRegrow = { '1,1': { day: today, was: 'plant' }, '2,2': { day: today, was: 'bush' } };
  d11[1][1] = 'dirt'; d11[2][2] = 'bush';
  Game.endDay();
  // 2 regrown cells restore stock 1:1. The +1/day abstract nibble top-up is
  // deliberately SKIPPED while grid-level depletion is outstanding — running
  // both double-counts recovery and refunds villager competition overnight.
  // (Abstract-only nibbles still top up; see test-forage-competition.js.)
  ok('regrown cells restore stock 1:1 (no double recovery)', t11.stock === 2, `stock 0 -> ${t11.stock}`);
  ok('regrow clears the entries', Object.keys(t11.detailRegrow).length === 0);
  ok('regrown plant cell is a plant again', d11[1][1] === 'plant');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
