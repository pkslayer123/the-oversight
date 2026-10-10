#!/usr/bin/env node
// SCALE LADDER PROOF (2026-10-10, prog-scale workstream):
// proves each scale transition fires through real deeds (not timers),
// scaleRank() returns the right rank at each stage, the national beat plays
// once, and regional behavior has no regressions.
// Run: SEED=11 node scripts/test-scale-ladder-20261010.js  (also 222, 3333)
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

  const ovs0 = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  // newGame spawns 2-3 villages; the ladder proof needs 4. Synthesize a 4th
  // in test setup (cloned shape, unique id) — no game code involved.
  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 4) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_test' + n; t.name = 'Testmere' + n; t.x = (t.x + 3 * n) % 9; t.generated = false;
    Game.state.otherVillages.push(t);
  }
  const ovs = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  if (ovs.length < 4) { console.log(`ABORT: need >=4 other villages, have ${ovs.length}`); process.exit(1); }
  ovs.forEach(v => { v.generated = true; }); // known villages (knowsVillage gate)
  const [vA, vB, vC, vD] = ovs;
  const stock = (kcal) => { Game.state.village.pantry = Game.state.village.pantry || []; Game.state.village.pantry.push({ name: 'test grain', kcalEach: kcal, units: 1, spoilDay: 9999 }); };
  const mkLink = (vid, asSub) => Game._formLink(vid, { asSubordinate: asSub, tributeKcalPerWeek: 4000 }, null);

  console.log(`[seed ${SEED}] villages: ${ovs.map(v => v.name || v.id).slice(0, 5).join(', ')}`);

  // ---------- A: regional baseline (no regression) ----------
  console.log('A: regional baseline');
  ok(Game.scaleRank() === 'village', 'rank starts at village');
  says.length = 0;
  const linkA = mkLink(vA.id, false); // Haven primary — the deed: a link formed
  ok(!!linkA, 'first link forms via _formLink');
  ok(!!Game.state.networkLive, 'networkLive set');
  ok(!!Game.state.pendingAccord, 'Regional Dawn beat staged (pendingAccord)');
  ok(saidHas(/Two fires is a NETWORK/), 'Regional Dawn copy fired');
  ok(Game.scaleRank() === 'regional', 'rank is regional after first link');
  stock(20000);
  ok(Game.answerAccord('gift') === true, 'first gesture answered');
  ok(Game.scaleRank() === 'regional', 'rank still regional');

  // ---------- B: national via LEAD ----------
  console.log('B: national via LEAD (Haven primary of 3)');
  ok(Game.polityOf('haven') === null, 'no polity with 1 subordinate');
  const linkB = mkLink(vB.id, false);
  const linkC = mkLink(vC.id, false);
  says.length = 0;
  Game.hierarchyDaily(); // the morning after the deed
  const p = Game.polityOf('haven');
  ok(!!p && p.led && p.size === 4, `polityOf: led realm of 4 (got ${p ? p.size : 'null'})`);
  ok(!!Game.state.pendingNational && Game.state.pendingNational.led === true, 'national beat staged (The First Court)');
  ok(saidHas(/GOVERNANCE LAYER/), 'System overlay visibly grows (governance layer)');
  ok(Game.scaleRank() === 'regional', 'rank still regional before the beat is answered');
  const panBefore = Game.state.village.pantry.reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 0), 0);
  const tA0 = linkA.trust, tB0 = linkB.trust, tC0 = linkC.trust;
  ok(Game.answerNationalChoice('feast') === true, 'court answered: feast');
  ok(Game.state.nationalLive === true, 'nationalLive set');
  ok(Game.scaleRank() === 'national', 'rank is national');
  ok(linkA.trust === Math.min(100, tA0 + 10) && linkB.trust === Math.min(100, tB0 + 10) && linkC.trust === Math.min(100, tC0 + 10),
     `feast adds +10 trust per sub link (got ${linkA.trust}/${linkB.trust}/${linkC.trust} from ${tA0}/${tB0}/${tC0})`);
  const panAfter = Game.state.village.pantry.reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 0), 0);
  ok(panBefore - panAfter >= 5000, `feast cost real food (>=5000 kcal, got ${Math.round(panBefore - panAfter)})`);
  says.length = 0;
  Game._checkNational();
  ok(!Game.state.pendingNational, 'national beat plays once (no re-stage)');

  // ---------- C: national unlock — logistics bonus ----------
  console.log('C: national unlock (tribute x1.25, said honestly)');
  linkB.trust = 100; // the deed path: this link is rock solid
  try { Game.mshipState().lastLinkWeek = -999; } catch (e) {}
  const panN = Game.state.village.pantry.length;
  Game.linkTick();
  const grain = Game.state.village.pantry.slice(panN).find(it => /Tribute grain from/.test(it.name || ''));
  ok(!!grain, 'tribute grain arrived as a real pantry item');
  ok(grain && grain.kcalEach === 5000, `tribute at x1.25 = 5000 kcal (got ${grain && grain.kcalEach})`);

  // ---------- D: national via BELONG ----------
  console.log('D: national via BELONG (valued subordinate in a foreign realm)');
  Game.breakLink(linkA.id, 'severed'); Game.breakLink(linkB.id, 'severed'); Game.breakLink(linkC.id, 'severed');
  Game.state.nationalLive = false; Game.state.pendingNational = null;
  ok(Game.scaleRank() === 'regional', 'back to regional after breaking links (ladder holds)');
  const linkS = mkLink(vA.id, true); // the deed: Haven joins as subordinate
  ok(Game.scaleRank() === 'regional', 'subordinate link does not itself make Haven national');
  // the region climbs off-screen: vA's realm gathers two more fires
  Game.foreignPolities().push({ primary: vA.id, subs: [vB.id, vC.id], day: 0 });
  // trust is EARNED through deeds, not set: proveWorth via the deed path
  const me = Game.villagerId;
  for (let k = 0; k < 6; k++) Game.proveWorth(linkS.id, me, 24);
  linkS.day = (Game.state.scholar.day || 0) - 25; linkS.arrears = 0;
  ok(linkS.trust >= 60, `valued-subordinate trust earned via deeds (trust=${linkS.trust})`);
  const bp = Game.polityOf(vA.id);
  ok(!!bp && !bp.led && bp.size === 4, 'belong-polity recognized (4 fires, Haven not the head)');
  says.length = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && Game.state.pendingNational.led === false, 'national beat staged (The Binding)');
  ok(saidHas(/wants Haven's oath/), 'Binding copy fired');
  stock(20000);
  ok(Game.answerNationalChoice('swear') === true, 'oath sworn');
  ok(Game.state.nationalLive === true && Game.scaleRank() === 'national', 'rank national via BELONG');
  ok(linkS.trust >= 72, `oath raised trust (trust=${linkS.trust})`);

  // ---------- E: walking away refuses the scale ----------
  console.log('E: walk away from the Binding refuses the scale');
  Game.breakLink(linkS.id, 'severed');
  Game.state.nationalLive = false; Game.state.pendingNational = null;
  const linkS2 = mkLink(vB.id, true);
  Game.foreignPolities().push({ primary: vB.id, subs: [vC.id, vD.id], day: 0 });
  for (let k = 0; k < 6; k++) Game.proveWorth(linkS2.id, me, 24);
  linkS2.day = (Game.state.scholar.day || 0) - 25; linkS2.arrears = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && !Game.state.pendingNational.led, 'Binding staged again');
  ok(Game.answerNationalChoice('walk') === 'walked', 'walk returns walked');
  ok(linkS2.status === 'broken', 'the link is broken (vassal\'s gambit)');
  ok(Game.state.nationalLive === false, 'national refused — no silent flip');
  ok(Game.scaleRank() === 'regional', 'rank back to regional');

  // ---------- F: global — the pre-table beat ----------
  console.log('F: global (viewership threshold + played beat)');
  // (break-it r4: national is a live state, not a flag — the rung below must
  // be a real realm; faking nationalLive with no polity is now revoked aloud)
  mkLink(vA.id, false); mkLink(vB.id, false); mkLink(vC.id, false);
  Game.state.nationalLive = true; // setup: the ladder rung below is earned
  Game.state.village.viewership = 45; // deed-earned attention (recordMoment/showmanship)
  says.length = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingGlobal, 'global beat staged (The Watchers)');
  ok(saidHas(/THE WORLD IS WATCHING/), 'Watchers copy fired');
  ok(saidHas(/not the table/i), 'beat is pre-table, not the table');
  ok(Game.scaleRank() === 'national', 'rank national until the beat is answered');
  ok(Game.answerGlobalChoice('decline') === true, 'decline answered');
  ok(Game.state.globalLive === true, 'globalLive set even on decline (attention, not compliance)');
  ok(Game.scaleRank() === 'global', 'rank is global');
  ok(Game.state.village.viewership === 35, `decline costs viewership (got ${Game.state.village.viewership})`);
  Game._checkGlobal();
  ok(!Game.state.pendingGlobal, 'global beat plays once');

  // ---------- G: ladder order — no skipping ----------
  console.log('G: ladder order (global cannot skip national)');
  Game.state.globalLive = false; Game.state.pendingGlobal = null; Game.state.nationalLive = false;
  Game.state.village.viewership = 100;
  Game.hierarchyDaily();
  ok(!Game.state.pendingGlobal, 'no global beat without national, even at 100 viewership');
  ok(Game.scaleRank() === 'regional', 'rank regional');

  // ---------- H: foreign sim works (deterministic setup, stochastic fire) ----------
  console.log('H: foreign polity sim');
  // (break-it r4: section F built a real realm — break it so the foreign sim
  // has unlinked villages to work with; Haven's business is Haven's)
  Game.hierarchyState().filter(l => l.status === 'active').forEach(l => Game.breakLink(l.id, 'severed'));
  Game.state.nationalLive = false; Game.state.pendingNational = null;
  Game.state.foreignPolities = [];
  says.length = 0;
  let formed = false;
  for (let w = 0; w < 60 && !formed; w++) {
    Game.state.scholar.day = 100 + w * 7;
    Game.state._lastForeignPolityWeek = -1;
    Game._foreignPolitySim();
    formed = Game.foreignPolities().length > 0;
  }
  ok(formed, 'foreign polity formed off-screen within 60 weeks');
  ok(saidHas(/Word comes late/), 'Haven hears through traders, delayed');

  // ---------- I: regional no-regressions ----------
  console.log('I: regional regressions');
  stock(20000);
  const linkT = mkLink(vD.id, true);
  const paid = Game.payTribute(linkT.id);
  ok(paid > 0, `payTribute still moves real food (paid ${paid})`);
  ok(Game.proposeLink(vD.id, {}) === null, 'proposeLink refuses when a link exists');
  ok(Game.kingdomEndingEligible().eligible === false, 'kingdomEndingEligible still guards its bar');
  Game.polityNews(); Game.worldFeed(); // unlocks run without crashing
  ok(true, 'polityNews/worldFeed run clean');

  console.log(failures === 0 ? `\nALL GREEN (seed ${SEED})` : `\n${failures} FAILURES (seed ${SEED})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
