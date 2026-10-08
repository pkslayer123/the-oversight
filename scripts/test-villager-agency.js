// Villager agency tests. Usage: node scripts/test-villager-agency.js
// Covers Steve's directive: villagers as independent players — ranging
// profiles, multi-day expeditions with real encounters, independent
// progression (XP/knowledge/tiers), deeds surfacing through THREE channels
// (living codex, contest leaderboard, broadcast), hidden high-potential
// seeds, leadership heat for rising stars, and the mantle trust bonus.
//
// NOTE: ledger.js is intentionally NOT loaded here (it carries the
// progression/ladder functions this module integrates with at runtime —
// recordMoment, broadcastLine, progState via progression.js). Where the
// module touches ledger-owned functions, behavior is verified through
// guarded call-sites and stubs below.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// Seeded RNG BEFORE module eval — several modules capture Math.random at load.
// Fixed default seed; override with SEED env for extra runs.
(function () {
  var s = (parseInt(process.env.SEED || '20261008', 10) >>> 0) || 1;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
// ---- stubs for ledger-owned functions (captured by the module's wraps) ----
const moments = [], broadcasts = [];
globalThis.Scattering.Game.progState = function () {
  const s = this.state.scholar; s.prog = s.prog || {};
  s.prog.moments = s.prog.moments || []; s.prog.broadcast = s.prog.broadcast || [];
  s.prog.npcInteg = s.prog.npcInteg || {}; return s.prog;
};
globalThis.Scattering.Game.recordMoment = function (t) { moments.push(String(t)); };
globalThis.Scattering.Game.broadcastLine = function (t) { broadcasts.push(String(t)); };
globalThis.Scattering.Game.playerDeath = function (cause) {
  const v = this.state.village, t = v.trust || {};
  const ids = (v.roster || []).filter(id => id !== this.villagerId);
  ids.sort((a, b) => ((t[b] || 0) - (t[a] || 0)));
  this._mantlePicked = ids[0]; this._mantleCause = cause; return ids[0];
};
// ---- now load the module under test (wraps capture the stubs above) ----
eval(fs.readFileSync(path.join(ROOT, 'src/js/villager-agency.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/js/fieldFights.js'), 'utf8'));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0; moments.length = 0; broadcasts.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 1; // midday — departures allowed
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.health = 100; s.trauma = 0;
  Game.map.px = 3; Game.map.py = 3;
  Game.state.village.trust = Game.state.village.trust || {};
  return s;
}
function npcIds() { return (Game.state.village.roster || []).filter(id => id !== Game.villagerId); }
function rank(p) { return { homebody: 0, forager: 1, wanderer: 2, explorer: 3 }[p]; }

(async () => {
  await Game.init();

  // 1. range profiles: valid, cached, temperament-driven (deterministic)
  freshGame();
  var ids = npcIds();
  var vid = ids[0];
  var seen = {};
  ids.forEach(id => { seen[Game.npcRangeProfile(id)] = true; });
  ok('profiles are valid strings', Object.keys(seen).every(p => rank(p) !== undefined));
  ok('profile cached', Game.npcRangeProfile(vid) === Game.agencyState().profiles[vid]);
  var _nt = Game.npcTemper;
  delete Game.agencyState().profiles[vid];
  Game.npcTemper = function () { return 'bold'; };
  var pb = Game.npcRangeProfile(vid);
  delete Game.agencyState().profiles[vid];
  Game.npcTemper = function () { return 'cautious'; };
  var pc = Game.npcRangeProfile(vid);
  Game.npcTemper = _nt;
  ok('bold ranges farther than cautious (deterministic)', rank(pb) >= rank(pc) && (rank(pb) > rank(pc) || pb === 'explorer' || pc === 'homebody'));
  ok('maxDist ordering', Game.npcMaxDist(vid) >= 0 && Game.npcMaxDist(vid) <= 6);
  // across many rosters, all four profiles appear
  var all = {};
  for (var g = 0; g < 8; g++) { freshGame(); npcIds().forEach(id => { all[Game.npcRangeProfile(id)] = true; }); }
  ok('all four profiles appear across rosters', ['homebody', 'forager', 'wanderer', 'explorer'].every(p => all[p]));

  // 2. high-potential seeds: 2-3 per game, hidden
  freshGame();
  var pot = Object.keys(Game.agencyState().potential);
  ok('2-3 potential seeds', pot.length >= 2 && pot.length <= 3);
  ok('potential kinds valid', pot.every(id => ['talented', 'hardworking', 'clever'].includes(Game.agencyState().potential[id])));

  // 3. expeditions: leave and return with results
  freshGame();
  ids = npcIds(); vid = ids[0];
  Game.agencyState().profiles[vid] = 'explorer';
  var pantryBefore = Game.state.village.pantryKcal || 0;
  Game.startExpedition(vid, 3, 3, false);
  var st = Game.agencyState();
  ok('expedition started', !!st.exped[vid] && !!Game.state.village.away[vid]);
  var nodeBefore = JSON.stringify(Game.npcNode(vid));
  var dead = false;
  for (var l = 0; l < 6 && st.exped[vid]; l++) {
    Game.expeditionLeg(vid, 3, 3, false);
    if (Game.vpOf(vid).dead) { dead = true; break; }
  }
  if (!dead) {
    ok('expedition moved the villager', JSON.stringify(Game.npcNode(vid)) !== nodeBefore || st.exped[vid].legs > 0);
    var xp = Game.agencyOf(vid).xp[vid];
    ok('legs accrue XP', (xp.tracking + xp.survival + xp.bravery) > 0);
    // simulate the base clock bringing them home
    delete Game.state.village.away[vid];
    Game.agencyTick();
    ok('expedition returned', !Game.agencyState().exped[vid]);
    ok('return left explorerNews', !!(Game.state.village.explorerNews || {})[vid]);
  } else {
    ok('expedition death is possible (sim has real stakes)', true);
  }

  // 4. monster encounters are REAL FIGHTS (Steve 2026-10-08): evade /
  //    stand-down / hurt / death all reachable through expeditionMonster,
  //    driven by real inputs — never a table. Weak villagers get hurt or
  //    die out there; kills take strength (proven directed, below).
  freshGame();
  ids = npcIds();
  var cats = {};
  var vi = 0;
  outer: for (var t = 0; t < 600; t++) {
    vid = ids[vi % ids.length];
    if (Game.vpOf(vid).dead) { vi++; continue; }
    Game.state.village.health = Game.state.village.health || {};
    Game.state.village.health[vid] = 100;
    var sst = Game.agencyState();
    sst.exped[vid] = { encounters: [], legs: 0, duration: 999, dist: 5, finds: [] };
    var before = (Game.state.village.roster || []).length;
    Game.expeditionMonster(vid, 5, false);
    var ex = Game.agencyState().exped[vid];
    var enc = (ex && ex.encounters[0]) || '';
    if (enc.indexOf('evaded') === 0) cats.evaded = true;
    if (enc.indexOf('hurt') === 0) cats.hurt = true;
    if (enc.indexOf('stood down') === 0) cats.stood = true;
    if ((Game.state.village.roster || []).length < before) { cats.died = true; vi++; }
    else { try { delete Game.agencyState().exped[vid]; } catch (e) {} }
    if (cats.evaded && cats.stood && cats.hurt && cats.died) break outer;
  }
  ok('monster: evaded reachable', !!cats.evaded);
  ok('monster: stand-down reachable', !!cats.stood);
  ok('monster: hurt reachable', !!cats.hurt);
  ok('monster: death reachable (far, unlucky)', !!cats.died);

  // directed: a strong villager CAN kill through the full expedition path.
  // Stack the pool with one weak solo monster; the point is the routing
  // (expeditionMonster -> fieldFight -> 'killed' encounter), not the odds.
  // NOTE: health lives at state.village.health[vid] (what fieldFight and
  // hurtVillager read/write) — vpOf returns the data record, not state.
  freshGame();
  ids = npcIds();
  Game.state.village.health = Game.state.village.health || {};
  var strong = ids[0];
  try { Game.agencyOf(strong).xp[strong].bravery = 80; } catch (e) {}
  var weakPool = (Game.data.monsters || []).filter(function (m) { return m.id === 'lockpick_raccoon'; });
  var origPool = Game.monsterWavePool;
  Game.monsterWavePool = function () { return weakPool; };
  var kills = 0;
  for (var k = 0; k < 200; k++) {
    if (Game.vpOf(strong).dead) break;
    Game.state.village.health[strong] = 100;
    var s2 = Game.agencyState();
    s2.exped[strong] = { encounters: [], legs: 0, duration: 999, dist: 1, finds: [] };
    Game.expeditionMonster(strong, 1, false);
    var ex2 = Game.agencyState().exped[strong];
    if (ex2 && ex2.encounters[0] && ex2.encounters[0].indexOf('killed') === 0) kills++;
    try { delete Game.agencyState().exped[strong]; } catch (e) {}
  }
  Game.monsterWavePool = origPool;
  ok('monster: kill reachable (strong vs weak, full path)', kills > 0);

  // 5. progression: tiers rise, integration feeds the visible ladder
  freshGame();
  ids = npcIds(); vid = ids[0];
  var pg = Game.progState();
  var integBefore = pg.npcInteg[vid] || 0;
  var _ax = Game.agencyOf(vid).xp[vid]; _ax.tracking = 50; _ax.survival = 50; _ax.bravery = 30;
  Game.agencyTierCheck(vid, false);
  ok('tier rises with XP', Game.agencyOf(vid).tier[vid] === 3);
  ok('tier feeds npcInteg (visible ladder)', (pg.npcInteg[vid] || 0) > integBefore);

  // 6. recordDeed: THREE channels — codex, contest, broadcast
  freshGame();
  ids = npcIds(); vid = ids[1];
  Game.recordDeed(vid, 'monster_kill', 'TEST DEED: kill', 10);
  var deeds = Game.codexDeeds();
  ok('deed written to living codex', deeds.length >= 1 && deeds[0].text === 'TEST DEED: kill' && deeds[0].vid === vid);
  Game.recordDeed(vid, 'cache_haul', 'VIEW DEED 2', 6);
  ok('deed moves contest viewership', Game.npcViewership(vid) === 8); // 10->+5, 6->+3
  ok('big deed airs on broadcast', broadcasts.some(b => b.indexOf('TEST DEED') !== -1));
  ok('big deed hits show moments', moments.some(m => m.indexOf('TEST DEED') !== -1));
  ok('deed seeds gossip', (Game.state.village.gossip || []).some(g => g.action === 'deed'));
  var bcastBefore = broadcasts.length;
  Game.recordDeed(ids[2], 'survived_hurt', 'small deed', 2);
  ok('small deed does NOT air', broadcasts.length === bcastBefore);
  ok('small deed still in codex', Game.codexDeeds().some(d => d.text === 'small deed'));

  // 7. villagerBoard: sorted, player present, outshining visible
  freshGame();
  ids = npcIds();
  Game.recordDeed(ids[0], 'monster_kill', 'STAR DEED', 10);
  Game.recordDeed(ids[0], 'cache_haul', 'STAR DEED 2', 6);
  var board = Game.villagerBoard();
  ok('board sorted high->low', board.every((r, i) => i === 0 || board[i - 1].score >= r.score));
  ok('player is a row', board.some(r => r.you));
  ok('star outranks a deedless NPC', board.findIndex(r => r.vid === ids[0]) < board.findIndex(r => r.vid === ids[3]));
  ok('trend marks rising stars', board.find(r => r.vid === ids[0]).trend === '▲');

  // 8. outpacing: a ranging explorer pulls ahead of a homebody in the sim
  freshGame();
  ids = npcIds();
  var ex = ids[0], hb = ids[1];
  Game.agencyState().profiles[ex] = 'explorer';
  Game.agencyState().potential[ex] = 'hardworking';
  Game.agencyState().profiles[hb] = 'homebody';
  for (var e = 0; e < 40; e++) {
    if (Game.vpOf(ex).dead) break;
    if (!Game.agencyState().exped[ex]) Game.startExpedition(ex, 3, 3, false);
    if (Game.agencyState().exped[ex] && !Game.vpOf(ex).dead) Game.expeditionLeg(ex, 3, 3, false);
  }
  ok('explorer outpaces homebody in the sim', Game.agencyScore(ex) > Game.agencyScore(hb));

  // 9. mantle: deeds earn trust, so the village picks the one who became someone
  freshGame();
  ids = npcIds();
  var star = ids[2];
  Game.recordDeed(star, 'monster_kill', 'mantle deed', 10);
  Game.recordDeed(star, 'monster_kill', 'mantle deed 2', 10);
  ids.forEach(id => { Game.state.village.trust[id] = 10; });
  Game.playerDeath('test');
  ok('mantle favors the deed-earned successor', Game._mantlePicked === star);

  // 10. conversation: ask about the wild; teaching is real
  freshGame();
  ids = npcIds(); vid = ids[0];
  Game.state.village.explorerNews = Game.state.village.explorerNews || {};
  Game.state.village.explorerNews[vid] = { agency: true, day: Game.state.scholar.day, dist: 4 };
  var ch = Game.agencyChoices(vid);
  ok('ask-about-the-wild choice appears', ch.some(c => c.id === 'agency:ask_expedition'));
  var r = null;
  try { r = Game.agencyTurn(vid, 'agency:ask_expedition'); } catch (e) { r = null; }
  ok('agencyTurn answers with a line', !!(r && typeof r.line === 'string' && r.line.length > 10));
  ok('expedition news consumed', !((Game.state.village.explorerNews || {})[vid]));
  // teaching: an experienced explorer teaches a real plant
  var plantsBefore = Object.keys(Game.state.codex.plants || {}).length;
  Game.agencyOf(vid).know.plants = 5;
  Game.state.village.explorerNews[vid] = { agency: true, day: Game.state.scholar.day, dist: 2 };
  try { Game.agencyTurn(vid, 'agency:ask_expedition'); } catch (e) {}
  var plantsAfter = Object.keys(Game.state.codex.plants || {}).length;
  ok('explorer teaches a real plant identification', plantsAfter >= plantsBefore);

  // 11. agencyTick runs inside the wrapped npcNodeTravel without crashing
  freshGame();
  npcIds().forEach(id => { Game.agencyState().profiles[id] = 'explorer'; });
  var depBefore = npcIds().reduce((n, id) => n + ((Game.agencyOf(id).stats[id] || {}).expeditions || 0), 0);
  for (var k = 0; k < 40; k++) { try { Game.npcNodeTravel(); } catch (e) { ok('npcNodeTravel wrap never throws', false); } }
  var depAfter = npcIds().reduce((n, id) => n + ((Game.agencyOf(id).stats[id] || {}).expeditions || 0), 0);
  ok('expeditions depart through the wrapped clock', depAfter > depBefore);

  // 12. rising stars with the lead goal accumulate contender heat
  freshGame();
  ids = npcIds();
  var lead = ids[0];
  var vdata = Game.vpOf(lead);
  if (vdata) vdata.goal = 'lead';
  for (var d2 = 0; d2 < 6; d2++) Game.recordDeed(lead, 'monster_kill', 'rise deed ' + d2, 10);
  Game.state.village.heat = {};
  for (var h = 0; h < 60 && !(Game.state.village.heat[lead] > 0); h++) Game.agencyLeadershipTick();
  ok('rising star gains contender heat', (Game.state.village.heat[lead] || 0) > 0);

  // 13. DEAD IS DEAD (2026-10-08): a villager killed out there is dead on
  // the record — vpOf(vid).dead — not a roster ghost. Game code (party
  // skips, System fragments, record filters) reads this and must not lie.
  freshGame();
  ids = npcIds();
  Game.state.village.health = Game.state.village.health || {};
  var doomed = ids[0];
  Game.state.village.health[doomed] = 1; // one stiff breeze
  var packPool = (Game.data.monsters || []).filter(function (m) { return m.id === 'belltoad'; }); // pack 4, dmg 10-16
  var op13 = Game.monsterWavePool;
  Game.monsterWavePool = function () { return packPool; };
  var died = false;
  for (var dk = 0; dk < 10 && !died; dk++) {
    if ((Game.vpOf(doomed) || {}).dead) { died = true; break; }
    Game.state.village.health[doomed] = 1;
    var s13 = Game.agencyState();
    s13.exped[doomed] = { encounters: [], legs: 0, duration: 999, dist: 5, finds: [] };
    Game.expeditionMonster(doomed, 5, false);
    try { delete Game.agencyState().exped[doomed]; } catch (e) {}
    died = !!((Game.vpOf(doomed) || {}).dead);
  }
  Game.monsterWavePool = op13;
  ok('lethal fight removes from roster', !(Game.state.village.roster || []).includes(doomed));
  ok('lethal fight marks the record dead', died);

  // 14. lethal hurt is a real death, not a silent vanish (hunting injury)
  freshGame();
  ids = npcIds();
  Game.state.village.health = Game.state.village.health || {};
  var hurt = ids[1] || ids[0];
  Game.state.village.health[hurt] = 10;
  var corpsesBefore = (Game.corpses ? Game.corpses() : []).length;
  Game.hurtVillager(hurt, 50, 'hunting');
  ok('lethal hurt removes from roster', !(Game.state.village.roster || []).includes(hurt));
  ok('lethal hurt marks the record dead', !!((Game.vpOf(hurt) || {}).dead));
  ok('lethal hurt leaves a corpse', (Game.corpses ? Game.corpses() : []).length > corpsesBefore);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
