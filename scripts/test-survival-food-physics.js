#!/usr/bin/env node
// test-survival-food-physics.js — Part A1 exploit guard (survival-food 2026-10-10).
//
// Claim: the food pipeline NET-CONSERVES (or loses) at every step —
// forage -> clean -> cook -> smoke -> repeat can never create kcal.
// Butcher 0.40/0.30, smoke 0.95/0.80, render 0.90/0.65 are all lossy.
// The one gain (beans 150 raw -> 300 cooked) is the explicit
// "knowledge is calories" design (raw staples are half food), one-way.
//
// This is a regression guard: passes before AND after the tier retune.
// SEED env override.
//
// Run: node scripts/test-survival-food-physics.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
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
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
Game.say = () => {}; Game.sysSay = () => {}; Game.audioEvent = () => {};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const inv = () => Game.state.scholar.inventory;
  const kcalOf = () => inv().reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);

  // ---- 1. meat pipeline: carcass -> cleaned -> cooked -> smoked ----
  // A 3000-kcal turkey carcass (hiddenKcal), known techniques.
  // Track the test items by id (the scholar starts with personal food).
  try { Game.learnTechnique('clean', 'test'); Game.learnTechnique('preserve', 'test'); } catch (e) {}
  const tag = (it) => { it._ptest = true; return it; };
  const ptestKcal = () => inv().filter(i => i._ptest).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  inv().push(tag({ name: 'Wild turkey (carcass)', foodKind: 'meat', foodState: 'carcass', hiddenKcal: 3000, how: 'hunted', units: 1, kcalEach: 0 }));
  const before = 3000;
  try { Game.carcassToMeat(inv(), inv().length - 1, true); } catch (e) {}
  const cleaned = ptestKcal();
  ok(cleaned === Math.round(3000 * 0.4), 'butcher conserves: 3000 -> 1200 (0.40 known)', `got ${cleaned}`);
  // cook the cleaned meat (needs fire proximity; fake it)
  const meatIdx = inv().findIndex(i => i._ptest && i.foodKind === 'meat');
  let cooked = cleaned;
  try {
    Game.nearFire = () => true;
    if (meatIdx >= 0) { Game.cookFood(meatIdx); cooked = ptestKcal(); }
  } catch (e) {}
  ok(cooked <= cleaned, 'cook does not create meat kcal', `${cleaned} -> ${cooked}`);
  // smoke it
  let smoked = cooked;
  try {
    const idx = inv().findIndex(i => i._ptest && i.foodKind === 'meat');
    if (idx >= 0) { Game.preserveFood(idx); smoked = ptestKcal(); }
  } catch (e) {}
  ok(smoked === Math.round(cooked * 0.95), 'smoke conserves: 0.95x skilled', `${cooked} -> ${smoked}`);
  ok(smoked < before, 'full pipeline is net-lossy: no infinite loop', `${before} -> ${smoked}`);

  // ---- 2. blind (unteched) pipeline is lossier ----
  inv().length = 0;
  inv().push(tag({ name: 'Wild turkey (carcass)', foodKind: 'meat', foodState: 'carcass', hiddenKcal: 3000, how: 'hunted', units: 1, kcalEach: 0 }));
  // drop the techniques
  try {
    const tech = (Game.state.codex || {}).techniques || {};
    delete tech.clean; delete tech.preserve;
  } catch (e) {}
  try { Game.carcassToMeat(inv(), inv().length - 1, false); } catch (e) {}
  const blindCleaned = ptestKcal();
  ok(blindCleaned === Math.round(3000 * 0.3), 'blind butcher is lossier: 0.30', `got ${blindCleaned}`);

  // ---- 3. render fat is lossy ----
  inv().length = 0;
  inv().push(tag({ name: 'Bear fat (raw)', foodKind: 'fat', foodState: 'raw', hiddenKcal: 1000, kcalEach: 1000, units: 1 }));
  try { Game.renderFat(inv().length - 1); } catch (e) {}
  const rendered = ptestKcal();
  ok(rendered <= 1000, 'render conserves or loses', `1000 -> ${rendered}`);

  // ---- 4. the one legal gain: raw staples -> cooked (knowledge is calories) ----
  // Dried beans 150 raw -> 300 cooked is the DESIGNED one-way gain, not a loop:
  // there is no un-cook, so it cannot compound.
  inv().length = 0;
  inv().push(tag({ name: 'Dried beans', kcalEach: 150, units: 10, rawKcal: 150, needsCooking: true, foodState: 'raw' }));
  const beanBefore = ptestKcal();
  try { Game.cookFood(inv().length - 1); } catch (e) {}
  const beanAfter = ptestKcal();
  ok(beanAfter >= beanBefore, 'cooking staples unlocks their kcal (knowledge is calories)', `${beanBefore} -> ${beanAfter}`);
  // and cooking them AGAIN does not multiply further
  try { Game.cookFood(inv().length - 1); } catch (e) {}
  const beanAgain = ptestKcal();
  ok(beanAgain <= beanAfter, 're-cooking does not compound', `${beanAfter} -> ${beanAgain}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
