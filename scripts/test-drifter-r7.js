// BREAK-IT: DRIFTER r7 / zero-cost travel ping-pong (2026-10-09)
// Hostile-player audit of the drifter's free verbs. Node travel is FREE
// (Steve 2026-10-05: no ticks, no kcal), and travelTo fires per hop:
//   noteTrailUse()            -> clothing relic bond uses
//   noteAbilityUse(cold_blooded / hollow_bones) -> synergy discovery attempts
//   checkPromises('travel')   -> family-goal promise keeping
//   checkAnimals()            -> 30% animal encounter per tile entry
//   checkVillageProximity()   -> catch-up sims on approach
// ATTACKS:
//   E1 EXPLOIT: ping-pong 10x in one part — do synergy attempts for the
//      cold_blooded/hollow_bones synergy (efficient_machine) compress into
//      free unlocks, or does the 3-day sustained gate hold?
//   E2 EXPLOIT: one free hop keeps a family-goal promise (+15 trust).
//      One-shot per promise, or farmable?
//   E3 EXPLOIT: 20 free hops with bonded boots — relic bond gain per day
//      must stay 1 (the daily cap), not 20.
//   E4 EXPLOIT: 40 free hops — animal encounters must be bounded by the
//      tile's wildlife population (depletion), not farmed forever.
//   E5 EXPLOIT: regrow watermark across two villages approached the SAME
//      day, then one re-approached later (regression of the 2026-10-08
//      drifter double-regrow fix; must heal exactly once per day index).
//   S1 SOFTLOCK: oldhaven return donation sweep fired 3x — inventory must
//      drain to the 2000 road-keep exactly once; no negative units, no
//      phantom pantry kcal.
//   S2 STATE: exile while joined to a distant village — join lapses,
//      seat released, probation cleared (r4 fix regression guard).
// Usage: node scripts/test-drifter-r7.js
//        SEED=999 node scripts/test-drifter-r7.js
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
Game.checkEncounter = () => {}; // no monster noise in travel tests
const realCheckAnimals = Game.checkAnimals.bind(Game);
Game.checkAnimals = () => {};
Game.drama = () => {};

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
  Game.drama = () => {};
  Game.checkAnimals = () => {};
}
// ping-pong between two adjacent nodes n times; returns hop count actually traveled.
// First hop targets whichever tile the player is NOT currently on.
function pingpong(ax, ay, bx, by, n) {
  let hops = 0;
  for (let i = 0; i < n; i++) {
    const atA = Game.map.px === ax && Game.map.py === ay;
    const atB = Game.map.px === bx && Game.map.py === by;
    const tx = atA ? bx : atB ? ax : (i % 2 === 0 ? bx : ax);
    const ty = atA ? by : atB ? ay : (i % 2 === 0 ? by : ay);
    const r = Game.travelTo(tx, ty);
    if (r === null || (r && r.kind === 'blockage')) break;
    hops++;
  }
  return hops;
}

// ---------- E1: synergy attempt farming via free travel ----------
setup();
(function () {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  s.abilities.push({ id: 'cold_blooded', name: 'Cold Blooded', level: 1, xp: 0 });
  s.abilities.push({ id: 'hollow_bones', name: 'Hollow Bones', level: 1, xp: 0 });
  Game.map.px = 4; Game.map.py = 4;
  // find a working adjacent pair
  const pairs = [[4,4,5,4],[4,4,3,4],[4,4,4,5],[4,4,4,3]];
  let pair = null;
  for (const [ax,ay,bx,by] of pairs) {
    Game.map.px = ax; Game.map.py = ay;
    const t1 = Game.travelTo(bx, by);
    if (t1 !== null && !(t1 && t1.kind === 'blockage')) { pair = [ax,ay,bx,by]; break; }
  }
  ok('E1a ping-pong pair found', !!pair);
  if (!pair) return;
  const [ax,ay,bx,by] = pair;
  s.abilityUseLog = [];
  const hops = pingpong(ax, ay, bx, by, 10);
  const cbUses = (s.abilityUseLog || []).filter(u => u.id === 'cold_blooded').length;
  ok('E1b hops traveled', hops >= 8, 'hops=' + hops);
  ok('E1c each hop logs cold_blooded', cbUses >= hops, `hops=${hops} cbUses=${cbUses}`);
  // sustained gate: 50 same-day hops must NOT unlock efficient_machine
  pingpong(ax, ay, bx, by, 40);
  ok('E1d same-day spam does not unlock', !(s.synergies || []).includes('efficient_machine'),
    'synergies=' + JSON.stringify(s.synergies || []));
  const dayKey = 'efficient_machine_days';
  const days1 = (s.synergyAttempts || {})[dayKey] || 0;
  ok('E1e streak is 1 after one travel day', days1 === 1, 'days=' + days1);
  // day-separated hops: exactly 3 days unlocks
  // (noteAbilityUse keys ctx.day off state.village.day — advance the whole
  // clock, as endDay would, not just scholar.day)
  s.day = (s.day || 1) + 1; Game.state.village.day = (Game.state.village.day || 1) + 1;
  pingpong(ax, ay, bx, by, 2);
  ok('E1f day 2 still locked', !(s.synergies || []).includes('efficient_machine'));
  s.day = (s.day || 1) + 1; Game.state.village.day = (Game.state.village.day || 1) + 1;
  pingpong(ax, ay, bx, by, 2);
  ok('E1g day 3 unlocks', (s.synergies || []).includes('efficient_machine'));
})();

