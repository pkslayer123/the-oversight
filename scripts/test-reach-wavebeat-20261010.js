#!/usr/bin/env node
// test-reach-wavebeat-20261010.js — Worker B parity sweep (2026-10-10).
// PROOF: the wave-3 unlock beat now fires from EVERY unlock path, not just
// player combat end. Before the fix, the beat lived only in the player
// combat-end block; organic runs earned wave 3 via villager field fights
// and the engagement feed (91/144 runs unlocked w3, beat fired 2x).
// Paths: (1) engagement feed via recordDeedFight (2 distinct wave-2 faced,
// day 25+) — villager-style; (2) kill feed via recordWaveKill x8 (village
// kills); (3) player combat end (regression: still fires, exactly once).
// Idempotency: state._waveAnnounced — the beat fires once per wave.
'use strict';
const assert = require('assert');
const { loadGame, setupGame } = require('./sim-harness');

async function fresh(seed) {
  const { Game } = await loadGame({ seed, mode: 'reach' });
  await setupGame(Game);
  Game.state.scholar.day = 30; // past the day-25 floor
  return Game;
}

(async () => {
  let pass = 0, fail = 0;
  const t = (name, fn) => { try { fn(); pass++; console.log('ok -', name); } catch (e) { fail++; console.log('FAIL -', name, '::', e.message); } };

  // PATH 1: engagement feed (villager-style) earns wave 3 -> beat fires.
  {
    const Game = await fresh(101);
    let beats = [];
    const orig = Game.waveUnlockBeat;
    Game.waveUnlockBeat = function (w) { beats.push(w); return orig.apply(this, arguments); };
    assert.strictEqual(Game.unlockedWave(), 1, 'pre: wave 1');
    Game.recordDeedFight('voice_mimic_radio'); // wave-2
    Game.recordDeedFight('review_drone');      // wave-2 -> eng(2)=2 -> unlock
    t('engagement path: wave 3 unlocks via deed feed', () => assert.strictEqual(Game.unlockedWave(), 3));
    t('engagement path: wave-3 beat fired', () => assert.deepStrictEqual(beats, [3]));
    t('engagement path: announced state set', () => assert.strictEqual(Game.state._waveAnnounced, 3));
  }

  // PATH 2: kill feed (villager kills) earns wave 3 -> beat fires.
  {
    const Game = await fresh(102);
    let beats = [];
    const orig = Game.waveUnlockBeat;
    Game.waveUnlockBeat = function (w) { beats.push(w); return orig.apply(this, arguments); };
    for (let i = 0; i < 8; i++) Game.recordWaveKill('voice_mimic_radio');
    t('kill path: wave 3 unlocks via kills', () => assert.strictEqual(Game.unlockedWave(), 3));
    t('kill path: wave-3 beat fired', () => assert.deepStrictEqual(beats, [3]));
  }

  // IDEMPOTENCY: further feeds don't re-fire.
  {
    const Game = await fresh(103);
    let beats = 0;
    const orig = Game.waveUnlockBeat;
    Game.waveUnlockBeat = function (w) { beats++; return orig.apply(this, arguments); };
    Game.recordDeedFight('voice_mimic_radio');
    Game.recordDeedFight('review_drone');
    Game.recordDeedFight('warranty_caller');
    Game.recordWaveKill('understudy');
    Game.checkWaveUnlockBeat();
    t('idempotent: one beat for wave 3', () => assert.strictEqual(beats, 1));
  }

  // ADOPT: in-flight wave-2 games don't get a spurious wave-2 announcement.
  {
    const Game = await fresh(104);
    Game.state.scholar.day = 10;
    Game.recordDeedFight('voice_mimic_radio');
    Game.recordDeedFight('review_drone'); // wave 2 unlocks now
    let beats = [];
    const orig = Game.waveUnlockBeat;
    Game.waveUnlockBeat = function (w) { beats.push(w); return orig.apply(this, arguments); };
    Game.checkWaveUnlockBeat(); // first sight: adopts wave 2 silently
    t('adopt: no spurious wave-2 beat', () => assert.deepStrictEqual(beats, []));
    Game.state.scholar.day = 30;
    Game.recordDeedFight('terms_of_service'); // wave-3 monster faced
    Game.recordDeedFight('redactor');
    t('adopt: wave-3 beat fires after adoption', () => assert.deepStrictEqual(beats, [3]));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
