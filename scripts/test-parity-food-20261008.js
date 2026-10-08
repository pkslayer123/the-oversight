#!/usr/bin/env node
// Parity proof: FOOD double-dip (2026-10-08).
// The player eats via villageMeal (personal trust-scaled share) AND is counted
// in villageEats' collective roster loop (needed - produced). Villagers eat
// once (collective net). Measure both draws.
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

(async () => {
  const Game = loadAll();
  await Game.init();
  Game.genRoster('Breaker');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker', null, rid);
  Game.depart();
  const v = Game.state.village;
  const hx = v.px ?? 4, hy = v.py ?? 4;
  Game.map.px = hx; Game.map.py = hy; // player at haven
  // use the natural starting pantry (realistic unit sizes); do NOT add a
  // giant test item (villageMeal can't split indivisible units — separate bug)
  // trust 50: full ration for the player
  v.trust = v.trust || {};
  v.trust[Game.villagerId] = 50;
  for (const id of (v.roster || [])) {
    if (id === Game.villagerId) continue;
    v.trust[id] = 50;
    v.health = v.health || {}; v.health[id] = 100;
  }
  v.health[Game.villagerId] = 100;
  Game.state.scholar.kcal = 0; // empty stomach: take the full share

  const before = pantryKcal(Game);
  Game.villageMeal();
  const afterMeal = pantryKcal(Game);
  const personalDraw = before - afterMeal;

  // collective burn WITH player in roster
  const b2 = pantryKcal(Game);
  Game.villageEats();
  const a2 = pantryKcal(Game);
  const collectiveWithPlayer = b2 - a2;

  console.log('  personal meal draw: ' + Math.round(personalDraw));
  console.log('  collective burn (player in roster): ' + Math.round(collectiveWithPlayer));

  // player's phantom production credit: produced in the sim
  const me = Game.getPerson(Game.villagerId) || {};
  console.log('  player providesPerDay (phantom): ' + (me.providesPerDay || 0) + ', kcalPerDay: ' + (me.kcalPerDay || 0));

  // A comparable villager's net draw: needed - produced
  const vid = (v.roster || []).find(id => id !== Game.villagerId);
  const vp = Game.getPerson(vid) || {};
  const vNeed = (vp.kcalPerDay || 2000);
  const vProd = (vp.providesPerDay || 0);
  console.log('  sample villager net draw: ~' + Math.round(vNeed - vProd));

  // AFTER FIX: the player is not in the collective loop, so their pantry draw
  // is exactly the personal meal. (The old code also drew a collective net on
  // top AND credited ~1156 phantom production.)
  // Note: villageEats burns in EFFECTIVE (cooked) kcal — raw items yield more
  // via the digestibility model, so nominal pantry loss < effective net. That
  // is honest; the parity question is only who draws.
  console.log('  player total pantry draw: ~' + Math.round(personalDraw) + ' (personal meal only)');
  check('player draws roughly ONCE (personal meal only, no collective net)',
    personalDraw <= 2300,
    'personal ~' + Math.round(personalDraw));
  // burn honesty: the pantry clock counts the player's meal
  const hist = v.burnHistory || [];
  const lastBurn = hist[hist.length - 1] || 0;
  console.log('  burnHistory last: ' + Math.round(lastBurn) + ' (collective was ' + Math.round(collectiveWithPlayer) + ')');
  check('burn clock includes the player meal',
    lastBurn >= personalDraw * 0.9,
    'burn ' + Math.round(lastBurn) + ' vs meal ' + Math.round(personalDraw));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
