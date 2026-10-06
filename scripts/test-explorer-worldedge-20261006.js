// test-explorer-worldedge-20261006.js — explorer loop: the world has an edge.
// Regression: tapping "➡️ Head west/east/..." on the rim of a border node
// called Game.travelTo with out-of-bounds coords (e.g. (-1,3)) — travelTo
// dereferenced the undefined tile BEFORE the travelTargets guard and threw
// a TypeError, killing the tap handler. The button is also a dead end:
// no path exists beyond the 7x7 map, so the tap must never promise travel.
// Expected behavior now:
//   1. travelTo(-1,3) / travelTo(7,3) returns null — no throw.
//   2. tryNodeExit at the map border tells the player the known world ends
//      here (once ever — not spam on hold-to-walk), instead of dying quiet.
//   3. Sanity: a real adjacent travel target still works.
// Usage: node scripts/test-explorer-worldedge-20261006.js
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
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}

(async () => {
  await Game.init();
  const said = [];
  const _say = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.exitBuilding();

  // put the player on the west rim of the westmost node
  Game.map.px = 0; Game.map.py = 3;
  Game.reveal(0, 3);
  const det = Game.genDetail(0, 3);
  det[4][0] = 'grass'; det[4][1] = 'grass';
  Game.state.scholar.mx = 1; Game.state.scholar.my = 4;
  Game.microMove(0, 4);
  const ex = Game.edgeExit(Game.state.scholar.mx, Game.state.scholar.my);
  ok('standing on the world-border rim', ex && ex.dx === -1 && ex.dir === 'west', JSON.stringify(ex));

  // 1. travelTo must not throw on out-of-bounds coords
  let threw = null, res = 'unset';
  try { res = Game.travelTo(-1, 3); } catch (e) { threw = e; }
  ok('travelTo(-1,3) does not throw', !threw, threw && threw.message);
  ok('travelTo(-1,3) returns null (no target)', res === null, JSON.stringify(res));
  threw = null; res = 'unset';
  try { res = Game.travelTo(7, 3); } catch (e) { threw = e; }
  ok('travelTo(7,3) does not throw', !threw, threw && threw.message);
  ok('travelTo(7,3) returns null (no target)', res === null, JSON.stringify(res));
  ok('player still on the border node', Game.map.px === 0 && Game.map.py === 3);

  // 2. tryNodeExit at the world edge: honest, once, not silent
  said.length = 0;
  const r1 = Game.tryNodeExit(-1, 0);
  ok('tryNodeExit off the world returns null', r1 === null, JSON.stringify(r1));
  ok('world-edge bump says the world ends here', said.some(t => /known world ends|no path/i.test(t)), said.slice(0, 3).join(' | ').slice(0, 120));
  said.length = 0;
  Game.tryNodeExit(-1, 0);
  ok('world-edge message does not repeat (no hold-to-walk spam)', said.length === 0, said.slice(0, 2).join(' | ').slice(0, 120));

  // 3. sanity: a real in-bounds travel target still works
  const t = Game.travelTargets().find(tt => tt.x === 1 && tt.y === 3);
  ok('in-bounds target exists', !!t);
  said.length = 0;
  Game.travelTo(1, 3);
  ok('in-bounds travel still moves', Game.map.px === 1 && Game.map.py === 3, `at ${Game.map.px},${Game.map.py}`);
  ok('arrival said something', said.some(x => /Travel 1 tile/.test(x)));

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
