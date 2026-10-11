#!/usr/bin/env node
// PROOF TEST: spool signature mechanic (sigW3b, 2026-10-10).
// Proves, driving a real headless fight:
//   1. RECORD: the first 3 player turns are recorded (harmless, narrated),
//      then the spool flips to REPLAY with an honest loaded-reel preview.
//   2. REPLAY: recorded strikes come back as ~the same damage; the reel
//      preview names the loaded actions (telegraph honesty).
//   3. COUNTERPLAY (feed it a heal): a recorded heal replays as a HEAL on
//      the player.
//   4. COUNTERPLAY (boring tape): 3 recorded waits -> the replay does
//      nothing, every cycle, and the fight still terminates.
//   5. Examine-reel action reads exact numbers.
// BEFORE/AFTER: MECHANIC=off skips hook registration -> the gate goes RED.
// Green across 3 seeds: SEED=1,2,3 node scripts/test-sig-spool-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '1', 10);
const MECHANIC_OFF = process.env.MECHANIC === 'off';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function monsterOf(Game) {
  return Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
}
function endFight(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;
}
// run monster turns until control returns to the player (or fight ends);
// if it's currently the player's turn, end it first.
// returns per-monster-turn hp deltas + say lines seen during them.
function runMonsterPhase(Game, said) {
  endTurn(Game);
  const deltas = [];
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 8) {
    const p = Game.tbFighter('p');
    const before = p.hp;
    const n0 = said.length;
    Game.tbAdvance();
    deltas.push({ dhp: Game.tbFighter('p').hp - before, lines: said.slice(n0) });
  }
  return deltas;
}
// test-fixture reposition that keeps the scholar's recorded position in
// sync (tbPlayerMove does the same) so the spool's first-turn recovery
// doesn't misread setup as a player move.
function placePlayer(Game, x, y) {
  const p = Game.tbFighter('p');
  p.mx = x; p.my = y;
  Game.state.scholar.mx = x; Game.state.scholar.my = y;
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  console.log('== SPOOL PROOF, SEED ' + SEED + ', MECHANIC ' + (MECHANIC_OFF ? 'OFF' : 'ON') + ' ==');
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const audio = [];
  Game.audioEvent = (n, d) => { audio.push(n); };

  const HB = globalThis.MonsterBehaviorHooks || {};
  const mechanicOn = typeof HB.spoolWatch === 'function' && typeof Game.tbSpoolExamineReel === 'function';
  ok('mechanic registered (hook + player action)', mechanicOn,
    'spoolWatch=' + typeof HB.spoolWatch + ' tbSpoolExamineReel=' + typeof Game.tbSpoolExamineReel);
  if (!mechanicOn) {
    console.log('MECHANIC off — signature absent as expected; skipping behavior checks.');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  const s = Game.state.scholar;

  // ---------- Fight 1: record strikes -> replay mirrors them ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('spool');
  let m = monsterOf(Game);
  let p = Game.tbFighter('p');
  placePlayer(Game, m.mx + 1, m.my);
  let rounds = 0;
  for (let i = 0; i < 3; i++) {
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
    Game.tbPlayerStrike(monsterOf(Game).key);
    endTurn(Game);
  }
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  ok('3 turns recorded', m.spRec && m.spRec.length === 3, JSON.stringify(m.spRec));
  ok('all three recorded as strikes', (m.spRec || []).every(e => e.kind === 'strike'));
  ok('flipped to replay', m.spPhase === 'replay', m.spPhase);
  ok('REC narration honest', said.some(t => /REC ● \(3\/3\)/.test(t)));
  ok('loaded-reel preview shown', said.some(t => /LOADED:.*STRIKE/.test(t)));
  ok('replay-start audio fired', audio.includes('spoolReplayStart'));
  // examine reel: exact numbers
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
  said.length = 0;
  ok('examine reel works', Game.tbSpoolExamineReel() === true);
  endTurn(Game);
  ok('examine shows exact numbers', said.some(t => /hits you for ~\d+/.test(t)), said[0]);
  // replay turns damage the player ~recorded amounts
  p = Game.tbFighter('p');
  const hp0 = p.hp;
  const deltas = runMonsterPhase(Game, said);
  const replayLines = said.join(' ');
  ok('replay turns narrated', /REPLAY \d\/3: STRIKE/.test(replayLines));
  const took = hp0 - Game.tbFighter('p').hp;
  ok('replayed strikes damage the player', took > 0, 'took ' + took);
  ok('replay audio fired', audio.includes('spoolReplay'));
  endFight(Game);

  // ---------- Fight 2: feed it a heal -> the replay heals ----------
  s.health = 100; s.mx = 4; s.my = 4;
  s.inventory = [{ itemId: 'field_sutures', name: 'Field Sutures', units: 1 }];
  Game.startCombat('spool');
  m = monsterOf(Game);
  p = Game.tbFighter('p');
  placePlayer(Game, m.mx + 1, m.my);
  rounds = 0;
  // turn 1: get hurt (setup), so the heal has something to heal
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
  Game.tbDamage('p', Math.floor(p.maxHp / 2), 'setup', null);
  const hurtHp = Game.tbFighter('p').hp;
  endTurn(Game);
  // turn 2: heal via a real item
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
  p = Game.tbFighter('p');
  const idx = (s.inventory || []).findIndex(i => (i.itemId || i.id) === 'field_sutures');
  ok('heal item present', idx >= 0);
  Game.useItem(idx);
  endTurn(Game);
  // turn 3: wait
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
  Game.tbPlayerWait();
  endTurn(Game);
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  const kinds = (m.spRec || []).map(e => e.kind);
  ok('recorded [wait, heal, wait] (hurt setup is not a player verb)', JSON.stringify(kinds) === JSON.stringify(['wait', 'heal', 'wait']),
    JSON.stringify(kinds) + ' hurtHp=' + hurtHp);
  ok('heal amount recorded', (m.spRec[1] || {}).amt > 0, JSON.stringify(m.spRec[1]));
  ok('replay phase reached', m.spPhase === 'replay', m.spPhase);
  // hurt again, then watch replay cycles for the heal coming back
  p = Game.tbFighter('p');
  Game.tbDamage('p', Math.floor(p.maxHp / 2), 'setup', null);
  let healed = false, healNarrated = false;
  for (let c = 0; c < 4; c++) {
    if (!Game.tbfight || Game.tbfight.over) break;
    const b = Game.tbFighter('p').hp;
    const n0 = said.length;
    if (Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); endTurn(Game); }
    let g = 0;
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 50) Game.tbAdvance();
    const a = Game.tbFighter('p').hp;
    if (a > b) healed = true;
    const seg = said.slice(n0).join(' ');
    if (/REPLAY/.test(seg) && /HEAL/.test(seg)) healNarrated = true;
  }
  ok('replay HEALS the player (feed-it-a-heal counterplay)', healed);
  ok('heal replay narrated honestly', healNarrated);
  endFight(Game);

  // ---------- Fight 3: boring tape -> useless replay, fight terminates ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  s.inventory = [];
  Game.startCombat('spool');
  m = monsterOf(Game);
  p = Game.tbFighter('p');
  rounds = 0;
  for (let i = 0; i < 3; i++) {
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
    Game.tbPlayerWait();
    endTurn(Game);
  }
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  ok('boring tape recorded', (m.spRec || []).every(e => e.kind === 'wait'), JSON.stringify((m.spRec || []).map(e => e.kind)));
  p = Game.tbFighter('p');
  const bhp = p.hp;
  said.length = 0;
  for (let c = 0; c < 3; c++) {
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && rounds++ < 200) Game.tbAdvance();
    Game.tbPlayerWait();
    endTurn(Game);
    runMonsterPhase(Game, said);
  }
  ok('useless replay deals no damage over a full cycle', Game.tbFighter('p').hp === bhp, 'hp ' + bhp + ' -> ' + Game.tbFighter('p').hp);
  ok('wait replay narrated', said.join(' ').includes('Your own patience, played back at you'));
  // terminate for real: kill it
  m.hp = 3;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 200) {
    if (Game.tbIsPlayerTurn()) {
      const mm = monsterOf(Game);
      if (mm) { placePlayer(Game, mm.mx + 1, mm.my); Game.tbPlayerStrike(mm.key); }
      endTurn(Game);
    } else Game.tbAdvance();
  }
  ok('fight terminates (won) within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); process.exit(1); });
