// PROOF: REAL RESOURCE DEPLETION (2026-10-10, PROGRESSION.md §9)
// Foraging grounds deplete with harvest pressure and regrow slowly over
// seasons. Fishing, trapping, and farming are NECESSARY builds, not flavor.
// Neighboring villages work overlapping grounds → the commons problem.
//
//   DEPLETION CURVES: stripGround is the one path (sustainable takes free,
//     stripping -5 vigor, scraping -2). Vigor caps stock; rest heals +2/day.
//   REGROWTH: stock +1/2days (pressure slows), vigor +2/rested-day.
//   LEGIBLE: ground state (lush→thinning→picked-over→barren) via groundLine;
//     nodeDetail + map never show raw numbers; reads go stale.
//   KNOWLEDGE-GATED: groundLine null until read (forage/examine/villager
//     report); the mechanic itself is never gated.
//   FAIR: forager-heavy village feels pressure ~day 14-21, not instant death.
//   BUILDS: fishing / trapping / farming each carry real kcal.
//   COMMONS: shared-ground strain → rumors → speaker deal → sim changes.
//
// Usage: node scripts/test-depletion-20261010.js [SEED]
// Run x3 seeds: 11, 22, 33.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '11', 10);

const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['knowledge.json', 'knowledge'],
  ['nameCultures.json', 'nameCultures'], ['originPicker.json', 'originPicker'],
  ['foreignSpeech.json', 'foreignSpeech'], ['lifeseeds.json', 'lifeseeds'],
  ['arrivalText.json', 'arrivalText'], ['justiceVoice.json', 'justiceVoice'],
  ['alienPlayers.json', 'alienPlayers'], ['regions.json', 'regions'],
  ['dramaEffects.json', 'dramaEffects'], ['monsterBehaviors.json', 'monsterBehaviors'],
  ['contests.json', 'contests'], ['events.json', 'events'],
  ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { global.SCATTER_DATA[key] = []; }
}
// SEED BEFORE EVAL (2026-10-08): modules capture Math.random at load.
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rng() { return _rng(); }
rng.reset = (s) => { _rng = mulberry32(s); };
Math.random = rng;

global.window = global;
// FULL src/js list in index.html order (minus DOM-only app.js/sprites.js/
// tile-scenes.js/move-anim.js/drama.js).
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js',
  'perceive.js', 'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js',
  'corruption.js', 'lifeseed.js', 'progression.js', 'ledger.js', 'abilityActions.js',
  'monsterBehaviors.js', 'statusEffects.js', 'villager-agency.js', 'fieldFights.js',
  'villager-objectives.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.unlockedWave = function() { return 1; };
Game.monsterWavePool = function() { return (this.data.monsters || []).filter(m => (m.wave || 1) <= 1); };

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const said = [];
Game.say = function(m) { said.push(String(m)); };
Game.sysSay = function(m) { said.push(String(m)); };
Game.drama = function() {};

function freshGame() {
  rng.reset(SEED);
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.trauma = 0;
  Game.state.over = false;
  Game.state.activeContest = null; Game.state.pendingContest = null;
  Game.playerAtHaven = function() { return true; };
  const v = Game.state.village;
  v.trust = v.trust || {};
  for (const rid of (v.roster || [])) v.trust[rid] = 70;
  return v;
}
function packKcal() {
  return (Game.state.scholar.inventory || [])
    .reduce((t, i) => t + ((i.kcalEach || 0) + (i.hiddenKcal || 0)) * (i.units || 1), 0);
}

