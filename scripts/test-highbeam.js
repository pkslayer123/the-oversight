// Highbeam Deer fight tests. Usage: node scripts/test-highbeam.js
// Covers Steve's playtest notes + design correction:
//  - combat card placement (DOM order, not below the fold)
//  - 2-turn perceived windup (windup:1 in data)
//  - no one-shot: deer survives ~3 spear hits, never flees
//  - beam locks aim at declare (MOVE dodges), trees block the lane
//  - scenario stalks from 5 tiles, detection works on approach
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

// flat walkable grid for deterministic combat
function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}

function newDeerGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  // no party: villagers far away
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  return s;
}

function startDeerFight(px, py, mx, my) {
  const s = Game.state.scholar;
  s.mx = px; s.my = py;
  s.monster = { id: 'gallowdeer', mx, my };
  Game.dayPart = 3;
  Game.startCombat('gallowdeer');
  return Game.tbfight;
}

// drive combat: playerFn(p, deer) decides each player turn; returns stats
function driveCombat(playerFn, maxTurns) {
  const stats = { playerTurns: 0, discharges: 0, fled: false, deerDead: false, playerAlive: false };
  const log0 = Game.log.length;
  const deerRef = Game.tbfight.fighters.find(f => f.kind === 'monster');
  const pRef = Game.tbFighter('p');
  let guard = 0;
  while (Game.tbfight && guard++ < (maxTurns || 60)) {
    const cur = Game.tbCurrent();
    if (!cur) break;
    if (cur.kind === 'player') {
      stats.playerTurns++;
      // playerFn returns true if its action auto-advanced the turn (strike via
      // tbAfterPlayerAction). Pure movement needs an explicit end-turn.
      const advanced = playerFn(Game.tbFighter('p'), Game.tbfight.fighters.find(f => f.kind === 'monster'));
      if (!advanced && Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
    } else {
      Game.tbAdvance();
    }
    if (!Game.tbfight) break;
  }
  for (const l of Game.log.slice(log0)) {
    if (/Ocular Discharge!/.test(l)) stats.discharges++;
    if (/breaks and runs/.test(l)) stats.fled = true;
  }
  stats.over = !Game.tbfight;
  stats.deerDead = !deerRef.alive;
  stats.deerFled = !!deerRef.fled;
  stats.playerAlive = !!pRef.alive;
  stats.playerHp = Math.round(Game.state.scholar.health);
  return stats;
}

(async () => {
  await Game.init();
  const mdef = Game.data.monsters.find(m => m.id === 'gallowdeer');

  // --- 1. data ---
  eq('windup is 1 (2-turn perceived charge)', mdef.attack.pattern.windup, 1);
  eq('discharge damage [22,32]', JSON.stringify(mdef.attack.damage), JSON.stringify([22, 32]));
  eq('deer hp [95,115]', JSON.stringify(mdef.hp), JSON.stringify([95, 115]));
  ok('deer never flees (no fleeAt)', !('fleeAt' in mdef));
  ok('codex no longer claims it bolts', !/flees at 50%/.test(mdef.codexStages.slain));

  // --- 2. scenario: stalk, not spawn-on-top ---
  Game.debugScenario('headlight');
  {
    const s = Game.state.scholar;
    ok('scenario does not start combat', !Game.tbfight);
    ok('deer placed on map', !!(s.monster && s.monster.id === 'gallowdeer'));
    const d = Math.max(Math.abs(s.monster.mx - s.mx), Math.abs(s.monster.my - s.my));
    eq('deer 5 tiles away', d, 5);
    eq('night', Game.dayPart, 3);
    eq('spear equipped', (s.equipped.weapon || {}).itemId, 'fire_hardened_spear');
  }

  // --- 3. detection: stance machine reacts to approach ---
  {
    const s = Game.state.scholar;
    const realCanSee = Game.canSee.bind(Game);
    Game.canSee = () => true; // isolate the stance machine from random LoS
    for (let i = 0; i < 3; i++) Game.monsterTurn();
    ok('unaware at dist 5 (no warn, no combat)', !Game.tbfight && !(s.monster || {}).warned);
    s.mx = 3; // dist 4
    Game.monsterTurn();
    ok('freeze warning at dist 4', (s.monster || {}).warned === true);
    ok('freeze cue = the aim flavor', Game.log.some(l => /It freezes\. Like a deer in headlights/.test(l)));
    Game.monsterTurn(); // warnTurns=1, closes distance
    ok('still no combat after 1 warn turn', !Game.tbfight);
    Game.monsterTurn(); // warnTurns=2 -> combat on its terms
    ok('combat starts on approach', !!Game.tbfight);
    Game.canSee = realCanSee;
  }

  // --- 4. fight: trade hits — deer never flees, discharge fires, 3-4 strikes ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    startDeerFight(4, 4, 4, 6); // dist 2, spear range 2
    const hpBefore = Game.tbFighter('m_0').hp;
    ok('deer hp in [95,115]', hpBefore >= 95 && hpBefore <= 115);
    const st = driveCombat((p, deer) => {
      const d = Math.max(Math.abs(deer.mx - p.mx), Math.abs(deer.my - p.my));
      if (d <= 2 && !p.acted) return Game.tbPlayerStrike(deer.key);
      return false;
    });
    Game.genDetail = realGen;
    ok('deer never fled', !st.fled && !st.deerFled);
    ok('deer died (fight ended, player alive)', st.over && st.deerDead && st.playerAlive);
    ok('discharge fired at least once', st.discharges >= 1);
    ok('fight took 3-5 player turns (not a one-shot)', st.playerTurns >= 3 && st.playerTurns <= 5);
    ok('trading hits costs HP (discharge punishes)', st.playerHp < 100);
  }

  // --- 5. dodge: sidestep out of the locked lane ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    let dodged = false;
    const st = driveCombat((p, deer) => {
      if (deer.telegraph && !p.acted) {
        // sidestep out of the locked lane, then strike if still in range —
        // the intended counterplay rhythm: move, strike, move, strike.
        const nx = p.mx === 4 ? 5 : p.mx;
        if (Game.tbPlayerMove(nx, p.my)) dodged = true;
      }
      const d = Math.max(Math.abs(deer.mx - p.mx), Math.abs(deer.my - p.my));
      if (d <= 2 && !p.acted) return Game.tbPlayerStrike(deer.key);
      return false;
    }, 40);
    Game.genDetail = realGen;
    ok('dodge: moved out of the lane', dodged);
    ok('dodge: discharge fired but player untouched', st.discharges >= 1 && st.playerHp === 100);
  }

  // --- 6. stand still: the beam finds you (mechanics punish) ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    const st = driveCombat((p, deer) => {
      // never move, never strike — just stand in the lane
      if (!p.acted) return Game.tbPlayerStudy();
      return false;
    }, 30);
    Game.genDetail = realGen;
    ok('standing still: discharge hits', st.discharges >= 1 && st.playerHp < 100);
  }

  // --- 7. trees block the lane ---
  {
    const realGen = Game.genDetail.bind(Game);
    const g = flatGrid(); g[4][4] = 'tree';
    Game.genDetail = () => g;
    newDeerGame();
    startDeerFight(4, 2, 4, 6); // beam lane x=4 passes through tree at (4,4)
    // deer turn: declare (turnsLeft=1), truncated at the tree
    Game.tbAdvance(); // run deer turn
    const deer = Game.tbFighter('m_0');
    const laneLen = (deer.telegraph && deer.telegraph.cells.length) || 0;
    ok('beam truncated at tree (only (4,5) in lane)', laneLen === 1);
    ok('player not threatened behind tree', deer.telegraph && deer.telegraph.threatenedPlayer === false);
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 8. UI: combat card placement ---
  // The combat card must render in the MAIN column, above the fold — never in
  // the side column below the minimap (Steve's playtest: it was unfindable).
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const mainCol = app.split('game-col-main')[1].split('game-col-side')[0];
    const sideCol = app.split('game-col-side')[1];
    ok('combat card renders in main column', mainCol.includes('ord-combatpanel') && mainCol.includes('panelCombat(st)'));
    ok('combat card sits right under the grid zone (before self bar)',
      mainCol.indexOf('ord-combatpanel') < mainCol.indexOf('ord-self'));
    ok('side column shows no combat panel (no below-fold duplicate)',
      !sideCol.split('ord-log')[0].includes('panelCombat(st)'));
    ok('panelFor returns empty in combat (single source)', /if \(st\.inCombat\) return ''/.test(app));
    ok('glanceable combat strip above grid', mainCol.includes('combatStripHTML(st)'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
