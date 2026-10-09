// MISER BREAK-IT — 2026-10-09 playtest loop, archetype 7 (miser).
// Hostile player vs the storage systems: stash, caches, pantry-adjacent.
// Attacks: trust farms, hoard-without-cost, duplication, spoilage bypass,
// robbery double-dip, softlocks, honesty of labels.
// Usage: node scripts/test-miser-breakit-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// SEED BEFORE EVAL (AGENTS.md 2026-10-08): modules capture Math.random at load.
let _s = 0xC0FFEE;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_s);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// equipment.js needs window at load; delete before playing (sync combat path).
global.window = global;
const ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
ORDER.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${g}, want ${w}`); }
}
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ': ' + extra : ''}`); }
}
function lastSay() { return (Game.log || []).slice(-1)[0] || ''; }
function trustOf() { const v = Game.state.village, vid = Game.state.scholar.villagerId; return (v.trust || {})[vid]; }

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.insideHaven = true;
  try { Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4; } catch (e) {}
  return Game.havenStoresAccess();
}
function carryKg() {
  return (Game.state.scholar.inventory || []).reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0) + (Game.waterWeight ? Game.waterWeight() : 0);
}
function mkFood(units, spoilInDays) {
  return { name: 'Smoked venison', kcalEach: 120, units, spoilDay: Game.state.scholar.day + spoilInDays, kg: 0.2, safe: true, diseaseRisk: { p: 0.35, disease: 'gut_rot' }, poisonRisk: { p: 0.1, toxin: 'x' } };
}