console.log('== 1. DEPLETION CURVES (stripGround / vigor / caps) ==');
{
  freshGame();
  const t = Game.tileAt(3, 4);
  t.maxStock = 3; t.stock = 3; t.vigor = 100;
  // sustainable takes: stock 3->2->1 cost nothing
  let r = Game.stripGround(t, 2);
  ok('sustainable takes free', r.taken === 2 && r.eroded === 0 && t.vigor === 100, JSON.stringify(r));
  // stripping the last wounds vigor 5
  r = Game.stripGround(t, 1);
  ok('stripping wounds vigor 5', t.stock === 0 && t.vigor === 95, `vigor=${t.vigor}`);
  // scraping bare ground costs 2/take
  r = Game.stripGround(t, 3);
  ok('scraping erodes 2/take', t.vigor === 89, `vigor=${t.vigor}`);
  // vigor caps stock
  t.vigor = 40;
  ok('tGroundCap scales with vigor', Game.tGroundCap(t) === 1, `cap=${Game.tGroundCap(t)}`);
  t.vigor = 0;
  ok('dead ground holds nothing', Game.tGroundCap(t) === 0 && Game.depletionLevel(t) === 'barren');
  // levels
  t.vigor = 100; t.stock = 3;
  ok('lush at full', Game.depletionLevel(t) === 'lush');
  t.stock = 2;
  ok('thinning at 2/3', Game.depletionLevel(t) === 'thinning', Game.depletionLevel(t));
  t.stock = 1;
  ok('picked at 1/3', Game.depletionLevel(t) === 'picked', Game.depletionLevel(t));
  t.stock = 0;
  ok('barren at 0', Game.depletionLevel(t) === 'barren');
  // yield multiplier
  ok('vigorYieldMult 100->1.0', Game.vigorYieldMult(100) === 1.0);
  ok('vigorYieldMult 0->0.35 floor', Game.vigorYieldMult(0) === 0.35);
  const mid = Game.vigorYieldMult(50);
  ok('vigorYieldMult 50 in (0.35,1)', mid > 0.35 && mid < 1.0, String(mid));
}

console.log('== 2. REGROWTH (slow vigor, slower stock) ==');
{
  freshGame();
  const t = Game.tileAt(2, 4);
  t.maxStock = 3; t.stock = 0; t.vigor = 40; t.foragePressure = 0; t.foragedToday = false;
  Game.state.scholar.day = 10;
  const v0 = t.vigor;
  Game.regrowTiles();
  ok('rested vigor heals +2/day', t.vigor === v0 + 2, `vigor ${v0}->${t.vigor}`);
  // BAL-SURVIVAL 2026-10-10: rest is reachable now. Lightly-worked ground
  // (foraged but not stripped/scraped) breathes +1/day; only stripped ground
  // skips the heal on the day it was stripped. The old "worked ground never
  // heals" gate was the one-way ratchet.
  t.foragedToday = true; t.erodedToday = false; t.foragePressure = 2;
  Game.regrowTiles();
  ok('lightly-worked ground heals +1', t.vigor === v0 + 3, `vigor=${t.vigor}`);
  t.erodedToday = true;
  const vE = t.vigor;
  Game.regrowTiles();
  ok('stripped ground does not heal the same day', t.vigor === vE, `vigor=${t.vigor}`);
  // heavy pressure wounds further
  t.foragePressure = 9; t.foragedToday = false;
  const v1 = t.vigor;
  Game.regrowTiles();
  ok('pressure 9 wounds vigor', t.vigor === v1 - 2, `vigor ${v1}->${t.vigor}`);
  // stock regrows every 2 days, capped by vigor
  t.vigor = 100; t.stock = 0; t.foragePressure = 0; t.foragedToday = false;
  Game.state.scholar.day = 12; // even
  Game.regrowTiles();
  ok('stock +1 on even day', t.stock === 1, `stock=${t.stock}`);
  Game.state.scholar.day = 13; // odd
  Game.regrowTiles();
  ok('no stock on odd day', t.stock === 1, `stock=${t.stock}`);
  // dead ground grows nothing
  t.vigor = 0; t.stock = 0;
  Game.state.scholar.day = 14;
  Game.regrowTiles();
  ok('dead ground grows nothing', t.stock === 0, `stock=${t.stock}`);
}

console.log('== 3. KNOWLEDGE GATING (reads, not numbers) ==');
{
  freshGame();
  Game.map.px = 3; Game.map.py = 4;
  const t = Game.tileAt(3, 4);
  t.maxStock = 3; t.stock = 1; t.vigor = 100;
  // unread: no ground line
  t.groundReadDay = null;
  ok('groundLine null when unread', Game.groundLine(t) === null);
  const nd = Game.nodeDetail();
  ok('nodeDetail hides state when unread',
    nd.here.some(h => /haven.t read yet/.test(h)), JSON.stringify(nd.here));
  // read: honest descriptor, no numbers
  Game.readGround(3, 4);
  const gl = Game.groundLine(t);
  ok('groundLine reads picked-over', gl && /picked-over/.test(gl), gl);
  ok('no raw numbers in ground line', !/\d/.test(gl), gl);
  // map class gated on staleness
  t.revealed = true;
  Game.mapSeen = function() { return true; };
  const cls = Game.depletionClass(t, 3, 4);
  ok('map shows picked when read fresh', cls === 'depleted-picked', cls);
  Game.state.scholar.day = 30; // read was day 1
  ok('map hides stale reads', Game.depletionClass(t, 3, 4) === '', Game.depletionClass(t, 3, 4));
  // examine reads the ground
  freshGame();
  Game.map.px = 2; Game.map.py = 5;
  const t2 = Game.tileAt(2, 5);
  t2.groundReadDay = null;
  try { Game.examineCell(4, 4); } catch (e) {}
  ok('examine reads ground', t2.groundReadDay != null, String(t2.groundReadDay));
}

