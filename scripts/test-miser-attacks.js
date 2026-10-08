// MISER adversarial attacks — deterministic proof (before/after).
// Usage: SEED=7 node scripts/test-miser-attacks.js
// Loads full engine (index.html order, minus DOM-only modules), seeded RNG first.
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261008', 10);
// resettable shared RNG installed BEFORE eval (modules capture Math.random at load)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
rng.reset = (s) => { const f = mulberry32(s == null ? SEED : s); const g = rng; const h = f; };
// simpler: replace Math.random with a resettable closure
let _s = SEED;
const R = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
R.reset = (s) => { _s = (s == null ? SEED : s) | 0; };
global.Math.random = R;

// minimal DOM/window stubs for module load (equipment.js needs window)
global.window = global;
global.document = undefined; // modules must not touch document at load
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { eval.call(global, code + `\n//# sourceURL=${f}`); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(2); }
}
// sync path: drop the window stub AFTER eval so combat etc. take sync branches
delete global.window;

const Game = global.Scattering.Game;
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}
function freshGame() {
  R.reset();
  // minimal viable state for storage verbs
  Game.state = {
    scholar: {
      villagerId: 'p1', day: 5, kcal: 2000, inventory: [], caches: [],
      mx: 4, my: 4, insideHaven: true, exiled: false,
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 5,
      roster: ['p1', 'v2', 'v3'],
      trust: { p1: 15, v2: 15, v3: 15 },
      rosterChars: { v2: { name: 'Joren' }, v3: { name: 'Mara' } },
      pantry: [],
    },
    otherVillages: [], pastVillages: [], codex: { places: [] },
  };
  Game.map = { px: 4, py: 4 };
  Game.data = Game.data || {};
  Game.data.items = Game.data.items || [];
  Game._said = [];
  Game.say = (t) => { Game._said.push(String(t)); };
  Game.tickAction = () => null;
  Game.status = () => null;
  Game.observe = () => {};
  return Game;
}
function trustOf() { return (Game.state.village.trust || {}).p1; }

// ---------- ATTACK 1: stash trust farm (donate 10 / take 9) ----------
console.log('A1: donate-10/take-9 trust farm');
{
  freshGame();
  Game.addMaterial('branch', 1000);
  // must be "inside" for takeMaterial; capacity must clear a full pack
  // (1000 branch × 0.5 kg) or the weight check refuses every take
  Game.playerTile = () => ({ type: 'haven' });
  Game.carryCapacity = () => 100000;
  Game.waterWeight = () => 0;
  const t0 = trustOf();
  for (let i = 0; i < 20; i++) { Game.donateMaterial('branch', 10); Game.takeMaterial('branch', 9); }
  const t1 = trustOf();
  const spent = 1000 - Game.materialCount('branch');
  console.log(`  trust ${t0} -> ${t1}, branch spent: ${spent}`);
  ok(t1 - t0 <= 2, 'no materialized trust farm (<=+2 over 20 cycles)', { t0, t1, spent });
}

// ---------- ATTACK 2: cross-material take-back false accusation ----------
console.log('A2: donate branch, take stone — label honesty');
{
  freshGame();
  Game.playerTile = () => ({ type: 'haven' });
  Game.carryCapacity = () => 200;
  Game.waterWeight = () => 0;
  Game.addMaterial('branch', 50);
  Game.state.village.stash = undefined;
  const st = Game.stashState(); st.materials.stone = 50;
  Game._said = [];
  Game.donateMaterial('branch', 10);
  const tBefore = trustOf();
  Game.takeMaterial('stone', 10);
  const tAfter = trustOf();
  const accusedTakeback = Game._said.some(s => s.includes('took back what you gave') || s.includes('took back the tool'));
  console.log(`  trust ${tBefore} -> ${tAfter}; false take-back accusation: ${accusedTakeback}`);
  ok(!accusedTakeback, 'no false take-back accusation across materials', { said: Game._said.slice(-3) });
}

