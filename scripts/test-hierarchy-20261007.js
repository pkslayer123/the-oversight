// Inter-village hierarchy DEEPENING tests (Steve 2026-10-07).
// Usage: node scripts/test-hierarchy-20261007.js
// Covers the new work on the hierarchy island: link dimensions (feud, water,
// exchange, marriage, spies), unique-person leaders (generation, evolution,
// succession strangers), knowledge-gated intel (scouts, exchange, spies,
// observed caravans), refusal escalation to ultimatums, tribute resentment,
// exponential coalition tax, day-engine beats (caravans, skirmishes, deaths).
// Deterministic: Math.random is seeded before any module eval.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(20261007);

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
globalThis.Scattering.Game.progState = function () {
  const s = this.state.scholar; s.prog = s.prog || {};
  s.prog.moments = s.prog || []; return s.prog;
};
globalThis.Scattering.Game.recordMoment = function () {};
globalThis.Scattering.Game.broadcastLine = function () {};
eval(fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8'));
// recordDeed stub BEFORE hierarchy.js so the proveWorth wrap applies
globalThis.Scattering.Game.recordDeed = function (vid, type, text, magnitude) { return { vid: vid, mag: magnitude }; };
eval(fs.readFileSync(path.join(ROOT, 'src/js/hierarchy.js'), 'utf8'));
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
  s.day = 10; s.kcal = 3000; s.health = 100; s.exiled = false;
  Game.state.systemArrived = true;
  Game.state.village.pantryKcal = 20000;
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.severed = {};
  Game.state.otherVillages = [
    { id: 'vtest', name: 'Test Village', population: 10, day: 5, pantryKcal: 5000, viewership: 5, opinion: 40 },
    { id: 'vother', name: 'Other Village', population: 9, day: 5, pantryKcal: 6000, viewership: 5, opinion: 40 },
  ];
  return s;
}
function saidHas(sub) { return said.some(t => t.indexOf(sub) >= 0); }
function makeLinkTo(tid, asSub) {
  Game.formAlliance(tid);
  var pid = Game.villagerId;
  try { Game.agencyState().ach.push({ vid: pid, mag: 40, day: 10 }); } catch (e) {}
  var link = null;
  for (var i = 0; i < 10 && !link; i++) link = Game.proposeLink(tid, { asSubordinate: asSub !== false, tributeKcalPerWeek: 2000 });
  return link;
}
function ovOf(id) { return Game.state.otherVillages.find(x => x.id === id); }

