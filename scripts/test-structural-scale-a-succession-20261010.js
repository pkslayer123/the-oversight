#!/usr/bin/env node
// STRUCTURAL-SCALE PROOF A2 (2026-10-10, Worker A): succession grace for
// young links.
// Proves:
//   1. Young link (<21d, trust 30, Haven subordinate): succession costs -8
//      (not -15), does NOT snap, stages a real renegotiation beat
//      (pendingRenegotiation), and defers the tribute leverage play.
//   2. The beat answers played: 'gift' (trust +8, tribute stays),
//      'visit' (trust +5, tribute stays), 'wait' (trust -6, tribute x1.5
//      lands — grief becomes leverage). Unanswered beats expire aloud in
//      7 days with the 'wait' outcome.
//   3. Young link where Haven is primary: -8 (not -25), no snap, beat staged.
//   4. Old links (>=21d) keep master's landed law (round-5 winrate): -8 +
//      mourning, snap ONLY when neglected (trust<20 + no upkeep 14d).
//      Death + neglect kills; death alone doesn't. Deaths hit hard (canon).
//   5. A second succession while the beat is pending doesn't re-stage it.
//   6. breakLink kills the beat with the link.
// Run: SEED=11 node scripts/test-structural-scale-a-succession-20261010.js
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

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}
  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 3) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_sscale' + n; t.name = 'Sscale' + n; t.x = (t.x + 3 * n) % 9;
    t.generated = false; t.rumored = true;
    Game.state.otherVillages.push(t);
  }
  Game.state.networkLive = true;
  Game.state.scholar.day = 100; // mid-run; link ages set explicitly
  return Game.state.otherVillages.filter(v => v && v.id !== 'haven');
}
// link of `age` days, trust 30. asSub=true => Haven subordinate.
function youngLink(vid, age, asSub) {
  const link = Game._formLink(vid, { asSubordinate: asSub, tributeKcalPerWeek: 4000 }, null);
  link.day = 100 - age;
  link.trust = 30;
  return link;
}