// ---------- ATTACK 3: tool donate/take false accusation ----------
console.log('A3: donate axe, take saw — tool label honesty');
{
  freshGame();
  Game.playerTile = () => ({ type: 'haven' });
  Game.carryCapacity = () => 200;
  Game.waterWeight = () => 0;
  Game.data.items = [
    { id: 'axe', name: 'Axe', class: 'tool', tool: { woodcut: 'fell' }, kg: 1.5 },
    { id: 'saw', name: 'Saw', class: 'tool', tool: { woodcut: 'prune' }, kg: 0.8 },
  ];
  Game.state.scholar.inventory = [{ itemId: 'axe', name: 'Axe', units: 1, kg: 1.5 }];
  Game.state.village.stash = undefined;
  const st = Game.stashState(); st.tools = [{ itemId: 'saw', name: 'Saw' }];
  Game._said = [];
  Game.donateTool(0);
  const tBefore = trustOf();
  Game.takeTool('saw');
  const tAfter = trustOf();
  const accused = Game._said.some(s => s.includes('took back the tool you left'));
  console.log(`  trust ${tBefore} -> ${tAfter}; false tool take-back accusation: ${accused}`);
  ok(!accused, 'taking a different tool is not a take-back', { said: Game._said.slice(-3) });
  // true positive: donating the axe and re-taking the SAME axe still stings
  Game.state.scholar.inventory = [{ itemId: 'axe', name: 'Axe', units: 1, kg: 1.5 }];
  Game.donateTool(0);
  Game._said = [];
  const tb = trustOf();
  Game.takeTool('axe');
  const ta = trustOf();
  const stung = Game._said.some(s => s.includes('took back the tool you left'));
  console.log(`  same-tool take-back: trust ${tb} -> ${ta}, stung=${stung}`);
  ok(stung && ta < tb, 're-taking your own donated tool is still noticed', {});
}

// ---------- ATTACK 4: exiled stash looting ----------
console.log('A4: exiled player loots village stash');
{
  freshGame();
  Game.playerTile = () => ({ type: 'haven' });
  Game.carryCapacity = () => 200;
  Game.waterWeight = () => 0;
  Game.state.village.stash = undefined;
  const st = Game.stashState(); st.materials.wood = 40;
  Game.state.scholar.exiled = true;
  Game.state.scholar.insideHaven = true; // walks back into the hall
  Game._said = [];
  Game.takeMaterial('wood', 5);
  const took = Game.materialCount('wood');
  const refused = Game._said.some(s => s.includes('not yours anymore'));
  console.log(`  exiled take refused=${refused}, wood gained=${took}`);
  ok(refused && took === 0, 'exiled player cannot take from village stash', { said: Game._said.slice(-2) });
  // donations from the exiled are still allowed (gifts toward amends)
  Game.addMaterial('branch', 10);
  Game._said = [];
  Game.donateMaterial('branch', 10);
  const gave = (Game.stashState().materials.branch || 0) >= 10;
  console.log(`  exiled donation accepted=${gave}`);
  ok(gave, 'exiled player can still donate (amends path)', {});
}

