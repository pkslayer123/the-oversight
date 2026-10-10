#!/usr/bin/env node
// Utilization fix F1: raids raise an aid crisis reactively; unmet raiders
// linger and gorge nightly; the crisis resolves when the treeline is clear.
// (comms chain was 0/120 runs — raiseAidCrisis had no organic caller.)
// Run: node scripts/test-util-raid-crisis-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

const said = [];
Game.say = (msg) => { said.push(String(msg)); };
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.village;
}
function ripeRaid(v) {
  v.pantry = []; Game.stockPantry(90000, 'Bait');
  v.lastRaidDay = -99;
  for (let k = 0; k < 5; k++) Game.spawnWorldMonster({ id: 'hushwolf' }, 0, k, {});
}

(async () => {
await Game.init();

console.log('== raid raises an aid crisis ==');
let v = freshGame();
ripeRaid(v);
// weaken defenders so at least one raider goes unmet: mark most villagers away
const me = Game.state.scholar.villagerId;
v.away = v.away || {};
(v.roster || []).forEach(id => { if (id !== me) v.away[id] = true; });
said.length = 0;
let fired = false;
for (let i = 0; i < 60 && !fired; i++) fired = Game.havenRaidTick();
ok(fired, 'raid fires under ripe conditions');
const crisis = Game.aidCrisis();
ok(!!crisis, 'raid raised an aid crisis');
ok(crisis && crisis.raiders === true, 'crisis flagged as raid-raised');
ok(said.some(s => /Four ways to call/i.test(s)), 'the four call options are said aloud');

console.log('== unmet raiders linger ==');
const lingerers = (Game.worldMonsters ? Game.worldMonsters() : []).filter(m => m.lingering);
ok(lingerers.length > 0, 'unmet raiders linger at the treeline (not instant pillage)', lingerers.length + ' lingering');
ok(said.some(s => /treeline/i.test(s)), 'lingering is narrated');

console.log('== nightly gorge ==');
const kcalBefore = Game.pantryKcalLive(v);
Game.havenGrowthDaily();
const kcalAfter = Game.pantryKcalLive(v);
ok(kcalAfter < kcalBefore, 'lingering raiders gorge nightly from the real pantry', `${Math.round(kcalBefore)} → ${Math.round(kcalAfter)}`);

console.log('== crisis resolves when cleared ==');
// drive off the lingerers (kill them)
for (const m of lingerers) { try { Game.removeWorldMonster(m); } catch (e) {} }
// the crisis is answered over parts, not instantly: the 3-part delay lets the
// village answer (call, fight, let defenders' work stand) before the door is
// declared quiet — tick the crisis old enough for the clear treeline to count
for (let p = 0; p < 5 && Game.aidCrisis(); p++) Game.commsTick();
ok(!Game.aidCrisis(), "crisis resolves 'fought' when the treeline is clear");

console.log('== moved-on valve clears lingering ==');
v = freshGame();
ripeRaid(v);
(v.roster || []).forEach(id => { if (id !== me) v.away[id] = true; });
said.length = 0; fired = false;
for (let i = 0; i < 60 && !fired; i++) fired = Game.havenRaidTick();
ok(!!Game.aidCrisis(), 'second raid raises crisis');
const c2 = Game.aidCrisis();
c2.sinceDay = (Game.state.scholar.day || 0) - 7; // age it past the valve
Game.commsTick();
ok(!Game.aidCrisis(), '6-day valve resolves the crisis');
const stillLingering = (Game.worldMonsters ? Game.worldMonsters() : []).filter(m => m.lingering);
ok(stillLingering.length === 0, 'valve clears lingering flags (raiders drift off)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
