#!/usr/bin/env node
// PROOF: sigW3c BUFFERING — honest future-telegraphs, afterimage frames,
// mirage miss, close-eyes, stand-still whiff, sync window.
// BEFORE (MECHANIC=off): hooks/actions absent -> RED. AFTER: green x3 seeds.
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const OFF = process.env.MECHANIC === 'off';
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

function toPlayerTurn(Game) {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 80) Game.tbAdvance();
}
// ACTION ECONOMY: the turn only advances when moves are spent and the act
// is used — a driver that moves/strikes with moveLeft left over must spend
// the rest, or the fight stalls on the player's turn forever.
function endPlayerTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0;
  if (!p.acted) Game.tbPlayerWait();
  else Game.tbAfterPlayerAction();
}
function endFight(Game) {
  if (Game.tbfight) { try { Game.tbfight.over = true; } catch (e) {} Game.tbfight = null; }
  try { Game.state.scholar.monster = null; } catch (e) {}
}
function mon(Game) { return Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === 'buffering'); }

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const s = Game.state.scholar;
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  console.log('== SIG-W3C BUFFERING PROOF, SEED ' + SEED + (OFF ? ' [MECHANIC=off]' : '') + ' ==');

  ok('OFF/ON: hook registration state matches mode',
    OFF ? (typeof global.MonsterBehaviorHooks.bufMirage === 'undefined') : (typeof global.MonsterBehaviorHooks.bufMirage === 'function'));
  ok('OFF/ON: tbPlayerCloseEyes presence matches mode',
    OFF ? (typeof Game.tbPlayerCloseEyes === 'undefined') : (typeof Game.tbPlayerCloseEyes === 'function'));

  if (OFF) {
    s.health = 9000; s.mx = 4; s.my = 4;
    Game.startCombat('buffering');
    const m = mon(Game);
    Game.tbMonsterTurn(m);
    ok('OFF RED: honest announcement', said.some(t => /IT WILL/.test(t)));
    ok('OFF RED: future pending', !!m.bufPending);
    ok('OFF RED: close-eyes exists', typeof Game.tbPlayerCloseEyes === 'function');
    console.log('  [expected RED above: mechanic absent]');
    console.log(`buffering: ${pass} pass, ${fail} FAIL (BEFORE — mechanic absent, red as expected)`);
    process.exit(fail ? 1 : 0);
  }

  // ---- 1. honest future telegraph: announce -> execute exactly ----
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('buffering');
  let m = mon(Game);
  m.mx = 6; m.my = 4; // keep cells clear
  m.bufPending = null; m.bufCd = 0; m.bufSynced = false; m.bufAlt = false;
  said.length = 0;
  Game.tbMonsterTurn(m); // announce (predict; delta 0 -> whiff announced)
  ok('announce: honest future telegraph', said.some(t => /IT WILL STRIKE WHERE YOU ARE HEADING/.test(t)), said.join('|').slice(0, 160));
  ok('announce: no heading -> whiff pending', m.bufPending && m.bufPending.type === 'whiff');
  const p = Game.tbFighter('p'); p.hp = 9000;
  said.length = 0;
  Game.tbMonsterTurn(m); // execute
  ok('execute: whiff when still (no damage)', p.hp === 9000, 'hp=' + p.hp);
  ok('execute: whiff narrated honestly', said.some(t => /nothing to catch/.test(t)));
  ok('execute: sync window opens', m.bufSynced === true);

  // ---- 2. announced step executes EXACTLY as said ----
  m.bufPending = null; m.bufCd = 0; m.bufSynced = false; m.bufAlt = true; // -> step announce
  said.length = 0;
  Game.tbMonsterTurn(m); // announce step (bufAlt true now -> step)
  ok('step announced', m.bufPending && m.bufPending.type === 'step', JSON.stringify(m.bufPending));
  const bx = m.mx, by = m.my, pdx = m.bufPending.dx, pdy = m.bufPending.dy;
  ok('step announcement names a direction', said.some(t => /IT WILL STEP/.test(t)));
  Game.tbMonsterTurn(m); // execute
  ok('step executes exactly as announced', m.mx === bx + pdx && m.my === by + pdy, `(${bx},${by})+(${pdx},${pdy}) -> (${m.mx},${m.my})`);
  ok('afterimages trail (echoes recorded)', (m.bufEchoes || []).length > 0);

  // ---- 3. mirage: strikes hit the brightest frame -> MISS ----
  toPlayerTurn(Game);
  const pl = Game.tbFighter('p');
  pl.hp = 9000; pl.moveLeft = 3; pl.acted = false;
  pl.mx = 4; pl.my = 4; m.mx = 5; m.my = 4; m.bufSynced = false;
  said.length = 0;
  const mHp0 = m.hp;
  Game.tbPlayerStrike(m.key);
  ok('mirage: strike misses the bright frame', said.some(t => /BRIGHTEST/.test(t)));
  ok('mirage: no damage dealt', m.hp === mHp0);
  ok('mirage: turn consumed', pl.acted === true);

  // ---- 4. close eyes: next strike finds the faintest frame ----
  toPlayerTurn(Game);
  const pl2 = Game.tbFighter('p');
  pl2.moveLeft = 3; pl2.acted = false;
  pl2.mx = 4; pl2.my = 4; m.mx = 5; m.my = 4; m.bufSynced = false;
  said.length = 0;
  ok('close eyes: action works', Game.tbPlayerCloseEyes() === true);
  ok('close eyes: narrated', said.some(t => /close your eyes/.test(t)));
  toPlayerTurn(Game);
  const pl3 = Game.tbFighter('p');
  pl3.moveLeft = 3; pl3.acted = false;
  pl3.mx = 4; pl3.my = 4; m.mx = 5; m.my = 4; m.bufSynced = false;
  said.length = 0;
  const mHp1 = m.hp;
  Game.tbPlayerStrike(m.key);
  ok('eyes closed: swings at the faintest frame', said.some(t => /faintest frame/.test(t)));
  ok('eyes closed: HIT lands', m.hp < mHp1, mHp1 + ' -> ' + m.hp);
  ok('eyes closed: flag consumed by the strike', (pl3.bufEyesClosed || 0) === 0);

  // ---- 5. eyes closed hides the announcement (real tradeoff) ----
  toPlayerTurn(Game);
  const pl4 = Game.tbFighter('p');
  pl4.moveLeft = 3; pl4.acted = false;
  Game.tbPlayerCloseEyes();
  said.length = 0;
  m.bufPending = null; m.bufCd = 0; m.bufSynced = false;
  Game.tbMonsterTurn(m);
  ok('eyes closed: announcement hidden...', !said.some(t => /IT WILL/.test(t)));
  ok('...but the future is still honestly pending', !!m.bufPending);
  // clear the eyes for the next tests
  pl4.bufEyesClosed = 0;

  // ---- 6. stand perfectly still -> predicted strike whiffs ----
  endFight(Game);
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('buffering');
  m = mon(Game); m.mx = 6; m.my = 4;
  toPlayerTurn(Game);
  let pp = Game.tbFighter('p');
  pp.moveLeft = 3; pp.acted = false; pp.hp = 9000;
  pp._bufPrevPos = { mx: 4, my: 4 };
  m.bufPending = null; m.bufCd = 0; m.bufSynced = false; m.bufAlt = false; // next monster turn announces a prediction
  Game.tbPlayerMove(3, 4); Game.tbPlayerWait(); // move left, end turn -> announce
  const pendA = m.bufPending;
  ok('predict announced with honest cell', pendA && pendA.type === 'predict', JSON.stringify(pendA));
  toPlayerTurn(Game);
  pp = Game.tbFighter('p'); pp.moveLeft = 3; pp.acted = false; pp.hp = 9000;
  said.length = 0;
  Game.tbPlayerWait(); // STAND PERFECTLY STILL
  ok('still: predicted strike whiffs (no damage)', pp.hp === 9000, 'hp=' + pp.hp);
  ok('still: whiff narrated', said.some(t => /empty air/.test(t)));

  // ---- 7. keep moving into the prediction -> HIT (honest consequence) ----
  endFight(Game);
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('buffering');
  m = mon(Game); m.mx = 6; m.my = 4;
  toPlayerTurn(Game);
  pp = Game.tbFighter('p');
  pp.moveLeft = 3; pp.acted = false; pp.hp = 9000;
  pp._bufPrevPos = { mx: 4, my: 4 };
  m.bufPending = null; m.bufCd = 0; m.bufSynced = false; m.bufAlt = false; // next monster turn announces a prediction
  Game.tbPlayerMove(3, 4); Game.tbPlayerWait(); // announce: P = (2,4)
  const pendB = m.bufPending;
  ok('predict cell announced', pendB && pendB.type === 'predict' && pendB.x === 2 && pendB.y === 4, JSON.stringify(pendB));
  toPlayerTurn(Game);
  pp = Game.tbFighter('p'); pp.moveLeft = 3; pp.acted = false; pp.hp = 9000;
  said.length = 0;
  Game.tbPlayerMove(2, 4); Game.tbPlayerWait(); // walk INTO the honest prediction
  ok('predictable motion: HIT lands', pp.hp < 9000, 'hp=' + pp.hp);
  ok('hit narrated honestly', said.some(t => /where you were heading/.test(t)));
  endFight(Game);

  // ---- 8. field fight: villagers see the mirage ----
  const mdef = Game.data.monsters.find(x => x.id === 'buffering');
  const vid = (Game.state.village.roster || [])[0];
  const vid2 = (Game.state.village.roster || [])[1];
  Game.state.village.health = Game.state.village.health || {};
  Game.state.village.health[vid] = 900; // fixture: hold the line for more rounds
  const rec = Game.fieldFight(vid, mdef, null, { allies: 1, allyVids: [vid2], allyFromStart: true });
  ok('field: terminates (<=15 rounds)', rec.rounds <= 15, 'rounds=' + rec.rounds);
  ok('field: mirage in the log', rec.log.some(t => /faintest frame/.test(t)));
  ok('field: bright-frame misses happen', rec.log.some(t => /bright frame/.test(t)));

  // ---- 9. full fight terminates <=200 rounds ----
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('buffering');
  m = mon(Game);
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 200) {
    toPlayerTurn(Game);
    if (!Game.tbfight || Game.tbfight.over) break;
    const q = Game.tbFighter('p');
    q.moveLeft = 3;
    if (!q.acted) {
      // close to striking distance first (don't waste the turn at range 2)
      let dd = Math.max(Math.abs(m.mx - q.mx), Math.abs(m.my - q.my));
      let mg = 0;
      while (dd > 1 && q.moveLeft > 0 && mg++ < 6) {
        const nx = q.mx + Math.sign(m.mx - q.mx), ny = q.my + Math.sign(m.my - q.my);
        if (!Game.tbPlayerMove(nx, ny)) break;
        dd = Math.max(Math.abs(m.mx - q.mx), Math.abs(m.my - q.my));
      }
      // close eyes while the mirage is up, strike when synced or eyes shut
      if (!m.bufSynced && !(q.bufEyesClosed > 0)) Game.tbPlayerCloseEyes();
      else if (Math.max(Math.abs(m.mx - q.mx), Math.abs(m.my - q.my)) <= 1) Game.tbPlayerStrike(m.key);
      else Game.tbPlayerWait();
    }
    endPlayerTurn(Game);
  }
  ok('brawl: terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds);
  endFight(Game);

  console.log(`buffering: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF CRASH:', e); process.exit(2); });
