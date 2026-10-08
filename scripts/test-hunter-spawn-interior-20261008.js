#!/usr/bin/env node
// PROOF TEST: checkAnimals spawns on interior tiles only (1..7).
// BEFORE: ax/ay = floor(random*9) — animals could spawn ON the grid edge
// (the flee-by-barrier), reaching the treeline in one bolt so the chase
// never happened.
// AFTER: spawn clamped to 1..7; the animal earns the edge by running.
// Deterministic: seeded RNG, 300 spawn attempts.
// Run: node scripts/test-hunter-spawn-interior-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const results = [];
const check = (name, cond, detail) => { results.push([name, !!cond]); console.log(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  await Game.init();
  console.log('== TEST: spawn interior | SEED ' + SEED + ' ==');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const tiles = Game.map.tiles;
  let best = null;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x];
    if (!t || t.type === 'haven' || t.type === 'ruin') continue;
    const d = Math.abs(x - 3) + Math.abs(y - 3);
    if (d < 2) continue;
    if (!best || d > best.d) best = { x, y, d };
  }
  if (best) { Game.map.px = best.x; Game.map.py = best.y; }
  const s = Game.state.scholar;
  s.insideHaven = false; s.mx = 4; s.my = 4;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));

  let spawns = 0, edgeSpawns = 0, tooClose = 0;
  for (let i = 0; i < 300 && spawns < 60; i++) {
    s.animal = null;
    Game.checkAnimals();
    const a = s.animal;
    if (!a) continue;
    spawns++;
    if (a.mx < 1 || a.mx > 7 || a.my < 1 || a.my > 7) edgeSpawns++;
    const d = Math.max(Math.abs(a.mx - 4), Math.abs(a.my - 4));
    if (d < 3) tooClose++;
  }
  check('spawned animals observed', spawns >= 20, spawns + ' spawns');
  check('no edge spawns (interior 1..7 only)', edgeSpawns === 0, edgeSpawns + ' edge spawns of ' + spawns);
  check('min distance 3 from player kept', tooClose === 0, tooClose + ' too-close of ' + spawns);
  const fails = results.filter(r => !r[1]).length;
  console.log(fails ? `RESULT: FAIL (${fails})` : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