(async () => {
  await Game.init();

  // A. link dimensions initialize on new links
  freshGame();
  var link = makeLinkTo('vtest', true);
  ok('A link created', !!link);
  ok('A dims: feud', link.dims && typeof link.dims.feud === 'number');
  ok('A dims: water starts none', link.dims && link.dims.water === 'none');
  ok('A dims: exchange', link.dims && typeof link.dims.exchange === 'number');
  ok('A dims: marriage starts 0', link.dims && link.dims.marriage === 0);
  ok('A refusals start at 0', link.refusals === 0);

  // B. leaders are unique people: generated, evolving, never a fixed cast
  freshGame();
  makeLinkTo('vtest', true);
  var ov = ovOf('vtest');
  ok('B leader generated', !!(ov.leader && ov.leader.name));
  ok('B leader has temperament', typeof ov.leader.temperament === 'string');
  ok('B leader has goals', typeof ov.leader.goals === 'string');
  var lo = Game.leaderOf('vtest');
  ok('B leader known after negotiation', lo.known === true && lo.name === ov.leader.name);
  var mood0 = ov.leader.mood;
  Game._evolveLeader('vtest', 'refused'); Game._evolveLeader('vtest', 'refused'); Game._evolveLeader('vtest', 'refused');
  var moods = ['pleased', 'content', 'wary', 'cold', 'hostile'];
  ok('B events change the leader', moods.indexOf(ov.leader.mood) > moods.indexOf(mood0));

  // C. water-rights: negotiate toward formalized; failure contests
  freshGame();
  link = makeLinkTo('vtest', true);
  link.trust = 80; link.dims.exchange = 50;
  ok('C water shared', Game.negotiateWater(link.id) === 'shared');
  ok('C waterRights reads', Game.waterRights('vtest') === 'shared');
  link.trust = 70; link.dims.exchange = 80;
  ok('C water formalized', Game.negotiateWater(link.id) === 'formalized');
  ok('C formalized water lightens tribute', Game._tributeOwed(link) === 1800);
  freshGame();
  var link2 = makeLinkTo('vtest', true);
  link2.trust = 10;
  var f0 = link2.dims.feud;
  ok('C failed talks contest the water', Game.negotiateWater(link2.id) === 'contested');
  ok('C contested water breeds feud', link2.dims.feud > f0);

  // D. marriage bonds: form, dampen feud rises, cap
  freshGame();
  link = makeLinkTo('vtest', true);
  link.trust = 80; link.dims.exchange = 60;
  var bonds = 0;
  for (var i = 0; i < 8 && bonds < 1; i++) { var mr = Game.arrangeMarriage(link.id); if (mr) bonds = mr; }
  ok('D marriage bond forms', bonds >= 1);
  link.dims.feud = 50; link.dims.marriage = 2;
  Game._feudChange(link, 20);
  ok('D marriages dampen feud rises', link.dims.feud === 64);
  link.dims.marriage = 4;
  ok('D marriage cap holds', Game.arrangeMarriage(link.id) === 4);

  // E. spy network: grows, gets caught
  freshGame();
  makeLinkTo('vtest', true);
  for (var pi = 0; pi < 5; pi++) Game.plantSpy('vtest');
  ok('E spy network grows', (Game._intelState()['vtest'] || {}).spies === 50);
  link = Game.linkWith('vtest');
  var ef0 = link.dims.feud;
  var found = false;
  for (var pj = 0; pj < 60 && !found; pj++) { var pr = Game.plantSpy('vtest'); if (pr.discovered) found = true; }
  ok('E spies get caught sometimes', found === true);
  ok('E discovery spikes feud', link.dims.feud > ef0);

  // F. knowledge gating: no free intel; scouts teach
  freshGame();
  var vi0 = Game.villageIntel('vother');
  ok('F no free intel', vi0.strength === 'unknown');
  ok('F leader unknown before contact', Game.leaderOf('vother').known === false);
  ok('F scout dispatched', Game.scoutIntel('vother') === true);
  ok('F one scout at a time', Game.scoutIntel('vtest') === null);
  Game.state.scholar.day += 1;
  Game.hierarchyDaily();
  var vi1 = Game.villageIntel('vother');
  ok('F scout reveals strength', ['weaker', 'even', 'stronger'].indexOf(vi1.strength) >= 0);
  ok('F scout learns the speaker name', Game.leaderOf('vother').known === true);
  ok('F temperament still hidden', Game.leaderOf('vother').temperament === 'unknown');
  ok('F scout beat is legible', saidHas('scout returns'));
  ok('F source tracked', vi1.sources.indexOf('scout') >= 0);

  // G. escalation: two refusals -> ultimatum; refused ultimatum can end the link
  freshGame();
  link = makeLinkTo('vtest', true);
  var d = null;
  for (var di = 0; di < 8 && !d; di++) d = Game.primaryDemand(link.id);
  ok('G demand generated', !!d);
  var gf0 = link.dims.feud;
  Game.answerDemand(link.id, false);
  ok('G refusal 1 counted', link.refusals === 1);
  ok('G refusal spikes feud', link.dims.feud > gf0);
  ok('G refusal remembered', link.history.some(h => /REFUSED/.test(h.note)));
  var d2 = null;
  for (var dj = 0; dj < 8 && !d2; dj++) d2 = Game.primaryDemand(link.id);
  Game.answerDemand(link.id, false);
  ok('G second refusal escalates', !!(link.pendingDemand && link.pendingDemand.kind === 'ultimatum'));
  ok('G ultimatum announced', saidHas('ULTIMATUM'));
  Game.state.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 30, spoilDay: 99 }];
  var gt0 = link.trust;
  Game.answerDemand(link.id, true);
  ok('G ultimatum swallowed', link.refusals === 0 && link.arrears === 0);
  ok('G trust recovers a little', link.trust > gt0);
  link.trust = 20;
  var u = Game.escalate(link.id);
  ok('G escalate creates ultimatum', !!(u && u.kind === 'ultimatum'));
  Game.answerDemand(link.id, false);
  ok('G refused ultimatum breaks the link', link.status === 'broken');

  // H. coalition tax: feeding a coalition gets exponentially harder
  freshGame();
  var l1 = makeLinkTo('vtest', true);
  ok('H single link tax is 1', Game.coalitionTax() === 1);
  makeLinkTo('vother', true);
  ok('H two links tax 1.25', Game.coalitionTax() === 1.25);
  ok('H tribute owed scales', Game._tributeOwed(l1) === 2500);

  // I. tribute resentment: the village can refuse to feed its own leash
  freshGame();
  link = makeLinkTo('vtest', true);
  Game.state.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 30, spoilDay: 99 }];
  for (var ti = 0; ti < 9; ti++) Game.payTribute(link.id);
  ok('I resentment meter climbs', Game.tributeResentment() >= 100);
  Game.hierarchyDaily();
  ok('I resentment boils over into refusal', Game.mshipState().tributeRefused === true);
  ok('I refusal is legible', saidHas('folds its arms'));
  ok('I village refuses payment', Game.payTribute(link.id) === null);
  Game.mshipState().tributeResentment = 50;
  Game.mshipState().lastLinkWeek = -99;
  Game.state.scholar.day += 7;
  Game.linkTick();
  ok('I refusal lifts when cool', Game.mshipState().tributeRefused === false);

  // J. rival leader death: stranger takes the table, mirror shakes the link
  freshGame();
  link = makeLinkTo('vtest', true);
  ov = ovOf('vtest');
  var oldName = ov.leader.name;
  var newL = Game.rivalLeaderDied('vtest');
  ok('J new stranger takes the table', !!(newL && newL.name !== oldName));
  ok('J new leader unknown to Haven', ov.leaderMet === false);
  ok('J death is legible', saidHas('is dead'));
  ok('J mirror renegotiated in chaos', link.tributeKcalPerWeek === 1500);
  ok('J succession recorded', link.history.some(h => h.kind === 'succession'));
  ok('J intel reset for stranger', (Game._intelState()['vtest'] || {}).temperKnown === false);

  // K. tribute caravans arrive: real food, day-engine-visible
  freshGame();
  link = makeLinkTo('vtest', false); // haven is primary
  link.trust = 100;
  Game.mshipState().lastLinkWeek = -99;
  Game.state.scholar.day += 1;
  Game.linkTick();
  ok('K subordinate tribute is real food', (Game.state.village.pantry || []).some(it => /Tribute from/.test(it.name)));
  var caravanSeen = false;
  for (var ki = 0; ki < 10 && !caravanSeen; ki++) {
    Game.state.scholar.day += 1;
    Game.hierarchyDaily();
    if (saidHas('tribute caravan')) caravanSeen = true;
  }
  ok('K caravan beat is day-engine-visible', caravanSeen);

  // L. feud boils over: border skirmish
  freshGame();
  link = makeLinkTo('vtest', true);
  link.dims.feud = 80; link.trust = 60;
  var skirmished = false;
  for (var li = 0; li < 12 && !skirmished; li++) {
    Game.mshipState().lastLinkWeek = -99;
    Game.linkTick();
    if (saidHas('scuffle')) skirmished = true;
  }
  ok('L skirmish fires at high feud', skirmished);
  ok('L skirmish burns trust', link.trust < 60);
  ok('L skirmish vents feud', link.dims.feud < 80);

  // M. exchange teaches: intentions readable at 40
  freshGame();
  link = makeLinkTo('vtest', true);
  link.dims.exchange = 38; link.trust = 60;
  link.tributePaidWeek = Game._week();
  Game.mshipState().lastLinkWeek = -99;
  Game.linkTick();
  ok('M exchange crosses 40', link.dims.exchange >= 40);
  ok('M intentions readable via exchange', Game.villageIntel('vtest').intentions !== 'unknown');
  ok('M temperament readable via exchange', (Game._intelState()['vtest'] || {}).temperKnown === true);

  // N. bidding blind: allowed, honest, billed
  freshGame();
  link = makeLinkTo('vtest', true);
  link.trust = 65;
  var res = Game.bidForPrimacy(link.id);
  ok('N blind bid can flip', res === 'flipped');
  ok('N blindness is honest', saidHas('bids blind'));
  ok('N blindness is billed', link.trust === 45);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
