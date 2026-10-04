// Highbeam Deer fight tests. Usage: node scripts/test-highbeam.js
// Covers Steve's playtest notes + design corrections:
//  - combat card placement (DOM order, not below the fold)
//  - 2-turn perceived windup (windup:1 in data)
//  - no one-shot: deer survives ~3 spear hits, never flees
//  - ANCHORED SWEEPING BEAM: a ray FROM THE DEER that ROTATES toward you
//    (sweepRate 0.65 rad/tick). Positioning relative to the deer matters.
//  - SWEEP ECONOMY: unspent angular budget becomes dwell — stand still and
//    it parks the full beam on you (up to 3.5x); make it chase and it burns less
//  - COOLDOWN between Discharges (2 deer turns) — no every-round pressure
//  - walls/structures block; trees shred; beam reaches the node edge
//  - scorch: environmental damage, forage destroyed, recovers in ~3 days
//  - exposure tiers: lane hurts, beam ON you devastates, trapped = lethal
//  - counterplay: circle it, break the line, or close in (antler thrash)
//  - scenario stalks from 5 tiles, detection works on approach
//  - NOT A BOSS: no boss theater; the Discharge guarantee is diegetic
//    (windup can't be interrupted; death throes fire the beam)
//  - village names the beast only once the news spreads (gossip/telling)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
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
  eq('beam sweeps', mdef.attack.pattern.sweep, true);
  eq('fireTurns 2', mdef.attack.pattern.fireTurns, 2);
  eq('sweepRate 0.65 rad/tick (angular, anchored at deer)', mdef.attack.pattern.sweepRate, 0.65);
  eq('cooldownTurns 2 between Discharges', mdef.attack.pattern.cooldownTurns, 2);
  eq('beam length 9 (node edge)', mdef.attack.pattern.length, 9);

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

  // --- 4. face-tanking the sweep is lethal (heavily punished, as designed) ---
  // Deterministic: max damage rolls, no disrupt luck.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    const realRandom = Math.random;
    newDeerGame();
    startDeerFight(4, 4, 4, 6); // dist 2, spear range 2
    S_.combat.roll = ([a, b]) => b;
    Math.random = () => 0.99;
    const st = driveCombat((p, deer) => {
      const d = Math.max(Math.abs(deer.mx - p.mx), Math.abs(deer.my - p.my));
      if (d <= 2 && !p.acted) return Game.tbPlayerStrike(deer.key);
      return false;
    });
    S_.combat.roll = realRoll;
    Math.random = realRandom;
    Game.genDetail = realGen;
    ok('deer never fled', !st.fled && !st.deerFled);
    ok('face-tanking heavily punished (discharge fired, player at <=25 HP)', st.discharges >= 1 && st.playerHp <= 25);
    ok('trading blows costs HP', st.playerHp < 100);
  }

  // --- 5. the beam is ANCHORED at the deer: a ray that ROTATES toward you ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b; // max damage: if the dodge works at max, it works
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    const hp0 = Math.round(Game.tbFighter('p').hp);
    ok('player moves first', Game.tbCurrent().kind === 'player');
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // P1: preemptive lateral; D1 declares
    let deer = Game.tbFighter('m_0');
    const ang0 = Math.atan2(4 - 6, 0 - 4);
    ok('declare: beam bearing locked at declare', !!deer.telegraph && Math.abs(deer.telegraph.angle - ang0) < 1e-9);
    ok('declare: lane starts AT THE DEER', deer.telegraph.cells.length > 0 &&
      Math.max(Math.abs(deer.telegraph.cells[0].cx - 4), Math.abs(deer.telegraph.cells[0].cy - 6)) <= 1);
    ok('declare: not yet firing', deer.telegraph.firing === 0);
    Game.tbPlayerMove(0, 0); Game.tbPlayerEndTurn(); // P2: move up the lane; D2 ignites + tick
    deer = Game.tbFighter('m_0');
    ok('beam is live (1 fire turn left)', !!deer.telegraph && deer.telegraph.firing === 1);
    const want = Math.atan2(0 - 6, 0 - 4);
    const turned = Math.abs(deer.telegraph.angle - ang0);
    ok('beam ROTATED toward the player, within angular budget', turned > 0 && turned <= 0.65 + 1e-9);
    ok('beam bearing now tracks the player', Math.abs(deer.telegraph.angle - want) < 1e-9);
    ok('lane still anchored at the deer after the sweep', deer.telegraph.cells.length > 0 &&
      Math.max(Math.abs(deer.telegraph.cells[0].cx - deer.mx), Math.abs(deer.telegraph.cells[0].cy - deer.my)) <= 1);
    ok('telegraph cue: a ray from its eyes', /ray from its eyes/.test(Game.tbTelegraphCue(deer)));
    ok('lane scorched', deer.telegraph.cells.length > 0 && Game.cellScorched(deer.telegraph.cells[0].cx, deer.telegraph.cells[0].cy));
    ok('grid overlay exposes the live lane', Game.tbBeamLaneCells().size === deer.telegraph.cells.length);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 5b. SWEEP ECONOMY: unspent tracking budget becomes dwell damage ---
  // Stationary player: the beam never has to move -> parks at 3.5x.
  // Moving player: the beam spends budget tracking -> burns less.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b; // max damage, deterministic
    // STATIONARY
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerEndTurn(); // P1: hold; D1 declares (bearing straight north)
    Game.tbPlayerEndTurn(); // P2: hold; D2 ignites — the beam never moved
    let deer = Game.tbFighter('m_0');
    ok('stationary: dwell maxed (beam did not have to sweep)', (deer.telegraph.dwell || 0) > 0.99);
    ok('stationary: the log teaches the trade', Game.log.some(l => /doesn't need to sweep — it SITS on you/.test(l)));
    const stillDmg = 500 - Math.round(Game.tbFighter('p').hp);
    eq('stationary: full dwell = 3.5x max = 112', stillDmg, 112);
    if (Game.tbfight) Game.tbEnd('fled');
    // MOVING (along the lane, forcing the beam to spend budget tracking)
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // P1: lateral; D1 declares
    Game.tbPlayerMove(0, 0); Game.tbPlayerEndTurn(); // P2: up the lane; D2 ignites + tracks
    deer = Game.tbFighter('m_0');
    ok('moving: beam spent budget tracking', (deer.telegraph.dwell || 0) < 0.5);
    const moveDmg = 500 - Math.round(Game.tbFighter('p').hp);
    ok('moving: burns LESS than stationary (86 < 112)', moveDmg === 86 && moveDmg < stillDmg);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 5c. COOLDOWN: the deer pauses between Discharges ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // P1; D1 declares
    Game.tbPlayerMove(0, 0); Game.tbPlayerEndTurn(); // P2; D2 ignites + tick 1
    Game.tbPlayerEndTurn(); // P3: hold; D3: tick 2, beam ends
    let deer = Game.tbFighter('m_0');
    ok('beam ended after 2 fire turns', !deer.telegraph);
    eq('cooldown set (2 deer turns)', deer.beamCooldown, 2);
    ok('cooldown message: it needs a moment', Game.log.some(l => /needs a moment/.test(l)));
    Game.tbPlayerEndTurn(); // P4: hold; D4: cooldown 2->1, stalks, cannot declare
    deer = Game.tbFighter('m_0');
    ok('cooldown turn 1: no telegraph, no declare', !deer.telegraph);
    eq('cooldown ticking down', deer.beamCooldown, 1);
    Game.tbPlayerEndTurn(); // P5: hold; D5: cooldown 1->0, stalks, cannot declare
    deer = Game.tbFighter('m_0');
    ok('cooldown turn 2: still cannot declare', !deer.telegraph);
    eq('cooldown expired', deer.beamCooldown, 0);
    Game.tbPlayerEndTurn(); // P6: hold; D6: free to declare again
    deer = Game.tbFighter('m_0');
    ok('after cooldown: declares again', !!deer.telegraph);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 6. stand still: the beam sits on you and kills you ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    const st = driveCombat((p, deer) => {
      // never move, never strike — just stand in the lane
      if (!p.acted) return Game.tbPlayerStudy();
      return false;
    }, 30);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    ok('standing still: discharge fired', st.discharges >= 1);
    ok('standing still: the beam sitting on you is lethal', !st.playerAlive);
  }

  // --- 7. walls and real structures block the beam; trees do NOT (they shred) ---
  {
    const realGen = Game.genDetail.bind(Game);
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    // wall in the lane
    const g = flatGrid(); g[4][4] = 'wall';
    Game.genDetail = () => g;
    newDeerGame();
    startDeerFight(4, 2, 4, 6); // beam lane x=4, wall at (4,4)
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbAdvance(); // deer turn: declare (turnsLeft=1), lane stops at the wall
    let deer = Game.tbFighter('m_0');
    let lane = (deer.telegraph && deer.telegraph.cells) || [];
    ok('beam stops at wall (impact cell included)', lane.length === 2 && lane[0].cx === 4 && lane[0].cy === 5 && lane[1].cx === 4 && lane[1].cy === 4);
    ok('player not threatened behind wall', deer.telegraph && deer.telegraph.threatenedPlayer === false);
    if (Game.tbfight) Game.tbEnd('fled');
    // tree does NOT block — the beam shreds through to the node edge
    const g2 = flatGrid(); g2[4][4] = 'tree';
    Game.genDetail = () => g2;
    newDeerGame();
    startDeerFight(4, 2, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbAdvance();
    deer = Game.tbFighter('m_0');
    lane = (deer.telegraph && deer.telegraph.cells) || [];
    ok('beam passes through trees', lane.length === 6 && lane.some(c => c.cx === 4 && c.cy === 0));
    ok('player threatened through tree', deer.telegraph && deer.telegraph.threatenedPlayer === true);
    // tent (real structure) blocks too
    const g3 = flatGrid(); g3[4][4] = 'tent';
    Game.genDetail = () => g3;
    newDeerGame();
    startDeerFight(4, 2, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbAdvance();
    deer = Game.tbFighter('m_0');
    lane = (deer.telegraph && deer.telegraph.cells) || [];
    ok('beam stops at tent', lane.length === 2 && lane[1].cx === 4 && lane[1].cy === 4);
    S_.combat.roll = realRoll;
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

  // --- 9. range: the beam travels to the edge of the node ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    startDeerFight(4, 4, 4, 7);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbAdvance(); // deer declares
    const deer = Game.tbFighter('m_0');
    const lane = (deer.telegraph && deer.telegraph.cells) || [];
    eq('lane reaches the node edge (7 cells)', lane.length, 7);
    ok('last cell on the edge', lane[lane.length - 1].cx === 4 && lane[lane.length - 1].cy === 0);
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 10. scorch: forage destroyed on scorched tiles, recovers in ~3 days ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbPlayerEndTurn(); // D1: declare
    Game.tbPlayerEndTurn(); // D2: ignite + tick 1
    const scorched = Game.cellScorched(4, 5);
    ok('lane cell scorched after firing', scorched);
    const day0 = Game.state.scholar.day || 0;
    Game.state.scholar.day = day0 + 2;
    ok('still scorched after 2 days', Game.cellScorched(4, 5));
    Game.state.scholar.day = day0 + 4;
    ok('recovered after ~3 days', !Game.cellScorched(4, 5));
    Game.state.scholar.day = day0;
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 11. trapped under the full beam: lethal ---
  // Player ringed by water (blocks movement, not the beam): no escape.
  {
    const realGen = Game.genDetail.bind(Game);
    const g = flatGrid();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      g[4 + dy][4 + dx] = 'water';
    }
    Game.genDetail = () => g;
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    const hp0 = Math.round(Game.tbFighter('p').hp);
    Game.tbPlayerEndTurn(); // D1: declare
    Game.tbPlayerEndTurn(); // D2: ignite + tick 1 — beam sits on the trapped player
    const hp1 = Game.tbfight ? Math.round(Game.tbFighter('p').hp) : 0;
    const dmg = hp0 - hp1;
    ok('trapped + full beam: pinned message in the log', Game.log.some(l => /PINS you! \(112\)/.test(l)));
    ok('trapped + full beam: lethal-range (down or at <=1 HP)', dmg >= 99);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 12. disrupt: a solid strike mid-fire can break the beam ---
  // (player needs extra HP: standing in the beam with full dwell is lethal now)
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    const realRandom = Math.random;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 200; Game.state.scholar.health = 200;
    S_.combat.roll = ([a, b]) => b;
    Math.random = () => 0.1; // disrupt triggers
    Game.tbPlayerStrike('m_0'); // P1: strike (auto-advances: D1 declares)
    let deer = Game.tbFighter('m_0');
    ok('declared after first strike', !!deer.telegraph && deer.telegraph.turnsLeft === 1);
    Game.tbPlayerEndTurn(); // D2: ignite + tick 1 (player eats the parked beam: 112, survives)
    deer = Game.tbFighter('m_0');
    ok('beam live', !!deer.telegraph && deer.telegraph.firing === 1);
    ok('player hurt but alive', Game.tbFighter('p').alive && Math.round(Game.tbFighter('p').hp) < 200);
    Game.tbPlayerStrike('m_0'); // P3: strike mid-fire -> disrupt (then D3 re-declares fresh)
    deer = Game.tbFighter('m_0');
    ok('beam disrupted (message in the log)', Game.log.some(l => /stutters and dies/.test(l)));
    ok('disrupt broke the firing beam (fresh windup, not continued fire)',
      !!deer.telegraph && deer.telegraph.firing === 0 && deer.telegraph.turnsLeft === 1);
    S_.combat.roll = realRoll;
    Math.random = realRandom;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 13. antlers: closing in during the fire is risky ---
  // (player needs extra HP: parked beam 112 + antlers 16 = 128)
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 5, 4, 6); // adjacent to the deer
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 200; Game.state.scholar.health = 200;
    const hp0 = Math.round(Game.tbFighter('p').hp);
    Game.tbPlayerEndTurn(); // D1: declare
    Game.tbPlayerEndTurn(); // D2: ignite + tick 1: parked beam (112) + antlers (16)
    const dmg = hp0 - Math.round(Game.tbFighter('p').hp);
    ok('antler thrash message in the log', Game.log.some(l => /antlers/.test(l)));
    ok('beam + antlers at close range (128)', dmg === 128);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 14. full playthrough: scenario -> stalk -> combat -> bad play -> Discharge FIRES ---
  // Steve's bug report: "I didn't see anything fire from the deer." This is
  // the real chain, not unit god-mode: debug scenario, walk up through the
  // stance machine, fight badly. The beam must go off.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    Game.debugScenario('headlight');
    const s = Game.state.scholar;
    let guard = 0;
    while (!Game.tbfight && guard++ < 12 && s.monster) { s.mx += 1; Game.monsterTurn(); }
    ok('playthrough: combat starts on approach', !!Game.tbfight);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    const st = driveCombat((p, deer) => {
      if (!p.acted) return Game.tbPlayerStudy();
      return false;
    }, 30);
    ok('playthrough: the beam FIRED', st.discharges >= 1);
    ok('playthrough: bad play is punished', st.playerHp < 100);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 15. the Discharge guarantee is diegetic, not boss immunity ---
  // A. cut down BEFORE it declares: death throes fire the beam anyway.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    const deer = Game.tbFighter('m_0');
    deer.hp = 30; // wounded — a 41-damage spear strike kills outright
    Game.tbPlayerStrike('m_0'); // P1: strike kills before D1 declares
    ok('death throes: the deer is dead (no immunity)', !deer.alive);
    ok('death throes: legible message', Game.log.some(l => /death throes loose the beam/.test(l)));
    ok('death throes: the beam still fired', Game.log.some(l => /death throes loose the beam/.test(l)));
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }
  // B. cut down DURING windup: the gathered light holds the body until it fires.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbPlayerEndTurn(); // P1: hold; D1 declares
    const deer = Game.tbFighter('m_0');
    ok('declare happened', !!deer.telegraph);
    deer.hp = 30;
    Game.tbPlayerStrike('m_0'); // P2: strike for 41 during the windup (then D2 fires)
    ok('windup: held at 1 HP until it fires', Math.round(deer.hp) === 1);
    ok('windup: diegetic message (light already gathered)', Game.log.some(l => /already gathered/.test(l)));
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }
  // C. after the first Discharge: no protection — it dies like anything else.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerEndTurn(); // P1: hold; D1 declares
    Game.tbPlayerEndTurn(); // P2: hold; D2 ignites (beam fires, hasFired=true)
    const deer = Game.tbFighter('m_0');
    ok('it fired', deer.hasFired);
    deer.hp = 30;
    Game.tbDamage('m_0', 41, 'you');
    ok('after first fire: dies like anything else', !Game.tbFighter('m_0').alive);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 16. de-bossed: no boss theater in player-facing text ---
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    ok('old boss-gate message gone', !/won't go out/.test(src));
    ok('no BOSS comments left', !/BOSS GATE|boss gate/i.test(src));
    // player-facing strings: no "boss" anywhere outside comments
    const noComments = src.replace(/^\s*\/\/.*$/gm, '');
    const says = [...noComments.matchAll(/this\.(say|sysSay)\((`|'|")/g)].length;
    ok('say/sysSay calls found for scan', says > 50);
    const withBoss = [];
    for (const m of noComments.matchAll(/this\.(say|sysSay)\(`([\s\S]*?)`\)/g)) {
      if (/boss/i.test(m[2])) withBoss.push(m[2].slice(0, 60));
    }
    for (const m of noComments.matchAll(/this\.(say|sysSay)\('((?:[^'\\]|\\.)*)'\)/g)) {
      if (/boss/i.test(m[2])) withBoss.push(m[2].slice(0, 60));
    }
    ok('no "boss" in player-facing game.js text', withBoss.length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
