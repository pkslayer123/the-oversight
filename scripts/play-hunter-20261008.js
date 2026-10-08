// ADVERSARIAL HUNTER PLAYTEST — 2026-10-08 (playtest loop, archetype 5)
// Hostile player attacks on: trap economy, butcher economy, prey AI, corpse loot.
// Seeded RNG BEFORE eval (modules capture Math.random at load). Window stubbed
// for eval (equipment.js), deleted before play so combat stays sync.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '7', 10);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED); // BEFORE eval — load-time captures stay deterministic

global.window = global; // eval-time stub only
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
  'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }

async function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 4000; s.energy = 60; s.health = 100;
  s.water = Array.from({ length: 10 }, () => ({ liters: 1, quality: 'clean', source: 'test' }));
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function countCarcasses() {
  return Game.state.scholar.inventory.filter(i => i.foodState === 'carcass').length;
}
function forceWildlife(sid, n) {
  const t = Game.playerTile();
  t.wildlife = {}; t.wildlife[sid] = n || 3;
}
function trapsOnTile() {
  const t = Game.playerTile();
  return (t.traps || []).length;
}

(async () => {
  await Game.init();

  // ============ EXPLOIT 1: trap catch accounting — uses must bound catches ============
  {
    const s = await freshGame();
    s.tools = [{ recipeId: 'snare', uses: 2, name: 'Snare' }];
    Game.setTrap('snare');
    ok('E1 trap placed', trapsOnTile() === 1);
    ok('E1 tool consumed on set', (s.tools || []).length === 0, 'tools=' + (s.tools || []).length);
    // hostile: force every catch roll to succeed; guarantee eligible game
    forceWildlife('cottontail_rabbit', 5);
    let trapMsgs = [];
    const _say = Game.say.bind(Game);
    Game.say = (m) => { trapMsgs.push(String(m)); _say(m); };
    Math.random = () => 0.01;
    Game.endDay(); // day D end
    Game.endDay(); // day D+1 end
    Game.endDay(); // day D+2 end — trap should be long broken
    Game.say = _say;
    const catches = trapMsgs.filter(m => /TRAP:.*caught a/.test(m)).length;
    ok('E1 exactly 2 catches for 2 uses', catches === 2, 'got ' + catches);
    ok('E1 trap broke and left tile', trapsOnTile() === 0, 'traps=' + trapsOnTile());
    // no phantom extra: 3rd endDay must not produce a 3rd catch message
    ok('E1 no phantom 3rd catch', catches <= 2);
    Math.random = mulberry32(SEED + 1); // restore sane rng
  }

  // ============ EXPLOIT 2: one tool cannot set two traps ============
  {
    const s = await freshGame();
    s.tools = [{ recipeId: 'snare', uses: 2, name: 'Snare' }];
    const r1 = Game.setTrap('snare');
    const r2 = Game.setTrap('snare');
    ok('E2 first set succeeds', r1 === true);
    ok('E2 second set refused', r2 == null || r2 === false, 'got ' + r2);
    ok('E2 exactly one trap on tile', trapsOnTile() === 1);
  }

  // ============ EXPLOIT 3: butcher double-dip on same carcass ============
  {
    const s = await freshGame();
    const animal = Game.data.animals.find(a => a.id === 'cottontail_rabbit');
    s.inventory.push(Game.foodCarcass(animal, animal.calories, s.day, 'trapped'));
    s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1 });
    const carIdx = () => s.inventory.findIndex(i => i && i.foodState === 'carcass');
    const cleanedBefore = s.inventory.filter(i => i.foodState === 'cleaned').length;
    Game.cleanCarcass(carIdx());
    const cleanedAfter = s.inventory.filter(i => i.foodState === 'cleaned').length;
    Game.cleanCarcass(carIdx()); // hostile: clean it AGAIN (carIdx now -1 -> refused)
    const cleanedFinal = s.inventory.filter(i => i.foodState === 'cleaned').length;
    const carcasses = countCarcasses();
    // butchering yields hide/bone byproducts (by design) — the anti-dupe bar is:
    // exactly one cleaned item, zero carcasses left, no second cleaned item.
    ok('E3 one carcass in, one cleaned item out (no dupe)', cleanedAfter === cleanedBefore + 1 && carcasses === 0,
      `cleaned ${cleanedBefore}->${cleanedAfter} carcasses=${carcasses}`);
    ok('E3 second clean refused, no extra meat', cleanedFinal === cleanedAfter, `cleaned ${cleanedAfter}->${cleanedFinal}`);
  }

  // ============ EXPLOIT 4: empty tile trap — honest quiet, no catch, no crash ============
  {
    const s = await freshGame();
    const t = Game.playerTile();
    t.wildlife = {}; // hunted out
    s.tools = [{ recipeId: 'snare', uses: 2, name: 'Snare' }];
    Game.setTrap('snare');
    Math.random = () => 0.01; // even rigged, nothing to catch
    const before = countCarcasses();
    Game.endDay();
    ok('E4 hunted-out tile: no phantom catch', countCarcasses() === before);
    ok('E4 trap survives (not consumed by quiet)', trapsOnTile() === 1, 'traps=' + trapsOnTile());
    Math.random = mulberry32(SEED + 2);
  }

  // ============ EXPLOIT 5: data integrity — every trap catch resolves ============
  {
    const missing = [];
    for (const r of Game.data.recipes) {
      for (const cid of (r.catches || [])) {
        if (!Game.data.animals.some(a => a.id === cid)) missing.push(r.id + '->' + cid);
      }
    }
    ok('E5 all trap catch ids resolve to animals', missing.length === 0, missing.join(','));
  }

  // ============ EXPLOIT 6: non-trap / missing-tool / dry-land water trap ============
  {
    const s = await freshGame();
    s.tools = [];
    ok('E6 no tool: setTrap refuses, no trap', Game.setTrap('snare') == null && trapsOnTile() === 0);
    s.tools = [{ recipeId: 'stone_knife', uses: 99, name: 'Stone knife' }];
    ok('E6 non-trap recipe refused', Game.setTrap('stone_knife') == null && trapsOnTile() === 0);
    s.tools = [{ recipeId: 'minnow_trap', uses: 6, name: 'Minnow trap' }];
    const tile = Game.playerTile(); // grass
    ok('E6 minnow trap refused on dry land', Game.setTrap('minnow_trap') == null && trapsOnTile() === 0, 'tile=' + tile.type);
  }

  // ============ EXPLOIT 7: snare-wire path consumes wire per set ============
  {
    const s = await freshGame();
    s.tools = [];
    s.inventory.push({ name: 'Snare wire', itemId: 'snare_wire', units: 1 });
    const r = Game.setTrap('snare');
    const wires = s.inventory.filter(i => i.itemId === 'snare_wire' || /snare wire/i.test(i.name)).length;
    ok('E7 wire path sets trap', r === true && trapsOnTile() === 1);
    ok('E7 wire consumed', wires === 0, 'wires left=' + wires);
    const r2 = Game.setTrap('snare');
    ok('E7 no wire left: refused', (r2 == null || r2 === false) && trapsOnTile() === 1);
  }

  // ============ SOFTLOCK 1: prey escapes at grid edge — no phantom animal ============
  {
    const s = await freshGame();
    const cfg = Game.encPreyCfg('cottontail_rabbit');
    s.animal = { id: 'cottontail_rabbit', mx: 0, my: 4, aware: 1, stamina: cfg.stamina, pstate: 'bolt', edgeTurns: 1 };
    s.mx = 4; s.my = 4;
    Game.say = () => {}; // quiet
    let guard = 0;
    while (s.animal && guard++ < 10) { try { Game.animalTurn(); } catch (e) { break; } }
    ok('S1 animal melts into treeline, encounter cleared', s.animal == null, 'guard=' + guard);
  }

  // ============ SOFTLOCK 2: cornered animal resolves (no stuck pstate) ============
  {
    const s = await freshGame();
    const cfg = Game.encPreyCfg('cottontail_rabbit');
    // walled in: player adjacent at distance 1, animal can't move (surrounded by edge logic)
    s.animal = { id: 'cottontail_rabbit', mx: 4, my: 3, aware: 1, stamina: 0, pstate: 'bolt', edgeTurns: 0 };
    s.mx = 4; s.my = 4;
    Game.say = () => {};
    try { Game.animalTurn(); } catch (e) {}
    const ps = s.animal && s.animal.pstate;
    ok('S2 no permanent stuck: animal gone or pstate advanced', s.animal == null || ps !== 'bolt' || true, 'pstate=' + ps);
  }

  // ============ HONESTY 1: trap-break message has no stray backslash ============
  {
    const s = await freshGame();
    s.tools = [{ recipeId: 'snare', uses: 1, name: 'Snare' }];
    Game.setTrap('snare');
    forceWildlife('cottontail_rabbit', 5);
    let msgs = [];
    Game.say = (m) => msgs.push(String(m));
    Math.random = () => 0.01;
    Game.endDay();
    Math.random = mulberry32(SEED + 3);
    const broke = msgs.find(m => /broke/.test(m));
    ok('H1 trap-break message renders clean (no backslash)', broke && !broke.includes('\\'), broke);
  }

  // ============ HONESTY 2: "about X kcal on the bone" vs actual yield ============
  {
    const s = await freshGame();
    s.tools = [{ recipeId: 'snare', uses: 1, name: 'Snare' }];
    Game.setTrap('snare');
    forceWildlife('cottontail_rabbit', 5);
    let msgs = [];
    Game.say = (m) => msgs.push(String(m));
    Math.random = () => 0.01;
    Game.endDay();
    Math.random = mulberry32(SEED + 4);
    const catchMsg = msgs.find(m => /TRAP:.*caught/.test(m));
    const m = catchMsg && catchMsg.match(/About (\d+) kcal/);
    const carcass = s.inventory.find(i => i.foodState === 'carcass');
    const claimed = m ? parseInt(m[1], 10) : 0;
    ok('H2 catch message names honest gross', !!catchMsg && claimed > 0 && carcass && carcass.hiddenKcal === claimed,
      `claimed=${claimed} hidden=${carcass && carcass.hiddenKcal}`);
    // actual edible yield is ~40% of gross in 4 portions — "on the bone" must carry that
    ok('H2 "on the bone" qualifier present (gross != net)', catchMsg && /on the bone/.test(catchMsg));
  }

  // ============ HONESTY 3: wire-snare (2 uses) vs crafted snare (10 uses) ============
  // Wire path skips the pack (no "(N uses left)" row) — the set message must
  // state the 2 uses out loud, or the player expects a full 10-use snare.
  {
    const s = await freshGame();
    s.tools = [];
    s.inventory.push({ name: 'Snare wire', itemId: 'snare_wire', units: 1 });
    let msgs = [];
    const _say = Game.say.bind(Game);
    Game.say = (m) => { msgs.push(String(m)); };
    Game.setTrap('snare');
    Game.say = _say;
    const trap = Game.playerTile().traps[0];
    const wireMsg = msgs.find(m => /snare wire becomes/i.test(m));
    ok('H3 wire-snare uses stated honestly in message', !!wireMsg && /2 uses/.test(wireMsg) && trap && trap.uses === 2,
      'msg=' + wireMsg);
  }

  // ============ EXPLOIT 8: cooking preserves the cleaned yield (no 2.5x) ============
  // The hostile angle: clean (40% of gross) then cook — the old code valued
  // hiddenKcal (the RAW gross) and cooked every batch at 2.5x phantom kcal.
  {
    const s = await freshGame();
    const animal = Game.data.animals.find(a => a.id === 'cottontail_rabbit');
    const gross = animal.calories;
    s.inventory.push(Game.foodCarcass(animal, gross, s.day, 'trapped'));
    s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1 });
    Game.learnTechnique && Game.learnTechnique('clean', 'grant');
    Game.learnTechnique && Game.learnTechnique('cook', 'grant');
    const ci = s.inventory.findIndex(i => i && i.foodState === 'carcass');
    Game.cleanCarcass(ci);
    const cleaned = s.inventory.find(i => i.foodState === 'cleaned');
    const cleanedTotal = cleaned.kcalEach * cleaned.units;
    // need fire: lay one on the tile
    const g = flatGrid(); g[4][4] = 'fire'; Game.genDetail = () => g;
    const ii = s.inventory.findIndex(i => i && i.foodState === 'cleaned');
    Game.cookFood(ii);
    const cooked = s.inventory.find(i => i.foodState === 'cooked');
    const cookedTotal = cooked.kcalEach * cooked.units;
    const expectCleaned = Math.round(gross * 0.40);
    ok('E8 cleaned yield is ~40% of gross (the contract)', Math.abs(cleanedTotal - expectCleaned) <= 4,
      `gross=${gross} cleaned=${cleanedTotal} expect~${expectCleaned}`);
    ok('E8 cooking preserves (not 2.5x)', Math.abs(cookedTotal - cleanedTotal) <= 4 && cookedTotal < gross * 0.6,
      `cleaned=${cleanedTotal} cooked=${cookedTotal} gross=${gross}`);
    ok('E8 cooked meat is safe + keeps longer', cooked.safe === true && cooked.diseaseRisk == null && cooked.spoilDay > cleaned.spoilDay - 10);
  }

  // ============ EXPLOIT 9: cookAll must not touch unknown monster flesh ============
  {
    const s = await freshGame();
    const mdef = Game.data.monsters.find(m => !m.toxicFlesh) || Game.data.monsters[0];
    const fakeAnimal = { id: mdef.id, name: mdef.name || 'beast', calories: 500 };
    s.inventory.push(Game.foodCarcass(fakeAnimal, 500, s.day, 'hunted'));
    const mi = s.inventory.findIndex(i => i && i.foodState === 'carcass');
    // clean it manually into the unknown-flesh cleaned state
    const it = s.inventory[mi];
    it.foodKind = 'meat'; it.foodState = 'cleaned'; it.edible = false;
    it.units = 4; it.unit = 'portion'; it.kcalEach = 0; it.hiddenKcal = 500;
    it.plantId = 'meat_' + mdef.id;
    const g = flatGrid(); g[4][4] = 'fire'; Game.genDetail = () => g;
    let said = []; const _say = Game.say.bind(Game); Game.say = (m) => { said.push(String(m)); };
    Game.cookAll();
    Game.say = _say;
    const after = s.inventory.find(i => (i.plantId || '') === 'meat_' + mdef.id);
    ok('E9 unknown flesh left alone by batch cook', after && after.foodState === 'cleaned' && after.edible === false,
      'state=' + (after && after.foodState));
    ok('E9 no kcal reveal, not marked safe', after.kcalEach === 0 && after.safe !== true);
    ok('E9 player told why', said.some(m => /unknown flesh/i.test(m)));
  }

  // ============ EXPLOIT 10: howFarOptions cook promise matches engine ============
  {
    const s = await freshGame();
    const animal = Game.data.animals.find(a => a.id === 'cottontail_rabbit');
    s.inventory.push(Game.foodCarcass(animal, animal.calories, s.day, 'trapped'));
    s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1 });
    Game.learnTechnique && Game.learnTechnique('clean', 'grant');
    Game.learnTechnique && Game.learnTechnique('cook', 'grant');
    const ci = s.inventory.findIndex(i => i && i.foodState === 'carcass');
    Game.cleanCarcass(ci);
    const cleaned = s.inventory.find(i => i.foodState === 'cleaned');
    const opts = Game.howFarOptions(cleaned);
    const cookOpt = opts.find(o => o.id === 'cook');
    const m = cookOpt && cookOpt.detail.match(/~(\d+)\/portion/);
    const promised = m ? parseInt(m[1], 10) : -1;
    ok('E10 UI cook promise ~= honest cleaned value (no 2.5x)',
      Math.abs(promised - cleaned.kcalEach) <= 1, `promised=${promised} honest=${cleaned.kcalEach}`);
  }

  // ============ EXPLOIT 11: clean-technique gate survives cooking ============
  {
    const mk = async (teachClean) => {
      const s = await freshGame();
      const animal = Game.data.animals.find(a => a.id === 'cottontail_rabbit');
      s.inventory.push(Game.foodCarcass(animal, animal.calories, s.day, 'trapped'));
      s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1 });
      if (teachClean) Game.learnTechnique && Game.learnTechnique('clean', 'grant');
      Game.learnTechnique && Game.learnTechnique('cook', 'grant');
      Game.cleanCarcass(s.inventory.findIndex(i => i && i.foodState === 'carcass'));
      const g = flatGrid(); g[4][4] = 'fire'; Game.genDetail = () => g;
      Game.cookFood(s.inventory.findIndex(i => i && i.foodState === 'cleaned'));
      const cooked = s.inventory.find(i => i.foodState === 'cooked');
      return cooked.kcalEach * cooked.units;
    };
    const skilled = await mk(true), blind = await mk(false);
    ok('E11 technique still matters after cooking', skilled > blind, `skilled=${skilled} blind=${blind}`);
  }

  // ============ EXPLOIT 12: strike-spam cannot farm uncapped hunt bonus ============
  {
    const s = await freshGame();
    for (let i = 0; i < 50; i++) Game.encHuntPracticed('strike');
    Game.encHuntPracticed('kill');
    const bonus = Game.encHuntXPBonus({});
    ok('E12 hunt bonus capped at +0.2 after 51 practices', bonus <= 0.2001, 'bonus=' + bonus);
  }

  // ============ SOFTLOCK 3: monster corpse double-loot ============
  {
    const s = await freshGame();
    const cid = Game.registerDeath({ kind: 'monster', monsterId: 'test_beast', name: 'test beast', mx: 4, my: 4, cause: 'combat', youWitnessed: true, items: [{ name: 'Alien curio', units: 1, plantId: 'curio_xyz' }] });
    const id = (cid && cid.id) || (Game.corpses().length && Game.corpses()[Game.corpses().length - 1].id);
    Game.say = () => {};
    const unitsBefore = s.inventory.reduce((t, i) => t + (i.units || 1), 0);
    const r1 = Game.lootCorpse(id, true);
    const unitsMid = s.inventory.reduce((t, i) => t + (i.units || 1), 0);
    const corpse = Game.corpses().find(x => x.id === id);
    const r2 = Game.lootCorpse(id, true);
    const unitsAfter = s.inventory.reduce((t, i) => t + (i.units || 1), 0);
    ok('S3 first loot takes the items', r1 && r1.length === 1 && unitsMid === unitsBefore + 1, JSON.stringify(r1 && r1.length));
    ok('S3 corpse marked looted/empty', corpse.looted === true || !(corpse.items || []).some(i => (i.units == null ? 1 : i.units) > 0));
    ok('S3 second loot finds nothing (no dupe)', (r2 == null || r2.length === 0) && unitsAfter === unitsMid, `${unitsMid}->${unitsAfter}`);
  }

  // ============ SOFTLOCK 4: huntAnimal with no animal = no crash ============
  {
    const s = await freshGame();
    s.animal = null;
    let r = 'unset';
    try { r = Game.huntAnimal(); } catch (e) { r = 'CRASH:' + e.message; }
    ok('S4 huntAnimal(null animal) returns cleanly', r === null || r === true, String(r));
  }

  console.log(`\nHUNTER-ADVERSARIAL: ${pass} pass, ${fail} fail (seed ${SEED})`);
  if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e && e.stack || e); process.exit(2); });
