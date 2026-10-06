// MAP OVERHAUL PROOF (Steve 2026-10-06):
// 1. Player renders as their villager sprite on grid + world map — no markers.
// 2. Fog of war: map shows ONLY visited + map-shared tiles.
// 3. Compare maps merges villager visited into player shared knowledge.
// 4. Codex shows the village cumulative map.
// 5. Tile scenes module composes/caches/invalidates.
// Run: node scripts/test-map-overhaul-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
(function seed(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(20261006);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/sprites.js', 'src/js/tile-scenes.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const CSS_SRC = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
const CONVO_SRC = fs.readFileSync(path.join(ROOT, 'src/js/conversation.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---------- 1. Player rendering: no special markers ----------
check('no data-you marker in renderMap', !APP_SRC.includes('data-you='));
check('no you-are-here aria label', !APP_SRC.includes('aria-label="You are here"'));
check('no youface arrow class', !APP_SRC.includes('youface'));
check('no pmark player ring', !APP_SRC.includes('class="pmark'));
check('no facing wedge pdir', !APP_SRC.includes('class="pdir"') && !APP_SRC.includes('pdir'));
check('no generic person emoji for player', !/data-ent="me"><span class="ptoken">🧑/.test(APP_SRC));
check('player uses villagerSpriteHtml on grid', /data-ent="me".*villagerSpriteHtml|villagerSpriteHtml\(meVp\)/.test(APP_SRC));
check('player uses villager sprite on world map', /meSpr\?`<span class="mface msprite">/.test(APP_SRC) || /mface msprite/.test(APP_SRC));
check('CSS: no minimap tile.me pulse', !/\.minimap \.tile\.me\s*\{/.test(CSS_SRC));
check('CSS: no mepulse keyframes', !CSS_SRC.includes('@keyframes mepulse'));
check('CSS: no cell.me cyan outline block', !/\.cell\.me\s*\{\s*\n?\s*outline: 3px solid #4df3ff/.test(CSS_SRC));
check('CSS: no pmark styles', !CSS_SRC.includes('.cell.me .pmark'));
check('CSS: telegraph rings retargeted to vent', CSS_SRC.includes('.cell.me .vent.diveTarget') || APP_SRC.includes('.cell.me .vent.diveTarget'));

// ---------- 2. Fog of war: markSeen / mapSeen ----------
Game.state = Game.state || {};
Game.state.scholar = Game.state.scholar || {};
Game.state.scholar.seenTiles = {};
Game.state.village = Game.state.village || {};
Game.data = Game.data || {};
Game.data.villagers = [];
Game.data.background_survivors = [];

check('mapSeen null when unseen', Game.mapSeen(2, 2) === null);
Game.markSeen(3, 3, 'visited');
check('mapSeen visited after markSeen', Game.mapSeen(3, 3) === 'visited');
Game.markSeen(4, 3, 'shared', 'vil_1');
check('mapSeen shared after share', Game.mapSeen(4, 3) === 'shared');
check('unvisited tile still hidden', Game.mapSeen(0, 0) === null);
Game.markSeen(4, 3, 'visited'); // visited beats shared
check('visited beats shared', Game.mapSeen(4, 3) === 'visited');

// ---------- 3. Villager maps + compare ----------
Game.data.villagers = [
  { id: 'vil_1', name: 'Test One', gender: 'f', age: 30, skinTone: 'tan', origin: 'x', clothing: 'casual' },
  { id: 'vil_2', name: 'Test Two', gender: 'm', age: 40, skinTone: 'brown', origin: 'y', clothing: 'work' },
];
Game.state.village.px = 3; Game.state.village.py = 3;
Game.seedVillagerMaps();
for (const v of Game.data.villagers) {
  check(v.id + ' has visitedTiles', Array.isArray(v.visitedTiles) && v.visitedTiles.length >= 3, JSON.stringify(v.visitedTiles));
  check(v.id + ' knows haven', v.visitedTiles.includes('3,3'));
}
Game.state.scholar.seenTiles = { '3,3': { k: 'v' } };
const before = Object.keys(Game.state.scholar.seenTiles).length;
const cmp = Game.compareMaps('vil_1');
check('compareMaps returns newCount', typeof cmp.newCount === 'number');
const after = Object.keys(Game.state.scholar.seenTiles).length;
check('compareMaps grows seenTiles', after >= before && cmp.newCount === after - before, `${before} -> ${after}`);
check('shared tiles marked shared', Object.entries(Game.state.scholar.seenTiles).some(([k, e]) => e.k === 's' && e.by === 'vil_1'));
const cmp2 = Game.compareMaps('vil_1');
check('second compare adds nothing new', cmp2.newCount === 0);

// ---------- 4. Conversation action exists ----------
check('compare_maps choice offered', CONVO_SRC.includes("id: 'compare_maps'"));
check('compare_maps label defined', CONVO_SRC.includes('compare_maps: {'));
check('compare_maps handler calls compareMaps', CONVO_SRC.includes("choiceId === 'compare_maps'") && CONVO_SRC.includes('this.compareMaps(vid)'));
check('compare_maps in ontology', CONVO_SRC.includes('compare_maps'));

// ---------- 5. Codex village map ----------
check('codex has MAPS section', APP_SRC.includes('VILLAGE MAP') && APP_SRC.includes('villageMapSection'));
check('codex map unions villager visited', APP_SRC.includes('vp.visitedTiles'));

// ---------- 6. renderMap uses seen, blank when unseen ----------
check('renderMap uses mapSeen', APP_SRC.includes('Game.mapSeen ? Game.mapSeen(x, y)'));
check('unseen tiles render blank', /else if \(!seen\) \{\s*\n?\s*g = ''/.test(APP_SRC));
check('no question-mark fog glyph', !/tl\.revealed \? S\.TILE_GLYPH\[tl\.type\] : '\?'/.test(APP_SRC));
check('shared tiles get shared class', APP_SRC.includes("shrCls") && APP_SRC.includes("' shared'"));
check('tile scenes integrated', APP_SRC.includes('Scattering.TileScenes') && APP_SRC.includes('TS.svgFor'));

// ---------- 7. Tile scenes module ----------
check('TileScenes exposed', !!S.TileScenes && typeof S.TileScenes.svgFor === 'function');
const blank = S.TileScenes.svgFor(0, 0, { seen: null });
check('unseen tile is blank SVG', blank.includes('<svg') && !blank.includes('rect') || blank.includes('#0d120d'));
const seen1 = S.TileScenes.svgFor(3, 3, { seen: 'visited' });
const seen2 = S.TileScenes.svgFor(3, 3, { seen: 'visited' });
check('cache hit returns identical', seen1 === seen2);
S.TileScenes.invalidate(3, 3);
const seen3 = S.TileScenes.svgFor(3, 3, { seen: 'visited' });
check('invalidate forces re-render (valid SVG)', seen3.includes('<svg'));
check('touch exists', typeof S.TileScenes.touch === 'function');

// ---------- 8. Game ontology updated ----------
const GAME_SRC = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
check('game ontology lists mapSeen', GAME_SRC.includes('mapSeen(x, y)'));
check('game ontology lists compareMaps', GAME_SRC.includes('compareMaps(vid)'));
check('game ontology has map_is_seen_only rule', GAME_SRC.includes('map_is_seen_only'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
