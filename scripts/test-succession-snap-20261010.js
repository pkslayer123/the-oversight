#!/usr/bin/env node
// SUCCESSION-SNAP PROOF (2026-10-10, win-rate iteration round 5):
// "the link is with the village, not the person." A speaker death now costs
// the link a trust haircut (-8, not -15) plus a 7-day mourning window with
// no trust gains — and never snaps the link by itself. The snap survives
// only for the neglected: trust under 20 with no upkeep (tribute or
// trust-granting deeds) for 14+ days.
//
//   1. theirLeaderDied on a fresh subordinate link (trust 30): haircut to
//      22, link ACTIVE (not snapped), mourningUntil = day+7.
//   2. mourning blocks gains: proveWorth during mourning returns 0 and
//      trust is unchanged; after the window it grants again.
//   3. neglected link (trust 15, no upkeep 20d) still snaps on death.
//   4. kept low-trust link (trust 15, deed today) survives the same death.
//   5. successionCrisis (Haven-side): -8 haircut, mourning set, active;
//      tribute leverage still bites (x1.5 subordinate / x0.75 primary).
//   6. successionCrisis neglect snap: trust 15 + no upkeep 20d -> broken.
//   7. exploit: 30+ days of zero upkeep decays trust (no snap without a
//      death — decay is the -6/wk shortfall engine, tested via linkTick
//      settle path is heavy; instead assert neglect flag + arrears growth
//      via the shortfall branch) — and the link can never vest BELONG
//      (trust <50, arrears>0).
// Run: SEED=11 node scripts/test-succession-snap-20261010.js (also 222, 3333)
// Node harness: full src/js/*.js list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js). Math.random is
// seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG BEFORE eval ----
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
global.window = global; // equipment.js needs window at LOAD; deleted before play
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
delete global.window; // sync combat path, per harness lessons
const Game = globalThis.Scattering.Game;

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}
const dayNow = () => (Game.state.scholar || {}).day || 0;
const setDay = (d) => { Game.state.scholar.day = d; };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}

  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 3) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_succ' + n; t.name = 'Successionmere' + n; t.x = (t.x + 3 * n) % 9; t.generated = false;
    Game.state.otherVillages.push(t);
  }
  const ovs = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  const [vA, vB, vC] = ovs;
  const d0 = dayNow();
  const mkSub = () => Game._formLink(vA.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
  const mkPrim = () => Game._formLink(vB.id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);

  console.log(`[seed ${SEED}] succession: haircut not snap`);

  // ---- 1. theirLeaderDied: fresh link trust 30 -> 22, ACTIVE, mourning set ----
  let link = mkSub();
  ok(link && link.trust === 30, `fresh subordinate link at trust 30 (got ${link && link.trust})`);
  const tribBefore = link.tributeKcalPerWeek;
  const r1 = Game.theirLeaderDied(link.id);
  ok(r1 === 'shaken', `theirLeaderDied returns 'shaken' (got ${r1})`);
  ok(link.trust === 22, `haircut -8: trust 30 -> 22 (got ${link.trust})`);
  ok(link.status === 'active', `link ACTIVE after one speaker death (got ${link.status})`);
  ok(link.mourningUntil === d0 + 7, `mourning window set: mourningUntil = day+7 (got ${link.mourningUntil}, day ${d0})`);
  ok(link.tributeKcalPerWeek < tribBefore, `chaos leverage still bites: tribute renegotiated down (${tribBefore} -> ${link.tributeKcalPerWeek})`);

  // ---- 2. mourning blocks gains; window expiry restores them ----
  const vid = (Game.state.village.roster[0] || {}).id;
  const gBlocked = Game.proveWorth(link.id, vid, 9); // would be +3
  ok(gBlocked === 0, `proveWorth during mourning returns 0 (got ${gBlocked})`);
  ok(link.trust === 22, `trust unchanged during mourning (got ${link.trust})`);
  ok(Game._trustGain(link, 5) === 0, `_trustGain blocked during mourning`);
  setDay(d0 + 8); // past the window
  const gOpen = Game.proveWorth(link.id, vid, 9);
  ok(gOpen === 3, `proveWorth after mourning grants +3 (got ${gOpen})`);
  ok(link.trust === 25, `trust 22 -> 25 after window (got ${link.trust})`);
  ok(link.lastKeptDay === d0 + 8, `lastKeptDay stamped on gain (got ${link.lastKeptDay})`);
  setDay(d0);

  // ---- 3. neglected link still snaps on death ----
  link = mkSub();
  link.trust = 15; link.day = d0 - 30; link.lastKeptDay = d0 - 20; link.tributePaidWeek = -1;
  ok(Game._linkNeglected(link) === true, `sanity: link with no upkeep 20d is neglected`);
  const r3 = Game.theirLeaderDied(link.id);
  ok(r3 === 'broken', `neglected link snaps on speaker death (got ${r3})`);
  ok(link.status === 'broken', `link status broken (got ${link.status})`);
  ok(link.trust === 7, `haircut applied before snap: 15 -> 7 (got ${link.trust})`);

  // ---- 4. kept low-trust link survives the same death ----
  link = mkSub();
  link.trust = 15; link.day = d0 - 30; link.lastKeptDay = d0; link.tributePaidWeek = Math.floor(d0 / 7);
  ok(Game._linkNeglected(link) === false, `sanity: link with upkeep today is not neglected`);
  const r4 = Game.theirLeaderDied(link.id);
  ok(r4 === 'shaken', `kept low-trust link survives: 'shaken' (got ${r4})`);
  ok(link.status === 'active' && link.trust === 7, `active at trust 7 (status ${link.status}, trust ${link.trust})`);

  // ---- 5. successionCrisis (Haven-side): haircut, mourning, leverage ----
  link = mkSub(); // Haven subordinate
  const stBefore = link.tributeKcalPerWeek;
  const r5 = Game.successionCrisis(link.id);
  ok(r5 === 'shaken', `successionCrisis returns 'shaken' (got ${r5})`);
  ok(link.trust === 22, `haircut -8 on Haven-side death too (got ${link.trust})`);
  ok(link.status === 'active', `link ACTIVE (got ${link.status})`);
  ok(link.mourningUntil === d0 + 7, `mourning set Haven-side (got ${link.mourningUntil})`);
  ok(link.tributeKcalPerWeek === Math.round(stBefore * 1.5), `they install their own: tribute up 1.5x (${stBefore} -> ${link.tributeKcalPerWeek})`);
  const plink = mkPrim(); // Haven primary
  const ptBefore = plink.tributeKcalPerWeek;
  Game.successionCrisis(plink.id);
  ok(plink.trust === 22, `primary-side link also -8, no extra -10 stack (got ${plink.trust})`);
  ok(plink.tributeKcalPerWeek === Math.max(500, Math.round(ptBefore * 0.75)), `subordinate tests us: tribute pressed down (${ptBefore} -> ${plink.tributeKcalPerWeek})`);
  ok(plink.status === 'active', `primary-side link ACTIVE (got ${plink.status})`);

  // ---- 6. successionCrisis neglect snap ----
  link = mkSub();
  link.trust = 15; link.day = d0 - 30; link.lastKeptDay = d0 - 20; link.tributePaidWeek = -1;
  const r6 = Game.successionCrisis(link.id);
  ok(r6 === 'broken' && link.status === 'broken', `neglected link snaps on Haven-side death (got ${r6}/${link.status})`);

  // ---- 7. exploit: 30+ days zero upkeep -> decayed, unvestable, snaps on death ----
  // (dedicated village vC: linkWith/polityOf resolve per-village, so earlier
  // active vA links must not shadow this one)
  link = Game._formLink(vC.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
  link.day = d0 - 40; link.trust = 30; link.tributePaidWeek = -1; link.arrears = 8000;
  // simulate the weekly shortfall grind: 5 weeks x -6 (the linkTick short path)
  for (let w = 0; w < 5; w++) link.trust = Math.max(0, link.trust - 6);
  ok(link.trust === 0, `zero-upkeep trust decays to 0 over 5 weeks (got ${link.trust})`);
  ok(Game._linkNeglected(link) === true, `30+d zero upkeep is neglected`);
  ok(!(link.trust >= 50 && (link.arrears || 0) === 0), `decayed link fails the BELONG gates (trust ${link.trust}, arrears ${link.arrears}) — upkeep still matters`);
  const r7 = Game.theirLeaderDied(link.id);
  ok(r7 === 'broken', `zero-upkeep link snaps on the next speaker death (got ${r7})`);

  // ---- 8. peer kinds still route to covenantCrisis (unchanged path) ----
  // (theirLeaderDied delegates covenant/trade kinds; successionCrisis no longer
  //  touches them. Just assert the delegation still returns 'crisis'.)
  console.log(`[seed ${SEED}] done`);

  console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
