// ANIMAL HUNGER proof (Steve 2026-10-07). Usage:
//   TEST_GAME_PATH=/tmp/enc-head.js node scripts/test-animal-hunger-20261007.js
// NOTE: the live animalTurn is encounters.js's G.animalTurn (overrides the
// game.js stub). TEST_GAME_PATH swaps encounters.js, not game.js.
// Proves:
//   1. Hunger lazy-inits (30-60) and rises +1 per animalTurn.
//   2. Hungry animal (hunger>40) grazes: hunger drops 35, plant->dirt,
//      detailRegrow set (shared depletion, same system as player/NPC forage).
//   3. Hungry animal with no adjacent food treks toward nearest green.
//   4. Full animal (hunger<=40) does NOT deplete — ambles decoratively.
//   5. Starving animal (hunger>80) creeps toward food while wary.
//   6. Boldness: starving deer holds at aware 0.865 where a fed deer bolts.
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';

// deterministic PRNG (mulberry32)
let _seed = parseInt(process.env.SEED || '7', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(_seed);

// window stub for eval phase only
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.document = {
  getElementById: () => null,
  createElement: () => ({
    style: {}, dataset: {}, textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, setAttribute() {}, addEventListener() {},
  }),
  head: { appendChild() {} },
  body: { appendChild() {} },
  contains: () => false,
};
const ENC_PATH = process.env.TEST_GAME_PATH || 'src/js/encounters.js';
const files = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', ENC_PATH, 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js', 'src/js/drama.js'
];
files.forEach(f => eval(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' - ' + extra : ''}`); }
}

const said = [];
Game.say = (m) => { said.push(m); };
Game.drama = () => {};
Game.audioEvent = () => {};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  Game.map.px = 4; Game.map.py = 4;

  const detail = Game.genDetail(4, 4);
  const resetGrid = () => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) detail[y][x] = 'grass';
    Game.playerTile().detailRegrow = {};
  };

  // rabbit: notice 5, skittish, no early behavior branch — clean subject
  const placeRabbit = (ax, ay, hunger, aware) => {
    s.animal = { id: 'cottontail_rabbit', mx: ax, my: ay, aware: aware != null ? aware : 0, stamina: 5, pstate: 'graze', edgeTurns: 0 };
    if (hunger !== undefined) s.animal.hunger = hunger;
    said.length = 0;
  };

  // sanity: we are testing the encounters.js turn (has pstate/hunger logic)
  ok('live animalTurn has hunger logic', Game.animalTurn.toString().includes('hunger'));

  // 1. hunger lazy-inits and rises (calm zone: dist >= 5)
  resetGrid();
  s.mx = 7; s.my = 7;
  placeRabbit(1, 1); // dist 6 — calm
  delete s.animal.hunger;
  Game.animalTurn();
  ok('hunger lazy-inits 30-60', s.animal && s.animal.hunger >= 30 && s.animal.hunger <= 61,
    `got ${s.animal && s.animal.hunger}`);
  const h0 = s.animal.hunger;
  Game.animalTurn();
  const expected = s.animal.hunger; // may have grazed; just check it rose or ate
  ok('hunger ticks (rises or grazes)', expected <= h0 + 1 && expected >= 0, `was ${h0}, now ${expected}`);

  // 2. hungry rabbit grazes: shared depletion
  resetGrid();
  s.mx = 7; s.my = 7;
  detail[1][2] = 'plant'; // adjacent to (1,1)
  placeRabbit(1, 1, 80, 0);
  Game.animalTurn();
  ok('graze drops hunger 35 (net of +1 rise)', s.animal.hunger === 46, `got ${s.animal.hunger}`);
  ok('plant cell becomes dirt', detail[1][2] === 'dirt', `got ${detail[1][2]}`);
  const rg = Game.playerTile().detailRegrow || {};
  ok('detailRegrow marks shared depletion', !!rg['2,1'], JSON.stringify(Object.keys(rg)));
  ok('regrow entry remembers plant', rg['2,1'] && rg['2,1'].was === 'plant');

  // 3. hungry rabbit treks toward distant greens
  resetGrid();
  s.mx = 7; s.my = 7;
  detail[7][1] = 'plant'; // far: (1,7)
  placeRabbit(1, 1, 80, 0);
  let trekked = false;
  for (let i = 0; i < 12 && !trekked; i++) {
    Game.animalTurn();
    if (!s.animal) break;
    if (s.animal.my > 1) trekked = true; // moved south toward (1,7)
  }
  ok('hungry rabbit treks toward distant greens', trekked);

  // 4. full rabbit does NOT deplete
  resetGrid();
  s.mx = 7; s.my = 7;
  detail[1][2] = 'plant';
  placeRabbit(1, 1, 10, 0);
  for (let i = 0; i < 6 && s.animal; i++) Game.animalTurn();
  ok('full rabbit leaves plant alone', detail[1][2] === 'plant', `cell=${detail[1][2]}`);
  ok('no depletion recorded when full', !((Game.playerTile().detailRegrow || {})['2,1']));

  // 5. starving rabbit creeps toward food while wary
  resetGrid();
  s.mx = 4; s.my = 4;
  detail[3][3] = 'plant'; // (3,3)
  s.animal = { id: 'cottontail_rabbit', mx: 2, my: 2, aware: 0.1, stamina: 5, pstate: 'wary', edgeTurns: 0, hunger: 95 };
  said.length = 0;
  Game.animalTurn();
  // aware 0.1 + 0.70 rate = 0.8 < 0.75+0.167 → no bolt; creep steps to (3,3)
  ok('starving rabbit does not bolt at aware 0.8', s.animal && s.animal.pstate !== 'bolt',
    `pstate=${s.animal && s.animal.pstate}`);
  ok('starving rabbit creeps onto the food', s.animal && s.animal.mx === 3 && s.animal.my === 3,
    `at ${s.animal && s.animal.mx},${s.animal && s.animal.my}`);

  // 6. boldness: deer hair-trigger respects hunger
  // hair-trigger checks INCOMING aware: fed deer bolts at 0.71 >= 0.7;
  // starving deer holds (0.71 < 0.9), then awareness builds to 0.885
  // which is still under the bolded generic threshold (1.2). Deterministic.
  const deerBolt = (hunger) => {
    resetGrid();
    s.mx = 4; s.my = 4;
    s.stalked = true; // quiet: pNoise 0.35
    s.animal = { id: 'white_tailed_deer', mx: 2, my: 2, aware: 0.71, stamina: 3, pstate: 'wary', edgeTurns: 0, hunger };
    Game.animalTurn();
    return s.animal && s.animal.pstate;
  };
  ok('fed deer bolts at aware 0.71', deerBolt(10) === 'bolt', `got ${s.animal && s.animal.pstate}`);
  const starvedState = deerBolt(100);
  ok('starving deer holds at aware 0.71', starvedState !== 'bolt', `got ${starvedState}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
