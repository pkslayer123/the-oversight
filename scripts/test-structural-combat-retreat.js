#!/usr/bin/env node
// test-structural-combat-retreat.js — PROOF (Worker B, 2026-10-10).
// Villagers retreat from hopeless fights. Canon: varied tactics OK,
// purposeless disengagement is not — a hopeless fight IS a purposeful
// reason to flee.
//
// Covers:
//   R1. fieldFight: hopeless + alone -> vFlee (fleeHopeless), from round 2+.
//   R2. fieldFight: war_cry rallies once, then the flight still happens.
//   R3. fieldFight: sealed arena (noFlee) -> NO flight, even when hopeless.
//   R4. tactical: tbVillagerHopeless() reads the real DPR trajectory
//       (same rtd < rtk*0.6 formula as fieldFight).
//   R5. tactical: a brave ally in a hopeless fight flees once hurt past
//       their line (personality sets the depth, not the whether).
//   R6. tactical: the same brave ally at high HP holds (purposeful stand).
//   R7. tactical: sealed (noFlee) fight -> no flight.
//   R8. tbDamage accumulates _taken on villager fighters (the trajectory input).
//
// Usage: node scripts/test-structural-combat-retreat.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require('./sim-harness');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  const { Game } = await loadGame({ seed: 20261010, mode: 'retreat-proof', fullTelemetry: false });
  setupGame(Game);
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  Game.state.village.health = Game.state.village.health || {};
  const gavel = (Game.data.monsters || []).find(m => m.id === 'gavel');

  // R1: hopeless + alone -> vFlee
  // braveryBonus (the "watcher's cheer" input, real bravery not win-odds)
  // holds the round-1 morale line so the measurement is of the round-2+
  // hopeless trajectory, not of personality — deterministic across seeds.
  Game.state.village.health[vid] = 100;
  let rec = Game.fieldFight(vid, gavel, null, { awareness: false, braveryBonus: 35 });
  check('R1 hopeless field fight -> vFlee', rec.outcome === 'vFlee', `got ${rec.outcome}`);
  check('R1 flight marked hopeless', rec.fleeHopeless === true, `fleeHopeless=${rec.fleeHopeless}`);

  // R2: war_cry rallies once, then flight
  // (the rally narrates into rec.log — fieldFight is off-screen, it never
  // speaks through Game.say; the say-override captures nothing here.)
  Game.npcGrantAbility(vid, 'war_cry');
  Game.state.village.health[vid] = 100;
  said.length = 0;
  rec = Game.fieldFight(vid, gavel, null, { awareness: false, braveryBonus: 35 });
  check('R2 war_cry fight still ends vFlee', rec.outcome === 'vFlee', `got ${rec.outcome}`);
  const rlog = (rec.log || []).join(' ');
  check('R2 rally fired (not silent)', /BELLOWS|War Cry/i.test(rlog), (rec.log || []).slice(-3).join(' | '));
  // clean up the granted ability for later tests
  Game.state.village.npcAbilities[vid] = (Game.state.village.npcAbilities[vid] || []).filter(a => a !== 'war_cry');

  // R3: sealed arena -> no flight
  Game.state.village.health[vid] = 100;
  rec = Game.fieldFight(vid, gavel, null, { awareness: false, noFlee: true });
  check('R3 sealed fight -> no vFlee', rec.outcome !== 'vFlee', `got ${rec.outcome}`);

  // ---- tactical hopeless-flight (fake fight scaffold) ----
  const mkFighter = (over) => Object.assign({
    key: 'v_test', kind: 'villager', villagerId: vid, name: 'Test Ally',
    hp: 30, maxHp: 100, speed: 3, mx: 4, my: 4, alive: true, fled: false,
    ai: 'brave', helped: false, wbonus: 0, _dealt: 12, _taken: 60,
  }, over || {});
  const mkMonster = (over) => Object.assign({
    key: 'm1', kind: 'monster', hp: 200, maxHp: 300, alive: true, fled: false,
    mx: 6, my: 4, speed: 4, mdef: { id: 'gavel', attack: { damage: [37, 55] } },
  }, over || {});
  const mkFight = (v, m, over) => Object.assign({
    round: 3, over: false, noFlee: false, fighters: [v, m],
  }, over || {});

  // R4: hopeless read from trajectory
  let v = mkFighter(), m = mkMonster();
  Game.tbfight = mkFight(v, m);
  check('R4 tbVillagerHopeless true on hopeless trajectory',
    Game.tbVillagerHopeless(v) === true, `got ${Game.tbVillagerHopeless(v)}`);
  v = mkFighter({ _dealt: 120, _taken: 10, hp: 90 });
  m = mkMonster({ hp: 40 });
  Game.tbfight = mkFight(v, m);
  check('R4b tbVillagerHopeless false when winning',
    Game.tbVillagerHopeless(v) === false, `got ${Game.tbVillagerHopeless(v)}`);
  Game.tbfight = null;

  // R5: brave ally, hopeless, hurt past the line -> flees
  v = mkFighter(); m = mkMonster();
  Game.tbfight = mkFight(v, m);
  said.length = 0;
  Game.tbVillagerTurn(v);
  check('R5 brave hopeless hurt ally flees', v.fled === true, `fled=${v.fled}`);
  check('R5 flight narrated', said.some(s => /runs while running still works|sees how this ends/i.test(s)), said.join(' | ').slice(0, 200));
  Game.tbfight = null;

  // R6: brave ally, hopeless, high HP -> holds
  v = mkFighter({ hp: 85, _taken: 60, _dealt: 12 }); m = mkMonster();
  Game.tbfight = mkFight(v, m);
  Game.tbVillagerTurn(v);
  check('R6 brave hopeless healthy ally holds', v.fled !== true, `fled=${v.fled}`);
  Game.tbfight = null;

  // R7: sealed -> no flight even when hopeless+hurt
  v = mkFighter(); m = mkMonster();
  Game.tbfight = mkFight(v, m, { noFlee: true });
  Game.tbVillagerTurn(v);
  check('R7 sealed fight -> no flight', v.fled !== true, `fled=${v.fled}`);
  Game.tbfight = null;

  // R8: tbDamage accumulates _taken on villager fighters
  v = mkFighter({ hp: 100, _taken: 0 }); m = mkMonster();
  Game.tbfight = mkFight(v, m);
  Game.tbDamage('v_test', 10, 'test-source');
  check('R8 _taken accumulates', v._taken === 10, `_taken=${v._taken}`);
  Game.tbfight = null;

  console.log(`\nretreat proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
