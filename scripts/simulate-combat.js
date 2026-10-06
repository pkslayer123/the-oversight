// Turn-based combat simulator: pits the player (+party) against each monster.
// Usage: node scripts/simulate-combat.js [monsterId] [runs]
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
  // move to a wild node for room: use current node, place player centrally
  const s = Game.state.scholar;
  const c = freeCell();
  s.mx = c.x; s.my = c.y; s.health = 100;
  // the hunter's kit: a real hunter brings a spear (range 2).
  // (The old sweep fought unarmed — range 1, +0 — which understated the
  // hunter build and hid fleeAt/routed dynamics.)
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  Game.ensureVillagerPositions();
  // pull 2 villagers near the player for party testing
  const vpos = Game.state.village.positions;
  const rids = Object.keys(vpos).slice(0, 2);
  let i = 0;
  for (const rid of rids) {
    const spot = freeCell();
    vpos[rid] = { mx: Math.max(0, Math.min(8, c.x + 2 + i)), my: c.y };
    i++;
  }
  return s;
}

function botTurn() {
  // player: strike if adjacent and able, otherwise close distance, then end turn.
  // (The old bot re-struck on a spent turn forever — it never checked p.acted
  // before striking, so adjacent spawns soft-locked the sweep on
  // "Already acted this turn." The game was fine; the harness was the bug.)
  const tf = Game.tbfight;
  if (!tf || !Game.tbIsPlayerTurn()) return false;
  const p = Game.tbFighter('p');
  const S = globalThis.Scattering;
  const foe = S.combat.nearestEnemy(tf.fighters, p);
  if (!foe) { Game.tbPlayerEndTurn(); return true; }
  const cheb = () => Math.max(Math.abs(foe.f.mx - p.mx), Math.abs(foe.f.my - p.my));
  const wrange = (Game.equippedWeapon && Game.equippedWeapon().range) || 1;
  // 1. strike while able (weapon range is real: spear 2, hands 1)
  if (!p.acted && cheb() <= wrange) Game.tbPlayerStrike(foe.f.key);
  // 2. close distance with remaining moves; strike if we arrive in range and can
  let guard = 0;
  while (Game.tbfight && Game.tbIsPlayerTurn() && p.moveLeft > 0 && guard++ < 8) {
    const path = Game.findPath(p.mx, p.my, foe.f.mx, foe.f.my);
    if (!path || !path.length) break;
    const steps = Math.min(path.length - 1, p.moveLeft, 2); // stop 1 short (adjacent)
    if (steps <= 0) break;
    const [tx, ty] = path[steps - 1];
    if (!Game.tbPlayerMove(tx, ty)) break;
    if (!p.acted && cheb() <= wrange) Game.tbPlayerStrike(foe.f.key);
  }
  // 3. never leave the turn hanging — Wait forfeits the rest
  if (Game.tbfight && Game.tbIsPlayerTurn()) {
    if (!p.acted) Game.tbPlayerStudy(); else Game.tbPlayerEndTurn();
  }
  return true;
}

function runCombat(monsterId) {
  setup();
  const s = Game.state.scholar;
  // spawn the monster somewhere PATH-CONNECTED to the player: freeCell can
  // return a walkable-but-walled-off pocket (harness artifact — real fights
  // start adjacent), which GUARDs the sweep into a fake stalemate.
  let mx = 0, my = 0, ok = false;
  for (let t = 0; t < 40 && !ok; t++) {
    const spot = freeCell();
    mx = spot.x; my = spot.y;
    if (Math.abs(mx - s.mx) + Math.abs(my - s.my) < 3) { mx = (s.mx + 4) % 9; my = (s.my + 4) % 9; }
    ok = !!Game.findPath(s.mx, s.my, mx, my);
  }
  if (!ok) { mx = (s.mx + 2) % 9; my = s.my; } // fallback: adjacent-ish
  s.monster = { id: monsterId, mx, my };
  const mdef = Game.data.monsters.find(m => m.id === monsterId);
  Game.startCombat(monsterId);
  const tf = Game.tbfight;
  const stats = { telegraphs: 0, cues: [], dmgToPlayer: 0, dmgToParty: 0, dmgToMonster: 0,
    partyActions: {}, rounds: 0, learned: [] };
  const hp0 = { p: 100 };
  for (const ftr of tf.fighters) if (ftr.kind === 'villager') hp0[ftr.key] = ftr.hp;
  const monHp0 = {};
  for (const ftr of tf.fighters) if (ftr.kind === 'monster') monHp0[ftr.key] = ftr.hp;
  let guard = 0;
  const logLen0 = Game.log.length;
  while (Game.tbfight && guard++ < 200) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    if (cur.kind === 'player') {
      if (!botTurn()) break;
    } else {
      // shouldn't happen: tbAdvance runs AI automatically. If we're here, force advance.
      Game.tbAdvance();
    }
    if (!Game.tbfight) break;
  }
  // analyze log
  const newLogs = Game.log.slice(logLen0);
  for (const l of newLogs) {
    if (l.startsWith('⚠')) { stats.telegraphs++; stats.cues.push(l.slice(0, 80)); }
    if (l.startsWith('📖 Codex:')) stats.learned.push(l.slice(8, 60));
    if (/patches you up/.test(l)) stats.partyActions.help = (stats.partyActions.help || 0) + 1;
    if (/strikes the|harries the/.test(l) && !l.startsWith('You')) stats.partyActions.fight = (stats.partyActions.fight || 0) + 1;
    if (/runs for it/.test(l)) stats.partyActions.flee = (stats.partyActions.flee || 0) + 1;
  }
  const result = tf.result;
  stats.rounds = tf.round;
  stats.result = result;
  stats.playerHpEnd = Math.round(Game.state.scholar.health);
  // loot: what the hunter actually walks away with (alien drops + meat)
  stats.loot = (Game.state.scholar.inventory || []).filter(i => i.alienLoot).map(i => i.name);
  stats.meatKcal = (Game.state.scholar.inventory || [])
    .filter(i => /_meat$/.test(i.plantId || ''))
    .reduce((a, i) => a + (i.units || 0) * (i.kcalEach || 0), 0);
  stats.guard = guard >= 200;
  return stats;
}

(async () => {
  if (require.main !== module) return; // required as a lib by test-combat-harness.js
  await Game.init();
  const only = process.argv[2];
  const runs = parseInt(process.argv[3] || '3', 10);
  const ids = only ? [only] : Game.data.monsters.map(m => m.id);
  let crashes = 0;
  for (const id of ids) {
    const mdef = Game.data.monsters.find(m => m.id === id);
    for (let r = 0; r < runs; r++) {
      try {
        const st = runCombat(id);
        console.log(`${mdef.name}: result=${st.result} rounds=${st.rounds} telegraphs=${st.telegraphs} learned=${st.learned.length} party=${JSON.stringify(st.partyActions)} playerHp=${st.playerHpEnd} loot=[${st.loot.join(';')||'-'}] meat=${st.meatKcal}${st.guard?' GUARD':''}`);
        if (st.telegraphs > 0 && r === 0) console.log(`   cue: ${st.cues[0]}`);
        if (st.learned.length && r === 0) console.log(`   codex: ${st.learned[0]}`);
      } catch (e) {
        crashes++;
        console.log(`${mdef.name}: CRASH ${e.message}\n${e.stack.split('\n').slice(0, 4).join('\n')}`);
      }
    }
  }
  console.log(crashes ? `CRASHES: ${crashes}` : 'no crashes');
})();

// exported for scripts/test-combat-harness.js (the regression test for this sweep)
module.exports = { runCombat, botTurn, setup, freeCell };
