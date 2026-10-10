#!/usr/bin/env node
// ADVERSARIAL SURVIVALIST — run 2026-10-10 (playtest loop, rotation idx 3).
// Hostile player attacks on the needs economy: water/fire/rest/sleep/weather.
// Seeded (SEED env, default 7). Run: node scripts/attack-survivalist-20261010.js
//
// E1 (EXPLOIT): cook-fuel misattribution. Two player fires on one tile —
//   cook/boil while standing at fire B. Which fire's fuel burns? If the OLD
//   (far) fire burns, "the fire died under the pot" can kill a fire across
//   the tile while the pot's own fire keeps burning, and "feed the fire and
//   try again" points at the wrong flame.
// S1 (SOFTLOCK): night-boundary stranding. Sleep refused <2 batches to dawn;
//   rest at 0 kcal / 0 hydration; wait through dawn; sleep again. Assert the
//   player is never left with no legal recovery move.
// H1 (HONESTY): the wait copy. "You wait. The light changes. Nothing asks
//   anything of you." — but monsterTurn runs during wait and a hungry pack
//   can engage mid-wait (Steve 2026-10-06: waiting is time, time is the
//   monster's turn). The calm line must not print when a fight started.
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
async function freshGame(Game, seedOff) {
  Game.say = () => {};
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.debugToWildNode();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.day = 1; Game.dayPart = 1; s.dayTicks = 64;
  s.kcal = 2000; s.hydration = 100; s.health = 80; s.energy = 80;
  Game.state.weather = 'clear';
  return s;
}
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------- E1: which fire burns? ----------------
async function E1() {
  const Game = loadAll(SEED);
  const s = await freshGame(Game);
  const said = [];
  Game.say = (m) => said.push(String(m));
  // fire knack: friction always catches
  s.firecraft = { attempts: 3, successes: 3, knack: true };
  Game.addMaterial('branch', 12);
  const fireAt = (cx, cy) => (Game.state.fires || []).find(f => f.cx === cx && f.cy === cy && f.till > Game._absTick());
  // pick two burnable cells: stand next to B at the end, A far away
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const okCells = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++)
    if (Game.fireGroundOK(detail[y] && detail[y][x])) okCells.push([x, y]);
  let cA = null, cB = null, pSpot = null;
  outer: for (const b of okCells) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const px = b[0] + dx, py = b[1] + dy;
      if (px < 0 || px > 8 || py < 0 || py > 8 || (dx === 0 && dy === 0)) continue;
      for (const a of okCells) {
        if (a[0] === b[0] && a[1] === b[1]) continue;
        if (Math.max(Math.abs(a[0] - px), Math.abs(a[1] - py)) < 2) continue; // A far from final spot
        // need a spot adjacent to A for lighting it
        let aSpot = null;
        for (let ay = -1; ay <= 1 && !aSpot; ay++) for (let ax = -1; ax <= 1; ax++) {
          const qx = a[0] + ax, qy = a[1] + ay;
          if (qx >= 0 && qx <= 8 && qy >= 0 && qy <= 8 && !(ax === 0 && ay === 0)) { aSpot = [qx, qy]; break; }
        }
        if (!aSpot) continue;
        cA = a; cB = b; pSpot = [px, py];
        // light A from its adjacent spot first
        s.mx = aSpot[0]; s.my = aSpot[1];
        Game.makeFire(cA[0], cA[1]);
        break outer;
      }
    }
  }
  if (!cA) { check('E1 setup: found fire cells', false, 'no valid pair'); return; }
  s.mx = pSpot[0]; s.my = pSpot[1];
  Game.makeFire(cB[0], cB[1]); // fire B (the one we stand at)
  let A = fireAt(cA[0], cA[1]), B = fireAt(cB[0], cB[1]);
  if (!A || !B) { check('E1 setup: two fires lit', false, `A=${!!A} B=${!!B}`); return; }
  check('E1 setup: two fires lit', true, `A@(${cA}) B@(${cB}) player@(${pSpot})`);
  // feed A into a bonfire so its burn (or not) is unmistakable
  for (let i = 0; i < 4; i++) Game.feedFire(cA[0], cA[1]);
  A = fireAt(cA[0], cA[1]); B = fireAt(cB[0], cB[1]);
  const tillA0 = A.till, tillB0 = B.till;
  // one risky liter, boiled "at" fire B
  s.water = [{ liters: 1, quality: 'risky', source: 'Creek' }];
  said.length = 0;
  Game.boilWater();
  A = fireAt(cA[0], cA[1]); B = fireAt(cB[0], cB[1]);
  const dA = tillA0 - (A ? A.till : tillA0), dB = tillB0 - (B ? B.till : tillB0);
  const burnedB = dB >= 30 && dA === 0; // the fire under the pot paid
  check('E1 fuel burns at the fire you are cooking at', burnedB,
    `till drop: far-fire A=${dA}, near-fire B=${dB} (want B≈32, A=0)`);
}

