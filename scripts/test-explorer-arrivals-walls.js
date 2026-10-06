// test-explorer-arrivals-walls.js — regression tests for explorer-loop fixes (2026-10-05).
// 1. Arrival pools: per-type flavor pools; a node rolls once on first visit,
//    keeps it on revisit; ruin tiles keep their generated ruinStory.
// 2. Ruin wall examine: 'Examine' offered on wild ruin walls, first interact
//    says something, repeat is a known-repeat, haven walls stay silent.
// 3. Wary stutter: the wary animal line reads "goes still" — never
//    "a brown blur with a white tail-flag, freezing between hops freezes".
// Usage: node scripts/test-explorer-arrivals-walls.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let rngState = 1234 >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  PASS ${name}`);
  else { fails++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  const said = [];
  const _say = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  said.length = 0;

  console.log('== 1. arrival pools ==');
  const types = ['forest_floor', 'grove', 'meadow', 'thicket', 'wetland', 'creek', 'trail_edge'];
  let seenVariance = 0;
  for (const type of types) {
    const tiles = [{ type }, { type }, { type }];
    const texts = tiles.map(t => Game.arrivalTextFor(t));
    check(`${type}: flavor is non-empty`, texts.every(x => x && x.length > 10));
    check(`${type}: stored on tile`, tiles.every(t => t.arrivalText === Game.arrivalTextFor(t)));
    check(`${type}: stable on revisit`, tiles.every((t, i) => Game.arrivalTextFor(t) === texts[i]));
    if (new Set(texts).size > 1) seenVariance++;
  }
  check('pools actually vary across rolls', seenVariance >= 4, `only ${seenVariance} types varied in 3 rolls`);
  const ffPool = [];
  for (let i = 0; i < 60; i++) ffPool.push(Game.arrivalTextFor({ type: 'forest_floor' }));
  check('original forest_floor copy still in pool', ffPool.some(x => x.includes('The woods, being the woods.')));
  check('ruin: ruinStory wins', Game.arrivalTextFor({ type: 'ruin', ruinStory: 'A collapsed barn.' }) === 'A collapsed barn.');
  check('ruin: no ruinStory -> empty', Game.arrivalTextFor({ type: 'ruin' }) === '');
  check('unknown type -> empty', Game.arrivalTextFor({ type: 'nonsense' }) === '');

  console.log('== 2. ruin wall examine ==');
  let ruinXY = null;
  for (let y = 0; y < 7 && !ruinXY; y++) for (let x = 0; x < 7 && !ruinXY; x++) {
    if (Game.map.tiles[y][x].type === 'ruin') ruinXY = [x, y];
  }
  check('a ruin tile exists on the map', !!ruinXY);
  if (ruinXY) {
    Game.map.px = ruinXY[0]; Game.map.py = ruinXY[1];
    const t = Game.playerTile();
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    let wx = -1, wy = -1;
    for (let cy = 0; cy < 9 && wx < 0; cy++) for (let cx = 0; cx < 9 && wx < 0; cx++) {
      if (detail[cy][cx] === 'wall') { wx = cx; wy = cy; }
    }
    check('ruin detail has a wall cell', wx >= 0, 'no wall found in this seed');
    if (wx >= 0) {
      Game.state.scholar.mx = Math.max(0, wx - 1); Game.state.scholar.my = wy;
      const acts = Game.cellActions(wx, wy) || [];
      check('wall offers Examine', acts.includes('Examine'), 'got: ' + acts.join(','));
      said.length = 0;
      Game.cellInteract(wx, wy);
      const first = said.join(' | ');
      check('first examine says something', first.trim().length > 20, JSON.stringify(first.slice(0, 80)));
      said.length = 0;
      Game.cellInteract(wx, wy);
      const second = said.join(' | ');
      check('repeat is a known-repeat', /already/i.test(second), JSON.stringify(second.slice(0, 80)));
      check('repeat is not the full flavor again', second !== first);
    }
  }
  Game.map.px = 3; Game.map.py = 3;
  const acts2 = Game.cellActions(0, 0) || [];
  check('haven wall offers no Examine', !acts2.includes('Examine'), 'got: ' + acts2.join(','));

  console.log('== 3. wary stutter ==');
  Game.map.px = 2; Game.map.py = 2;
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.animal = null; s.monster = null;
  const detail2 = Game.genDetail(Game.map.px, Game.map.py);
  detail2[4][4] = 'grass'; detail2[4][7] = 'grass';
  s.animal = { id: 'cottontail_rabbit', mx: 7, my: 4, aware: 0.499, stamina: 5, pstate: 'graze', edgeTurns: 0 };
  said.length = 0;
  try { Game.animalTurn(); } catch (e) { /* errors surface via say capture */ }
  const out = said.join(' | ');
  const waryLine = said.find(x => /ears up, deciding about you/.test(x));
  check('wary line fired', !!waryLine, 'said: ' + out.slice(0, 120));
  if (waryLine) {
    check('wary line uses "goes still"', /goes still/.test(waryLine), waryLine);
    check('no template "freezes" duplication', !/freezes\b/i.test(waryLine), waryLine);
    check('descriptor + template read clean', !/freezing between hops freezes/.test(waryLine), waryLine);
  }

  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
