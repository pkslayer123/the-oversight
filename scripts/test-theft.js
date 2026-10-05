// Theft + intimidation tests. Usage: node scripts/test-theft.js
// Steve's rule: theft allowed, socially punished. Violence desperate.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
// stub Math.random: return values from queue, else 0.5
// (install only around the actions under test — worldgen needs real RNG)
const origRand = Math.random;
let randQ = [];
const stubbedRand = () => (randQ.length ? randQ.shift() : 0.5);
function stubRand() { Math.random = stubbedRand; }
function unStub() { Math.random = origRand; }

function setTemp(vid, t) {
  const vp = Game.data.villagers.find(x => x.id === vid) || (Game.data.background_survivors || []).find(x => x.id === vid);
  vp.personality = vp.personality || {}; vp.personality.temperament = t;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);
  const trust = (vid) => { const t = (Game.state.village.trust || {})[vid]; return t === undefined ? 10 : t; };

  // --- 1. packKcal: seeded, positive, reseeds per day ---
  const v1 = others()[0];
  const p1 = Game.packKcal(v1);
  ok('pack positive', p1 >= 200);
  eq('pack stable same day', Game.packKcal(v1), p1);

  // --- 2. stealFrom unseen: take the food, nobody knows yet ---
  setTemp(v1, 'steady');
  stubRand(); randQ = [0.9, 0.5]; // pack seed jitter done above; detection roll high => unseen; take amount
  const hunger0 = Game.npcNeeds(v1).hunger;
  const trust0 = trust(v1);
  const inv0 = Game.state.scholar.inventory.length;
  const r = Game.stealFrom(v1);
  eq('steal unseen', r, 'unseen');
  ok('pack reduced', Game.state.village.pack[v1].kcal < p1);
  ok('stolen rations in inventory', Game.state.scholar.inventory.some(i => i.stolen && (i.units || 0) > 0));
  ok('victim hungrier', Game.npcNeeds(v1).hunger > hunger0);
  ok('no trust hit yet', trust(v1) === trust0);
  ok('theft pending', !!(Game.state.village.packTheft || {})[v1]);

  // --- 3. victim notices at next part: suspicion, crime, gossip ---
  const crimes0 = Game.justiceState().crimes.length;
  Game.dayPart = 0;
  Game.state.village.packTheft[v1].part = -1; // force "earlier"
  Game.theftNoticeSweep();
  eq('trust floored at 0 on notice', trust(v1), 0);
  ok('theft crime recorded', Game.justiceState().crimes.length > crimes0);
  ok('theft gossip seeded', (Game.state.village.gossip || []).some(g => g.action === 'theft'));

  // --- 4. stealFrom caught: no food, trust craters, crime ---
  const v2 = others()[1];
  setTemp(v2, 'cautious');
  randQ = [0.01]; // detection roll low => caught (0.35 + 0.20 = 0.55)
  const invBefore = Game.state.scholar.inventory.filter(i => i.stolen).reduce((t, i) => t + (i.units || 0), 0);
  const rc = Game.stealFrom(v2);
  eq('steal caught', rc, 'caught');
  const invAfter = Game.state.scholar.inventory.filter(i => i.stolen).reduce((t, i) => t + (i.units || 0), 0);
  eq('no food when caught', invAfter, invBefore);
  ok('trust cratered', trust(v2) === 0);
  ok('caught theft crime', Game.justiceState().crimes.some(c => c.type === 'theft' && c.victim === v2 && c.caught));

  // --- 5. justice heat: theft +15, intimidation +15 ---
  const heat0 = Game.justiceHeat();
  Game.recordCrime('theft', { victim: 'someone_else' });
  ok('theft heat +15', Game.justiceHeat() >= heat0 + 15);
  Game.recordCrime('intimidation', { victim: 'someone_else2' });
  ok('intimidation heat +15 more', Game.justiceHeat() >= heat0 + 30);
  // amends credit wears it down (unlike murder)
  Game.justiceState().amendsCredit = 15;
  ok('amends reduces heat', Game.justiceHeat() <= heat0 + 15);

  // --- 6. intimidate cautious => yields, terrified ---
  const v3 = others()[2];
  setTemp(v3, 'cautious');
  randQ = [0.5];
  const fear0 = (Game.npcNeeds(v3).fear || 0);
  Game.state.village.trust[v3] = 60;
  const ri = Game.intimidate(v3);
  eq('cautious yields', ri, 'yielded');
  ok('fear +40', (Game.npcNeeds(v3).fear || 0) >= fear0 + 35);
  ok('trust -40 plus rep bite', trust(v3) <= 20 && trust(v3) < 20 - 0); // bump -40, observe dims compound
  ok('intimidation crime', Game.justiceState().crimes.some(c => c.type === 'intimidation' && c.victim === v3));
  ok('yielded food', Game.state.scholar.inventory.some(i => i.stolen && (i.units || 0) > 0));

  // --- 7. intimidate steady => flat refusal ---
  const v4 = others()[3];
  setTemp(v4, 'steady');
  Game.state.village.trust[v4] = 60;
  const trust4 = trust(v4);
  const rr = Game.intimidate(v4);
  eq('steady refuses', rr, 'refused');
  ok('trust -20 plus rep bite', trust(v4) <= trust4 - 20);

  // --- 8. intimidate bold => pushes back, may swing ---
  const v5 = others()[4];
  setTemp(v5, 'bold');
  Game.npcNeeds(v5).fear = 50; // not desperate => refuses, doesn't swing
  Game.state.village.trust[v5] = 60;
  randQ = [0.5, 0.5]; // demand roll, swing roll (0.5 => no swing)
  const trust5 = trust(v5);
  const rb = Game.intimidate(v5);
  eq('bold refuses', rb, 'refused');
  ok('trust -25 plus rep bite', trust(v5) <= trust5 - 25);
  // desperate bold swings: stub npcBetrays
  let swung = false;
  const origBetray = Game.npcBetrays;
  Game.npcBetrays = () => { swung = true; };
  Game.npcNeeds(v5).fear = 10;
  randQ = [0.5, 0.1]; // demand roll, swing roll < 0.4 => swing
  const rf = Game.intimidate(v5);
  eq('desperate bold swings', rf, 'fight');
  ok('npcBetrays called', swung);
  Game.npcBetrays = origBetray;
  unStub();

  // --- 9. guards: can't steal from self / non-roster / empty pack ---
  eq('no self steal', Game.stealFrom(Game.villagerId), false);
  eq('no stranger steal', Game.stealFrom('nobody_here'), false);
  Game.state.village.pack[v1].kcal = 0; Game.state.village.pack[v1].day = Game.state.scholar.day;
  eq('no empty steal', Game.stealFrom(v1), false);

  // --- 10. crime dedupe: same victim same part ---
  const c0 = Game.justiceState().crimes.filter(c => c.type === 'theft').length;
  Game.recordCrime('theft', { victim: 'dupe_v' });
  Game.recordCrime('theft', { victim: 'dupe_v' });
  eq('theft dedupe', Game.justiceState().crimes.filter(c => c.type === 'theft').length, c0 + 1);

  unStub();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { Math.random = origRand; console.error('ERR', e); process.exit(1); });
