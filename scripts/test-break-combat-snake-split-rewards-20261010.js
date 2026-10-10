#!/usr/bin/env node
// BREAK-IT combat engine (2026-10-10): SNAKE-SPLIT REWARD MULTIPLICATION.
// ATTACK (exploit): the hostile player fights Ducks in a Row (14 segments,
// one spawn, one snakeId) and DELIBERATELY kills middle segments first.
// tbSnakeSplit gives each tail-side fragment a NEW snakeId ("as many snakes
// as there are pieces" — the fight gets harder, by design). But tbEnd's two
// reward de-dupe loops key on snakeId, so each fragment pays out as a FULL
// separate kill: its own carcass (2100 kcal), its own alien-loot roll, its
// own wave-kill credit. One duck becomes up to 14 carcasses (29,400 kcal),
// ~1.4 expected tier-2 loot drops, and 14 wave-1 kills (the wave-2 gate needs
// 4). This re-opens the exact hole break-it monsters r6 closed ("ONE BODY =
// ONE KILL" — counting each of the duck's 14 segments let a single snake
// clear the 4-kill wave-2 minimum alone), via the split path.
// FIX: lineage. The spawn stamps snakeRoot (the original snakeId) on every
// segment; tbSnakeSplit preserves it; both tbEnd de-dupe loops key on
// snakeRoot. One spawn = one body = one kill, however many pieces it dies in.
// The split still makes the FIGHT harder (two snakes hunt you) — it just
// doesn't multiply the duck's meat.
'use strict';
const assert = require('assert');
const fs = require('fs');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', String(e.message).split('\n')[0]); }
};

// Build a snake fight the way the spawn code does. useRoot=true mirrors the
// FIXED spawn (snakeRoot stamped); false mirrors the pre-fix spawn.
function buildSnakeFight(Game, useRoot) {
  const mdef = Game.data.monsters.find(m => m.id === 'ducks_in_a_row');
  assert.ok(mdef && mdef.snake, 'duck is a snake');
  const snakeId = 'snake_test_' + (useRoot ? 'root' : 'legacy');
  const fighters = [
    { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100000, maxHp: 100000,
      speed: 99, mx: 4, my: 8, alive: true, fled: false,
      moveLeft: 3, acted: false, aimed: false },
  ];
  for (let i = 0; i < 14; i++) {
    const seg = {
      key: 'm_snake_' + i, kind: 'monster', monsterId: mdef.id,
      name: 'duck' + (i === 0 ? ' (head)' : ' (' + (i + 1) + ')'),
      emoji: '🦆', hp: 15, maxHp: 15, speed: 1,
      mx: i % 9, my: Math.floor(i / 9), alive: true, fled: false,
      telegraph: null, mdef, hesitate: 0, blind: 0, stunned: 0,
      snakeId, segmentIndex: i, isHead: i === 0, threatQueue: [],
    };
    if (useRoot) seg.snakeRoot = snakeId;
    fighters.push(seg);
  }
  Game.tbfight = {
    id: 'fsnake', fighters, over: false, round: 1,
    order: fighters.map(f => f.key), turnIdx: 0,
  };
  return mdef;
}

function aliveSegs(Game) {
  return Game.tbfight.fighters.filter(f => f.kind === 'monster' && f.alive);
}

// Hostile driver: always kill the middle segment of the largest live snake
// group — maximizes splits (13 splits -> 14 one-duck fragments).
function hostileSplitMax(Game) {
  let guard = 100;
  while (aliveSegs(Game).length && guard-- > 0) {
    const groups = {};
    for (const s of aliveSegs(Game)) {
      const k = s.snakeId;
      (groups[k] = groups[k] || []).push(s);
    }
    let biggest = null;
    for (const k of Object.keys(groups)) {
      if (!biggest || groups[k].length > biggest.length) biggest = groups[k];
    }
    biggest.sort((a, b) => a.segmentIndex - b.segmentIndex);
    const mid = biggest[Math.floor(biggest.length / 2)];
    Game.tbDamage(mid.key, 99999, 'test blade', null, { quiet: true });
  }
  assert.ok(guard > 0, 'split driver terminated');
}

