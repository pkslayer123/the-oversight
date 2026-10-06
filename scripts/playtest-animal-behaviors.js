// PLAYED PASS (builder): play three hunts turn-by-turn as a player would.
// Not a suite — a felt run. Decisions: stalk when far, strike when close,
// chase when it bolts. Fixed seed for reproducibility.
// Usage: node scripts/playtest-animal-behaviors.js
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

// fixed seed — same run every time
let _seed = 1234567;
Math.random = function () {
  _seed = (_seed * 1103515245 + 12345) % 2147483648;
  return _seed / 2147483648;
};

function drain(tag) {
  const lines = (Game.log || []).slice();
  Game.log = [];
  const fb = (Game._feedback || []);
  Game._feedback = [];
  for (const l of lines) console.log('  LOG: ' + String(l).slice(0, 160));
  for (const l of fb) console.log('  FB:  ' + String(l).slice(0, 160));
}
function status() {
  const s = Game.state.scholar, a = s.animal;
  const d = a ? Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my)) : -1;
  console.log(`  [you @(${s.mx},${s.my}) kcal:${Math.round(s.kcal)} hp:${s.health}] ` +
    (a ? `animal ${a.id} @(${a.mx},${a.my}) dist:${d} aware:${(a.aware || 0).toFixed(2)} pstate:${a.pstate} label:"${Game.encAnimalLabel(a)}"` : 'no animal'));
}
function act(name, fn) {
  console.log(`\n> ${name}`);
  try { fn(); } catch (e) { console.log('  CRASH: ' + e.message); }
  status();
  drain();
}
function moveToward() {
  const s = Game.state.scholar, a = s.animal;
  if (!a) return;
  s.mx = Math.max(0, Math.min(8, s.mx + Math.sign(a.mx - s.mx)));
  s.my = Math.max(0, Math.min(8, s.my + Math.sign(a.my - s.my)));
  console.log('\n> move toward it');
  try { Game.animalTurn(); } catch (e) {}
  status();
  drain();
}

(async () => {
  await Game.init();

  console.log('================ PLAY 1: opossum (plays_dead) ================');
  Game.debugScenario('opossum');
  Game.log = [];
  status(); drain();
  // I'm adjacent with a sharpened stick. Night. Something pale waddles.
  // Player brain: it's right there. Strike.
  act('STRIKE the waddling shape', () => Game.huntAnimal());
  // It flopped. Player brain: is it dead? The text says "playing dead...
  // it's waiting for you to leave." Do I buy it? Strike the "corpse".
  if (Game.state.scholar.animal) {
    act('STRIKE the "dead" opossum', () => Game.huntAnimal());
  }
  {
    const inv = Game.state.scholar.inventory || [];
    const carc = inv.find(i => i.foodState === 'carcass');
    console.log('\n  pack: ' + (carc ? `carcass "${carc.name}"` : 'no carcass — ' + inv.map(i => i.name).join(', ')));
    if (carc) {
      // gut it quickly (knife) — do I have one? cleanCarcass needs a knife.
      const hasKnife = inv.some(i => /knife|sharpened/i.test(i.name || ''));
      console.log('  have cutting tool: ' + hasKnife);
    }
  }

  console.log('\n================ PLAY 2: rabbit (skittish, chase) ================');
  Game.debugScenario('rabbit');
  Game.log = [];
  status(); drain();
  // rabbit scenario: what weapon? check, then play the chase properly.
  for (let t = 0; t < 14; t++) {
    const s = Game.state.scholar, a = s.animal;
    if (!a) { console.log('\n  (animal gone — the chase ended)'); break; }
    const d = Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my));
    if (a.pstate === 'winded' || d <= 1) {
      act(`STRIKE (dist ${d}, ${a.pstate})`, () => Game.huntAnimal());
      if (!Game.state.scholar.animal) break;
    } else if (d <= 5) {
      act('STALK closer', () => Game.stalkAnimal());
    } else {
      moveToward();
    }
  }

  console.log('\n================ PLAY 3: fox (cunning, taunt) ================');
  Game.debugScenario('fox');
  Game.log = [];
  status(); drain();
  for (let t = 0; t < 12; t++) {
    const s = Game.state.scholar, a = s.animal;
    if (!a) { console.log('\n  (animal gone — the chase ended)'); break; }
    const d = Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my));
    if (d <= 1) {
      act(`STRIKE (dist ${d}, ${a.pstate})`, () => Game.huntAnimal());
      if (!Game.state.scholar.animal) break;
    } else if (d <= 6) {
      act('STALK closer', () => Game.stalkAnimal());
    } else {
      moveToward();
    }
  }
  console.log('\n================ DONE ================');
})().catch(e => { console.error('CRASH', e); process.exit(2); });
