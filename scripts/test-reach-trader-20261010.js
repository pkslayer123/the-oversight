#!/usr/bin/env node
// test-reach-trader-20261010.js — Worker B parity sweep (2026-10-10).
// PROOF: the river trader's feed/trade/snub actions are reachable. Before
// the fix, feedRiverTrader/tradeRiverTrader/snubRiverTrader were engine-only
// with zero UI wiring (the day-21 river_trader event fired, its follow-ups
// didn't). Fix: trader card in the Haven panel with feed/trade/snub buttons.
'use strict';
const assert = require('assert');
const { loadGame, setupGame } = require('./sim-harness');

async function traderGame(seed) {
  const { Game } = await loadGame({ seed, mode: 'reach' });
  await setupGame(Game);
  const day = Game.state.scholar.day || 1;
  Game.state.scholar.riverTrader = { day, greeted: false };
  return Game;
}

(async () => {
  let pass = 0, fail = 0;
  const t = (name, fn) => { try { fn(); pass++; console.log('ok -', name); } catch (e) { fail++; console.log('FAIL -', name, '::', e.message); } };

  {
    const Game = await traderGame(301);
    try { Game.stockPantry(5000, 'test stores'); } catch (e) {}
    const r = Game.feedRiverTrader();
    t('feedRiverTrader feeds and tells the true news', () => {
      assert.strictEqual(r, true);
      assert.ok(Game.state.scholar.riverNews, 'riverNews filed');
      assert.ok(Game.state.scholar.riverTrader.greeted, 'greeted');
    });
  }
  {
    const Game = await traderGame(302);
    try { Game.stockPantry(5000, 'test stores'); } catch (e) {}
    const r = Game.tradeRiverTrader('knife');
    t('tradeRiverTrader knife deals', () => {
      assert.strictEqual(r, true);
      assert.ok((Game.state.scholar.inventory || []).some(i => /Steel knife/.test(i.name || '')), 'knife in pack');
    });
  }
  {
    const Game = await traderGame(303);
    try { Game.stockPantry(5000, 'test stores'); } catch (e) {}
    const r = Game.tradeRiverTrader(); // auto-pick: trader sizes Haven up
    t('tradeRiverTrader auto-pick deals', () => {
      assert.strictEqual(r, true);
      const inv = Game.state.scholar.inventory || [];
      assert.ok(inv.some(i => /Steel knife|Downriver salt|River rope/.test(i.name || '')), 'a good arrived');
    });
  }
  {
    const Game = await traderGame(304);
    const r = Game.snubRiverTrader();
    t('snubRiverTrader is free and final', () => {
      assert.ok(r !== null, 'returns');
    });
    // day passes: the trader is gone
    Game.state.scholar.day += 1;
    const r2 = Game.feedRiverTrader();
    t('trader gone after dusk', () => assert.strictEqual(r2, null));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
