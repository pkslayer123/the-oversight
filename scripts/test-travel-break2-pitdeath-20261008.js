// BREAK-IT: TRAVEL & MAP round 2 — SOFTLOCK: own pit trap kills on arrival, no death flow (Steve 2026-10-08).
// ATTACK: travelTo checks your own old pit traps on the arrival tile (50%, 15-25 dmg).
// A lethal hit set health to 0 but ran NO death processing — no maybeCheatDeath
// (second_wind/molt/phoenix never triggered), no playerDeath, over=false. The 0-HP
// scholar kept wandering until endDay blamed "the night". Zombie state.
// FIX: after pit damage, if health <= 0 -> maybeCheatDeath() else playerDeath('your own
// pit trap'), then stop — travelTo does not continue on a corpse.
// Usage: node scripts/test-travel-break2-pitdeath-20261008.js        (AFTER fix)
//        BEFORE=1 node scripts/test-travel-break2-pitdeath-20261008.js (pre-fix code from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt2-game-before.js', { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}
let _seed = 7;
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = s; };
Math.random = rng;
global.window = global;
const gameFile = BEFORE ? '/tmp/bt2-game-before.js' : path.join(ROOT, 'src/js/game.js');
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', null, 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const p = f === null ? gameFile : path.join(ROOT, 'src/js', f);
  try { eval(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const realRandom = Math.random;

function setupLethalPit() {
  rng.reset(7);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 5;
  const ax = Game.map.px, ay = Game.map.py;
  const tgt = Game.travelTargets().find(t => Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1 && !Game.travelBlockage(t.x, t.y));
  if (!tgt) { console.error('no adjacent target'); process.exit(2); }
  Game.tileAt(tgt.x, tgt.y).traps = [{ recipeId: 'pit_trap', setDay: (s.day || 1) - 1, uses: 2 }];
  return { s, tgt, oldId: Game.villagerId };
}

const says = [];
const origSay = Game.say; Game.say = (m) => says.push(String(m));
const { s, tgt, oldId } = setupLethalPit();
Math.random = () => 0.1; // force the 50% pit trigger
Game.travelTo(tgt.x, tgt.y);
Math.random = realRandom;
Game.say = origSay;
const deathSaid = says.some(m => /is dead/i.test(m));
const zombie = s.health <= 0 && !deathSaid;
console.log(`  [info] health=${s.health} deathAnnounced=${deathSaid} villagerId changed=${Game.villagerId !== oldId}`);

if (BEFORE) {
  ok('BEFORE: lethal pit leaves a 0-HP zombie, no death flow (bug real)', zombie, `health=${s.health}`);
} else {
  ok('AFTER: lethal pit runs the death flow (mantle passes)', deathSaid && Game.villagerId !== oldId,
    `health=${s.health} deathSaid=${deathSaid}`);
  ok('AFTER: death names the true cause', says.some(m => /own pit trap/i.test(m)),
    says.filter(m => /is dead/i.test(m)).map(m => m.slice(0, 90)).join(' | '));
  ok('AFTER: successor is alive at haven', s.health > 0 && Game.map.px === (Game.state.village.px ?? 4));
}

// cheat-death still gets its trigger (AFTER only): second_wind at 0 HP
if (!BEFORE) {
  rng.reset(7);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar; s2.kcal = 9000; s2.hydration = 100; s2.health = 5;
  s2.abilities = [{ id: 'second_wind', name: 'second_wind', desc: '', level: 1, xp: 0 }];
  const ax = Game.map.px, ay = Game.map.py;
  const tgt2 = Game.travelTargets().find(t => Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1 && !Game.travelBlockage(t.x, t.y));
  Game.tileAt(tgt2.x, tgt2.y).traps = [{ recipeId: 'pit_trap', setDay: (s2.day || 1) - 1, uses: 2 }];
  const says2 = [];
  Game.say = (m) => says2.push(String(m));
  Math.random = () => 0.1;
  Game.travelTo(tgt2.x, tgt2.y);
  Math.random = realRandom;
  Game.say = origSay;
  ok('AFTER: second_wind triggers on pit death (1 HP, no mantle pass)',
    s2.health === 1 && says2.some(m => /SECOND WIND/i.test(m)), `health=${s2.health}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
