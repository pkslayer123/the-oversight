// DRIFTER playtest run 2026-10-05 (17:30 CDT): JOIN AND STAY.
// The arc: leave home, JOIN a distant village, live their loop for days,
// then leave and return. Questions:
//  1. While joined away, does your production still feed HOME's pot while you
//     eat from THEIR pantry? (double-dip check)
//  2. Exiled from home -> join strangers -> is the home exile magically healed?
//  3. Starving at the joined fire: what does the meal do/say?
//  4. Return home: does anyone notice you were gone? Teaching moment? Gossip?
// Usage: node scripts/playtest-drifter-joinstay.js [--seed N]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js', 'src/js/justice.js', 'src/js/membership.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const Game = globalThis.Scattering.Game;

let seed = 7;
const argSeed = (process.argv.find(a => a.startsWith('--seed')) || '').split('=')[1];
if (argSeed) seed = parseInt(argSeed, 10);
let rngState = seed >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

const allSaid = [];
let logMark = 0;
function freshLines() { const l = allSaid.slice(logMark); logMark = allSaid.length; return l; }
function beat(title) {
  console.log('\n' + '='.repeat(64));
  console.log('  ' + title);
  console.log('='.repeat(64));
  for (const l of freshLines()) console.log('  | ' + (l || '').toString().slice(0, 220));
}
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

function walkTo(tx, ty) {
  let cx = Game.map.px, cy = Game.map.py, legs = 0;
  while (cx !== tx || cy !== ty) {
    const nx = cx !== tx ? cx + Math.sign(tx - cx) : cx;
    const ny = cx === tx ? cy + Math.sign(ty - cy) : cy;
    Game.reveal(nx, ny); Game.reveal(cx, cy);
    Game.map.px = cx; Game.map.py = cy;
    Game.travelTo(nx, ny, true);
    legs++; cx = nx; cy = ny;
    if (legs > 40) break;
  }
  return legs;
}

(async () => {
  await Game.init();
  const _say = Game.say.bind(Game);
  Game.say = (m) => { allSaid.push(m); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 4000; s.health = 100; s.hydration = 100; s.exiled = false;
  freshLines();

  const villages = Game.state.otherVillages || [];
  const target = villages.slice().sort((a, b) => manhattan(3, 3, a.x, a.y) - manhattan(3, 3, b.x, b.y))[0];
  console.log(`seed ${seed}. nearest other village: ${target.name} @ (${target.x},${target.y}), dist ${manhattan(3,3,target.x,target.y)}`);
  console.log(`home pantry start: ${Math.round(Game.state.village.pantryKcal || 0)} kcal`);

  // ===== ACT 1: live at home 3 days, fed =====
  for (let d = 0; d < 3; d++) {
    Game.state.village.pantryKcal = Math.max(Game.state.village.pantryKcal || 0, 20000);
    s.kcal = 4000; s.hydration = 100; if (s.health < 100) s.health = 100;
    Game.endDay();
  }
  const homePantryD3 = Math.round(Game.state.village.pantryKcal || 0);
  beat(`ACT 1 — day ${s.day} at home. Leaving.`);

  // ===== ACT 2: walk out, join them =====
  walkTo(target.x, target.y);
  console.log(`  arrived day ${s.day}, target pantryKcal ${Math.round(target.pantryKcal)}`);
  Game.joinVillage(target.id);
  beat('ACT 2 — joined');
  console.log(`  joinedVillage=${s.joinedVillage}, homePantry=${Math.round(Game.state.village.pantryKcal || 0)}`);

  // ===== ACT 3: live THEIR loop for 5 days =====
  const jvPantry0 = Math.round(target.pantryKcal);
  const homePantryJ0 = Math.round(Game.state.village.pantryKcal || 0);
  for (let d = 0; d < 5; d++) {
    s.kcal = 500; // wake hungry each day, eat only their meal
    s.hydration = 100; if (s.health < 100) s.health = 100;
    Game.endDay();
    console.log(`  day ${s.day}: my kcal=${Math.round(s.kcal)}, their pantry=${Math.round(target.pantryKcal)}, home pantry=${Math.round(Game.state.village.pantryKcal || 0)}`);
    if (Game.over) { console.log('  GAME OVER during join-stay'); break; }
  }
  beat('ACT 3 — five days as one of them (meal lines above ^)');
  console.log(`  THEIR pantry: ${jvPantry0} -> ${Math.round(target.pantryKcal)} (delta ${Math.round(target.pantryKcal) - jvPantry0})`);
  console.log(`  HOME pantry:  ${homePantryJ0} -> ${Math.round(Game.state.village.pantryKcal || 0)} (delta ${Math.round(Game.state.village.pantryKcal || 0) - homePantryJ0})`);

  // ===== ACT 4: starve at their fire =====
  target.pantryKcal = 0;
  s.kcal = 500;
  Game.endDay();
  beat('ACT 4 — joined, their pantry empty (meal line above ^)');
  console.log(`  day ${s.day}, my kcal=${Math.round(s.kcal)}`);

  // ===== ACT 5: leave, return home =====
  Game.leaveVillage();
  console.log(`  after leave: joinedVillage=${s.joinedVillage}`);
  walkTo(3, 3);
  beat('ACT 5 — walked home');
  console.log(`  day ${s.day}, home pantry=${Math.round(Game.state.village.pantryKcal || 0)}`);
  console.log(`  home trust entries: ${JSON.stringify(Object.keys(Game.state.village.trust || {}).length)} ids, gossip events=${(Game.state.gossip || []).length}`);

  // ===== ACT 6: exile-then-join probe =====
  // force exile at home, then join strangers again: does home exile heal?
  s.exiled = true;
  try { Game.severMembership(Game.villagerId, 'exile'); } catch (e) { console.log('  severMembership threw:', e.message); }
  console.log(`  exiled set: scholar.exiled=${s.exiled}, severed=${JSON.stringify(Object.keys((Game.state.village.severed || {})))}`);
  walkTo(target.x, target.y);
  Game.joinVillage(target.id);
  console.log(`  after joining ${target.name} while exiled:`);
  console.log(`    scholar.exiled=${s.exiled}, severed=${JSON.stringify(Object.keys((Game.state.village.severed || {})))}, codexCut=${s.codexCut}`);
  beat('ACT 6 — exile-then-join probe');
  console.log('\nDONE.');
})().catch(e => { console.error('CRASH:', e.message, '\n', e.stack.split('\n').slice(0, 8).join('\n')); process.exit(1); });
