// PLAYTEST as a player (Steve 2026-10-06): animal pack 2.
// One honest run per new animal, real randomness (1x), turn hygiene per
// AGENTS.md: stalkAnimal()/huntAnimal() already advance the animal — never
// double-advance. Movement stays on interior tiles (1..7).
// Usage: node scripts/play-animals-20261006.js
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
  if (l.trim()) console.log(`  ${label}: ${l.split('\n').map(x => x.trim()).filter(Boolean).join(' | ').slice(0, 420)}`);
}
function status(s, tag) {
  const a = s.animal;
  console.log(`  [${tag}] hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} animal=${a ? a.id + '@' + a.mx + ',' + a.my + ' ' + a.pstate + ' aware=' + (a.aware||0).toFixed(2) : 'GONE'}`);
}

(async () => {
  await Game.init();

  // ---- BOAR: stalk in, it paws; strike -> charge ----
  {
    console.log('\n=== WILD BOAR (unknown at first) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'wild_boar', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk 1'); status(s, 'after stalk 1');
    Game.stalkAnimal(); drain('stalk 2'); status(s, 'after stalk 2');
    Game.huntAnimal(); drain('strike'); status(s, 'after strike');
    if (s.animal) { Game.huntAnimal(); drain('strike 2'); status(s, 'after strike 2'); }
  }

  // ---- PORCUPINE: barehanded grab = quills ----
  {
    console.log('\n=== PORCUPINE (barehanded, unknown) ===');
    const s = freshGame();
    s.equipped = {};
    spawn(s, 'north_american_porcupine', 5, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk'); status(s, 'after stalk');
    Game.huntAnimal(); drain('grab'); status(s, 'after grab');
  }

  // ---- GROUNDHOG: let it whistle and run ----
  {
    console.log('\n=== GROUNDHOG (let it bolt) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'groundhog', 6, 4);
    drain('spawn');
    for (let i = 0; i < 4 && s.animal; i++) { Game.stalkAnimal(); drain('stalk ' + (i + 1)); }
    status(s, 'end');
  }

  // ---- GOOSE: let it come at you ----
  {
    console.log('\n=== CANADA GOOSE (stand your ground) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'canada_goose', 7, 4);
    drain('spawn');
    for (let i = 0; i < 3 && s.animal; i++) { Game.animalTurn(); drain('turn ' + (i + 1)); }
    status(s, 'end');
    if (s.animal) { Game.huntAnimal(); drain('strike back'); status(s, 'after strike'); }
  }

  // ---- WOODCOCK: walk it up ----
  {
    console.log('\n=== WOODCOCK (walk it up) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'american_woodcock', 6, 4);
    drain('spawn');
    Game.stalkAnimal(); drain('stalk 1'); // dist 2: still nothing?
    Game.stalkAnimal(); drain('stalk 2'); // adjacent: the flush
    status(s, 'end');
  }

  // ---- BEAVER: approach; the slap ----
  {
    console.log('\n=== BEAVER (approach openly) ===');
    const s = freshGame(); bow(s);
    const a = spawn(s, 'north_american_beaver', 6, 4);
    drain('spawn');
    for (let i = 0; i < 5 && s.animal; i++) { Game.animalTurn(); drain('turn ' + (i + 1)); }
    status(s, 'end');
  }

  // ---- BOBCAT: hold ground; then run once ----
  {
    console.log('\n=== BOBCAT (hold ground, then back off) ===');
    const s = freshGame(); bow(s);
    spawn(s, 'bobcat', 7, 4);
    drain('spawn');
    Game.animalTurn(); drain('turn 1'); status(s, 't1');
    Game.animalTurn(); drain('turn 2'); status(s, 't2');
    if (s.animal) { s.mx = 2; s.my = 4; Game.animalTurn(); drain('back off'); status(s, 't3'); }
  }

  // ---- KNOWN boar: cue shows, hunt properly ----
  {
    console.log('\n=== WILD BOAR (known — cue + patient hunt) ===');
    const s = freshGame(); bow(s);
    Game.state.codex.animalEncounters = { wild_boar: 3 };
    spawn(s, 'wild_boar', 6, 4);
    drain('spawn+cue');
    for (let i = 0; i < 6 && s.animal; i++) {
      const a = s.animal;
      const d = Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my));
      if (d <= 1 || a.pstate === 'winded') { Game.huntAnimal(); drain('strike'); }
      else { Game.stalkAnimal(); drain('stalk'); }
    }
    status(s, 'end');
    const carc = (s.inventory || []).find(i => i.foodState === 'carcass');
    console.log('  carcass:', carc ? carc.name + ' ~' + carc.hiddenKcal + ' kcal' : 'none');
  }

  console.log('\nplaytest complete');
})().catch(e => { console.error('CRASH', e); process.exit(2); });
