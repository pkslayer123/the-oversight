// DRIFTER adversarial attacks, round 4 (2026-10-08) — break-it style.
// Usage: SEED=7 node scripts/test-drifter-round4.js
// Loads full engine (index.html order, minus DOM-only modules), seeded RNG first.
// Target: EXILE MUST LAPSE THE JOIN. exilePlayer('moot') used to leave a live
// join in place — the exiled bearer kept another fire's seat (phantom mouth in
// simVillageDay), kept their probation, and a later foundHaven() forked a
// "hard reset" new haven whose founder was still joined elsewhere — so the
// estranged meal gate (r3 fix) refused them their OWN pantry: starvation at
// your own fire. Same invariant r3 enforced for death (ledger.js); exile is
// the missing leg.
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
  Game.turfKcal = () => 0;
  Game.villagerMealDay = () => ({ ate: 0, gave: 0, drawn: 0 });
}
function mkVillage(id, name, x, y, pop) {
  return {
    id, name, x, y, population: pop, trust: 5, day: 6, pantryKcal: 50000,
    knowledgeProfile: { plants: {}, focus: 'forager' }, knowledge: 0,
    roster: [], news: [], codex: { plants: {} },
  };
}
const saidHas = (re) => Game._said.some(t => re.test(t));

console.log('== A. EXPLOIT: exile must release the joined seat (no phantom mouth) ==');
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true; // fiction: you join after exile
  Game.joinVillageReal('vB');       // population 10 -> 11, probation set
  ok(v.population === 11, 'join seats the player (pop 11)', v.population);
  // the home fire exiles the bearer AGAIN (moot sentence while joined).
  Game.exilePlayer('moot');
  ok(Game.state.scholar.exiled === true, 'exile landed', Game.state.scholar.exiled);
  ok(Game.state.scholar.joinedVillage == null, 'exile clears joinedVillage', Game.state.scholar.joinedVillage);
  ok(Game.state.scholar.probation == null, 'exile clears probation', JSON.stringify(Game.state.scholar.probation));
  ok(v.population === 10, 'seat released (pop back to 10)', v.population);
}
console.log('== B. EXPLOIT: no seat accumulation across exile/rejoin ==');
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  Game.exilePlayer('moot');
  Game.joinVillageReal('vB');
  ok(v.population === 11, 'rejoin seats exactly once (pop 11)', v.population);
}
console.log('== C. SOFTLOCK: a founded haven feeds its own founder ==');
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  Game.exilePlayer('moot'); // stale join must not survive this
  // meet the founding requirements honestly via stubs of the gated project
  Game.state.scholar.founding = { siteClaimed: true, shelterTier: 3, stockpileKcal: 99999, claimX: 5, claimY: 5 };
  Game.state.scholar.exileStartDay = 1; // 5 solo days served
  Game.foundingReqs = () => ({ minSoloDays: 1, shelterTier: 1, stockpileKcal: 1000, timberPerTier: [0, 4, 8, 12] });
  Game.foundingState = () => Game.state.scholar.founding;
  const r = Game.foundHaven();
  ok(r === true, 'founding succeeds', r);
  ok(Game.state.scholar.joinedVillage == null, 'fork clears joinedVillage (hard reset)', Game.state.scholar.joinedVillage);
  ok(Game.state.scholar.probation == null, 'fork clears probation (hard reset)', JSON.stringify(Game.state.scholar.probation));
  ok(v.population === 10, 'fork releases the old seat', v.population);
  // stand at the new fire; the fork promises a fresh pantry that feeds you.
  Game.map = { px: 5, py: 5 };
  Game.playerTile = () => ({ type: 'haven' });
  Game.state.scholar.kcal = 0;
  Game.state.scholar.trust = undefined;
  Game.state.village.trust = { p1: 60 };
  Game.villageMeal();
  ok(!saidHas(/another fire/i), 'no estranged refusal at your own fire', Game._said.slice(-2).join(' | '));
  ok(Game.state.scholar.kcal > 0, 'founder eats from the new pantry', Game.state.scholar.kcal);
}
console.log('== D. HONESTY: exile text keeps no hidden attachments ==');
{
  freshGame();
  const v = mkVillage('vB', 'Stonebridge', 6, 6, 10);
  Game.state.otherVillages.push(v);
  Game.state.scholar.exiled = true;
  Game.joinVillageReal('vB');
  Game.exilePlayer('moot');
  ok(saidHas(/leave with what you carry/i), 'exile line still said');
  ok(!Game.state.scholar.joinedVillage && !Game.state.scholar.probation, 'nothing crosses the road but self/codex/pack');
}

console.log('== E. EXPLOIT: the abandoned haven site is not a teleport ==');
{
  freshGame();
  // the world: 9x9 tiles, old haven at (4,4)
  Game.map.tiles = [];
  for (let y = 0; y < 9; y++) { Game.map.tiles.push([]); for (let x = 0; x < 9; x++) Game.map.tiles[y].push({ type: 'forest' }); }
  Game.map.tiles[4][4] = { type: 'haven', isHaven: true };
  Game.state.scholar.exiled = true;
  Game.state.scholar.founding = { siteClaimed: true, shelterTier: 3, stockpileKcal: 99999, claimX: 5, claimY: 5 };
  Game.state.scholar.exileStartDay = 1;
  Game.foundingReqs = () => ({ minSoloDays: 1, shelterTier: 1, stockpileKcal: 1000, timberPerTier: [0, 4, 8, 12] });
  Game.foundingState = () => Game.state.scholar.founding;
  const r = Game.foundHaven();
  ok(r === true, 'founding succeeds', r);
  const oldTile = Game.tileAt(4, 4), newTile = Game.tileAt(5, 5);
  ok(newTile.type === 'haven', 'new site is the live haven', newTile.type);
  ok(oldTile.type !== 'haven', 'old site is no longer a haven tile', oldTile.type);
  ok(oldTile.type === 'oldhaven', 'old site retagged oldhaven', oldTile.type);
  // walk back onto the old site: no PIN (feet stay at 4,4), estranged beat, haul pools
  Game.map.px = 4; Game.map.py = 4;
  Game.state.scholar.inventory = [{ name: 'Dried meat', kcalEach: 400, units: 10 }];
  Game.returnToOldVillage(oldTile);
  ok(Game.map.px === 4 && Game.map.py === 4, 'no cross-map snap (position kept)', Game.map.px + ',' + Game.map.py);
  ok(saidHas(/Nobody meets your eyes/i), 'estranged line said at the old fire');
  const archived = Game.state.pastVillages.find(v => v.name === 'Haven');
  const pooled = (archived.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  ok(pooled === 2000, 'haul pooled into the old pantry (kept a day)', pooled);
  // the old pantry is not yours: standing there is not "in reach" of YOUR fire
  Game.playerTile = () => Game.tileAt(4, 4);
  ok(Game.pantryInReach() === false, 'old site is not pantry-in-reach', Game.pantryInReach());
  // and the travelTo dispatch no longer routes the old site to returnToVillage
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/js/game.js'), 'utf8');
  ok(/tile\.type === 'oldhaven'\) this\.returnToOldVillage\(tile\)/.test(src), 'travelTo dispatches oldhaven to the estranged beat');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
