// WORKER D survey (Steve 2026-10-06): play memory_projector, white_noise_heron,
// ducks_in_a_row as a player. Watch phase rhythm, telegraph, feel.
// Run: node scripts/workerd-survey-20261006.js [monsterId]
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
const P = () => Game.tbFighter('p');
const Ms = () => Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster') : [];
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
(async () => {
  const mid = process.argv[2] || 'memory_projector';
  await Game.init();
  const lines = [];
  Game.say = (t) => { lines.push(String(t)); };
  Game.audioEvent = (n, o) => {};
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;
  Game.startCombat(mid);
  const m0 = Ms()[0];
  if (!m0) { console.log('NO MONSTER SPAWNED'); return; }
  m0.hp = m0.maxHp = 400;
  const pl = P(); pl.hp = pl.maxHp = 600;
  pl.mx = Math.max(0, Math.min(8, m0.mx - 3)); pl.my = m0.my;
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  let lastPhase = '';
  console.log(`=== ${mid} (player @${pl.mx},${pl.my}, monster @${m0.mx},${m0.my}) ===`);
  for (let i = 0; i < 18 && Game.tbfight && !Game.tbfight.over; i++) {
    const ms = Ms();
    const m = ms[0];
    const ph = m ? m.beamPhase : '?';
    const tg = m && m.telegraph ? `TG[${(m.telegraph.pattern||{}).type} L${m.telegraph.turnsLeft} cells=${(m.telegraph.cells||[]).length}]` : 'no-tg';
    if (ph !== lastPhase) { console.log(`-- round ${Game.tbfight.round} phase → ${ph} | ${tg} | count:${ms.length}`); lastPhase = ph; }
    lines.length = 0;
    endTurn();
    const interesting = lines.filter(l => /say|cue|💥|badge|📼|🗿|📶|🗡|DUCK|line/i.test(l)).slice(0, 6);
    for (const l of lines.slice(0, 4)) console.log('   ' + String(l).slice(0, 130));
  }
  const me = (Game.state.codex.monsters || {})[mid] || {};
  console.log('codex stage:', me.stage || 'none');
  console.log('DONE');
})();
