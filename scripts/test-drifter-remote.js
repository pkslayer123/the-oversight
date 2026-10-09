// BREAK-IT: DRIFTER round 6 (2026-10-09) — remote leadership verbs.
// The 04:30 absence run proved the engine refuses talk/sharefood/study from
// afar. This run attacks the ONE leadership verb it didn't touch: assignTask.
// Hostile premise: leave the village, run the whole labor economy by remote
// control, for free, while villagers freeze mid-behavior at your word.
// ATTACKS:
//   E1 EXPLOIT: assignTask from 5 nodes away (default 'in-person' via) — must
//      refuse honestly; no assignment may land.
//   E2 EXPLOIT: assignTask with a remote via the player doesn't have
//      ('system-ping' / 'shout') — must refuse honestly (UI already says:
//      "You need to be face-to-face to ask for help. (Abilities can unlock
//      remote assignment.)"). No ability grants remoteAssign today, so any
//      remote via is a lie.
//   E3 EXPLOIT: remote assignTask must not engage the villager from afar
//      (socialTick -> setEngaged(vid, 2) freezes batch behavior from miles).
//   E4 EXPLOIT: a task assigned from afar must not yield pantry income for
//      the absent drifter (resolveAssignments at the next part boundary).
//   S1 SOFTLOCK: assign a task, remove the villager mid-part, run
//      resolveAssignments — must not throw (no phantom laborer crash).
//   H1 HONESTY (control): at the haven, in-person assignTask works normally
//      (the fix must not break the legitimate path).
//   H2 HONESTY: time_skip — 1/day gate, combat gate, and the part boundary
//      actually advances the world (the skip charges what it claims).
// Usage: node scripts/test-drifter-remote.js
//        SEED=999 node scripts/test-drifter-remote.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
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
// FULL module list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
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
  if (Game.tbfight) Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  // high trust so the obedience check passes — the test is about DISTANCE
  const v = Game.state.village;
  const other = (v.roster || []).find(id => id !== Game.villagerId);
  v.trust = v.trust || {}; v.trust[other] = 90;
  return other;
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  let r, err = null; try { r = fn(); } catch (e) { err = e; } finally { Game.say = origSay; }
  return { r, says, err };
}
function goFar() { Game.map.px = 0; Game.map.py = 0; } // 8 nodes from haven ~(4,4)
function goHome() { Game.map.px = 4; Game.map.py = 4; }

console.log('== E1: assignTask in-person from 5+ nodes away ==');
setup();
{
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  goFar();
  const cap = captureSay(() => Game.assignTask(vid, 'forage'));
  const a = (Game.state.village.assignments || {})[vid];
  ok('E1 remote in-person assign: no throw', cap.err === null, cap.err && cap.err.message);
  ok('E1 no assignment lands from afar', !a, a && JSON.stringify(a));
  ok('E1 honest refusal (face-to-face line)',
     cap.says.some(m => /face-to-face|too far|not here|miles/i.test(m)),
     cap.says.join(' | ').slice(0, 160));
}

console.log('== E2: assignTask with remote via the player has no ability for ==');
setup();
{
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  goFar();
  for (const via of ['system-ping', 'shout', 'runner']) {
    const cap = captureSay(() => Game.assignTask(vid, 'forage', { via }));
    const a = (Game.state.village.assignments || {})[vid];
    ok(`E2 via='${via}': no throw`, cap.err === null, cap.err && cap.err.message);
    ok(`E2 via='${via}': no assignment without the ability`, !a, a && JSON.stringify(a));
    ok(`E2 via='${via}': honest refusal`,
       cap.says.some(m => /face-to-face|ability|unlock/i.test(m)),
       cap.says.join(' | ').slice(0, 160));
  }
}

console.log('== E3: remote assign must not engage the villager from afar ==');
setup();
{
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  goFar();
  captureSay(() => Game.assignTask(vid, 'forage'));
  captureSay(() => Game.assignTask(vid, 'forage', { via: 'system-ping' }));
  ok('E3 no engagement set from afar', !Game.isEngaged(vid),
     'engaged=' + JSON.stringify((Game.state.village.engaged || {})[vid]));
}

