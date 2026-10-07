#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07): pourWater — the marcher fix.
// BEFORE: water accumulated in s.water with no outlet but drinking; a player
// carrying 9L could not shed a single liter, and "Your pack is full" left
// them stuck (dropItem only handles inventory, water lives in s.water).
// AFTER: Game.pourWater() pours out 1L (risky first), honestly narrated,
// free like dropItem. UI: "Pour out 1L" button on the pack water line.
// Run: node scripts/test-pour-water-20261007.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '21', 10);
Math.random = mulberry32(SEED);
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const lastSay = (n) => says.slice(-(n || 1)).join(' | ');
const clearSays = () => says.splice(0);
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;

  check('pourWater exists', typeof Game.pourWater === 'function');

  // BEFORE-shape: 3L carried (2 risky, 1 clean), pack heavy
  s.water = [
    { liters: 1, quality: 'risky', source: 'Creek (unknown)' },
    { liters: 1, quality: 'clean', source: 'Haven well' },
    { liters: 1, quality: 'risky', source: 'Wild source (unknown)' },
  ];
  const w0 = Game.packWeight();
  const ticks0 = s.dayTicks || 0, kcal0 = Math.round(s.kcal || 0);

  // pour 1: risky first
  clearSays(); Game.pourWater();
  check('pour removes 1L', (s.water || []).length === 2, `bottles=${(s.water || []).length}`);
  check('risky goes first', (s.water || []).every(b => b.quality !== 'risky') === false && (s.water || []).filter(b => b.quality === 'risky').length === 1,
    JSON.stringify((s.water || []).map(b => b.quality)));
  check('pack weight drops 1kg', Math.abs(Game.packWeight() - (w0 - 1)) < 0.01, `${w0} -> ${Game.packWeight()}`);
  check('honest narration', /pour out 1L.*risky/i.test(lastSay(2)), lastSay(2).slice(0, 120));
  check('free: no ticks burned', (s.dayTicks || 0) === ticks0, `ticks ${ticks0} -> ${s.dayTicks}`);
  check('free: no kcal burned', Math.round(s.kcal || 0) === kcal0, `kcal ${kcal0} -> ${Math.round(s.kcal)}`);

  // pour the rest: clean goes last, then empty refusal
  Game.pourWater(); Game.pourWater();
  check('all water gone after 3 pours', (s.water || []).length === 0);
  check('last poured was the clean liter', /clean/i.test(lastSay(4)), lastSay(4).slice(0, 200));
  clearSays(); Game.pourWater();
  check('empty: honest refusal, no crash', /no water to pour out/i.test(lastSay(1)), lastSay(1).slice(0, 80));

  // the march scenario: 9L overweight -> pour down to a sane carry
  s.water = [];
  for (let i = 0; i < 9; i++) s.water.push({ liters: 1, quality: 'risky', source: 'Creek (unknown)' });
  const heavy = Game.packWeight();
  for (let i = 0; i < 6; i++) Game.pourWater();
  check('marcher sheds 6L', (s.water || []).length === 3, `bottles=${(s.water || []).length}`);
  check('6kg lighter', Math.abs(Game.packWeight() - (heavy - 6)) < 0.01, `${heavy} -> ${Game.packWeight()}`);

  console.log(`\npass=${pass} fail=${fail}`);
  console.log('DONE');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