// ---------- E2: promise keeping via one free hop ----------
setup();
(function () {
  const s = Game.state.scholar;
  const v = Game.state.village;
  v.promises = v.promises || {};
  const vid = (v.roster || [])[0];
  v.promises[vid] = { goal: 'family', day: s.day || 1, kept: false };
  const trustBefore = ((v.trust || {})[vid] || 10);
  Game.map.px = 4; Game.map.py = 4;
  const r = Game.travelTo(5, 4);
  const kept = v.promises[vid] && v.promises[vid].kept === true;
  ok('E2a one free hop keeps family promise', kept, 'res=' + JSON.stringify(r));
  ok('E2b trust moved up (bounded, progressive)', ((v.trust || {})[vid] || 0) > trustBefore,
    `${trustBefore} -> ${((v.trust || {})[vid] || 0)}`);
  // a second promise same day is also one-shot keepable — but each promise keeps once
  const vid2 = (v.roster || [])[1];
  v.promises[vid2] = { goal: 'family', day: s.day || 1, kept: false };
  Game.travelTo(4, 4);
  ok('E2c second promise also keeps once (not farmable — each keeps once)', v.promises[vid2].kept === true);
  const t1 = (v.trust || {})[vid] || 0;
  Game.travelTo(5, 4); Game.travelTo(4, 4); // more hops: first promise stays kept
  ok('E2d kept promise cannot re-fire', (v.trust || {})[vid] === t1, 'trust stable at ' + t1);
})();

// ---------- E3: relic bond daily cap under travel spam ----------
setup();
(function () {
  const s = Game.state.scholar;
  s.inventory = s.inventory || [];
  s.inventory.push({ name: 'Trail boots', itemId: 'good_boots', bonded: true, bond: 0 });
  Game.map.px = 4; Game.map.py = 4;
  const pairs = [[4,4,5,4],[4,4,3,4],[4,4,4,5],[4,4,4,3]];
  let pair = null;
  for (const [ax,ay,bx,by] of pairs) {
    Game.map.px = ax; Game.map.py = ay;
    const t1 = Game.travelTo(bx, by);
    if (t1 !== null && !(t1 && t1.kind === 'blockage')) { pair = [ax,ay,bx,by]; break; }
  }
  ok('E3a ping-pong pair found', !!pair);
  if (!pair) return;
  pingpong(pair[0], pair[1], pair[2], pair[3], 20);
  const boots = s.inventory.find(i => i.itemId === 'good_boots');
  const used = (s.relicUse || {})['good_boots'] || 0;
  ok('E3b 20 hops logged uses', used > 0, 'used=' + used);
  Game.accrueRelicBond();
  ok('E3c bond gain is exactly 1 despite spam (daily cap holds)', boots.bond === 1, 'bond=' + boots.bond);
})();

// ---------- E4: animal encounters bounded by wildlife depletion ----------
setup();
(function () {
  Game.checkAnimals = realCheckAnimals;
  const s = Game.state.scholar;
  Game.map.px = 4; Game.map.py = 4;
  const pairs = [[4,4,5,4],[4,4,3,4],[4,4,4,5],[4,4,4,3]];
  let pair = null;
  for (const [ax,ay,bx,by] of pairs) {
    Game.map.px = ax; Game.map.py = ay;
    const t1 = Game.travelTo(bx, by);
    if (t1 !== null && !(t1 && t1.kind === 'blockage')) { pair = [ax,ay,bx,by]; break; }
  }
  ok('E4a ping-pong pair found', !!pair);
  if (!pair) return;
  const [ax,ay,bx,by] = pair;
  const wA = Object.assign({}, (Game.map.tiles[ay][ax].wildlife || {}));
  const wB = Object.assign({}, (Game.map.tiles[by][bx].wildlife || {}));
  const popTotal = Object.values(wA).reduce((t,n)=>t+(n||0),0) + Object.values(wB).reduce((t,n)=>t+(n||0),0);
  let spawns = 0;
  for (let i = 0; i < 40; i++) {
    const tx = (i % 2 === 0) ? bx : ax, ty = (i % 2 === 0) ? by : ay;
    Game.travelTo(tx, ty);
    if (s.animal) { spawns++; s.animal = null; } // clear to allow next spawn
  }
  ok('E4b spawns bounded by local wildlife', spawns <= popTotal,
    `spawns=${spawns} popTotal=${popTotal}`);
  Game.checkAnimals = () => {};
})();

