// Forageable identity & recognition. Usage: node scripts/test-forage-identity.js
// Steve's rule: the game knows what everything is; returning to an area
// surfaces recognition with current knowledge; everything has a use.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/food.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const SForage = globalThis.Scattering.forage;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const VALID_KINDS = ['food', 'medicine', 'tinder', 'fiber', 'dye', 'bait', 'seasoning', 'tea', 'craft'];

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 100;
  Game.map.px = 3; Game.map.py = 3;
  const t = Game.playerTile();
  t.stock = 10; t.maxStock = 10;
  return t;
}

(async () => {
  await Game.init();
  const plants = Game.data.plants;
  const ids = new Set(plants.map(p => p.id));

  // 1. DATA: every forageable has identity + at least one use.
  ok('plant pool non-empty', plants.length >= 20);
  for (const p of plants) {
    ok(`${p.id} has name`, !!p.name);
    ok(`${p.id} has descriptor`, !!p.description);
    ok(`${p.id} has >=1 use`, Array.isArray(p.uses) && p.uses.length >= 1);
    for (const u of (p.uses || [])) {
      ok(`${p.id} use kind valid (${u.kind})`, VALID_KINDS.includes(u.kind));
      ok(`${p.id} use minLevel 2-3`, u.minLevel === 2 || u.minLevel === 3);
      ok(`${p.id} use has note`, !!u.note);
    }
  }
  ok('rare_herb is a true species now', ids.has('rare_herb'));

  // 2. IDENTITY: every forage-created item carries a real species id.
  freshGame();
  const seenIds = new Set();
  for (let i = 0; i < 60; i++) {
    const t = Game.playerTile();
    t.stock = 10;
    const r = SForage.forage(t, Game.biome(), plants, Game.state.scholar, Game.state.codex, Game.data.abilities, null, {});
    seenIds.add(r.plantId);
    if (r.rareFind) seenIds.add(r.rareFind.plantId);
  }
  // squirrel gift path
  seenIds.add('hickory_nut');
  for (const pid of seenIds) ok(`forage item id is a true species: ${pid}`, ids.has(pid));
  ok('no gift_nuts blob', !seenIds.has('gift_nuts'));

  // 3. USES unlock progressively with knowledge.
  freshGame();
  const pid = 'dandelion';
  ok('L0: no uses known', Game.plantUses(pid).length === 0);
  Game.state.codex.plants[pid] = { identifiedDay: 1, level: 1, harvests: 0, tastings: 0, by: 'test' };
  ok('L1: still no uses (name only)', Game.plantUses(pid).length === 0);
  Game.state.codex.plants[pid].level = 2;
  const l2 = Game.plantUses(pid);
  ok('L2: primary use(s) unlocked', l2.length >= 1 && l2.every(u => u.minLevel <= 2));
  ok('L2: dandelion food use known', l2.some(u => u.kind === 'food'));
  Game.state.codex.plants[pid].level = 3;
  const l3 = Game.plantUses(pid);
  const all = plants.find(p => p.id === pid).uses;
  ok('L3: all uses known', l3.length === all.length);
  ok('plantUsesText non-empty at L3', Game.plantUsesText(pid).length > 10);
  ok('codexEntries carries uses', Game.codexEntries().find(e => e.pid === pid).uses.length > 0);

  // 4. SPATIAL MEMORY: tile records species; return surfaces recognition.
  freshGame();
  const t = Game.playerTile();
  t.stock = 10; t.type = 'meadow';
  // force a known species via the engine's forcePlantId
  const r1 = SForage.forage(t, Game.biome(), plants, Game.state.scholar, Game.state.codex, Game.data.abilities, null, { forcePlantId: 'yarrow' });
  ok('forced yarrow', r1.plantId === 'yarrow');
  // simulate what doAction does: record speciesSeen
  t.speciesSeen = t.speciesSeen || {};
  t.speciesSeen['yarrow'] = { day: 1, n: 1 };
  t.speciesSeen['dandelion'] = { day: 1, n: 2 };
  Game.state.codex.plants['dandelion'] = { identifiedDay: 1, level: 2, harvests: 5, tastings: 0, by: 'test' };
  const nd = Game.nodeDetail();
  const here = nd.here.join(' | ');
  ok('here-list remembers yarrow (unknown)', /yarrow|feathery/i.test(here));
  ok('here-list shows dandelion known+edible', /dandelion \(known, edible\)/.test(here));
  // recognition sentences
  const rec0 = Game.speciesRecognition('yarrow');
  ok('unknown species: still unnamed', /still unnamed/.test(rec0));
  const rec2 = Game.speciesRecognition('dandelion');
  ok('known species: edible recognition', /one of the edible ones/.test(rec2));
  ok('known species: uses listed', /Uses so far/.test(rec2));
  Game.identifyPlant('yarrow', 'test');
  const rec1 = Game.speciesRecognition('yarrow');
  ok('after identify: named recognition', /Yarrow/.test(rec1) && !/still unnamed/.test(rec1));

  // 5. NO AMNESIA: speciesSeen survives and recognition tracks knowledge growth.
  freshGame();
  delete Game.state.codex.plants['jewelweed']; // background seeding may know it; control for the test
  const t2 = Game.playerTile();
  t2.speciesSeen = { 'jewelweed': { day: 1, n: 3 } };
  const before = Game.speciesHereLine('jewelweed');
  ok('before learning: unnamed line', /unnamed/.test(before));
  Game.identifyPlant('jewelweed', 'test');
  Game.state.codex.plants['jewelweed'].level = 3;
  const after = Game.speciesHereLine('jewelweed');
  ok('after learning: known line, no amnesia', /jewelweed \(known/.test(after));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
