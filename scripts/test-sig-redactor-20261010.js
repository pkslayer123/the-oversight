#!/usr/bin/env node
// PROOF TEST: The Redactor signature mechanic (sigW3a.js, 2026-10-10).
// Proves, through real headless fights:
//   1. POINT -> REDACT: the handles point at a named target a full round
//      before the redaction lands (telegraph honesty).
//   2. Weapon redact: the equipped weapon is disabled for 2 rounds, then
//      comes back (narrated, never silent).
//   3. Decoy: a carried decoy (decoy:true) is redacted INSTEAD, destroyed.
//   4. Starve: 2 quiet turns weaken it; a 3rd starves it out (flees).
//   5. Last-turn redact: the player's last strike is undone (healed, narrated).
//   6. Footing redact: the player is shoved to a new tile.
//   7. Fights terminate (<=200 rounds).
// BEFORE/AFTER: MECHANIC=off skips hook registration -> must go RED.
// Green across 3 seeds: SEED=1,2,3 node scripts/test-sig-redactor-20261010.js
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
// Drive one full round: if it's the player's turn, run act() then end it.
function round(Game, act) {
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 4) {
    if (Game.tbIsPlayerTurn()) { if (act) act(); endTurn(Game); return; }
    else break;
  }
}
function redactorOf(Game) {
  if (!Game.tbfight) return null;
  return Game.tbfight.fighters.find(x => x.mdef && x.mdef.id === 'redactor');
}
function giveSpear(Game) {
  const s = Game.state.scholar;
  s.health = 9000; s.mx = 4; s.my = 4;
  s.equipped = { melee: { itemId: 'fire_hardened_spear', name: 'spear' } };
}

