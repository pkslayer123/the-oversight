#!/usr/bin/env node
// Parity proof: DISEASE (2026-10-08).
// BEFORE: villagers were immune by omission — zero code paths could make them
// sick, while the player faces food-borne disease, dirty water, wound
// infection, ticks.
// AFTER: villageSicknessTick gives villagers the same vectors. Wounded
// villagers can catch wound fever; a village drinking dirty water gets gut
// rot; foragers get tick fever. The sick drain health, stay home, recover
// or die through the normal pipeline.
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
  Game.say = () => {};

  check('villageSicknessTick exists', typeof Game.villageSicknessTick === 'function');

  const npcIds = (v.roster || []).filter(id => id !== Game.villagerId);
  // force the wound vector: drop everyone to low health
  v.health = v.health || {};
  for (const id of npcIds) v.health[id] = 20;
  // force the dirty-water vector
  v.water = { clean: 0, dirty: 50 };

  let everSick = 0;
  for (let d = 0; d < 30 && !everSick; d++) {
    Game.villageSicknessTick();
    everSick = Object.keys(v.sick || {}).length;
  }
  check('villagers CAN get sick (wound/dirty-water vectors fire)',
    everSick > 0, 'sick after 30 forced days: ' + everSick);

  // the sick drain health and eventually recover or die
  const sickId = Object.keys(v.sick || {})[0];
  if (sickId) {
    const h0 = v.health[sickId];
    const s = v.sick[sickId];
    // tick until resolution (cap 20 days)
    let resolved = false;
    for (let d = 0; d < 20 && !resolved; d++) {
      Game.villageSicknessTick();
      resolved = !v.sick[sickId];
    }
    const h1 = v.health[sickId];
    const died = !(v.roster || []).includes(sickId);
    check('sickness drains health while active', h1 < h0 || died,
      `health ${h0} -> ${h1}${died ? ' (died)' : ''}`);
    check('sickness resolves (recovery or death through the pipeline)',
      resolved, 'still sick after 20 ticks: ' + !resolved);
    if (died) {
      check('sickness death recorded in fallen',
        (v.fallen || []).some(f => f.villagerId === sickId),
        'not in fallen');
    }
  }

  // sick villagers don't depart on objectives
  const testId = npcIds.find(id => (v.roster || []).includes(id));
  if (testId) {
    v.sick = v.sick || {};
    v.sick[testId] = { name: 'tick fever', daysLeft: 5, severity: 1 };
    const hx = v.px ?? 4, hy = v.py ?? 4;
    Game.map.px = hx; Game.map.py = hy;
    Game.objMaybeDepart(testId, null, true, hx, hy);
    const away = (v.away || {})[testId];
    const obj = Game.objOf(testId);
    check('sick villagers stay home (no away departure)',
      !away && (!obj || obj.state !== 'out'),
      'away=' + !!away + ' state=' + (obj && obj.state));
    delete v.sick[testId];
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
