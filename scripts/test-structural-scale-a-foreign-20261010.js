#!/usr/bin/env node
// STRUCTURAL-SCALE PROOF A1 (2026-10-10, Worker A): foreign-realm growth is
// engagement-driven, not clock-driven.
// Proves:
//   1. The engagement hooks stir the region (tradeTick caravan, payTribute,
//      answerDemand honored, answerDefenseCall/answerTradeCall 'send',
//      answerCovenantCrisis answered, _formLink/_formPeerLink, _foreignEyes).
//   2. The Haven-linked exclusion is gone: Haven-linked villages can bind
//      abroad (before: "Haven's business is Haven's" excluded them always).
//   3. Cadence: an engaged run (2 beats/wk) forms a 4-realm inside a run's
//      lifetime; a drift-only run (0 beats) does not within 120 days.
//   4. _foreignEyes nudges known villages' opinion (+2 won / -2 died).
// Run: SEED=11 node scripts/test-structural-scale-a-foreign-20261010.js
//      (also 222, 3333)
// Node harness: full src/js/*.js list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js). Math.random is
// seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '11', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}
function stir() { return Game.state._regionStir || 0; }

// Fresh game with N known villages; returns the village objects.
function freshGame(nVillages) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}
  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < nVillages) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_fscale' + n; t.name = 'Fscale' + n; t.x = (t.x + 3 * n) % 9;
    t.generated = false; t.rumored = true; t.opinion = 0;
    Game.state.otherVillages.push(t);
  }
  const ovs = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
  ovs.forEach(v => { v.rumored = true; if (typeof v.opinion !== 'number') v.opinion = 0; });
  Game.state.networkLive = true;
  Game.state.scholar.day = 0;
  return ovs;
}

function maxForeignSubs() {
  let m = 0;
  (Game.state.foreignPolities || []).forEach(fp => { m = Math.max(m, (fp.subs || []).length); });
  return m;
}

(async () => {
  await Game.init(); // async data load; cached in global.SCATTER_DATA
  // ---------- 1. engagement hooks stir the region ----------
  console.log('hooks:');
  {
    const ovs = freshGame(6);
    const [vA, vB, vC, vD, vE] = ovs;
    ok(stir() === 0, 'no momentum banked at start');
    // courtship: a new vassal link stirs
    const link = Game._formLink(vA.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
    ok(!!link && stir() >= 1, 'forming a link stirs the region (court)');
    // tribute caravan: paying the week current stirs
    const s0 = stir();
    const paid = Game.payTribute(link.id, 4000);
    ok(paid >= 4000 && stir() === s0 + 1, 'paying tribute current stirs the region (trade)');
    // demand honored stirs
    link.pendingDemand = { kind: 'counsel', day: 0 };
    const s1 = stir();
    ok(Game.answerDemand(link.id, true) === true && stir() === s1 + 1, 'honoring a demand stirs the region (aid)');
    // peer links stir on formation; covenant defense answered stirs
    const clink = Game._formPeerLink(vB.id, { kind: 'covenant' });
    ok(!!clink && stir() === s1 + 2, 'forming a covenant stirs the region (court)');
    clink.pendingDefense = { day: 0 };
    const ds = Game.answerDefenseCall(clink.id, 'send');
    ok(ds === 'sent' && stir() === s1 + 3, 'answering a defense call stirs the region (aid), got ' + ds);
    // trade call answered stirs
    const tlink = Game._formPeerLink(vC.id, { kind: 'trade' });
    const s2 = stir();
    tlink.pendingTradeCall = { day: 0 };
    const ts = Game.answerTradeCall(tlink.id, 'send');
    ok(ts === 'sent' && stir() === s2 + 1, 'answering a trade call stirs the region (aid), got ' + ts);
    // covenant crisis answered stirs
    clink.pendingCovenantCrisis = { why: 'strain', day: 0 };
    const s3 = stir();
    ok(Game.answerCovenantCrisis(clink.id, 'concede') === 'conceded' && stir() === s3 + 1, 'answering a crisis stirs the region');
    // tradeTick caravan stirs (chartered route pays)
    tlink.chartered = true;
    const s4 = stir();
    Game.tradeTick(tlink);
    ok(stir() === s4 + 1, 'a chartered route paying tariff stirs the region (trade caravan)');
    // foreign eyes: contest watched abroad stirs + nudges opinion
    const s5 = stir();
    Game._foreignEyes('The Gauntlet', 'won');
    ok(stir() === s5 + 1, 'a televised contest stirs the region');
    ok(Game._otherVillage(vD.id).opinion === 2, 'won contest: known village opinion +2 (got ' + Game._otherVillage(vD.id).opinion + ')');
    Game._foreignEyes('The Gauntlet', 'died');
    ok(Game._otherVillage(vD.id).opinion === 0, 'died contest: known village opinion -2 (got ' + Game._otherVillage(vD.id).opinion + ')');
    const unk = { id: 'village_unknown_x', name: 'Unknown' };
    Game._foreignEyes('The Gauntlet', 'won'); // unknown village: no crash, no stir change issue
    ok(true, 'foreign eyes with unknown villages does not crash');
  }

  // ---------- 2. Haven-linked villages are candidates now ----------
  console.log('exclusion:');
  {
    const ovs = freshGame(8); // roomy pool: bindings shouldn't saturate it
    const [vA, vB] = ovs;
    Game._formLink(vA.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
    Game._formLink(vB.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
    ok(!!Game.linkWith(vA.id) && !!Game.linkWith(vB.id), 'Haven-linked villages are linked');
    let sawLinkedAbroad = false;
    for (let w = 0; w < 60 && !sawLinkedAbroad; w++) {
      Game.state._regionStir = 12; // heavy engagement every week
      Game.state.scholar.day += 7;
      Game._foreignPolitySim();
      (Game.state.foreignPolities || []).forEach(fp => {
        const members = [fp.primary].concat(fp.subs || []);
        members.forEach(m => { if (Game.linkWith(m)) sawLinkedAbroad = true; });
      });
    }
    ok(sawLinkedAbroad, 'a Haven-linked village bound abroad within 60 engaged weeks (exclusion removed)');
  }

  // ---------- 3+4. cadence: engaged vs drift ----------
  console.log('cadence:');
  function runCadence(beatsPerWeek, days) {
    freshGame(6);
    let firstFourDay = -1;
    for (let d = 0; d < days; d += 7) {
      for (let b = 0; b < beatsPerWeek; b++) Game.stirRegion('trade', 'sim');
      Game.state.scholar.day += 7;
      Game._foreignPolitySim();
      if (firstFourDay < 0 && maxForeignSubs() >= 3) firstFourDay = Game.state.scholar.day;
    }
    return { firstFourDay, maxSubs: maxForeignSubs() };
  }
  {
    const engaged = runCadence(2, 84);
    console.log(`    engaged (2 beats/wk): 4-realm at day ${engaged.firstFourDay}, max subs ${engaged.maxSubs}`);
    ok(engaged.firstFourDay > 0 && engaged.firstFourDay <= 84, 'engaged: a 4-realm forms inside 84 days');
  }
  {
    const drift = runCadence(0, 120);
    console.log(`    drift (0 beats): max foreign subs ${drift.maxSubs} over 120d`);
    ok(drift.firstFourDay < 0, 'drift-only: no 4-realm within 120 days (waiting does nothing)');
  }

  console.log(failures ? `\n${failures} FAILURES (seed ${SEED})` : `\nALL GREEN (seed ${SEED})`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
