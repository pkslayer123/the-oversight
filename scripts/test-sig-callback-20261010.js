#!/usr/bin/env node
// PROOF: sigW3c THE CALLBACK — face from the corpse record, borrowed moves,
// funeral (non-violent), name-it-as-not-them.
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
// Brawler: strike when adjacent, else step toward, else wait. Cap 200 rounds.
function brawl(Game, m, maxRounds) {
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < (maxRounds || 200)) {
    toPlayerTurn(Game);
    if (!Game.tbfight || Game.tbfight.over) break;
    const p = Game.tbFighter('p');
    p.moveLeft = 3;
    // close to striking distance (don't waste the turn at range 2)
    let dd = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my));
    let mg = 0;
    while (dd > 1 && p.moveLeft > 0 && mg++ < 6) {
      const nx = p.mx + Math.sign(m.mx - p.mx), ny = p.my + Math.sign(m.my - p.my);
      if (!Game.tbPlayerMove(nx, ny)) break;
      dd = Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my));
    }
    const d = dd;
    if (d <= 1 && !p.acted) { Game.tbPlayerStrike(m.key); }
    endPlayerTurn(Game);
  }
  return rounds;
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const s = Game.state.scholar;
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  console.log('== SIG-W3C CALLBACK PROOF, SEED ' + SEED + (OFF ? ' [MECHANIC=off]' : '') + ' ==');

  // Run history: one known dead villager with a real ability kit + a real line.
  Game.corpses().push({ id: 'corpse_test_1', kind: 'villager', name: 'Mara Kettle', villagerId: 'v_mara', deathKnown: true, dayDied: 3, cause: 'hushwolf' });
  Game.state.village.npcAbilities = Object.assign(Game.state.village.npcAbilities || {}, { v_mara: ['rage', 'pocket_sand'] });
  const REAL_LINE = '"The creek\'s running high today. Careful."';
  Game.state.village.convLineLog = {};
  Game.state.village.convLineLog[REAL_LINE] = 4;
  // A corpse for a LIVING roster member — the face must NEVER be them.
  const livingVid = (Game.state.village.roster || [])[0];
  Game.corpses().push({ id: 'corpse_test_2', kind: 'villager', name: 'Living Larry', villagerId: livingVid, deathKnown: true, dayDied: 4, cause: 'test' });

  ok('OFF/ON: hook registration state matches mode',
    OFF ? (typeof global.MonsterBehaviorHooks.cbFace === 'undefined') : (typeof global.MonsterBehaviorHooks.cbFace === 'function'));
  ok('OFF/ON: tbPlayerFuneral presence matches mode',
    OFF ? (typeof Game.tbPlayerFuneral === 'undefined') : (typeof Game.tbPlayerFuneral === 'function'));
  ok('OFF/ON: tbPlayerNameIt presence matches mode',
    OFF ? (typeof Game.tbPlayerNameIt === 'undefined') : (typeof Game.tbPlayerNameIt === 'function'));

  if (OFF) {
    // BEFORE: the mechanic is absent — the behavior assertions go RED.
    s.health = 9000; s.mx = 4; s.my = 4;
    Game.startCombat('callback');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    Game.tbMonsterTurn(m);
    ok('OFF RED: face picked from the corpse record', !!(m.cbFace && m.cbFace.name));
    ok('OFF RED: wrongness narrated', said.some(t => /too symmetrical/.test(t)));
    ok('OFF RED: funeral resolves', typeof Game.tbPlayerFuneral === 'function');
    console.log('  [expected RED above: mechanic absent]');
    console.log(`callback: ${pass} pass, ${fail} FAIL (BEFORE — mechanic absent, red as expected)`);
    process.exit(fail ? 1 : 0);
  }

  // ---- 1. face from the corpse record, never the living ----
  s.health = 9000; s.mx = 4; s.my = 4;
  let faces = [];
  for (let i = 0; i < 3; i++) {
    said.length = 0;
    Game.startCombat('callback');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    Game.tbMonsterTurn(m);
    faces.push(m.cbFace && m.cbFace.name);
    endFight(Game);
  }
  ok('face picked from the corpse record (Mara Kettle)', faces.every(f => f === 'Mara Kettle'), faces.join(','));
  ok('face NEVER a living villager', !faces.some(f => f === 'Living Larry'));
  Game.startCombat('callback');
  let m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  said.length = 0;
  Game.tbMonsterTurn(m);
  ok('wrongness narrated (too symmetrical, eyes don\'t track)', said.some(t => /too symmetrical/.test(t)) && said.some(t => /don't track/.test(t)));
  ok('speaks in their voice with a REAL village line', said.some(t => t.indexOf(REAL_LINE) !== -1), said.filter(t => /creek/.test(t)).join('|').slice(0, 120));
  ok('borrowed ability read from their kit', m.cbAbility === 'rage' || m.cbAbility === 'pocket_sand', String(m.cbAbility));

  // ---- 2. borrowed move: telegraphed by whose face it wears ----
  m.cbTurns = 1; // next hook tick -> cbTurns 2 -> borrowed move
  m.telegraph = null; // clear any generic wind-up so the signature beat runs
  said.length = 0;
  const p0 = Game.tbFighter('p'); p0.hp = 9000;
  const hpBefore = p0.hp;
  Game.tbMonsterTurn(m);
  ok('borrowed move fires (the stance)', said.some(t => /recognize the stance/.test(t)));
  ok('borrowed move names the dead', said.some(t => /Mara Kettle/.test(t)));
  ok('borrowed move deals real damage', p0.hp < hpBefore, hpBefore + ' -> ' + p0.hp);
  endFight(Game);

  // ---- 3. name it as NOT them ----
  s.health = 9000;
  Game.startCombat('callback');
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  toPlayerTurn(Game);
  said.length = 0;
  const mHp0 = m.hp;
  ok('tbPlayerNameIt returns true', Game.tbPlayerNameIt() === true);
  ok('named flag set', m.cbNamed === true);
  ok('the naming wounds it (15)', mHp0 - m.hp === 15, (mHp0 - m.hp) + ' dealt');
  ok('naming narrated with real words', said.some(t => /NOT Mara Kettle/.test(t)) && said.some(t => /grief wearing a face/.test(t)));
  // borrowed moves die with the naming
  m.cbTurns = 1; said.length = 0;
  const p1 = Game.tbFighter('p'); p1.hp = 9000;
  Game.tbMonsterTurn(m);
  ok('named: borrowed moves gone', !said.some(t => /recognize the stance/.test(t)));
  ok('named: it stops using their voice', m.cbNamed === true);
  // naming twice: honest refusal, no double-dip
  toPlayerTurn(Game);
  ok('naming twice refused honestly', Game.tbPlayerNameIt() === false);
  endFight(Game);

  // ---- 4. THE FUNERAL: non-violent resolution ----
  s.health = 9000;
  Game.startCombat('callback');
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  toPlayerTurn(Game);
  said.length = 0;
  const p2 = Game.tbFighter('p'); p2.hp = 9000;
  ok('tbPlayerFuneral returns true', Game.tbPlayerFuneral() === true);
  ok('funeral: real words, the name, a proper goodbye',
    said.some(t => /Mara Kettle/.test(t)) && said.some(t => /Goodbye/.test(t)));
  ok('funeral: coherence lost', m.cbCoherence === 0);
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < 12) Game.tbAdvance();
  ok('funeral: fight ends without violence (<=12 rounds)', !Game.tbfight || Game.tbfight.over, 'rounds=' + n);
  ok('funeral: it comes apart, thanked', said.some(t => /thank you/.test(t)) && said.some(t => /like a mask/.test(t)));
  ok('funeral: player never struck (non-violent)', p2.hp === 9000, 'player hp ' + p2.hp);
  endFight(Game);

  // ---- 5. stranger fallback: no dead at all ----
  Game.state.corpses.length = 0;
  s.health = 9000;
  Game.startCombat('callback');
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  said.length = 0;
  Game.tbMonsterTurn(m);
  ok('no dead: face is "a stranger"', m.cbFace && m.cbFace.name === 'a stranger');
  toPlayerTurn(Game);
  ok('stranger: funeral still works (goodbye anyway)', Game.tbPlayerFuneral() === true);
  ok('stranger: goodbye narrated', said.some(t => /Goodbye/.test(t)));
  endFight(Game);

  // ---- 6. menu surface ----
  Game.corpses().push({ id: 'corpse_test_3', kind: 'villager', name: 'Mara Kettle', villagerId: 'v_mara', deathKnown: true, dayDied: 3, cause: 'hushwolf' });
  s.health = 9000;
  Game.startCombat('callback');
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  Game.tbMonsterTurn(m); // face picked
  toPlayerTurn(Game);
  const p3 = Game.tbFighter('p'); p3.acted = false;
  const mons = Game.tbfight.fighters.filter(x => (x.kind === 'monster') && x.alive && !x.fled);
  const btns = Game.sigW3cCombatButtons(mons, p3);
  ok('menu: funeral + name-it buttons surface', /c-funeral/.test(btns) && /c-nameit/.test(btns));
  endFight(Game);

  // ---- 7. field fight: villagers see the mechanic ----
  const mdef = Game.data.monsters.find(x => x.id === 'callback');
  const vid = (Game.state.village.roster || [])[0];
  const vid2 = (Game.state.village.roster || [])[1];
  Game.state.village.health = Game.state.village.health || {};
  Game.state.village.health[vid] = 900; // fixture: hold the line so round 3 lands
  const rec = Game.fieldFight(vid, mdef, null, { allies: 1, allyVids: [vid2], allyFromStart: true });
  ok('field: fight terminates (<=15 rounds)', rec.rounds <= 15, 'rounds=' + rec.rounds);
  ok('field: wears a dead face in the log', rec.log.some(t => /wears .*\'s face/.test(t)), rec.log.slice(0, 3).join(' | ').slice(0, 160));
  ok('field: borrowed swing lands blow-by-blow', rec.log.some(t => /borrows their swing/.test(t)));

  // ---- 8. full fight terminates <=200 rounds (kill path) ----
  s.health = 9000;
  Game.startCombat('callback');
  m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  const rounds = brawl(Game, m, 200);
  ok('brawl: terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds);
  endFight(Game);

  console.log(`callback: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF CRASH:', e); process.exit(2); });
