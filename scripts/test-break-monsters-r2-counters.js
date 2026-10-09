#!/usr/bin/env node
// BREAK-IT monsters r2 (2026-10-09): COUNTER PLAYABILITY — played, not copy.
// The 10-09 run-5 pass fixed weakness COPY; this run PLAYS the three signature
// wacky/Undertale-style counters in real harness fights and verifies the
// engine does what the copy promises:
//   T1 moderator: "silence is a verb it cannot moderate - go quiet and it
//      loses the thread" — 5 quiet rounds must LIFT the mute, and the next
//      strike must not be a violation.
//   T2 hushwolf: Silent Rush gives no warning — the rush must move adjacent
//      and hit with NO telegraph ever declared (Steve killed the rush
//      indicator 2026-10-06; the telegraph is the silence itself).
//   T3 mirrormoth: "attack from behind (it must face you to flash)" — the
//      flash is a frontal 180° arc from the LOCKED facing; behind it you're
//      safe. "After the flash the wings hang dull" — a real recovery window
//      (encCooldown) where it cannot flash.
// Proof: scripts/test-break-monsters-r2-counters.js (SEED=N for more seeds;
// mulberry32, fixed default, per the PROOF-TEST RNG STABILITY lesson).
'use strict';
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok -', name); }
  else { fail++; console.log('  FAIL -', name, extra ? ':: ' + extra : ''); }
}

function playerTurn(Game) {
  const p = Game.tbFighter('p');
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  p.moveLeft = 6; p.acted = false;
}
// After a strike: forfeit remaining moves via WAIT (the honest turn end —
// tbPlayerWait advances by itself; calling endTurn after a wait double-
// advances per the 2026-10-07 WAIT lesson).
function endTurn(Game) {
  const p = Game.tbFighter('p');
  if (!Game.tbfight || Game.tbfight.over) return;
  if (Game.tbIsPlayerTurn() && p.acted && p.moveLeft > 0) Game.tbPlayerWait();
}
function doWait(Game) { playerTurn(Game); Game.tbPlayerWait(); }
function captureSays(Game) {
  const log = [];
  const orig = Game.say;
  Game.say = (m) => { log.push(String(m)); try { orig.call(Game, m); } catch (e) {} };
  return { log, restore() { Game.say = orig; } };
}