console.log('== 4. DAYS-TO-PRESSURE (forager-heavy village, 30d) ==');
{
  const v = freshGame();
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const foragers = roster.slice(0, 6);
  const _origStock = Game.stockPantry;
  let forageKcal = 0;
  Game.stockPantry = function(kcal, name, opts) {
    if (/forag/i.test(name || '')) forageKcal += kcal;
    return _origStock.call(this, kcal, name, opts);
  };
  const income = [], pantry = [], vigorCurve = [];
  const DAYS = 30;
  for (let d = 1; d <= DAYS; d++) {
    Game.state.scholar.day = d;
    forageKcal = 0;
    for (let part = 1; part <= 2; part++) {
      for (const fid of foragers) { try { Game.assignTask(fid, 'forage', { via: 'in-person' }); } catch (e) {} }
      try { Game.resolveAssignments(); } catch (e) {}
    }
    try { Game.endDay(); } catch (e) { console.log('  endDay fail d' + d + ': ' + e.message); break; }
    Game.state.scholar.day = d + 1;
    income.push(forageKcal);
    pantry.push(Math.round(Game.pantryKcalLive(v)));
    let mv = 100;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const t = Game.tileAt(x, y);
      if (t && t.maxStock && Math.abs(x - 4) + Math.abs(y - 4) <= 4) mv = Math.min(mv, t.vigor == null ? 100 : t.vigor);
    }
    vigorCurve.push(Math.round(mv));
  }
  Game.stockPantry = _origStock;
  const w1 = income.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  // BAL-SURVIVAL 2026-10-10: rotation makes daily income oscillate (crews
  // rest tiles, then work them) — a single-day dip is not pressure. The
  // slow memory is vigor: it must erode GRADUALLY under the stress scenario
  // (not instant, not never).
  console.log(`  week1 avg ${Math.round(w1)}/day, vigor d7=${vigorCurve[6]} d14=${vigorCurve[13]} d20=${vigorCurve[19]}, pantry ${pantry[0]}->${pantry[pantry.length - 1]}`);
  ok('week-1 forage income healthy (not instant pressure)', w1 > 3000, 'w1=' + Math.round(w1));
  ok('vigor erodes gradually, not instantly (d7 minVigor > 65)', vigorCurve[6] > 65, 'd7=' + vigorCurve[6]);
  ok('vigor erodes for real, not never (d20 minVigor < 85)', vigorCurve[19] < 85, 'd20=' + vigorCurve[19]);
  ok('no starvation before day 14 (pantry survives pressure onset)', pantry[13] > 0, 'pantry d14=' + pantry[13]);
  // vigor actually eroded (the slow memory did work)
  let minVigor = 100;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t && t.maxStock && Math.abs(x - 4) + Math.abs(y - 4) <= 4) minVigor = Math.min(minVigor, t.vigor == null ? 100 : t.vigor);
  }
  ok('home turf vigor eroded by harvest pressure', minVigor < 85, 'minVigor=' + Math.round(minVigor));
}

