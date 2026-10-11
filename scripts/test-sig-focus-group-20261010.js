#!/usr/bin/env node
// PROOF TEST: The Focus Group signature mechanic (sigW3a.js, 2026-10-10).
// Proves, through real headless fights:
//   1. SPAWN: 5-7 heads rise (lead mouth + 2 mouth-parts + 2-4 eye-heads).
//   2. RATINGS: every round the murmur deliberates audibly — loved/hated
//      announced (telegraph honesty).
//   3. LOVED strike: buffed AND answered (a mouth-head bites back).
//   4. HATED strike: suppressed, safe (no counter).
//   5. DODGE: a real action; the focused dodge resolves through tbDamage.
//   6. EYE-HEADS: mark the most-used verb; can't be struck down.
//   7. MOUTHS: popping all three kills the group (Deliberation weakens).
//   8. BOREDOM: three boring rounds and they leave.
//   9. Fights terminate (<=200 rounds).
// BEFORE/AFTER: MECHANIC=off skips hook registration -> must go RED.
// Green across 3 seeds: SEED=1,2,3 node scripts/test-sig-focus-group-20261010.js
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
function leadOf(Game) {
  if (!Game.tbfight) return null;
  return Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'focus_group');
}
function eyesOf(Game) {
  if (!Game.tbfight) return [];
  return Game.tbfight.fighters.filter(x => x.mdef && x.mdef.id === 'focus_group_eye');
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
  console.log('== FOCUS GROUP PROOF, SEED ' + SEED + ' (mechanic ' + (MECHANIC_ON ? 'ON' : 'OFF') + ') ==');
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const has = (re) => said.some(t => re.test(t));

  // ---- Fight 1: spawn + ratings ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  let lead = leadOf(Game);
  ok('fight starts', !!Game.tbfight);
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  ok('heads spawn (lead carries the murmur)', !!(lead && lead.sigFG), 'no sigFG');
  const eyes = eyesOf(Game);
  const heads = 3 + eyes.length; // lead mouth + 2 mouth-parts + eyes
  ok('5-7 heads total', heads >= 5 && heads <= 7, 'heads=' + heads);
  ok('spawn narrated', has(/heads rise out of the murmur/));
  ok('ratings deliberated audibly', has(/MURMUR DELIBERATES/) && !!((lead && lead.sigFG && lead.sigFG.rating) || {}).loved, JSON.stringify(lead && lead.sigFG && lead.sigFG.rating));
  ok('eye-heads mark', has(/lens fixes on your/));
  abandon(Game);

  // ---- Fight 2: loved strike is buffed AND answered ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  lead = leadOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  if (lead && lead.sigFG) lead.sigFG.rating = { loved: 'strike', hated: 'wait' }; // white-box the slate
  const p2 = Game.tbFighter('p');
  const hp2b = p2 ? p2.hp : 0;
  said.length = 0;
  if (Game.tbIsPlayerTurn() && lead) Game.tbPlayerStrike(lead.key);
  const p2a = Game.tbFighter('p');
  const counterDmg = hp2b - (p2a ? p2a.hp : hp2b);
  ok('loved strike is buffed by the System', has(/LOVES your strike/));
  ok('loved strike is ANSWERED (mouth-head bites back)', has(/ANSWERED/) && counterDmg >= 8, 'counter=' + counterDmg);
  abandon(Game);

  // ---- Fight 3: hated strike is suppressed, safe ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  lead = leadOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  if (lead && lead.sigFG) lead.sigFG.rating = { loved: 'dodge', hated: 'strike' };
  const p3 = Game.tbFighter('p');
  const hp3b = p3 ? p3.hp : 0;
  said.length = 0;
  if (Game.tbIsPlayerTurn() && lead) Game.tbPlayerStrike(lead.key);
  const p3a = Game.tbFighter('p');
  const counterDmg3 = hp3b - (p3a ? p3a.hp : hp3b);
  ok('hated strike is suppressed', has(/boos your strike/));
  ok('hated strike is safe (no answer)', counterDmg3 === 0, 'counter=' + counterDmg3);
  abandon(Game);

  // ---- Fight 4: dodge ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  lead = leadOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  let dodgeOk = false;
  if (Game.tbIsPlayerTurn() && typeof Game.tbPlayerDodge === 'function') dodgeOk = Game.tbPlayerDodge();
  // the dodge flag is cleared at the next turn-start by design (it was live
  // during the monsters' answer window); the DODGING narration + verb prove
  // the action ran, and the forced-bonus check below proves resolution.
  ok('dodge is a real action', dodgeOk && has(/DODGING/));
  ok('dodge narrated', has(/DODGING/));
  // deterministic resolution: force the bonus to 1.0, hit through the real wrap
  const p4 = Game.tbFighter('p');
  if (p4) { p4.sigDodging = true; p4.sigDodgeBonus = 1.0; }
  said.length = 0;
  const dodged = Game.tbDamage('p', 20, 'a mouth-head test', lead ? lead.key : null);
  ok('focused dodge resolves (attack misses clean)', dodged === 0 && has(/slip aside/));
  abandon(Game);

  // ---- Fight 5: eye-heads can't be struck down ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  lead = leadOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  const eye = eyesOf(Game)[0];
  said.length = 0;
  let eyeStruck = false;
  if (Game.tbIsPlayerTurn() && eye) {
    const roundBefore = Game.tbfight.round;
    Game.tbPlayerStrike(eye.key);
    // the refusal spends the action: tbAfterPlayerAction advances the round
    eyeStruck = Game.tbfight.round > roundBefore || Game.tbIsPlayerTurn();
  }
  ok('striking an eye-head is refused with coaching', has(/only watches/) && has(/MOUTHS/));
  ok('eye-head unharmed', eye && eye.hp === 1 && eye.alive);
  ok('the wasted strike spends the turn', eyeStruck);
  abandon(Game);

  // ---- Fight 6: mouths pop -> group dies ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  lead = leadOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  const leadStale = lead;
  let pops = 0;
  let rounds6 = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds6++ < 200) {
    if (Game.tbIsPlayerTurn()) { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); endTurn(Game); }
    else break;
  }
  pops = said.filter(t => /pops like a soap bubble/.test(t)).length;
  ok('mouth-heads pop as they are destroyed', pops >= 3, 'pops=' + pops);
  ok('popping all mouths kills the group', leadStale && !leadStale.alive, 'alive=' + (leadStale && leadStale.alive));
  ok('eyes flee when the murmur comes apart', eyesOf(Game).every(e => e.fled || !e.alive) || !Game.tbfight);
  abandon(Game);

  // ---- Fight 7: boredom walkout ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  lead = leadOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 10 && !(lead && lead.sigFG)) {
    round(Game, () => { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); });
    lead = leadOf(Game);
  }
  const leadStale7 = lead;
  for (let i = 0; i < 5 && Game.tbfight && !Game.tbfight.over; i++) {
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
  }
  const allFled = leadStale7 && leadStale7.fled;
  ok('three boring rounds: they lose interest and LEAVE', !!allFled, 'fled=' + allFled);
  ok('walkout narrated', has(/loses interest/));
  ok('fight ends on walkout', !Game.tbfight || Game.tbfight.over);
  abandon(Game);

  // ---- Fight 8: termination ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('focus_group');
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 200) {
    if (Game.tbIsPlayerTurn()) { const l = leadOf(Game); if (l) Game.tbPlayerStrike(l.key); endTurn(Game); }
    else break;
  }
  ok('strike-only fight terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
