#!/usr/bin/env node
// test-bal-waves-20261010.js — proof test for the bal-waves rework.
// 1. Wave unlock engagement lanes: facing/fleeing distinct wave-N monsters
//    blow-by-blow opens the next wave's gate (kills stay the faster lane).
//    Day/scale floors unchanged. Deed bars (5/5/4/3/2) untouched.
// 2. Feast-surge rework: mastery lane (3x L3) kept; devotion lane
//    (surgeResonance >= 35 from uses/level-ups/synergies) added; channel XP
//    is focused (+6 to closest gift), not sprayed.
// BEFORE (old HEAD): engagement-lane assertions FAIL (engagement ignored),
//   devotion-lane assertions FAIL (3-mastered only), focused-XP FAIL.
// AFTER: all green.
// Usage: node scripts/test-bal-waves-20261010.js [seed]
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require(ROOT + '/scripts/sim-harness');

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; results.push(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const seed = parseInt(process.argv[2] || '7', 10);
  const { Game } = await loadGame({ seed, mode: 'bal-waves-test' });
  await setupGame(Game);
  const s = Game.state.scholar;

  // ---- helpers ----
  // Note: scoreLedgerKill caps 2 pts per monster type — every id credited
  // below is a distinct type, so each scores exactly 1 point.
  const W1 = ['bulldozer', 'hushwolf', 'gallowdeer', 'mirrormoth', 'belltoad'];
  const W2 = ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea', 'memory_projector'];
  const W3 = ['redactor', 'gavel', 'spool', 'chorus_line'];
  const W4 = ['congregation', 'strike', 'influencer'];
  const setDay = (d) => { s.day = d; };
  // setLedger({wave: [monsterIds]}): reset the ledger, credit via the REAL
  // scorer (per-type caps enforced honestly, not hand-set points).
  const setLedger = (pts) => {
    Game.state.waveLedger = null;
    Game.ledgerState();
    for (const w of Object.keys(pts)) {
      for (const id of pts[w]) Game.scoreLedgerKill(id);
    }
  };
  const setFaced = (ids) => {
    // reset the deed feed, then feed real recordDeedFight calls
    try { Game.progState().deeds = {}; } catch (e) {}
    for (const id of ids) Game.recordDeedFight(id);
  };
  const realScaleRank = Game.scaleRank;
  const setRank = (r) => { Game.scaleRank = () => r; };
  // ============ 1. WAVE LEDGER GATES (Steve 2026-10-10 — REVERSAL of the
  // bal-waves engagement lanes, commit 8730921c). Unlocks are ledger-only:
  // kills score (player or villager), engagements score NOTHING toward
  // unlocks. Bars: w1->2: 5 pts, w2->3: 5 pts, w3->4: 4 pts, w4->5: 3 pts.
  // The endgame deed gate (5/5/4/3/2) is untouched.
  // w2: ledger lane — 5 w1 points, day 10
  setDay(10); setLedger({ 1: W1 }); setFaced([]);
  check('w2 ledger lane (5 w1 kills, day 10) unlocks', Game.unlockedWave() >= 2, 'uw=' + Game.unlockedWave());
  // w2: engagements score nothing now (REVERSED 8730921c)
  setDay(10); setLedger({}); setFaced(['bulldozer', 'hushwolf', 'gallowdeer', 'mirrormoth']);
  check('w2 engagement-only (4 faced, 0 kills) stays locked', Game.unlockedWave() < 2, 'uw=' + Game.unlockedWave());
  // w2: day floor holds
  setDay(7); setLedger({ 1: W1 }); setFaced([]);
  check('w2 day floor (day 7, ledger full) stays locked', Game.unlockedWave() < 2, 'uw=' + Game.unlockedWave());
  // w2: bar is 5, not 4
  setDay(10); setLedger({ 1: W1.slice(0, 4) }); setFaced([]);
  check('w2 needs 5 points (4 is not enough)', Game.unlockedWave() < 2, 'uw=' + Game.unlockedWave());

  // w3: ledger lane — 5 w2 points, day 30
  setDay(30); setLedger({ 2: W2 }); setFaced([]);
  check('w3 ledger lane (5 w2 kills, day 30) unlocks', Game.unlockedWave() >= 3, 'uw=' + Game.unlockedWave());
  // w3: engagements score nothing
  setDay(30); setLedger({}); setFaced(W2);
  check('w3 engagement-only (5 faced, 0 kills) stays locked', Game.unlockedWave() < 3, 'uw=' + Game.unlockedWave());
  // w3: day floor holds
  setDay(24); setLedger({ 2: W2 }); setFaced([]);
  check('w3 day floor (day 24, ledger full) stays locked', Game.unlockedWave() < 3, 'uw=' + Game.unlockedWave());
  // w3: bar is 5, not 4
  setDay(30); setLedger({ 2: W2.slice(0, 4) }); setFaced([]);
  check('w3 needs 5 points (4 is not enough)', Game.unlockedWave() < 3, 'uw=' + Game.unlockedWave());

  // w4: ledger lane — 4 w3 points + regional
  setDay(60); setLedger({ 3: W3 }); setFaced([]); setRank('regional');
  check('w4 ledger lane (4 w3 kills + regional) unlocks', Game.unlockedWave() >= 4, 'uw=' + Game.unlockedWave());
  // w4: engagements score nothing
  setDay(60); setLedger({}); setFaced(['redactor', 'gavel', 'spool']); setRank('regional');
  check('w4 engagement-only (3 faced + regional) stays locked', Game.unlockedWave() < 4, 'uw=' + Game.unlockedWave());
  // w4: scale floor holds
  setDay(60); setLedger({ 3: W3 }); setFaced([]); setRank('village');
  check('w4 scale floor (ledger full but village) stays locked', Game.unlockedWave() < 4, 'uw=' + Game.unlockedWave());

  // w5: ledger lane — 3 w4 points + national
  setDay(90); setLedger({ 4: W4 }); setFaced([]); setRank('national');
  check('w5 ledger lane (3 w4 kills + national) unlocks', Game.unlockedWave() >= 5, 'uw=' + Game.unlockedWave());
  // w5: engagements score nothing
  setDay(90); setLedger({}); setFaced(['congregation', 'strike']); setRank('national');
  check('w5 engagement-only (2 faced + national) stays locked', Game.unlockedWave() < 5, 'uw=' + Game.unlockedWave());
  // w5: scale floor holds
  setDay(90); setLedger({ 4: W4 }); setFaced([]); setRank('regional');
  check('w5 scale floor (ledger full but regional) stays locked', Game.unlockedWave() < 5, 'uw=' + Game.unlockedWave());
  setRank('village');
  if (realScaleRank) Game.scaleRank = realScaleRank;

  // waveEngaged helper still reads the deed feed honestly (engine-unused for
  // unlocks since the ledger; the ENDGAME deed gate is its remaining reader)
  const wEng = (w) => (typeof Game.waveEngaged === 'function') ? Game.waveEngaged(w) : -1;
  setFaced(['bulldozer', 'hushwolf', 'voice_mimic_radio']);
  check('waveEngaged(1)==2', wEng(1) === 2, 'got ' + wEng(1));
  check('waveEngaged(2)==1', wEng(2) === 1, 'got ' + wEng(2));
  check('waveEngaged(3)==0', wEng(3) === 0, 'got ' + wEng(3));
  // duplicate feeds don't double-count (distinct)
  Game.recordDeedFight('bulldozer');
  check('waveEngaged distinct (dup feed)', wEng(1) === 2, 'got ' + wEng(1));

  // ============ 2. FEAST SURGE REWORK ============
  // build a keepsake-holding scholar with sentiment taught
  const pg = Game.progState();
  pg.sentimentTaught = true;
  s.trauma = 0;
  // ensure a keepsake in inventory
  let kidx = (s.inventory || []).findIndex(it => it && (it.sentimental || (Game.itemDef(it) || {}).class === 'sentimental'));
  if (kidx < 0) {
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId: 'wedding_ring', id: 'wedding_ring', name: 'wedding ring', sentimental: true, chosen: false });
    kidx = s.inventory.length - 1;
  }
  const chanOK = () => (Game.channelReadyKeepsakes ? Game.channelReadyKeepsakes().length : 1) > 0;

  // mastery lane (kept): 3 abilities at L3
  s.abilities = [
    { id: 'ab1', name: 'Ab One', level: 3, xp: 0 },
    { id: 'ab2', name: 'Ab Two', level: 3, xp: 0 },
    { id: 'ab3', name: 'Ab Three', level: 3, xp: 0 },
  ];
  s.backgroundAbilities = [];
  s.prog.feastSurge = false; pg.surgeResonance = 0;
  // reset chanDay so the channel fires
  pg.chanDay = {};
  let msg = Game.channelSentiment(kidx);
  check('mastery lane arms (3x L3)', !!s.prog.feastSurge, 'msg=' + msg);

  // devotion lane (NEW): 0 mastered, resonance >= 35
  s.abilities = [{ id: 'ab1', name: 'Ab One', level: 1, xp: 0 }];
  s.prog.feastSurge = false; pg.surgeResonance = 55; pg.chanDay = {};
  msg = Game.channelSentiment(kidx);
  check('devotion lane arms (resonance 55, 0 mastered)', !!s.prog.feastSurge, 'msg=' + msg);
  check('devotion message is honest (lived-in, not mastered)', /lived-in/.test(msg), 'msg=' + msg);

  // below threshold: focused practice, no arm
  s.abilities = [
    { id: 'ab1', name: 'Ab One', level: 1, xp: 9 },   // needs 1 to L2
    { id: 'ab2', name: 'Ab Two', level: 1, xp: 0 },   // needs 10
  ];
  s.prog.feastSurge = false; pg.surgeResonance = 10; pg.chanDay = {};
  const xpBefore = s.abilities[0].xp;
  msg = Game.channelSentiment(kidx);
  check('below threshold does NOT arm', !s.prog.feastSurge, 'msg=' + msg);
  check('focused XP goes to closest-to-complete (ab1)', s.abilities[0].xp > xpBefore || s.abilities[0].level > 1,
    'ab1 xp=' + s.abilities[0].xp + ' lvl=' + s.abilities[0].level);
  check('focused XP does NOT spray to ab2', s.abilities[1].xp === 0, 'ab2 xp=' + s.abilities[1].xp);
  check('practice message names the gift', /Ab One/.test(msg), 'msg=' + msg);

  // resonance accounting: +1 per use, +5 per level-up
  s.abilities = [{ id: 'abX', name: 'Ab X', level: 1, xp: 0 }];
  pg.surgeResonance = 0;
  Game.gainAbilityXP('abX', 1);
  check('gainAbilityXP +1 resonance per call', pg.surgeResonance === 1, 'got ' + pg.surgeResonance);
  // 9 more to hit 10 -> level up (+5 bonus)
  for (let i = 0; i < 9; i++) Game.gainAbilityXP('abX', 1);
  check('level-up adds +5 resonance', pg.surgeResonance === 15, 'got ' + pg.surgeResonance);
  check('ability leveled to 2', s.abilities[0].level === 2, 'lvl=' + s.abilities[0].level);

  // channelLabel honesty
  pg.surgeResonance = 60; s.trauma = 0;
  s.abilities = [{ id: 'ab1', name: 'Ab One', level: 1, xp: 0 }];
  check('channelLabel offers surge on devotion lane', /surge the feast/.test(Game.channelLabel()), Game.channelLabel());
  pg.surgeResonance = 0;
  check('channelLabel offers training below threshold', /train gifts/.test(Game.channelLabel()), Game.channelLabel());

  console.log(`\nbal-waves proof: ${pass} passed, ${fail} failed`);
  for (const r of results) console.log(r);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR: ' + (e && e.stack || e)); process.exit(2); });
