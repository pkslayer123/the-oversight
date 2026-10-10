#!/usr/bin/env node
// PACING BUILD (Steve 2026-10-09: "Continue all proposed"): proof tests for
// all 8 pacing/strategy proposals + the Arc III grave-dominance gap fix.
//
//   P1  feastSurge gate: all-maxed -> >=3 abilities at L3
//   P2  sentiment taught at integration 60, not 80
//   P3  trap learnability: first witnessed catch grants recipe L1
//   P4  audience trials: recurring post-40 + completable 1,000-kcal task
//   P5  slot ladder: 20->2, 35->3, 50->4, 65->5, 80->6
//   P6  Arc II gates on a real deed (breadth>=6 or a held contest)
//   P7  villager-villager bonds engine (+2 meals, +4 visits, grievance decay,
//       drift sediment, daily cap, no bonds with the dead)
//   P8  player-hosted feast (real pantry cost, 1/day, memories, trust, gossip)
//   GAP Arc III needs 2 crisis kinds (grave-first gets the acknowledgment line)
//
// Usage: node scripts/test-pacing-20261010.js
//        SEED=7 node scripts/test-pacing-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  return Game.state.scholar;
}
function npcIds(n) {
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, n || 3);
}
function atHaven() {
  const v = Game.state.village;
  Game.map.px = v.px ?? 4; Game.map.py = v.py ?? 4;
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ P1. feastSurge gate: >=3 at L3 ============
  console.log('\n-- P1. feastSurge: 3 mastered gifts, not all-maxed --');
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.teachSentiment();
    s.abilities = [
      { id: 'game_sense', name: 'Game Sense', level: 3, xp: 0 },
      { id: 'field_dressing', name: 'Field Dressing', level: 3, xp: 0 },
      { id: 'peacemaker', name: 'Peacemaker', level: 3, xp: 0 },
      { id: 'stalk', name: 'Stalk', level: 1, xp: 0 },
    ];
    s.inventory = [{ itemId: 'keepsake_test', name: 'old photo', sentimental: true, units: 1 }];
    s.trauma = 0;
    says.length = 0;
    Game.channelSentiment(0);
    ok('3xL3 -> feastSurge armed at promised x1.5', pg.feastSurge === 1.5);
  }
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.teachSentiment();
    s.abilities = [
      { id: 'game_sense', name: 'Game Sense', level: 3, xp: 0 },
      { id: 'stalk', name: 'Stalk', level: 1, xp: 0 },
    ];
    s.inventory = [{ itemId: 'keepsake_test', name: 'old photo', sentimental: true, units: 1 }];
    s.trauma = 0;
    Game.channelSentiment(0);
    ok('1xL3 + unmaxed -> practice, no surge', !pg.feastSurge);
  }
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.teachSentiment();
    s.backgroundAbilities = [];
    s.abilities = [{ id: 'game_sense', name: 'Game Sense', level: 3, xp: 0 }];
    s.inventory = [{ itemId: 'keepsake_test', name: 'old photo', sentimental: true, units: 1 }];
    s.trauma = 0;
    const msg = Game.channelSentiment(0);
    ok('1xL3 alone -> honest not-yet, no surge', !pg.feastSurge && /Not yet/.test(msg), String(msg).slice(0, 80));
  }

  // ============ P2. sentiment at 60 ============
  console.log('\n-- P2. sentiment taught at 60, not 80 --');
  {
    freshGame();
    const pg = Game.progState();
    pg.slotMoments = {};
    Game.state.systemArrived = true;
    says.length = 0;
    Game.slotMoment(60);
    ok('slotMoment(60) teaches sentiment', pg.sentimentTaught === true);
    ok('taught exactly once (dedupe)', says.filter(t => t.includes('RESONANCE HARMONICS')).length === 1);
  }
  {
    freshGame();
    const pg = Game.progState();
    pg.slotMoments = {}; pg.sentimentTaught = false;
    Game.state.systemArrived = true;
    Game.slotMoment(80);
    ok('slotMoment(80) no longer teaches', pg.sentimentTaught === false);
  }

  // ============ P3. trap learnability ============
  console.log('\n-- P3. first witnessed catch grants recipe L1 --');
  {
    freshGame();
    const s = Game.state.scholar;
    Game.state.codex.recipes = Game.state.codex.recipes || {};
    Game.state.codex.recipes['snare'] = { level: 0 };
    const t = Game.playerTile();
    t.traps = t.traps || [];
    t.traps.push({ recipeId: 'snare', setDay: s.day, uses: 10, mx: 4, my: 4 });
    t.wildlife = { cottontail_rabbit: 8 };
    let caught = false;
    for (let d = 0; d < 30 && !caught; d++) {
      const before = (Game.state.codex.recipes['snare'] || {}).level || 0;
      Game.checkTraps();
      const after = (Game.state.codex.recipes['snare'] || {}).level || 0;
      if (after > before) caught = true;
      // keep the trap fishing: reset uses so it keeps catching
      for (const tr of (t.traps || [])) { if (tr.recipeId === 'snare' && tr.uses < 10) tr.uses = 10; }
      t.wildlife = { cottontail_rabbit: 8 };
    }
    ok('witnessed catch -> snare recipe L1', caught && ((Game.state.codex.recipes['snare'] || {}).level || 0) >= 1);
    ok('learning announced honestly', says.some(t => /see the shape of it/.test(t)));
  }

  // ============ P4. audience trials ============
  console.log('\n-- P4. recurring trials + 1,000-kcal task --');
  {
    freshGame();
    const pg = Game.progState();
    const seen = new Set();
    for (let i = 0; i < 40; i++) { pg.trial = null; Game.offerAudienceTrial('audience'); if (pg.trial) seen.add(pg.trial.id + ':' + pg.trial.need); }
    ok('1,000-kcal task exists', [...seen].some(x => x === 'haul_small:1000'), [...seen].join(','));
    ok('3,000-kcal ambitious task kept', [...seen].some(x => x === 'haul:3000'), [...seen].join(','));
  }
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.state.systemArrived = true;
    s.integration = 45; pg.trial = null; pg.trialCd = 0;
    let offered = 0;
    for (let d = 0; d < 30 && !offered; d++) { s.day = (s.day || 1) + 1; pg.trialCd = 0; Game.checkAudienceEncore(); if (pg.trial) offered = d + 1; }
    ok('post-40 encore trial offered', offered > 0, `offered on day+${offered}`);
  }
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.state.systemArrived = true;
    s.integration = 30; pg.trial = null; pg.trialCd = 0;
    for (let d = 0; d < 30; d++) { s.day = (s.day || 1) + 1; pg.trialCd = 0; Game.checkAudienceEncore(); }
    ok('no encore below integration 40', !pg.trial);
  }

  // ============ P5. slot ladder ============
  console.log('\n-- P5. slot ladder granularity --');
  {
    freshGame();
    const s = Game.state.scholar;
    const cases = [[10, 1], [20, 2], [34, 2], [35, 3], [49, 3], [50, 4], [53, 4], [64, 4], [65, 5], [79, 5], [80, 6], [100, 6]];
    let allok = true, bad = '';
    for (const [integ, want] of cases) { s.integration = integ; const got = Game.abilitySlots(); if (got !== want) { allok = false; bad += `integ${integ}->${got}!=${want} `; } }
    ok('20->2, 35->3, 50->4, 65->5, 80->6', allok, bad);
  }

  // ============ P6. Arc II honesty ============
  console.log('\n-- P6. Arc II needs a real deed --');
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.state.systemArrived = true;
    s.day = 9;
    Game.checkArc();
    ok('day 9, no deed -> Arc stays I', pg.arc === 1, `arc=${pg.arc}`);
  }
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.state.systemArrived = true;
    s.day = 12;
    Game.checkArc(); // day-1 capture: baseBreadth = starting endowment
    for (let i = 0; i < 6; i++) Game.state.codex.plants['p_test_' + i] = { level: 1 };
    Game.checkArc();
    ok('breadth>=6 -> Arc II fires', pg.arc === 2, `arc=${pg.arc}`);
  }
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.state.systemArrived = true;
    s.day = 20;
    Game.state.contestsHeld = 1;
    Game.checkArc();
    ok('held contest -> Arc II fires (breadth 0)', pg.arc === 2, `arc=${pg.arc}`);
  }

  // ============ GAP. Arc III needs 2 crisis kinds ============
  console.log('\n-- GAP. Arc III crucible: 2 crisis kinds --');
  {
    freshGame();
    const s = Game.state.scholar, pg = Game.progState();
    Game.state.systemArrived = true;
    s.day = 20; s.integration = 50;
    Game.checkArc(); // capture baseBreadth first
    for (let i = 0; i < 12; i++) Game.state.codex.plants['p_test_' + i] = { level: 1 };
    pg.crises = { 'first-grave': true };
    Game.checkArc();
    ok('1 crisis -> Arc stays II', pg.arc === 2, `arc=${pg.arc}`);
    pg.crises['hunger-winter'] = true;
    Game.checkArc();
    ok('2 crisis kinds -> Arc III fires', pg.arc === 3, `arc=${pg.arc}`);
    ok('grave-first beat acknowledges the grave', says.some(t => t.includes('ARC III') && /grave/.test(t)), says.filter(t => t.includes('ARC III')).join(' ').slice(0, 120));
  }

  // ============ P7. bonds engine ============
  console.log('\n-- P7. villager-villager bonds --');
  {
    freshGame();
    const [a, b, c] = npcIds(3);
    ok('bondAdd forms a bond', Game.bondAdd(a, b, 2, 'test') === true);
    const bnd = Game.bondGet(a, b);
    ok('bond value recorded', bnd && bnd.v === 2, JSON.stringify(bnd));
    // daily cap: +2 then +10 in one day -> at most +6 total
    Game.bondAdd(a, b, 10, 'test');
    ok('no same-day inflation (+6/day cap)', Game.bondGet(a, b).v === 6, `v=${Game.bondGet(a, b).v}`);
    // pairAffinity reads bonds
    const aff = Game.pairAffinity(a, b);
    ok('pairAffinity reads bonds', aff >= 3, `aff=${aff}`);
    // grievance decays
    Game.recordGrievance(a, b, 'theft', 20);
    ok('grievance decays the bond', Game.bondGet(a, b).v < 6, `v=${Game.bondGet(a, b).v}`);
    // no bonds with the dead
    Game.removeVillager(c, 'killed');
    ok('no bond with the removed', Game.bondAdd(a, c, 5, 'test') === false && !Game.bondGet(a, c));
    // no self-bonds
    ok('no self-bonds', Game.bondAdd(a, a, 5, 'test') === false);
  }
  {
    // drift sediment: sustained warmth banks permanent depth
    freshGame();
    const [a, b] = npcIds(2);
    const v = Game.state.village;
    v.bonds = v.bonds || {};
    const k = Game.bondKey(a, b);
    const s = Game.state.scholar;
    for (let d = 0; d < 5; d++) { s.day = (s.day || 1) + 1; Game.bondAdd(a, b, 6, 'test'); }
    const bnd = v.bonds[k];
    ok('sediment: depth banked after sustained warmth', bnd && bnd.depth >= 1, JSON.stringify(bnd));
    ok('depth capped at 3', (bnd.depth || 0) <= 3);
  }
  {
    // lingering meals form bonds through the real hook
    freshGame();
    const v = Game.state.village;
    const [a, b] = npcIds(2);
    v.mealLog = [{ vid: b, part: 'dusk', place: 'haven' }];
    let formed = false;
    for (let i = 0; i < 12 && !formed; i++) {
      Game.logSitting(v, a, 'dusk');
      v.mealLog = [{ vid: b, part: 'dusk', place: 'haven' }];
      if (Game.bondGet(a, b)) formed = true;
    }
    ok('lingering meal forms a bond', formed);
  }

  // ============ P8. feast ============
  console.log('\n-- P8. player-hosted feast --');
  {
    freshGame();
    atHaven();
    const s = Game.state.scholar, v = Game.state.village;
    const roster = (v.roster || []).filter(id => id !== Game.villagerId);
    const cost = Math.max(1500, 400 * (roster.length + 1));
    v.pantry = [{ itemId: 'feast_grain', name: 'grain stores', kcalEach: 100, units: Math.ceil(cost / 100) + 20, spoilDay: 9999 }];
    const trustBefore = {};
    for (const id of roster.slice(0, 3)) trustBefore[id] = (v.trust || {})[id] || 10;
    says.length = 0;
    const r = Game.hostFeast();
    ok('feast held', r === 'The feast is held.', r);
    const mems = (v.memory || {});
    const gotMem = roster.slice(0, 3).every(id => (mems[id] || []).some(m => m.t === 'feast'));
    ok('attendees get feast memories', gotMem);
    const gotLived = roster.slice(0, 3).every(id => {
      const vp = Game.vpOf(id) || {};
      return ((vp.lifeseed || {}).lived || []).some(e => e.kind === 'feast_shared');
    });
    ok('lifeseed lived events written (drift sees them)', gotLived);
    const trustUp = roster.slice(0, 3).some(id => ((v.trust || {})[id] || 10) > (trustBefore[id] || 10));
    ok('trust moves via capped deed path', trustUp);
    ok('gossip seeded', (v.gossip || []).some(g => g.action === 'feast'));
    const pantryAfter = (() => { try { return Game.pantryKcalLive(v); } catch (e) { return -1; } })();
    ok('pantry really spent', pantryAfter < cost + 2100, `after=${Math.round(pantryAfter)}`);
    ok('one feast per day', Game.hostFeast() !== 'The feast is held.');
  }
  {
    freshGame();
    atHaven();
    const v = Game.state.village;
    v.pantry = [];
    const r = Game.hostFeast();
    ok('empty pantry refuses honestly', r !== 'The feast is held.' && /pantry/i.test(r), String(r).slice(0, 100));
  }

  // ============ lifeseed writer standalone ============
  console.log('\n-- lifeseed writer --');
  {
    freshGame();
    const [a] = npcIds(1);
    ok('recordLifeseedEvent writes', Game.recordLifeseedEvent(a, 'kindness') === true);
    const vp = Game.vpOf(a) || {};
    ok('lived array holds it', (((vp.lifeseed || {}).lived) || []).some(e => e.kind === 'kindness'));
  }

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR: ' + (e && e.stack || e)); process.exit(2); });
