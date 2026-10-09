#!/usr/bin/env node
// Proof tests for the survivalist-loop 2026-10-08 fixes.
// BEFORE (attack-survivalist-20261008.js, same seed family):
//   E1: hydrated starving player rest-looped 40 -> 70 health in 6 rests (+30/day, infinite)
//   E2: fillWater on a dry 'forest_floor' tile filled +1L ("Wild source (unknown)")
//   E3: charcoal rake key was per-node per-day; a second fire on the same node
//       was refused with "already raked this fire" — a lie about a different fire.
// AFTER: all green below. Seed BEFORE eval (modules capture Math.random at load).
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
let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}
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
let sayLog = [];
function freshGame(Game) {
  sayLog = [];
  Game.say = (m) => { sayLog.push(String(m)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 1;
  Game.state.scholar.dayTicks = 0;
}
(async () => {
  const Game = loadAll(SEED);
  await Game.init();

  // ---- F1: rest-heal printer is dead ----
  for (const trial of [0, 1, 2]) {
    freshGame(Game);
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.inventory = [];
    s.kcal = 0; s.hydration = 120; s.health = 40; s.energy = 5;
    s.day = 1; Game.dayPart = 1; s.dayTicks = 0;
    Game.state.weather = 'rain';
    const h0 = Math.round(s.health);
    let rests = 0;
    const startDay = s.day;
    while (s.day === startDay && rests < 20 && !Game.over) {
      if ((s.hydration || 0) < 100) s.hydration = 120;
      Game.doAction('rest'); rests++;
    }
    const h1 = Math.round(s.health);
    ok(`F1.${trial} starving rest-loop cannot net-heal (was +10..+30/day)`,
      h1 <= h0 + 2, `health ${h0} -> ${h1} over ${rests} rests`);
    ok(`F1.${trial} kcal never goes negative`, Math.round(s.kcal) >= 0, `kcal=${Math.round(s.kcal)}`);
  }
  // rest still restores energy at 0 (no softlock) and says so honestly
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 0; s.hydration = 120; s.health = 40; s.energy = 0;
    const n = sayLog.length;
    Game.doAction('rest');
    const restSay = sayLog.slice(n).join(' ');
    ok('F1 crisis rest still gives energy (no softlock)', s.energy > 0, `energy=${Math.round(s.energy)}`);
    ok('F1 crisis rest names the missing healing', /nothing to rebuild|No healing while starving/i.test(restSay),
      `"${restSay.slice(0, 110)}"`);
  }
  // fed rest still heals (no regression)
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 1500; s.hydration = 100; s.health = 40; s.energy = 0;
    const h0 = Math.round(s.health);
    Game.doAction('rest');
    ok('F1 fed rest still heals', Math.round(s.health) > h0, `${h0} -> ${Math.round(s.health)}`);
  }

  // ---- F2: fillWater is physical ----
  freshGame(Game);
  {
    Game.debugToWildNode();
    const t = Game.playerTile();
    t.type = 'forest_floor'; // force a dry tile
    const s = Game.state.scholar;
    s.kcal = 500;
    const w0 = (s.water || []).length;
    const n = sayLog.length;
    Game.fillWater();
    const filled = (s.water || []).length - w0;
    ok('F2 dry meadow refuses fill (was +1L "Wild source")', filled === 0, `filled=${filled}`);
    ok('F2 refusal says where water actually is', /creek|pond|wetland/i.test(sayLog.slice(n).join(' ')));
  }
  // real water still fills, with honest names
  for (const [ttype, label] of [['creek', 'Creek'], ['wetland', 'Wetland'], ['pond', 'Pond']]) {
    freshGame(Game);
    Game.debugToWildNode();
    Game.playerTile().type = ttype;
    const s = Game.state.scholar;
    s.kcal = 500;
    const w0 = (s.water || []).length;
    Game.fillWater();
    const got = (s.water || []).slice(w0);
    ok(`F2 ${ttype} still fills`, got.length === 1 && got[0].quality === 'risky', `got=${got.length}`);
    ok(`F2 ${ttype} source named`, got.length === 1 && got[0].source.indexOf(label) === 0, `source="${got[0] && got[0].source}"`);
  }
  // haven cistern path untouched
  freshGame(Game);
  {
    const s = Game.state.scholar;
    s.insideHaven = true;
    Game.map.px = 4; Game.map.py = 4;
    Game.state.village.water = { clean: 10, dirty: 0 };
    s.kcal = 500;
    const w0 = (s.water || []).length;
    Game.fillWater();
    const got = (s.water || []).slice(w0);
    ok('F2 haven still draws clean from cistern', got.length === 1 && got[0].quality === 'clean');
    ok('F2 haven fill drains the cistern', Game.state.village.water.clean === 9);
  }

  // ---- F3: charcoal rake is per-fire per-day ----
  freshGame(Game);
  {
    Game.debugToWildNode();
    const s = Game.state.scholar;
    s.kcal = 2000;
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    detail[3][3] = 'fire'; detail[5][5] = 'fire';
    const now = Game._absTick();
    Game.state.fires = [
      { tx: Game.map.px, ty: Game.map.py, cx: 3, cy: 3, till: now + 500 },
      { tx: Game.map.px, ty: Game.map.py, cx: 5, cy: 5, till: now + 500 },
    ];
    const cc = () => Game.materialCount('charcoal');
    const c0 = cc();
    s.mx = 4; s.my = 4; // nearest fire: (3,3)
    Game.gatherCharcoal();
    const c1 = cc();
    s.mx = 6; s.my = 6; // nearest fire: (5,5) — a DIFFERENT fire
    sayLog = [];
    Game.gatherCharcoal();
    const c2 = cc();
    const denied2 = sayLog.some(m => /already raked/i.test(m));
    ok('F3 second fire on same node is rakable (was denied)', !denied2 && c2 > c1,
      `charcoal ${c0} -> ${c1} -> ${c2}, denied=${denied2}`);
    s.mx = 4; s.my = 4; // back to the FIRST fire — same fire twice
    sayLog = [];
    Game.gatherCharcoal();
    const denied3 = sayLog.some(m => /already raked/i.test(m));
    ok('F3 same fire twice in one day still denied', denied3 && cc() === c2);
  }

  console.log(`\nRESULT seed=${SEED}: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
