// Play harness for Glasswing Darter + Sunbasker (dive & bask mechanics).
// Scripted playthrough; prints encounter log at key beats so a human can
// READ the fight like a player and feel the phases/telegraphs/counterplay.
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
function giveSpear() {
  const s = Game.state.scholar;
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: def.name || 'fire-hardened spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: def.name || 'fire-hardened spear' };
}
function setup(monsterId, opts = {}) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = opts.px ?? 2; s.my = opts.py ?? 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = opts.grid || flatGrid;
  Game.log = [];
  giveSpear();
  s.monster = { id: monsterId, mx: opts.mx ?? 5, my: opts.my ?? 4 };
  Game.startCombat(monsterId);
  return s;
}
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
const cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));
let mark = 0;
function beat(title) {
  const lines = Game.log.slice(mark);
  mark = Game.log.length;
  const mon = M();
  const pl = Game.tbfight ? P() : null;
  let grid = '';
  for (let y = 0; y < 9; y++) {
    let row = '';
    for (let x = 0; x < 9; x++) {
      if (pl && pl.alive && pl.mx === x && pl.my === y) row += 'P';
      else if (mon && mon.mx === x && mon.my === y) row += mon.beamPhase === 'dive' ? 'D' : 'M';
      else if (mon && mon.telegraph && mon.telegraph.kind === 'squares' && mon.telegraph.cells.some(c => c.cx === x && c.cy === y)) row += 'x';
      else row += '.';
    }
    grid += row + '\n';
  }
  console.log(`\n===== ${title} =====`);
  if (!Game.tbfight) { console.log('[fight over]'); }
  else console.log(`[you] (${pl.mx},${pl.my}) hp=${Math.round(pl.hp)}` +
    (mon ? ` | [foe] (${mon.mx},${mon.my}) hp=${Math.round(mon.hp)} phase=${mon.beamPhase}${mon.sbCharge ? ' charge=' + mon.sbCharge : ''}${mon.telegraph ? ' TELEGAPH[' + mon.telegraph.kind + ' turns=' + mon.telegraph.turnsLeft + ']' : ''}` : ' | [foe] GONE') +
    ` | over=${Game.tbfight.over}`);
  console.log(grid.split('\n').slice(0, 9).join('\n'));
  for (const l of lines) console.log('  ' + l);
}
function pass() {
  if (!Game.tbfight || Game.tbfight.over) return;
  const cur = Game.tbCurrent();
  if (cur && cur.kind !== 'player') {
    if (cur.kind === 'villager') Game.tbVillagerTurn(cur);
    else Game.tbMonsterTurn(cur);
    if (Game.tbfight && !Game.tbfight.over) Game.tbAdvance();
    return;
  }
  Game.tbPlayerEndTurn();
}
function move(x, y) {
  if (!Game.tbfight || Game.tbfight.over) { console.log('  (fight over, cannot move)'); return; }
  if (!Game.tbIsPlayerTurn()) { console.log('  (not player turn, cannot move)'); return; }
  Game.tbPlayerMove(x, y);
}
function attack() {
  if (!Game.tbfight || Game.tbfight.over) { console.log('  (fight over, cannot attack)'); return; }
  if (!Game.tbIsPlayerTurn()) { console.log('  (not player turn, cannot attack)'); return; }
  const mon = M();
  if (!mon) { console.log('  (no foe to attack)'); return; }
  const okAtk = Game.tbPlayerStrike(mon.key);
  if (!okAtk) console.log('  (attack refused/whiffed — see log)');
}

async function main() {
  await Game.init();
  Game.dayPart = 1; // midday for both fights

  console.log('\n\n############ GLASSWING DARTER ############');
  setup('glasswing');
  beat('1. fight opens (circle)');
  pass(); beat('2. monster turn (should close / declare dive)');
  // DODGE PATH: wait for a declared dive, then step off the locked tile
  for (let i = 0; i < 6 && !(M() && M().telegraph); i++) pass();
  beat('3. dive declared (shadow on my tile)');
  {
    const mon = M();
    const cell = mon.telegraph.cells[0];
    move(cell.cx === P().mx ? P().mx + 1 : cell.cx, cell.cy); // off the locked tile
  }
  pass(); beat('4. dodge -> should CRASH grounded');
  attack(); pass(); beat('5. punish the grounded darter (+50%)');
  pass(); beat('6. window turn 2 (still down?)');
  pass(); beat('7. escape or re-dive');

  console.log('\n\n############ SUNBASKER ############');
  setup('sunbasker', { px: 2, py: 4, mx: 4, my: 4 });
  beat('1. fight opens (bask?)');
  pass(); beat('2. monster turn (close in / bask 1)');
  pass(); beat('3. monster turn (bask 2 -> bite declare?)');
  attack(); beat('4. player strikes mid-windup (charge should die)');
  pass(); beat('5. bite resolves weakened; charge spent?');
  pass(); beat('6. loop restarts: bask again?');
  pass(); beat('7. full-charge bite (left alone)');
}
main().catch(e => { console.error(e); process.exit(1); });
