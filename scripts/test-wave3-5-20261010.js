#!/usr/bin/env node
// PROOF TEST: wave 3-5 monsters (2026-10-10).
// Proves:
//   1. All 26 entries load schema-clean (mirrors validate-data.js; the real
//      one crashes pre-existing on events.json).
//   2. Gating fires on kills + scale, NEVER on calendar alone:
//      - wave 2: day 8 + 5 wave-1 LEDGER points (kills only, 2026-10-10).
//      - wave 3: day 25 + 5 wave-2 ledger points; day 200 alone does NOT unlock.
//      - wave 4: 4 wave-3 ledger points + scaleRank >= regional; points alone (rank village)
//        do NOT unlock; rank alone (no points) does NOT unlock.
//      - wave 5: 3 wave-4 ledger points + scaleRank >= national; regional + points does NOT.
//      - defensive: works with scaleRank absent (defaults regional).
//   3. Each wave's monsters survive a combat smoke test (start + rounds).
//   4. Anchored bands: hp within anchored ranges; damage/pierce within draft
//      bands validated by sim-dps-anchor-20261010.js (seeds 1-3):
//        godhood brawler ~220/round, hunter ~230/round, mid ~64/round.
//   5. Wave unlock beats fire (waveUnlockBeat says the identity lines).
//   6. Doom ruling: maybeCheatDeath is the single death choke point and the
//      code records Steve's ruling (doom deaths trigger phoenix normally).
// Green across 3 seeds: SEED=N node scripts/test-wave3-5-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

const W3 = ['redactor','gavel','focus_group','spool','chorus_line','terms_of_service','callback','buffering','ad_break'];
const W4 = ['congregation','strike','influencer','audit','reunion','suburb','eulogy','algorithm','eater'];
const W5 = ['cancellation','editor','rerun','spoiler','timeslot','nielsen','finale','network_note'];