(async () => {
  await Game.init();

  // ============ A. DONATE/TAKE TRUST FARM (re-verify 2026-10-08 fix) ============
  // NOTE: the hostile player keeps a light pack (spends what they take) —
  // weight limits are a separate, honest gate (see H).
  {
    const acc = freshGame();
    ok('A0 stash access inside haven', acc === 'inside', acc);
    const t0 = trustOf();
    for (let i = 0; i < 30; i++) {
      Game.addMaterial('branch', 10);
      Game.donateMaterial('branch', 10);
      Game.takeMaterial('branch', 9);
      Game.spendMaterial('branch', 9); // used up, pack stays light
    }
    const t1 = trustOf();
    // HONEST RATE (not a farm): 30 cycles leave +30 net branches in the stash
    // = 3 ten-unit bands = +3 trust. Every point costs 10 genuinely-donated
    // units. The 2026-10-08 free farm printed +1/cycle at zero net cost.
    eq('A1 donate10/take9 x30 grants only honest bands', t1, t0 + 3);
    // net left in stash: 30 units of branch actually donated. honest.
    eq('A2 stash holds the honest net', Game.stashState().materials.branch, 30);
    // zero-net cycling is actively punished (take-back sting) — fresh ledger:
  {
    freshGame();
    Game.addMaterial('branch', 10);
    Game.donateMaterial('branch', 10);
    const t2 = trustOf();
    Game.takeMaterial('branch', 10);
    ok('A3 donate10/take10 nets negative (sting)', trustOf() < t2,
      `${t2} -> ${trustOf()}`);
  }
  }

  // ============ B. CROSS-MATERIAL TAKE-BACK (design: communal use) ============
  {
    freshGame();
    Game.addMaterial('branch', 20);
    Game.stashState().materials.stone = 50; // someone else's stone
    const t0 = trustOf();
    Game.donateMaterial('branch', 10); // +1 trust (band)
    const t1 = trustOf();
    ok('B1 branch donation earns a band', t1 === t0 + 1, `${t0} -> ${t1}`);
    Game.takeMaterial('stone', 10); // communal use, not take-back
    const t2 = trustOf();
    // no -5 sting (nothing taken back); the band system still notes stone net
    // going 0 -> -10 (crosses a band): -1. communal use isn't free past 10u.
    eq('B2 taking other material: no sting, one band note', t2, t1 - 1);
    ok('B3 no take-back say', !/took back/i.test(Game.log.slice(-3).join(' ')));
  }

  // ============ C. HOARD TO ZERO, THEN DRAIN FREE ============
  {
    freshGame();
    Game.stashState().materials.wood = 200;
    let hoardSeen = 0;
    const origObserve = Game.observe;
    Game.observe = function (k, d) { if (k === 'hoard') hoardSeen++; return origObserve.call(this, k, d); };
    for (let i = 0; i < 40; i++) { Game.takeMaterial('wood', 5); Game.spendMaterial('wood', 5); }
    Game.observe = origObserve;
    eq('C1 trust bottoms at 0, never negative', trustOf(), 0);
    eq('C2 stash fully drained', Game.stashState().materials.wood, 0);
    ok('C3 hoard was observed (socially punished)', hoardSeen > 0, `seen ${hoardSeen}x`);
    // after bottoming out, further takes cost nothing more — by design?
    Game.stashState().materials.wood = 10;
    const tBefore = trustOf();
    Game.takeMaterial('wood', 5);
    eq('C4 at trust 0, taking costs nothing further', trustOf(), tBefore);
  }

  // ============ D. BURY/DIG ROUND-TRIP CONSERVATION ============
  {
    freshGame();
    Game.addMaterial('branch', 10);
    Game.state.scholar.inventory.push(mkFood(5, 30));
    const foodIdx = Game.state.scholar.inventory.findIndex(i => i.name === 'Smoked venison');
    Game.buryCache('material', 'branch', 4);
    Game.buryCache('food', foodIdx, 3);
    eq('D1 materials leave the pack', Game.materialCount('branch'), 6);
    const packFood = Game.state.scholar.inventory.find(i => i.name === 'Smoked venison');
    eq('D2 pack keeps the remainder', packFood.units, 2);
    const caches = Game.playerCaches();
    eq('D3 two caches', caches.length, 2);
    // dig up the food cache at the right node
    const fc = caches.find(c => c.items.some(i => i.name === 'Smoked venison'));
    Game.map.px = fc.node.x; Game.map.py = fc.node.y;
    Game.digUpCache(fc.id);
    const dug = Game.state.scholar.inventory.filter(i => i.name === 'Smoked venison');
    const totalUnits = dug.reduce((t, i) => t + i.units, 0);
    eq('D4 units conserved (2 pack + 3 dug)', totalUnits, 5);
    const dugStack = dug.find(i => i.units === 3) || dug[0];
    eq('D5 diseaseRisk survives burial', dugStack.diseaseRisk && dugStack.diseaseRisk.p, 0.35);
    eq('D6 poisonRisk survives burial', dugStack.poisonRisk && dugStack.poisonRisk.p, 0.1);
    eq('D7 kcalEach survives burial', dugStack.kcalEach, 120);
    // no aliasing: dug stack's risk object must not be the pack stack's
    const other = dug.find(i => i !== dugStack);
    if (other) ok('D8 risk objects not aliased', other.diseaseRisk !== dugStack.diseaseRisk);
    else { pass++; }
    // materials cache
    const mc = Game.playerCaches().find(c => c.items.some(i => i.material === 'branch'));
    Game.map.px = mc.node.x; Game.map.py = mc.node.y;
    Game.digUpCache(mc.id);
    eq('D9 materials conserved', Game.materialCount('branch'), 10);
    eq('D10 no caches left', Game.playerCaches().length, 0);
  }

  // ============ E. SPOILAGE UNDERGROUND (no freezer exploit) ============
  {
    freshGame();
    Game.state.scholar.inventory.push(mkFood(4, 1)); // spoils tomorrow
    const idx = Game.state.scholar.inventory.findIndex(i => i.name === 'Smoked venison');
    Game.buryCache('food', idx, 4);
    Game.state.scholar.day += 5; // a long time passes
    const c = Game.playerCaches()[0];
    Game.map.px = c.node.x; Game.map.py = c.node.y;
    const before = Game.state.scholar.inventory.length;
    Game.digUpCache(c.id);
    eq('E1 spoiled food does not come back', Game.state.scholar.inventory.length, before);
    eq('E2 cache is gone (left for worms)', Game.playerCaches().length, 0);
    ok('E3 honest narration', /gone bad|worms/i.test(Game.log.slice(-4).join(' ')));
  }

  // ============ F. ROBBED CACHE DOUBLE-DIP ============
  {
    freshGame();
    Game.addMaterial('branch', 6);
    Game.buryCache('material', 'branch', 6);
    const c = Game.playerCaches()[0];
    Game.map.px = c.node.x; Game.map.py = c.node.y;
    Game.resolveCacheRobbery(c);
    ok('F1 robbery marks found', c.found === true);
    eq('F2 robbery empties items', c.items.length, 0);
    const invBefore = JSON.stringify(Game.state.scholar.inventory);
    Game.takeFromCache(c.id, 0, 1); // reaching into a robbed hole
    eq('F3 takeFromCache on robbed cache: nothing gained', JSON.stringify(Game.state.scholar.inventory), invBefore);
    ok('F4 discovery narrated', /got here first|disturbed/i.test(Game.log.slice(-3).join(' ')));
    eq('F5 cache removed after discovery', Game.playerCaches().length, 0);
    Game.addMaterial('branch', 6);
    Game.buryCache('material', 'branch', 6);
    const c2 = Game.playerCaches()[0];
    Game.map.px = c2.node.x; Game.map.py = c2.node.y;
    Game.resolveCacheRobbery(c2);
    Game.digUpCache(c2.id);
    eq('F6 digUpCache on robbed cache: materials stay lost', Game.materialCount('branch'), 0);
    eq('F7 cache removed after dig discovery', Game.playerCaches().length, 0);
  }

  // ============ G. SOFTLOCK: DIG AT WRONG NODE ============
  {
    freshGame();
    Game.addMaterial('branch', 4);
    Game.buryCache('material', 'branch', 4);
    const c = Game.playerCaches()[0];
    const dayPartBefore = Game.dayPart;
    Game.map.px = c.node.x + 3; Game.map.py = c.node.y + 3; // walk away first
    const res = Game.digUpCache(c.id); // player is NOT at the cache node
    eq('G1 wrong-node dig returns null', res, null);
    eq('G2 no time consumed on refusal', Game.dayPart, dayPartBefore);
    eq('G3 cache intact', Game.playerCaches().length, 1);
    eq('G4 materials still buried, not duped', Game.materialCount('branch'), 0);
    ok('G5 honest direction given', /not here|journal/i.test(lastSay()));
  }

  // ============ H. HONESTY: "TAKE 5" LABEL VS REALITY ============
  {
    freshGame();
    Game.stashState().materials.wood = 3;
    Game.takeMaterial('wood', 5);
    ok('H1 takes only what exists, says so', /Took 3 Wood logs/i.test(lastSay()), lastSay());
    Game.spendMaterial('wood', 3); // burn it — pack stays light for the weight test
    // weight-limited take (pack at 19/20 incl. 2L water)
    Game.state.scholar.inventory.push({ name: 'Anvil of regrets', units: 1, kg: 17, kcalEach: 0 });
    Game.stashState().materials.branch = 10;
    Game.takeMaterial('branch', 5); // carry 19/20, branch 0.5kg -> fits 2
    ok('H2 weight-limited take says the real number', /Took 2 Branches/i.test(lastSay()), lastSay());
    eq('H3 stash debited by actual', Game.stashState().materials.branch, 8);
  }

  // ============ I. EXPLOIT: takeTool SKIPS THE WEIGHT CHECK ============
  {
    freshGame();
    // give + donate a hatchet so the stash holds a tool
    Game.state.scholar.inventory.push({ itemId: 'hatchet', name: 'Hatchet', units: 1, kcalEach: 0, kg: 0.8 });
    const t0 = trustOf();
    Game.donateTool(0);
    eq('I1 tool donation grants +2', trustOf(), Math.min(100, t0 + 2));
    // fill the pack to capacity
    Game.state.scholar.inventory.push({ name: 'Rocks of burden', units: 1, kg: 19.5, kcalEach: 0 });
    const max = Game.carryCapacity();
    ok('I2 pack is at/over capacity', carryKg() >= max, `${carryKg().toFixed(1)}/${max}`);
    const kgBefore = carryKg();
    Game.takeTool('hatchet'); // every other take path refuses here
    const over = carryKg() > max;
    eq('I3 takeTool at capacity: refused, pack unchanged', carryKg(), kgBefore);
    ok('I3b refusal is honest', /Too heavy for the Hatchet/i.test(lastSay()), lastSay());
    eq('I3c tool stays in the stash', Game.stashState().tools.length, 1);
    // and under capacity it still works
    Game.state.scholar.inventory.pop(); // drop the rocks
    Game.takeTool('hatchet');
    eq('I3d takeTool under capacity works', Game.stashState().tools.length, 0);
  }

  // ============ J. TOOL DONATE/TAKE CYCLE ============
  {
    freshGame();
    Game.state.scholar.inventory.push({ itemId: 'hatchet', name: 'Hatchet', units: 1, kcalEach: 0, kg: 0.8 });
    const t0 = trustOf();
    Game.donateTool(0);
    Game.takeTool('hatchet');
    eq('J1 donate(+2)/take-back(-5) nets negative', trustOf(), t0 - 3);
    ok('J2 take-back noticed aloud', /took back the tool/i.test(Game.log.slice(-4).join(' ')));
  }

  // ============ K. SOFTLOCK: MANTLE PASS KEEPS CACHES ============
  {
    freshGame();
    const oldId = Game.state.scholar.villagerId;
    Game.addMaterial('branch', 5);
    Game.buryCache('material', 'branch', 5);
    const placesBefore = (Game.state.codex.places || []).length;
    Game.playerDeath('a test of the mantle');
    const newId = Game.state.scholar.villagerId;
    ok('K1 a successor steps up', newId && newId !== oldId, `${oldId} -> ${newId}`);
    eq('K2 caches survive the mantle (journal inheritance)', Game.playerCaches().length, 1);
    ok('K3 cache location memory survives', (Game.state.codex.places || []).length >= placesBefore);
    ok('K4 game continues (village-as-protagonist)', !Game.over);
  }

  // ============ L. TAKEFROMCACHE ON FULLY-SPOILED STACK TERMINATES ============
  {
    freshGame();
    Game.state.scholar.inventory.push(mkFood(3, 1));
    const idx = Game.state.scholar.inventory.findIndex(i => i.name === 'Smoked venison');
    Game.buryCache('food', idx, 3);
    Game.state.scholar.day += 5;
    const c = Game.playerCaches()[0];
    Game.map.px = c.node.x; Game.map.py = c.node.y;
    Game.takeFromCache(c.id, 0, 2); // destroys 2 spoiled
    ok('L1 partial spoiled take leaves the cache', Game.playerCaches().length === 1);
    Game.takeFromCache(c.id, 0, 9); // destroys the rest
    eq('L2 cache removed when empty', Game.playerCaches().length, 0);
    eq('L3 nothing edible gained', Game.state.scholar.inventory.filter(i => i.name === 'Smoked venison').length, 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
