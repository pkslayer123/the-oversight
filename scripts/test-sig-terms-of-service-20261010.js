#!/usr/bin/env node
// PROOF TEST: terms_of_service signature mechanic (sigW3b, 2026-10-10).
// Proves, driving a real headless fight:
//   1. CLAUSES: mid-fight the scroll adds legible glowing clauses (the
//      glow telegraph shows the actual clause text).
//   2. READ: reading reveals the fine print (exact terms); the read counts.
//   3. OBJECT: objecting pays the small cost now (item/kcal/HP — real).
//   4. ACCEPT: accepting schedules the bigger cost N rounds later, and it
//      fires.
//   5. IGNORE: an unanswered clause auto-accepts after 2 rounds — the
//      scroll unrolls toward you, pressure ratchets.
//   6. LOOPHOLE: after 3 clauses read, §0 TERMINATION appears; invoking it
//      dismisses the monster non-violently (fled -> 'routed').
// BEFORE/AFTER: MECHANIC=off skips hook registration -> the gate goes RED.
// Green across 3 seeds: SEED=1,2,3 node scripts/test-sig-terms-of-service-20261010.js
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
function playerTurn(Game) {
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 60) Game.tbAdvance();
}
// wait for a clause to be active (up to N player turns of waiting)
function waitForClause(Game, said, n) {
  for (let i = 0; i < (n || 12); i++) {
    if (!Game.tbfight || Game.tbfight.over) return null;
    const m = monsterOf(Game);
    if (m && m.tosActive) return m;
    playerTurn(Game);
    if (!Game.tbfight || Game.tbfight.over) return null;
    Game.tbPlayerWait();
    endTurn(Game);
  }
  const m = monsterOf(Game);
  return (m && m.tosActive) ? m : null;
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  console.log('== TERMS OF SERVICE PROOF, SEED ' + SEED + ', MECHANIC ' + (MECHANIC_OFF ? 'OFF' : 'ON') + ' ==');
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const audio = [];
  Game.audioEvent = (n, d) => { audio.push(n); };

  const HB = globalThis.MonsterBehaviorHooks || {};
  const mechanicOn = typeof HB.tosClauses === 'function' && typeof Game.tbTosRead === 'function';
  ok('mechanic registered (hook + player actions)', mechanicOn,
    'tosClauses=' + typeof HB.tosClauses + ' tbTosRead=' + typeof Game.tbTosRead);
  if (!mechanicOn) {
    console.log('MECHANIC off — signature absent as expected; skipping behavior checks.');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  const s = Game.state.scholar;
  s.health = 9000; s.mx = 4; s.my = 4; s.kcal = 2000;
  s.inventory = [
    { itemId: 'torch', name: 'Pitch torch', units: 1 },
    { itemId: 'gravel', name: 'Handful of gravel', units: 3 },
  ];
  Game.startCombat('terms_of_service');
  let m = monsterOf(Game);
  let rounds = 0;

  // ---------- 1. the first clause: legible, glowing ----------
  m = waitForClause(Game, said, 12);
  ok('a clause activates mid-fight', !!m, 'rounds=' + rounds);
  const c1 = m.tosActive.def;
  ok('first clause is §3 ARBITRATION (fixed pool order)', c1.id === 'tos_arbitration', c1.id);
  ok('glow telegraph shows the actual clause', said.some(t => /GLOWS/.test(t) && /ARBITRATION/.test(t)));
  ok('clause audio fired', audio.includes('tosClause'));

  // ---------- 2. read: the fine print, exact terms ----------
  said.length = 0;
  playerTurn(Game);
  ok('read action works', Game.tbTosRead() === true);
  endTurn(Game);
  m = monsterOf(Game);
  ok('clause marked read', m.tosActive && m.tosActive.read === true);
  ok('read count incremented', m.tosRead === 1, 'tosRead=' + m.tosRead);
  ok('fine print names the exact costs', said.some(t => /filing fee/.test(t) && /−10 max HP/.test(t)),
    said.join(' ').slice(0, 200));

  // ---------- 3. object: pay the small cost now ----------
  // (assert cleared BEFORE endTurn — the ratchet may add a fresh clause on
  // the monster's turn, which is correct pressure, not a failed objection)
  playerTurn(Game);
  const invBefore = (s.inventory || []).length;
  ok('object action works', Game.tbTosObject() === true);
  m = monsterOf(Game);
  ok('clause cleared by objection', !m.tosActive);
  ok('objection took the top item (filing fee)', (s.inventory || []).length === invBefore - 1,
    invBefore + ' -> ' + (s.inventory || []).length);
  ok('objection narrated the cost', said.some(t => /OBJECTION FILED/.test(t) && /filing fee/.test(t)));
  ok('pressure ratcheted (interval 3 -> 2)', m.tosEvery === 2, 'every=' + m.tosEvery);
  endTurn(Game);

  // ---------- 4. accept: the bigger cost lands later ----------
  m = waitForClause(Game, said, 12);
  ok('second clause (§7 LATE FEES) activates', !!m && m.tosActive.def.id === 'tos_latefees',
    m && m.tosActive.def.id);
  playerTurn(Game);
  Game.tbTosRead();
  endTurn(Game);
  playerTurn(Game);
  const kcalBefore = s.kcal;
  ok('accept action works', Game.tbTosAccept() === true);
  m = monsterOf(Game);
  ok('accept scheduled the penalty', (m.tosPending || []).length === 1,
    JSON.stringify((m.tosPending || []).map(x => x.def.id)));
  ok('clause cleared by acceptance', !m.tosActive);
  endTurn(Game);
  // advance 3 monster turns; the bailiffs must collect
  for (let i = 0; i < 3; i++) {
    playerTurn(Game);
    if (!Game.tbfight || Game.tbfight.over) break;
    Game.tbPlayerWait();
    endTurn(Game);
  }
  ok('accepted penalty fired (kcal collected)', s.kcal < kcalBefore, kcalBefore + ' -> ' + s.kcal);
  ok('penalty narrated honestly', said.some(t => /bailiffs collect/.test(t)));

  // ---------- 5. ignore: auto-accept + pressure ratchet ----------
  // (whatever clause is active — the pool cycles under the ratchet)
  m = waitForClause(Game, said, 12);
  ok('a clause is active to ignore', !!m, m && m.tosActive.def.id);
  const ignoredId = m.tosActive.def.id;
  said.length = 0;
  // ignore it: wait through 3+ monster turns without reading/objecting
  for (let i = 0; i < 5; i++) {
    playerTurn(Game);
    if (!Game.tbfight || Game.tbfight.over) break;
    const mm = monsterOf(Game);
    if (mm && !mm.tosActive) break;
    Game.tbPlayerWait();
    endTurn(Game);
    if (said.some(t => /UNROLLS TOWARD YOU/.test(t))) break;
  }
  m = monsterOf(Game);
  ok('ignored clause auto-accepted (' + ignoredId + ')',
    said.some(t => /UNROLLS TOWARD YOU/.test(t) && /AUTO-ACCEPTED/.test(t)));
  ok('ratchet floor holds (interval stays 2, never 1)', m.tosEvery === 2, 'every=' + m.tosEvery);

  // ---------- 6. loophole: read 3 -> §0 -> invoke -> dismissed ----------
  // reads so far: 2 (§3, §7; the ignored one was never read). Read whatever
  // comes next until 3 are read, clearing each so the scroll keeps writing.
  let guard6 = 0;
  while (m.tosRead < 3 && guard6++ < 24) {
    m = waitForClause(Game, said, 14);
    if (!m || !Game.tbfight || Game.tbfight.over) break;
    if (!m.tosActive.read) {
      playerTurn(Game);
      Game.tbTosRead();
      endTurn(Game);
    }
    playerTurn(Game);
    const mm = monsterOf(Game);
    if (mm && mm.tosActive && mm.tosActive.def.id !== 'tos_loophole') Game.tbTosObject();
    endTurn(Game);
    m = monsterOf(Game);
    if (!m) break;
  }
  m = monsterOf(Game);
  ok('three clauses read', m && m.tosRead >= 3, m && ('tosRead=' + m.tosRead));
  m = waitForClause(Game, said, 12);
  ok('the loophole clause surfaces', !!m && m.tosActive.def.id === 'tos_loophole',
    m && m.tosActive.def.id);
  ok('§0 text is legible', said.some(t => /§0 TERMINATION/.test(t)));
  said.length = 0;
  playerTurn(Game);
  ok('invoke loophole works', Game.tbTosInvokeLoophole() === true);
  // the fight must be over, non-violently
  let g2 = 0;
  while (Game.tbfight && !Game.tbfight.over && g2++ < 10) Game.tbAdvance();
  const ended = !Game.tbfight || Game.tbfight.over;
  ok('fight ends on dismissal', ended);
  ok('dismissal narrated', said.some(t => /TERMINATION ACCEPTED/.test(t)));
  // note: tbEnd clears tbfight; m.fled was the mechanism
  ok('monster fled (non-violent)', m.fled === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); process.exit(1); });
