// PLAY-FEEL (Steve 2026-10-06): Extended Warranty, played AS A PLAYER.
// Judges: does the ring tell read? Is the move-counterplay fair and fun?
// Does the pitch hurt? Does the call-drop feel earned?
// Run: node scripts/play-feel-20261006-warranty.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function note(t) { console.log(t); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
// TURN HYGIENE: endTurn() advances EXACTLY one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function moveSteps(dx, dy, n) {
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); let moved = 0;
  while (moved < n && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
    moved++;
  }
  note(`  [you move ${moved} tiles to ${P().mx},${P().my}]`);
}
function strike() {
  if (Game.tbIsPlayerTurn()) Game.tbPlayerStrike('p');
  endTurn();
}
(async () => {
  await Game.init();
  Game.say = (t) => { console.log('  ' + String(t).slice(0, 130)); };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;
  Game.startCombat('warranty_caller');
  const m = M(); m.hp = m.maxHp = 60;
  const pl = P(); pl.hp = pl.maxHp = 120;
  pl.mx = Math.max(0, m.mx - 3); pl.my = m.my;
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  m.beamPhase = null; m.wcDialPos = null; m.wcLastHp = m.hp; // clean call
  note('=== FIGHT 1: stand still, take the pitch (feel the damage) ===');
  for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
    note(`-- round ${i}: phase=${M().beamPhase} m@${M().mx},${M().my} you@${P().mx},${P().my} hp=${P().hp}`);
    endTurn();
  }
  note(`hp after standing still: ${P().hp}/120`);
  note('\n=== FIGHT 2 (same fight): keep moving, drop the calls ===');
  for (let i = 0; i < 8 && Game.tbfight && !Game.tbfight.over; i++) {
    note(`-- round ${i}: phase=${M().beamPhase} m@${M().mx},${M().my} you@${P().mx},${P().my} hp=${P().hp}`);
    if (M().beamPhase === 'ring') { note('  [ring! moving 3 tiles]'); moveSteps(0, 1, 3); }
    endTurn();
  }
  note(`hp after moving: ${P().hp}/120`);
  note('\n=== FIGHT 3: hurt it mid-ring (bad connection) ===');
  for (let i = 0; i < 10 && Game.tbfight && !Game.tbfight.over; i++) {
    note(`-- round ${i}: phase=${M().beamPhase} mhp=${M().hp}`);
    if (M().beamPhase === 'ring' && Game.tbIsPlayerTurn()) {
      // close in and hit it: strike if adjacent-ish, else step closer
      const d = Math.max(Math.abs(P().mx - M().mx), Math.abs(P().my - M().my));
      if (d <= 2) { note('  [you strike it mid-ring]'); strike(); continue; }
    }
    endTurn();
  }
  note(`\nfinal: monster hp=${M() ? M().hp : 'dead'} player hp=${P().hp}/120`);
  note('DONE');
})();
