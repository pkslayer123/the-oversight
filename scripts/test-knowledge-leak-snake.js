// Knowledge-leak regression: species names must never reach the player pre-knowledge.
// Bug class (Steve's standing law): "if you don't know, it doesn't show."
// Found: gray_rat_snake's `unknown` descriptor leaked "snake" (a word of its
// true name "Gray Rat Snake"). Fixed in src/data/animals.json by rewriting to
// "a thick gray coil across the trail — frozen, head raised an inch, tasting
// the air. Rattler until proven otherwise" (tone borrowed from the
// timber_rattlesnake sibling; the defensive "rattler" misidentification is the
// fiction's honest-ignorance beat, corrected at knowledge level 1).
// Usage: node scripts/test-knowledge-leak-snake.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  Game.log = [];
  return s;
}

(async () => {
  await Game.init();

  const snake = Game.data.animals.find(a => a.id === 'gray_rat_snake');

  // --- 1. The leak case, pre-knowledge ---
  {
    const s = freshGame();
    ok('snake unknown descriptor exists', snake.unknown && snake.unknown.length > 5);
    ok('snake pre-knowledge shows unknown, not description',
      Game.encDescribeAnimal(snake) === snake.unknown && Game.encDescribeAnimal(snake) !== snake.description);
    ok('snake unknown has no "snake"', !/snake/i.test(Game.encDescribeAnimal(snake)));
    ok('snake unknown still hints (coil, trail, tasting the air)',
      /coil|trail|tasting/i.test(Game.encDescribeAnimal(snake)));
    // the ignorant defensive beat is fiction, not a leak: still treated as a rattler
    ok('snake unknown keeps the "rattler until proven otherwise" beat', /rattler/i.test(Game.encDescribeAnimal(snake)));
    // the player's view: movement notice line the spawn path renders
    s.animal = { id: 'gray_rat_snake', mx: 5, my: 5, aware: 0, stamina: 2, pstate: 'graze', edgeTurns: 0 };
    Game.log = [];
    Game.say('Movement — ' + Game.encDescribeAnimal(snake) + '.');
    ok('spawn notice line has no "snake"', !/snake/i.test(Game.log[Game.log.length - 1]));
  }

  // --- 2. Correct reveal post-knowledge (3 encounters teaches the name) ---
  {
    const s = freshGame();
    Game.state.codex.animalEncounters = { gray_rat_snake: 3 };
    ok('snake named post-knowledge', Game.encDescribeAnimal(snake) === snake.description);
    ok('snake description says snake post-knowledge', /snake/i.test(Game.encDescribeAnimal(snake)));
    // a kill identifies immediately
    const s2 = freshGame();
    Game.encIdentifyAnimal('gray_rat_snake');
    ok('snake named after kill-identification', Game.encDescribeAnimal(snake) === snake.description);
  }

  // --- 3. Sibling sweep: NO animal/monster unknown descriptor leaks a true-name word ---
  // (huntText/killText are knowledge-gated by encFleeText/encKillLine, so they may name names;
  //  `tell` is shown ungated next to a gated label, so it must stay name-free too.)
  {
    const STOP = new Set(['white', 'tailed', 'common', 'virginia', 'eastern', 'american', 'gray', 'wild', 'north']);
    const nameWords = (n) => String(n || '').toLowerCase().replace(/-/g, ' ').split(' ')
      .filter(w => w.length > 4 && !STOP.has(w));
    let leak = null;
    for (const a of Game.data.animals) {
      for (const field of ['unknown', 'tell']) {
        const t = a[field];
        if (typeof t !== 'string') continue;
        for (const w of nameWords(a.name)) {
          if (t.toLowerCase().includes(w)) { leak = `animals.${a.id}[${field}]:${w}`; break; }
        }
        if (leak) break;
      }
      if (leak) break;
    }
    ok('no animal unknown/tell true-name word leaks', !leak, leak || '');
    let mleak = null;
    for (const m of (Game.data.monsters || [])) {
      const t = m.unknown;
      if (typeof t !== 'string') continue;
      for (const w of nameWords(m.name || m.id)) {
        if (t.toLowerCase().includes(w)) { mleak = `monsters.${m.id}:${w}`; break; }
      }
      if (mleak) break;
    }
    ok('no monster unknown true-name word leaks', !mleak, mleak || '');
  }

  // --- 4. Sibling gating check: vivid huntText stays earned ---
  {
    const s = freshGame();
    const snakeA = { id: 'gray_rat_snake', mx: 5, my: 5, aware: 1, stamina: 2, pstate: 'graze', edgeTurns: 0 };
    ok('flee narration generic pre-knowledge', Game.encFleeText(snakeA) === 'It bolts!');
    Game.state.codex.animalEncounters = { gray_rat_snake: 3 };
    ok('flee narration vivid post-knowledge', Game.encFleeText(snakeA) === Game.encAnimalDef('gray_rat_snake').huntText);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