function countRewards(Game) {
  const counts = { waveKills: 0, lootRolls: 0, carcasses: 0 };
  const origWave = Game.recordWaveKill.bind(Game);
  const origLoot = Game.rollAlienLoot.bind(Game);
  const origMeat = Game.monsterMeatEntry.bind(Game);
  Game.recordWaveKill = (...a) => { counts.waveKills++; return origWave(...a); };
  Game.rollAlienLoot = (...a) => { counts.lootRolls++; return origLoot(...a); };
  Game.monsterMeatEntry = (...a) => { const r = origMeat(...a); if (r) counts.carcasses++; return r; };
  return counts;
}

async function runScenario(useRoot) {
  const Game = await H.newCombatReadyGame();
  Game.state.systemArrived = false;
  Game.state.waveKills = {};
  const mdef = buildSnakeFight(Game, useRoot);
  assert.ok(mdef.edible && mdef.edible.calories === 2100, 'duck is 2100 kcal');
  hostileSplitMax(Game);
  const dead = Game.tbfight.fighters.filter(f => f.kind === 'monster' && !f.alive);
  assert.strictEqual(dead.length, 14, 'all 14 segments died, got ' + dead.length);
  const distinctIds = new Set(
    Game.tbfight.fighters.filter(f => f.kind === 'monster').map(f => f.snakeId));
  const counts = countRewards(Game);
  Game.tbEnd('won');
  return { distinctIds: distinctIds.size, counts };
}

(async () => {
  console.log('seed', H.SEED);

  // PART 1 — the break, pinned: pre-fix spawn shape (no snakeRoot).
  // A hostile splitter gets paid per fragment. This documents the exploit;
  // it stays green as the attack's permanent record.
  const legacy = await runScenario(false);
  console.log('  legacy shape: distinct snakeIds =', legacy.distinctIds,
    '| waveKills =', legacy.counts.waveKills,
    '| lootRolls =', legacy.counts.lootRolls,
    '| carcasses =', legacy.counts.carcasses);
  check('EXPLOIT (pre-fix shape): splitting multiplies rewards', () => {
    assert.ok(legacy.distinctIds > 1, 'splits happened');
    assert.ok(legacy.counts.waveKills > 1, 'wave kills multiplied: ' + legacy.counts.waveKills);
    assert.ok(legacy.counts.carcasses > 1, 'carcasses multiplied: ' + legacy.counts.carcasses);
    assert.ok(legacy.counts.lootRolls > 1, 'loot rolls multiplied: ' + legacy.counts.lootRolls);
  });

  // PART 2 — the fix: spawn stamps snakeRoot; rewards de-dupe by lineage.
  const fixed = await runScenario(true);
  console.log('  fixed shape: distinct snakeIds =', fixed.distinctIds,
    '| waveKills =', fixed.counts.waveKills,
    '| lootRolls =', fixed.counts.lootRolls,
    '| carcasses =', fixed.counts.carcasses);
  check('FIX: one spawn = one wave kill however it splits', () => {
    assert.strictEqual(fixed.counts.waveKills, 1, 'waveKills=' + fixed.counts.waveKills);
  });
  check('FIX: one spawn = one carcass however it splits', () => {
    assert.strictEqual(fixed.counts.carcasses, 1, 'carcasses=' + fixed.counts.carcasses);
  });
  check('FIX: one spawn = one loot roll however it splits', () => {
    assert.strictEqual(fixed.counts.lootRolls, 1, 'lootRolls=' + fixed.counts.lootRolls);
  });
  check('FIX: splits still happen (the fight still gets harder)', () => {
    assert.ok(fixed.distinctIds > 1, 'no splits — fight changed, not just rewards');
  });

  // PART 3 — source guards: the real spawn stamps snakeRoot, tbEnd keys on it.
  const src = fs.readFileSync('src/js/game.js', 'utf8');
  check('spawn stamps snakeRoot on every segment', () => {
    assert.ok(/snakeRoot:\s*snakeId/.test(src), 'spawn block sets snakeRoot');
  });
  check('wave-kill de-dupe keys on lineage, not bare snakeId', () => {
    assert.ok(/snakeRoot \|\| m\.snakeId/.test(src) || /tbSnakeLineageKey/.test(src),
      'wave-kill loop uses lineage key');
  });
  check('reward de-dupe keys on lineage, not bare snakeId', () => {
    assert.ok(/const _bk = this\.tbSnakeLineageKey\(_m\);/.test(src),
      'reward loop calls tbSnakeLineageKey(_m)');
    assert.ok(!/const _bk = \(_m\.mdef\.snake/.test(src),
      'old bare-snakeId reward key is gone');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
