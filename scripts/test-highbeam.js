// Highbeam Deer fight tests. Usage: node scripts/test-highbeam.js
// Covers Steve's playtest notes + design corrections:
//  - combat card placement (DOM order, not below the fold)
//  - 3-beat windup (windup:2 in data): AIM (freeze + bellow) -> CHARGE
//    (glare swells, whine peaks) -> FIRING. The deer takes its own time.
//  - no one-shot: deer survives ~3 spear hits, never flees
//  - ANCHORED SWEEPING BEAM: a ray FROM THE DEER that ROTATES toward you,
//    SLOW tick-by-tick (sweepRate 0.28 rad/tick — the slowness IS the
//    spectacle). At fight range a committed lateral mover outruns it;
//    hesitate and it gains. Positioning relative to the deer matters.
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
      // ACTION ECONOMY: actions no longer auto-end the turn. The bot acts,
      // then explicitly ends the turn (forfeiting leftover moves, like Wait).
      playerFn(Game.tbFighter('p'), Game.tbfight.fighters.find(f => f.kind === 'monster'));
      if (Game.tbfight && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
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
  eq('windup is 2 (aim -> charge -> fire)', mdef.attack.pattern.windup, 2);
  eq('discharge damage [22,32]', JSON.stringify(mdef.attack.damage), JSON.stringify([22, 32]));
  eq('deer hp [95,115]', JSON.stringify(mdef.hp), JSON.stringify([95, 115]));
  ok('deer never flees (no fleeAt)', !('fleeAt' in mdef));
  ok('codex no longer claims it bolts', !/flees at 50%/.test(mdef.codexStages.slain));
  eq('beam sweeps', mdef.attack.pattern.sweep, true);
  eq('fireTurns 6 (slow tick-by-tick sweep)', mdef.attack.pattern.fireTurns, 6);
  // Steve's tuning: the sweep is SLOW — inevitable but outrunnable. A lateral
  // mover at fight range gains ~0.25-0.33 rad/turn; the beam at 0.28 gains on
  // hesitation and loses to commitment. Every tick is a decision point.
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
    // High HP for 6-tick survival (mechanics test)
    Game.state.scholar.health = 10000;
    Game.state.scholar.maxHealth = 10000;
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 10000;
    Game.tbFighter('p').maxHp = 10000;
    const hp0 = Math.round(Game.tbFighter('p').hp);
    ok('player moves first', Game.tbCurrent().kind === 'player');
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // P1: preemptive lateral; D1 declares (AIM)
    let deer = Game.tbFighter('m_0');
    const ang0 = Math.atan2(4 - 6, 0 - 4);
    ok('declare: beam bearing locked at declare', !!deer.telegraph && Math.abs(deer.telegraph.angle - ang0) < 1e-9);
    ok('declare: lane starts AT THE DEER', deer.telegraph.cells.length > 0 &&
      Math.max(Math.abs(deer.telegraph.cells[0].cx - 4), Math.abs(deer.telegraph.cells[0].cy - 6)) <= 1);
    ok('declare: not yet firing', deer.telegraph.firing === 0);
    ok('declare: aim phase', deer.beamPhase === 'aim');
    ok('declare: bellow in the log', Game.log.some(l => /BELLOWS/.test(l)));
    Game.tbPlayerMove(0, 0); Game.tbPlayerEndTurn(); // P2: move up the lane; D2 charges
    deer = Game.tbFighter('m_0');
    ok('charge: still winding (1 turn left)', !!deer.telegraph && deer.telegraph.turnsLeft === 1 && deer.telegraph.firing === 0);
    ok('charge: charge phase', deer.beamPhase === 'charge');
    ok('charge: whine peaks in the log', Game.log.some(l => /whine climbs past hearing/.test(l)));
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites + tick
    deer = Game.tbFighter('m_0');
    ok('ignite: firing phase', deer.beamPhase === 'firing');
    ok('beam is live (5 fire turns left)', !!deer.telegraph && deer.telegraph.firing === 5);
    const want = Math.atan2(0 - 6, 0 - 4);
    const turned = Math.abs(deer.telegraph.angle - ang0);
    const budget = (deer.telegraph.pattern || {}).sweepRate || 0.28;
    ok('beam ROTATED toward the player, within angular budget', turned > 0 && turned <= budget + 1e-9);
    // SLOW SWEEP (Steve): it does not snap to the player in one tick — it
    // closes by the budget each tick. Verify it moved TOWARD the bearing.
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
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares (bearing straight north)
    Game.tbPlayerWait(); // P2: wait (hold); D2 charges (glare swells)
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites — the beam never moved
    let deer = Game.tbFighter('m_0');
    ok('stationary: dwell maxed (beam did not have to sweep)', (deer.telegraph.dwell || 0) > 0.99);
    ok('stationary: the log teaches the trade', Game.log.some(l => /doesn't need to sweep — it SITS on you/.test(l)));
    const stillDmg = 500 - Math.round(Game.tbFighter('p').hp);
    eq('stationary: full dwell = 3.5x max = 112', stillDmg, 112);
    if (Game.tbfight) Game.tbEnd('fled');
    // MOVING (one tile sideways: the beam must spend its full budget tracking,
    // but still connects — dwell 0, burns less than the parked beam)
    newDeerGame();
    startDeerFight(4, 4, 4, 6);
    Game.tbfight.fighters = Game.tbfight.fighters.filter(f => f.kind !== 'villager');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerWait(); // P1: wait (hold) at (4,4); D1 declares (bearing straight north)
    Game.tbPlayerMove(3, 4); Game.tbPlayerEndTurn(); // P2: one tile sideways; D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites + tracks (spends full budget)
    deer = Game.tbFighter('m_0');
    ok('moving: beam spent budget tracking', (deer.telegraph.dwell || 0) < 0.5);
    const moveDmg = 500 - Math.round(Game.tbFighter('p').hp);
    // slow sweep, full budget spent: dwell 0 -> 2.5x max = 80
    ok('moving: burns LESS than stationary (80 < 112)', moveDmg === 80 && moveDmg < stillDmg);
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
    // High HP for 6-tick survival (mechanics test)
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000; Game.state.scholar.health = 10000;
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // P1; D1 declares
    Game.tbPlayerMove(0, 0); Game.tbPlayerEndTurn(); // P2; D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites (tick 1, firing 6->5)
    Game.tbPlayerWait(); // P4: wait -> tick 2 (firing 5->4); D4 frozen
    Game.tbPlayerWait(); // P5: wait -> tick 3 (firing 4->3)
    Game.tbPlayerWait(); // P6: wait -> tick 4 (firing 3->2)
    Game.tbPlayerWait(); // P7: wait -> tick 5 (firing 2->1)
    Game.tbPlayerWait(); // P8: wait -> tick 6 (firing 1->0 -> cooldown=2); D: cooldown 2->1
    let deer = Game.tbFighter('m_0');
    ok('beam ended after 6 fire turns', !deer.telegraph);
    eq('cooldown set then ticked (2->1)', deer.beamCooldown, 1);
    ok('cooldown message: it needs a moment', Game.log.some(l => /needs a moment/.test(l)));
    ok('cooldown phase', deer.beamPhase === 'cooldown');
    Game.tbPlayerWait(); // P9: wait (hold); D: cooldown 1->0, rekindles to stalk, cannot declare yet
    deer = Game.tbFighter('m_0');
    ok('cooldown turn 2: no telegraph yet', !deer.telegraph);
    eq('cooldown expired', deer.beamCooldown, 0);
    ok('rekindled to stalk', deer.beamPhase === 'stalk');
    eq('cooldown expired', deer.beamCooldown, 0);
    Game.tbPlayerWait(); // P10: wait (hold); D: free to declare again
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
    // Combat strip REMOVED (Steve): redundant with panelCombat below the grid;
    // the strip pushed the grid off-screen. All combat info lives in the panel.
    ok('combat strip removed (no redundant top strip)', !mainCol.includes("combatStripHTML(st) : ''}"));
  }

  // --- 8b. REGRESSION: turn-ending fix (Steve's "turns aren't ending") ---
  // Hold-to-move must not bleed across a turn boundary. When a D-pad step
  // ends the turn (moveLeft resets for a fresh turn), the hold is cleared
  // so a held finger doesn't spend the new turn's movement.
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('moveStepHook clears hold on turn boundary',
      /TURN BOUNDARY[\s\S]*?MoveAnim\.clearHold\(\)/.test(app));
    ok('hold cleared when moveLeft resets (new turn)',
      /pAfter\.moveLeft > mlBefore/.test(app));
  }

  // --- 8c. REGRESSION: info leak gating (Steve) ---
  // The ⚠ warning markers and telegraph cue line must be gated behind
  // encTelegraphKnown, just like the phase badge. First encounter: no
  // warning symbols, no cue text — just beam visuals + audio dread.
  {
    const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    // combatStripHTML: ⚠ gated
    ok('strip ⚠ gated behind known',
      /\(m\.telegraph && known\) \? ' ⚠'/.test(app));
    // combatStripHTML: cue line gated
    ok('strip cue line gated behind known',
      /tgKnown \? `<div class="cs-telegraph">/.test(app));
    // panelCombat: ⚠ gated
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
    Game.tbPlayerEndTurn(); // D2: charge
    Game.tbPlayerEndTurn(); // D3: ignite + tick 1
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
    Game.tbPlayerEndTurn(); // D2: charge
    Game.tbPlayerEndTurn(); // D3: ignite + tick 1 — beam sits on the trapped player
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
    Game.tbPlayerStrike('m_0'); // P1: strike (no auto-advance now)
    Game.tbPlayerEndTurn(); // end P1; D1 declares
    let deer = Game.tbFighter('m_0');
    ok('declared after first strike', !!deer.telegraph && deer.telegraph.turnsLeft === 2);
    Game.tbPlayerWait(); // P2: wait (hold); D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites (tick 1, firing 6->5; player eats the parked beam: 112, survives)
    deer = Game.tbFighter('m_0');
    ok('beam live', !!deer.telegraph && deer.telegraph.firing === 5);
    ok('player hurt but alive', Game.tbFighter('p').alive && Math.round(Game.tbFighter('p').hp) < 200);
    Game.tbPlayerStrike('m_0'); // P4: strike mid-fire -> disrupt
    Game.tbPlayerEndTurn(); // end P4; D4 re-declares fresh
    deer = Game.tbFighter('m_0');
    ok('beam disrupted (message in the log)', Game.log.some(l => /stutters and dies/.test(l)));
    ok('disrupt broke the firing beam (fresh windup, not continued fire)',
      !!deer.telegraph && deer.telegraph.firing === 0 && deer.telegraph.turnsLeft === 2);
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
    Game.tbPlayerEndTurn(); // D2: charge
    Game.tbPlayerEndTurn(); // D3: ignite + tick 1: parked beam (112) + antlers (16)
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
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares
    const deer = Game.tbFighter('m_0');
    ok('declare happened', !!deer.telegraph);
    deer.hp = 30;
    Game.tbPlayerStrike('m_0'); // P2: strike for 41 during the windup (D2 charges, D3 fires)
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
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares
    Game.tbPlayerWait(); // P2: wait (hold); D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites (beam fires, hasFired=true)
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
    // prevent re-declare after cooldown for a clean measurement (restore after)
    const pat = deer.mdef.attack.pattern, realCd = pat.cooldownTurns;
    pat.cooldownTurns = 99;
    const dmx = deer.mx, dmy = deer.my;
    const hp0 = Game.state.scholar.health;
    // one tbAdvance: player passes, monster paws, back to player
    Game.tbAdvance();
    eq('deer does not move while recharging', deer.mx === dmx && deer.my === dmy, true);
    const pawDmg = Math.round(hp0 - Game.state.scholar.health);
    ok('paw hits adjacent player during recharge (8-14)', pawDmg >= 8 && pawDmg <= 14);
    ok('paw teaches the lesson', Game.log.join('\n').includes("isn't free up close"));
    pat.cooldownTurns = realCd;
    if (Game.tbfight) Game.tbEnd('fled');
    // at spear range: safe
    newDeerGame();
    Game.genDetail = () => flatGrid();
    const f2 = startDeerFight(4, 4, 4, 6); // range 2
    const deer2 = f2.fighters.find(x => x.kind === 'monster');
    deer2.beamCooldown = 1;
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

  // --- 18. FIFO THREAT QUEUE: first seen, first killed; pain + adjacency switch ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    // place a villager near the player so it joins combat (startCombat takes nearest 4)
    const vRid = (Game.state.village.roster || []).find(rid => rid !== Game.villagerId);
    Game.state.village.positions = Game.state.village.positions || {};
    Game.state.village.positions[vRid] = { mx: 4, my: 5 };
    const f = startDeerFight(4, 4, 4, 6);
    const deer = f.fighters.find(x => x.kind === 'monster');
    const vKey = 'v_' + vRid;
    const jvf = Game.tbFighter(vKey);
    ok('a villager joined for FIFO test', !!jvf);
    jvf.mx = 4; jvf.my = 5; // near the deer
    Game.encScanThreats(deer); // deer notices the close villager
    ok('queue seeded: player noticed', deer.threatQueue.includes('p'));
    ok('queue seeded: villager noticed', deer.threatQueue.includes(vKey));
    // deterministic order for the pain test: player first-seen, villager second
    deer.threatQueue.length = 0;
    Game.encNoticeFighter(deer, 'p');
    Game.encNoticeFighter(deer, vKey);
    eq('FIFO: head is first-seen', Game.encCurrentTarget(deer).key, 'p');
    // PAIN: the villager hurts the deer -> jumps to the front of the line
    Game.encNoticesPain(deer, vKey);
    eq('pain: attacker moves to front', deer.threatQueue[0], vKey);
    eq('pain: current target follows', Game.encCurrentTarget(deer).key, vKey);
    ok('pain: announced', Game.log.some(l => /Pain gets noticed/.test(l)));
    // ADJACENCY: player crowds the deer -> crazy close overrules patience
    Game.tbFighter('p').mx = 4; Game.tbFighter('p').my = 5;
    Game.tbFighter(vKey).mx = 0; Game.tbFighter(vKey).my = 0;
    Game.encScanThreats(deer);
    eq('adjacency: crazy close jumps the queue', deer.threatQueue[0], 'p');
    ok('adjacency: announced', Game.log.some(l => /proximity overrules patience/.test(l)));
    // dead/fled targets are skipped, not stuck
    Game.tbFighter(vKey).alive = false;
    eq('dead head skipped', Game.encCurrentTarget(deer).key, 'p');
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 19. the deer declares on villagers too: aim follows the queue head ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    // place a villager near the player so it joins combat (startCombat takes nearest 4)
    const vRid = (Game.state.village.roster || []).find(rid => rid !== Game.villagerId);
    Game.state.village.positions = Game.state.village.positions || {};
    Game.state.village.positions[vRid] = { mx: 1, my: 1 };
    const f = startDeerFight(0, 0, 4, 6); // player far away at (0,0), deer at (4,6)
    const deer = f.fighters.find(x => x.kind === 'monster');
    const vKey = 'v_' + vRid;
    const vf = Game.tbFighter(vKey);
    ok('villager joined the fight', !!vf);
    vf.mx = 2; vf.my = 2; // near the deer: it notices (notice range 5, LOS clear)
    Game.encScanThreats(deer);
    ok('deer noticed the close villager', deer.threatQueue.includes(vKey));
    // villager to the front via pain (they struck it)
    Game.encNoticesPain(deer, vKey);
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares — on the villager, not the player
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
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares on the player
    eq('declare on queue head', deer.telegraph.aimKey, 'p');
    const p = Game.tbFighter('p');
    p.mx = 0; p.my = 0; // sprint to the far corner
    Game.tbPlayerWait(); // P2: wait (hold); D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites — still the player, across the node
    eq('ignite: target not lost by distance', deer.telegraph.aimKey, 'p');
    const want = Math.atan2(0 - 6, 0 - 4);
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
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    ok('combat start: deerNotice (distant wrong call)', calls.some(c => c[0] === 'deerNotice'));
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares
    const tel = calls.find(c => c[0] === 'telegraph');
    ok('declare: telegraph audio fired', !!tel);
    ok('declare: highbeam flag by mdef id (not display name)', !!(tel && tel[1] && tel[1].highbeam === true));
    ok('declare: the BELLOW (deerAggro)', calls.some(c => c[0] === 'deerAggro'));
    const deer = Game.tbFighter('m_0');
    // cooldown with the player adjacent: paw -> snort
    deer.telegraph = null; deer.beamCooldown = 2;
    Game.tbFighter('p').mx = 4; Game.tbFighter('p').my = 5;
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerWait(); // P2: wait (hold); D2: cooldown, paw, snort
    ok('cooldown paw: deerSnort (the animal, not the beam)', calls.some(c => c[0] === 'deerSnort'));
    Game.tbDamage('m_0', 9999, 'you');
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
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    ok('fresh: beam not yet known', !Game.encTelegraphKnown(deer));
    Game.tbPlayerWait(); // P1: wait (hold); D1 declares (AIM)
    ok('windup: NO lane in the overlay for the unknown', Game.tbBeamLaneCells().size === 0);
    ok('windup: telegraph cells exist internally', deer.telegraph.cells.length > 0);
    ok('windup: cue is diegetic, not tactical', /It freezes/.test(Game.tbTelegraphCue(deer)));
    // survive a full discharge -> the codex learns the pattern
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000; Game.state.scholar.health = 10000;
    Game.tbPlayerWait(); // P2: wait (hold); D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites (tick 1)
    Game.tbPlayerWait(); // P4: wait (hold) -> tick 2; D4 frozen
    Game.tbPlayerWait(); // P5: wait (hold) -> tick 3
    Game.tbPlayerWait(); // P6: wait (hold) -> tick 4
    Game.tbPlayerWait(); // P7: wait (hold) -> tick 5
    Game.tbPlayerWait(); // P8: wait (hold) -> tick 6 -> beam ends -> tbLearnPattern
    ok('survived: pattern learned', Game.tbPatternKnown('gallowdeer', 'Ocular Discharge'));
    ok('learned: beam known', Game.encTelegraphKnown(deer));
    // next windup shows the lane + the coaching
    deer.telegraph = {
      kind: 'squares', cells: [{ cx: 4, cy: 5 }], dmg: [22, 32],
      attackName: 'Ocular Discharge', pattern: deer.mdef.attack.pattern,
      turnsLeft: 2, firing: 0,
    };
    eq('learned: windup lane visible in overlay', Game.tbBeamLaneCells().size, 1);
    deer.telegraph.firing = 1;
    ok('learned: tactical coaching appears', /Circle it wide/.test(Game.tbTelegraphCue(deer)));
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 23. TURN PHASES: the full readable rhythm + badge ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    // High HP for 6-tick survival
    Game.tbFighter('p').hp = 10000; Game.tbFighter('p').maxHp = 10000; Game.state.scholar.health = 10000;
    eq('stalk: default phase', deer.beamPhase, 'stalk');
    eq('badge: no phase, no badge', Game.encPhaseBadge(deer), '');
    Game.tbPlayerWait(); // P1: wait; D1 declares
    eq('aim phase', deer.beamPhase, 'aim');
    eq('badge: AIMING', Game.encPhaseBadge(deer), ' 👁 AIMING');
    Game.tbPlayerWait(); // P2: wait; D2 charges
    eq('charge phase', deer.beamPhase, 'charge');
    eq('badge: CHARGING', Game.encPhaseBadge(deer), ' ⚡ CHARGING');
    Game.tbPlayerWait(); // P3: wait; D3 ignites (tick 1)
    eq('firing phase', deer.beamPhase, 'firing');
    eq('badge: FIRING', Game.encPhaseBadge(deer), ' 🔥 FIRING');
    Game.tbPlayerWait(); // P4: wait -> tick 2; D4 frozen, still firing
    eq('still firing after P4', deer.beamPhase, 'firing');
    Game.tbPlayerWait(); // P5: tick 3
    Game.tbPlayerWait(); // P6: tick 4
    Game.tbPlayerWait(); // P7: tick 5
    Game.tbPlayerWait(); // P8: tick 6 -> beam ends -> cooldown
    eq('cooldown phase', deer.beamPhase, 'cooldown');
    eq('badge: SPENT', Game.encPhaseBadge(deer), ' 😮‍💨 SPENT');
    Game.tbPlayerWait(); // P9: wait; D: cooldown 1->0, rekindles -> stalk
    eq('stalk again: the rhythm resets', deer.beamPhase, 'stalk');
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 24. VISIBLE SWEEP: the beam rotates, the ghost shows the arc ---
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // P1: lateral; D1 declares
    Game.tbPlayerMove(0, 0); Game.tbPlayerEndTurn(); // P2: up the lane; D2 charges
    Game.tbPlayerWait(); // P3: wait (hold); D3 ignites + tick 1 (beam rotates)
    ok('swept angle recorded', (deer.telegraph.swept || 0) > 0.1);
    ok('prevCells recorded for the ghost trail', (deer.telegraph.prevCells || []).length > 0);
    ok('ghost overlay exposes the arc', Game.tbBeamPrevLaneCells().size > 0);
    // ACTION-LOCKED: the sweep narration needs a second tick — hesitate and
    // the beam ticks anyway, carving its arc.
    Game.tbPlayerActed(); // P4: hesitate; tick 2 -> swept > 0.45
    ok('sweep narrated once', Game.log.some(l => /carves a bright arc/.test(l)));
    ok('beam is firing (live overlay)', Game.tbBeamIsFiring());
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 25. RENDER PATH: kamehameha, not laser pointer (Steve's phone audit) ---
  // The beam must be unmistakable on the render path: anchored at the deer
  // (source glow), bright core + halo while firing, ash in its wake.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    const deer = f.fighters.find(x => x.kind === 'monster');
    Game.tbFighter('p').hp = 500; Game.state.scholar.health = 500;
    ok('no beam source before telegraph', Game.tbBeamSourceCell() === null);
    ok('no halo before firing', Game.tbBeamHaloCells().size === 0);
    Game.tbPlayerMove(0, 4); Game.tbPlayerEndTurn(); // D1 declares (aim)
    const srcAim = Game.tbBeamSourceCell();
    ok('beam source = deer tile during windup', srcAim === deer.mx + ',' + deer.my);
    Game.tbPlayerEndTurn(); // D2 charges
    ok('beam source persists through charge', Game.tbBeamSourceCell() === deer.mx + ',' + deer.my);
    Game.tbPlayerEndTurn(); // D3 ignites + tick 1
    ok('beam is firing', Game.tbBeamIsFiring());
    const lane = Game.tbBeamLaneCells();
    ok('lane non-empty while firing', lane.size > 0);
    // anchored: every lane cell is on the ray from the deer — first cell adjacent
    const first = deer.telegraph.cells[0];
    ok('lane starts at the deer (anchored)', Math.max(Math.abs(first.cx - deer.mx), Math.abs(first.cy - deer.my)) === 1);
    ok('halo lights the night around the lane', Game.tbBeamHaloCells().size > 0);
    ok('halo excludes lane cells', [...Game.tbBeamHaloCells()].every(k => !lane.has(k)));
    // ash: the sweep scorches, and scorch persists on the render path
    const nkey = Game.map.px + ',' + Game.map.py;
    const scorched = Object.keys((Game.state.scorch || {})[nkey] || {});
    ok('ash in its wake (cells scorched)', scorched.length > 0);
    ok('scorch visible via cellScorched', scorched.some(k => { const [x, y] = k.split(',').map(Number); return Game.cellScorched(x, y); }));
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 26. AUDIO HYGIENE: nothing outlives its encounter (Steve) ---
  // Killing the deer left the beam's sweep hum playing. tbEnd must stop every
  // sustained encounter loop on ANY ending — won, lost, fled, routed.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    let stopped = 0;
    const realAudio = Game.audio;
    Game.audio = { combatEnd: () => { stopped++; } };
    Game.tbEnd('won');
    ok('kill the deer: combatEnd stops the loops', stopped === 1);
    // fresh fight for the flee case
    newDeerGame();
    const f2 = startDeerFight(4, 4, 4, 6);
    f2.fighters = f2.fighters.filter(x => x.kind !== 'villager');
    Game.tbEnd('fled');
    ok('flee: combatEnd stops the loops', stopped === 2);
    Game.audio = realAudio;
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 27. ACTION ECONOMY: turns end when actions run out (Steve) ---
  // No end-turn ceremony. Spend moves + the acted action and the turn
  // advances on its own. Wait forfeits the rest explicitly.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    newDeerGame();
    const f = startDeerFight(4, 4, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
    const p = Game.tbFighter('p');
    // strike alone does NOT end the turn (moves remain)
    Game.tbPlayerStrike('m_0');
    ok('strike does not auto-end the turn', Game.tbIsPlayerTurn());
    ok('acted marked, moves remain', p.acted === true && p.moveLeft === 4);
    // wait forfeits and ends the turn (deer acts, new player turn begins)
    const round0 = Game.tbfight.round;
    Game.tbPlayerWait();
    ok('wait ends the turn (round advanced)', Game.tbfight.round > round0);
    ok('new turn: actions refreshed', p.moveLeft === 4 && p.acted === false);
    Game.genDetail = realGen;
    if (Game.tbfight) Game.tbEnd('fled');
  }

  // --- 28. AGGRO-GATED TERROR: no deerNotice before it sees you (Steve) ---
  // The card is innocent until aggro. The wrong-sounding call plays on actual
  // awareness — not on combat start while it's still just a deer.
  {
    const realGen = Game.genDetail.bind(Game);
    Game.genDetail = () => flatGrid();
    const realAudio = Game.audio;
    let notices = 0;
    Game.audio = { deerNotice: () => { notices++; } };
    newDeerGame();
    // start FAR: outside notice range -> deer unaware at combat start
    const f = startDeerFight(0, 0, 4, 6);
    f.fighters = f.fighters.filter(x => x.kind !== 'villager');
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
