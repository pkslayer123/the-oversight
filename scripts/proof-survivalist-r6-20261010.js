#!/usr/bin/env node
// ADVERSARIAL survivalist proof, round 6 (2026-10-10, rotation idx 3 again —
// the rotation file still read 3, so this run re-attacks survivalist with
// FRESH angles; the morning run (r5) covered rest/water/boil honesty).
//
// E1 map-fire fireside: wild tiles must not spawn free 'fire' cells (an
//    eternal map fire + nearFire + fireLastsTillDawn("map fires last") would
//    make every cold night free). Also: fireside cold protection must require
//    a FED fire (fireLastsTillDawn), not just any ember.
// E2 storm sheltered water: pack-full clamping must be honest (addWater
//    returns actual take; message names it).
// E3 cold-night fireside warn accuracy: sleepPreview warn, fireLastsTillDawn,
//    and sleep()'s exposed bite must agree (all read the same function).
// S1 sleep boundary guards: "barely dawn" and "too late for real sleep"
//    refusals must hold.
// E4 rest() cold-shiver energy floor: shivering rest must never DRAG energy
//    down (max(energy, min(40, energy+gain))).
// H1 HONESTY: makeFire success/failure messages name no kcal/ticks — the
//    button says "Start a fire (big job)" and the result names no cost.
//    BREAK (fails pre-fix by design).
// H2 HONESTY: lightTentFire (30 kcal, 16 ticks) names no cost. BREAK.
// H3 HONESTY: feedFire (8 ticks, +64/+192 flame) names no cost and no flame
//    gain ("a while more flame"). BREAK.
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
let said = [];
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
  s.kcal = 2000; s.hydration = 100; s.health = 100; s.energy = 80;
  said = [];
  Game.say = (m) => { said.push(String(m)); };
  return s;
}
// light a fire adjacent to the player with the lighter (auto success)
function lightFireAt(Game, s) {
  s.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
  if (!s.inventory.some(i => i.itemId === 'lighter'))
    s.inventory.push({ itemId: 'lighter', id: 'lighter', name: 'Lighter', units: 1 });
  s.mx = 4; s.my = 4;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) {
    if (x === 4 && y === 4) continue;
    if (Game.fireGroundOK(detail[y][x])) { Game.makeFire(x, y); return { x, y }; }
  }
  return null;
}
// place a tracked player fire directly (bypasses the adjacency rule) —
function plantFire(Game, s, x, y, burnTicks) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  detail[y][x] = 'fire';
  const now = Game._absTick();
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx: x, cy: y, till: now + burnTicks, burn0: burnTicks });
  return { x, y };
}
(async () => {
  for (const seedRun of [0, 1, 2]) {
    console.log(`--- seed run ${seedRun} ---`);
    const Game = loadAll(SEED + seedRun);
    await Game.init();

    // E1: wild tiles must not spawn free map fires
    {
      freshGame(Game);
      let wildFires = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        try {
          const d = Game.genDetail(Game.map.px + dx, Game.map.py + dy);
          for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++)
            if (d[y] && d[y][x] === 'fire') wildFires++;
        } catch (e) {}
      }
      check('E1 no wild map fires (cold nights cannot be free)', wildFires === 0, `fire cells in 5x5 node scan: ${wildFires}`);
    }

    // E1b: fireside cold protection requires a FED fire, not just any ember
    {
      const s = freshGame(Game);
      Game.state.weather = 'cold';
      s.mx = 4; s.my = 4;
      plantFire(Game, s, 0, 0, 10); // far corner ember, dies in 10 ticks
      check('E1b ember on grid: quality fireside', Game.sleepQuality() === 'fireside', `quality=${Game.sleepQuality()}`);
      check('E1b dying ember: fireLastsTillDawn false', Game.fireLastsTillDawn() === false);
      const warn = Game.sleepPreview().warn || '';
      check('E1b dying ember: preview warns honestly', /dies before dawn/.test(warn), warn.slice(0, 70));
    }

    // E2: storm sheltered water clamps to carry, message honest
    {
      const s = freshGame(Game);
      const cap = Game.carryCapacity();
      s.inventory.push({ material: 'stone', units: 1, name: 'Stone', kg: cap });
      const before = (s.water || []).length;
      const got = Game.addWater(3, 'clean', 'storm');
      check('E2 storm water clamps to carry room', got <= 3 && (s.water || []).length === before + got, `got=${got}`);
      // real resolveStormFront path, sheltered at haven
      const s2 = freshGame(Game);
      Game.map.px = Game.state.village.px ?? 4;
      Game.map.py = Game.state.village.py ?? 4;
      s2.stormFront = { day: s2.day };
      said = [];
      Game.resolveStormFront();
      const msg = said.join(' ');
      const m = msg.match(/\(\+(\d+) clean water/);
      check('E2 storm message names actual take', !!m, (m ? m[0] : msg.slice(0, 80)));
    }

    // E3: cold-night fireside warn accuracy — preview and engine agree
    {
      const s = freshGame(Game);
      Game.state.weather = 'cold';
      s.mx = 4; s.my = 4;
      plantFire(Game, s, 3, 4, Game.TIME.TICKS_PER_DAY * 3); // fed to last
      check('E3 fed fire: lasts till dawn', Game.fireLastsTillDawn() === true);
      const warn = Game.sleepPreview().warn || '';
      check('E3 fed fire: no dying-fire warning', !/dies before dawn/.test(warn), warn.slice(0, 70) || '(no warn)');
    }

    // S1: sleep boundary guards
    {
      const s = freshGame(Game);
      const T = Game.TIME;
      Game.dayPart = 0; s.dayTicks = 0;
      said = [];
      Game.sleep();
      check('S1 barely-dawn sleep refused', said.join(' ').includes('barely dawn'), said.join(' ').slice(0, 70));
      Game.dayPart = 3; s.dayTicks = T.TICKS_PER_DAY - T.TICKS_PER_BATCH;
      said = [];
      Game.sleep();
      check('S1 too-late sleep refused', said.join(' ').includes('too late for real sleep'), said.join(' ').slice(0, 70));
    }

    // E4: shivering rest never drags energy down
    {
      const s = freshGame(Game);
      Game.state.weather = 'cold';
      s.energy = 90; s.kcal = 500; s.hydration = 50;
      Game.doAction('rest');
      check('E4 shiver-rest at energy 90 stays 90', s.energy === 90, `energy=${s.energy}`);
      s.energy = 10;
      Game.doAction('rest');
      check('E4 shiver-rest at energy 10 rises toward 40 cap', s.energy > 10 && s.energy <= 40, `energy=${s.energy}`);
    }

    // H1: makeFire names its costs (success + failure)
    {
      const s = freshGame(Game);
      const cell = lightFireAt(Game, s); // lighter: auto success, 5 kcal, 8 ticks
      check('H1 setup: fire lit', !!cell);
      const okMsg = said.join(' ');
      check('H1 makeFire success names kcal + ticks', /-\d+ kcal/.test(okMsg) && /\d+ ticks/.test(okMsg), okMsg.slice(0, 100));
      const s2 = freshGame(Game);
      s2.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
      s2.mx = 4; s2.my = 4;
      const d2 = Game.genDetail(Game.map.px, Game.map.py);
      let cell2 = null;
      for (let y = 3; y <= 5 && !cell2; y++) for (let x = 3; x <= 5 && !cell2; x++) {
        if (x === 4 && y === 4) continue;
        if (Game.fireGroundOK(d2[y][x])) cell2 = { x, y };
      }
      const realRandom = Math.random;
      Math.random = () => 0.99999; // force failure
      said = [];
      Game.makeFire(cell2.x, cell2.y);
      Math.random = realRandom;
      const failMsg = said.join(' ');
      check('H1 makeFire failure names kcal + ticks spent', /-\d+ kcal/.test(failMsg) && /\d+ ticks/.test(failMsg), failMsg.slice(0, 100));
    }

    // H2: lightTentFire names its cost
    {
      const s = freshGame(Game);
      s.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
      const detail = Game.genDetail(Game.map.px, Game.map.py);
      detail[3][3] = 'tent';
      const t = Game.playerTile();
      t.secrets = t.secrets || {};
      t.secrets['3,3'] = { condition: 'good', known: true, yours: true };
      s.insideTent = { tx: Game.map.px, ty: Game.map.py, cx: 3, cy: 3 };
      said = [];
      Game.lightTentFire();
      const msg = said.join(' ');
      check('H2 lightTentFire names kcal + ticks', /-\d+ kcal/.test(msg) && /\d+ ticks/.test(msg), msg.slice(0, 100));
    }

    // H3: feedFire names ticks spent and flame gained
    {
      const s = freshGame(Game);
      const cell = lightFireAt(Game, s);
      if (!cell) { check('H3 setup: fire lit', false); }
      else {
        s.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
        said = [];
        Game.feedFire(cell.x, cell.y);
        const msg = said.join(' ');
        check('H3 feedFire names ticks spent + flame gained', /\d+ ticks/.test(msg) && /flame/.test(msg), msg.slice(0, 110));
      }
    }

    // H4: feedTentFire names ticks spent and flame gained (same class as H3)
    {
      const s = freshGame(Game);
      s.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
      const detail = Game.genDetail(Game.map.px, Game.map.py);
      detail[3][3] = 'tent';
      const t = Game.playerTile();
      t.secrets = t.secrets || {};
      t.secrets['3,3'] = { condition: 'good', known: true, yours: true };
      s.insideTent = { tx: Game.map.px, ty: Game.map.py, cx: 3, cy: 3 };
      said = [];
      Game.lightTentFire();
      s.inventory.push({ material: 'branch', units: 10, name: 'Branch', kg: 0.5 });
      said = [];
      Game.feedTentFire();
      const msg = said.join(' ');
      check('H4 feedTentFire names ticks spent + flame gained', /\d+ ticks/.test(msg) && /flame/.test(msg), msg.slice(0, 110));
    }
  }
  console.log(failures === 0 ? 'ALL GREEN' : `${failures} FAILURES`);
  process.exit(failures ? 1 : 0);
})();
