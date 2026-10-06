// Highbeam Deer fight tests. Usage: node scripts/test-highbeam.js
// Covers Steve's playtest notes + design corrections, rewritten 2026-10-06
// for the REWORKED deer rhythm:
//  - DECLARES AT COMBAT START (not D1): phase='aim', telegraph turnsLeft=1,
//    firing=0, bearing locked, BELLOWS in the log — the moment combat starts.
//  - NO CHARGE PHASE: windup:1 in data. Aim -> FIRES on the deer's first turn.
//    The 'charge' phase name survives in the phaseMap but is never reached.
//  - IGNITION BEAT: the first firing tick is visual-only (no damage) — the
//    "MOVE NOW" warning. Damage starts on the second firing tick.
//  - 5 damage ticks per Discharge (6 fire turns = 1 ignition + 5 damage).
//  - Player move budget: 3 tiles/turn (playerSpeed).
//  - Rhythm: aim -> firing -> cooldown (2) -> stalk -> aim -> ...
//  - ANCHORED SWEEPING BEAM: a ray FROM THE DEER that ROTATES toward you,
//    SLOW tick-by-tick (sweepRate 0.28 rad/tick). At fight range a committed
//    lateral mover outruns it; hesitate and it gains.
//  - SWEEP ECONOMY: unspent angular budget becomes dwell — stand still and
//    it parks the full beam on you (3.5x = 112 max); make it chase and it
//    burns less (2.5x = 80 max).
//  - COOLDOWN between Discharges (2 deer turns) — no every-round pressure.
//  - walls/structures block; trees shred; beam reaches the node edge.
//  - scorch: environmental damage, forage destroyed, recovers in ~3 days.
//  - counterplay: circle it, break the line, close in (antler thrash), disrupt.
//  - NOT A BOSS: no boss theater; the Discharge guarantee is diegetic
//    (windup can't be interrupted; death throes fire the beam).
//  - UI: combatActionsHTML in the combined actions area (panelCombat is dead).
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
// TURN HYGIENE: tbPlayerWait/tbPlayerStrike auto-advance via tbAfterPlayerAction
// when the turn is spent. playerFn acts; we end the turn ONLY if still player's.
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
      playerFn(Game.tbFighter('p'), Game.tbfight.fighters.find(f => f.kind === 'monster'));
      if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
    } else {
      Game.tbAdvance();
    }
    if (!Game.tbfight) break;
  }
  for (const l of Game.log.slice(log0)) {
    if (/lances FROM ITS EYES/.test(l)) stats.discharges++;
    if (/breaks and runs/.test(l)) stats.fled = true;
  }
  stats.over = !Game.tbfight;
  stats.deerDead = !deerRef.alive;
  stats.deerFled = !!deerRef.fled;
  stats.playerAlive = !!pRef.alive;
  stats.playerHp = Math.round(Game.state.scholar.health);
  return stats;
}

// one full player+deer round: wait out the player turn (auto-advances)
// ROBUST: ensures it's actually the player's turn first.
function deerRound() {
  let guard = 0;
  while (Game.tbfight && !Game.tbIsPlayerTurn() && guard++ < 10) Game.tbAdvance();
  if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerWait();
}

