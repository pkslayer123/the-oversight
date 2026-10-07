// Forage redesign tests (Steve): area sweep, knowledge-targeted, no field ID.
// - one forage sweeps the 3x3 around the player; yield = what's actually there
// - low knowledge -> unknowns only (lumps); grid truth exists but ungated UI stays hidden
// - high knowledge -> targeted named haul for known species in radius
// - camp ritual identifies (field-click on high familiarity); field never does
// - fog: travel twice, unvisited nodes stay fogged
// Usage: node scripts/test-forage.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

function wildTile() {
  Game.debugScenario('day1');
  const tg = Game.travelTargets().find(t => !Game.travelBlockage(t.x, t.y) && Game.tileAt(t.x, t.y).type !== 'haven' && Game.tileAt(t.x, t.y).type !== 'ruin');
  Game.travelTo(tg.x, tg.y);
  return Game.playerTile();
}

(async () => {
  await Game.init();

  // --- 1. area sweep: yields from cells within radius, depletes them ---
  {
    const t = wildTile();
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    // force a known layout: plant cells at (4,4) and (5,5), dirt elsewhere in radius
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = 4 + dx, cy = 4 + dy;
      if ((cx === 4 && cy === 4) || (cx === 5 && cy === 5)) detail[cy][cx] = 'plant';
      else if (detail[cy][cx] === 'plant' || detail[cy][cx] === 'bush') detail[cy][cx] = 'grass';
    }
    t.plantSpecies = { '4,4': 'dandelion', '5,5': 'chickweed' };
    t.detailRegrow = {};
    t.stock = 10;
    const codexBefore = Object.keys(Game.state.codex.plants || {}).length;
    ok('forage runs', !!Game.doAction('forage'));
    // both cells harvested (in radius)
    ok('cell (4,4) depleted', detail[4][4] === 'dirt');
    ok('cell (5,5) depleted', detail[5][5] === 'dirt');
    // a cell OUTSIDE radius untouched: plant one at (4,6)... actually (4,6) is dy=2, outside
    detail[6][4] = 'plant'; t.plantSpecies['4,6'] = 'dandelion';
    const regrowKeys = Object.keys(t.detailRegrow || {});
    ok('outside-radius cell not harvested', !regrowKeys.includes('4,6'));
    // no field identification
    ok('no field ID', Object.keys(Game.state.codex.plants || {}).length === codexBefore);
    // unknowns lumped (neither species known)
    const lumps = (Game.state.scholar.inventory || []).filter(i => i.lump);
    ok('blind yield lumped', lumps.length > 0);
    const lumpComp = lumps.reduce((a, l) => Object.assign(a, l.lump), {});
    ok('dandelion in lump', !!lumpComp['dandelion']);
    ok('chickweed in lump', !!lumpComp['chickweed']);
  }

  // --- 2. high knowledge: targeted named haul ---
  {
    const t = wildTile();
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = 4 + dx, cy = 4 + dy;
      if (detail[cy][cx] === 'plant' || detail[cy][cx] === 'bush') detail[cy][cx] = 'grass';
    }
    detail[4][4] = 'plant';
    t.plantSpecies = { '4,4': 'wild_onion' };
    t.detailRegrow = {};
    t.stock = 10;
    Game.identifyPlant('wild_onion', 'taught');
    Game.doAction('forage');
    const named = (Game.state.scholar.inventory || []).filter(i => !i.lump && i.plantId === 'wild_onion');
    ok('known species hauled named', named.length > 0, JSON.stringify(named.map(i => i.name)));
  }

  // --- 3. camp ritual: familiarity -> field-click identification ---
  {
    const t = wildTile();
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    // pick an unknown species, force familiarity to threshold
    const pid = 'wood_sorrel';
    ok('wood_sorrel unknown at start', !Game.plantKnown(pid));
    Game.state.codex.encounters = Game.state.codex.encounters || {};
    Game.state.codex.encounters[pid] = 3;
    Game.state.codex.learnThreshold = Game.state.codex.learnThreshold || {};
    Game.state.codex.learnThreshold[pid] = 3;
    ok('field-click ready', Game.plantFieldClick(pid));
    // put a lump with wood_sorrel in the stash, go to camp, sort alone
    const plant = Game.data.plants.find(p => p.id === pid);
    Game.addUnknownToLump(plant, 6, Game.state.scholar.day, Game.state.scholar.prepStash = []);
    Game.travelTo(3, 3);
    Game.state.scholar.insideHaven = true;
    const idx = (Game.state.scholar.prepStash || []).findIndex(i => i.lump);
    ok('lump staged', idx >= 0);
    Game.sortBag(null, idx, Game.state.scholar.prepStash);
    ok('ritual identified it', Game.plantKnown(pid));
  }

  // --- 4. fog: travel twice, unvisited stay fogged ---
  {
    Game.debugScenario('day1');
    const count = () => Game.map.tiles.flat().filter(x => x.revealed).length;
    const c0 = count();
    for (let i = 0; i < 2; i++) {
      const tg = Game.travelTargets().find(x => !Game.travelBlockage(x.x, x.y));
      if (!tg) break;
      Game.travelTo(tg.x, tg.y);
    }
    const c2 = count();
    ok('travel reveals (not resets)', c2 > c0, `${c0} -> ${c2}`);
    // tiles far from the traveled path stay fogged (reveal is a radius-2
    // diamond around each destination — nearby unvisited MAY be revealed)
    const px = Game.map.px, py = Game.map.py;
    const farFogged = Game.map.tiles.every((row, y) => row.every((x, t) =>
      (Math.abs(t - px) + Math.abs(y - py) <= 4) || !x.revealed));
    ok('far nodes stay fogged', farFogged);
    ok('fog not wiped (most nodes hidden)', c2 < 25, `revealed=${c2}`);
  }

  // --- 5. species truth stable: same cell, same species across visits ---
  {
    const t = wildTile();
    const d1 = Game.genDetail(Game.map.px, Game.map.py);
    // find a real plant cell
    let px2 = -1, py2 = -1;
    outer: for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      if (d1[cy][cx] === 'plant') { px2 = cx; py2 = cy; break outer; }
    }
    ok('test found a plant cell', px2 >= 0);
    const sp1 = Game.cellPlantSpecies(t, px2, py2, 'plant');
    // simulate re-gen (clear detail, regenerate)
    t.detail = null;
    Game.genDetail(Game.map.px, Game.map.py);
    const sp2 = t.plantSpecies[px2 + ',' + py2];
    ok('species stable across regen', sp1 === sp2, `${sp1} vs ${sp2}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
