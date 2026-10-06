// Narrated playtest: Wave 2 Group C (Middle Manager, Inspiration, Nostalgia).
// Plays one fight per monster like a player, prints the story.
// Usage: node scripts/playtest-wave2-groupC.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function walkable(x, y) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const cell = d[y] && d[y][x];
  return !Game.cellProps(cell).blocks;
}
function freeCell() {
  for (let t = 0; t < 50; t++) {
    const x = Math.floor(Math.random() * 9), y = Math.floor(Math.random() * 9);
    if (walkable(x, y)) return { x, y };
  }
  return { x: 4, y: 4 };
}

function setup() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.health = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.ensureVillagerPositions();
  return s;
}

function botTurn() {
  const tf = Game.tbfight;
  if (!tf || !Game.tbIsPlayerTurn()) return false;
  const p = Game.tbFighter('p');
  const S = globalThis.Scattering;
  const foe = S.combat.nearestEnemy(tf.fighters, p);
  if (!foe) { Game.tbPlayerEndTurn(); return true; }
  const cheb = () => Math.max(Math.abs(foe.f.mx - p.mx), Math.abs(foe.f.my - p.my));
  const wrange = (Game.equippedWeapon && Game.equippedWeapon().range) || 1;
  // Smart-ish: if the foe has a telegraph aimed at us, sidestep out of the cells.
  const tg = foe.f.telegraph;
  if (tg && tg.cells && !p.acted) {
    const inDanger = tg.cells.some(c => c.cx === p.mx && c.cy === p.my);
    if (inDanger && p.moveLeft > 0) {
      // try to step to a neighboring cell not in the telegraph
      const dangerSet = new Set(tg.cells.map(c => c.cx + ',' + c.cy));
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]) {
        const nx = p.mx + dx, ny = p.my + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (dangerSet.has(nx + ',' + ny)) continue;
        if (Game.tbPlayerMove(nx, ny)) break;
      }
    }
  }
  // PASSIVE: don't strike — just dodge telegraphs and watch. We want the full pattern.
  let guard = 0;
  while (Game.tbfight && Game.tbIsPlayerTurn() && p.moveLeft > 0 && guard++ < 8) {
    // step toward foe, one tile at a time (never path through doors)
    const dx = Math.sign(foe.f.mx - p.mx), dy = Math.sign(foe.f.my - p.my);
    const nx = p.mx + dx, ny = p.my + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) break;
    if (!Game.tbPlayerMove(nx, ny)) break;
    if (!Game.tbfight) break; // moved through a door — stop
    if (!p.acted && cheb() <= wrange) Game.tbPlayerStrike(foe.f.key);
  }
  if (Game.tbfight && Game.tbIsPlayerTurn()) {
    if (!p.acted) Game.tbPlayerStudy(); else Game.tbPlayerEndTurn();
  }
  return true;
}

function playFight(monsterId, label) {
  setup();
  Game.dayPart = 3; // night — bright_idea only fights in the dark
  const s = Game.state.scholar;
  s.monster = { id: monsterId, mx: 6, my: 4 };
  Game.startCombat(monsterId);
  console.log('\n' + '='.repeat(70));
  console.log('  ' + label);
  console.log('='.repeat(70));
  const log0 = Game.log.length;
  let guard = 0;
  const phases = [];
  while (Game.tbfight && guard++ < 60) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    // capture monster phase each round
    const tf = Game.tbfight;
    for (const ftr of tf.fighters) {
      if (ftr.kind === 'monster' && ftr.beamPhase) {
        const last = phases[phases.length - 1];
        if (!last || last.phase !== ftr.beamPhase || last.round !== tf.round) {
          phases.push({ round: tf.round, phase: ftr.beamPhase, hp: Math.round(ftr.hp) });
        }
      }
    }
    if (cur.kind === 'player') { if (!botTurn()) break; }
    else Game.tbAdvance();
    if (!Game.tbfight) break;
  }
  const newLogs = Game.log.slice(log0);
  // Print the story: telegraphs, says, key events (skip noise)
  for (const l of newLogs) {
    if (/^(⚠|📖|"|[A-Z][a-z]+ (charges|paces|backs|stops|takes|unfolds|sits|glows|detonates))/.test(l)) {
      console.log('  | ' + l.slice(0, 140));
    }
  }
  console.log('  -- phases: ' + phases.map(p => `R${p.round}:${p.phase}(hp${p.hp})`).join(' → '));
  console.log('  -- result: ' + (Game.tbfight ? 'ONGOING (guard)' : 'fight ended') +
    ', player HP: ' + Math.round(Game.state.scholar.health));
}

(async () => {
  await Game.init();
  playFight('delegate_beast', 'MIDDLE MANAGER — "Per my last roar..."');
  playFight('bright_idea', 'INSPIRATION — "It seemed like a good idea at the time."');
  playFight('memory_projector', 'NOSTALGIA — "the light PULLS"');
  console.log('\nDone.');
})();
