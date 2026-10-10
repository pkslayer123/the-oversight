// BREAK-IT: DRIFTER / exile founding fork (2026-10-10) — the fork verbs:
// claimSite, cacheFood, foundHaven/_forkNewHaven. Prior rounds hardened
// absence, join/leave seats, away-deaths, exile-from-join, estranged return.
// ATTACKS:
//   F1 EXPLOIT: foundHaven teleports the player to the claimed site from
//      ANYWHERE — claim at (0,0), walk to (8,8), found: free cross-map
//      teleport. The copy says "the spot you claimed weeks ago" (walk
//      language); the engine teleports.
//   F2 HONESTY: foundingMissing()/UI must name the walk-back requirement.
//   F3 STATE: claim a site ON a generated village's tile, found there —
//      tile record collision ('haven' tile + otherVillage at same coords).
//   F4 STATE: double foundHaven — second call must be a no-op (no 2nd fork).
//   F5 STATE: exile -> found -> exile -> found chain: founding resets,
//      pastVillages accumulates, haven names stay unique, old site retags.
//   F6 EXPLOIT: claimSite while not exiled must refuse.
// Usage: node scripts/test-drifter-fork-20261010.js
//        SEED=999 node scripts/test-drifter-fork-20261010.js
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
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'corruption.js', 'lifeseed.js',
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
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  let r, err = null; try { r = fn(); } catch (e) { err = e; } finally { Game.say = origSay; }
  return { r, says, err };
}
function exileSetup() {
  // become an exile with a claim at the current tile, founding forced complete
  const s = Game.state.scholar;
  Game.exilePlayer('moot');
  s.exileStartDay = (s.day || 1) - 8; // 8 solo days served
  const cap = captureSay(() => Game.claimSite());
  const f = Game.foundingState();
  f.shelterTier = 2; f.stockpileKcal = 10000;
  return { s, f, cap };
}
function farFrom(x, y) {
  // farthest tile from (x,y)
  let bx = 0, by = 0, bd = -1;
  for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) {
    const d = Math.abs(xx - x) + Math.abs(yy - y);
    if (d > bd) { bd = d; bx = xx; by = yy; }
  }
  Game.map.px = bx; Game.map.py = by;
  return { x: bx, y: by, d: bd };
}

console.log('== F1: foundHaven must not teleport (free travel) ==');
setup();
{
  const { s, f } = exileSetup();
  const cx = f.claimX, cy = f.claimY;
  const far = farFrom(cx, cy);
  const cap = captureSay(() => Game.foundHaven());
  const teleported = (Game.map.px === cx && Game.map.py === cy);
  ok('F1 no throw', cap.err === null, cap.err && cap.err.message);
  ok('F1 founding from afar is refused (no free teleport)',
     cap.r === null || cap.r === false,
     `foundHaven returned ${cap.r}; player at (${Game.map.px},${Game.map.py}), claim at (${cx},${cy})`);
  ok('F1 player position unchanged by the refused founding',
     Game.map.px === far.x && Game.map.py === far.y,
     `player at (${Game.map.px},${Game.map.py}), expected far tile (${far.x},${far.y})`);
  ok('F1 no fork happened on refusal',
     Game.state.scholar.exiled === true && Game.state.village.name !== undefined &&
     !(Game.state.pastVillages || []).length,
     `exiled=${Game.state.scholar.exiled} pastVillages=${(Game.state.pastVillages || []).length}`);
  // walk back to the cairn: founding must now be allowed
  Game.map.px = cx; Game.map.py = cy;
  const cap2 = captureSay(() => Game.foundHaven());
  ok('F1 founding AT the cairn succeeds', cap2.r === true && cap2.err === null,
     `r=${cap2.r} err=${cap2.err && cap2.err.message}`);
  ok('F1 fork plants the player at the claim', Game.map.px === cx && Game.map.py === cy);
}

console.log('== F2: walk-back requirement is honest (missing list + hint) ==');
setup();
{
  const { s, f } = exileSetup();
  const cx = f.claimX, cy = f.claimY;
  farFrom(cx, cy);
  const missing = Game.foundingMissing();
  ok('F2 foundingMissing names the walk-back when far',
     missing.some(m => /cairn|walk back/i.test(m)),
     'missing: ' + JSON.stringify(missing));
  const acts = Game.exileSelfActions();
  const fh = acts.find(a => a.id === 'foundhaven');
  ok('F2 foundhaven UI hint names the walk-back when far',
     fh && /cairn|walk back/i.test(fh.hint || ''),
     'hint: ' + (fh && fh.hint));
  ok('F2 foundhaven action is disabled while far',
     fh && fh.disabled === true, 'disabled=' + (fh && fh.disabled));
  Game.map.px = cx; Game.map.py = cy;
  const missing2 = Game.foundingMissing();
  ok('F2 walk-back requirement clears at the cairn',
     !missing2.some(m => /cairn|walk back/i.test(m)),
     'missing: ' + JSON.stringify(missing2));
}

