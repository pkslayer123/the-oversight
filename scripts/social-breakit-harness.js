#!/usr/bin/env node
// Social break-it harness (2026-10-08).
// Loads the FULL src/js/*.js list in index.html order minus DOM-only
// (app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js).
// Seeds Math.random BEFORE eval (modules capture it at load time).
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
Math.random = mulberry32(SEED);

global.window = global; // eval-time stub for equipment.js
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="([^"]+)"/g)]
  .map(m => m[1].split('?')[0])
  .filter(f => f.startsWith('src/js/'))
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window; // runtime takes the sync path

async function newSocialGame() {
  const Game = globalThis.Scattering.Game;
  await Game.init();
  Game.genRoster('Breaker');
  const rid = Game.generatedRoster[0].id;
  Game.newGame('Breaker', null, rid);
  Game.depart();
  return Game;
}

module.exports = { ROOT, SEED, newSocialGame, mulberry32 };
