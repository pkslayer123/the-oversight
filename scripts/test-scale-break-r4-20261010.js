#!/usr/bin/env node
// BREAK-IT regional & hierarchy round 4 (2026-10-10, target 14): attacks the
// fresh scale-ladder code (commit abe7bf79 — scaleRank/national/global beats).
// BEFORE: demonstrates 3 breaks. AFTER: proves the fixes.
// Run: SEED=11 node scripts/test-scale-break-r4-20261010.js (also 222, 3333)
// Node harness: full src/js/*.js in index.html order minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js); Math.random seeded
// BEFORE eval (modules capture it at load); engine/ included.
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

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function saidHas(re) { return says.some(t => re.test(t)); }

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}

  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 4) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_test' + n; t.name = 'Testmere' + n; t.x = (t.x + 3 * n) % 9; t.generated = false;
    Game.state.otherVillages.push(t);
  }
  const ovs = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  if (ovs.length < 4) { console.log(`ABORT: need >=4 other villages`); process.exit(1); }
  ovs.forEach(v => { v.generated = true; });
  const [vA, vB, vC, vD] = ovs;
  const stock = (kcal) => { Game.state.village.pantry = Game.state.village.pantry || []; Game.state.village.pantry.push({ name: 'test grain', kcalEach: kcal, units: 1, spoilDay: 9999 }); };
  const mkLink = (vid, asSub) => Game._formLink(vid, { asSubordinate: asSub, tributeKcalPerWeek: 4000 }, null);
  const activeLinks = () => Game.hierarchyState().filter(l => l.status === 'active');
  const day = () => (Game.state.scholar || {}).day || 0;

  console.log(`[seed ${SEED}]`);

  // ---------- setup: LEAD realm + court answered ----------
  console.log('SETUP: LEAD realm, First Court answered (feast)');
  const lA = mkLink(vA.id, false), lB = mkLink(vB.id, false), lC = mkLink(vC.id, false);
  Game.answerAccord('gift');
  says.length = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && Game.state.pendingNational.led, 'First Court staged');
  stock(20000);
  ok(Game.answerNationalChoice('feast') === true, 'court answered: feast');
  ok(Game.state.nationalLive === true && Game.scaleRank() === 'national', 'nationalLive, rank national');

  // ---------- CATCH A: burn the realm after the court — rank is sticky ----------
  console.log('CATCH A: burn-the-realm exploit (nationalLive never revoked)');
  says.length = 0;
  Game.breakLink(lA.id, 'gambit');
  Game.breakLink(lB.id, 'gambit');
  Game.breakLink(lC.id, 'gambit');
  ok(activeLinks().length === 0, 'all 3 links broken — realm is gone');
  Game.hierarchyDaily(); // a day passes with no polity
  ok(Game.state.nationalLive === false, 'nationalLive revoked when the realm dissolves');
  ok(Game.scaleRank() !== 'national' && Game.scaleRank() !== 'global', `scaleRank drops (got ${Game.scaleRank()})`);
  ok(Game.scaleAtLeast(Game.scaleRank(), 'national') === false, 'wave-5/endgame scale gate no longer satisfied by a dead realm');
  ok(saidHas(/came apart|free fire|no longer/i), 'the loss is said aloud, never silent');

  // ---------- CATCH A2: BELONG upkeep dodge ----------
  console.log('CATCH A2: BELONG road — oath, then dodge tribute upkeep');
  says.length = 0;
  Game.state.nationalLive = false; Game.state.pendingNational = null; // independent attack
  const lD = mkLink(vD.id, true); // Haven subordinate
  lD.trust = 66; lD.arrears = 0; lD.day = day() - 25;
  Game.state.foreignPolities = [{ primary: vD.id, subs: [vA.id, vB.id], day: day() - 30 }];
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && !Game.state.pendingNational.led, 'The Binding staged');
  stock(10000);
  ok(Game.answerNationalChoice('swear') === true, 'oath sworn');
  ok(Game.state.nationalLive === true, 'national via BELONG');
  says.length = 0;
  Game.breakLink(lD.id, 'gambit'); // dodge the 4000 kcal/week upkeep
  Game.hierarchyDaily();
  ok(Game.state.nationalLive === false, 'national revoked after the oath-link breaks (no free upkeep dodge)');
  ok(saidHas(/came apart|free fire|no longer/i), 'upkeep-dodge loss said aloud');

  // ---------- CATCH B: zero-kcal oath, full +12 trust ----------
  console.log('CATCH B: The Binding swear — honor must be proportional');
  Game.state.nationalLive = false; Game.state.pendingNational = null; // independent attack
  const lD2 = mkLink(vD.id, true);
  lD2.trust = 66; lD2.arrears = 0; lD2.day = day() - 25;
  Game.state.foreignPolities = [{ primary: vD.id, subs: [vA.id, vB.id], day: day() - 30 }];
  says.length = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational, 'Binding staged again');
  Game.state.village.pantry = []; // empty pantry — the oath is 0 kcal
  const t0 = lD2.trust;
  ok(Game.answerNationalChoice('swear') === true, 'oath answered on empty pantry');
  const gain = lD2.trust - t0;
  ok(gain <= 2, `0-kcal oath grants token trust only, not full +12 (got +${gain})`);
  ok(saidHas(/0 kcal/), 'copy says the true (zero) amount');

  // ---------- CATCH C: the beats have no UI path (static proof) ----------
  console.log('CATCH C: pendingNational/pendingGlobal UI wiring (static)');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(/data-national="/.test(appSrc), 'app.js wires national beat buttons');
  ok(/data-global="/.test(appSrc), 'app.js wires global beat buttons');
  ok(/pendingNational/.test(appSrc), 'app.js renders the pending national beat');
  ok(/pendingGlobal/.test(appSrc), 'app.js renders the pending global beat');

  // ---------- HELD: x1.25 logistics bonus honesty ----------
  console.log('HELD: x1.25 tribute logistics — weekly, honest, non-stacking');
  Game.state.nationalLive = true; // direct flag for the logistics check
  Game.state.pendingNational = null;
  // a real polity (3 subs) so the post-fix revocation sees a live realm
  const lE = mkLink(vA.id, false), lE2 = mkLink(vB.id, false), lE3 = mkLink(vC.id, false);
  lE.trust = 100; lE2.trust = 100; lE3.trust = 100;
  const m = Game.mshipState();
  const grainCount = () => Game.state.village.pantry.filter(i => /Tribute grain/.test(i.name || '')).length;
  const grainBefore = grainCount();
  m.lastLinkWeek = -1;
  says.length = 0;
  Game.linkTick();
  const grains = Game.state.village.pantry.filter(i => /Tribute grain/.test(i.name || ''));
  ok(grains.length === grainBefore + 3, 'one grain item per sub link per weekly tick');
  const g = grains[grains.length - 1];
  ok(g.kcalEach === 5000 && g.units === 1, `grain is 4000 x 1.25 = 5000 kcal (got ${g.kcalEach})`);
  ok(g.spoilDay === day() + 21, 'spoil-dated like real food (+21d)');
  // the arrival line (35%/wk) must say the TRUE bonused amount when it fires
  let fired = null, guard = 0;
  while (!fired && guard++ < 12) {
    Game.state.scholar.day = day() + 7;
    m.lastLinkWeek = -1;
    Game.linkTick();
    fired = says.find(t => /arrives — ([\d,]+) kcal of grain/.test(t));
  }
  ok(!!fired, 'tribute arrival line fired within 12 weeks');
  if (fired) {
    const said = parseInt(fired.match(/arrives — ([\d,]+) kcal of grain/)[1].replace(/,/g, ''), 10);
    ok(said === 5000, `arrival line says the TRUE (bonused) amount (said ${said})`);
  }
  const g2count = grainCount();
  Game.linkTick(); // same week — must not re-trigger
  ok(grainCount() === g2count, 'second tick same week adds nothing (no stacking/farming)');
  Game.breakLink(lE.id, 'gambit'); Game.breakLink(lE2.id, 'gambit'); Game.breakLink(lE3.id, 'gambit');

  // ---------- HELD: beat-dies-aloud mid-beat, double-answer safe ----------
  console.log('HELD: mid-beat death + idempotent answers');
  const lF = mkLink(vB.id, false), lG = mkLink(vC.id, false), lH = mkLink(vD.id, false);
  Game.state.nationalLive = false;
  says.length = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational, 'court staged again');
  Game.breakLink(lF.id, 'gambit'); Game.breakLink(lG.id, 'gambit'); Game.breakLink(lH.id, 'gambit');
  says.length = 0;
  ok(Game.answerNationalChoice('feast') === null, 'answering a dissolved-beat returns null');
  ok(!Game.state.pendingNational && !Game.state.nationalLive, 'dead beat cleared, national not set');
  ok(saidHas(/never sits|came apart/i), 'mid-beat death said aloud');
  // restage and double-answer
  const lI = mkLink(vA.id, false), lJ = mkLink(vB.id, false), lK = mkLink(vC.id, false);
  says.length = 0;
  Game.hierarchyDaily();
  stock(20000);
  ok(Game.answerNationalChoice('host') === true, 'court answered once');
  ok(Game.answerNationalChoice('feast') === null, 'second answer is a no-op (no double feast)');

  // ---------- HELD: scaleRank is live-wired (not dead) ----------
  console.log('HELD: scaleRank wiring');
  ok(typeof Game.scaleRank === 'function', 'scaleRank exists');
  ok(Game.scaleRank() === 'national', 'rank national with live realm');
  ok(Game.scaleAtLeast(Game.scaleRank(), 'regional') === true, 'scaleAtLeast ladder honest');
  // wave-5 gate reads it defensively (game.js unlockedWave)
  ok(typeof Game.unlockedWave === 'function', 'unlockedWave exists');

  console.log(failures === 0 ? `\nALL PASS (seed ${SEED})` : `\n${failures} FAILURES (seed ${SEED})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
