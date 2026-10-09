#!/usr/bin/env node
// Focused proof: hydrated starving rest-loop. If net health gain > 0 across
// a midnight cycle at kcal=0 (hydrated), the rest action is a slow heal
// printer — the sleep path's metabolic-crisis gate is missing on rest.
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
const SEED = parseInt(process.env.SEED || '7', 10);
function loadAll(seed) {
  delete globalThis.Scattering;
  Math.random = mulberry32(seed);
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
(async () => {
  const Game = loadAll(SEED);
  await Game.init();
  for (const seedRun of [0, 1, 2]) {
    Game.say = () => {};
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.inventory = [];
    s.kcal = 0; s.hydration = 120; // hydrated, fed nothing
    s.health = 40; s.energy = 5;
    s.day = 1; Game.dayPart = 1; s.dayTicks = 0;
    Game.state.weather = 'rain'; // flat 15 burn, no clear-weather tax
    const h0 = Math.round(s.health);
    let rests = 0;
    const startDay = s.day;
    // rest as much as the day allows (96 ticks each), staying hydrated by
    // topping up before midnight — the hostile player's water discipline
    while (s.day === startDay && rests < 20 && !Game.over) {
      if ((s.hydration || 0) < 100) s.hydration = 120; // drink discipline
      Game.doAction('rest'); rests++;
    }
    const h1 = Math.round(s.health);
    console.log(`run${seedRun}: rests=${rests} health ${h0} -> ${h1} (net ${h1 - h0 >= 0 ? '+' : ''}${h1 - h0}) kcal=${Math.round(s.kcal)} hydration=${Math.round(s.hydration)} day=${s.day} over=${!!Game.over}`);
  }
})();
