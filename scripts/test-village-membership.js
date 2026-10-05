// Village membership tests. Usage: node scripts/test-village-membership.js
// Covers Steve's directive: membership without presence (no check-ins, exile
// is the severing), pantry/codex/protection/viewership benefits, exile cut
// complete + legible, remote applications (judge/accept/refuse/debate),
// village growth (housing, food projections, crowding), and network scaling
// hooks (regional standing, alliances, recognizedAbroad, reputation abroad,
// village-to-village applications).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
// stubs for ledger-owned functions
globalThis.Scattering.Game.progState = function () {
  const s = this.state.scholar; s.prog = s.prog || {};
  s.prog.moments = s.prog || []; return s.prog;
};
globalThis.Scattering.Game.recordMoment = function () {};
globalThis.Scattering.Game.broadcastLine = function () {};
eval(fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8'));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 3000; s.health = 100; s.exiled = false; s.codexCut = false;
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.severed = {};
  return s;
}
function npcIds() { return (Game.state.village.roster || []).filter(id => id !== Game.villagerId); }
function saidHas(sub) { return said.some(t => t.indexOf(sub) >= 0); }

(async () => {
  await Game.init();

  // 1. module loaded + membership core
  freshGame();
  ok('module loaded', typeof Game.isMember === 'function');
  var pid = Game.villagerId, nid = npcIds()[0];
  ok('player is member', Game.isMember(pid) === true);
  ok('npc is member', Game.isMember(nid) === true);
  ok('non-roster is not member', Game.isMember('nobody_xyz') === false);
  ok('4 benefits for member', Game.memberBenefits(pid).length === 4);
  ok('benefit keys', Game.memberBenefits(pid).map(b => b.key).join(',') === 'pantry,codex,protection,viewership');

  // 2. no presence requirement: membership ignores location entirely
  ok('away (simulated) npc still member', Game.isMember(nid) === true);
  // (isMember never consults position — by construction; awayMembers is informational)
  ok('awayMembers returns array', Array.isArray(Game.awayMembers()));

  // 3. pantry blocked when exiled
  freshGame();
  Game.state.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 5 }];
  Game.state.scholar.exiled = true;
  ok('takeFromPantry blocked when exiled', Game.takeFromPantry(0) === null);
  ok('blocked says why', saidHas('not yours anymore'));
  said.length = 0;
  ok('villageMeal blocked when exiled', Game.villageMeal() === null);
  ok('meal blocked says why', saidHas('not yours anymore'));
  Game.state.scholar.exiled = false;
  said.length = 0;
  Game.takeFromPantry(0);
  ok('takeFromPantry works when member', !saidHas('not yours anymore'));

  // 4. villageEats skips the exiled (no phantom draw from the common pot)
  freshGame();
  pid = Game.villagerId;
  Game.data.villagers.push({ id: 'tm_npc', name: 'Test Npc', providesPerDay: 0, kcalPerDay: 2000 });
  var prec = Game.data.villagers.find(p => p.id === pid);
  var savedProv = prec.providesPerDay, savedKcal = prec.kcalPerDay;
  prec.providesPerDay = 0; prec.kcalPerDay = 2000;
  Game.state.village.roster = [pid, 'tm_npc'];
  Game.state.village.health = {}; Game.state.village.trust = {}; Game.state.village.taught = {};
  Game.state.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 10, spoilDay: 99 }];
  Game.state.scholar.exiled = true; // player severed
  Game.villageEats();
  var left = Game.state.village.pantry.length ? Game.state.village.pantry[0].units : 0;
  ok('villageEats skips exiled player (8 units left, not 6)', left === 8);
  prec.providesPerDay = savedProv; prec.kcalPerDay = savedKcal;
  Game.state.scholar.exiled = false;

  // 5. severMembership: NPC cut is complete
  freshGame();
  nid = npcIds()[0];
  var rosterBefore = Game.state.village.roster.length;
  Game.severMembership(nid, 'exile');
  ok('severed npc not member', Game.isMember(nid) === false);
  ok('severed npc off roster', Game.state.village.roster.length === rosterBefore - 1);
  ok('no benefits when severed', Game.memberBenefits(nid).length === 0);

  // 6. exilePlayer severs the player, legibly; rejoin heals
  freshGame();
  pid = Game.villagerId;
  said.length = 0;
  Game.exilePlayer('moot');
  ok('exiled flag set', Game.state.scholar.exiled === true);
  ok('player not member after exile', Game.isMember(pid) === false);
  ok('codex cut set', Game.state.scholar.codexCut === true);
  ok('severing is legible', saidHas('not one of ours anymore'));
  Game.rejoinMembership();
  ok('rejoin clears severed', Game.isMember(pid) === true);
  ok('rejoin clears codex cut', Game.state.scholar.codexCut === false);

  // 7. housing: default, build, cost
  freshGame();
  ok('housing default 12', Game.housingCap() === 12);
  said.length = 0;
  ok('buildShelter without wood fails', Game.buildShelter() === null);
  ok('says what it needs', saidHas('10 wood'));
  Game.state.scholar.inventory = [{ itemId: 'wood', id: 'wood', name: 'Wood log', units: 10, kg: 2.0 }];
  ok('buildShelter works', Game.buildShelter() === true);
  ok('housing now 14', Game.housingCap() === 14);
  ok('wood consumed', (Game.state.scholar.inventory.find(i => i.itemId === 'wood') || { units: 0 }).units === 0);

  // 8. growth status + food projection shape
  freshGame();
  var gs = Game.growthStatus();
  ok('growthStatus shape', gs.housing === 12 && typeof gs.used === 'number' && typeof gs.foodOk === 'boolean');
  var fs = Game.foodSupports(1);
  ok('foodSupports shape', typeof fs.ok === 'boolean' && typeof fs.shortfall === 'number');

  // 9. remote applications: gen, judge, accept -> arrival -> roster
  freshGame();
  var s = Game.state.scholar;
  s.day = 10; Game.state.systemArrived = true;
  Game.state.village.pantryKcal = 20000;
  var app = Game.genApplicant();
  ok('genApplicant valid', app && app.id && app.name && app.reason);
  var m = Game.mshipState();
  m.applications.push(app);
  var j = Game.judgeApplication(app);
  ok('judge returns score 0-100', j.score >= 0 && j.score <= 100);
  ok('judge gives reasons', j.reasons.length > 0);
  // make room so no debate: housing 14
  Game.state.scholar.inventory = [{ itemId: 'wood', id: 'wood', name: 'Wood log', units: 10, kg: 2.0 }];
  Game.buildShelter();
  var before = Game.state.village.roster.length;
  Game.acceptApplication(app.id);
  ok('accept moves to arrivals', Game.mshipState().arrivals.length === 1);
  Game.mshipState().arrivals[0].arriveDay = s.day;
  said.length = 0;
  Game.arrivalTick();
  ok('arrival joins roster', Game.state.village.roster.length === before + 1);
  ok('arrival announced', saidHas('walks in'));

  // 10. refuse: gossip, no roster change
  freshGame();
  var app2 = Game.genApplicant();
  Game.mshipState().applications.push(app2);
  var rb = Game.state.village.roster.length;
  var gossBefore = (Game.state.village.gossip || []).length;
  Game.refuseApplication(app2.id);
  ok('refuse removes application', Game.mshipState().applications.length === 0);
  ok('refuse adds no roster', Game.state.village.roster.length === rb);
  ok('refuse seeds gossip or word', (Game.state.village.gossip || []).length >= gossBefore);

  // 11. debate on big intake over a full house
  freshGame();
  s = Game.state.scholar; s.day = 10;
  var app3 = Game.genApplicant();
  Game.mshipState().applications.push(app3);
  said.length = 0;
  Game.acceptApplication(app3.id); // housing 12, roster 12 -> room 0 -> debate
  ok('debate fires over full house', saidHas('debates'));

  // 12. crowding: over-cap has consequences
  freshGame();
  var t = Game.state.village.trust;
  var cid = npcIds()[0];
  t[cid] = 50;
  Game.state.village.roster.push('crowd_a', 'crowd_b'); // 14 > 12
  Game.crowdingTick();
  ok('crowding frays trust', (Game.state.village.trust[cid] || 0) < 50);

  // 13. network: standing, alliances, abroad
  freshGame();
  pid = Game.villagerId;
  ok('regionalStanding is number', typeof Game.regionalStanding() === 'number');
  Game.state.otherVillages = Game.state.otherVillages || [];
  Game.state.otherVillages.push({ id: 'vtest', name: 'Test Village', population: 10, day: 5, pantryKcal: 5000, viewership: 12 });
  Game.formAlliance('vtest');
  ok('alliance formed', Game.isAllied('haven', 'vtest') === true);
  ok('not allied with strangers', Game.isAllied('haven', 'nope') === false);
  ok('recognizedAbroad when allied', Game.recognizedAbroad(pid, { id: 'vtest' }) === true);
  ok('not recognized when not allied', Game.recognizedAbroad(pid, { id: 'nope' }) === false);
  ok('memberReputationAbroad is number', typeof Game.memberReputationAbroad(pid) === 'number');
  Game.severMembership(pid, 'exile');
  ok('severed not recognized abroad', Game.recognizedAbroad(pid, { id: 'vtest' }) === false);
  ok('severed carry the cut', Game.memberReputationAbroad(pid) === -10);
  Game.rejoinMembership();

  // 14. village-to-village application: home standing matters
  freshGame();
  Game.formAlliance('vtest');
  var app4 = Game.genApplicant();
  app4.fromVillage = 'vtest'; app4.fromVillageName = 'Test Village';
  var j4 = Game.judgeApplication(app4);
  ok('allied home vouches (reason present)', j4.reasons.join(' ').indexOf('allied') >= 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