console.log('== F3: cannot claim a site where a village already lives ==');
setup();
{
  const s = Game.state.scholar;
  Game.exilePlayer('moot');
  const v0 = Game.state.otherVillages[0];
  Game.map.px = v0.x; Game.map.py = v0.y; // stand on their tile
  const cap = captureSay(() => Game.claimSite());
  const f = Game.foundingState();
  ok('F3 no throw', cap.err === null, cap.err && cap.err.message);
  ok('F3 claim on a village tile is refused',
     cap.r === null && !f.siteClaimed,
     `r=${cap.r} siteClaimed=${f.siteClaimed}`);
  ok('F3 refusal says why (people live here)',
     cap.says.join(' ').match(/live here|already|village|people/i) !== null,
     'said: ' + cap.says.join(' | ').slice(0, 160));
}

console.log('== F4: double foundHaven is a no-op ==');
setup();
{
  const { s, f } = exileSetup();
  Game.map.px = f.claimX; Game.map.py = f.claimY;
  const cap1 = captureSay(() => Game.foundHaven());
  const v1 = Game.state.village;
  const pvLen = (Game.state.pastVillages || []).length;
  const cap2 = captureSay(() => Game.foundHaven());
  ok('F4 first founding succeeded', cap1.r === true, `r=${cap1.r}`);
  ok('F4 second foundHaven refuses (no longer exiled)',
     cap2.r === null, `r=${cap2.r}`);
  ok('F4 no second fork (village object identity unchanged)',
     Game.state.village === v1, 'village object changed');
  ok('F4 pastVillages did not grow', (Game.state.pastVillages || []).length === pvLen);
}

console.log('== F5: exile -> found -> exile -> found chain ==');
setup();
{
  const { s, f } = exileSetup();
  Game.map.px = f.claimX; Game.map.py = f.claimY;
  const oldTileX = Game.state.village.px, oldTileY = Game.state.village.py;
  captureSay(() => Game.foundHaven());
  const name1 = Game.state.village.name;
  const haven1 = Game.state.village;
  // exiled again from the new haven: the founding project must reset BEFORE
  // any new claim (exilePlayer clears it; the old test claimed first and
  // then asserted on the fresh claim — test bug, not game bug).
  Game.exilePlayer('moot');
  const s2 = Game.state.scholar;
  s2.exileStartDay = (s2.day || 1) - 8;
  ok('F5 re-exile resets the founding project',
     s2.founding === null || s2.founding === undefined,
     'founding=' + JSON.stringify(s2.founding));
  // claim somewhere new (not on the current haven tile): move first, claim after
  farFrom(Game.map.px, Game.map.py);
  const capC = captureSay(() => Game.claimSite());
  const f2 = Game.foundingState();
  ok('F5 second claim lands far from the first haven', capC.r === true &&
     (Math.abs(f2.claimX - haven1.px) + Math.abs(f2.claimY - haven1.py)) > 1,
     `claim (${f2.claimX},${f2.claimY}) vs haven1 (${haven1.px},${haven1.py})`);
  f2.shelterTier = 2; f2.stockpileKcal = 10000;
  Game.map.px = f2.claimX; Game.map.py = f2.claimY;
  const cap = captureSay(() => Game.foundHaven());
  ok('F5 second founding succeeds', cap.r === true && cap.err === null,
     `r=${cap.r} err=${cap.err && cap.err.message}`);
  const name2 = Game.state.village.name;
  ok('F5 haven names stay unique across forks', name1 !== name2, `${name1} vs ${name2}`);
  ok('F5 both old villages archived',
     (Game.state.pastVillages || []).length === 2 &&
     Game.state.pastVillages.includes(haven1),
     `pastVillages=${(Game.state.pastVillages || []).length}`);
  const t1 = Game.tileAt(haven1.px, haven1.py);
  ok('F5 first haven site retagged oldhaven (not a live haven tile)',
     t1 && t1.type === 'oldhaven' && !t1.isHaven,
     `type=${t1 && t1.type}`);
  const t2 = Game.tileAt(Game.map.px, Game.map.py);
  ok('F5 new haven tile is live', t2 && t2.type === 'haven' && t2.isHaven);
}

console.log('== F6: claimSite while not exiled ==');
setup();
{
  const cap = captureSay(() => Game.claimSite());
  ok('F6 claimSite refuses when not exiled',
     cap.r === null && !Game.foundingState().siteClaimed, `r=${cap.r}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
