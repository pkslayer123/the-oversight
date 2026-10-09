#!/usr/bin/env node
// BREAK-IT monsters run 5 (2026-10-09): village-wide wave-kill proof.
// CATCH: unlockedWave()'s design comment promises village-wide kill minimums
// ("Wave 2: day 8+ AND 4 wave-1 kills (village-wide, not just player)"), but
// recordWaveKill was only called from tbEnd('won') — the PLAYER's combat.
// Villager-vs-monster real fights (fieldFights, Steve 2026-10-08) never
// counted: neither resolveWildMonsterEncounter (game.js) nor expeditionMonster
// (villager-agency.js) recorded the kill. A village whose hunters did all the
// work could never unlock wave 2 on kills.
// FIX: both routers call recordWaveKill(m.id) on vKill.
// PROOF: runtime. Stub fieldFight to return a canned vKill record, drive both
// routers, assert state.waveKills[1] increments exactly once per kill and
// that wave-2 unlocks at day 8 with 4 such kills.
'use strict';
const assert = require('assert');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', String(e.message).split('\n')[0]); }
};

(async () => {
  console.log('seed', H.SEED);
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  s.day = 8; // wave-2 day gate open; kills are the only missing input
  Game.state.waveKills = {};

  const vids = Object.keys(Game.state.village.roster || {});
  const vid = vids[0];
  assert.ok(vid, 'need a villager');

  // canned vKill record from a real-shaped fieldFight
  const rec = { outcome: 'vKill', vTaken: 12, rounds: 3, mTaken: 60 };
  const origFieldFight = Game.fieldFight.bind(Game);
  Game.fieldFight = () => Object.assign({}, rec);
  Game.tell = Game.tell || (() => {});
  const origTell = (Game.tell || (() => {})).bind(Game);
  const told = [];
  Game.tell = (t) => { told.push(String(t)); };

  // world-monster stub for router 1 (resolveWildMonsterEncounter)
  const mdef = Game.data.monsters.find(m => m.id === 'hummice');
  const wm = { id: 'hummice', tx: 4, ty: 4, mx: 2, my: 2, hp: 10, maxHp: 12, stance: 'stalk' };

  check('router 1 (resolveWildMonsterEncounter) vKill records a wave-1 kill', () => {
    const before = (Game.state.waveKills[1] || 0);
    Game.resolveWildMonsterEncounter(vid, wm);
    assert.strictEqual(Game.state.waveKills[1], before + 1, 'waveKills[1] did not increment');
  });

  // router 2 (expeditionMonster) — needs agency expedition state, as in production
  check('router 2 (expeditionMonster) vKill records a wave-1 kill', () => {
    const st = Game.agencyState();
    Game.agencyOf(vid);
    st.exped[vid] = { encounters: [], duration: 5, legs: 1 };
    const before = (Game.state.waveKills[1] || 0);
    try {
      Game.expeditionMonster(vid, 2, true);
    } catch (e) {
      throw new Error('router threw: ' + e.message);
    }
    assert.strictEqual(Game.state.waveKills[1], before + 1, 'waveKills[1] did not increment');
  });

  check('4 village kills unlock wave 2 at day 8 (design: village-wide)', () => {
    Game.state.waveKills = { 1: 4 };
    assert.strictEqual(Game.unlockedWave(), 2, 'wave 2 did not unlock with 4 wave-1 kills at day 8');
  });
  check('3 kills do not unlock', () => {
    Game.state.waveKills = { 1: 3 };
    assert.strictEqual(Game.unlockedWave(), 1, 'wave 2 unlocked early');
  });

  Game.fieldFight = origFieldFight;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
