#!/usr/bin/env node
// feast-buff-calibration.js — calibrate the feasted uplift curve.
// Feast -> fight scenarios: arm devotion, grant buff at each quality x surge
// combo, then fight a 200-hp bulldozer with fists and measure strikes-to-kill
// and damage/strike vs the unbuffed baseline. Reports the uplift curve for
// docs/BALANCING.md. Not a gate — a measurement.
//
// NOTE: the sim scholar carries patient_aim, which doubles strikes while the
// fight is in round 1 (pre-existing engine behavior — the copy says "first
// strike" but nothing consumes it; not this worker's scope). The 200-hp
// bulldozer keeps fights in later rounds so the ambient effect dilutes; the
// exact hook math is verified separately in test-feast-buff.js G4 (10 -> 18
// at x1.8, exact).
//
// Run: SEED=7 node scripts/feast-buff-calibration.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '7', 10);
const { loadGame, setupGame } = require('./sim-harness');

function fight(Game, maxStrikes) {
  // synthetic fight; monster never meaningfully threatens (player hp huge).
  // returns { strikes, dealt }
  const mdef = (Game.data.monsters || []).find(m => m.id === 'bulldozer') || {};
  Game.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 100000, maxHp: 100000, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false },
      { key: 'm1', kind: 'monster', monsterId: 'bulldozer', mdef, name: 'dozer', hp: 200, maxHp: 200, speed: 3, mx: 5, my: 4, alive: true, fled: false, telegraph: null },
    ],
    over: false, round: 1, order: ['p', 'm1'], turnIdx: 0,
  };
  const m = Game.tbFighter('m1');
  let strikes = 0, dealt0 = 0;
  let guard = 0;
  while (m.alive && !Game.tbfight.over && strikes < maxStrikes && guard++ < 400) {
    if (Game.tbIsPlayerTurn()) {
      const p = Game.tbFighter('p');
      p.moveLeft = 0; p.acted = false;
      const before = m.hp;
      try { Game.tbPlayerStrike('m1'); } catch (e) { break; }
      dealt0 += Math.max(0, before - m.hp);
      strikes++;
    } else {
      try { Game.tbAdvance(); } catch (e) { break; }
    }
    if (!Game.tbfight) break;
  }
  Game.tbfight = null;
  return { strikes, dealt: dealt0, killed: !m.alive };
}

(async () => {
  const { Game, loadFails } = await loadGame({ seed: SEED, mode: 'feast-calib' });
  if (loadFails.length) { console.error('loadFails', loadFails); process.exit(1); }
  Game.say = () => {}; Game.sysSay = () => {}; Game.audioEvent = () => {};
  try { Game.drama = () => {}; } catch (e) {}
  Game.equippedWeapon = () => ({ range: 1, bonus: 0, name: 'fists', unarmed: true });

  const configs = [
    { name: 'unbuffed baseline', quality: null, surge: null },
    { name: 'q0 simple x devotion 1.5', quality: 0, surge: 1.5 },
    { name: 'q1 proper x devotion 1.5', quality: 1, surge: 1.5 },
    { name: 'q2 legendary x devotion 1.5', quality: 2, surge: 1.5 },
    { name: 'q2 legendary x chosen keepsake 2.25', quality: 2, surge: 2.25 },
    { name: 'q2 legendary x wedding ring 3.0', quality: 2, surge: 3.0 },
  ];
  const N = 30;
  console.log(`feast->fight calibration vs bulldozer (200 hp, fists [10,16]), N=${N}/config, SEED=${SEED}`);
  const rows = [];
  for (const c of configs) {
    await setupGame(Game);
    const s = Game.state.scholar;
    let mult = 1;
    if (c.quality != null) {
      s.prog = s.prog || {};
      s.prog.feastSurge = c.surge;
      const r = Game.grantFeastBuff({ quality: c.quality, served: [], guests: ['a', 'b', 'c'], daypart: 1 });
      mult = r.mult;
    }
    let strikes = 0, dealt = 0, killed = 0;
    for (let i = 0; i < N; i++) {
      if (c.quality != null && !Game.feastedActive()) {
        s.prog.feastSurge = c.surge; s.prog.feastSurgeUsed = false;
        Game.grantFeastBuff({ quality: c.quality, served: [], guests: ['a', 'b', 'c'], daypart: 1 });
      }
      const f = fight(Game, 60);
      strikes += f.strikes; dealt += f.dealt; if (f.killed) killed++;
    }
    rows.push({ name: c.name, mult, meanStrikes: strikes / N, meanDmg: dealt / Math.max(1, strikes), killed });
    const r = rows[rows.length - 1];
    console.log(`  ${c.name}: mult x${mult} | strikes-to-kill ${r.meanStrikes.toFixed(2)} | dmg/strike ${r.meanDmg.toFixed(1)} | killed ${killed}/${N}`);
  }
  const base = rows[0].meanDmg;
  console.log('\nuplift curve (dmg/strike vs baseline):');
  for (const r of rows) console.log(`  x${r.mult}: ${(r.meanDmg / base).toFixed(2)}x measured (${r.meanDmg.toFixed(1)} vs ${base.toFixed(1)})`);
  process.exit(0);
})().catch(e => { console.error('CALIB FAIL:', e); process.exit(1); });
