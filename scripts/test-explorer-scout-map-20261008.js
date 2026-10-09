#!/usr/bin/env node
// PROOF TEST (explorer, 2026-10-08): scout reports must show on the world map.
// BREAK: the scout task said "mapped N new areas" and set t.revealed (so
// travelTargets let you walk there) but never called markSeen — the world-map
// overlay still read "Unexplored — you haven't been here." for scout-mapped
// tiles. The log and the map disagreed about what you know.
// FIX: markSeen(nx, ny, 'shared', vid) on scout reveal. 'shared' keeps the
// arrival moment (visited stays false) and the overlay's "someone showed you
// this ground" note matches the scout's report exactly.
// Run: node scripts/test-explorer-scout-map-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
let fails = 0;
const check = (name, ok, detail) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; };

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  say();

  const hx = Game.state.village.px ?? 4, hy = Game.state.village.py ?? 4;
  // ensure some tiles near haven are unrevealed + unseen, then run a real scout
  const cands = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = hx + dx, ny = hy + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    const t = Game.tileAt(nx, ny);
    t.revealed = false; t.visited = false;
    cands.push({ x: nx, y: ny });
  }
  s.seenTiles = { '4,4': { k: 'v' } };
  const vid = Game.data.villagers[1].id;

  // force the scout's reveal rolls to hit
  const origRandom = Math.random;
  Math.random = () => 0.01;
  Game.resolveOneAssignment(vid, { task: 'scout' });
  Math.random = origRandom;
  const msg = say();
  check('scout reported mapping', /mapped \d+ new area/.test(msg), msg.slice(0, 80));

  const mapped = cands.filter(c => Game.tileAt(c.x, c.y).revealed);
  check('scout revealed tiles', mapped.length > 0, `${mapped.length} tiles revealed`);
  // haven itself may already be 'visited' — that must NOT be downgraded
  const onMap = mapped.filter(c => ['shared', 'visited'].includes(Game.mapSeen(c.x, c.y)));
  const sharedOnly = mapped.filter(c => !(c.x === hx && c.y === hy) && Game.mapSeen(c.x, c.y) === 'shared');
  check('scout-mapped tiles show on the world map (shared)', onMap.length === mapped.length,
    `${onMap.length}/${mapped.length} on map`);
  check('non-haven scout tiles are shared, not visited', sharedOnly.length === mapped.length - (mapped.some(c => c.x === hx && c.y === hy) ? 1 : 0));
  const stillUnvisited = mapped.every(c => !Game.tileAt(c.x, c.y).visited);
  check('arrival moment preserved (never marked visited)', stillUnvisited);
  // mapSeen upgrade rule: walking there later must flip shared -> visited
  if (mapped.length) {
    const c = mapped[0];
    Game.markSeen(c.x, c.y, 'visited');
    check('first walk-in upgrades shared -> visited', Game.mapSeen(c.x, c.y) === 'visited');
  }
  console.log(fails ? `\n${fails} FAILURES` : '\nALL GREEN');
  process.exit(fails ? 1 : 0);
})();