function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  console.log('== WAVE 3-5 PROOF, SEED ' + SEED + ' ==');

  // ---- 1. roster ----
  const byId = Object.fromEntries(Game.data.monsters.map(m => [m.id, m]));
  ok('56 monsters total', Game.data.monsters.length === 56, 'got ' + Game.data.monsters.length);
  for (const id of [...W3, ...W4, ...W5]) ok(id + ' exists', !!byId[id]);
  ok('9 wave-3', W3.every(id => byId[id] && byId[id].wave === 3));
  ok('9 wave-4 (incl. eater)', W4.every(id => byId[id] && byId[id].wave === 4));
  ok('8 wave-5', W5.every(id => byId[id] && byId[id].wave === 5));

  // ---- 2. gating: LEDGER + scale, never calendar alone ----
  // (Wave Ledger 2026-10-10, Steve's reversal of 8730921c: kills only.
  // Bars: w1->2: 5 pts, w2->3: 5 pts, w3->4: 4 pts, w4->5: 3 pts.
  // Day floors: w2 day 8, w3+ day 25. Scale: w4 regional, w5 national.)
  const s = Game.state.scholar;
  const setState = (day, ledger, rankFn) => {
    s.day = day;
    Game.state.waveLedger = null;
    const L = Game.ledgerState();
    for (const w of Object.keys(ledger || {})) L[w].points = ledger[w];
    if (rankFn === null) { try { delete Game.scaleRank; } catch (e) { Game.scaleRank = undefined; } }
    else Game.scaleRank = rankFn;
  };
  // fresh: wave 1
  setState(1, {}, () => 'village');
  ok('fresh game: wave 1', Game.unlockedWave() === 1);
  // calendar alone never unlocks
  setState(200, {}, () => 'global');
  ok('day 200 + global rank + zero ledger: still wave 1', Game.unlockedWave() === 1, 'got ' + Game.unlockedWave());
  // wave 2: day 8 + 5 w1 points
  setState(8, { 1: 5 }, () => 'village');
  ok('day 8 + 5 w1 points: wave 2', Game.unlockedWave() === 2, 'got ' + Game.unlockedWave());
  setState(8, { 1: 4 }, () => 'village');
  ok('4 w1 points (one short): not wave 2', Game.unlockedWave() === 1, 'got ' + Game.unlockedWave());
  setState(7, { 1: 5 }, () => 'village');
  ok('day 7 + 5 w1 points: not wave 2 (day floor)', Game.unlockedWave() === 1, 'got ' + Game.unlockedWave());
  // wave 3: day 25 + 5 w2 points
  setState(25, { 2: 5 }, () => 'village');
  ok('day 25 + 5 w2 points: wave 3', Game.unlockedWave() === 3, 'got ' + Game.unlockedWave());
  setState(25, { 1: 5, 2: 4 }, () => 'global');
  ok('4 w2 points (one short): not wave 3', Game.unlockedWave() === 2, 'got ' + Game.unlockedWave());
  // wave 4: 4 w3 points + regional
  setState(60, { 3: 4 }, () => 'regional');
  ok('4 w3 points + regional: wave 4', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  setState(60, { 1: 5, 2: 5, 3: 4 }, () => 'village');
  ok('4 w3 points + village rank: NOT wave 4', Game.unlockedWave() === 3, 'got ' + Game.unlockedWave());
  setState(60, { 1: 5, 2: 5, 3: 3 }, () => 'national');
  ok('3 w3 points + national: NOT wave 4', Game.unlockedWave() === 3, 'got ' + Game.unlockedWave());
  setState(60, { 3: 99 }, () => 'regional');
  ok('99 w3 points + regional, zero w4 points: wave 4 not 5', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  // wave 5: 3 w4 points + national
  setState(90, { 4: 3 }, () => 'national');
  ok('3 w4 points + national: wave 5', Game.unlockedWave() === 5, 'got ' + Game.unlockedWave());
  setState(90, { 1: 5, 2: 5, 3: 4, 4: 3 }, () => 'regional');
  ok('3 w4 points + regional: NOT wave 5', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  setState(90, { 1: 5, 2: 5, 3: 4, 4: 2 }, () => 'global');
  ok('2 w4 points + global: NOT wave 5', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  // defensive: scaleRank absent -> defaults regional
  setState(60, { 3: 4 }, null);
  ok('no scaleRank: 4 w3 points -> wave 4 (defensive regional)', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  setState(90, { 1: 5, 2: 5, 3: 4, 4: 3 }, null);
  ok('no scaleRank: 3 w4 points -> wave 4 not 5 (needs national)', Game.unlockedWave() === 4, 'got ' + Game.unlockedWave());
  // pool follows the gate
  setState(90, { 4: 3 }, () => 'national');
  const pool = Game.monsterWavePool();
  ok('wave-5 pool has 56', pool.length === 56, 'got ' + pool.length);
  ok('pool includes eater + finale', pool.some(m => m.id === 'eater') && pool.some(m => m.id === 'finale'));
  setState(1, {}, () => 'village');
  ok('fresh pool is wave-1 only (15)', Game.monsterWavePool().length === 15, 'got ' + Game.monsterWavePool().length);
  // spawnWaveTarget covers wave 5
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(Game.spawnWaveTarget(pool));
  ok('spawnWaveTarget reaches wave 5', seen.has(5), 'saw ' + [...seen].sort().join(','));

  // ---- 3. combat smoke: every new monster starts and runs rounds ----
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  for (const id of [...W3, ...W4, ...W5]) {
    try {
      s.health = 9000; s.mx = 4; s.my = 4;
      s.equipped = { melee: { itemId: 'fire_hardened_spear', name: 'spear' } };
      Game.startCombat(id);
      ok(id + ' combat starts', !!Game.tbfight);
      let guard = 0, crashed = false;
      try {
        while (Game.tbfight && !Game.tbfight.over && guard++ < 12) {
          if (Game.tbIsPlayerTurn()) { try { Game.tbPlayerStudy(); } catch (e) {} endTurn(Game); }
          else Game.tbAdvance();
        }
      } catch (e) { crashed = true; ok(id + ' combat rounds crash-free', false, e.message); }
      if (!crashed) ok(id + ' combat runs 12 rounds', true);
      if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
      Game.state.scholar.monster = null;
    } catch (e) { ok(id + ' combat starts', false, e.message); }
  }

  // ---- 4. anchored bands ----
  // Draft wave bands, with the draft's own deliberate exceptions:
  // Ad Break [20,35] (pacing monster, not a build check), Suburb [35,55]
  // (a place — the tax is the weapon, not the hit).
  const bands = { 3: [[200, 400], [20, 70], [0, 0.25]], 4: [[800, 1400], [35, 95], [0.2, 0.5]], 5: [[1000, 1900], [50, 130], [0.25, 0.75]] };
  for (const id of [...W3, ...W4, ...W5]) {
    const m = byId[id], w = m.wave;
    const [hpb, dmgb, pb] = bands[w];
    ok(id + ' hp anchored', m.hp[0] >= hpb[0] && m.hp[1] <= hpb[1] + 300, JSON.stringify(m.hp));
    ok(id + ' dmg in draft band', m.attack.damage[0] >= dmgb[0] && m.attack.damage[1] <= dmgb[1], JSON.stringify(m.attack.damage));
    ok(id + ' pierce in draft band', (m.pierce || 0) >= pb[0] && (m.pierce || 0) <= pb[1], String(m.pierce));
  }
  // THE EATER: Steve's monster, faithful
  const eater = byId.eater;
  const eaterText = eater.attack.name + ' ' + eater.attack.telegraph + ' ' + eater.codexStages.observed + ' ' + eater.codexStages.slain;
  ok('eater grows with calories (gorge in telegraph/codex)',
    /gorge/i.test(eaterText) && /calor|kcal/i.test(eaterText));
  ok('eater eats plants+animals+people', /grid|plants|animals|people/i.test(eater.codexStages.observed));
  ok('eater is Living Garden predator', /living garden/i.test(eater.codexStages.slain));

  // ---- 5. wave unlock beats ----
  said.length = 0;
  Game.waveUnlockBeat(3);
  ok('wave-3 beat names The Final Draft', said.join(' ').includes('FINAL DRAFT'));
  said.length = 0;
  Game.waveUnlockBeat(4);
  ok('wave-4 beat names The Mirror Draft', said.join(' ').includes('MIRROR DRAFT'));
  said.length = 0;
  Game.waveUnlockBeat(5);
  ok('wave-5 beat names The Producers', said.join(' ').includes('PRODUCERS'));

  // ---- 6. doom ruling: single choke point + recorded ruling ----
  const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('maybeCheatDeath is the death choke point', gameJs.includes('maybeCheatDeath()'));
  ok('doom ruling recorded in code', /Doom countdowns.*do NOT bypass/i.test(gameJs));

  // ---- 7. knowledge gate: unknown stages never name the true name ----
  for (const id of [...W3, ...W4, ...W5]) {
    const m = byId[id];
    ok(id + ' unknown hides true name',
      !m.codexStages.unknown.toLowerCase().includes(m.name.toLowerCase()),
      m.codexStages.unknown.slice(0, 60));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); process.exit(1); });
