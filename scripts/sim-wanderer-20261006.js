#!/usr/bin/env node
// SPAWN-RATE AUDIT SIM part B (Steve 2026-10-06): the WANDERER system.
// A roaming player (4 tiles/day, random walk on the 7x7 world) from day 1.
// Measure: when the wanderer spawns, day of first contact, respawn behavior.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _s = parseInt(process.argv[2] || '42', 10) >>> 0;
console.log(`seed=${_s}`);
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
Game.say = () => {};

const RUNS = parseInt(process.argv[3] || '120', 10);

(async () => {
  const contactDays = [];   // day of first contact
  const neverBy10 = { n: 0 };
  const wandererIds = {};
  const contactDist = {};   // distance player traveled at contact

  for (let run = 0; run < RUNS; run++) {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar;

    // Find a non-haven starting tile: put player at (3,3).
    Game.map.px = 3; Game.map.py = 3;
    if (Game.map.tiles[3][3].type === 'haven') Game.map.tiles[3][3].type = 'forest_floor';

    let contacted = false, spawnDay = -1, steps = 0;
    for (let day = 1; day <= 10 && !contacted; day++) {
      s.day = day;
      for (let part = 0; part < 4 && !contacted; part++) {
        Game.dayPart = part;
        // random-walk 1 tile (N/E/S/W clamp)
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
        Game.map.px = Math.max(0, Math.min(6, Game.map.px + dx));
        Game.map.py = Math.max(0, Math.min(6, Game.map.py + dy));
        steps++;
        // keep the monster slot clear so encounters don't block; count contacts via wanderer removal
        s.monster = null;
        Game.checkEncounter();
        s.monster = null;
        Game.moveWanderer();
        if (!Game.wanderer && Game.encounterDone && spawnDay === -1) { /* never */ }
        // wanderer contact sets encounterDone=true AND wanderer=null
        if (Game.encounterDone && !Game.wanderer) {
          // it must have contacted (spawn sets wanderer non-null)
          contacted = true; contactDays.push(day);
          break;
        }
        if (Game.wanderer && spawnDay === -1) {
          spawnDay = day;
          wandererIds[Game.wanderer.monsterId] = (wandererIds[Game.wanderer.monsterId] || 0) + 1;
        }
      }
    }
    if (!contacted) neverBy10.n++;
    else contactDist[steps] = (contactDist[steps] || 0) + 1;
  }

  contactDays.sort((a, b) => a - b);
  const avg = contactDays.reduce((a, b) => a + b, 0) / (contactDays.length || 1);
  console.log(`\nruns=${RUNS}, contacted by day 10: ${contactDays.length} (${(contactDays.length / RUNS * 100).toFixed(0)}%), never: ${neverBy10.n}`);
  console.log(`contact day: min=${contactDays[0] ?? '—'} median=${contactDays[Math.floor(contactDays.length / 2)] ?? '—'} mean=${avg.toFixed(1)} max=${contactDays[contactDays.length - 1] ?? '—'}`);
  console.log('wanderer monster ids:', Object.entries(wandererIds).map(([k, v]) => `${k}:${v}`).join(' '));
})();
