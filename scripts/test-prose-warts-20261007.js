#!/usr/bin/env node
// test-prose-warts-20261007.js
//
// PROSE WART FIXES — proof, 2026-10-07 (flesh-out loop 2130).
//
// TWO WARTS (flagged by the 2108 hunter audit, confirmed at HEAD a5e9328):
//   1. tbAntlerThrash composed `The ${m.name}` — but m.name carries its own
//      article on unknowns ("the thing with headlights for eyes, standing too
//      still") -> "The the thing with headlights for eyes, standing too still
//      thrashes its antlers at you". FIX: compose via this.monsterNoun(m.monsterId)
//      (the 7040 call-site convention), with a 'something' fallback.
//   2. identifyMonster's unkP never capitalized the sentence opener ->
//      "You don't know what that was. the thing with headlights for eyes,
//      standing too still. Someone..." FIX: capitalize unk before punctuation.
//
// METHOD: static pattern assertions on the target tree + behavioral checks via
// the full node harness (AGENTS.md: full src/js list in index.html order minus
// DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js and drama.js; stub
// window for eval, delete global.window before playing).
// Point at a pristine tree with REPO_ROOT (defaults to the repo root containing
// this script). NEVER run against a dirty worktree copy.
// Deterministic — no RNG in the assertions. SEED accepted and ignored.
//
// Exit 0: both fixes present and behaving. Exit 1: wart still present.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const GAME_SRC = path.join(ROOT, 'src/js/game.js');

let ok = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ok ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- A: static ----
console.log('A. static: fixes present in src/js/game.js');
const src = fs.readFileSync(GAME_SRC, 'utf8');
check('no `The ${m.name}` in tbAntlerThrash', !src.includes('`The ${m.name} thrashes'),
  'double-article composition still present');
check('tbAntlerThrash uses monsterNoun(m.monsterId)',
  /tbAntlerThrash\(m\)[\s\S]{0,900}?this\.monsterNoun\(m\.monsterId\)/.test(src),
  'monsterNoun call missing near tbAntlerThrash');
check('identifyMonster capitalizes unk opener',
  /const unkC = unk\.charAt\(0\)\.toUpperCase\(\) \+ unk\.slice\(1\);/.test(src),
  'unkC capitalization missing');

// ---- B: behavioral ----
console.log('B. behavioral: harness checks');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src\/js\/[^\"']*\.js/g)]
  .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i)
  .filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // eval-phase stub only
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

// Load monster data directly (bypass async fetch wiring).
const mraw = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
Game.data = Game.data || {};
Game.data.monsters = Array.isArray(mraw) ? mraw : mraw.monsters;
Game.state = Game.state || {};
Game.state.codex = Game.state.codex || {};
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.scholar = Game.state.scholar || {};
Game.state.systemArrived = false;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };

// 1. monsterNoun strips the article; caller-supplied "The" composes cleanly.
const mn = Game.monsterNoun('gallowdeer');
check('monsterNoun(gallowdeer) has no leading article', !/^(the|a|an)\s/i.test(mn), 'got: ' + mn);
check('composed opener has no doubled article',
  !/^The (the|a|an)\s/i.test('The ' + mn), 'got: The ' + mn);
check('gallowdeer noun is the head phrase', mn === 'thing with headlights for eyes', 'got: ' + mn);

// 2. identifyMonster capitalizes the opener.
says.length = 0;
Game.identifyMonster('gallowdeer');
const line = says.join('\n');
check('identifyMonster says the line', line.includes("You don't know what that was."), 'got: ' + line);
check('opener capitalized', line.includes("was. The thing with headlights for eyes, standing too still. Someone"),
  'got: ' + line);
check('no lowercase opener', !/was\. the thing/.test(line), 'got: ' + line);

// 3. the 'something' fallback still guards prose unknowns.
const mn2 = Game.monsterNoun('nonexistent_monster_xyz');
check("monsterNoun(unknown id) falls back to 'something'", mn2 === 'something', 'got: ' + mn2);

console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
