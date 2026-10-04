// Continuous travel test. Usage: node scripts/test-continuous-travel.js
// Verifies: traveling between nodes enters at the matching edge (not the center),
// preserving column/row, with walkable fallback.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function walkableCell(x, y) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const cell = detail[y] && detail[y][x];
  return !!cell && !Game.cellProps(cell).blocks;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const px0 = Game.map.px, py0 = Game.map.py;

  // --- travel NORTH: enter at south edge, same column ---
  s.mx = 6; s.my = 0; // standing at north rim, column 6
  Game.travelTo(px0, py0 - 1, true);
  ok('north: map moved', Game.map.py === py0 - 1);
  ok('north: entered at south edge (my=8)', s.my === 8);
  ok('north: column preserved (mx=6)', s.mx === 6);
  ok('north: entry cell walkable', walkableCell(s.mx, s.my));

  // --- travel SOUTH back: enter at north edge ---
  s.mx = 2; // change column mid-node to verify it carries over
  Game.travelTo(px0, py0, true);
  ok('south: map moved back', Game.map.py === py0);
  ok('south: entered at north edge (my=0)', s.my === 0);
  ok('south: column preserved (mx=2)', s.mx === 2);
  ok('south: entry cell walkable', walkableCell(s.mx, s.my));

  // --- travel EAST: enter at west edge, same row ---
  s.my = 5;
  Game.reveal(px0 + 1, py0);
  Game.travelTo(px0 + 1, py0, true);
  ok('east: map moved', Game.map.px === px0 + 1);
  ok('east: entered at west edge (mx=0)', s.mx === 0);
  ok('east: row preserved (my=5)', s.my === 5);
  ok('east: entry cell walkable', walkableCell(s.mx, s.my));

  // --- travel WEST back: enter at east edge ---
  Game.travelTo(px0, py0, true);
  ok('west: map moved back', Game.map.px === px0);
  ok('west: entered at east edge (mx=8)', s.mx === 8);
  ok('west: row preserved (my=5)', s.my === 5);
  ok('west: entry cell walkable', walkableCell(s.mx, s.my));

  // --- diagonal NE: enter at SW corner (or nearest walkable if corner blocked) ---
  s.mx = 4; s.my = 4;
  Game.reveal(px0 + 1, py0 - 1);
  Game.travelTo(px0 + 1, py0 - 1, true);
  ok('diag NE: entered near SW corner (mx<=2, my>=6)', s.mx <= 2 && s.my >= 6);
  ok('diag: entry cell walkable', walkableCell(s.mx, s.my));

  // --- findWalkableEntry always returns a walkable cell ---
  const entry = Game.findWalkableEntry(Game.map.px, Game.map.py, 0, 0);
  ok('findWalkableEntry returns walkable cell', walkableCell(entry.x, entry.y));

  // --- multi-tile jump still enters at the correct edge ---
  Game.reveal(px0 + 1, py0 + 1);
  Game.reveal(px0 + 1, py0 + 2);
  Game.travelTo(px0 + 1, py0 + 2, true); // 3 tiles south (d=3, diagonal-ish)
  ok('multi-tile: entry cell walkable', walkableCell(s.mx, s.my));
  ok('multi-tile: entered near north edge (my<=2)', s.my <= 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
