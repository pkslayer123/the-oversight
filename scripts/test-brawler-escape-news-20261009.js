#!/usr/bin/env node
// BRAWLER BREAK-IT 2026-10-09: awayNews escape-text bug.
// resolveWildMonsterEncounter (game.js) pushes awayNews strings with
// double-escaped unicode (\\u2694, \\U0001FA78, \\U0001F480) — Python-style
// escapes inside JS template literals. The player sees literal "\u2694\uFE0F"
// text instead of ⚔️, i.e. raw escape text leaking into the UI.
// Before fix: FAIL (literal backslash-u in awayNews).
// After fix: PASS (real emoji, no literal escapes).
const H = require('./combat-break-harness.js');
const fs = require('fs'), path = require('path');
// fieldFights.js is not in the shared harness FILES list; load it so
// fieldFightSummary exists (self-attaching: Object.assign onto Game).
eval(fs.readFileSync(path.join(H.ROOT, 'src/js/fieldFights.js'), 'utf8'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const vid = Game.state.village.roster[0];
  const m = { id: 'hushwolf', tx: 2, ty: 3 };

  const outcomes = ['vKill', 'mFlee', 'vFlee', 'vDie'];
  const collected = [];
  for (const oc of outcomes) {
    s.awayNews = [];
    // Force the outcome: replace fieldFight with a fixed record.
    Game.fieldFight = () => ({ outcome: oc, rounds: 3, vTaken: 20, mDealt: 40,
      vHpLeft: 80, mHpLeft: oc === 'vKill' ? 0 : 25, packCount: 1, log: [] });
    try { Game.resolveWildMonsterEncounter(vid, Object.assign({}, m)); }
    catch (e) { console.log(`  (outcome ${oc} threw: ${String(e).slice(0, 100)})`); }
    collected.push(...(s.awayNews || []));
  }

  console.log('--- awayNews strings ---');
  for (const n of collected) console.log('  NEWS: ' + n);
  const raw = collected.join(' ');
  // Bug shape: Python-style \U0001FA78 in a JS template literal evaluates to
  // the literal text "U0001FA78" (JS has no \U escape) — raw escape text in UI.
  check('no literal U0001FA78 / U0001F480 text in awayNews',
    !/U0001FA78|U0001F480/.test(raw), raw.slice(0, 120));
  check('no literal \\u escape text in awayNews', !/\\u[0-9a-fA-F]{4}/.test(raw), raw.slice(0, 120));
  check('mauling news carries a blood mark (not raw text)',
    collected.some(n => n.includes('🩸')), raw.slice(0, 200));
  check('death news carries a skull mark (not raw text)',
    collected.some(n => n.includes('💀')), raw.slice(0, 200));
  check('at least one news entry was produced', collected.length >= outcomes.length,
    'collected=' + collected.length);

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
