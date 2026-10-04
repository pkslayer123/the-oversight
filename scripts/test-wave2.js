#!/usr/bin/env node
// Wave 2 monster test: pool gating, data integrity, combat smoke test.
// Usage: node scripts/test-wave2.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

const WAVE2 = ['voice_mimic_radio','mirror_stag','review_drone','camera_swarm','hype_horn',
  'service_mimic','contract_golem','delegate_beast','bright_idea','memory_projector'];

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

  // 1. pool gating: pre-arrival = wave 1 only
  let pool = Game.monsterWavePool();
  ok(pool.length === 10 && pool.every(m => (m.wave || 1) === 1),
    `pre-arrival pool is wave-1 only (got ${pool.length})`);

  // 2. post-arrival = wave 1 + 2
  Game.state.systemArrived = true;
  pool = Game.monsterWavePool();
  ok(pool.length === 20, `post-arrival pool is 20 (got ${pool.length})`);
  const missing = WAVE2.filter(id => !pool.find(m => m.id === id));
  ok(missing.length === 0, `all wave2 in pool (missing: ${missing.join(',')})`);

  // 3. wave-3 hook: not yet spawned (no wave-3 monsters exist, but gate logic present)
  Game.state.scholar.integration = 85;
  pool = Game.monsterWavePool();
  ok(pool.length === 20, `deep integration doesn't break pool (got ${pool.length})`);
  Game.state.scholar.integration = 5;

  // 4. data integrity for each wave-2 monster
  for (const id of WAVE2) {
    const m = Game.data.monsters.find(x => x.id === id);
    ok(!!m, `${id} exists`);
    if (!m) continue;
    ok(m.wave === 2, `${id} wave=2`);
    ok(m.hp[0] < m.hp[1] && m.hp[0] > 0, `${id} hp range sane`);
    ok(m.attack.damage[0] < m.attack.damage[1], `${id} dmg range sane`);
    ok(m.attack.name && m.attack.telegraph, `${id} attack has name+telegraph`);
    ok(m.attack.pattern && m.attack.pattern.type, `${id} has pattern`);
    const c = m.codexStages;
    ok(c && c.unknown && c.observed && c.slain, `${id} codex stages complete`);
    ok(['nocturnal','diurnal','crepuscular','both'].includes(m.activity), `${id} valid activity`);
    ok(typeof m.speed === 'number' && m.speed >= 1 && m.speed <= 6, `${id} speed sane`);
  }

  // 5. combat smoke test: each wave-2 monster can start and resolve combat
  Game.depart();
  for (const id of WAVE2) {
    try {
      const s = Game.state.scholar;
      s.health = 100; s.mx = 4; s.my = 4;
      Game.startCombat(id);
      ok(!!Game.tbfight, `${id} combat starts`);
      // run a few combat rounds to exercise attack patterns
      let guard = 0;
      while (Game.tbfight && !Game.tbfight.over && guard++ < 30) {
        if (Game.tbIsPlayerTurn()) { Game.tbPlayerStudy(); }
        else Game.tbAdvance();
      }
      // force-end to avoid hanging
      if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
      Game.state.scholar.monster = null;
    } catch (e) {
      ok(false, `${id} combat crashed: ${e.message}`);
    }
  }
  ok(true, 'combat smoke tests completed without crash');

  // 6. pattern types used are all engine-supported
  const supported = ['beam','charge','line','burst','direct','rush','ambush'];
  for (const id of WAVE2) {
    const m = Game.data.monsters.find(x => x.id === id);
    ok(supported.includes(m.attack.pattern.type), `${id} pattern ${m.attack.pattern.type} supported`);
  }

  console.log(`\nwave2 tests: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(1); });
