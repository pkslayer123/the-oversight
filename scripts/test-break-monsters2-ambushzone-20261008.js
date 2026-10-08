// Proof: break-it monsters run 2 — dead ambush-zone system removal
// (Steve 2026-10-08).
//
// CATCH (DEAD-CODE, stale-revert casualty): game.js carried a full
// seeded-ground ambush system — tbSeedAmbushZone(), tbAmbushZoneTick(),
// three tick call sites (tbAfterPlayerAction, tbAdvance, tbAdvanceOneAsync)
// — with ZERO seeders: no monster, scenario, or debug path ever creates a
// zone. Worse, the engine side was wiped by a stale-tree revert: combat.js
// lost zoneArmed() and telegraphText() (466 lines gone between b1c90d1 and
// ab148ef), so the dead tick would have THROWN (S.combat.zoneArmed is not a
// function / S.combat.telegraphText is not a function) the moment any zone
// existed. A dead system with a live crash inside — the Alien Players class.
// FIX: removed the seeder, the tick, all three call sites, and the ontology
// claims (game.js header). combat.js is self-consistent (nothing references
// the lost functions anymore).
// This test fails on HEAD (functions exist; engine lacks zoneArmed/
// telegraphText) and passes patched.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};

(async () => {
  const Game = await H.freshGame(4242);
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const combatSrc = fs.readFileSync(path.join(ROOT, 'src/js/engine/combat.js'), 'utf8');

  // 1. The dead system is gone from game.js.
  ok('tbSeedAmbushZone removed', !gameSrc.includes('tbSeedAmbushZone'));
  ok('tbAmbushZoneTick removed', !gameSrc.includes('tbAmbushZoneTick'));
  ok('no ambushZones fight field', !gameSrc.includes('ambushZones'));
  ok('no ambush-zone tick call sites', !gameSrc.includes('AMBUSH-ZONE'));

  // 2. Nothing calls the missing engine functions anymore.
  const missing = ['zoneArmed', 'telegraphText'];
  for (const fn of missing) {
    let callers = 0;
    for (const f of H.ORDER) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const re = new RegExp('\\.' + fn + '\\s*\\(', 'g');
      if (re.test(src)) callers++;
    }
    ok(`zero callers of S.combat.${fn} remain`, callers === 0);
  }
  ok('combat.js exports stay consistent (no dangling refs)',
    !combatSrc.includes('zoneArmed') && !combatSrc.includes('telegraphText'));

  // 3. Ontology no longer claims the removed system.
  ok('ontology drops tbSeedAmbushZone claim',
    !gameSrc.includes('tbSeedAmbushZone(m, pattern, opts)'));
  ok('ontology drops ambush_zone_beat rule',
    !gameSrc.includes('ambush_zone_beat'));

  // 4. Combat still works end-to-end after the removal (bulldozer fight).
  H.seedRng(777001);
  Game.state.scholar.health = 100;
  Game.startCombat('bulldozer');
  const tbf = Game.tbfight;
  let r = 0, threw = null;
  try {
    while (!tbf.over && r < 15) {
      r++;
      Game.tbPlayerWait();
      const p = Game.tbFighter('p');
      if (p && !p.alive && !tbf.over) { p.hp = 60; p.alive = true; }
    }
  } catch (e) { threw = e.message; }
  ok('post-removal combat runs without throwing', threw === null, threw);
  if (!tbf.over) { try { Game.tbEnd('fled'); } catch (e) {} }

  // 5. Ontology validator passes (run as subprocess).
  const { execSync } = require('child_process');
  let vok = false;
  try {
    const out = execSync('node scripts/validate-ontology.js', { cwd: ROOT, encoding: 'utf8' });
    vok = /All \d+ systems validated/.test(out);
  } catch (e) { vok = false; }
  ok('validate-ontology.js passes', vok);

  console.log(`\nambushzone proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
