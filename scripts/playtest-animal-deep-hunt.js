// PLAYER PLAYTEST (builder): hunt the turkey and the deer end-to-end as a player.
// Steve's notes under test:
//   1. Prey must REACT to approach — flee when approached, not sit still;
//      hunting requires approach/tracking skill.
//   2. Food reality: raw = fewer kcal + much higher disease risk; processing
//      changes net calories; unknown species = blind shot, game is honest.
// Usage: node scripts/playtest-animal-deep-hunt.js
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

let _seed = 20261006;
Math.random = function () {
  _seed = (_seed * 1103515245 + 12345) % 2147483648;
  return _seed / 2147483648;
};

function drain(maxLines) {
  const lines = (Game.log || []).slice();
  Game.log = [];
  const fb = (Game._feedback || []);
  Game._feedback = [];
  let n = 0;
  for (const l of lines.concat(fb)) {
    if (maxLines && n++ >= maxLines) break;
    console.log('  | ' + String(l).slice(0, 200));
  }
}
function dist() {
  const s = Game.state.scholar, a = s.animal;
  return a ? Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my)) : -1;
}
function status() {
  const s = Game.state.scholar, a = s.animal;
  console.log(`  [you @(${s.mx},${s.my}) kcal:${Math.round(s.kcal)} hp:${s.health}] ` +
    (a ? `${a.id} @(${a.mx},${a.my}) dist:${dist()} aware:${(a.aware || 0).toFixed(2)} pstate:${a.pstate} label:"${Game.encAnimalLabel(a)}"` : 'NO ANIMAL'));
}
function stepToward() {
  const s = Game.state.scholar, a = s.animal;
  if (!a) return false;
  s.mx = Math.max(0, Math.min(8, s.mx + Math.sign(a.mx - s.mx)));
  s.my = Math.max(0, Math.min(8, s.my + Math.sign(a.my - s.my)));
  try { Game.animalTurn(); } catch (e) {}
  return true;
}
function act(name, fn) {
  console.log(`\n> ${name}`);
  try { fn(); } catch (e) { console.log('  CRASH: ' + e.message + '\n' + e.stack.split('\n')[1]); }
  status(); drain(8);
}
function inv() {
  return (Game.state.scholar.inventory || []).map(i => `${i.name} (x${i.units || 1}, kcalEach:${i.kcalEach}, state:${i.foodState || '-'}, disease:${i.diseaseRisk ? i.diseaseRisk.p : 'no'})`);
}

(async () => {
  await Game.init();

  console.log('=========== PLAY 1: TURKEY, naive walk-up (no stalking) ===========');
  console.log('Player brain: big bird, bow in hand. Walk straight at it. What happens?');
  Game.debugScenario('turkey');
  Game.log = []; status(); drain(6);
  for (let t = 0; t < 10 && Game.state.scholar.animal; t++) {
    const d = dist();
    console.log(`\n> walk closer (dist ${d})`);
    stepToward(); status(); drain(5);
  }
  const a1 = Game.state.scholar.animal;
  console.log(`\n  RESULT: ${a1 ? `still engaged at dist ${dist()}, pstate=${a1.pstate}` : 'animal GONE (fled/despawned)'}`);

  console.log('\n=========== PLAY 2: TURKEY, stalk like a hunter ===========');
  Game.debugScenario('turkey');
  Game.log = [];
  // give the player a stone knife so cleaning is possible
  Game.state.scholar.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1, kcalEach: 0, kg: 0.3 });
  status(); drain(4);
  for (let t = 0; t < 24 && Game.state.scholar.animal; t++) {
    const s = Game.state.scholar, a = s.animal, d = dist();
    const range = (Game.equippedWeapon().range || 1);
    if (d <= range) { act(`STRIKE (dist ${d}, ${a.pstate})`, () => Game.huntAnimal()); if (!Game.state.scholar.animal) break; }
    else if (d <= 6) act('STALK closer', () => Game.stalkAnimal());
    else { console.log('\n> walk closer (too far to stalk)'); stepToward(); status(); drain(5); }
  }
  console.log('\n  PACK after kill:');
  for (const l of inv()) console.log('    ' + l);
  // clean the carcass
  const carcIdx = Game.state.scholar.inventory.findIndex(i => i.foodState === 'carcass');
  if (carcIdx >= 0) {
    act('CLEAN the carcass (knife)', () => Game.cleanCarcass(carcIdx));
    console.log('  PACK after clean:');
    for (const l of inv()) console.log('    ' + l);
  }
  // eat one portion RAW — food reality check
  const cleanedIdx = Game.state.scholar.inventory.findIndex(i => i.foodState === 'cleaned');
  if (cleanedIdx >= 0) {
    const hp0 = Game.state.scholar.health, kcal0 = Game.state.scholar.kcal;
    act(`EAT ONE RAW portion (gamble)`, () => Game.eatOne(cleanedIdx));
    console.log(`  raw-eat: kcal ${Math.round(kcal0)}->${Math.round(Game.state.scholar.kcal)}, hp ${hp0}->${Game.state.scholar.health}`);
  }

  console.log('\n=========== PLAY 3: DEER, naive walk-up ===========');
  console.log('Player brain: deer, dawn, bow. Walk at it. Does it sit still?');
  Game.debugScenario('deer');
  Game.log = []; status(); drain(4);
  let everBolted = false;
  for (let t = 0; t < 10 && Game.state.scholar.animal; t++) {
    const d = dist();
    console.log(`\n> walk closer (dist ${d})`);
    stepToward();
    const a = Game.state.scholar.animal;
    if (a && (a.pstate === 'bolt' || a.pstate === 'wary')) everBolted = true;
    status(); drain(5);
  }
  console.log(`\n  RESULT: ${Game.state.scholar.animal ? 'still engaged' : 'GONE'} — reacted (wary/bolt): ${everBolted}`);

  console.log('\n=========== PLAY 4: DEER, stalk + strike (tracking matters?) ===========');
  Game.debugScenario('deer');
  Game.log = [];
  const tr0 = (Game.abilityLevel && Game.abilityLevel('tracker')) || 0;
  console.log('  tracker level at start: ' + tr0);
  for (let t = 0; t < 30 && Game.state.scholar.animal; t++) {
    const s = Game.state.scholar, a = s.animal, d = dist();
    const range = (Game.equippedWeapon().range || 1);
    if (d <= range) { act(`STRIKE (dist ${d}, aware ${(a.aware || 0).toFixed(2)}, ${a.pstate})`, () => Game.huntAnimal()); if (!Game.state.scholar.animal) break; }
    else if (d <= 6) act('STALK closer', () => Game.stalkAnimal());
    else { console.log('\n> walk closer (too far to stalk)'); stepToward(); status(); drain(5); }
  }
  console.log('\n  PACK after kill:');
  for (const l of inv()) console.log('    ' + l);

  console.log('\n=========== PLAY 5: KNOWLEDGE GATE (fresh run, never seen a turkey) ===========');
  Game.debugScenario('turkey');
  Game.log = []; status(); drain(4);
  console.log('  encAnimalKnown(wild_turkey): ' + Game.encAnimalKnown('wild_turkey'));
  console.log('=========== DONE ===========');
})().catch(e => { console.error('CRASH', e); process.exit(2); });
