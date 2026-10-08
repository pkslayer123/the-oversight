#!/usr/bin/env node
// TEST (Steve 2026-10-07), SOCIALITE round 4 finding.
// BUG: invite_party is dropped by the subject-menu early return.
// The invite push (conversation.js ~2544) runs and succeeds, but when the
// player reaches the base menu via dlg:subject ("can I ask you something
// else?" — the dialogue layer fronts EVERY conversation), the subject-menu
// branch (~2602) builds a FRESH `sub` array and returns it, discarding the
// `choices` array that already holds invite_party. The invite only survives
// accidentally when gqActive/reactiveDef skips the early return.
// Design comment at the push site says the invite "must never be crowded
// out by small talk" — the early return violates it.
// DRAMA-TERRITORY: conversation.js is the drama sibling's file — this test
// documents the bug for them. Do NOT "fix" by editing conversation.js here.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  const pick = (Game.generatedRoster || [])[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  let g = 0;
  while (Game.state.scholar.day < 8 && g++ < 20 && !Game.over) { try { Game.endDay(); } catch (e) {} }

  const failures = [];
  const ok = (name, cond, extra) => {
    console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures.push(name);
  };

  const v = Game.state.village;
  v.trust = v.trust || {};
  const villagers = (v.roster || []).filter(id => id !== Game.villagerId);
  const vid = villagers[0];
  v.trust[vid] = 60; // well above the 20 trust floor

  ok('party unlocked and discovered', Game.partyUnlocked() && Game.hasDiscovered('party'));

  // Honest player path: open conversation, then "can I ask you something else?"
  Game.startConvo(vid);
  let ids = Game.convoUI(vid).choices.map(c => c.id);
  if (ids.includes('dlg:subject')) {
    Game.convoTurn(vid, 'dlg:subject');
    ids = Game.convoUI(vid).choices.map(c => c.id);
  }
  Game.endConvo(vid, 'left');

  // The invite must survive the subject menu — the design comment at the
  // push site says a trust-earned person-action must never be crowded out.
  ok('invite_party present after dlg:subject (trust 60, party unlocked)',
    ids.includes('invite_party'),
    'menu was: ' + ids.join(','));

  if (failures.length) { console.log(`\n${failures.length} FAILING (bug reproduced)`); process.exit(1); }
  console.log('\nALL GREEN');
})();
