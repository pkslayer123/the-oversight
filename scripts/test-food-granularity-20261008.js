#!/usr/bin/env node
// Food granularity + villager food-poisoning proofs (2026-10-08).
// Steve's direction: "When in doubt, a source should drop more granular
// pieces vs one master slab of meat." No fractionating items at eat time.
// BUG 1: stockPantry emitted one indivisible slab ({kcalEach: K, units: 1});
//   villageMeal ate it whole for a 2000-kcal need.
// BUG 2: villagers had no food-poisoning path — raw meat, unsafe food,
//   poison, spoiled food, monster-meat weirdness all skipped them.
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
  Game.state.scholar.kcal = 0;
  return v;
}

(async () => {
  const Game = loadAll();
  await Game.init();
  const day = () => Game.state.scholar.day || 1;

  console.log('BUG 1a — stockPantry drops granular pieces, not one slab');
  {
    const v = freshGame(Game);
    Game.stockPantry(3000, 'Weregild');
    const maxPiece = Math.max(...v.pantry.map(i => i.kcalEach || 0));
    check('no piece over 600 kcal', maxPiece <= 600, 'maxPiece=' + maxPiece);
    check('total conserved (3000)', pantryKcal(Game) === 3000, 'got ' + pantryKcal(Game));
    check('more than one piece (units across stacks)', v.pantry.reduce((t, i) => t + (i.units || 1), 0) > 1,
      v.pantry.map(i => i.units + 'x' + i.kcalEach).join(', '));
  }

  console.log('BUG 1b — villageMeal best-fit: small pieces first, slab last');
  {
    const v = freshGame(Game);
    v.pantry = [
      // slab is MORE perishable — the old perishable-first loop eats it whole
      { name: 'Great slab (legacy)', kcalEach: 3000, units: 1, spoilDay: day() + 1, safe: true, kg: 1 },
      { name: 'Smoked strips', kcalEach: 400, units: 6, spoilDay: day() + 3, safe: true, kg: 0.2 },
    ];
    v.trust[Game.villagerId] = 50; // full 2000 share
    Game.state.scholar.kcal = 0;
    Game.villageMeal();
    const slab = v.pantry.find(i => i.name.startsWith('Great slab'));
    check('legacy slab NOT eaten when small pieces cover the need', !!slab && slab.units === 1,
      slab ? 'slab units=' + slab.units : 'slab gone');
    check('meal taken ~2000 from small pieces', Math.abs(Game.state.scholar.kcal - 2000) <= 400,
      'scholar.kcal=' + Math.round(Game.state.scholar.kcal));
  }
  {
    // last resort: only the slab exists — the village still eats (no starvation absurdity)
    const v = freshGame(Game);
    v.pantry = [{ name: 'Great slab (legacy)', kcalEach: 3000, units: 1, spoilDay: day() + 9, safe: true, kg: 1 }];
    v.trust[Game.villagerId] = 50;
    Game.state.scholar.kcal = 0;
    Game.villageMeal();
    check('slab eaten as last resort (fed beats waste)', Game.state.scholar.kcal > 2000,
      'scholar.kcal=' + Math.round(Game.state.scholar.kcal));
  }

  console.log('BUG 2a — villagers eating raw meat roll disease');
  {
    const v = freshGame(Game);
    // everyone forages nothing: the whole village eats from the pot
    for (const id of v.roster) {
      if (id === Game.villagerId) continue;
      const p = Game.getPerson(id); if (p) p.providesPerDay = 0;
    }
    v.pantry = [{
      name: 'Deer (cleaned)', kcalEach: 300, units: 60, spoilDay: day() + 5,
      safe: true, foodKind: 'meat', foodState: 'cleaned',
      diseaseRisk: { p: 1, dmg: 12, note: 'raw meat' }, // forced: always fires
    }];
    const before = Object.keys(v.sick).length;
    Game.villageEats();
    const sickNow = Object.keys(v.sick).filter(id => id !== Game.villagerId);
    check('raw meat sickens villagers', sickNow.length > before,
      'sick=' + sickNow.length);
    const names = sickNow.map(id => (v.sick[id] || {}).name).join(',');
    check('sickness is food poisoning', /poison|raw|gut|belly/i.test(names), names);
  }

  console.log('BUG 2b — clean cooked meals do NOT sicken');
  {
    const v = freshGame(Game);
    for (const id of v.roster) {
      if (id === Game.villagerId) continue;
      const p = Game.getPerson(id); if (p) p.providesPerDay = 0;
    }
    v.pantry = [{
      name: 'Deer (cooked)', kcalEach: 350, units: 60, spoilDay: day() + 5,
      safe: true, foodKind: 'meat', foodState: 'cooked',
    }];
    Game.villageEats();
    const foodSick = Object.keys(v.sick).filter(id => {
      const n = ((v.sick[id] || {}).name || '').toLowerCase();
      return /poison|raw|gut|belly|spoiled/i.test(n);
    });
    check('clean cooked meal sickens nobody', foodSick.length === 0, 'foodSick=' + foodSick.length);
  }

  console.log('BUG 2c — spoiled food: skipped when fed, eaten (and sickening) when starving');
  {
    const v = freshGame(Game);
    for (const id of v.roster) {
      if (id === Game.villagerId) continue;
      const p = Game.getPerson(id); if (p) p.providesPerDay = 0;
    }
    v.pantry = [{
      name: 'Old strips', kcalEach: 400, units: 60, spoilDay: day() - 1, // spoiled
      safe: true, foodKind: 'meat', foodState: 'cooked',
    }];
    Game.villageEats();
    const sickNow = Object.keys(v.sick).filter(id => id !== Game.villagerId);
    check('starving village eats spoiled and gets sick', sickNow.length > 0,
      'sick=' + sickNow.length);
  }
  {
    // but with fresh food available, spoiled is left alone
    const v = freshGame(Game);
    for (const id of v.roster) {
      if (id === Game.villagerId) continue;
      const p = Game.getPerson(id); if (p) p.providesPerDay = 0;
    }
    v.pantry = [
      { name: 'Fresh stew', kcalEach: 400, units: 60, spoilDay: day() + 5, safe: true, foodState: 'cooked' },
      { name: 'Old strips', kcalEach: 400, units: 60, spoilDay: day() - 1, safe: true, foodState: 'cooked' },
    ];
    Game.villageEats();
    const spoiledLeft = v.pantry.find(i => i.name === 'Old strips');
    check('spoiled skipped when fresh food exists', !!spoiledLeft && spoiledLeft.units === 60,
      spoiledLeft ? 'units=' + spoiledLeft.units : 'gone');
  }

  console.log('BUG 2d — villager monster-meat weirdness fires');
  {
    const v = freshGame(Game);
    const vid = v.roster.find(id => id !== Game.villagerId);
    const person = Game.getPerson(vid);
    person.statuses = [];
    const fired = Game.villagerMonsterWeirdness(vid,
      { plantId: 'meat_hushwolf', foodState: 'cooked', name: 'Hushwolf (cooked)' }, 1);
    check('weirdness fires on forced roll', fired === true);
    check('villager carries howlbelly', (person.statuses || []).some(s => s.id === 'howlbelly'),
      JSON.stringify((person.statuses || []).map(s => s.id)));
    const notFired = Game.villagerMonsterWeirdness(vid,
      { plantId: 'meat_hushwolf', foodState: 'cooked', name: 'Hushwolf (cooked)' }, 0);
    check('no double-apply while afflicted', notFired === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
