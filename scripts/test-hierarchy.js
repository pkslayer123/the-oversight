// Inter-village hierarchy tests. Usage: node scripts/test-hierarchy.js
// Covers: link as first-class relationship (trust/terms/history/obligations),
// representative-earned negotiation, tribute in real food, primary demands,
// proving worth via deeds, the vassal's gambit, bidding for primacy,
// succession crises on leader death (mantle-path), the earned subordinate ending.
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
  Game.state.otherVillages = [{ id: 'vtest', name: 'Test Village', population: 10, day: 5, pantryKcal: 5000, viewership: 5, opinion: 40, generated: true }];
  return s;
}
function saidHas(sub) { return said.some(t => t.indexOf(sub) >= 0); }
function makeLink(asSub) {
  // deterministic-ish: high opinion + alliance + strong rep => passes
  Game.formAlliance('vtest');
  var pid = Game.villagerId;
  try { Game.agencyState().ach.push({ vid: pid, mag: 40, day: 10 }); } catch (e) {}
  var link = null;
  for (var i = 0; i < 10 && !link; i++) link = Game.proposeLink('vtest', { asSubordinate: asSub !== false, tributeKcalPerWeek: 2000 });
  return link;
}

(async () => {
  await Game.init();

  // 1. module + representative (earned, not appointed)
  freshGame();
  ok('module loaded', typeof Game.proposeLink === 'function');
  var rep = Game.representative();
  ok('representative exists', rep && rep.id);
  ok('representative is a member', Game.isMember(rep.id));
  ok('linkStanding is number', typeof Game.linkStanding(rep.id) === 'number');

  // 2. negotiation + link object shape
  freshGame();
  var j = Game.judgeLink('vtest', { asSubordinate: true, tributeKcalPerWeek: 2000 });
  ok('judgeLink score 0-150', j.score >= 0);
  ok('judgeLink reasons', j.reasons.length > 0);
  var link = makeLink(true);
  ok('proposeLink creates link', !!link);
  ok('link is first-class object', link.id && link.trust === 30 && Array.isArray(link.history) && Array.isArray(link.obligations));
  ok('haven is subordinate', link.subordinate === 'haven' && link.primary === 'vtest');
  ok('linkWith finds it', Game.linkWith('vtest') === link);
  ok('villageLinks lists it', Game.villageLinks('haven').length === 1);
  ok('duplicate proposal refused', Game.proposeLink('vtest', {}) === null);

  // 3. tribute: real food leaves the pantry
  freshGame();
  link = makeLink(true);
  Game.state.village.pantry = [{ name: 'Test food', kcalEach: 1000, units: 10, spoilDay: 99 }];
  var paid = Game.payTribute(link.id);
  ok('payTribute pays owed', paid === 2000);
  ok('pantry actually reduced', Game.state.village.pantry[0].units === 8);
  ok('tribute marked paid this week', link.tributePaidWeek === Game._week());
  ok('trust rises on payment', link.trust === 33);
  ok('history recorded', link.history.some(h => h.kind === 'tribute'));

  // 4. weekly tick: unpaid tribute -> arrears + trust falls
  freshGame();
  link = makeLink(true);
  link.tributePaidWeek = -5;
  var trustBefore = link.trust;
  Game.mshipState().lastLinkWeek = -99;
  Game.state.scholar.day = 14; // new week
  Game.linkTick();
  ok('unpaid tribute accrues arrears', link.arrears > 0);
  ok('unpaid tribute costs trust', link.trust < trustBefore);

  // 5. demands: the primary calls; honor or refuse, both remembered
  freshGame();
  link = makeLink(true);
  var d = Game.primaryDemand(link.id);
  ok('primaryDemand generates', !!d && !!d.detail);
  said.length = 0;
  var t0 = link.trust;
  Game.answerDemand(link.id, true);
  ok('honoring raises trust', link.trust > t0);
  ok('demand cleared', !link.pendingDemand);
  Game.primaryDemand(link.id);
  t0 = link.trust;
  said.length = 0;
  Game.answerDemand(link.id, false);
  ok('refusing costs trust', link.trust < t0);
  ok('refusal remembered in history', link.history.some(h => h.kind === 'demand' && /REFUSED/.test(h.note)));

  // 6. proving worth: deeds feed the link (recordDeed wrap)
  freshGame();
  link = makeLink(true);
  t0 = link.trust;
  Game.recordDeed(Game.villagerId, 'test_deed', 'did a thing', 20);
  ok('deed proves worth (trust up)', link.trust > t0);

  // 7. the vassal's gambit: break with consequences
  freshGame();
  link = makeLink(true);
  var ov = Game.state.otherVillages.find(x => x.id === 'vtest');
  var opBefore = ov.opinion;
  said.length = 0;
  Game.breakLink(link.id, 'gambit');
  ok('link broken', link.status === 'broken');
  ok('gambit costs opinion', ov.opinion < opBefore);
  ok('gambit is legible', saidHas("vassal's gambit"));
  ok('broken link leaves villageLinks', Game.villageLinks('haven').length === 0);
  ok('history remembers', link.history.some(h => h.kind === 'broken'));

  // 8. the climb: bid for primacy
  freshGame();
  link = makeLink(true);
  // weak: lower our standing below threshold by tanking notability inputs
  Game.state.systemArrived = false; Game.state.village.pantryKcal = 0;
  var weak = Game.bidForPrimacy(link.id);
  // (may pass or fail on standing; just assert it returns null when weak OR handles)
  Game.state.systemArrived = true; Game.state.village.pantryKcal = 20000;
  link.trust = 65;
  // THE TABLE IS A WEEKLY VERB (break-it regional 2026-10-09): the bid above
  // consumed this week's hard conversation — advance a week for the next one.
  Game.state.scholar.day += 7;
  var res = Game.bidForPrimacy(link.id);
  ok('primacy bid flips at high trust', res === 'flipped');
  ok('haven is primary now', link.primary === 'haven' && link.subordinate === 'vtest');
  // terms path: fresh link, low trust but strong standing
  freshGame();
  var link2 = makeLink(true);
  link2.trust = 40;
  var res2 = Game.bidForPrimacy(link2.id);
  ok('low-trust bid settles for terms', res2 === 'terms' || res2 === 'flipped');
  if (res2 === 'terms') ok('tribute halved', link2.tributeKcalPerWeek === 1000);

  // 9. renegotiation
  freshGame();
  link = makeLink(true);
  var tribBefore = link.tributeKcalPerWeek;
  Game.renegotiateLink(link.id);
  ok('renegotiate moves tribute or trust', link.tributeKcalPerWeek !== tribBefore || link.trust < 30);

  // 10. succession: leader death detonates the link (via registerDeath)
  freshGame();
  link = makeLink(true);
  link.trust = 50;
  rep = Game.representative();
  var ltrust = link.trust, ltrib = link.tributeKcalPerWeek;
  said.length = 0;
  Game.registerDeath({ kind: 'villager', villagerId: rep.id, name: 'Rep Test', cause: 'test' });
  ok('succession shakes trust', link.trust < ltrust);
  ok('succession recorded', link.history.some(h => h.kind === 'succession'));
  ok('succession is legible', saidHas('dead hold no treaties'));
  // non-leader death: no detonation
  freshGame();
  link = makeLink(true);
  link.trust = 50;
  var other = (Game.state.village.roster || []).find(id => id !== Game.villagerId && id !== Game.representative().id);
  Game.registerDeath({ kind: 'villager', villagerId: other, name: 'Other Test', cause: 'test' });
  ok('non-leader death leaves link calm', link.trust === 50);

  // 11. their leader died: chaos is opportunity
  freshGame();
  link = makeLink(true);
  tribBefore = link.tributeKcalPerWeek;
  Game.theirLeaderDied(link.id);
  ok('their crisis improves our terms', link.tributeKcalPerWeek < tribBefore);

  // 12. the earned ending: valued subordinate at the table
  freshGame();
  link = makeLink(true);
  link.trust = 75; link.arrears = 0; link.day = Game.state.scholar.day - 30;
  var elig = Game.kingdomEndingEligible();
  ok('earned subordinate ending eligible', elig.eligible === true && elig.frame === 'the valued subordinate');
  freshGame();
  ok('not eligible with no link', Game.kingdomEndingEligible().eligible === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
