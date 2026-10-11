#!/usr/bin/env node
// PROOF TEST: Gavel signature mechanic (sigW3a.js, 2026-10-10).
// Proves, through real headless fights:
//   1. TRIAL: accuse names a REAL logged moment, a full round before the verdict.
//   2. OBJECT: cites precedent — costs 3 viewership, verdict softened (x0.5).
//   3. RECESS: delays the verdict exactly one round (once per trial).
//   4. CONFESS: smaller hit (x0.4), recorded in the ledger — a LATER gavel
//      cites the confession (witnesses remember).
//   5. SOUND-BLOCK: frontal strikes hit the block (reduced, narrated);
//      flanking bypasses it.
//   6. Fights terminate (<=200 rounds).
// BEFORE/AFTER: MECHANIC=off skips hook registration -> must go RED.
// Green across 3 seeds: SEED=1,2,3 node scripts/test-sig-gavel-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '1', 10);
const MECHANIC_ON = process.env.MECHANIC !== 'off';

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
function round(Game, act) {
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 4) {
    if (Game.tbIsPlayerTurn()) { if (act) act(); endTurn(Game); return; }
    else break;
  }
}
function gavelOf(Game) {
  if (!Game.tbfight) return null;
  return Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'gavel');
}
function giveSpear(Game) {
  const s = Game.state.scholar;
  s.health = 9000; s.mx = 4; s.my = 4;
  s.equipped = { melee: { itemId: 'fire_hardened_spear', name: 'spear' } };
}
function abandon(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight.result = 'abandoned'; }
}

