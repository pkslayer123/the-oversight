#!/usr/bin/env node
// COMBAT BREAK-IT: honesty checks (Steve 2026-10-08).
// Attacks:
//   H1. STRIKE NUMBER HONESTY — tbPlayerStrike says "You STRIKE for ${d}"
//       BEFORE heckler-shame / scarred-brace / understudy-steal reductions
//       are applied. The displayed number can exceed the actual damage.
//   H2. FEASTBURN HONESTY — progression.js wraps feastBurn(): the base says
//       "FEASTBURN (−300 banked, ×1.5)" but the wrapper silently multiplies by
//       feastSurge (1.5x) / arc4burn. Displayed x != applied x.
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function captureSay(Game) {
  const lines = [];
  const orig = Game.say;
  Game.say = function (m) { lines.push(String(m)); return orig.call(this, m); };
  return { lines, restore() { Game.say = orig; } };
}

(async () => {
  const Game = await H.newCombatReadyGame();

  console.log('--- H1. strike display vs actual with SCARRED brace ---');
  {
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 200 });
    const t = Game.tbFighter(mk);
    t.mx = 5; t.my = 4; // adjacent: unarmed range 1
    t.scarBraced = true; // veteran scarred: first strike -3
    const cap = captureSay(Game);
    const hpBefore = t.hp;
    Game.tbPlayerStrike(mk);
    cap.restore();
    const strikeLine = cap.lines.find(l => /STRIKE.*for \d+/.test(l));
    const said = strikeLine ? parseInt(strikeLine.match(/for (\d+)/)[1], 10) : null;
    const actual = hpBefore - t.hp;
    console.log(`    said: ${said}, actual: ${actual}`);
    check('H1 displayed damage == actual damage', said === actual, `said ${said}, dealt ${actual}`);
  }

  console.log('--- H2. feastBurn surge multiplier is stated ---');
  {
    const s = Game.state.scholar;
    s.prog = s.prog || {};
    s.prog.feastSurge = true; // channeled keepsake: 1.5x on the burn
    s.kcal = 5000;
    const cap = captureSay(Game);
    const ret = Game.feastBurn();
    cap.restore();
    const saidMults = cap.lines.join(' ').match(/[×x]([\d.]+)/g) || [];
    const saidMax = Math.max(...saidMults.map(m => parseFloat(m.slice(1))), 0);
    console.log(`    said multipliers: ${saidMults.join(', ')}, returned: ${ret}`);
    check('H2 stated multiplier matches applied multiplier',
      saidMults.length > 0 && Math.abs(saidMax - ret) < 0.01,
      `said [${saidMults}], applied ${ret}`);
    s.prog.feastSurge = false;
  }

  console.log(`\n${fail ? 'BROKEN' : 'HELD'} — ${pass} pass, ${fail} fail (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
