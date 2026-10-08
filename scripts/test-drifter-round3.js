// DRIFTER adversarial attacks, round 3 (2026-10-08) — break-it style.
// Usage: SEED=7 node scripts/test-drifter-round3.js
// Loads full engine (index.html order, minus DOM-only modules), seeded RNG first.
// Targets: joined-village accounting, exile/return state, probation honesty,
// and a wild-camp endDay crash.
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261008', 10);
let _s = SEED;
const R = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
R.reset = (s) => { _s = (s == null ? SEED : s) | 0; };
global.Math.random = R;

global.window = global;
global.document = undefined;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { eval.call(global, code + `\n//# sourceURL=${f}`); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(2); }
}
delete global.window;

const Game = global.Scattering.Game;
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

function freshGame() {
  R.reset();
  Game.state = {
    scholar: {
      villagerId: 'p1', day: 6, kcal: 2000, inventory: [],
      mx: 4, my: 4, insideHaven: true, exiled: false, drifting: false,
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 6,
      roster: ['p1', 'v2', 'v3'],
      trust: { p1: 15, v2: 15, v3: 15 },
      pantry: [], pantryKcal: 0, water: { clean: 0, dirty: 0 }, gossip: [],
    },
    otherVillages: [], pastVillages: [], codex: { plants: {} },
  };
  Game.map = { px: 4, py: 4 };
  Game.data = Game.data || {};
  Game.data.items = Game.data.items || [];
  Game.data.villagers = [{ id: 'p1', name: 'Test Scholar' }];
  Game._said = [];
  Game.say = (t) => { Game._said.push(String(t)); };
  Game.tickAction = () => null;
  Game.status = () => null;
  Game.observe = () => {};
  Game.journalNote = () => {};
  Game.audioEvent = () => {};
  Game.recordTrauma = () => {};
  Game.villageLearn = () => {};
  Game.depleteRandomTile = () => {};
  Game.turfKcal = () => 0; // barren turf: isolates the eat math exactly
  Game.tileAt = () => ({ type: 'forest', stock: 0, maxStock: 0 }); // strategy scan only
  Game.drama = () => {};
  Game.plantKnown = () => false;
  Game.carryCapacity = () => 100000;
  Game.waterWeight = () => 0;
  Game.nodeEpithet = () => 'the treeline';
  Game.journalName = () => 'journal';
  return Game;
}

function mkVillage(id, name, x, y, pop) {
  return {
    id, name, x, y, day: 1, population: pop, pantryKcal: 50000,
    knowledgeProfile: { plants: {}, focus: 'forager' }, knowledge: 0,
    roster: [], news: [], codex: { plants: {} },
  };
}
const saidHas = (re) => Game._said.some(t => re.test(t));

console.log('== A. SOFTLOCK: wild-camp villageMeal must not throw (endDay aborts otherwise) ==');
{
  freshGame();
  Game.map = { px: 0, py: 0 };
  Game.playerTile = () => ({ type: 'forest' }); // wild tile: camp-wild path
  let threw = null;
  try { Game.villageMeal(); } catch (e) { threw = e; }
  ok(!threw, 'villageMeal camps wild without throwing', threw && (threw.constructor.name + ': ' + threw.message));
  ok(saidHas(/camp wild/i), 'wild-camp message still said');
}

console.log('== B. EXPLOIT: joined village must feed the player ONCE per day ==');
{
  // barren turf => forage = 0.6*need exactly, eat = need, so
  // pantry_after = P - 0.4*need, with need = mouths*2000. Deterministic.
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true; // fiction: you join after exile
  Game.joinVillageReal('vB');       // population 10 -> 11, probation set
  ok(v.population === 11, 'join seats the player (pop 11)', v.population);
  Game.simVillageDay(v);
  // honest: the player's mouth is fed by villageMeal separately, so the
  // collective draw must cover 10 mouths: 50000 - 0.4*10*2000 = 42000.
  // buggy: 11 mouths: 50000 - 0.4*11*2000 = 41200 (double-eat).
  ok(v.pantryKcal === 42000, 'collective draw excludes the joined mouth', v.pantryKcal);
}
{
  // control: unjoined village of 10 still draws for 10
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.simVillageDay(v);
  ok(v.pantryKcal === 42000, 'control: 10 mouths draw 8000', v.pantryKcal);
}

console.log('== C. HELD: probation copy says half shares (betrayal wrap already honest) ==');
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  Game.map = { px: 6, py: 6 }; // at their fire
  Game.state.scholar.kcal = 0;
  v.pantryKcal = 50000;
  Game.villageMeal();
  ok(Game.state.scholar.kcal === 1000, 'probation meal is half (1000)', Game.state.scholar.kcal);
  ok(v.pantryKcal === 49000, 'pantry drawn half only', v.pantryKcal);
}
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  Game.state.scholar.probation = null; // voted in
  v.trust = 20; // earned face: full shares now (wrap gates on trust 15)
  Game.map = { px: 6, py: 6 };
  Game.state.scholar.kcal = 0;
  v.pantryKcal = 50000;
  Game.villageMeal();
  ok(Game.state.scholar.kcal === 2000, 'post-probation meal is full (2000)', Game.state.scholar.kcal);
}