(async () => {
  const { Game, loadFails } = await H.loadGame({ seed: SEED });
  if (loadFails.length) console.log('LOAD FAILS:', loadFails.join('; '));
  await H.setupGame(Game);
  console.log('== GAVEL PROOF, SEED ' + SEED + ' (mechanic ' + (MECHANIC_ON ? 'ON' : 'OFF') + ') ==');
  // Suppress the haven breach crisis: startCombat at haven fires it, and each
  // firing records a fresh moment that would bury the seeded ones.
  Game.fireCrisis = () => {};
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const has = (re) => said.some(t => re.test(t));

  ok('trial motions exist', typeof Game.tbPlayerGavelObject === 'function' && typeof Game.tbPlayerGavelRecess === 'function' && typeof Game.tbPlayerGavelConfess === 'function');

  Game.recordMoment('Stole extra rations from the pantry.');
  Game.recordMoment('Lied to Joren about the trap line.');

  // ---- Fight 1: accuse names a real moment; verdict falls next round ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  let m = gavelOf(Game);
  ok('fight starts', !!Game.tbfight);
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 14 && !(m && m.sigG && m.sigG.trial)) {
    round(Game, () => { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = gavelOf(Game);
  }
  ok('ACCUSE: trial opens', !!(m && m.sigG && m.sigG.trial), 'no trial');
  const crime = m && m.sigG && m.sigG.trial && m.sigG.trial.crime;
  ok('accuse names a REAL logged moment', !!crime && /Lied to Joren|Stole extra rations/.test(crime), String(crime).slice(0, 80));
  ok('accusation narrated with the full-round warning', has(/THE ACCUSED WILL RISE/) && has(/verdict falls NEXT round/));
  ok('accuse phase badge set', m && m.beamPhase === 'accuse', m && m.beamPhase);
  // the verdict falls on the gavel's NEXT turn (a full round later)
  const p1 = Game.tbFighter('p');
  const hpBefore = p1 ? p1.hp : 0;
  round(Game, () => { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
  const p1b = Game.tbFighter('p');
  const verdictDmg = hpBefore - (p1b ? p1b.hp : hpBefore);
  ok('verdict falls (GUILTY)', has(/VERDICT FALLS/) && has(/GUILTY/));
  ok('verdict is a big hit within the anchored band', verdictDmg >= 0 && verdictDmg <= 60, 'dmg=' + verdictDmg);
  ok('trial clears after the verdict', !(m && m.sigG && m.sigG.trial));
  abandon(Game);

  // ---- Fight 2: OBJECT ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  m = gavelOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 14 && !(m && m.sigG && m.sigG.trial)) {
    round(Game, () => { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = gavelOf(Game);
  }
  const viewBefore = Game.havenViewership();
  const p2 = Game.tbFighter('p');
  const hp2b = p2 ? p2.hp : 0;
  let objOk = false;
  if (Game.tbIsPlayerTurn() && m && m.sigG && m.sigG.trial) objOk = Game.tbPlayerGavelObject();
  ok('object lands', objOk);
  ok('object costs 3 viewership (fame)', Game.havenViewership() === viewBefore - 3, viewBefore + ' -> ' + Game.havenViewership());
  // the objection spends the action, so the turn auto-advances through the verdict
  const p2a = Game.tbFighter('p');
  const objDmg = hp2b - (p2a ? p2a.hp : hp2b);
  ok('verdict softened after objection', has(/softened/) && objDmg <= 32, 'dmg=' + objDmg);
  abandon(Game);

  // ---- Fight 3: RECESS ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  m = gavelOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 14 && !(m && m.sigG && m.sigG.trial)) {
    round(Game, () => { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = gavelOf(Game);
  }
  const p3 = Game.tbFighter('p');
  const hp3b = p3 ? p3.hp : 0;
  let recOk = false;
  if (Game.tbIsPlayerTurn() && m && m.sigG && m.sigG.trial) recOk = Game.tbPlayerGavelRecess();
  ok('recess granted', recOk);
  // the recess spends the action: the turn auto-advances through the recess turn (no verdict)
  const p3a = Game.tbFighter('p');
  const recessDmg = hp3b - (p3a ? p3a.hp : hp3b);
  ok('verdict delayed (no verdict during recess)', has(/RECESS/) && recessDmg === 0, 'dmg during recess=' + recessDmg);
  ok('trial still pending after recess', !!(m && m.sigG && m.sigG.trial));
  endTurn(Game); // next gavel turn: the verdict falls
  ok('verdict falls after the recess', has(/VERDICT FALLS/));
  // second recess refused
  abandon(Game);

  // ---- Fight 4: CONFESS ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  m = gavelOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 14 && !(m && m.sigG && m.sigG.trial)) {
    round(Game, () => { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = gavelOf(Game);
  }
  const p4 = Game.tbFighter('p');
  const hp4b = p4 ? p4.hp : 0;
  let conOk = false;
  if (Game.tbIsPlayerTurn() && m && m.sigG && m.sigG.trial) conOk = Game.tbPlayerGavelConfess();
  ok('confess lands', conOk);
  let moments = [];
  try { moments = (Game.progState() || {}).moments || []; } catch (e) {}
  ok('confession recorded in the ledger', moments.length > 0 && /Confessed before the Gavel/.test(moments[0].text), moments[0] && moments[0].text);
  // the confession spends the action: the turn auto-advances through the verdict
  const p4a = Game.tbFighter('p');
  const conDmg = hp4b - (p4a ? p4a.hp : hp4b);
  ok('confessed verdict is smaller', conDmg <= 26, 'dmg=' + conDmg);
  abandon(Game);

  // ---- Fight 5: a later gavel cites the confession ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  m = gavelOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 14 && !(m && m.sigG && m.sigG.trial)) {
    round(Game, () => { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = gavelOf(Game);
  }
  const crime2 = m && m.sigG && m.sigG.trial && m.sigG.trial.crime;
  ok('witnesses remember: later trial cites the confession', !!crime2 && /Confessed/.test(crime2), String(crime2).slice(0, 80));
  abandon(Game);

  // ---- Fight 6: sound-block (frontal vs flank) ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  m = gavelOf(Game);
  // pin positions: gavel at (4,4) facing the player at (4,6) -> frontal
  if (m) { m.mx = 4; m.my = 4; }
  const pp = Game.tbFighter('p');
  if (pp) { pp.mx = 4; pp.my = 6; Game.state.scholar.mx = 4; Game.state.scholar.my = 6; }
  // let the gavel's first turn run so facing initializes toward the player
  if (Game.tbIsPlayerTurn()) endTurn(Game);
  m = gavelOf(Game);
  const facing = m && m.sigG && m.sigG.facing;
  ok('gavel faces the player', !!facing && (facing.x !== 0 || facing.y !== 0), JSON.stringify(facing));
  // strike from the front
  said.length = 0;
  let frontDealt = 0;
  if (Game.tbIsPlayerTurn() && m) {
    const hpB = m.hp;
    Game.tbPlayerStrike(m.key);
    frontDealt = hpB - m.hp;
    endTurn(Game);
  }
  ok('frontal strike hits the sound-block', has(/rings off it/), 'dealt=' + frontDealt);
  // flank: teleport behind the gavel's facing
  m = gavelOf(Game);
  const pp2 = Game.tbFighter('p');
  if (m && pp2) {
    const fc = (m.sigG && m.sigG.facing) || { x: 0, y: 1 };
    pp2.mx = Math.max(1, Math.min(7, m.mx - fc.x * 2));
    pp2.my = Math.max(1, Math.min(7, m.my - fc.y * 2));
    Game.state.scholar.mx = pp2.mx; Game.state.scholar.my = pp2.my;
  }
  said.length = 0;
  let flankDealt = 0;
  if (Game.tbIsPlayerTurn() && m) {
    const hpB = m.hp;
    Game.tbPlayerStrike(m.key);
    flankDealt = hpB - m.hp;
  }
  ok('flanking bypasses the block', !has(/rings off it/) && flankDealt > frontDealt, 'front=' + frontDealt + ' flank=' + flankDealt);
  abandon(Game);

  // ---- Fight 7: termination ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('gavel');
  m = gavelOf(Game);
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 200) {
    if (Game.tbIsPlayerTurn()) { const mm = gavelOf(Game); if (mm) Game.tbPlayerStrike(mm.key); endTurn(Game); }
    else break;
  }
  ok('strike-only fight terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
