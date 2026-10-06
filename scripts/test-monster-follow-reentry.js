// MONSTER FOLLOW RE-ENTRY (explorer loop 2026-10-05): a following monster
// must enter the NEW tile's grid at the edge you came from — not keep its
// old tile's coordinates. Old behavior: the monster kept stale mx/my,
// hunted wrong cells forever, never reached the player, and occupied the
// monster slot (blocking all new encounters via checkEncounter's
// !scholar.monster gate).
// Usage: node scripts/test-monster-follow-reentry.js
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
let rngState = 99 >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  ok: ${name}`);
  else { failures++; console.log(`  FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const unblocked = () => Game.travelTargets().filter(t => Game.travelBlockage(t.x, t.y) === null && !Game.tileAt(t.x, t.y).visited);

  // 1. follow re-entry: monster gets fresh grid coords in the new tile
  let t = unblocked()[0];
  Game.travelTo(t.x, t.y);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.monster = { id: 'belltoad', hp: 25, mx: 6, my: 6, stance: 'hungry', turns: 1 };
  const oldNode = Game.map.px + ',' + Game.map.py;
  t = unblocked().find(x => x.x !== Game.map.px || x.y !== Game.map.py) || unblocked()[0];
  const odx = Math.sign(t.x - Game.map.px), ody = Math.sign(t.y - Game.map.py);
  Game.travelTo(t.x, t.y);
  const m = Game.state.scholar.monster;
  check('monster still follows', !!m && m.id === 'belltoad');
  check('monster coords changed to new tile (not stale old-tile coords)',
    !(m.mx === 6 && m.my === 6) || (Game.map.px + ',' + Game.map.py) === oldNode,
    `stayed at 6,6 after node change`);
  check('monster coords in bounds', m.mx >= 0 && m.mx <= 8 && m.my >= 0 && m.my <= 8, `${m.mx},${m.my}`);
  check('monster not on player entry cell',
    !(m.mx === Game.state.scholar.mx && m.my === Game.state.scholar.my),
    `both at ${m.mx},${m.my}`);
  // it entered at the edge you came from: if you moved east (odx>0), monster at west edge
  const edgeOk = odx > 0 ? m.mx <= 2 : odx < 0 ? m.mx >= 6 : ody > 0 ? m.my <= 2 : m.my >= 6;
  check(`monster entered at the edge you came from (travel dir ${odx},${ody})`, edgeOk, `at ${m.mx},${m.my}`);

  // 2. a hungry follower now actually closes and starts combat when you linger
  // (startCombat moves the monster into Game.tbfight and nulls scholar.monster)
  let combatStarted = false;
  for (let i = 0; i < 30 && !combatStarted; i++) {
    Game.monsterTurn();
    combatStarted = !!Game.tbfight;
  }
  check('hungry follower closes in and starts combat', combatStarted);

  // 3. non-following monsters still leave
  Game.state.scholar.fight = null; Game.state.scholar.tbfight = null;
  Game.state.scholar.monster = { id: 'nightlight_catfish', hp: 10, mx: 5, my: 5 };
  t = unblocked().find(x => x.x !== Game.map.px || x.y !== Game.map.py);
  if (t) {
    Game.travelTo(t.x, t.y);
    check('non-following monster does not follow', Game.state.scholar.monster === null,
      JSON.stringify(Game.state.scholar.monster));
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