console.log('== D. STATE CORRUPTION: exiled return to the old haven ==');
{
  freshGame();
  const hv = Game.state.village;
  hv.pantry = [{ name: 'Dried meat', kcalEach: 500, units: 4, spoilDay: 9999, safe: true, kg: 0.3, unit: 'strip' }];
  hv.pantryKcal = 2000;
  Game.state.scholar.lastHavenDay = 1;
  Game.state.scholar.day = 6;
  Game.state.scholar.awayNews = ['\u{1F480} someone died while you were gone'];
  Game.exilePlayer('test');
  Game.map = { px: 4, py: 4 };
  Game.playerTile = () => ({ type: 'haven' });
  Game._said = [];
  Game.returnToVillage();
  ok(!saidHas(/come home after|walk back into haven|days gone/i), 'no homecoming welcome beat for an exile', Game._said.slice(0, 3));
  ok(Game.state.scholar.awayNews.length === 1, 'away news not delivered as homecoming', Game.state.scholar.awayNews.length);
  ok(Game.state.scholar.lastHavenDay === 1, 'away clock not reset for an exile', Game.state.scholar.lastHavenDay);
  ok(saidHas(/nobody meets your eyes|not one of ours/i), 'exile gets the cold shoulder, not silence', Game._said.slice(0, 3));
  // and the exilers' pantry stays shut
  Game.state.scholar.kcal = 0;
  Game.villageMeal();
  ok(Game.state.scholar.kcal === 0, 'exile draws no meal from the old pantry', Game.state.scholar.kcal);
  ok(hv.pantry.length === 1 && hv.pantry[0].units === 4, 'old pantry untouched', hv.pantry);
}
{
  // joined-to-B player visiting the OLD haven tile: no meal from A's pantry
  freshGame();
  const hv = Game.state.village;
  hv.pantry = [{ name: 'Dried meat', kcalEach: 500, units: 4, spoilDay: 9999, safe: true, kg: 0.3, unit: 'strip' }];
  const b = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(b);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  Game.map = { px: 4, py: 4 }; // back on A's haven tile
  Game.playerTile = () => ({ type: 'haven' });
  Game.state.scholar.kcal = 0;
  Game._said = [];
  Game.villageMeal();
  ok(Game.state.scholar.kcal === 0, 'joined-elsewhere draws no meal from old pantry', Game.state.scholar.kcal);
  ok(hv.pantry[0].units === 4, 'old pantry untouched by joined visitor', hv.pantry);
  ok(saidHas(/another fire|not yours/i), 'honest refusal, not silence', Game._said.slice(0, 2));
}

console.log('== E. PHANTOM: switching joined villages must release the old seat ==');
{
  freshGame();
  const a = mkVillage('vA', 'Emberhold', 1, 1, 10);
  const b = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(a, b);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vA');
  ok(a.population === 11, 'seated at A', a.population);
  Game.joinVillageReal('vB');
  ok(Game.state.scholar.joinedVillage === 'vB', 'now joined to B');
  ok(a.population === 10, 'old seat at A released (no phantom mouth)', a.population);
  ok(b.population === 11, 'seated at B', b.population);
}

console.log('== G. MANTLE: death while joined lapses the join (no phantom seat) ==');
{
  freshGame();
  Game.data.villagers.push({ id: 'v2', name: 'Second Bearer' });
  Game.npcIds = () => ['v2'];
  Game.endingFrame = () => 'unwritten';
  const b = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(b);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  ok(b.population === 11, 'seated at B before death', b.population);
  let threw = null;
  try { Game.playerDeath('a test death'); } catch (e) { threw = e; }
  ok(!threw, 'playerDeath completes while joined', threw && threw.message);
  ok(b.population === 10, 'seat at B released on death', b.population);
  ok(Game.state.scholar.joinedVillage == null, 'joinedVillage cleared on death', Game.state.scholar.joinedVillage);
  ok(Game.state.scholar.probation == null, 'probation cleared on death', JSON.stringify(Game.state.scholar.probation));
}

console.log('== F. SOFTLOCK ATTEMPT: leave a joined village after probation ==');
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  // serve probation at their fire
  Game.map = { px: 6, py: 6 };
  v.trust = 60;
  for (let i = 0; i < 14; i++) Game.probationTick();
  ok(!Game.state.scholar.probation, 'probation served, voted in');
  // now try to leave: is there ANY engine path?
  const hasLeave =
    (typeof Game.leaveJoinedVillage === 'function') ||
    (typeof Game.unjoinVillage === 'function');
  const card = Game.villageCard ? Game.villageCard('vB') : null;
  const cardHasLeave = !!(card && (card.actions || []).some(a => /leave/i.test(a.id + ' ' + a.label)));
  console.log('  INFO leave-path exists:', hasLeave || cardHasLeave ? 'YES' : 'NO (design gap — documented, not fixed here)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
