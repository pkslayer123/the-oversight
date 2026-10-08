#!/usr/bin/env node
// REGRESSION TEST (2026-10-08, explorer loop): map-overlay info + travelDest cleanup.
//   1. TILE_NAME covers every tile type the map generator can produce, so the
//      map-overlay tile info (app.js mapoverlay handler, now using
//      S.TILE_NAME[tl.type]) never shows a raw id like "forest_floor".
//   2. Game.travelDest does not exist: the compass "destination" block and the
//      overlay travel-dest highlight were removed as dead code (2026-10-08).
//      If a real destination system is ever built, update this test deliberately.
//   3. Fog strictness at spawn: only the haven node is map-known; neighbors
//      are null (no free adjacency reveal).
// Seeded RNG installed BEFORE eval (modules capture Math.random at load).
// Run: node scripts/test-explorer-map-20261008.js [SEED]
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/the-scattering';
const ROOT = '/tmp/explorer-head-1008';
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
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/build.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

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
  console.log('=== test-explorer-map-20261008 ===');

  // 1. TILE_NAME covers every generated tile type
  const types = new Set();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t && t.type) types.add(t.type);
  }
  const missing = [...types].filter(t => !(S.TILE_NAME && S.TILE_NAME[t]));
  check('TILE_NAME covers all map tile types', missing.length === 0,
    missing.length ? `missing: ${missing.join(',')} (types: ${[...types].join(',')})` : `types: ${[...types].join(',')}`);
  // the overlay expression must resolve to the pretty name, never the raw id
  for (const t of types) {
    const shown = (S.TILE_NAME && S.TILE_NAME[t]) || t;
    if (shown === t && /_/.test(t)) { check(`pretty name for "${t}"`, false, 'falls back to raw id'); break; }
  }
  check('no raw-id fallback for underscore types', [...types].every(t => ((S.TILE_NAME || {})[t] || t) !== t || !/_/.test(t)));

  // 2. travelDest is gone (dead-code cleanup 2026-10-08)
  check('Game.travelDest does not exist', typeof Game.travelDest === 'undefined',
    `typeof=${typeof Game.travelDest}`);
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src/js/app.js'), 'utf8');
  check('app.js has no live travelDest references', !/Game\.travelDest/.test(appSrc),
    'stale reference remains');

  // 3. fog strictness at spawn
  const seen = Object.keys(Game.state.scholar.seenTiles || {});
  check('spawn knows haven node only', seen.length === 1 && seen[0] === '4,4', `seen=${seen.join('|')}`);
  let neighSeen = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Game.mapSeen(4 + dx, 4 + dy)) neighSeen++;
  check('no free adjacency reveal', neighSeen === 0, `${neighSeen} neighbors known`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
