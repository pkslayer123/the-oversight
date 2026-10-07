#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07), HUNTER archetype — the trapline & the regret.
// Fresh territory NOT covered by hunter1/2/3 or playtest-hunter-week (those did:
// basic snare craft/set + 3 dawns on-tile, night stalk practice, night strikes):
//   ACT 1: LONG-RANGE TRAPLINE — set 2 traps on 2 different tiles, walk 3 tiles
//          away, run 5 dawns. Is the dawn messaging honest about WHERE? Does
//          the passive income feel like a trapline or free food?
//   ACT 2: BOX TRAP + SKUNK — force a striped_skunk catch. Recipe L3 says
//          "a skunk, which you will regret" — does the game deliver the regret?
//   ACT 3: PIT TRAP SELF-HARM — recipe text warns "your own pit will take you
//          too." Leave and re-enter a tile with a set pit trap. Real or flavor?
//   ACT 4: DEADFALL bait economy — bait is food, not a material. Honest?
// TURN HYGIENE: after the player action, advance ONLY if still player's turn.
// RNG: seeded mulberry32 for a reproducible play (SEED env override).
// Run: node scripts/play-feel-20261007-hunter-trapline.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // drop the stub: tbAfterPlayerAction takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;
const note = t => console.log(t);
function say() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
function freshHunter() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.mx = 4; s.my = 4;
  say();
  return s;
}
function giveMats(s) {
  s.inventory.push({ material: 'vine', units: 6, name: 'vine' }, { material: 'stick', units: 10, name: 'stick' },
    { material: 'stone', units: 3, name: 'stone' }, { name: 'berries', kcalEach: 30, units: 6, kg: 0.1 });
}
const results = [];
const check = (name, cond) => { results.push([name, !!cond]); note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}`); };

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
const s = freshHunter();
giveMats(s);
Game.learnRecipe('snare', 3); Game.learnRecipe('box_trap', 3); Game.learnRecipe('pit_trap', 3); Game.learnRecipe('deadfall', 3);
say();

// ---------- ACT 1: LONG-RANGE TRAPLINE ----------
// travel N hops east (travelTargets are adjacent-only)
function hopEast(n) { for (let i = 0; i < n; i++) { const t = Game.travelTargets().find(t => t.x === Game.map.px + 1 && t.y === Game.map.py) || Game.travelTargets()[0]; Game.travelTo(t.x, t.y, true); say(); } }
note('\nACT 1 — the long-range trapline: set box trap here, walk far, 5 dawns');
Game.craft('box_trap'); say();
Game.craft('snare'); say();
const home = { x: Game.map.px, y: Game.map.py };
Game.setTrap('box_trap'); say();
hopEast(2);
const far = { x: Game.map.px, y: Game.map.py };
Game.setTrap('snare'); say();
note(`   traps: box@${home.x},${home.y} snare@${far.x},${far.y}; player walks home then camps far`);
Game.travelTo(home.x, home.y, true); say();
hopEast(2);
const camp = { x: Game.map.px, y: Game.map.py };
let catches = 0, brokeMsgs = 0;
for (let d = 0; d < 5; d++) {
  Game.log.length = 0;
  Game.endDay();
  const out = say();
  s.kcal = 2400; s.hydration = 100; s.health = Math.max(s.health, 100);
  if (Game.over) { note('   GAME OVER during trapline?!'); break; }
  const lines = out.split(/(?=Your )/g).filter(x => /trap|snare|box/i.test(x));
  for (const l of lines) note(`   dawn ${d + 1}: ${l.slice(0, 150)}`);
  if (/caught a/i.test(out)) catches++;
  if (/broke/i.test(out)) brokeMsgs++;
  if (s.kcal < 500) { note('   starvation risk — kept alive by harness'); }
}
note(`   5 dawns: ${catches} dawns with catches, ${brokeMsgs} break messages, player camped ${Math.abs(camp.x - home.x) + Math.abs(camp.y - home.y)} tiles from home trap`);
check('dawn messages name the catch', catches > 0);

// ---------- ACT 2: BOX TRAP + SKUNK ----------
note('\nACT 2 — the skunk in the box: does the regret arrive?');
const s2 = freshHunter();
giveMats(s2);
Game.learnRecipe('box_trap', 3);
let made2 = null;
for (let i = 0; i < 6 && !made2; i++) made2 = Game.craft('box_trap');
say();
const set2 = Game.setTrap('box_trap'); say();
const trapHere = (Game.playerTile().traps || []).some(t => t.recipeId === 'box_trap');
note(`   craft ${made2 ? 'ok' : 'FAILED'}, set ${set2 ? 'ok' : 'FAILED'}, trap on tile: ${trapHere}`);
check('box trap actually set for the skunk test', trapHere);
// force the catch roll deterministically: call checkTraps directly.
// box_trap.catches[7] === 'striped_skunk'; 1st RNG call = trapChance (<0.4),
// 2nd = catch index (0.47 -> floor(0.47*15) = 7).
const realRand = Math.random;
let calls = 0;
Math.random = () => { calls++; return calls === 1 ? 0.1 : calls === 2 ? 0.47 : 0.5; };
Game.log.length = 0;
Game.checkTraps();
Math.random = realRand;
const skunkOut = say();
note('   > ' + skunkOut.slice(0, 320));
note('   skunkScent after: ' + (s2.skunkScent || 0));
check('skunk catch names the skunk', /skunk/i.test(skunkOut));

// ---------- ACT 3: PIT TRAP SELF-HARM ----------
note('\nACT 3 — your own pit: leave it, come back. Flavor or real?');
const s3 = freshHunter();
giveMats(s3);
Game.learnRecipe('pit_trap', 3);
Game.craft('pit_trap'); say();
Game.setTrap('pit_trap'); say();
const pitHome = { x: Game.map.px, y: Game.map.py };
// age the trap one day so it is "yesterday's pit"
const pt = (Game.tileAt(pitHome.x, pitHome.y).traps || [])[0];
if (pt) pt.setDay = s3.day - 1;
note('   trap aged to yesterday; walking 2 tiles east then back');
hopEast(2);
const hpBefore = s3.health;
Game.log.length = 0;
Game.travelTo(pitHome.x, pitHome.y, true);
const pitOut = say();
note('   > ' + pitOut.slice(0, 300));
note(`   health ${hpBefore} -> ${s3.health}`);
check('pit arrival mentioned', /pit/i.test(pitOut));

// ---------- ACT 4: DEADFALL bait honesty ----------
note('\nACT 4 — deadfall: bait is food, and the craft says so');
const s4 = freshHunter();
// strip ALL food (starting rations would read as bait) for the honest no-bait case
s4.inventory = s4.inventory.filter(i => !((i.kcalEach || 0) > 0 && (i.units || 0) > 0));
s4.inventory.push({ material: 'stick', units: 4, name: 'stick' }, { material: 'stone', units: 2, name: 'stone' });
Game.learnRecipe('deadfall', 2);
Game.log.length = 0;
Game.craft('deadfall');
const noBait = say();
note('   no bait: ' + noBait.slice(0, 160));
check('deadfall craft refuses honestly without bait', /bait/i.test(noBait));
s4.inventory.push({ name: 'berries', kcalEach: 30, units: 4, kg: 0.1 });
Game.log.length = 0;
const made = Game.craft('deadfall');
const withBait = say();
note('   with berries: ' + withBait.slice(0, 160));
check('deadfall crafted with food bait', !!made);

// ---------- VERDICTS ----------
note('\n== FEEL VERDICTS ==');
const fails = results.filter(r => !r[1]);
note(`checks: ${results.length - fails.length}/${results.length} green`);
for (const [n] of fails) note('   NEEDS WORK: ' + n);
if (fails.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
