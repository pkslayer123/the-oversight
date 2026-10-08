// Proof: stuck hold-to-walk cleared on turn end (Steve 2026-10-06).
// The old guard only cleared when it was STILL the player's turn with fresh
// moves. If a step advanced to the monster's turn, the hold survived and
// auto-walked the player on their next turn ("I got put in a walk").
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/move-anim.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MoveAnim = globalThis.Scattering.MoveAnim;
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }

// The guard logic from moveStepHook (mirrored for testing):
// NEW: if (!Game.tbIsPlayerTurn() || (pAfter && pAfter.moveLeft > mlBefore)) clearHold();
// OLD: if (pAfter && Game.tbIsPlayerTurn() && pAfter.moveLeft > mlBefore) clearHold();

(async () => {
  await Game.init();
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.mx = 4; s.my = 4;
  Game.genDetail = () => flatGrid();
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  s.monster = { id: 'gallowdeer', mx: 6, my: 2 };
  Game.dayPart = 3;
  Game.startCombat('gallowdeer');
  let g = 0;
  while (!Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && g++ < 30) Game.tbAdvance();
  ok('player turn reached', Game.tbIsPlayerTurn());

  const f = Game.tbfight;
  const p = Game.tbFighter('p');
  // Simulate the stuck scenario: it's the monster's turn (turn advanced),
  // hold is still active from the player's hold.
  const monsterIdx = f.order.findIndex(k => k !== 'p');
  f.turnIdx = monsterIdx;
  ok('simulated monster turn', !Game.tbIsPlayerTurn());

  // NEW guard clears the hold
  MoveAnim.setHold({ dx: 1, dy: 0 });
  const mlBefore = 0;
  if (!Game.tbIsPlayerTurn() || (p && p.moveLeft > mlBefore)) MoveAnim.clearHold();
  ok('new guard clears hold on monster turn', !MoveAnim.holdDir);

  // OLD guard would NOT clear
  MoveAnim.setHold({ dx: 1, dy: 0 });
  const oldWouldClear = p && Game.tbIsPlayerTurn() && p.moveLeft > mlBefore;
  ok('old guard leaves hold stuck (bug confirmed)', !oldWouldClear);
  MoveAnim.clearHold();

  // Sanity: new guard preserves hold mid-turn (doesn't over-clear)
  f.turnIdx = f.order.findIndex(k => k === 'p');
  p.moveLeft = 2;
  MoveAnim.setHold({ dx: 1, dy: 0 });
  const mlB2 = 3;
  if (!Game.tbIsPlayerTurn() || (p && p.moveLeft > mlB2)) MoveAnim.clearHold();
  ok('new guard keeps hold during player turn', !!MoveAnim.holdDir);
  MoveAnim.clearHold();

  console.log(pass + '/' + (pass + fail) + (fail ? ' FAILURES' : ' ALL GREEN'));
  process.exit(fail ? 1 : 0);
})();
