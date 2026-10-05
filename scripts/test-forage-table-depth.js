// Forager loop: the biome's forage table must actually contain the plants
// that plants.json designs for it. (2026-10-05: 16 fully-specced se_woodlands
// plants — knowledge levels, affinities, seasons — were never added to the
// table, so a forager exhausted the world's knowledge in one day.)
// Usage: node scripts/test-forage-table-depth.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
Game.say = function (t) { return t; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await Game.init();
  const plants = Game.data.plants;
  const bio = Game.data.biomes.find(b => b.id === 'se_woodlands');
  const table = bio.forageTable || {};

  // 1. every se_woodlands plant in plants.json is reachable (except rare_herb,
  //    the pattern_recognition bonus find — deliberately not in the table).
  const designed = plants.filter(p => (p.biomes || []).includes('se_woodlands') && p.id !== 'rare_herb');
  const missing = designed.filter(p => !(p.id in table)).map(p => p.id);
  ok('all designed se_woodlands plants are in the forage table', missing.length === 0, 'missing: ' + missing.join(','));
  console.log(`  table: ${Object.keys(table).length} species (designed: ${designed.length})`);

  // 2. every table entry resolves to a real plant with the fields the engine needs.
  const bad = [];
  for (const pid of Object.keys(table)) {
    const p = plants.find(x => x.id === pid);
    if (!p) { bad.push(pid + ':no-plant'); continue; }
    if (!p.caloriesPerUnit && p.caloriesPerUnit !== 0) bad.push(pid + ':no-kcal');
    if (!p.tileAffinity || !p.tileAffinity.length) bad.push(pid + ':no-affinity');
    if (typeof table[pid] !== 'number' || table[pid] <= 0) bad.push(pid + ':bad-weight');
  }
  ok('every table entry resolves to a fully-specced plant', bad.length === 0, bad.join(','));

  // 3. statistical: over many rolls every species appears (nothing orphaned by weight).
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const t = Game.tileAt(2, 2);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) { const s = Game.rollWildSpecies(t); if (s) seen.add(s); }
  const unseen = Object.keys(table).filter(pid => !seen.has(pid));
  ok('all 25 species appear over 4000 rolls', unseen.length === 0, 'never rolled: ' + unseen.join(','));
  console.log(`  distinct rolled: ${seen.size}/${Object.keys(table).length}`);

  // 4. engine forage() yields the new species without crashing; units sane.
  const S = globalThis.Scattering;
  const scholar = Game.state.scholar, codex = Game.state.codex;
  const tile = { type: 'meadow' };
  const newIds = ['elderberry', 'black_walnut', 'pawpaw', 'ramps', 'burdock'];
  const gotNew = new Set();
  for (let i = 0; i < 1500; i++) {
    const r = S.forage.forage(tile, bio, plants, scholar, codex, [], null, { forcePlantId: newIds[i % newIds.length] });
    if (newIds.includes(r.plantId)) gotNew.add(r.plantId);
    if (!(r.units >= 1 && r.units <= 40)) { ok('forage units sane for ' + r.plantId, false, 'units=' + r.units); break; }
  }
  ok('new species forage cleanly via the engine', gotNew.size === newIds.length, 'got: ' + [...gotNew].join(','));

  // 5. regression: the old staples are still there (bush hardcodes resolve).
  ok('blackberry still in table', 'blackberry' in table);
  ok('muscadine still in table', 'muscadine' in table);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
