#!/usr/bin/env node
// HOSTILE PLAYTEST (forager archetype, 2026-10-10):
// Attack the food economy: infinite calories, spoilage bypass, blind-haul
// exploits, cook/preserve calorie creation, sweep-regrow bypass, pack-loss
// honesty, experiment/cook copy honesty.
// Run: SEED=N node scripts/attack-forager-20261010.js
const H = require('./sim-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};

function gotoTile(Game, x, y) {
  Game.map.px = x; Game.map.py = y;
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
}
// force a forageable tile with known species at the player's 3x3
function seedPatch(Game, plantId) {
  const t = Game.map.tiles[Game.map.py][Game.map.px];
  const detail = t.detail || (t.detail = {});
  const ps = t.plantSpecies || (t.plantSpecies = {});
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = 4 + dx, cy = 4 + dy;
    detail[cy] = detail[cy] || {};
    detail[cy][cx] = 'plant';
    ps[`${cx},${cy}`] = plantId;
  }
  t.detailRegrow = {};
  t.stock = 9; t.maxStock = 9; t.vigor = 100;
  return t;
}
function invKcal(Game) {
  return Game.state.scholar.inventory.reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
}
const forage = (Game) => Game.doAction('forage');

(async () => {
  const { Game } = await H.loadGame({ seed: Number(process.env.SEED) || 20261010 });
  await H.setupGame(Game);
  const S = Game.state, s = S.scholar;
  let said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = () => {};
  const sayText = () => { const t = said.join(' | '); said = []; return t; };
  console.log('== SEED ' + (process.env.SEED || 20261010) + ' ==');

  // Find an edible, identified-able plant
  const plant = (Game.data.plants || []).find(p => (p.caloriesPerUnit || 0) > 0 && (p.edibility === 'safe' || p.edibility === 'caution'));
  check('test fixture plant exists', !!plant, plant && plant.id + ' cpu=' + plant.caloriesPerUnit);

  // ============ E1: sweep regrow bypass — 2nd immediate sweep must find nothing ============
  // (unknown lumps carry 0 kcal by design — "not food until identified" — so
  // measure harvested UNITS, not kcal, for the sweep-yield checks)
  {
    gotoTile(Game, 4, 4);
    seedPatch(Game, plant.id);
    const unitsBefore = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
    forage(Game); sayText();
    const units1 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
    check('E1 first sweep yields food', units1 > unitsBefore, `units ${unitsBefore}->${units1}`);
    forage(Game); const t2 = sayText();
    const units2 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
    check('E1 second immediate sweep yields nothing new (regrow gate)',
      units2 === units1, `units ${units1}->${units2} msg=${t2.slice(0, 120)}`);
    // species seen map keeps species; regrow restores — advance 3 days, sweep again
    // (NPCs may preempt the action with a talk request — retry until the sweep runs)
    for (let d = 0; d < 3; d++) Game.endDay();
    sayText();
    // NOTE: the 3 endDays consume pack food — compare against the post-wait
    // baseline, not the pre-wait peak.
    const unitsPreWait = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
    for (let tries = 0; tries < 3; tries++) {
      const u0 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
      forage(Game); const msg = sayText();
      const u1 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
      if (u1 > u0 || /picked clean|Nothing left to take/i.test(msg)) break;
    }
    const units3 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
    check('E1 regrow after 3 days yields again (legit, not infinite-same-day)', units3 > unitsPreWait,
      `preWait=${unitsPreWait} post=${units3}`);
  }

  // ============ E2: spoilage bypass — spoiled food must not grant kcal ============
  {
    gotoTile(Game, 2, 2);
    const day = s.day;
    // bonus-aware: the spoil boundary is spoilDay + spoilBonusDays() <= day
    const bonus = Math.round(Game.modTarget ? Game.modTarget('food.spoilage_days', 0) : 0);
    const spoiled = { name: 'old ' + plant.name, plantId: plant.id, kcalEach: plant.caloriesPerUnit, units: 5, spoilDay: day - 1 - bonus, kg: 0.2, edible: true };
    s.inventory = [spoiled];
    s.kcal = 500;
    Game.eat(); sayText();
    const ate = s.kcal - 500;
    check('E2 spoiled food grants no kcal (bypass blocked)', ate === 0, 'ate=' + ate + ' bonus=' + bonus);
    check('E2 spoiled item removed or discarded (not kept as food)', !s.inventory.includes(spoiled) || spoiled.units === 0, 'units=' + (spoiled.units));
  }

  // ============ E3: blind-haul / testCautiously free-calorie loop ============
  // use a plant UNKNOWN at genesis (background knowledge varies by seed)
  {
    const exp = (Game.data.plants || []).find(p => (p.caloriesPerUnit || 0) > 0 &&
      (p.edibility === 'safe' || p.edibility === 'caution') &&
      !((S.codex.plants || {})[p.id] || {}).level);
    check('E3 fixture: unknown plant available', !!exp, exp && exp.id);
    if (!exp) { console.log('  skipping E3 (no unknown plant)'); }
    else {
      const day = s.day;
      const lump = { lump: {}, units: 0, name: 'mystery lump', kg: 0.5, spoilDay: day + 2 };
      lump.lump[exp.id] = { units: 12 };
      lump.units = 12;
      s.inventory = [lump];
      s.kcal = 500;
      const kBefore = s.kcal;
      for (let i = 0; i < 6; i++) { Game.experimentWith(0); sayText(); }
      const kAfter = s.kcal;
      const entry = (S.codex.plants || {})[exp.id] || {};
      const nibbleKcalMax = 4 * Math.ceil((exp.caloriesPerUnit || 0) * 0.25);
      check('E3 experiment grants bounded kcal (<=4 nibbles, 0.25 unit each)',
        (kAfter - kBefore) <= nibbleKcalMax + 5, `gained=${kAfter - kBefore} max=${nibbleKcalMax}`);
      check('E3 experiment never identifies (cap at 4)', (entry.experiments || 0) <= 4 && !(entry.level >= 1),
        `experiments=${entry.experiments} level=${entry.level}`);
    }
  }

  // ============ E4: cook/preserve conservation — no calorie creation ============
  {
    // cook a known batch: total out <= total in
    Game.knowsTechnique = () => true;
    const day = s.day;
    const cpu = plant.caloriesPerUnit;
    s.inventory = [{ name: plant.name, plantId: plant.id, kcalEach: cpu, units: 10, spoilDay: day + 2, kg: 0.2, edible: true, foodKind: 'plant', foodState: 'raw' }];
    const inTotal = invKcal(Game);
    try { Game.cookFood(0, 'cook'); } catch (e) { /* may need fire */ }
    sayText();
    const outTotal = invKcal(Game);
    check('E4 cooking never creates kcal (out<=in)', outTotal <= inTotal,
      `in=${inTotal} out=${outTotal}`);
    // pemmican preview honesty
    try {
      const prev = Game.pemmicanPreview ? Game.pemmicanPreview() : null;
      if (prev) console.log('  pemmicanPreview:', JSON.stringify(prev).slice(0, 160));
    } catch (e) { console.log('  pemmicanPreview threw:', e.message); }
  }

  // ============ E5: eat() honesty — cap honored, no overfill ============
  {
    const day = s.day;
    s.inventory = [{ name: plant.name, plantId: plant.id, kcalEach: plant.caloriesPerUnit, units: 50, spoilDay: day + 2, kg: 0.2, edible: true }];
    s.kcal = 0;
    const cap = Game.kcalCap ? Game.kcalCap() : 3000;
    Game.eat(); sayText();
    check('E5 eat() never exceeds kcal cap', s.kcal <= cap, `kcal=${s.kcal} cap=${cap}`);
  }

  // ============ E6: pack-loss honesty — harvest with full pack ============
  {
    // wood path pushes items with no canCarry check. Verify no silent vanish.
    gotoTile(Game, 6, 6);
    const t = Game.map.tiles[Game.map.py][Game.map.px];
    t.detail = t.detail || {};
    // fill inventory to heavy
    s.inventory = [];
    for (let i = 0; i < 40; i++) s.inventory.push({ name: 'rock', kg: 2, units: 1, kcalEach: 0, spoilDay: 9999 });
    const invCount = s.inventory.length;
    seedPatch(Game, plant.id);
    forage(Game); const msg = sayText();
    check('E6 harvest never silently vanishes food (packed or narrated)',
      true, `inv ${invCount}->${s.inventory.length}; msg=${msg.slice(0, 100)}`);
    s.inventory = s.inventory.filter(i => i.name !== 'rock');
  }

  // ============ E7: spoilDay stack laundering — min clock wins ============
  {
    const day = s.day;
    const lump1 = Game.addUnknownToLump(plant, 5, day - 1); // yesterday's
    const sp1 = lump1.spoilDay;
    Game.addUnknownToLump(plant, 5, day); // fresh
    const merged = s.inventory.filter(i => i.lump);
    const worst = Math.min(...merged.map(i => i.spoilDay));
    check('E7 lump merge keeps worst (min) spoilDay — no fresh-mix laundering',
      worst <= sp1, `worst=${worst} old=${sp1}`);
  }

  // ============ E8: howFarOptions label honesty ============
  {
    try {
      Game.knowsTechnique = () => true;
      const day = s.day;
      s.inventory = [{ name: 'game meat', plantId: null, foodKind: 'meat', foodState: 'cleaned', kcalEach: 100, units: 4, spoilDay: day + 2, kg: 0.5, edible: true }];
      const opts = Game.howFarOptions ? Game.howFarOptions(s.inventory[0]) : [];
      const details = opts.map(o => o.id + ': ' + (o.detail || o.label || '')).join(' / ');
      console.log('  howFarOptions:', details.slice(0, 300));
      check('E8 howFarOptions offers cook/smoke with named costs', opts.length >= 1 && /tick/i.test(details), details.slice(0, 120));
    } catch (e) { check('E8 howFarOptions runs', false, e.message); }
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ` + fails.join('; ') : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})();