// ---------- ATTACK 5: cache theft evasion via village fork ----------
console.log('A5: fork archives old village — caches near old haven still robbable');
{
  freshGame();
  // bury a cache 1 tile from old haven
  Game.map = { px: 5, py: 4 };
  Game.nodeEpithet = () => 'the ridge';
  Game.journalName = () => 'journal';
  Game.fmtKcal = (k) => k + ' kcal';
  Game.addMaterial('branch', 20);
  Game.buryCache('material', 'branch', 20);
  const cache = Game.playerCaches()[0];
  ok(!!cache, 'cache buried', {});
  // fork: old village archived, new haven 8 tiles away
  const oldV = Game.state.village;
  oldV.rosterChars = { v2: { name: 'Joren' }, v3: { name: 'Mara' } };
  Game.state.pastVillages = [oldV];
  Game.state.village = {
    name: 'Emberhold', px: 0, py: 0, day: 5,
    roster: ['p1'], trust: { p1: 15 }, rosterChars: {}, pantry: [],
  };
  Game.state.otherVillages = [];
  // drive the REAL dailyCacheCheck with guaranteed rolls; the robber must
  // come from the OLD village's roster (v2/v3), not the founder-only new one
  Game.cacheTheftChance = () => 1.0;
  Game.vpOf = () => ({ personality: {} });
  Game.npcGoal = () => null;
  Game.displayName = (vid) => ({ v2: 'Joren', v3: 'Mara', p1: 'You' }[vid] || vid);
  Game.personDescriptor = (vid) => 'someone';
  Game.addDoubt = () => null;
  for (let d = 0; d < 3; d++) { Game.state.scholar.day++; try { Game.dailyCacheCheck(); } catch (e) { console.log('  check threw', e.message); } }
  const robber = cache.robbedBy;
  console.log(`  robber after fork: ${robber} (old roster: v2/v3)`);
  ok(cache.found === true && (robber === 'v2' || robber === 'v3'),
    'old-village caches robbed by OLD villagers after fork', { robber });
}

// ---------- ATTACK 6: takeFromCache NaN-units hardening ----------
console.log('A6: cache item with missing units cannot dupe');
{
  freshGame();
  Game.map = { px: 4, py: 4 };
  Game.nodeEpithet = () => 'here';
  Game.journalName = () => 'journal';
  Game.carryCapacity = () => 200;
  Game.waterWeight = () => 0;
  Game.state.scholar.caches = [{
    id: 'cX', node: { x: 4, y: 4 }, desc: 'test', label: 'test',
    items: [{ name: 'Smoked meat', kcalEach: 300, kg: 0.3 }], // NO units field
    found: false, day: 5,
  }];
  Game.takeFromCache('cX', 0, 1);
  Game.takeFromCache('cX', 0, 1);
  Game.takeFromCache('cX', 0, 1);
  const inv = Game.state.scholar.inventory.filter(i => i.name === 'Smoked meat');
  const got = inv.reduce((t, i) => t + (i.units || 0), 0);
  const cacheLeft = Game.playerCaches().length;
  console.log(`  meat drawn from unit-less cache item over 3 takes: ${got}; cache remaining: ${cacheLeft}`);
  ok(got <= 1, 'unit-less cache item yields at most 1 unit total', { got, cacheLeft });
}

// ---------- ATTACK 7: spoil sweep + cache take same tick (double-spend) ----------
console.log('A7: buried food cannot be double-spent via spoil sweep');
{
  freshGame();
  Game.map = { px: 4, py: 4 };
  Game.nodeEpithet = () => 'here';
  Game.journalName = () => 'journal';
  Game.fmtKcal = (k) => k + ' kcal';
  Game.carryCapacity = () => 200;
  Game.waterWeight = () => 0;
  Game.isSpoiled = (it) => !it.material && it.spoilDay <= Game.state.scholar.day;
  Game.state.scholar.inventory = [{ name: 'Berries', kcalEach: 100, units: 4, spoilDay: 5, kg: 0.2 }];
  Game.buryCache('food', 0, 4); // bury all 4, spoilDay 5
  const packAfterBury = Game.state.scholar.inventory.filter(i => i.name === 'Berries').reduce((t, i) => t + (i.units || 0), 0);
  Game.state.scholar.day = 6; // now spoiled
  try { Game.sweepSpoiled(); } catch (e) { console.log('  sweep threw', e.message); }
  const c = Game.playerCaches()[0];
  Game.takeFromCache(c.id, 0, 4); // try to draw the rotted berries
  const packBerries = Game.state.scholar.inventory.filter(i => i.name === 'Berries').reduce((t, i) => t + (i.units || 0), 0);
  console.log(`  pack after bury: ${packAfterBury}, pack berries after sweep+take: ${packBerries}`);
  ok(packAfterBury === 0 && packBerries === 0, 'spoiled buried food is not recoverable', { packAfterBury, packBerries });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