(async () => {
  console.log('seed', H.SEED);

  // ============ T1: moderator silence counter ============
  {
    console.log('T1 moderator — silence lifts the mute (played)');
    const Game = await H.newCombatReadyGame();
    const cap = captureSays(Game);
    const mk = H.synthFight(Game, 'moderator', { mhp: 400, php: 300 });
    const t = Game.tbFighter(mk), p = Game.tbFighter('p');
    t.mx = 5; t.my = 4; p.mx = 4; p.my = 4;
    // Build a strike habit and reach round 4+: strike, wait x4.
    for (let i = 0; i < 4 && Game.tbfight && !Game.tbfight.over; i++) {
      playerTurn(Game); t.mx = 5; t.my = 4; // keep it in reach (test rigging)
      Game.tbPlayerStrike(mk);
      endTurn(Game);
    }
    check('moderator reaches muting phase', t.beamPhase === 'muting' || t.beamPhase === 'shadowban',
      'phase=' + t.beamPhase + ' round=' + Game.tbfight.round);
    const mutedBefore = (t.modMuted || []).slice();
    check('mute targets the strike habit', mutedBefore.includes('strike'),
      'modMuted=' + JSON.stringify(mutedBefore));
    const viol0 = t.modViolations || 0;
    // Go quiet: five waits. The window fills with silence; the mute must lift.
    for (let i = 0; i < 5 && Game.tbfight && !Game.tbfight.over; i++) { t.mx = 5; t.my = 4; doWait(Game); }
    const mutedAfter = (t.modMuted || []).slice();
    check('five quiet rounds LIFT the mute', mutedAfter.length === 0,
      'modMuted=' + JSON.stringify(mutedAfter));
    check('lift is announced plainly (no silent lift)', cap.log.some(m => /lost the thread/i.test(m)));
    // The next strike must NOT be a violation — silence was the counter.
    playerTurn(Game); t.mx = 5; t.my = 4;
    const hp0 = t.hp;
    Game.tbPlayerStrike(mk);
    check('post-lift strike is not a violation', (t.modViolations || 0) === viol0,
      'violations=' + (t.modViolations || 0));
    check('post-lift strike deals damage', t.hp < hp0, 'hp ' + hp0 + ' -> ' + t.hp);
    check('player survived the played fight', Game.tbFighter('p').hp > 0);
    cap.restore();
  }

  // ============ T2: hushwolf silent rush ============
  {
    console.log('T2 hushwolf — the rush gives no warning (played)');
    const Game = await H.newCombatReadyGame();
    const cap = captureSays(Game);
    const mk = H.synthFight(Game, 'hushwolf', { mhp: 60, php: 400 });
    const t = Game.tbFighter(mk), p = Game.tbFighter('p');
    t.mx = 1; t.my = 4; p.mx = 4; p.my = 4; // distance 3 — it must close
    const hp0 = p.hp;
    let telegraphSeen = false;
    let rushHit = false;
    for (let r = 0; r < 10 && Game.tbfight && !Game.tbfight.over; r++) {
      doWait(Game);
      if (Game.tbfight && t.telegraph) telegraphSeen = true;
      if (cap.log.some(m => /no warning, just teeth/i.test(m))) rushHit = true;
      if (rushHit) break;
    }
    check('the rush landed (it moves adjacent and hits)', rushHit);
    check('player took real damage from the silent rush', p.hp < hp0, 'hp ' + hp0 + ' -> ' + p.hp);
    check('NO telegraph was ever declared for the rush', !telegraphSeen);
    check('no rush-indicator UI text exists', !cap.log.some(m => /rush incoming|about to rush|preparing to rush/i.test(m)));
    cap.restore();
  }

  // ============ T3: mirrormoth facing + recovery ============
  {
    console.log('T3 mirrormoth — behind it you are safe; the wings go dull (played)');
    const Game = await H.newCombatReadyGame();
    const cap = captureSays(Game);
    const mk = H.synthFight(Game, 'mirrormoth', { mhp: 80, php: 200 });
    const t = Game.tbFighter(mk), p = Game.tbFighter('p');
    t.mx = 6; t.my = 4; p.mx = 4; p.my = 4;
    // Drive until the fold is declared (telegraph set, facing locked).
    // The moth is a drifter (follows:false) whose approach jitter can wander
    // it out of its own flash range — the disengage rule then ends the fight
    // before it ever acts (a real "sent to fight" edge, noted in evidence).
    // For the counter test we start it LANDED: tbMothApproach holds still and
    // the fold declares on its first turn.
    let declared = false;
    for (let r = 0; r < 6 && Game.tbfight && !Game.tbfight.over; r++) {
      t.mx = 5; t.my = 4; p.mx = 4; p.my = 4;
      t.beamPhase = 'land';
      doWait(Game);
      if (Game.tbfight && t.telegraph) { declared = true; break; }
    }
    check('the fold is declared (facing locks)', declared);
    if (!declared || !Game.tbfight || Game.tbfight.over) {
      check('facing locked toward the player at declare', false, 'fold never declared — cannot test arc');
      check('behind the locked facing: the flash misses', false, 'fold never declared');
      check('post-flash recovery window is real (encCooldown)', false, 'fold never declared');
      check('recovery turn: no flash while gathering itself', false, 'fold never declared');
      check('recovery turn: no damage while it recovers', false, 'fold never declared');
      cap.restore();
    } else {
    const fc = t.mothFacing || {};
    check('facing locked toward the player at declare',
      (Math.sign(p.mx - t.mx) || 0) === (fc.x || 0) || (Math.sign(p.my - t.my) || 1) === (fc.y === undefined ? 1 : fc.y),
      'facing=' + JSON.stringify(fc));
    // Slip BEHIND it before the flash resolves: opposite of the locked facing.
    const fx = fc.x || 0, fy = (fc.y === undefined || fc.y === null) ? 1 : fc.y;
    p.mx = Math.max(0, Math.min(8, t.mx - Math.sign(fx) * 2 || t.mx));
    p.my = Math.max(0, Math.min(8, t.my - Math.sign(fy) * 2 || t.my));
    // ensure strictly behind: dot of (player - moth) with facing <= 0
    if ((p.mx - t.mx) * fx + (p.my - t.my) * fy > 0) { p.mx = t.mx; p.my = t.my; } // degenerate — stand under it
    const behindDot = (p.mx - t.mx) * fx + (p.my - t.my) * fy;
    const hpBefore = p.hp;
    playerTurn(Game); Game.tbPlayerWait(); // the flash resolves on its turn
    const tookFlash = p.hp < hpBefore;
    check('behind the locked facing: the flash misses', !tookFlash,
      'dot=' + behindDot + ' hp ' + hpBefore + ' -> ' + p.hp);
    check('post-flash recovery window is real (encCooldown)', (t.encCooldown || 0) > 0,
      'encCooldown=' + t.encCooldown);
    // The next turn it holds, dull and lightless — no second flash yet.
    const hpMid = p.hp;
    playerTurn(Game); Game.tbPlayerWait();
    check('recovery turn: no flash while gathering itself',
      cap.log.some(m => /dull, lightless/i.test(m)));
    check('recovery turn: no damage while it recovers', p.hp === hpMid,
      'hp ' + hpMid + ' -> ' + p.hp);
    cap.restore();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
