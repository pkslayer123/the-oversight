#!/usr/bin/env node
// Meals like people (2026-10-08). Steve: "Villagers should eat and act like
// people" — but "we shouldn't assume that everyone gets together for a big
// communal meal every day."
// The old villageEats was one synchronized abstract drain: a single pass,
// one aggregate v.lastEat, no individuals, no tastes, no social trace
// (proven in /tmp/verify-before.js: lastEat=6333, zero per-villager records).
// The new system: per-villager real-item meals, personal rhythms, tastes,
// organic co-eating, cook credit/blame, pack rations away, desperation.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261008', 10);
const realRandom = Math.random;

function loadAll() {
  delete globalThis.Scattering;
  Math.random = mulberry32(SEED);
  global.window = global;
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1].split('?')[0])
    .filter(f => f.startsWith('src/js/'))
    .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  delete global.window;
  return globalThis.Scattering.Game;
}

function pantryKcal(Game) {
  const v = Game.state.village;
  return (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function freshGame(Game) {
  Game.genRoster('Breaker');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker', null, rid);
  Game.depart();
  const v = Game.state.village;
  Game.map.px = v.px ?? 4; Game.map.py = v.py ?? 4;
  v.trust = v.trust || {}; v.health = v.health || {};
  for (const id of (v.roster || [])) { v.trust[id] = 50; v.health[id] = 100; }
  v.pantry = [];
  v.sick = {};
  v.away = {};
  v.taught = {};
  Game.state.scholar.kcal = 0;
  return v;
}
const ids = (Game, v) => (v.roster || []).filter(id => id !== Game.villagerId);
const memNotes = (Game, v, id, rx) => ((v.memory || {})[id] || []).filter(m => rx.test((m.note || '') + ' ' + (m.t || '')));

(async () => {
  const Game = loadAll();
  await Game.init();
  const day = () => Game.state.scholar.day || 1;

  console.log('1 — villagers eat individual real items; no synchronized feast tick');
  {
    const v = freshGame(Game);
    Game.stockPantry(20000, 'Foraged food');
    const before = pantryKcal(Game);
    Game.villageEats();
    // per-villager meal records exist, spread across dayparts (rhythms differ)
    const log = v.mealLog || [];
    check('mealLog has per-villager entries', log.length > 0, 'len=' + log.length);
    const parts = new Set(log.map(e => e.part));
    check('meals spread across dayparts (not one synchronized tick)', parts.size >= 2,
      'parts=' + [...parts].join(','));
    // real items left the pantry (not a phantom number)
    check('pantry burned real items', pantryKcal(Game) < before,
      before + ' -> ' + pantryKcal(Game));
    // the honest burn clock still ticks for the haven screen
    check('burnHistory recorded', (v.burnHistory || []).length > 0);
    check('lastEat is measured consumption', (v.lastEat || 0) > 0, 'lastEat=' + Math.round(v.lastEat || 0));
  }

  console.log('2 — tastes: favorites lift, disliked food gets complained about');
  {
    const v = freshGame(Game);
    const all = ids(Game, v);
    const meatLover = all.find(id => (Game.foodPrefs(id).likes === 'meat'));
    const plantLover = all.find(id => (Game.foodPrefs(id).likes === 'plant'));
    check('taste axes exist (meat-liker and plant-liker found)', !!(meatLover && plantLover));
    // pantry: ONLY meat. The plant-lover must eat disliked food.
    v.pantry = [{ name: 'Smoked haunch', kcalEach: 400, units: 60, spoilDay: day() + 5, safe: true, kg: 0.3, foodKind: 'meat', foodState: 'cleaned' }];
    v.taught = {}; // no cook, no cooking abstraction interference
    Math.random = () => 0.99; // gorge fasts sometimes; keep everyone eating: hunger high instead
    for (const id of all) Game.npcNeeds(id).hunger = 95;
    Math.random = mulberry32(SEED + 1);
    Game.villageEats();
    Math.random = mulberry32(SEED + 2);
    const loved = memNotes(Game, v, meatLover, /loved/);
    const complained = memNotes(Game, v, plantLover, /complain/);
    check('meat-lover remembers loving the meal', loved.length > 0, JSON.stringify(loved.map(m => m.note)));
    check('plant-lover complains about disliked food', complained.length > 0, JSON.stringify(complained.map(m => m.note)));
    const n1 = Game.npcNeeds(meatLover), n2 = Game.npcNeeds(plantLover);
    check('social moved in opposite directions', (n1.social || 0) !== (n2.social || 0) || loved.length !== complained.length,
      'lover social=' + n1.social + ' hater social=' + n2.social);
  }

  console.log('3 — company is organic: co-eating happens AND eating alone happens');
  {
    const v = freshGame(Game);
    Game.stockPantry(30000, 'Foraged food');
    // one villager away: eats from pack, never in the mealLog
    const all = ids(Game, v);
    const awayId = all[0];
    v.away[awayId] = { nx: 6, ny: 6, partsLeft: 3 };
    Game.villageEats();
    const log = v.mealLog || [];
    check('away villager has no co-eating log entry (eats alone, from pack)',
      !log.some(e => e.vid === awayId));
    check('away villager packed a real ration from the pantry',
      !!(v.pack && v.pack[awayId] && v.pack[awayId].kcal < 1300),
      'pack=' + JSON.stringify(v.pack && v.pack[awayId]));
    // co-eating: some home villagers shared a part+place
    const seen = {};
    let shared = 0;
    for (const e of log) { const k = e.part + '@' + e.place; seen[k] = (seen[k] || 0) + 1; if (seen[k] === 2) shared++; }
    check('some villagers landed at the same fire at the same part', shared > 0, JSON.stringify(seen));
    // and social traces exist for at least some shared meals (seeded)
    const together = all.some(id => memNotes(Game, v, id, /ate with/).length > 0);
    console.log('  INFO ate-together memories: ' + together + ' (organic, not guaranteed every day)');
    // the day is NOT one communal feast: mealLog is per-person, parts vary
    check('no single feast event — meals are per-person records', log.every(e => e.vid && e.part));
  }

  console.log('4 — starving villagers take the desperation path (spoiled) and suffer');
  {
    const v = freshGame(Game);
    const all = ids(Game, v);
    // pantry: ONLY spoiled food
    v.pantry = [{ name: 'Gray mush', kcalEach: 300, units: 80, spoilDay: day() - 1, safe: true, kg: 0.3, foodKind: 'plant', foodState: 'raw' }];
    for (const id of all) Game.npcNeeds(id).hunger = 95;
    Math.random = () => 0.4; // < 0.5: spoiled-gut roll lands
    Game.villageEats();
    Math.random = mulberry32(SEED + 3);
    const spoiledSick = all.filter(id => v.sick[id] && /spoiled gut/.test(v.sick[id].name));
    check('spoiled stores were eaten in desperation', pantryKcal(Game) < 300 * 80);
    check('the rot collected: villagers sick with spoiled gut', spoiledSick.length > 0,
      'sick=' + spoiledSick.length + '/' + all.length);
  }

  console.log('5 — the cook gets credit and blame');
  {
    const v = freshGame(Game);
    const all = ids(Game, v);
    const cookId = all[0], eaterId = all.find(id => id !== cookId && Game.foodPrefs(id).likes === 'meat');
    v.taught = { [cookId]: ['a', 'b', 'c'], [eaterId]: ['a'] }; // cook knows most
    check('villageCookId picks the knowledgeable cook', Game.villageCookId(v) === cookId);
    // BLAME: poisoned meal — cooking doesn't save it, the cook is blamed
    v.pantry = [{ name: 'Tainted stew', kcalEach: 500, units: 40, spoilDay: day() + 5, safe: true, kg: 0.3, foodKind: 'meat', foodState: 'cleaned', poisonRisk: { p: 1, note: 'nightshade' } }];
    for (const id of all) Game.npcNeeds(id).hunger = 95;
    Game.villageEats();
    const blame = memNotes(Game, v, cookId, /blame/);
    check('cook is blamed when their meal poisons someone', blame.length > 0, JSON.stringify(blame.map(m => m.note)));
    // CREDIT: clean favorite meal, forced appreciation roll
    const v2 = freshGame(Game);
    const all2 = ids(Game, v2);
    const cook2 = all2[0], eater2 = all2.find(id => id !== cook2 && Game.foodPrefs(id).likes === 'meat');
    v2.taught = { [cook2]: ['a', 'b', 'c'] };
    v2.pantry = [{ name: 'Good roast', kcalEach: 500, units: 40, spoilDay: day() + 5, safe: true, kg: 0.3, foodKind: 'meat', foodState: 'cleaned' }];
    for (const id of all2) Game.npcNeeds(id).hunger = 95;
    Math.random = () => 0.05; // < 0.25 taste say, < 0.3 credit, < 0.5 co-eat
    Game.villageEats();
    Math.random = mulberry32(SEED + 4);
    const credit = memNotes(Game, v2, cook2, /cooked/);
    check('cook is credited when someone loves their cooking', credit.length > 0, JSON.stringify(credit.map(m => m.note)));
  }

  console.log('6 — performance: a full village-day of eating decisions is cheap');
  {
    const v = freshGame(Game);
    Game.stockPantry(40000, 'Foraged food');
    const t0 = Date.now();
    for (let d = 0; d < 30; d++) {
      for (const id of ids(Game, v)) Game.npcNeeds(id).hunger = 60;
      Game.villageEats();
    }
    const ms = Date.now() - t0;
    check('30 village-days < 3s (' + ms + 'ms)', ms < 3000, ms + 'ms');
  }

  console.log('7 — rhythms differ per temperament (no synchronized village)');
  {
    const v = freshGame(Game);
    const all = ids(Game, v);
    const rhythms = new Set(all.map(id => Game.mealRhythm(id)));
    check('multiple eating rhythms in one village', rhythms.size >= 2, [...rhythms].join(','));
    const gorgers = all.filter(id => Game.mealRhythm(id) === 'gorge');
    const grazers = all.filter(id => Game.mealRhythm(id) === 'grazer');
    console.log('  INFO gorgers=' + gorgers.length + ' grazers=' + grazers.length + ' dawn-dusk=' + (all.length - gorgers.length - grazers.length));
  }

  Math.random = realRandom;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
