// Cache robbery leaves a trace: the robber is real, a suspicion doubt may be
// planted, and confronting it resolves honestly (confess/deflect/hostile).
// Steve's rule: theft allowed, socially punished.
// Usage: node scripts/test-cache-theft-suspicion.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

const origRand = Math.random;
let randQ = [];
const stubbedRand = () => (randQ.length ? randQ.shift() : 0.5);
function stubRand() { Math.random = stubbedRand; }
function unStub() { Math.random = origRand; }
function setTemp(vid, t) {
  const vp = Game.data.villagers.find(x => x.id === vid) || (Game.data.background_survivors || []).find(x => x.id === vid);
  vp.personality = vp.personality || {}; vp.personality.temperament = t;
}

const ME = () => Game.state.scholar.villagerId;
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.inventory = [];
}
function makeCache(label) {
  const caches = Game.playerCaches();
  const c = { id: 'ctest_' + Math.random().toString(36).slice(2, 7), node: { x: 3, y: 2 },
    desc: label + ' — buried at test grove, day 1', label, items: [{ name: 'x' }], found: false, day: 1 };
  caches.push(c);
  return c;
}
const doubts = () => (Game.state.codex.doubts || []);

(async () => {
  await Game.init();

  // ---------- 1. pickCacheRobber: a real villager, never the player ----------
  freshGame();
  ok('method exists', typeof Game.pickCacheRobber === 'function');
  const roster = Game.state.village.roster.filter(id => id !== ME());
  for (let i = 0; i < 20; i++) {
    const r = Game.pickCacheRobber();
    ok('robber is a villager (iter ' + i + ')', roster.includes(r));
    ok('robber is never the player (iter ' + i + ')', r !== ME());
  }

  // ---------- 2. robbery with trace: suspicion doubt on the TRUE robber ----------
  freshGame();
  const c1 = makeCache('2× Dried meat (800 kcal)');
  stubRand();
  randQ = [0.0, 0.1]; // robber pick -> first weighted; trace roll < 0.5 -> fires
  Game.resolveCacheRobbery(c1);
  unStub();
  ok('cache marked found', c1.found === true);
  ok('cache emptied', (c1.items || []).length === 0);
  ok('robber recorded', !!c1.robbedBy && c1.robbedBy !== ME());
  const d1 = doubts().find(d => d.theft && d.vid === c1.robbedBy);
  ok('suspicion doubt planted on the true robber', !!d1);
  ok('doubt is observation kind', d1 && d1.kind === 'observation');
  ok('doubt names a witness', d1 && d1.theft.witness && d1.theft.witness !== c1.robbedBy && d1.theft.witness !== ME());
  ok('doubt text mentions the witness', d1 && d1.text.indexOf(Game.displayName(d1.theft.witness)) >= 0);
  ok('doubt is unresolved', d1 && d1.resolved === false);
  const codexHit = (Game.state.codex.places || []).some(p => /Cache robbed/.test(p.text));
  ok('codex records the robbery', codexHit);

  // ---------- 3. robbery without trace: no doubt, robber still real ----------
  freshGame();
  const c2 = makeCache('1× Trail mix (400 kcal)');
  stubRand();
  randQ = [0.0, 0.9]; // trace roll >= 0.5 -> no suspicion
  Game.resolveCacheRobbery(c2);
  unStub();
  ok('no-trace: robber still recorded', !!c2.robbedBy);
  ok('no-trace: no doubt planted', !doubts().some(d => d.theft));

  // ---------- 4. confrontation: CONFESS ----------
  freshGame();
  const c3 = makeCache('3× Venison strips (750 kcal)');
  stubRand(); randQ = [0.0, 0.1]; Game.resolveCacheRobbery(c3); unStub();
  const d3 = doubts().find(d => d.theft);
  const robber = d3.vid;
  setTemp(robber, 'warm');
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[robber] = 80; // confessP = .30+.20+.25 = .75
  const trustBefore = Game.state.village.trust[robber];
  stubRand(); randQ = [0.1]; // roll < .75 -> confess (drawTruthLine pool pick falls back to 0.5)
  const r3 = Game.confrontDoubt(robber, d3.id);
  unStub();
  ok('confess: ok', r3.ok === true);
  ok('confess: outcome', r3.outcome === 'confessed');
  ok('confess: line admits it', /it was me|I took|I dug it up/i.test(r3.line));
  ok('confess: doubt resolved', doubts().find(d => d.id === d3.id).resolved === true);
  ok('confess: journal records admission', JSON.stringify(Game.state.codex).indexOf('Admitted: stole') >= 0);
  ok('confess: trust drops (social price)', (Game.state.village.trust[robber] || 0) < trustBefore);

  // ---------- 5. confrontation: DEFLECT (doubt stays open, evidence grows) ----------
  freshGame();
  const c4 = makeCache('1× Dried meat (400 kcal)');
  stubRand(); randQ = [0.0, 0.1]; Game.resolveCacheRobbery(c4); unStub();
  const d4 = doubts().find(d => d.theft);
  setTemp(d4.vid, 'prickly');
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[d4.vid] = 10; // confessP = .30-.10-.10 = .10
  Math.random = () => 0.2; // in [.10,.45) -> deflect (constant: npcLies may draw first)
  const evBefore = d4.evidence.length;
  const r4 = Game.confrontDoubt(d4.vid, d4.id);
  unStub();
  ok('deflect: outcome', r4.outcome === 'deflected');
  ok('deflect: doubt stays open', doubts().find(d => d.id === d4.id).resolved === false);
  ok('deflect: evidence grows', doubts().find(d => d.id === d4.id).evidence.length > evBefore);

  // ---------- 6. confrontation: HOSTILE ----------
  freshGame();
  const c5 = makeCache('2× Peanuts (340 kcal)');
  stubRand(); randQ = [0.0, 0.1]; Game.resolveCacheRobbery(c5); unStub();
  const d5 = doubts().find(d => d.theft);
  setTemp(d5.vid, 'prickly');
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[d5.vid] = 10; // confessP = .10; roll .9 >= .45 -> hostile
  Math.random = () => 0.9; // constant: npcLies may draw first
  const r5 = Game.confrontDoubt(d5.vid, d5.id);
  unStub();
  ok('hostile: outcome', r5.outcome === 'attacked');
  ok('hostile: doubt stays open', doubts().find(d => d.id === d5.id).resolved === false);
  ok('hostile: trust hit harder', (Game.state.village.trust[d5.vid] || 0) === 0); // -8 bumpTrust, -2 via applyRep

  // ---------- 7. theft suspicions never clear as "misunderstanding" ----------
  // (the guilty must not get the innocent's exit)
  freshGame();
  const c6 = makeCache('1× Rice (350 kcal)');
  stubRand(); randQ = [0.0, 0.1]; Game.resolveCacheRobbery(c6); unStub();
  const d6 = doubts().find(d => d.theft);
  setTemp(d6.vid, 'warm');
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[d6.vid] = 80;
  let sawCleared = false;
  for (let i = 0; i < 30 && !sawCleared; i++) {
    const r = Game.confrontDoubt(d6.vid, d6.id);
    if (r.outcome === 'cleared') sawCleared = true;
    if (r.outcome === 'confessed') break;
  }
  ok('theft suspicion never resolves as misunderstanding', !sawCleared);

  // ---------- 8. no-repeat: theftConfess pool dedupes per game ----------
  freshGame();
  const lines = new Set();
  for (let i = 0; i < 6; i++) {
    const vid = Game.state.village.roster.filter(id => id !== ME())[i % 5];
    lines.add(Game.drawTruthLine('theftConfess', vid, { first: 'X', what: 'food' }));
  }
  ok('theftConfess pool serves 6 distinct lines', lines.size === 6);

  unStub();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { Math.random = origRand; console.error('ERR', e); process.exit(1); });
