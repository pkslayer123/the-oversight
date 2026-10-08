#!/usr/bin/env node
// Survivalist honesty fixes (2026-10-07 playtest loop, survivalist-5).
// Three bugs found while playing the haven needs economy:
//   1. villageMeal said "+1L water" with a DRY cistern (vw.clean >= 0 is always
//      true) while no bottle was added — a lie on the breakfast table.
//   2. Sleep wake line reported only the sleep's own healing ("+10 health")
//      while the night's books netted negative (midnight spiral damage,
//      nightmares) — the player compares the number to their health bar.
//   3. boilWater silently charged 30 kcal ("TENDING A FIRE IS WORK" in a code
//      comment, nowhere in the fiction). Named now, both fire and moss paths.
//      (2026-10-08 survivalist loop: the flat 30 purified 10L as cheaply as 1L —
//      cost now scales 30 + 5/L, named honestly in the message.)
// Usage: node scripts/test-survivalist-honesty-20261007.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '11', 10);
Math.random = mulberry32(SEED);
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};
const lastSay = (n = 4) => says.slice(-n).join(' | ');
const s = () => Game.state.scholar;

(async () => {
  await Game.init();
  console.log(`seed=${SEED}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.location = 'haven';
  s().trauma = 0; Game.state.weather = 'clear';

  console.log('1. meal water honesty');
  Game.state.village.pantry = [{ name: 'beans', kcalEach: 100, units: 50, spoilDay: 999 }];
  Game.state.village.water.clean = 0;
  s().kcal = 0; s().water = [];
  says.splice(0);
  Game.villageMeal();
  check('dry cistern: no "+1L water" claim', !/\+1L water/.test(lastSay(3)), lastSay(3).slice(0, 150));
  check('dry cistern: no phantom bottle', (s().water || []).length === 0, `bottles=${(s().water || []).length}`);
  Game.state.village.water.clean = 5;
  says.splice(0);
  Game.villageMeal();
  check('wet cistern: claims +1L water', /\+1L water/.test(lastSay(3)), lastSay(3).slice(0, 150));
  check('wet cistern: bottle actually added', (s().water || []).length === 1, `bottles=${(s().water || []).length}`);
  check('wet cistern: exactly 1L drawn', Math.floor(Game.state.village.water.clean) === 4, `cistern=${Game.state.village.water.clean}`);
  // hungry path still honest about water
  Game.state.village.pantry = [];
  Game.state.village.water.clean = 3;
  s().water = []; says.splice(0);
  Game.villageMeal();
  check('empty pantry: still names the water gift', /1L water/.test(lastSay(3)), lastSay(3).slice(0, 150));
  check('empty pantry: bottle added', (s().water || []).length === 1, '');

  console.log('2. sleep wake reports NET health');
  Game.state.village.pantry = [{ name: 'beans', kcalEach: 100, units: 50, spoilDay: 999 }];
  Game.state.village.water.clean = 20;
  // crisis: midnight spiral damage, halved heal -> net negative
  s().health = 80; s().kcal = 0; s().hydration = 0; s().energy = 40; s().trauma = 0; s().dayTicks = 300;
  says.splice(0);
  Game.sleep();
  const hpAfter = Math.round(s().health), net = hpAfter - 80;
  const wake = says.find(t => /Dawn\. You wake/.test(t)) || '';
  check('crisis net is negative (spiral outran heal)', net < 0, `net=${net}`);
  check('wake line reports the net, not the sleep portion', new RegExp(`\\(${net} health`).test(wake), wake.slice(0, 160));
  check('wake line no longer claims a positive heal', !/\(\+\d+ health, wrung-out/.test(wake), wake.slice(0, 120));
  // healthy: net equals the heal, message unchanged in shape
  s().health = 80; s().kcal = 2600; s().hydration = 90; s().energy = 40; s().trauma = 0; s().dayTicks = 300;
  says.splice(0);
  Game.sleep();
  const wake2 = says.find(t => /Dawn\. You wake/.test(t)) || '';
  const net2 = Math.round(s().health) - 80;
  check('healthy sleep: net reported', new RegExp(`\\(\\+${net2} health`).test(wake2), wake2.slice(0, 120));

  console.log('3. boil names its cost');
  // ensure a fire cell on this tile
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (detail[y] && (detail[y][x] === 'grass' || detail[y][x] === 'dirt')) { detail[y][x] = 'fire'; break outer; }
  }
  s().water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
  s().kcal = 2000;
  says.splice(0);
  Game.boilWater();
  // SCALED COST (survivalist loop 2026-10-08): 30 + 5/L — 1L = 35 kcal.
  check('boil names -35 kcal', /-35 kcal tending the fire/.test(lastSay(2)), lastSay(2).slice(0, 150));
  check('boil charged 35', Math.round(s().kcal) === 1965, `kcal=${Math.round(s().kcal)}`);
  // moss path: no fire anywhere
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (detail[y] && detail[y][x] === 'fire') detail[y][x] = 'dirt';
  try { Game.state.fires = (Game.state.fires || []).filter(f => !(f.tx === Game.map.px && f.ty === Game.map.py)); } catch (e) {}
  s().abilities = (s().abilities || []).concat(['beard_moss']);
  s().water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
  says.splice(0);
  Game.boilWater();
  check('moss boil names its cost', /-35 kcal coaxing your moss-tinder/.test(lastSay(2)), lastSay(2).slice(0, 150));
  check('moss boil cleaned the water', (s().water || []).every(b => b.quality === 'clean'), '');

  console.log(`\npass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
