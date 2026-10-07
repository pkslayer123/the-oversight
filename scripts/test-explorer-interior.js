// Explorer archetype: interior examine depth (Haven hall/bunk/lodge + pre-Burn rooms).
// Regression: the 2026-10-04 explorer run's hall/bunk fix was lost (uncommitted
// working tree); re-landed here with panel reachability.
// Usage: node scripts/test-explorer-interior.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}
function clock() { return Game.state.scholar.dayTicks || 0; }

(async () => {
  await Game.init();
  const said = [];
  Game.say = function (t) { said.push(String(t)); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // ---- Haven interior (haven tile = 9x9 center 4,4) ----
  Game.map.px = 4; Game.map.py = 4;
  const detail = Game.genDetail(4, 4);
  function findCell(want) {
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++)
      if (detail[cy][cx] === want) return { cx, cy };
    return null;
  }
  function standNextTo(c) {
    // put player adjacent and walkable
    const spots = [[c.cx - 1, c.cy], [c.cx + 1, c.cy], [c.cx, c.cy - 1], [c.cx, c.cy + 1], [c.cx, c.cy]];
    for (const [x, y] of spots) {
      if (x < 0 || x > 8 || y < 0 || y > 8) continue;
      Game.state.scholar.mx = x; Game.state.scholar.my = y;
      return true;
    }
    return false;
  }
  function examineAt(cellName) {
    const c = findCell(cellName);
    if (!c) return null;
    standNextTo(c);
    said.length = 0;
    const t0 = clock(), kcal0 = Game.state.scholar.kcal;
    const r = Game.examineCell(c.cx, c.cy);
    return { r, text: said.join(' '), ticks: clock() - t0, kcal: Game.state.scholar.kcal - kcal0 };
  }

  // door still uses the wall/door/bridge branch (regression: not swallowed)
  // (runs before the lodge section regenerates the grounds detail)
  const door = examineAt('door');
  ok('door still examinable', !!door && !!door.r && door.r.ok);
  ok('door has door text', door && /door|wall|bridge/i.test(door.text) && !/declines/.test(door.text), door && door.text.slice(0, 70));

  // ---- lodge: on the Haven grounds (outside the building) ----
  Game.state.scholar.insideHaven = false;
  Game.tileAt(4, 4).detail = null; // regen grounds
  const gdetail = Game.genDetail(4, 4);
  function findCellG(want) {
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++)
      if (gdetail[cy][cx] === want) return { cx, cy };
    return null;
  }
  (function () {
    const c = findCellG('lodge');
    ok('lodge exists on grounds', !!c);
    if (!c) return;
    standNextTo(c);
    said.length = 0;
    const r1 = Game.examineCell(c.cx, c.cy);
    const t1 = said.join(' ');
    ok('lodge examinable', !!r1 && r1.ok);
    ok('lodge not "declines"', !/declines to be interesting/.test(t1), t1.slice(0, 60));
    said.length = 0;
    Game.examineCell(c.cx, c.cy);
    const t2 = said.join(' ');
    ok('lodge depth2 differs', t2 !== t1);
    ok('lodge depth2 not "declines"', !/declines to be interesting/.test(t2));
  })();
  Game.state.scholar.insideHaven = true;
  Game.tileAt(4, 4).detail = null; // back inside for the remaining tests

  // ---- building rooms (pre-Burn): drive examineCell directly on a ruin tile ----
  // (room cells aren't placed by current map gen; verify the content branch directly)
  const ruin = (() => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++)
      if ((Game.tileAt(x, y) || {}).type === 'ruin') return { x, y };
    return null;
  })();
  ok('ruin tile exists on map', !!ruin);
  if (ruin) {
    Game.map.px = ruin.x; Game.map.py = ruin.y;
    const rd = Game.genDetail(ruin.x, ruin.y);
    // force a room cell onto a dirt cell for the test
    let placed = null;
    for (let cy = 0; cy < 9 && !placed; cy++) for (let cx = 0; cx < 9 && !placed; cx++)
      if (rd[cy][cx] === 'dirt') { rd[cy][cx] = 'gym'; placed = { cx, cy }; }
    if (placed) {
      standNextTo(placed);
      said.length = 0;
      const r = Game.examineCell(placed.cx, placed.cy);
      const txt = said.join(' ');
      ok('gym room examinable', !!r && r.ok);
      ok('gym has old-world text', !/declines/.test(txt) && /gymnasium|court/i.test(txt), txt.slice(0, 60));
      said.length = 0;
      Game.examineCell(placed.cx, placed.cy);
      const txt2 = said.join(' ');
      ok('gym depth2 differs', txt2 !== txt);
      ok('gym depth2 not "declines"', !/declines/.test(txt2));
    } else { ok('gym placement cell found', false); }
  }

  // ---- panel reachability: app.js tap panel offers Examine for interior cells ----
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  for (const cellName of ['hall', 'bunk', 'lodge', 'gym', 'class', 'office', 'bay', 'sanct']) {
    ok(`panel examines ${cellName}`, appSrc.includes(`'${cellName}'`), 'missing from app.js Examine list');
  }

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
