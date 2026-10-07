#!/usr/bin/env node
// HUNTER archetype regression guard (Steve 2026-10-06): charred-kill naming.
// INVESTIGATION RESULT (2026-10-06, hunter playtest run): the flagged leak
//   site — the charred branch of game.js huntAnimal() (~line 8343), which
//   pushes foodCarcass(animal...) without calling encIdentifyAnimal — is
//   DEAD CODE. encounters.js:1575 assigns G.huntAnimal AFTER game.js loads
//   (index.html line 29 -> 30), fully shadowing it, and the live
//   implementation calls this.encIdentifyAnimal(a.id) BEFORE the charsMeat
//   branch (encounters.js:1785). The leak cannot fire in production.
//   The dead branch remains a latent hazard (a load-order change or direct
//   call would resurrect the leak) — noted for a quiet-tree cleanup run,
//   NOT fixed here: touching game.js on this hot tree buys nothing live.
// WHAT THIS TEST PINS: the LIVE charred-kill path identifies the species
//   before the carcass is named ("American Woodcock (charred remains)" is
//   earned, not leaked), and the narration never names it.
// Usage: node scripts/test-hunter-charred-leak-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.insideHaven = false;
  s.mx = 2; s.my = 2;

  // american_woodcock: not common, no regions -> unknown to a fresh scholar.
  ok('woodcock unknown before the kill', Game.encAnimalKnown('american_woodcock') === false);
  // Canary: the live huntAnimal must be the encounters.js override (which
  // identifies before naming). If this ever flips, the dead game.js branch
  // below becomes live and the leak returns.
  ok('live huntAnimal is the encounters.js override', Game.huntAnimal && Game.huntAnimal._wrapped === true);

  // Equip the Searcaster (alien beam weapon, charsMeat: true).
  s.equipped = { weapon: { itemId: 'searcaster', name: 'Searcaster', range: 8 } };
  const wdef = (Game.data.items || []).find(i => i.id === 'searcaster');
  ok('searcaster chars meat', !!(wdef && wdef.weapon && wdef.weapon.charsMeat));

  // Spawn the bird calm and within beam range, beyond grabbing range (skip bite).
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  s.animal = { id: 'american_woodcock', name: 'American Woodcock', mx: 4, my: 2, aware: 0, pstate: 'graze', stamina: 2 };
  const said = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return os(t); };
  const realRandom = Math.random;
  Math.random = () => 0.02; // calm animal stays; the shot lands
  try { Game.huntAnimal(); } finally { Math.random = realRandom; }
  Game.say = os;

  const charred = (s.inventory || []).find(i => /charred remains/i.test(i.name || ''));
  ok('charred remains land in pack', !!charred);

  // THE LEAK: is the species name earned by the kill?
  const knownAfter = Game.encAnimalKnown('american_woodcock');
  ok('kill teaches the species (name earned, not leaked)', knownAfter === true);
  if (charred && !knownAfter) {
    console.log(`  LEAK DEMO: pack holds "${charred.name}" while encAnimalKnown=false`);
  }
  // The narration itself must never name it (builder-convenience leak check).
  ok('say text does not name the species', !/woodcock/i.test(said.join(' ')));

  console.log(`\n${pass}/${pass + fail} checks passed${fail ? ' — LEAK PRESENT' : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
