// BREAK-IT: TRAVEL & MAP round 9 (2026-10-10) — hostile player (explorer).
// Attacks NEW surface (rounds 1-8 closed, not re-attacked):
//   T1 EXPLOIT: Game.doAction('forage') had NO mid-combat guard (rest refuses,
//       drink spends the combat action deliberately). Mid-fight forage granted
//       items + ability XP + practice AND ran villagerTurn() while
//       tickAction(16) no-op'd in tbfight — free hauls with the fight frozen.
//   T2 EXPLOIT: Game.doAction('wait') had NO mid-combat guard either. It ran
//       villagerTurn() with tickAction(wticks) no-op'ing and the calm line
//       suppressed — unlimited free villager turns (free village labor) for a
//       hostile player with a console, zero time passing.
//   T3 CONTROL: doAction('drink') mid-fight keeps its deliberate path
//       (spendCombatAction); doAction('forage') outside combat still works.
//   T4 HELD: Game.examineCell DOES refuse mid-fight ("Not mid-fight — eyes on
//       the threat") — the guard lives in the carexplore.js override, not the
//       dead game.js verb. "Too far" examines advance nothing.
// Usage: node scripts/test-travel-r9-examine-combat.js        (AFTER fix)
//        BEFORE=1 node scripts/test-travel-r9-examine-combat.js (pre-fix HEAD)
//        SEED=999 node scripts/test-travel-r9-examine-combat.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
function headSrc(p) {
  execSync(`git show HEAD:${p} > /tmp/bt9-before-${p.replace(/\//g, '_')}`, { cwd: ROOT });
  return fs.readFileSync(`/tmp/bt9-before-${p.replace(/\//g, '_')}`, 'utf8');
}
const gameSrc = BEFORE ? headSrc('src/js/game.js') : fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
console.log(BEFORE ? 'MODE: BEFORE (pre-fix HEAD code)' : 'MODE: AFTER (fixed worktree code)');
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
// SEED BEFORE EVAL: modules capture Math.random at load (AGENTS.md).
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', '__GAME__', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = f === '__GAME__' ? gameSrc : fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
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
function setup() {
  rng.reset();
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 9000; s.hydration = 100; s.health = 100;
  // stand on a forageable wild tile (haven itself can't be foraged)
  Game.map.px = 4; Game.map.py = 4;
  let found = false;
  for (const [tx, ty] of [[4, 5], [5, 4], [3, 4], [4, 3], [5, 5]]) {
    const t = Game.tileAt(tx, ty);
    if (t && t.type !== 'haven' && Game.reveal) { Game.map.px = tx; Game.map.py = ty; Game.reveal(tx, ty); found = true; break; }
  }
  if (!found) { Game.map.px = 4; Game.map.py = 5; Game.reveal(4, 5); }
  return s;
}
function spyVillagerTurns() {
  let n = 0;
  const orig = Game.villagerTurn.bind(Game);
  Game.villagerTurn = (...a) => { n++; return orig(...a); };
  return { count: () => n, restore: () => { Game.villagerTurn = orig; } };
}
function captureSay() {
  const said = [];
  const orig = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); return orig(m); };
  return { said, restore: () => { Game.say = orig; } };
}

console.log('T1: mid-fight doAction(forage) — free haul while the fight is frozen');
(function () {
  const s = setup();
  Game.startCombat('bulldozer');
  ok('fight is live', !!Game.tbfight && !Game.tbfight.over);
  const spy = spyVillagerTurns(), cap = captureSay();
  const inv0 = s.inventory.length, ticks0 = s.dayTicks || 0;
  let r, threw = null;
  try { r = Game.doAction('forage'); } catch (e) { threw = e; }
  const refused = cap.said.some(m => /Not mid-fight/i.test(m));
  const vt = spy.count();
  console.log('    threw=' + !!threw + ' refused=' + refused + ' villagerTurns=' + vt +
    ' invDelta=' + (s.inventory.length - inv0) + ' dayTicksDelta=' + ((s.dayTicks || 0) - ticks0));
  spy.restore(); cap.restore();
  if (BEFORE) {
    ok('BEFORE: mid-fight forage ran the world for free (the bug)', vt >= 1 && ((s.dayTicks || 0) - ticks0) === 0 && !refused,
      'no free turns granted?!');
  } else {
    ok('AFTER: mid-fight forage refused loudly', refused, 'no refusal');
    ok('AFTER: no villager turns ran', vt === 0, vt + ' turns ran');
    ok('AFTER: nothing foraged', s.inventory.length === inv0, 'inventory grew');
    ok('AFTER: fight still live', !!Game.tbfight && !Game.tbfight.over);
  }
})();

console.log('T2: mid-fight doAction(wait) — free villager turns');
(function () {
  const s = setup();
  Game.startCombat('bulldozer');
  const spy = spyVillagerTurns(), cap = captureSay();
  const ticks0 = s.dayTicks || 0;
  let r;
  try { r = Game.doAction('wait'); } catch (e) { r = 'threw'; }
  const refused = cap.said.some(m => /Not mid-fight/i.test(m));
  const vt = spy.count();
  const calmLied = cap.said.some(m => /Nothing asks anything of you/i.test(m));
  console.log('    refused=' + refused + ' villagerTurns=' + vt +
    ' dayTicksDelta=' + ((s.dayTicks || 0) - ticks0) + ' calmLine=' + calmLied);
  spy.restore(); cap.restore();
  if (BEFORE) {
    ok('BEFORE: mid-fight wait granted free villager turns (the bug)', vt >= 1 && !refused, 'no free turns?!');
    ok('BEFORE: calm line suppressed but turns still ran', !calmLied && vt >= 1);
  } else {
    ok('AFTER: mid-fight wait refused loudly', refused, 'no refusal');
    ok('AFTER: no villager turns ran', vt === 0, vt + ' turns ran');
    ok('AFTER: fight still live', !!Game.tbfight && !Game.tbfight.over);
  }
})();

console.log('T3: controls — drink mid-fight still works; forage outside combat still works');
(function () {
  const s = setup();
  Game.startCombat('bulldozer');
  s.water = [{ quality: 'clean' }]; s.hydration = 50;
  const cap = captureSay();
  let rDrink;
  try { rDrink = Game.doAction('drink'); } catch (e) { rDrink = 'threw'; }
  const drinkRefused = cap.said.some(m => /Not mid-fight/i.test(m));
  const drank = s.water.length === 0;
  console.log('    drink: refused=' + drinkRefused + ' consumed=' + drank);
  ok('drink mid-fight keeps its deliberate combat path (not refused)', !drinkRefused && drank,
    'drink broke!');
  cap.restore();
  Game.tbfight = null; // end the fight for the outside-combat control
  const cap2 = captureSay();
  const ticks0 = s.dayTicks || 0;
  let rForage;
  try { rForage = Game.doAction('forage'); } catch (e) { rForage = 'threw'; }
  const refused2 = cap2.said.some(m => /Not mid-fight/i.test(m));
  console.log('    forage outside combat: refused=' + refused2 + ' timePassed=' + (((s.dayTicks || 0) - ticks0) > 0));
  cap2.restore();
  ok('forage outside combat still works', !refused2, 'forage broke outside combat!');
})();

console.log('T4: examineCell mid-fight — guard exists (held)');
(function () {
  const s = setup();
  Game.startCombat('bulldozer');
  const cap = captureSay();
  Game.examineCell(4, 4);
  const refused = cap.said.some(m => /Not mid-fight/i.test(m));
  cap.restore();
  ok('examineCell refuses mid-fight (carexplore.js override guard)', refused, 'no refusal?!');
})();

console.log('\nRESULT: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
