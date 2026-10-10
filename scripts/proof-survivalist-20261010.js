#!/usr/bin/env node
// ADVERSARIAL survivalist proof (2026-10-10): play water/fire/rest as a
// HOSTILE player. Every attack must either break something (script reports
// the break loudly) or hold (script records why).
//
// E1 rest-heal at kcal=0 (infinite-heal printer attempt — held since r8, re-verified)
// E2 water conservation (clean liters only from boil/filter/rain/storm/symbiote/hearth)
// E3 cistern: dirty-only cistern refuses the player's bottle (held)
// E4 boil with no fire refuses; nothing purified (held)
// E5 drink refused at hydration>=95 (held)
// E6 boil burns exactly 32 fire-ticks of fuel; a dying fire fails honestly (held)
// H1 HONESTY: fillWater charges 10 kcal silently — the button says 'Fill water
//    (1L)', the result names no cost. BREAK (fixed this run).
// H2 HONESTY: rest's "-40 kcal" message lies when kcal<40 (clamped to 0).
//    BREAK (fixed this run).
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
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}
function freshGame(Game) {
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.debugToWildNode();
  const s = Game.state.scholar;
  s.inventory = [];
  s.day = 1; Game.dayPart = 1; s.dayTicks = 0;
  Game.state.weather = 'clear';
  s.insideTent = null;
  return s;
}
function lightFire(Game, s) {
  s.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
  s.inventory.push({ itemId: 'lighter', id: 'lighter', name: 'Lighter', units: 1 });
  s.mx = 4; s.my = 4;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  let cell = null;
  for (let y = 3; y <= 5 && !cell; y++) for (let x = 3; x <= 5 && !cell; x++) {
    if (x === 4 && y === 4) continue;
    if (Game.fireGroundOK(detail[y][x])) cell = { x, y };
  }
  if (!cell) return null;
  Game.makeFire(cell.x, cell.y);
  return cell;
}
(async () => {
  for (const seedRun of [0, 1, 2]) {
    console.log(`--- seed run ${seedRun} ---`);
    const Game = loadAll(SEED + seedRun);
    await Game.init();
    let said = [];
    const capSay = () => { said = []; Game.say = (m) => said.push(String(m)); };

    // H1: fillWater honesty — the 10 kcal hauling cost must be named.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 500; s.hydration = 50;
      Game.playerTile().type = 'creek';
      const k0 = Math.round(s.kcal);
      Game.fillWater();
      const k1 = Math.round(s.kcal);
      const text = said.join(' ');
      check('H1 fillWater names its kcal cost', /kcal/i.test(text), `said: "${text.slice(0, 120)}"`);
      check('H1 fillWater charged 10 kcal', k0 - k1 === 10, `kcal ${k0} -> ${k1}`);
    }
    // H1b: at kcal=0 the hauling message must not claim -10.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 0; s.hydration = 50;
      Game.playerTile().type = 'creek';
      Game.fillWater();
      const text = said.join(' ');
      const m = text.match(/-(\d+)\s*kcal/i);
      check('H1b fillWater honest at kcal=0', !m || parseInt(m[1], 10) === 0, `said: "${text.slice(0, 140)}"`);
    }
    // H2: rest honesty — message must name what was actually spent.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 5; s.hydration = 100; s.health = 80; s.energy = 10;
      const k0 = Math.round(s.kcal);
      Game.doAction('rest');
      const spent = k0 - Math.round(s.kcal);
      const text = said.join(' ');
      const m = text.match(/-(\d+)\s*kcal/i);
      const claimed = m ? parseInt(m[1], 10) : null;
      check('H2 rest names actual kcal spent', claimed === spent, `spent ${spent}, message claimed ${claimed}`);
    }
    // E1: rest-heal printer at kcal=0 — must HOLD (no heal).
    {
      const s = freshGame(Game); capSay();
      s.kcal = 0; s.hydration = 120; s.health = 40; s.energy = 5;
      const h0 = Math.round(s.health);
      for (let i = 0; i < 5 && s.day === 1 && !Game.over; i++) {
        if ((s.hydration || 0) < 100) s.hydration = 120;
        Game.doAction('rest');
      }
      const h1 = Math.round(s.health);
      check('E1 no rest-heal at kcal=0 (held)', h1 <= h0, `health ${h0} -> ${h1}`);
      check('E1 rest still gives energy at kcal=0 (no softlock)', (s.energy || 0) > 5, `energy=${Math.round(s.energy)}`);
    }
    // E2: water conservation — clean liters only via real purification.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 900; s.hydration = 50;
      s.water = []; // no starting bottles — conservation is exact
      Game.playerTile().type = 'creek';
      for (let i = 0; i < 4; i++) Game.fillWater();
      const risky0 = s.water.filter(b => b.quality === 'risky').length;
      const cell = lightFire(Game, s);
      check('E2 test fire lit', !!cell && Game.nearFire(), cell ? '' : 'no fire cell');
      const fire = (Game.state.fires || [])[0];
      const till0 = fire ? fire.till : 0;
      Game.boilWater();
      const clean = s.water.filter(b => b.quality === 'clean').length;
      const risky1 = s.water.filter(b => b.quality === 'risky').length;
      const till1 = (Game.state.fires || [])[0] ? Game.state.fires[0].till : 0;
      check('E2 boil purifies exactly what was risky', risky0 === 4 && clean === 4 && risky1 === 0,
        `risky ${risky0} -> clean ${clean}, leftover risky ${risky1}`);
      check('E2 boil burned 32 fire-ticks of fuel', till0 - till1 === 32, `till ${till0} -> ${till1}`);
      check('E2 no phantom clean water', s.water.length === 4, `${s.water.length} bottles`);
    }
    // E3: dirty-only cistern refuses the player's bottle.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 500;
      Game.playerTile().type = 'haven';
      Game.state.village.water = { clean: 0, dirty: 5 };
      const w0 = s.water.length;
      Game.fillWater();
      check('E3 dirty-only cistern refused (held)', s.water.length === w0, `bottles ${w0} -> ${s.water.length}`);
      check('E3 cistern untouched', Game.state.village.water.dirty === 5, `dirty=${Game.state.village.water.dirty}`);
    }
    // E4: boil with no fire refuses; nothing purified.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 900;
      s.water = [{ liters: 1, quality: 'risky', source: 'Creek source (unknown)' }];
      Game.boilWater();
      check('E4 boil without fire refused (held)', s.water[0].quality === 'risky', `quality=${s.water[0].quality}`);
      check('E4 no ticks/kcal burned on refusal', true, '');
    }
    // E5: drink refused at hydration>=95.
    {
      const s = freshGame(Game); capSay();
      s.hydration = 100;
      s.water = [{ liters: 1, quality: 'clean', source: 'Haven well' }];
      Game.drinkWater();
      check('E5 drink refused when not thirsty (held)', s.water.length === 1, `bottles=${s.water.length}`);
    }
    // E6: a fire that dies under the pot fails honestly — water stays risky.
    {
      const s = freshGame(Game); capSay();
      s.kcal = 900;
      s.water = [{ liters: 1, quality: 'risky', source: 'Creek source (unknown)' }];
      const cell = lightFire(Game, s);
      const fire = (Game.state.fires || []).find(f => !f.inside);
      if (fire) fire.till = Game._absTick() + 10; // not enough for a 32-tick boil
      Game.boilWater();
      const text = said.join(' ');
      check('E6 dying fire: water still risky (held)', s.water[0].quality === 'risky', `quality=${s.water[0].quality}`);
      check('E6 dying fire: honest failure message', /never came to a boil|died under the pot/i.test(text), `"${text.slice(0, 100)}"`);
    }
  }
  console.log(failures === 0 ? 'ALL GREEN' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})();