console.log('== 5. FISHING VIABLE ==');
{
  freshGame();
  const s = Game.state.scholar;
  const creeks = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t.type === 'creek' || t.type === 'wetland') creeks.push({ x, y });
  }
  ok('creeks exist', creeks.length > 0, String(creeks.length));
  // every creek holds fish (guaranteed)
  let fishless = 0;
  for (const c of creeks) {
    const wl = Game.tileAt(c.x, c.y).wildlife || {};
    if (!((wl.creek_chub || 0) + (wl.bluegill || 0))) fishless++;
  }
  ok('every creek holds fish', fishless === 0, fishless + ' fishless');
  s.inventory.push({ itemId: 'fishing_line', name: 'Fishing line', units: 1, kg: 0.1 });
  for (let i = 0; i < 3; i++) s.inventory.push({ itemId: 'gill_net', name: 'Gill net', units: 1, kg: 0.5 });
  const _consume = Game.consumeItem;
  Game.consumeItem = function(id) {
    const inv = Game.state.scholar.inventory;
    const ix = inv.findIndex(i => i.itemId === id);
    if (ix >= 0) inv.splice(ix, 1);
  };
  for (let i = 0; i < Math.min(3, creeks.length); i++) {
    Game.map.px = creeks[i].x; Game.map.py = creeks[i].y;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    Game.setNet();
  }
  Game.consumeItem = _consume;
  Game.state.codex.fishWise = true;
  let total = 0;
  const DAYS_F = 14;
  for (let d = 1; d <= DAYS_F; d++) {
    Game.state.scholar.day = d;
    const before = packKcal();
    const fishCount = (c) => {
      const wl = (Game.tileAt(c.x, c.y).wildlife || {});
      return (wl.creek_chub || 0) + (wl.bluegill || 0);
    };
    const ordered = [...creeks].sort((a, b) => fishCount(b) - fishCount(a));
    Game.map.px = ordered[0].x; Game.map.py = ordered[0].y;
    for (let a = 0; a < 8; a++) { try { Game.fish(); } catch (e) {} }
    try { Game.checkNets(); } catch (e) {}
    try { Game.simEcology(); } catch (e) {}
    total += Math.max(0, packKcal() - before);
    Game.state.scholar.day = d + 1;
  }
  const perDay = total / DAYS_F;
  let fishLeft = 0;
  for (const c of creeks) {
    const wl = Game.tileAt(c.x, c.y).wildlife || {};
    fishLeft += (wl.creek_chub || 0) + (wl.bluegill || 0);
  }
  console.log(`  fishing ${DAYS_F}d total ${Math.round(total)} kcal (${Math.round(perDay)}/day), fish left ${fishLeft}`);
  // DESIGN-HONEST: fishing is a strong supplement (feeds 2-3), not a solo
  // pillar — farming is the pillar. 500/day is the viability floor for a
  // dedicated fisher working line + 3 nets. (Sibling's 2026-10-10 trap
  // rebalance settled the net at 0.35/1-3 haul; the line is the fisher's
  // labor, and it pays.)
  ok('fishing carries real kcal (>=500/day for a dedicated fisher)', perDay >= 500, Math.round(perDay) + '/day');
  ok('the fishery survives the fisher (no collapse)', fishLeft > 200, 'fish left ' + fishLeft);
}

console.log('== 6. TRAPPING VIABLE ==');
{
  freshGame();
  const spots = [];
  for (let y = 0; y < 9 && spots.length < 4; y++) for (let x = 0; x < 9 && spots.length < 4; x++) {
    const t = Game.tileAt(x, y);
    if (['grove', 'forest_floor', 'thicket'].includes(t.type)) spots.push({ x, y });
  }
  for (const sp of spots) {
    const t = Game.tileAt(sp.x, sp.y);
    t.traps = t.traps || [];
    t.traps.push({ recipeId: 'snare', mx: 4, my: 4, setDay: 1, uses: 10 });
  }
  let total = 0;
  const DAYS_T = 14;
  for (let d = 1; d <= DAYS_T; d++) {
    Game.state.scholar.day = d;
    const before = packKcal();
    try { Game.checkTraps(); } catch (e) {}
    try { Game.simEcology(); } catch (e) {}
    total += Math.max(0, packKcal() - before);
    Game.state.scholar.day = d + 1;
  }
  const perDay = total / DAYS_T;
  console.log(`  trapping ${DAYS_T}d total ${Math.round(total)} kcal (${Math.round(perDay)}/day)`);
  // DESIGN-HONEST: trapping is a supplement (a few snares feed 1-2), not a
  // pillar. 250/day is the viability floor for 4 snares.
  ok('trapping carries real kcal (>=250/day for 4 snares)', perDay >= 250, Math.round(perDay) + '/day');
}

