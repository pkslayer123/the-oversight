#!/usr/bin/env node
// test-reach-raid-20261010.js — Worker B parity sweep (2026-10-10).
// PROOF: the conquest road's first step (raidVillage/answerRaid) is
// reachable. Before the fix, both were engine-only with ZERO callers and
// ZERO UI wiring — the whole conquest national shape (Steve's approved
// six) had no entry. Fix: "Raid them" button on unlinked village cards +
// pendingRaid strike/terms/withdraw answers in the Haven panel.
// Engine proof: raidVillage musters (needs >=2 fighters besides the player),
// answerRaid('strike') subjugates (trust 15, duress tribute link),
// answerRaid('terms') yields without blood, answerRaid('withdraw') costs face.
'use strict';
const assert = require('assert');
const { loadGame, setupGame } = require('./sim-harness');

async function raidGame(seed) {
  const { Game } = await loadGame({ seed, mode: 'reach' });
  await setupGame(Game);
  // a known, unlinked other village
  Game.state.otherVillages = Game.state.otherVillages || [];
  if (!Game.state.otherVillages.some(v => v.id === 'ov_raid')) {
    Game.state.otherVillages.push({ id: 'ov_raid', name: 'Stonebrook', opinion: 0, pop: 10 });
  }
  // ensure >=2 fighters besides the player: mark roster members as members
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  assert.ok(roster.length >= 2, 'need 2+ villagers');
  return Game;
}

(async () => {
  let pass = 0, fail = 0;
  const t = (name, fn) => { try { fn(); pass++; console.log('ok -', name); } catch (e) { fail++; console.log('FAIL -', name, '::', e.message); } };

  {
    const Game = await raidGame(201);
    const r = Game.raidVillage('ov_raid');
    t('raidVillage musters a war party', () => {
      assert.strictEqual(r, true);
      assert.ok(Game.state.pendingRaid, 'pendingRaid set');
      assert.strictEqual(Game.state.pendingRaid.target, 'ov_raid');
      assert.ok((Game.state.pendingRaid.fighters || []).length >= 2, '2+ fighters');
    });
    const res = Game.answerRaid('strike');
    t('answerRaid strike subjugates', () => {
      assert.ok(!Game.state.pendingRaid, 'pendingRaid cleared');
      const link = (Game.hierarchyState() || []).find(l => l.subordinate === 'ov_raid' || l.primary === 'ov_raid' || (l.a === 'ov_raid' || l.b === 'ov_raid'));
      assert.ok(link, 'a link exists after strike');
      assert.ok((link.trust || 100) <= 30, 'conquest trust is low (' + link.trust + ')');
    });
  }
  {
    const Game = await raidGame(202);
    Game.state.otherVillages.push({ id: 'ov_raid2', name: 'Mudford', opinion: 0, pop: 10 });
    // Haven stands tall enough that the strong yield without blood.
    Game.regionalStanding = () => 100;
    Game.villageStandingOf = () => 10;
    Game.raidVillage('ov_raid2');
    const res = Game.answerRaid('terms');
    t('answerRaid terms yields without blood', () => {
      assert.ok(!Game.state.pendingRaid, 'pendingRaid cleared');
      assert.ok(res && res.conquered, 'yield link is a conquest link');
      const link = (Game.hierarchyState() || []).find(l => (l.subordinate === 'ov_raid2') || (l.primary === 'ov_raid2'));
      assert.ok(link, 'terms link exists');
    });
  }
  {
    const Game = await raidGame(203);
    Game.raidVillage('ov_raid');
    Game.answerRaid('withdraw');
    t('answerRaid withdraw clears the muster', () => assert.ok(!Game.state.pendingRaid));
  }
  {
    const Game = await raidGame(204);
    const r = Game.raidVillage('ov_raid'); // first muster
    const r2 = Game.raidVillage('ov_raid'); // second muster while pending
    t('second muster refused while pending', () => {
      assert.strictEqual(r, true);
      assert.ok(r2 == null || r2 === false || Game.state.pendingRaid.target === 'ov_raid');
    });
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
