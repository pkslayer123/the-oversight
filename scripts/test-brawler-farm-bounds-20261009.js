#!/usr/bin/env node
// BRAWLER BREAK-IT 2026-10-09: dodge/practice farm bounds + stat ceiling.
// Hostile questions:
//   1. Dodge rate vs advertised footwork tiers — does the engine ever dodge
//      MORE than the passive's top tier + agi bonus imply? (copy says
//      "You are hard to hit" — no number; check the math is sane.)
//   2. practice() hard-ceiling at 10 — strike/dodge farming cannot push past.
//   3. Whiffed strikes (blind miss / haymaker whiff) must NOT grant practice.
const H = require('./combat-break-harness.js');

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  let pass = 0, fail = 0;
  const check = (n, c, x) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.log(`  FAIL ${n}${x ? ' — ' + x : ''}`); } };

  // --- 1. dodge rate ---
  s.stats = s.stats || {}; s.stats.agi = 10;
  s.passives = s.passives || {}; s.passives.footwork = 3; // +15%
  const mk = H.synthFight(Game, 'hushwolf', { php: 10000, mhp: 30 });
  const p = Game.tbfight.fightersByKey['p'];
  Game.say = () => {};
  let dodges = 0; const N = 2000;
  for (let i = 0; i < N; i++) Game.tbDamage('p', 10, 'hushwolf', mk, {});
  dodges = 0;
  // count via say capture instead (revive first — the first loop can kill)
  const _pf = Game.tbfight.fightersByKey['p'];
  _pf.hp = 100000; _pf.alive = true;
  Game.say = (t) => { if (String(t).includes('slip aside')) dodges++; };
  s.practice = {};
  for (let i = 0; i < N; i++) Game.tbDamage('p', 10, 'hushwolf', mk, {});
  const rate = dodges / N;
  console.log(`  dodge rate over ${N} hits: ${(rate * 100).toFixed(1)}% (footwork t3 +15%, agi 10 +10% => expect ~25%)`);
  check('dodge rate sane (10%..40%)', rate > 0.10 && rate < 0.40, (rate * 100).toFixed(1) + '%');

  // --- 2. stat ceiling ---
  s.stats.str = 10; s.practice = { str: 999 };
  Game.practice('str', 1);
  check('str stays at 10 (human ceiling)', s.stats.str === 10, 'str=' + s.stats.str);
  s.stats.str = 9; s.practice = { str: 0 };
  for (let i = 0; i < 100; i++) Game.practice('str', 1);
  check('str caps at 10 after heavy farming', s.stats.str === 10, 'str=' + s.stats.str);

  // --- 3. whiffs grant no practice ---
  s.stats.str = 5; s.practice = { str: 0, agi: 0 };
  const mk2 = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 1000 });
  const p2 = Game.tbfight.fightersByKey['p'];
  p2.mx = 4; p2.my = 4; Game.tbfight.fightersByKey[mk2].mx = 5; Game.tbfight.fightersByKey[mk2].my = 4;
  Game.say = () => {};
  p2.blindTurns = 5; p2.acted = false;
  Game.tbPlayerStrike(mk2); // may hit or miss on blind — force whiff path instead:
  // force haymaker whiff: 100% acc penalty
  s.haymakerReady = { accPenalty: 1.0 };
  p2.acted = false;
  const prBefore = JSON.stringify(s.practice);
  Game.tbPlayerStrike(mk2);
  check('haymaker whiff grants no practice', JSON.stringify(s.practice) === prBefore,
    JSON.stringify(s.practice));

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