console.log('== 7. FARMING VIABLE ==');
{
  freshGame();
  const s = Game.state.scholar;
  Game.map.px = 4; Game.map.py = 4;
  for (let i = 0; i < 6; i++) Game.makePlot();
  ok('6 plots made', Game.gardenPlots().length === 6, String(Game.gardenPlots().length));
  Game.grantKnowledge('plant', 'cattail', 2, { type: 'background' });
  const cattail = (Game.data.plants || []).find(p => p.id === 'cattail');
  s.inventory.push({ plantId: 'cattail', units: 20, kcalEach: cattail.caloriesPerUnit, spoilDay: 999, name: cattail.name, unit: cattail.unit, kg: 0.1 });
  for (let i = 0; i < 6; i++) Game.sowPlot('cattail');
  ok('6 plots sown', Game.gardenPlots().filter(p => p.pid).length === 6);
  // knowledge gate: unknown plant refuses
  const plotsBefore = Game.gardenPlots().filter(p => p.pid).length;
  Game.makePlot = Game.makePlot; // noop
  let total = 0;
  for (let d = 1; d <= 30; d++) {
    Game.state.scholar.day = d;
    const before = packKcal();
    try { Game.tendGarden(); } catch (e) {}
    try { Game.harvestGarden(); } catch (e) {}
    try { Game.gardenTick(); } catch (e) {}
    total += Math.max(0, packKcal() - before);
    Game.state.scholar.day = d + 1;
  }
  const perDay = total / 30;
  console.log(`  farming 30d total ${Math.round(total)} kcal (${Math.round(perDay)}/day)`);
  ok('farming carries the shortfall (>=5000/day at full build)', perDay >= 5000, Math.round(perDay) + '/day');
  // neglect kills the garden
  freshGame();
  const s2 = Game.state.scholar;
  Game.map.px = 4; Game.map.py = 4;
  Game.makePlot();
  Game.grantKnowledge('plant', 'cattail', 1, { type: 'background' });
  s2.inventory.push({ plantId: 'cattail', units: 4, kcalEach: 120, spoilDay: 999, name: 'Cattail', unit: 'bundle', kg: 0.1 });
  Game.sowPlot('cattail');
  for (let d = 1; d <= 10; d++) {
    Game.state.scholar.day = d;
    try { Game.gardenTick(); } catch (e) {}
    Game.state.scholar.day = d + 1;
  }
  ok('untended garden dies (honest upkeep)', Game.gardenPlots()[0].dead === true);
}

console.log('== 8. COMMONS (strain -> rumor -> deal) ==');
{
  freshGame();
  const ov = Game.state.otherVillages[0];
  ov.x = 6; ov.y = 4; // overlapping turf with haven
  for (let d = 1; d <= 12; d++) {
    Game.state.scholar.day = d;
    try { Game.simVillageDay(ov); } catch (e) {}
    try { Game.regrowLand(d); } catch (e) {}
    try { Game.commonsTick(); } catch (e) { console.log('  commonsTick fail: ' + e.message); }
    Game.state.scholar.day = d + 1;
  }
  ok('strain accrued on shared ground', (ov.commons && ov.commons.strainUs) > 0, 'strainUs=' + ((ov.commons || {}).strainUs));
  ok('rumor fired (said aloud, not silent)', said.some(m => /Fresh-cut stems/.test(m)));
  // speaker deal: split
  ov.trust = 30;
  Game.map.px = 6; Game.map.py = 4;
  const card = Game.villageCard(ov.id);
  ok('territory action on card', (card.actions || []).some(a => a.id === 'territory'));
  Game.villageCardAction(ov.id, 'territory', {});
  Game.villageCardAction(ov.id, 'deal_split', {});
  ok('split deal lands', ov.commons.deal === 'split', ov.commons.deal);
  // deal changes the sim: their takes avoid haven turf
  let nearHaven = 0, total = 0;
  const origStrip = Game.stripGround;
  Game.stripGround = function(t, n, opts) {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (Game.tileAt(x, y) === t) {
        total++;
        if (Math.abs(x - 4) + Math.abs(y - 4) <= 3) nearHaven++;
        break;
      }
    }
    return origStrip.call(this, t, n, opts);
  };
  for (let i = 0; i < 10; i++) Game.depleteRandomTile(3, ov.x, ov.y, { byVillage: ov });
  Game.stripGround = origStrip;
  ok('split deal keeps their hands off our turf', nearHaven === 0, nearHaven + '/' + total + ' near haven');
}

console.log('== 9. UI HONESTY (forage copy, no silent nerf) ==');
{
  freshGame();
  Game.map.px = 3; Game.map.py = 4;
  const t = Game.tileAt(3, 4);
  t.maxStock = 3; t.stock = 3; t.vigor = 30; // tired ground
  t.detail = null; // keep the sweep abstract-safe
  // force a harvestable setup: give the tile a detail grid via genDetail
  const detail = Game.genDetail(3, 4);
  let green = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const c = detail[y] && detail[y][x];
    if (c === 'plant' || c === 'bush') green++;
  }
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  try { Game.doAction('forage', { cx: 4, cy: 4 }); } catch (e) { console.log('  forage fail: ' + e.message); }
  const msg = said.join(' ');
  ok('tired ground says weeks not days', /weeks/i.test(msg), msg.slice(0, 120));
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