(async () => {
  await Game.init(); // async data load; cached in global.SCATTER_DATA
  // ---------- 1. young subordinate link: grace, not the snap ----------
  console.log('young-subordinate:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, true);
    const r = Game.successionCrisis(link.id);
    ok(r === 'grace', 'young link succession returns grace (got ' + r + ')');
    ok(link.trust === 22, 'trust -8, not -15 (got ' + link.trust + ')');
    ok(link.status === 'active', 'link survives — no snap');
    ok(!!link.pendingRenegotiation && link.pendingRenegotiation.sub === true, 'renegotiation beat staged (sub=true)');
    ok(link.tributeKcalPerWeek === 4000, 'tribute leverage deferred, not applied (got ' + link.tributeKcalPerWeek + ')');
  }
  // ---------- 2a. gift answers the beat ----------
  console.log('gift:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, true);
    Game.successionCrisis(link.id);
    const r = Game.answerRenegotiation(link.id, 'gift');
    ok(r === 'gift', 'gift answers (got ' + r + ')');
    ok(link.trust === 30, 'trust +8 back to 30 (got ' + link.trust + ')');
    ok(!link.pendingRenegotiation, 'beat resolved');
    ok(link.tributeKcalPerWeek === 4000, 'tribute never rose — the leverage play died (got ' + link.tributeKcalPerWeek + ')');
  }
  // ---------- 2b. wait lets the silence answer ----------
  console.log('wait:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, true);
    Game.successionCrisis(link.id);
    const r = Game.answerRenegotiation(link.id, 'wait');
    ok(r === 'lapsed', 'wait resolves as lapsed (got ' + r + ')');
    ok(link.trust === 16, 'trust -6 more (got ' + link.trust + ')');
    ok(link.tributeKcalPerWeek === 6000, 'deferred tribute x1.5 lands: grief became leverage (got ' + link.tributeKcalPerWeek + ')');
    ok(link.status === 'active', 'still no snap — the beat, not the break, is the cost');
  }
  // ---------- 2c. expiry after 7 days ----------
  console.log('expiry:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, true);
    Game.successionCrisis(link.id);
    Game.state.scholar.day += 8;
    Game._renegotiationTick();
    ok(!link.pendingRenegotiation, 'beat expired after 7+ days');
    ok(link.trust === 16, 'expiry: trust -6 (got ' + link.trust + ')');
    ok(link.tributeKcalPerWeek === 6000, 'expiry: tribute x1.5 lands (got ' + link.tributeKcalPerWeek + ')');
    ok(Game.answerRenegotiation(link.id, 'gift') === null, 'answering an expired beat is a no-op');
  }
  // ---------- 3. young primary link: -8, not -25 ----------
  console.log('young-primary:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, false); // Haven primary
    const r = Game.successionCrisis(link.id);
    ok(r === 'grace', 'young primary-link succession returns grace (got ' + r + ')');
    ok(link.trust === 22, 'trust -8 flat, not -15-10 (got ' + link.trust + ')');
    ok(link.status === 'active', 'no snap');
    ok(!!link.pendingRenegotiation && link.pendingRenegotiation.sub === false, 'beat staged (sub=false)');
    const vr = Game.answerRenegotiation(link.id, 'visit');
    ok(vr === 'visit', 'visit answers (got ' + vr + ')');
    ok(link.trust === 27 || link.trust === 24, 'visit: trust +5 (or +2 on empty bench) (got ' + link.trust + ')');
    ok(!link.pendingRenegotiation, 'beat resolved');
  }
  // ---------- 4. old links: the unified law (master's landed law, round-5) ----------
  // -8 haircut + mourning, snap ONLY for the neglected (trust<20 + no upkeep
  // 14d). No renegotiation beat for old links — deaths hit hard (canon).
  console.log('old-links:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 30, true); // 30d old, trust 30
    link.lastKeptDay = 100; // kept current: NOT neglected
    const r = Game.successionCrisis(link.id);
    ok(r === 'shaken' && link.status === 'active', 'old link at trust 30 shaken, survives when kept (got ' + r + ')');
    ok(link.trust === 22, 'old law: -8 (got ' + link.trust + ')');
  }
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 45, true); // 45d old, trust 30
    link.trust = 25; // -8 -> 17 < 20, neglected (lastKept=day-45) -> snap
    const r = Game.successionCrisis(link.id);
    ok(r === 'broken' && link.status === 'broken', 'neglected old link snaps: death + neglect kills (got ' + r + ')');
  }
  {
    const [vA, vB] = freshGame();
    const link = youngLink(vA.id, 45, true); // 45d old, trust 40
    link.trust = 40;
    link.lastKeptDay = 100; // kept current
    const r = Game.successionCrisis(link.id);
    ok(r === 'shaken' && link.status === 'active', 'old link at trust 40 shakes, survives (got ' + r + ')');
    ok(link.trust === 32, 'old law: -8 (got ' + link.trust + ')');
    ok(!link.pendingRenegotiation, 'no beat for old links — deaths hit hard');
  }
  // ---------- boundary: 21d is old, 20d is young ----------
  console.log('boundary:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 21, true);
    link.lastKeptDay = 100; // kept: survives the -8 under master's law
    ok(Game.successionCrisis(link.id) === 'shaken', '21d link: old law (-8, shakes, no snap when kept)');
  }
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 20, true);
    ok(Game.successionCrisis(link.id) === 'grace', '20d link: grace');
  }
  // ---------- 5. second succession doesn't re-stage ----------
  console.log('restage:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, true);
    Game.successionCrisis(link.id);
    const beatDay = link.pendingRenegotiation.day;
    Game.successionCrisis(link.id);
    ok(link.pendingRenegotiation.day === beatDay, 'second succession does not re-stage the beat');
    ok(link.trust === 14, 'second succession still costs -8 (got ' + link.trust + ')');
    ok(link.status === 'active', 'still no snap');
  }
  // ---------- 6. breakLink kills the beat ----------
  console.log('break:');
  {
    const [vA] = freshGame();
    const link = youngLink(vA.id, 10, true);
    Game.successionCrisis(link.id);
    ok(!!link.pendingRenegotiation, 'beat staged');
    Game.breakLink(link.id, 'gambit');
    ok(!link.pendingRenegotiation, 'beat dies with the link');
  }

  console.log(failures ? `\n${failures} FAILURES (seed ${SEED})` : `\nALL GREEN (seed ${SEED})`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