(async () => {
  await Game.init();
  const mdef = Game.data.monsters.find(m => m.id === 'gallowdeer');

  // --- 1. data ---
  eq('windup is 1 (aim -> fire, no charge beat)', mdef.attack.pattern.windup, 1);
  eq('discharge damage [22,32]', JSON.stringify(mdef.attack.damage), JSON.stringify([22, 32]));
  eq('deer hp [150,170]', JSON.stringify(mdef.hp), JSON.stringify([150, 170]));
  ok('deer never flees (no fleeAt)', !('fleeAt' in mdef));
  ok('codex no longer claims it bolts', !/flees at 50%/.test(mdef.codexStages.slain));
  eq('beam sweeps', mdef.attack.pattern.sweep, true);
  eq('fireTurns 6 (1 ignition + 5 damage ticks)', mdef.attack.pattern.fireTurns, 6);
  eq('sweepRate 0.28 rad/tick (angular, anchored at deer)', mdef.attack.pattern.sweepRate, 0.28);
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
    Game.ensureVillagerPositions();
    for (const rid of Object.keys(Game.state.village.positions || {})) {
      Game.state.village.positions[rid] = { mx: 0, my: 0 };
    }
    if (s.monster) { s.monster.warned = false; s.monster.warnTurns = 0; }
    for (let i = 0; i < 3; i++) Game.monsterTurn();
    ok('unaware at dist 5 (no warn, no combat)', !Game.tbfight && !(s.monster || {}).warned);
    s.mx = 3; // dist 4
    Game.monsterTurn();
    ok('freeze warning at dist 4', (s.monster || {}).warned === true);
    ok('freeze cue = the aim flavor', Game.log.some(l => /It freezes\. Like a deer in headlights/.test(l)));
    Game.monsterTurn();
    ok('still no combat after 1 warn turn', !Game.tbfight);
    Game.monsterTurn();
    ok('combat starts on approach', !!Game.tbfight);
    Game.canSee = realCanSee;
  }

  // --- 4. face-tanking the sweep is lethal (heavily punished, as designed) ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    const realRandom = Math.random;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    S_.combat.roll = ([a, b]) => b;
    Math.random = () => 0.99; // no disrupt luck
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

  // --- 5. DECLARE AT COMBAT START: the beam is ANCHORED at the deer ---
  // New rhythm: startCombat -> phase='aim', telegraph live (turnsLeft=1),
  // bearing locked, BELLOWS. Player gets ONE turn (3 tiles), then it fires.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    Game.state.scholar.health = 10000;
    Game.state.scholar.maxHealth = 10000;
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 10000;
    Game.tbFighter('p').maxHp = 10000;
    ok('player moves first', Game.tbCurrent().kind === 'player');
    let deer = Game.tbFighter('m_0');
    // DECLARE HAPPENED AT COMBAT START — no waiting for D1
    const ang0 = Math.atan2(4 - 6, 4 - 4); // straight up: player (4,4), deer (4,6)
    ok('declare at start: beam bearing locked', !!deer.telegraph && Math.abs(deer.telegraph.angle - ang0) < 1e-9);
    ok('declare at start: lane starts AT THE DEER', deer.telegraph.cells.length > 0 &&
      Math.max(Math.abs(deer.telegraph.cells[0].cx - 4), Math.abs(deer.telegraph.cells[0].cy - 6)) <= 1);
    ok('declare at start: not yet firing', deer.telegraph.firing === 0);
    ok('declare at start: aim phase', deer.beamPhase === 'aim');
    ok('declare at start: bellow in the log', Game.log.some(l => /BELLOWS/.test(l)));
    ok('declare at start: one-turn windup', deer.telegraph.turnsLeft === 1);
    // P1: preemptive lateral (interior tiles — edges flee); D1 FIRES (ignition)
    Game.tbPlayerMove(1, 4); Game.tbPlayerEndTurn();
    deer = Game.tbFighter('m_0');
    ok('D1: firing phase (no charge beat)', deer.beamPhase === 'firing');
    ok('D1: ignition consumed one fire turn (5 left)', !!deer.telegraph && deer.telegraph.firing === 5);
    const want = Math.atan2(4 - 6, 1 - 4);
    const turned = Math.abs(deer.telegraph.angle - ang0);
    const budget = (deer.telegraph.pattern || {}).sweepRate || 0.28;
    ok('beam ROTATED toward the player, within angular budget', turned > 0 && turned <= budget + 1e-9);
    ok('beam bearing closing on the player, not snapped', Math.abs(deer.telegraph.angle - want) < Math.abs(ang0 - want) - 0.2);
    ok('lane still anchored at the deer after the sweep', deer.telegraph.cells.length > 0 &&
      Math.max(Math.abs(deer.telegraph.cells[0].cx - deer.mx), Math.abs(deer.telegraph.cells[0].cy - deer.my)) <= 1);
    ok('telegraph cue (unknown): terror, no tactics', /swinging wild/.test(Game.tbTelegraphCue(deer)) && !/Circle it wide/.test(Game.tbTelegraphCue(deer)));
    ok('lane scorched', deer.telegraph.cells.length > 0 && Game.cellScorched(deer.telegraph.cells[0].cx, deer.telegraph.cells[0].cy));
    ok('grid overlay exposes the live lane', Game.tbBeamLaneCells().size === deer.telegraph.cells.length);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 5b. SWEEP ECONOMY: unspent tracking budget becomes dwell damage ---
  // Stationary: the beam never moves -> dwell 1.0 -> 3.5x = 112 max per tick.
  // Moving: the beam spends budget tracking -> dwell drops -> 2.5x = 80 max.
  // New rhythm: ONE player turn between declare and fire (ignition is free).
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    // STATIONARY: never move. D1 fires (ignition, free). D2: first damage tick.
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    deerRound(); // P1 wait; D1 FIRES (ignition — no damage, the MOVE NOW warning)
    let deer = Game.tbFighter('m_0');
    ok('ignition: no damage on the first firing tick', Math.round(Game.tbFighter('p').hp) === 10000);
    const hp0 = Math.round(Game.tbFighter('p').hp);
    deerRound(); // P2 wait; D2: first damage tick — beam never moved
    deer = Game.tbFighter('m_0');
    ok('stationary: dwell maxed (beam did not have to sweep)', (deer.telegraph.dwell || 0) > 0.99);
    const stillDmg = hp0 - Math.round(Game.tbFighter('p').hp);
    eq('stationary: full dwell = 3.5x max = 112', stillDmg, 112);
    ok('stationary: the log teaches the trade', Game.log.some(l => /MOVE and the beam has to chase/.test(l)));
    if (Game.tbfight) Game.tbEnd('fled');
    // MOVING: strafe every turn — the beam spends its budget tracking.
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    let dir = -1;
    const strafe = () => {
      const p = Game.tbFighter('p');
      let nx = p.mx + dir;
      if (nx < 1 || nx > 7) { dir = -dir; nx = p.mx + dir; }
      Game.tbPlayerMove(nx, p.my);
      if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
    };
    strafe(); // P1: lateral; D1 FIRES (ignition)
    const hp1 = Math.round(Game.tbFighter('p').hp);
    strafe(); // P2: lateral; D2: damage tick while tracking
    deer = Game.tbFighter('m_0');
    ok('moving: beam spent budget tracking', (deer.telegraph.dwell || 0) < 0.5);
    const moveDmg = hp1 - Math.round(Game.tbFighter('p').hp);
    ok('moving: burns LESS than stationary', moveDmg < stillDmg);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 5c. COOLDOWN: the deer pauses between Discharges ---
  // New rhythm: aim -> firing (6 ticks: 1 ignition + 5 damage) -> cooldown(2)
  // -> stalk -> aim. Each deerRound() = one player wait + one deer turn.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000; Game.state.scholar.health = 10000;
    deerRound(); // D1: FIRES (ignition)
    deerRound(); // D2: damage tick 1
    deerRound(); // D3: tick 2
    deerRound(); // D4: tick 3
    deerRound(); // D5: tick 4
    deerRound(); // D6: tick 5 (firing 1->0) -> cooldown=2
    let deer = Game.tbFighter('m_0');
    ok('beam ended after 6 fire turns', !deer.telegraph);
    eq('cooldown set (2)', deer.beamCooldown, 2);
    ok('cooldown phase', deer.beamPhase === 'cooldown');
    ok('cooldown message: it needs a moment', Game.log.some(l => /needs a moment/.test(l)));
    deerRound(); // D7: cooldown 2->1
    deer = Game.tbFighter('m_0');
    eq('cooldown ticked (2->1)', deer.beamCooldown, 1);
    ok('cooldown turn: no telegraph yet', !deer.telegraph);
    deerRound(); // D8: cooldown 1->0 -> stalk
    deer = Game.tbFighter('m_0');
    eq('cooldown expired', deer.beamCooldown, 0);
    ok('rekindled to stalk', deer.beamPhase === 'stalk');
    deerRound(); // D9: free to declare again
    deer = Game.tbFighter('m_0');
    ok('after cooldown: declares again', !!deer.telegraph && deer.beamPhase === 'aim');
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
      if (!p.acted) return Game.tbPlayerStudy();
      return false;
    }, 30);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    ok('standing still: discharge fired', st.discharges >= 1);
    ok('standing still: the beam sitting on you is lethal', !st.playerAlive);
  }

  // --- 7. walls and real structures block the beam; trees do NOT (they shred) ---
  // Declare happens at startCombat — check the lane immediately, no tbAdvance.
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
    let deer = Game.tbFighter('m_0'); // already declared at combat start
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
    deer = Game.tbFighter('m_0');
    lane = (deer.telegraph && deer.telegraph.cells) || [];
    ok('beam stops at tent', lane.length === 2 && lane[1].cx === 4 && lane[1].cy === 4);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 8. UI: combat actions live in the combined actions area ---
  // (Steve 2026-10-05): combatActionsHTML renders in ord-self — no separate
  // combat card. panelCombat is dead (defined, never called).
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('combatActionsHTML exists (the combat UI)', /function combatActionsHTML\(st\)/.test(app));
    ok('combat actions render in ord-self (the actions area)',
      /<div class="ord-self">\$\{(inCombat|st\.inCombat) \? combatActionsHTML\(st\)/.test(app));
    ok('panelCombat is dead (defined once, never called)',
      (app.match(/panelCombat\(st\)/g) || []).length <= 1);
    ok('enemy status is a compact line, not a card', /combat-enemies/.test(app));
    ok('move budget shown in the enemy line', /moveLeft/.test(app));
  }

  // --- 8b. REGRESSION: turn-ending fix (Steve's "turns aren't ending") ---
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('moveStepHook clears hold on turn boundary',
      /TURN BOUNDARY[\s\S]*?MoveAnim\.clearHold\(\)/.test(app));
    ok('hold cleared when moveLeft resets (new turn)',
      /pAfter\.moveLeft > mlBefore/.test(app));
  }

  // --- 8c. REGRESSION: info leak gating (Steve) ---
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('strip ⚠ gated behind known',
      /\(m\.telegraph && known\) \? ' ⚠'/.test(app));
    ok('strip cue line gated behind known',
      /tgKnown \? `<div class="cs-telegraph">/.test(app));
    ok('panel ⚠ gated behind known',
      /\(m\.telegraph && known\) \? ' ⚠'/.test(app));
  }

  // --- 9. range: the beam travels to the edge of the node ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    startDeerFight(4, 4, 4, 7);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    const deer = Game.tbFighter('m_0'); // declared at combat start
    const lane = (deer.telegraph && deer.telegraph.cells) || [];
    eq('lane reaches the node edge (7 cells)', lane.length, 7);
    ok('last cell on the edge', lane[lane.length - 1].cx === 4 && lane[lane.length - 1].cy === 0);
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 10. scorch: forage destroyed on scorched tiles, recovers in ~3 days ---
  // The ignition tick scorches (visual) — no need to wait for damage.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    deerRound(); // D1: FIRES (ignition) — the lane scorches immediately
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
  // Player ringed by water: no escape. D1 fires (ignition, free). D2+: 112/tick.
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
    deerRound(); // D1: FIRES (ignition — no damage yet, the warning)
    const hpIgn = Math.round(Game.tbFighter('p').hp);
    ok('ignition: trapped but not yet burned', hpIgn === hp0);
    deerRound(); // D2: first damage tick — the full beam PINS (112)
    const hp1 = Game.tbfight ? Math.round(Game.tbFighter('p').hp) : 0;
    const dmg = hp0 - hp1;
    ok('trapped + full beam: pinned message in the log', Game.log.some(l => /PINS you! \(112\)/.test(l)));
    ok('trapped + full beam: lethal-range (down or at <=1 HP)', dmg >= 99);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 12. disrupt: a solid strike mid-fire can break the beam ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    const realRandom = Math.random;
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 300; Game.state.scholar.health = 300;
    S_.combat.roll = ([a, b]) => b;
    Math.random = () => 0.1; // disrupt triggers (0.5 at d>=20)
    Game.tbPlayerStrike('m_0'); // P1: strike during the aim windup
    let deer = Game.tbFighter('m_0');
    ok('struck during windup (telegraph live)', !!deer.telegraph && deer.telegraph.firing === 0);
    if (Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn(); // D1: FIRES (ignition)
    deerRound(); // P2 wait; D2: first damage tick — beam is live
    deer = Game.tbFighter('m_0');
    ok('beam live and burning', !!deer.telegraph && deer.telegraph.firing > 0);
    ok('player hurt but alive', Game.tbFighter('p').alive);
    // (beam may sweep off a stationary target; the firing itself is the threat)
    Game.tbPlayerStrike('m_0'); // P3: strike mid-fire -> disrupt
    deer = Game.tbFighter('m_0');
    ok('beam disrupted (message in the log)', Game.log.some(l => /stutters and dies/.test(l)));
    ok('disrupt broke the firing beam (telegraph cleared)', !deer.telegraph);
    if (Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn(); // D3: re-declares fresh
    deer = Game.tbFighter('m_0');
    ok('disrupt buys a turn: it re-declares fresh (aim, not continued fire)',
      !!deer.telegraph && deer.telegraph.firing === 0 && deer.telegraph.turnsLeft === 1);
    S_.combat.roll = realRoll;
    Math.random = realRandom;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 13. antlers: closing in is risky EVERY turn, not just while firing ---
  // (Steve 2026-10-05): antler thrash hits adjacent foes every deer turn.
  // D1 (aim->ignition): thrash at aim + thrash on the ignition sweep = 32.
  // D2+ (firing): beam (112) + thrash (16) = 128 per round at close range.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const S_ = globalThis.Scattering;
    const realRoll = S_.combat.roll;
    S_.combat.roll = ([a, b]) => b;
    newDeerGame();
    startDeerFight(4, 5, 4, 6); // adjacent to the deer
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    const hp0 = Math.round(Game.tbFighter('p').hp);
    deerRound(); // D1: aim->ignition: antler thrash x2 (aim phase + ignition sweep)
    const d1 = hp0 - Math.round(Game.tbFighter('p').hp);
    ok('antler thrash message in the log', Game.log.some(l => /antlers/.test(l)));
    ok('D1 adjacent: thrash during aim + ignition (took damage)', d1 > 0);
    const hp1 = Math.round(Game.tbFighter('p').hp);
    deerRound(); // D2: firing: parked beam (112) + antlers (16)
    const d2 = hp1 - Math.round(Game.tbFighter('p').hp);
    ok('D2 adjacent: beam + antlers at close range (heavy damage)', d2 >= 100);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 14. full playthrough: scenario -> stalk -> combat -> bad play -> Discharge FIRES ---
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
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000;
    const st = driveCombat((p, deer) => {
      if (!p.acted) return Game.tbPlayerStudy();
      return false;
    }, 30);
    ok('playthrough: the beam FIRED', st.discharges >= 1);
    ok('playthrough: bad play is punished (took beam damage)', st.playerHp < 10000);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 15. the Discharge guarantee is diegetic, not boss immunity ---
  // A. cut down DURING the aim windup: the gathered light holds the body at
  // 1 HP until it fires — then it's just meat that shines.
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
    ok('declared at combat start (aim windup live)', !!deer.telegraph && deer.beamPhase === 'aim');
    deer.hp = 30; // wounded — a 41-damage spear strike kills outright
    Game.tbPlayerStrike('m_0'); // P1: lethal strike during the windup
    ok('windup: held at 1 HP until it fires (no immunity, no quiet death)', Math.round(deer.hp) === 1 && deer.alive);
    ok('windup: diegetic message (light already gathered)', Game.log.some(l => /already gathered/.test(l)));
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }
  // B. the death throes: killed before its first Discharge fires anyway.
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
    deer.hp = 1;
    deer.telegraph = null; // no windup live: a clean kill before it ever aims
    deer.hasFired = false;
    Game.tbDamage('m_0', 41, 'you');
    ok('death throes: the deer is dead (no immunity)', !deer.alive);
    ok('death throes: legible message', Game.log.some(l => /death throes loose the beam/.test(l)));
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
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    deerRound(); // D1: FIRES (ignition)
    deerRound(); // D2: damage tick 1 (hasFired=true)
    const deer = Game.tbFighter('m_0');
    ok('it fired', deer.hasFired);
    deer.hp = 30;
    Game.tbDamage('m_0', 41, 'you');
    ok('after first fire: dies like anything else', !Game.tbFighter('m_0').alive);
    S_.combat.roll = realRoll;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 17. recharge paw: rooted but dangerous up close ---
  {
    newDeerGame();
    const realGen = Game.genDetail;
    Game.genDetail = () => flatGrid();
    const f = startDeerFight(4, 4, 4, 5); // player adjacent to deer
    const deer = f.fighters.find(x => x.kind === 'monster');
    deer.beamCooldown = 2;
    deer.telegraph = null;
    deer.beamPhase = 'cooldown';
    // prevent re-declare after cooldown for a clean measurement (restore after)
    const pat = deer.mdef.attack.pattern, realCd = pat.cooldownTurns;
    pat.cooldownTurns = 99;
    const dmx = deer.mx, dmy = deer.my;
    const hp0 = Game.state.scholar.health;
    Game.tbAdvance(); // player passes, monster paws, back to player
    eq('deer does not move while recharging', deer.mx === dmx && deer.my === dmy, true);
    const pawDmg = Math.round(hp0 - Game.state.scholar.health);
    // paw [8,14] + antler thrash [10,16] (adjacent every turn, not just firing)
    ok('paw + antlers hit adjacent player during recharge', pawDmg >= 18 && pawDmg <= 30);
    ok('paw teaches the lesson', Game.log.join('\n').includes("isn't free up close"));
    pat.cooldownTurns = realCd;
    if (Game.tbfight) Game.tbEnd('fled');
    // at spear range: safe
    newDeerGame();
    Game.genDetail = () => flatGrid();
    const f2 = startDeerFight(4, 4, 4, 6); // range 2
    const deer2 = f2.fighters.find(x => x.kind === 'monster');
    deer2.beamCooldown = 1;
    deer2.telegraph = null;
    deer2.beamPhase = 'cooldown';
    deer2.mdef.attack.pattern.cooldownTurns = 99;
    const hp1 = Game.state.scholar.health;
    Game.tbAdvance(); // player passes, deer breathes (no paw at range 2)
    eq('no paw at spear range', Math.round(hp1 - Game.state.scholar.health), 0);
    eq('deer still rooted at range', deer2.mx === 4 && deer2.my === 6, true);
    deer2.mdef.attack.pattern.cooldownTurns = 2; // restore (mdef is shared global data)
    if (Game.tbfight) Game.tbEnd('fled');
    Game.genDetail = realGen;
  }

  // --- 16. de-bossed: no boss theater in player-facing text ---
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    ok('old boss-gate message gone', !/won't go out/.test(src));
    ok('no BOSS comments left', !/BOSS GATE|boss gate/i.test(src));
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

  // --- 18. FIFO THREAT QUEUE: first seen, first killed; pain + adjacency switch ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const vRid = (Game.state.village.roster || []).find(rid => rid !== Game.villagerId);
    Game.state.village.positions = Game.state.village.positions || {};
    Game.state.village.positions[vRid] = { mx: 4, my: 5 };
    const f = startDeerFight(4, 4, 4, 6);
    const deer = f.fighters.find(x => x.kind === 'monster');
    const vKey = 'v_' + vRid;
    const jvf = Game.tbFighter(vKey);
    ok('a villager joined for FIFO test', !!jvf);
    jvf.mx = 4; jvf.my = 5;
    Game.encScanThreats(deer);
    ok('queue seeded: player noticed', deer.threatQueue.includes('p'));
    ok('queue seeded: villager noticed', deer.threatQueue.includes(vKey));
    deer.threatQueue.length = 0;
    Game.encNoticeFighter(deer, 'p');
    Game.encNoticeFighter(deer, vKey);
    eq('FIFO: head is first-seen', Game.encCurrentTarget(deer).key, 'p');
    Game.encNoticesPain(deer, vKey);
    eq('pain: attacker moves to front', deer.threatQueue[0], vKey);
    eq('pain: current target follows', Game.encCurrentTarget(deer).key, vKey);
    ok('pain: announced', Game.log.some(l => /Pain gets noticed/.test(l)));
    Game.tbFighter('p').mx = 4; Game.tbFighter('p').my = 5;
    Game.tbFighter(vKey).mx = 1; Game.tbFighter(vKey).my = 1;
    Game.encScanThreats(deer);
    eq('adjacency: crazy close jumps the queue', deer.threatQueue[0], 'p');
    ok('adjacency: announced', Game.log.some(l => /proximity overrules patience/.test(l)));
    Game.tbFighter(vKey).alive = false;
    eq('dead head skipped', Game.encCurrentTarget(deer).key, 'p');
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 19. the deer declares on villagers too: aim follows the queue head ---
  // Declare happens at combat start — the aimKey is set from the first bell.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const vRid = (Game.state.village.roster || []).find(rid => rid !== Game.villagerId);
    Game.state.village.positions = Game.state.village.positions || {};
    Game.state.village.positions[vRid] = { mx: 1, my: 1 };
    const f = startDeerFight(1, 1, 4, 6); // player at (1,1), deer at (4,6)
    const deer = f.fighters.find(x => x.kind === 'monster');
    const vKey = 'v_' + vRid;
    const vf = Game.tbFighter(vKey);
    ok('villager joined the fight', !!vf);
    vf.mx = 2; vf.my = 2;
    Game.encScanThreats(deer);
    ok('deer noticed the close villager', deer.threatQueue.includes(vKey));
    Game.encNoticesPain(deer, vKey); // villager struck it -> front of queue
    // force re-declare on the new queue head (declare already happened at start)
    deer.telegraph = null;
    deer.beamPhase = 'stalk';
    deer.beamCooldown = 0;
    Game.tbPlayerWait(); // P1: wait; D1 declares — on the villager, not the player
    eq('declare: aimKey is the queue head (villager)', deer.telegraph.aimKey, vKey);
    ok('not player-centric: the beam is not aimed at you', deer.telegraph.aimKey !== 'p');
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 20. RELENTLESS: walking away doesn't lose the beam ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    eq('declare on queue head at combat start', deer.telegraph.aimKey, 'p');
    const p = Game.tbFighter('p');
    p.mx = 1; p.my = 1; // teleport to the far corner (interior)
    deerRound(); // D1: FIRES (ignition) — still the player, across the node
    eq('ignite: target not lost by distance', deer.telegraph.aimKey, 'p');
    const want = Math.atan2(1 - 6, 1 - 4);
    ok('beam tracks across the node', Math.abs(deer.telegraph.angle - want) < 0.66);
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 21. DEER AUDIO: the animal is audible, not just the beam ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const calls = [];
    const rec = (n) => (d) => calls.push([n, d]);
    Game.audio = {
      deerNotice: rec('deerNotice'), deerAggro: rec('deerAggro'),
      deerSnort: rec('deerSnort'), deerDown: rec('deerDown'),
      telegraph: rec('telegraph'), combatStart: rec('combatStart'),
      impact: rec('impact'), beamSweep: rec('beamSweep'),
      beamSweepStop: rec('beamSweepStop'),
    };
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    // deerNotice fires when the deer becomes aware (dist 2: it sees you)
    ok('combat start: deerNotice (distant wrong call)', calls.some(c => c[0] === 'deerNotice'));
    // declare already happened at combat start
    const tel = calls.find(c => c[0] === 'telegraph');
    ok('declare: telegraph audio fired', !!tel);
    ok('declare: highbeam flag by mdef id (not display name)', !!(tel && tel[1] && tel[1].highbeam === true));
    ok('declare: the BELLOW (deerAggro)', calls.some(c => c[0] === 'deerAggro'));
    const deer = Game.tbFighter('m_0');
    // cooldown with the player adjacent: paw -> snort
    deer.telegraph = null; deer.beamCooldown = 2; deer.beamPhase = 'cooldown';
    Game.tbFighter('p').mx = 4; Game.tbFighter('p').my = 5;
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    deerRound(); // D: cooldown, paw, snort
    ok('cooldown paw: deerSnort (the animal, not the beam)', calls.some(c => c[0] === 'deerSnort'));
    Game.tbDamage('m_0', 99999, 'you');
    ok('death: deerDown (bellow collapses)', calls.some(c => c[0] === 'deerDown'));
    Game.audio = undefined;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 22. CODEX-GATED TELEGRAPH: no lane warning until the pattern is learned ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    ok('fresh: beam not yet known', !Game.encTelegraphKnown(deer));
    // declare happened at combat start (aim) — the unknown sees no lane
    ok('aim: NO lane in the overlay for the unknown', Game.tbBeamLaneCells().size === 0);
    ok('aim: telegraph cells exist internally', deer.telegraph.cells.length > 0);
    ok('aim: cue is diegetic, not tactical', /It freezes/.test(Game.tbTelegraphCue(deer)));
    // survive a full discharge -> the codex learns the pattern
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000; Game.state.scholar.health = 10000;
    deerRound(); // D1: FIRES (ignition)
    deerRound(); // D2: tick 1
    deerRound(); // D3: tick 2
    deerRound(); // D4: tick 3
    deerRound(); // D5: tick 4
    deerRound(); // D6: tick 5 -> beam ends -> tbLearnPattern
    ok('survived: pattern learned', Game.tbPatternKnown('gallowdeer', 'Ocular Discharge'));
    ok('learned: beam known', Game.encTelegraphKnown(deer));
    // next windup shows the lane + the coaching
    deer.telegraph = {
      kind: 'squares', cells: [{ cx: 4, cy: 5 }], dmg: [22, 32],
      attackName: 'Ocular Discharge', pattern: deer.mdef.attack.pattern,
      turnsLeft: 1, firing: 0,
    };
    eq('learned: windup lane visible in overlay', Game.tbBeamLaneCells().size, 1);
    deer.telegraph.firing = 1;
    ok('learned: tactical coaching appears', /Circle it wide/.test(Game.tbTelegraphCue(deer)));
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 23. TURN PHASES: the full readable rhythm + badge ---
  // New rhythm: aim (declare at start) -> firing -> cooldown -> stalk -> aim.
  // No charge beat — windup:1 means the aim IS the windup.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => f.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000; Game.state.scholar.health = 10000;
    eq('aim: declared at combat start', deer.beamPhase, 'aim');
    eq('badge: AIMING', Game.encPhaseBadge(deer), ' 👁 AIMING');
    deerRound(); // D1: FIRES (ignition)
    eq('firing phase', deer.beamPhase, 'firing');
    eq('badge: FIRING', Game.encPhaseBadge(deer), ' 🔥 FIRING');
    deerRound(); // D2: tick 1
    eq('still firing', deer.beamPhase, 'firing');
    deerRound(); // D3: tick 2
    deerRound(); // D4: tick 3
    deerRound(); // D5: tick 4
    deerRound(); // D6: tick 5 -> beam ends -> cooldown
    eq('cooldown phase', deer.beamPhase, 'cooldown');
    eq('badge: SPENT', Game.encPhaseBadge(deer), ' 😮‍💨 SPENT');
    deerRound(); // D7: cooldown 2->1
    eq('still cooling down', deer.beamPhase, 'cooldown');
    deerRound(); // D8: cooldown 1->0 -> stalk
    eq('stalk: the rhythm resets', deer.beamPhase, 'stalk');
    eq('badge: no phase, no badge', Game.encPhaseBadge(deer), '');
    deerRound(); // D9: declares again
    eq('aim again: the cycle repeats', deer.beamPhase, 'aim');
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 24. VISIBLE SWEEP: the beam rotates, the ghost shows the arc ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    // P1: strafe laterally (interior); D1 FIRES (ignition + sweep tick)
    const p = Game.tbFighter('p');
    Game.tbPlayerMove(1, 4);
    if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
    ok('swept angle recorded', (deer.telegraph.swept || 0) > 0.1);
    ok('prevCells recorded for the ghost trail', (deer.telegraph.prevCells || []).length > 0);
    ok('ghost overlay exposes the arc', Game.tbBeamPrevLaneCells().size > 0);
    // hesitate and the beam ticks anyway, carving its arc
    deerRound(); // P2 wait; D2: damage tick
    ok('sweep narrated once', Game.log.some(l => /carves a bright arc/.test(l)));
    ok('beam is firing (live overlay)', Game.tbBeamIsFiring());
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 25. RENDER PATH: kamehameha, not laser pointer (Steve's phone audit) ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    Game.tbFighter('p').hp = 10000; Game.state.scholar.health = 10000;
    Game.tbFighter('p').maxHp = 10000;
    ok('beam source = deer tile during aim (declared at start)', Game.tbBeamSourceCell() === deer.mx + ',' + deer.my);
    ok('no halo before firing', Game.tbBeamHaloCells().size === 0);
    deerRound(); // D1: FIRES (ignition)
    ok('beam is firing', Game.tbBeamIsFiring());
    const lane = Game.tbBeamLaneCells();
    ok('lane non-empty while firing', lane.size > 0);
    const first = deer.telegraph.cells[0];
    ok('lane starts at the deer (anchored)', Math.max(Math.abs(first.cx - deer.mx), Math.abs(first.cy - deer.my)) === 1);
    ok('halo lights the night around the lane', Game.tbBeamHaloCells().size > 0);
    ok('halo excludes lane cells', [...Game.tbBeamHaloCells()].every(k => !lane.has(k)));
    const nkey = Game.map.px + ',' + Game.map.py;
    const scorched = Object.keys((Game.state.scorch || {})[nkey] || {});
    ok('ash in its wake (cells scorched)', scorched.length > 0);
    ok('scorch visible via cellScorched', scorched.some(k => { const [x, y] = k.split(',').map(Number); return Game.cellScorched(x, y); }));
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 26. AUDIO HYGIENE: nothing outlives its encounter (Steve) ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    let stopped = 0;
    const realAudio = Game.audio;
    Game.audio = { combatEnd: () => { stopped++; } };
    Game.tbEnd('won');
    ok('kill the deer: combatEnd stops the loops', stopped === 1);
    newDeerGame();
    const f2 = startDeerFight(4, 4, 4, 6);
    f2.fighters = f2.fighters.filter(f => f.kind !== 'villager');
    Game.tbEnd('fled');
    ok('flee: combatEnd stops the loops', stopped === 2);
    Game.audio = realAudio;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 27. ACTION ECONOMY: turns end when actions run out (Steve) ---
  // Move budget is 3 tiles. Strike alone does NOT end the turn (moves remain).
  // Wait forfeits and ends the turn.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    const p = Game.tbFighter('p');
    eq('move budget is 3 tiles', p.moveLeft, 3);
    Game.tbPlayerStrike('m_0');
    ok('strike does not auto-end the turn', Game.tbIsPlayerTurn());
    ok('acted marked, moves remain', p.acted === true && p.moveLeft === 3);
    const round0 = Game.tbfight.round;
    Game.tbPlayerWait();
    ok('wait ends the turn (round advanced)', Game.tbfight.round > round0);
    ok('new turn: actions refreshed', p.moveLeft === 3 && p.acted === false);
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 28. AGGRO-GATED TERROR: no deerNotice before it sees you (Steve) ---
  // Interior tiles only — grid edges flee. Deer at (4,7), player at (4,1):
  // dist 6 > notice range 5.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const realAudio = Game.audio;
    let notices = 0;
    Game.audio = { deerNotice: () => { notices++; } };
    newDeerGame();
    const f = startDeerFight(4, 1, 4, 7);
    f.fighters = f.fighters.filter(f => f.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    ok('unaware at start: no notice audio', notices === 0);
    ok('unaware at start: queue empty', (Game.encThreatQueue(deer) || []).length === 0);
    // walk into notice range -> aggro -> the call
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4;
    Game.encScanThreats(deer);
    ok('aggro: the call plays when it sees you', notices === 1);
    Game.audio = realAudio;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