(async () => {
  const { Game, loadFails } = await H.loadGame({ seed: SEED });
  if (loadFails.length) console.log('LOAD FAILS:', loadFails.join('; '));
  await H.setupGame(Game);
  console.log('== REDACTOR PROOF, SEED ' + SEED + ' (mechanic ' + (MECHANIC_ON ? 'ON' : 'OFF') + ') ==');
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const has = (re) => said.some(t => re.test(t));

  // ---- Fight 1: point -> weapon redact -> expiry ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('redactor');
  ok('fight starts', !!Game.tbfight);
  let m = redactorOf(Game);
  // drive until the point lands
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 12 && !(m && m.sigR && m.sigR.phase === 'point')) {
    round(Game, () => { const mm = redactorOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = redactorOf(Game);
  }
  ok('POINT telegraph appears (full round of warning)', !!(m && m.sigR && m.sigR.phase === 'point'), JSON.stringify(m && m.sigR && m.sigR.phase));
  ok('point names the weapon', !!(m && m.sigR && m.sigR.target && m.sigR.target.kind === 'weapon'), JSON.stringify(m && m.sigR && m.sigR.target));
  ok('point narrated honestly', has(/POINTING/) && has(/handles ARE the telegraph/));
  // next round: the redaction lands
  if (m) round(Game, () => Game.tbPlayerStrike(m.key));
  const p = Game.tbFighter('p');
  ok('weapon REDACTED after the warning round', !!(p && p.sigRedactWeapon), 'no sigRedactWeapon');
  ok('redaction narrated', has(/REDACTED/));
  let w = null;
  try { w = Game.equippedWeapon(); } catch (e) {}
  ok('equipped weapon reads unarmed while redacted', !!(w && w.unarmed), JSON.stringify(w && { unarmed: w.unarmed, bonus: w.bonus }));
  // two rounds pass -> the word comes back
  round(Game, () => Game.tbPlayerStrike(m.key));
  round(Game, () => Game.tbPlayerStrike(m.key));
  let w2 = null;
  try { w2 = Game.equippedWeapon(); } catch (e) {}
  ok('weapon un-redacts after 2 rounds', !!(w2 && !w2.unarmed), JSON.stringify(w2 && { unarmed: w2.unarmed }));
  ok('un-redact narrated', has(/un-redacts/));
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight.result = 'abandoned'; }

  // ---- Fight 2: decoy absorbs ----
  giveSpear(Game);
  Game.state.scholar.inventory.push({ itemId: 'decoy_rattle', name: 'Tin-Can Rattle', units: 1, kg: 0.3 });
  said.length = 0;
  Game.startCombat('redactor');
  m = redactorOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 12 && !(m && m.sigR && m.sigR.phase === 'point')) {
    round(Game, () => { const mm = redactorOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = redactorOf(Game);
  }
  ok('decoy pointed at (loudest first)', !!(m && m.sigR && m.sigR.target && m.sigR.target.kind === 'decoy'), JSON.stringify(m && m.sigR && m.sigR.target));
  if (m) round(Game, () => Game.tbPlayerStrike(m.key));
  const decoyGone = !Game.state.scholar.inventory.some(i => i.itemId === 'decoy_rattle');
  ok('decoy destroyed by the redaction', decoyGone);
  const p2 = Game.tbFighter('p');
  ok('weapon NOT redacted when decoy present', !(p2 && p2.sigRedactWeapon));
  ok('decoy consumption narrated', has(/goes QUIET/));
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight.result = 'abandoned'; }

  // ---- Fight 3: starve ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('redactor');
  m = redactorOf(Game);
  const mStale = m; // tbfight clears when the fight ends; the object persists
  for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
  }
  ok('two quiet turns starve it', !!(mStale.sigR && mStale.sigR.starved), JSON.stringify(mStale.sigR && { quiet: mStale.sigR.quiet, starved: mStale.sigR.starved }));
  ok('starvation narrated', has(/STARVING/));
  ok('third quiet turn: it flees', !!mStale.fled, 'fled=' + mStale.fled);
  ok('fight ends when it starves out', !Game.tbfight || Game.tbfight.over);
  if (Game.tbfight && !Game.tbfight.over) { if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight.result = 'abandoned'; } }

  // ---- Fight 4: last-turn undo ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('redactor');
  m = redactorOf(Game);
  // let one full point->redact cycle pass, then force the rotation to lastTurn
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 16 && (m && m.sigR ? m.sigR.cycle : 0) < 1) {
    round(Game, () => { const mm = redactorOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = redactorOf(Game);
  }
  if (m) m.sigR.cycle = 1; // white-box: next point targets the last turn
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 12 && !(m && m.sigR && m.sigR.phase === 'point')) {
    round(Game, () => { const mm = redactorOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = redactorOf(Game);
  }
  ok('point targets the last turn', !!(m && m.sigR && m.sigR.target && m.sigR.target.kind === 'lastTurn'), JSON.stringify(m && m.sigR && m.sigR.target));
  // The point captured the strike that was recorded when it was declared.
  // Wait (quiet, non-aggressive) so the redact undoes exactly that strike.
  const pending = Game.tbfight ? Game.tbfight.sigLastStrike.dmg : 0;
  const hpAtPoint = m ? m.hp : 0;
  ok('a strike was recorded to undo', pending > 0, 'pending=' + pending);
  if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
  const hpAfter = m ? m.hp : 0;
  ok('last turn undone (wound un-written)', hpAfter - hpAtPoint >= pending - 1, 'healed=' + (hpAfter - hpAtPoint) + ' pending=' + pending);
  ok('undo narrated, never silent', has(/redacts your last turn/));
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight.result = 'abandoned'; }

  // ---- Fight 5: footing shove ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('redactor');
  m = redactorOf(Game);
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 16 && (m && m.sigR ? m.sigR.cycle : 0) < 1) {
    round(Game, () => { const mm = redactorOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = redactorOf(Game);
  }
  if (m) m.sigR.cycle = 2; // white-box: next point targets footing
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 12 && !(m && m.sigR && m.sigR.phase === 'point')) {
    round(Game, () => { const mm = redactorOf(Game); if (mm) Game.tbPlayerStrike(mm.key); });
    m = redactorOf(Game);
  }
  ok('point targets footing', !!(m && m.sigR && m.sigR.target && m.sigR.target.kind === 'footing'));
  const pp = Game.tbFighter('p');
  const px = pp ? pp.mx : -1, py = pp ? pp.my : -1;
  if (m) round(Game, () => Game.tbPlayerStrike(m.key));
  const moved = !!(pp && (pp.mx !== px || pp.my !== py));
  ok('footing redacted: player shoved', moved, 'still at ' + (pp ? pp.mx + ',' + pp.my : 'n/a'));
  ok('shove narrated', has(/FOOTING/));
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight.result = 'abandoned'; }

  // ---- Fight 6: termination ----
  giveSpear(Game);
  said.length = 0;
  Game.startCombat('redactor');
  m = redactorOf(Game);
  let rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds++ < 200) {
    if (Game.tbIsPlayerTurn()) { Game.tbPlayerStrike(m.key); endTurn(Game); }
    else break;
  }
  ok('strike-only fight terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'rounds=' + rounds + ' over=' + (Game.tbfight && Game.tbfight.over));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
