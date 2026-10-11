#!/usr/bin/env node
// PROOF TEST: The Wave Ledger (Steve 2026-10-10 — REVERSAL of 8730921c).
// Wave unlocks run on KILLS ONLY: a per-wave, per-village, per-run point
// ledger, cumulative across player deaths.
//
// Proves:
//   1. kill scores 1 point (recordWaveKill — the choke point for player TB
//      kills AND villager field-fight kills)
//   2. second kill of the same type scores (per-type cap = 2)
//   3. third kill of the same type scores 0 (anti-farming breadth cap)
//   4. counter bonus: state.monsterCounters[id]=true AND a `counter` field on
//      the mdef (test-only mutation) -> 2 points; counter-known but NO def
//      field -> 1 point (never punished for not knowing)
//   5. engagements score NOTHING: the startCombat feed (recordDeedFight —
//      exactly what startCombat's wrap calls when a fight starts) and real
//      fieldFight vFlee/mFlee outcomes -> 0 ledger points, while wavesFaced
//      (the endgame deed gate) is still fed — endgame feed untouched
//   6. villager kill path: recordWaveKill scores (villagers' kills count)
//   7. day floor: ledger full for wave 2 at day 10 -> unlockedWave() < 3;
//      at day 25 -> >= 3
//   8. ledger survives a scholar swap (lives on state, not the scholar)
//   9. System announce at 50% and 100% is idempotent (fires once each)
// Green across 3 seeds: SEED=1/2/3 node scripts/test-wave-ledger-20261010.js
'use strict';
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  console.log('== WAVE LEDGER PROOF, SEED ' + SEED + ' ==');

  const s = Game.state.scholar;
  const resetLedger = () => { Game.state.waveLedger = null; Game.ledgerState(); };
  const resetDeeds = () => { try { Game.progState().deeds = null; } catch (e) {} Game.deedState(); };
  const faced = () => Game.deedState().wavesFaced || {};

  // config is live from the JSON levers
  const cfg = Game.waveLedgerCfg();
  ok('config loads (pointsPerKill=1)', cfg.pointsPerKill === 1, JSON.stringify(cfg.pointsPerKill));
  ok('config loads (barsPerWave 1..5)', cfg.barsPerWave[1] === 5 && cfg.barsPerWave[2] === 5 &&
    cfg.barsPerWave[3] === 4 && cfg.barsPerWave[4] === 3 && cfg.barsPerWave[5] === 2,
    JSON.stringify(cfg.barsPerWave));
  ok('config loads (dayFloor=25, wave2DayFloor=8)', cfg.dayFloor === 25 && cfg.wave2DayFloor === 8);

  // ---- 1. kill scores 1 point ----
  resetLedger();
  const added = Game.recordWaveKill('bulldozer');
  ok('kill scores 1 point', Game.waveLedgerPoints(1) === 1, 'got ' + Game.waveLedgerPoints(1));

  // ---- 2-3. per-type cap: 2nd same-type scores, 3rd scores 0 ----
  Game.recordWaveKill('bulldozer');
  ok('second kill of same type scores (cap 2)', Game.waveLedgerPoints(1) === 2, 'got ' + Game.waveLedgerPoints(1));
  Game.recordWaveKill('bulldozer');
  ok('third kill of same type scores 0', Game.waveLedgerPoints(1) === 2, 'got ' + Game.waveLedgerPoints(1));
  // a different type still has room
  Game.recordWaveKill('hushwolf');
  ok('new type scores independently', Game.waveLedgerPoints(1) === 3, 'got ' + Game.waveLedgerPoints(1));

  // ---- 4. counter bonus: only when BOTH counter-known AND def field ----
  resetLedger();
  Game.state.monsterCounters = {};
  Game.recordWaveKill('bulldozer');
  ok('no counter knowledge -> 1 point', Game.waveLedgerPoints(1) === 1, 'got ' + Game.waveLedgerPoints(1));
  resetLedger();
  Game.state.monsterCounters = { gallowdeer: true };
  // gallowdeer genuinely carries a counter field now (structural counters
  // 2026-10-10) — lift it for the "no field" case, then restore the real one.
  const mdef = (Game.data.monsters || []).find(m => m.id === 'gallowdeer');
  const savedCounter = mdef && mdef.counter;
  if (mdef) delete mdef.counter;
  Game.recordWaveKill('gallowdeer');
  ok('counter-known but no mdef.counter field -> still 1 (never punished)',
    Game.waveLedgerPoints(1) === 1, 'got ' + Game.waveLedgerPoints(1));
  if (mdef) mdef.counter = savedCounter;
  resetLedger();
  Game.state.monsterCounters = { gallowdeer: true };
  const add4 = Game.scoreLedgerKill('gallowdeer');
  ok('counter-known AND mdef.counter exists -> 2 points', add4 === 2 && Game.waveLedgerPoints(1) === 2,
    'add=' + add4 + ' pts=' + Game.waveLedgerPoints(1));
  // counter kill also respects the per-type cap (2 pts fill it; next scores 0)
  const add4b = Game.scoreLedgerKill('gallowdeer');
  ok('counter bonus respects per-type cap (capped at 2)', add4b === 0 && Game.waveLedgerPoints(1) === 2,
    'add=' + add4b + ' pts=' + Game.waveLedgerPoints(1));
  Game.state.monsterCounters = {};

  // ---- 5. engagements score NOTHING; endgame feed untouched ----
  resetLedger(); resetDeeds();
  // (a) the startCombat feed: its wrap calls recordDeedFight — a fight that
  // started (or fled) but killed nothing.
  Game.recordDeedFight('bulldozer');
  ok('engagement (fight started, no kill) scores 0', Game.waveLedgerPoints(1) === 0,
    'got ' + Game.waveLedgerPoints(1));
  ok('endgame deed feed still fed (wavesFaced)', faced().bulldozer === 1, JSON.stringify(faced()));
  // (b) real fieldFight outcomes with rigged-but-honest stats (villager XP law
  // classifier coverage lives in test-villager-wave-xp; here: ledger impact)
  // (b) real fieldFight outcomes with rigged-but-honest stats (villager XP law
  // classifier coverage lives in test-villager-wave-xp; here: ledger impact).
  // NOTE: raw fieldFight never calls recordWaveKill itself — the CALLERS
  // (patrol/wild wraps) do. So the fight alone scores nothing; the kill PATH
  // (caller -> recordWaveKill, section 6) scores. Both are honest.
  const vid = (Game.state.village.roster || []).find(v => v !== Game.villagerId) || (Game.state.village.roster || [])[0];
  ok('villager available', !!vid);
  const rng = (v) => () => v;
  const mk = (id, hp, dmg) => {
    const base = (Game.data.monsters || []).find(m => m.id === id) || {};
    return Object.assign({}, base, { id, hp: [hp, hp], wave: base.wave || 2, attack: { damage: [dmg, dmg], name: 'lash' }, speed: 5, behavior: 'territorial', encounter: { noticeRange: 1 }, size: 3 });
  };
  const setVhp = (n) => { Game.state.village.health = Game.state.village.health || {}; Game.state.village.health[vid] = n; };
  resetLedger(); resetDeeds(); setVhp(100);
  const recKill = Game.fieldFight(vid, mk('voice_mimic_radio', 20, 6), null, { rng: rng(0) });
  ok('fieldFight vKill outcome', recKill.outcome === 'vKill', 'got ' + recKill.outcome);
  ok('the fight alone scores nothing (callers feed recordWaveKill)',
    Game.waveLedgerPoints(2) === 0, 'pts=' + Game.waveLedgerPoints(2));
  ok('vKill still feeds the endgame deed feed', faced().voice_mimic_radio === 2, JSON.stringify(faced()));
  resetLedger(); resetDeeds(); setVhp(100);
  const recFlee2 = Game.fieldFight(vid, mk('mirror_stag', 200, 30), null, { rng: rng(0) });
  ok('fieldFight vFlee scores 0', Game.waveLedgerPoints(2) === 0, 'outcome=' + recFlee2.outcome + ' pts=' + Game.waveLedgerPoints(2));
  ok('vFlee still feeds the endgame deed feed', faced().mirror_stag === 2, JSON.stringify(faced()));

  // ---- 6. villager kill path scores (recordWaveKill IS the villager path) ----
  resetLedger();
  Game.recordWaveKill('hushwolf');
  ok('recordWaveKill (villager kill path) scores', Game.waveLedgerPoints(1) === 1,
    'got ' + Game.waveLedgerPoints(1));

  // ---- 7. day floor holds on the ledger-only gate ----
  resetLedger(); s.day = 10;
  for (const id of ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea', 'memory_projector'])
    Game.recordWaveKill(id); // 5 w2 points = full bar
  ok('wave-2 ledger full', Game.waveLedgerPoints(2) === 5, 'got ' + Game.waveLedgerPoints(2));
  ok('day floor holds (day 10, ledger full) -> no wave 3', Game.unlockedWave() < 3, 'uw=' + Game.unlockedWave());
  s.day = 25;
  ok('day 25 + ledger full -> wave 3', Game.unlockedWave() >= 3, 'uw=' + Game.unlockedWave());

  // ---- 8. ledger survives a scholar swap (cumulative across deaths) ----
  resetLedger();
  Game.recordWaveKill('bulldozer');
  Game.recordWaveKill('hushwolf');
  const before = JSON.stringify(Game.state.waveLedger);
  const oldScholar = Game.state.scholar;
  Game.state.scholar = { day: 12, id: 'fresh_adventurer' }; // a new life takes the mantle
  ok('ledger intact after scholar swap', JSON.stringify(Game.state.waveLedger) === before,
    'before=' + before);
  ok('points intact after scholar swap', Game.waveLedgerPoints(1) === 2, 'got ' + Game.waveLedgerPoints(1));
  Game.state.scholar = oldScholar;

  // ---- 9. announce idempotence (50% and 100% each fire once) ----
  resetLedger();
  const said = [];
  const realSysSay = Game.sysSay;
  Game.sysSay = function (msg) { said.push(String(msg)); };
  Game.state._ledgerAnn50 = {}; Game.state._ledgerAnnFull = {};
  // bar is 5: 2 kills -> 40% (no announce), 3rd -> 60% (50% announce),
  // 5th -> full announce. (recordWaveKill also fires the unlock beat when
  // the bar fills — that's the System's wave-2 beat, counted separately.)
  const ledgerSaid = () => said.filter(x => x.indexOf('WAVE LEDGER') >= 0);
  Game.recordWaveKill('bulldozer');   // 1
  Game.recordWaveKill('gallowdeer');   // 2
  ok('no announce before 50%', ledgerSaid().length === 0, 'said=' + JSON.stringify(ledgerSaid()));
  Game.recordWaveKill('hushwolf');     // 3 -> 50%
  ok('50% announces once', ledgerSaid().length === 1 && /halfway/i.test(ledgerSaid()[0]), 'said=' + JSON.stringify(ledgerSaid()));
  Game.recordWaveKill('mirrormoth');   // 4
  ok('50% does not repeat', ledgerSaid().length === 1, 'said=' + JSON.stringify(ledgerSaid()));
  Game.recordWaveKill('belltoad');     // 5 -> full
  ok('100% announces once', ledgerSaid().length === 2 && /bar is full/i.test(ledgerSaid()[1]), 'said=' + JSON.stringify(ledgerSaid()));
  ok('announce copy is honest (kills only)', /kills only/i.test(ledgerSaid()[1]), 'said=' + JSON.stringify(ledgerSaid()));
  Game.sysSay = realSysSay;

  // ---- 10. UI line is present and honest ----
  resetLedger();
  Game.recordWaveKill('bulldozer'); Game.recordWaveKill('hushwolf');
  const line = Game.ledgerProgressLine();
  ok('ledger line shows wave 1 progress', /wave 1: 2\/5 kills/.test(line) && /kills only/i.test(line), 'line=' + line);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
