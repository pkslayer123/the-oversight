#!/usr/bin/env node
// SPAWN-FEEL PLAYTEST (Steve 2026-10-06): 3 days of travel as a day-one
// character with no abilities. Step-by-step hops (1 hop = 1 tile entry =
// 1 encounter roll, matching the game's model). Judge FEEL: dangerous?
// boring? unfair? thickets scary / meadows safe? same monsters again?
// night vs day? Monster spawns are logged then cleared ("backed off") —
// this audit is about SPAWN feel, not combat.
// Run: node scripts/play-spawn-feel-20261006.js [seed]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _s = parseInt(process.argv[2] || '7', 10) >>> 0;
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

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };

const PART_NAME = ['DAWN', 'MIDDAY', 'DUSK', 'NIGHT'];
const mdefById = {};
let entries = 0, encounters = 0, animals = 0;
const seenMonsters = {};
const encounterLog = [];

function nearestTileOf(type, exclude = null) {
  let best = null, bd = 1e9;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const tt = Game.map.tiles[y][x];
    if (tt.type !== type) continue;
    if (exclude && exclude.some(e => e.x === x && e.y === y)) continue;
    const d = Math.abs(x - Game.map.px) + Math.abs(y - Game.map.py);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

// one hop toward dest (up to 3 tiles per travelTo = 1 entry)
function hopToward(dest) {
  const cands = Game.travelTargets().filter(t => !(t.x === Game.map.px && t.y === Game.map.py));
  if (!cands.length) return false;
  const d0 = Math.abs(dest.x - Game.map.px) + Math.abs(dest.y - Game.map.py);
  cands.sort((a, b) =>
    (Math.abs(dest.x - a.x) + Math.abs(dest.y - a.y)) - (Math.abs(dest.x - b.x) + Math.abs(dest.y - b.y)));
  for (const c of cands) {
    const d1 = Math.abs(dest.x - c.x) + Math.abs(dest.y - c.y);
    if (d1 >= d0) continue;
    says.length = 0;
    const before = `${Game.map.px},${Game.map.py}`;
    const r = Game.travelTo(c.x, c.y, true); // force: skip blockage puzzles in this audit
    // NOTE: travelTo returns undefined on success; a blockage object when blocked.
    if (`${Game.map.px},${Game.map.py}` !== before) {
      entries++;
      afterEntry();
      return true;
    }
  }
  return false;
}

function afterEntry() {
  const s = Game.state.scholar;
  const tile = Game.map.tiles[Game.map.py][Game.map.px];
  let note = '';
  if (s.animal) {
    animals++;
    note += ` [animal: ${s.animal.id}]`;
    for (const t of says.splice(0)) if (/movement/i.test(t)) console.log(`        > ${t.slice(0, 130)}`);
    s.animal = null;
  }
  if (s.monster) {
    encounters++;
    const md = mdefById[s.monster.id] || {};
    seenMonsters[s.monster.id] = (seenMonsters[s.monster.id] || 0) + 1;
    encounterLog.push(`${PART_NAME[Game.dayPart]} day ${s.day}: ${s.monster.id} (${md.activity}) in ${tile.type}`);
    console.log(`      !! MONSTER: ${s.monster.id} (${md.activity || '?'}) — stepped into ${tile.type} at ${PART_NAME[Game.dayPart]}`);
    for (const t of says.splice(0)) if (/something moves|Something big/i.test(t)) console.log(`        > ${t.slice(0, 130)}`);
    s.monster = null; // backed off — spawn audit, not combat
  }
  if (Game.wanderer && Game.map.px === Game.wanderer.x && Game.map.py === Game.wanderer.y) {
    console.log(`      !! WANDERER TILE (${Game.wanderer.monsterId}) — contact`);
  }
}

function walkTo(dest, label) {
  if (!dest) { console.log(`   ${label}: no such tile`); return; }
  let guard = 0;
  while ((Game.map.px !== dest.x || Game.map.py !== dest.y) && guard++ < 12) {
    if (!hopToward(dest)) break;
  }
  const tile = Game.map.tiles[Game.map.py][Game.map.px];
  console.log(`   ${label} -> now in ${tile.type} @(${Game.map.px},${Game.map.py})`);
}

(async () => {
  await Game.init();
  for (const m of Game.data.monsters) mdefById[m.id] = m;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  // known world for this audit (fog exploration is a separate question)
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) Game.map.tiles[y][x].revealed = true;

  console.log(`\nI am ${Game.generatedRoster[0].name}. Day one. No abilities. Walking the wilds.\n`);

  const thickets = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++)
    if (Game.map.tiles[y][x].type === 'thicket') thickets.push({ x, y });

  const plan = [
    [1, 0, () => nearestTileOf('thicket'), 'push into the dark trees for greens'],
    [1, 1, () => nearestTileOf('meadow'), 'cross the open meadow, feeling exposed'],
    [1, 2, () => nearestTileOf('ruin'), 'poke through the old ruin for salvage'],
    [1, 3, () => nearestTileOf('haven'), 'hurry home before full dark'],
    [2, 0, () => nearestTileOf('wetland'), 'check the wetland at first light'],
    [2, 1, () => nearestTileOf('creek'), 'follow the creek for water'],
    [2, 2, () => nearestTileOf('grove'), 'the grove at dusk, last forage'],
    [2, 3, () => nearestTileOf('haven'), 'home for the night'],
    [3, 0, () => thickets[0], 'back to the thicket — the woods felt wrong yesterday'],
    [3, 1, () => thickets[1] || thickets[0], 'deeper in, eyes open (wanderer is out there)'],
    [3, 2, () => nearestTileOf('forest_floor'), 'cut across the forest floor'],
    [3, 3, () => nearestTileOf('haven'), 'home'],
  ];

  for (const [day, part, destFn, intent] of plan) {
    if (part === 0) console.log(`=== DAY ${day} ===`);
    Game.dayPart = part; s.day = day;
    if (day >= 7) Game.state.systemArrived = true;
    console.log(` ${PART_NAME[part]} — ${intent}`);
    walkTo(destFn(), 'walk');
    if (part === 3) { try { Game.sleep(); } catch (e) {} }
  }

  console.log(`\n=== 3-DAY TALLY ===`);
  console.log(`tile entries: ${entries}, monster encounters: ${encounters} (${(encounters / entries * 100).toFixed(1)}%), animal sightings: ${animals}`);
  console.log(`monsters met: ${Object.entries(seenMonsters).map(([k, v]) => `${k}x${v}`).join(', ') || '(none)'}`);
  for (const l of encounterLog) console.log(`  ${l}`);
  console.log(`wanderer spawned: ${!!Game.wanderer}, contact happened (encounterDone): ${Game.encounterDone}`);
})();