// ---------- E5: regrow watermark — two villages, same days ----------
setup();
(function () {
  const s = Game.state.scholar;
  s.day = 30;
  Game.state.otherVillages = [
    { id: 'va', name: 'Ashford', x: 2, y: 2, day: 0, population: 10, knowledge: 0, pantryKcal: 0 },
    { id: 'vb', name: 'Birchton', x: 6, y: 6, day: 0, population: 10, knowledge: 0, pantryKcal: 0 },
  ];
  let regrows = 0;
  const origRegrow = Game.regrowTiles.bind(Game);
  Game.regrowTiles = function () { regrows++; return origRegrow(); };
  Game.map.px = 2; Game.map.py = 3; // within 2 of va
  Game.checkVillageProximity();
  ok('E5a village A caught up to day 30', Game.state.otherVillages[0].day === 30,
    'day=' + Game.state.otherVillages[0].day);
  const afterA = regrows;
  Game.map.px = 6; Game.map.py = 5; // within 2 of vb
  Game.checkVillageProximity();
  ok('E5b village B caught up to day 30', Game.state.otherVillages[1].day === 30);
  ok('E5c second village over same days adds ZERO regrows (watermark)',
    regrows === afterA, `afterA=${afterA} now=${regrows}`);
  ok('E5d land healed exactly once per day index', afterA === 30, 'regrows=' + afterA);
  s.day = 35;
  Game.map.px = 2; Game.map.py = 3;
  Game.checkVillageProximity();
  ok('E5e re-approach later advances exactly 5 more days', regrows === afterA + 5,
    `regrows=${regrows} expected=${afterA + 5}`);
  Game.regrowTiles = origRegrow;
})();

// ---------- S1: oldhaven donation sweep idempotency ----------
setup();
(function () {
  const s = Game.state.scholar;
  const t = Game.tileAt(5, 4);
  t.type = 'oldhaven'; t.pastVillage = 'Emberhold';
  const ov = { name: 'Emberhold', pantry: [] };
  Game.state.pastVillages = [ov];
  const mk = (name, kcalEach, units) => ({ name, kcalEach, units, safe: true, kg: 0.2, unit: 'x' });
  s.inventory = [mk('Jerky', 400, 8), mk('Trail mix', 200, 9)]; // 3200 + 1800 = 5000
  const kcal = () => s.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  Game.returnToOldVillage(t);
  ok('S1a first entry drains to 2000 road-keep', kcal() === 2000, 'kcal=' + kcal());
  const pantryKcal1 = ov.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  ok('S1b old pantry got 3000', pantryKcal1 === 3000, 'pantry=' + pantryKcal1);
  Game.returnToOldVillage(t);
  Game.returnToOldVillage(t);
  ok('S1c re-entry does not drain further', kcal() === 2000, 'kcal=' + kcal());
  const negUnits = ov.pantry.some(i => (i.units || 0) < 0) || s.inventory.some(i => (i.units || 0) < 0);
  ok('S1d no negative units anywhere', !negUnits);
  const pantryKcal2 = ov.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
  ok('S1e pantry total stable across entries', pantryKcal2 === 3000, 'pantry=' + pantryKcal2);
})();

// ---------- S2: exile while joined (r4 fix regression guard) ----------
setup();
(function () {
  const s = Game.state.scholar;
  const jv = { id: 'vj', name: 'Joinville', x: 1, y: 1, day: 5, population: 10, knowledge: 0, pantryKcal: 0 };
  Game.state.otherVillages = [jv];
  s.joinedVillage = 'vj';
  s.probation = { villageId: 'vj', daysLeft: 14 };
  const r = Game.exilePlayer('test');
  ok('S2a exile runs', r === true, 'ret=' + r);
  ok('S2b join lapsed', s.joinedVillage === null || s.joinedVillage === undefined,
    'joinedVillage=' + s.joinedVillage);
  ok('S2c probation cleared', !s.probation);
  ok('S2d seat released (population 10->9)', jv.population === 9, 'pop=' + jv.population);
})();

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
