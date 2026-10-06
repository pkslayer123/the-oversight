// Proof: barrier-follow position sync (Steve 2026-10-06).
// The flee-by-barrier follow branch used to desync p.mx (fighter) from
// scholar.mx (render) — the next move visibly teleported the player.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }

(async () => {
  await Game.init();
  // Force the FOLLOW branch (not 50/50): stub Math.random
  const realRandom = Math.random;

  for (let trial = 0; trial < 5; trial++) {
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar;
    s.health = 500; s.mx = 7; s.my = 4;
    Game.genDetail = () => flatGrid();
    for (const rid of Object.keys(Game.state.village.positions || {})) {
      Game.state.village.positions[rid] = { mx: 0, my: 0 };
    }
    s.monster = { id: 'gallowdeer', mx: 5, my: 2 };
    Game.dayPart = 3;
    Game.startCombat('gallowdeer');
    const f = Game.tbfight;
    // ensure player turn
    let g = 0;
    while (!Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && g++ < 30) Game.tbAdvance();
    if (!Game.tbIsPlayerTurn()) { ok('trial ' + trial + ' player turn reached', false); continue; }
    const p = Game.tbFighter('p');
    // walk to edge
    p.mx = 7; p.my = 4; s.mx = 7; s.my = 4; p.moveLeft = 4; p.acted = false;
    Math.random = () => 0.9; // force FOLLOW branch (>= 0.5)
    Game.tbPlayerMove(8, 4);
    Math.random = realRandom;
    if (!Game.tbfight || Game.tbfight.over) {
      ok('trial ' + trial + ' follow branch kept fight alive', false);
      continue;
    }
    const p2 = Game.tbFighter('p');
    const synced = (p2.mx === s.mx && p2.my === s.my);
    ok('trial ' + trial + ' fighter/scholar synced after barrier-follow', synced);
    if (!synced) console.log(`  fighter ${p2.mx},${p2.my} vs scholar ${s.mx},${s.my}`);
    // next move must not teleport: single step moves exactly 1
    const bx = p2.mx, by = p2.my;
    p2.moveLeft = 4;
    Game.tbPlayerMove(Math.min(8, bx + 1), by);
    const p3 = Game.tbFighter('p');
    if (!p3 || !Game.tbfight || Game.tbfight.over) {
      ok('trial ' + trial + ' next move ended fight cleanly (flee branch)', true);
    } else {
      const dist = Math.max(Math.abs(p3.mx - bx), Math.abs(p3.my - by));
      // (may hit barrier again — just check no wild jump)
      ok('trial ' + trial + ' no teleport on next move', dist <= 2);
    }
  }
  Math.random = realRandom;

  // Antler possessive fix
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar;
  s2.health = 500; s2.mx = 4; s2.my = 4;
  Game.genDetail = () => flatGrid();
  s2.monster = { id: 'gallowdeer', mx: 5, my: 4 };
  Game.dayPart = 3;
  Game.startCombat('gallowdeer');
  const deer = Game.tbfight.fighters.find(x => x.kind === 'monster');
  deer.name = 'the thing with headlights for eyes, standing too still';
  const logBefore = (Game.state.log || []).length;
  Game.tbAntlerThrash(deer);
  const newEntries = (Game.state.log || []).slice(logBefore).map(e => e.text || '').join(' ');
  ok('antler possessive uses "the antlers of" for descriptors', !/still's antlers/.test(newEntries));

  console.log(pass + '/' + (pass + fail) + (fail ? ' FAILURES' : ' ALL GREEN'));
  process.exit(fail ? 1 : 0);
})();
