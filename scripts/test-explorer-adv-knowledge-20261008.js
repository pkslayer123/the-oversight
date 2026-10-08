#!/usr/bin/env node
// ADVERSARIAL (explorer loop 2026-10-08): map-knowledge attack surface.
//   V1. compareMaps free-map: villager visitedTiles bounded to seed (haven±2)?
//       Repeated conversations must never grow the player's map beyond the union.
//   V2. tileInfo ruin branch: loot state ('cans left' vs 'picked clean') must not
//       leak for a tile merely revealed (scout report / distant glimpse) — only visited.
// Seeded RNG installed BEFORE eval (modules capture Math.random at load).
// Run: node scripts/test-explorer-adv-knowledge-20261008.js [SEED]
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/worktrees/playtest-explorer';
const SEED = parseInt(process.argv[2] || process.env.SEED || '20261008', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WS, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(WS, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`   [OK] ${name}`); }
  else { fail++; console.log(`   [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  console.log('=== test-explorer-adv-knowledge-20261008 (seed ' + SEED + ') ===');
  const v = Game.state.village;
  const hx = (v && v.px !== undefined) ? v.px : 4, hy = (v && v.py !== undefined) ? v.py : 4;
  const all = (Game.data.villagers || []).concat(Game.data.background_survivors || []);

  // V1a: villager map seeds are bounded to haven±2
  let bad = [];
  for (const vp of all) {
    const tiles = vp.visitedTiles || [];
    if (tiles.length > 7) bad.push(vp.id + ':count=' + tiles.length);
    for (const k of tiles) {
      const [x, y] = k.split(',').map(Number);
      if (Math.abs(x - hx) > 2 || Math.abs(y - hy) > 2) bad.push(vp.id + ':' + k);
    }
  }
  check('V1a villager map seeds bounded to haven±2 (<=7 tiles)', bad.length === 0,
    bad.length ? bad.slice(0, 5).join(' ') : `${all.length} villagers seeded`);

  // V1b: exploit attempt — merge every villager's map repeatedly.
  // A hostile player camps at Haven talking to everyone: map gain must be
  // bounded by the seeded union, and rounds 2+ must yield zero.
  const union = new Set();
  for (const vp of all) for (const k of (vp.visitedTiles || [])) union.add(k);
  let total = 0, roundGains = [];
  for (let round = 0; round < 3; round++) {
    let gained = 0;
    for (const vp of all) { gained += Game.compareMaps(vp.id).newCount; }
    roundGains.push(gained); total += gained;
  }
  check('V1b compareMaps total gain bounded by seeded union', total <= union.size,
    `gained=${total} union=${union.size}`);
  check('V1b rounds 2-3 yield nothing new', roundGains[1] === 0 && roundGains[2] === 0,
    `rounds=${roundGains.join(',')}`);
  // V1c: villager maps never grow post-seed (no writer exists outside seedVillagerMaps)
  const src = fs.readFileSync(path.join(WS, 'src/js/game.js'), 'utf8');
  const writers = (src.match(/\.visitedTiles\s*=/g) || []).length;
  check('V1c no post-seed writer to villager visitedTiles', writers === 1,
    `assignments=${writers}`);

  // V2: ruin loot-state leak on revealed-but-unvisited tile.
  let rx = -1, ry = -1;
  outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    // any ruin the player has not stood on (distance irrelevant — the gate is visited, not far)
    if (t && t.type === 'ruin' && !t.visited && !(x === Game.map.px && y === Game.map.py)) { rx = x; ry = y; break outer; }
  }
  check('V2 found a distant unvisited ruin to probe', rx >= 0, rx >= 0 ? `(${rx},${ry})` : 'no ruin far enough');
  if (rx >= 0) {
    // scout-style reveal: report on the map, never a visit
    Game.tileAt(rx, ry).revealed = true;
    const info = Game.tileInfo(rx, ry);
    const leaks = /cans left|picked clean/i.test(info.text);
    check('V2 FIXED: unvisited revealed ruin hides loot state', !leaks, `text="${info.text}"`);
    check('V2 unvisited ruin still honest (not silent)', /haven't worked this ground|no idea/i.test(info.text),
      `text="${info.text}"`);
    // visited ruin: loot state is earned knowledge
    Game.tileAt(rx, ry).visited = true;
    const info2 = Game.tileInfo(rx, ry);
    check('V2 visited ruin reports loot state', /cans left|picked clean/i.test(info2.text),
      `text="${info2.text}"`);
    // unrevealed tile: still the fog gate
    let ux = -1, uy = -1;
    outer2: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (!Game.tileAt(x, y).revealed) { ux = x; uy = y; break outer2; }
    }
    if (ux >= 0) {
      const info3 = Game.tileInfo(ux, uy);
      check('V2 unrevealed tile stays fog', info3.name === 'Unknown ground', `name="${info3.name}"`);
    }
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