// ---------------- S1: night-boundary stranding ----------------
async function S1() {
  const Game = loadAll(SEED + 1);
  const s = await freshGame(Game);
  const said = [];
  Game.say = (m) => said.push(String(m));
  const T = Game.TIME;
  // 1 batch to dawn: sleep must refuse honestly, not strand
  s.dayTicks = T.TICKS_PER_DAY - T.TICKS_PER_BATCH; Game.dayPart = 3;
  said.length = 0;
  Game.sleep();
  const refusedLate = said.join(' ').includes('too late for real sleep');
  check('S1a sleep <2 batches to dawn refuses honestly', refusedLate, said[said.length - 1]);
  // rest at absolute zero: energy recovers (walk to food), no phantom heal.
  // (reset the clock first — S1a left us 1 batch from dawn and the midnight
  // spiral would take its cut mid-rest, which is by design, not a rest bug.)
  s.dayTicks = 64; Game.dayPart = 1;
  s.kcal = 0; s.hydration = 0; s.health = 40; s.energy = 5;
  const h0 = Math.round(s.health);
  Game.doAction('rest');
  const noPhantomHeal = Math.round(s.health) <= h0;
  const energyBack = (s.energy || 0) > 5;
  check('S1b rest at 0 kcal/0 hydration: no phantom heal, energy returns', noPhantomHeal && energyBack,
    `health ${h0}->${Math.round(s.health)}, energy 5->${Math.round(s.energy)}`);
  // wait across midnight, then sleep must be possible again — never stuck
  s.kcal = 1500; s.hydration = 90;
  s.dayTicks = T.TICKS_PER_DAY - T.TICKS_PER_BATCH; Game.dayPart = 3; // 1 batch to dawn
  const dayBefore = s.day;
  Game.doAction('wait');
  const dawned = s.day === dayBefore + 1;
  s.dayTicks = 64; Game.dayPart = 0; // morning
  said.length = 0;
  Game.sleep();
  const slept = said.join(' ').includes('Sleep takes you') || said.join(' ').includes('settle into');
  check('S1c wait across midnight, then sleep works (no stranding)', dawned && slept && !Game.over,
    `day=${s.day} over=${!!Game.over} slept=${slept}`);
  check('S1d breach lock open by default (no stuck lock)', Game._breachLock() === false);
}

// ---------------- H1: wait copy vs mid-wait fight ----------------
async function H1() {
  const Game = loadAll(SEED + 2);
  const s = await freshGame(Game);
  const said = [];
  Game.say = (m) => said.push(String(m));
  s.mx = 4; s.my = 4; s.dayTicks = 0; Game.dayPart = 1;
  // hostile pack: hummice hunts by ear, engages at distance <= 1
  s.monster = { id: 'hummice', hp: 40, mx: 5, my: 4 };
  Game.doAction('wait');
  const log = said.join('\n');
  const fought = !!Game.tbfight;
  const calmLine = log.includes('Nothing asks anything of you');
  check('H1 setup: wait drew the pack into a fight', fought, `tbfight=${fought}`);
  check('H1 wait does not promise peace when a fight started', fought ? !calmLine : true,
    fought ? (calmLine ? 'calm line printed AND fight started (lie)' : 'calm line withheld, fight narrated') : 'no fight — copy stands');
}

(async () => {
  await E1();
  await S1();
  await H1();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed (seed ${SEED})`);
  process.exit(fails.length ? 1 : 0);
})();