console.log('== E4: no pantry income for the absent drifter ==');
setup();
{
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  goFar();
  captureSay(() => Game.assignTask(vid, 'forage'));
  const pk0 = Game.state.village.pantryKcal || 0;
  const cap = captureSay(() => Game.resolveAssignments());
  const pk1 = Game.state.village.pantryKcal || 0;
  ok('E4 resolveAssignments: no throw', cap.err === null, cap.err && cap.err.message);
  ok('E4 no remote-forage income while away', pk1 <= pk0 + 1, `pantry ${pk0} -> ${pk1}`);
}

console.log('== S1: assigned villager removed mid-part, resolve must not throw ==');
setup();
{
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  goHome();
  captureSay(() => Game.assignTask(vid, 'forage'));
  ok('S1 assignment recorded at haven (setup)', !!(Game.state.village.assignments || {})[vid]);
  // kill them mid-part
  Game.state.village.roster = (Game.state.village.roster || []).filter(id => id !== vid);
  const cap = captureSay(() => Game.resolveAssignments());
  ok('S1 resolveAssignments after death: no throw', cap.err === null, cap.err && cap.err.message);
}

console.log('== H1 (control): in-person assign at the haven works ==');
setup();
{
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  goHome();
  const cap = captureSay(() => Game.assignTask(vid, 'forage'));
  const a = (Game.state.village.assignments || {})[vid];
  ok('H1 at-haven assign: no throw', cap.err === null, cap.err && cap.err.message);
  ok('H1 assignment lands', !!(a && a.task === 'forage'), a && JSON.stringify(a));
  ok('H1 villager engaged while talking (batch freeze is legit in person)',
     Game.isEngaged(vid));
}

console.log('== H2: time_skip honesty ==');
setup();
{
  const s = Game.state.scholar;
  // grant the ability for the test
  s.abilities = s.abilities || [];
  if (!s.abilities.some(a => (a.id || a) === 'time_skip')) s.abilities.push({ id: 'time_skip' });
  const acts = Game.activatableAbilities ? Game.activatableAbilities() : [];
  const has = acts.some(a => a.id === 'time_skip');
  ok('H2 time_skip appears in available actions', has);
  const part0 = Game.dayPart;
  const day0 = s.day;
  const en0 = s.energy;
  const r1 = captureSay(() => Game.activateAbility('time_skip'));
  ok('H2 first skip: no throw', r1.err === null, r1.err && r1.message);
  ok('H2 part advances on skip', Game.dayPart !== part0 || s.day !== day0,
     `part ${part0}->${Game.dayPart} day ${day0}->${s.day}`);
  const r2 = captureSay(() => Game.activateAbility('time_skip'));
  ok('H2 second skip same day: refused (1/day)', !r2.r || r2.says.some(m => /twice|1\/day/i.test(m)),
     r2.says.join(' | ').slice(0, 160));
  ok('H2 energy moved at the part boundary (the skip charges)',
     s.energy !== en0, `energy ${en0} -> ${s.energy}`);
}

console.log('== F1: fresh-game starvation must not throw (v.health init) ==');
setup();
{
  // REGRESSION (drifter r6 2026-10-09): on a fresh game v.health is
  // undefined; the first starving endDay threw "Cannot set properties of
  // undefined" inside villagerMealDay and killed endDay. The old suite only
  // survived because villageLives' wounded branch happened to init the map
  // first on the old RNG sequence (seed 999 exposed it).
  const v = Game.state.village;
  v.pantry = []; v.pantryKcal = 0;
  const cap = captureSay(() => { const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100; Game.endDay(); });
  ok('F1 first starving endDay: no throw', cap.err === null, cap.err && cap.err.message);
  ok('F1 health map initialized by villageEats', !!(v.health && typeof v.health === 'object'));
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
