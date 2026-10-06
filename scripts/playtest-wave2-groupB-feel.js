// Narrated playtest: Wave 2 Group B feel check (Steve 2026-10-06).
// Plays one fight per monster like a player, prints the story. Judge FEEL.
// Usage: node scripts/playtest-wave2-groupB-feel.js
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

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }

function setup(monId, dayPart, px, py, mx, my) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.hp = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  s.mx = px; s.my = py;
  s.monster = { id: monId, mx, my };
  Game.dayPart = dayPart;
  Game.canSee = () => true;
  Game.startCombat(monId);
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (m) m.hp = m.maxHp = 400;
  Game.log = [];
  return m;
}
function M() { return Game.tbfight.fighters.find(x => x.kind === 'monster'); }
function P() { return Game.tbFighter('p'); }
function tail(n) {
  const lines = (Game.log || []).slice(-n).map(l => (typeof l === 'string' ? l : (l.text || '')));
  for (const t of lines) console.log('    ' + t);
}
function playerActs(fn) {
  const tf = Game.tbfight; if (!tf || !Game.tbIsPlayerTurn()) return;
  const p = P();
  if (fn) fn(p);
  p.moveLeft = 0; p.acted = true;
  try { Game.tbAfterPlayerAction(); } catch (e) { console.log('playerAction err', e.message); }
}
function monsterActs() {
  let guard = 0;
  while (Game.tbfight && !Game.tbIsPlayerTurn() && guard++ < 30) {
    try { Game.tbAdvanceTurn(); } catch (e) { console.log('monsterTurn err', e.message); break; }
  }
}
function drive(rounds, strat) {
  for (let r = 0; r < rounds && Game.tbfight; r++) {
    const m = M(); if (!m) break;
    const p = P();
    const d = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my));
    console.log(`\n--- round ${r + 1}: phase=${m.beamPhase || 'none'}${m.telegraph ? ` telegraph(${m.telegraph.kind},tl=${m.telegraph.turnsLeft})` : ''} dist=${d} pHP=${p.hp} mHP=${m.hp}`);
    playerActs((pp) => strat(r, m, pp));
    console.log('  [player]');
    tail(4);
    monsterActs();
    console.log('  [monster]');
    tail(5);
    if (!Game.tbfight) { console.log('\n*** FIGHT OVER ***'); break; }
  }
}

(async () => {
  await Game.init();
  Game.genDetail = flatGrid;

  console.log('===================== HYPE HORN =====================');
  setup('hype_horn', 2, 2, 4, 5, 4);
  drive(9, (r, m, p) => {
    // naive: walk toward it to attack, but dodge out of telegraph cells
    const tg = m.telegraph;
    if (tg && tg.cells && tg.cells.some(c => c.cx === p.mx && c.cy === p.my)) {
      const dx = Math.sign(p.mx - m.mx), dy = Math.sign(p.my - m.my);
      p.mx = Math.max(0, Math.min(8, p.mx + dx)); p.my = Math.max(0, Math.min(8, p.my + dy));
    } else if (Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) > 2) {
      p.mx = Math.max(0, Math.min(8, p.mx + Math.sign(m.mx - p.mx)));
    } else {
      // P2-12 (Steve 2026-10-06): tbPlayerStrike() with no target no-ops
      // (tbFighter(undefined) is null). Pass the monster's fighter key.
      try { Game.tbPlayerStrike(m.key); } catch (e) {}
    }
  });

  console.log('\n\n===================== SERVICE MIMIC =====================');
  setup('service_mimic', 3, 2, 4, 5, 4);
  drive(9, (r, m, p) => {
    // naive: stands still like a fool
    if (m.beamPhase === 'dialing') { p.mx = Math.max(0, p.mx - 1); }
  });

  console.log('\n\n===================== CONTRACT GOLEM =====================');
  setup('contract_golem', 1, 4, 4, 6, 4);
  drive(9, (r, m, p) => {
    // naive: lingers in range (idiot), then runs at bound
    const d = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my));
    if (m.beamPhase === 'bound' && d <= 3) { p.mx = Math.max(0, p.mx - 2); }
    else if (d <= 2) { try { Game.tbPlayerStrike(m.key); } catch (e) {} }
  });
})().catch(e => { console.error('FATAL', e); process.exit(2); });
