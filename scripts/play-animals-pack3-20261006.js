// PLAYTEST as a player (Steve 2026-10-06): animal pack 3 — hunting/flee/
// butchering deepening. Honest runs, real randomness except where a kill is
// forced for the kill-text showcase. Turn hygiene per AGENTS.md:
// stalkAnimal()/huntAnimal() already advance the animal — never
// double-advance. Movement stays on interior tiles (1..7).
// Usage: node scripts/play-animals-pack3-20261006.js
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

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function spawn(s, id, mx, my) {
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  return s.animal;
}
function bow(s) {
  const def = Game.data.items.find(i => i.id === 'crude_bow');
  s.inventory.push({ itemId: 'crude_bow', name: def.name, units: 1 });
  s.equipped = { weapon: { itemId: 'crude_bow', name: def.name } };
}
function drain(label) {
  const l = Game.log.join('\n');
  Game.log = [];
  if (l.trim()) console.log(`  ${label}: ${l.split('\n').map(x => x.trim()).filter(Boolean).join(' | ').slice(0, 460)}`);
}
function status(s, tag) {
  const a = s.animal;
  console.log(`  [${tag}] hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} animal=${a ? a.id + '@' + a.mx + ',' + a.my + ' ' + a.pstate + ' aware=' + (a.aware || 0).toFixed(2) : 'GONE'}`);
}
function creekGrid() {
  const g = flatGrid(); g[4][6] = 'water'; g[5][6] = 'creek'; return g;
}

(async () => {
  await Game.init();

  // ---- CHUB: miss -> hides -> blocked strike -> wait -> re-emerge -> kill ----
  {
    console.log('\n=== CREEK CHUB (the creek keeps its own) ===');
    const s = freshGame(); bow(s);
    Game.genDetail = creekGrid;
    spawn(s, 'creek_chub', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk'); status(s, 'stalked');
    // force a clean miss
    const rr = Math.random; Math.random = () => 0.999;
    Game.huntAnimal(); Math.random = rr;
    drain('miss'); status(s, 'after miss');
    Game.huntAnimal(); drain('strike while hiding'); status(s, 'blocked?');
    for (let i = 0; i < 3 && s.animal; i++) { Game.animalTurn(); drain('wait ' + (i + 1)); }
    status(s, 're-emerged?');
    if (s.animal) { // finish it — force the kill for the kill-text read
      const rr2 = Math.random; Math.random = () => 0.0;
      Game.huntAnimal(); Math.random = rr2;
      drain('kill'); status(s, 'after kill');
    }
  }

  // ---- MUSKRAT: dive-happy near water (unknown, then known) ----
  {
    console.log('\n=== MUSKRAT (dive-happy, unknown) ===');
    const s = freshGame(); bow(s);
    Game.genDetail = creekGrid;
    const a = spawn(s, 'muskrat', 6, 4); a.aware = 0.65;
    drain('spawn');
    Game.animalTurn(); drain('turn'); status(s, 'dove?');
  }
  {
    console.log('\n=== MUSKRAT (known — the cue + vivid dive) ===');
    const s = freshGame(); bow(s);
    Game.genDetail = creekGrid;
    Game.state.codex.animalEncounters = { muskrat: 3 };
    const a = spawn(s, 'muskrat', 6, 4); a.aware = 0.65;
    drain('spawn+cue');
    Game.animalTurn(); drain('turn'); status(s, 'dove?');
  }

  // ---- ARMADILLO: stalk -> hunker -> barehanded grab -> leap ----
  {
    console.log('\n=== ARMADILLO (armor, not speed) ===');
    const s = freshGame();
    s.equipped = {};
    spawn(s, 'nine_banded_armadillo', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk 1'); status(s, 's1');
    Game.stalkAnimal(); drain('stalk 2'); status(s, 's2');
    if (s.animal) { Game.huntAnimal(); drain('grab'); status(s, 'after grab'); }
  }

  // ---- CROW: walk up -> the mob ----
  {
    console.log('\n=== CROW (the lookout) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'american_crow', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk 1');
    Game.stalkAnimal(); drain('stalk 2'); status(s, 'after stalks');
    console.log('  whAlert:', JSON.stringify(s.whAlert));
  }

  // ---- BLUEGILL: press -> bed-hide -> reach in ----
  {
    console.log('\n=== BLUEGILL (guards its bed) ===');
    const s = freshGame();
    s.equipped = {};
    spawn(s, 'bluegill', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk 1');
    Game.stalkAnimal(); drain('stalk 2'); status(s, 'pressed');
    if (s.animal) {
      const rr = Math.random; Math.random = () => 0.0; // reach in and take it
      Game.huntAnimal(); Math.random = rr;
      drain('reach in'); status(s, 'after');
    }
  }

  // ---- RAT SNAKE: freeze -> strike (may bolt or bite) ----
  {
    console.log('\n=== RAT SNAKE (freeze, then decide) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'gray_rat_snake', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk 1'); status(s, 's1');
    Game.stalkAnimal(); drain('stalk 2'); status(s, 's2');
    if (s.animal) { Game.huntAnimal(); drain('strike'); status(s, 'after strike'); }
  }

  // ---- OPOSSUM: miss -> flop -> strike the "dead" one ----
  {
    console.log('\n=== OPOSSUM (miss -> flop -> the trick resolves) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'opossum', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk'); status(s, 's1');
    const rr = Math.random; Math.random = () => 0.999; // clean miss
    Game.huntAnimal(); Math.random = rr;
    drain('miss'); status(s, 'flopped?');
    if (s.animal && s.animal.pstate === 'playing_dead') {
      const rr2 = Math.random; Math.random = () => 0.99; // strike the "dead" one, no wake-bite
      Game.huntAnimal(); Math.random = rr2;
      drain('strike the dead'); status(s, 'after');
    }
  }

  // ---- KILL TEXT showcase: boar + beaver (known) ----
  {
    console.log('\n=== KILL TEXT (boar, known) ===');
    const s = freshGame(); bow(s);
    Game.state.codex.animalEncounters = { wild_boar: 3 };
    const a = spawn(s, 'wild_boar', 6, 4);
    drain('spawn+cue');
    const rr = Math.random; Math.random = () => 0.0;
    Game.huntAnimal(); Math.random = rr;
    drain('kill'); status(s, 'after kill');
  }
  {
    console.log('\n=== KILL TEXT (beaver, known) ===');
    const s = freshGame(); bow(s);
    Game.genDetail = creekGrid;
    Game.state.codex.animalEncounters = { north_american_beaver: 3 };
    const a = spawn(s, 'north_american_beaver', 6, 4);
    a.aware = 0; // calm beaver, no slap
    drain('spawn+cue');
    const rr = Math.random; Math.random = () => 0.0;
    Game.huntAnimal(); Math.random = rr;
    drain('kill'); status(s, 'after kill');
  }

  // ---- SIGN HINT (tracker L3, no spawn) ----
  {
    console.log('\n=== SIGN HINT (tracker reads the woods) ===');
    const s = freshGame();
    Game.abilityLevel = () => 3;
    Game.playerTile = () => ({ type: 'creek' });
    const rr = Math.random;
    const seq = [0.5, 0.1, 0.0];
    Math.random = () => (seq.length ? seq.shift() : 0.9);
    drain('before');
    Game.checkAnimals();
    Math.random = rr;
    drain('checkAnimals');
    delete Game.abilityLevel; delete Game.playerTile;
  }

  console.log('\nplaytest complete');
})().catch(e => { console.error('CRASH', e); process.exit(2); });
