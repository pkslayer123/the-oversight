#!/usr/bin/env node
// HOSTILE PLAYTEST (forager archetype, 2026-10-10) — round 2:
// E9 blind cook/smoke/render penalties, E10 pemmican conservation,
// E11 sortBag unit conservation, E12 pantry round trip, E13 avoid-plant
// experiment honesty, E14 makePemmican knowledge gate.
// Run: SEED=N node scripts/attack-forager-20261010b.js
const H = require('./sim-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''));
  if (!cond) fails.push(name);
};
function invKcal(Game) {
  return Game.state.scholar.inventory.reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
}

(async () => {
  const { Game } = await H.loadGame({ seed: Number(process.env.SEED) || 20261010 });
  await H.setupGame(Game);
  const S = Game.state, s = S.scholar;
  let said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = () => {};
  const sayText = () => { const t = said.join(' | '); said = []; return t; };
  Game.nearFire = () => true;
  Game.consumeCookFire = () => 'ok';
  const plant = (Game.data.plants || []).find(p => (p.caloriesPerUnit || 0) > 0 && (p.edibility === 'safe' || p.edibility === 'caution'));
  const day = s.day;

  // ============ E9: blind penalties — known vs blind batch cooking (meat) ============
  {
    // The batch path (cookAll) rolls one outcome per batch: known max 1.0x,
    // blind max 0.8x (decent). Run many batches, compare means.
    const mkMeat = () => ({ name: 'Cleaned meat', plantId: 'meat_deer', foodKind: 'meat', foodState: 'cleaned', kcalEach: 100, units: 4, spoilDay: day + 2, kg: 0.5, edible: true });
    Game.knowsTechnique = () => true;
    let knownSum = 0, n = 0;
    for (let i = 0; i < 20; i++) {
      s.inventory = [mkMeat()];
      try { Game.cookAll(); } catch (e) {}
      sayText();
      knownSum += invKcal(Game); n++;
    }
    Game.knowsTechnique = () => false;
    let blindSum = 0, m = 0;
    for (let i = 0; i < 20; i++) {
      s.inventory = [mkMeat()];
      try { Game.cookAll(); } catch (e) {}
      sayText();
      blindSum += invKcal(Game); m++;
    }
    const knownAvg = knownSum / n, blindAvg = blindSum / m;
    check('E9 blind batch cook averages below known (ceiling 0.8x)',
      blindAvg < knownAvg && blindAvg <= 400 * 0.85 + 20,
      `knownAvg=${knownAvg.toFixed(0)} blindAvg=${blindAvg.toFixed(0)} (in=400)`);
    check('E9 known cook never creates kcal', knownAvg <= 400 + 1, `knownAvg=${knownAvg.toFixed(0)}`);
    Game.knowsTechnique = () => true;
    s.inventory = [];
  }

  // ============ E10: pemmican conservation ============
  {
    // build legal inputs: 2 dried meat + 1 rendered fat + 2 berries
    const meat = { itemId: 'dried_meat', name: 'Dried meat', foodKind: 'meat', foodState: 'preserved', edible: true, kcalEach: 400, units: 2, spoilDay: day + 30, kg: 0.4 };
    const fat = { name: 'Tallow (rendered)', foodKind: 'fat', foodState: 'rendered', edible: true, kcalEach: 800, units: 1, hiddenKcal: 800, spoilDay: day + 90, kg: 0.9 };
    const berries = { name: 'Berries', plantId: 'blackberry', foodKind: 'plant', foodState: 'ready', edible: true, kcalEach: 100, units: 2, spoilDay: day + 2, kg: 0.2 };
    s.inventory = [meat, fat, berries];
    const inK = invKcal(Game);
    Game.knowsTechnique = (t) => t === 'render';
    const before = Game.pemmicanPreview ? Game.pemmicanPreview() : null;
    Game.makePemmican(); sayText();
    const outK = invKcal(Game);
    check('E10 pemmican out <= in (no creation, ~97% retention)',
      outK <= inK && outK >= inK * 0.9, `in=${inK} out=${outK} preview=${JSON.stringify(before)}`);
    // knowledge gate: blind attempt refused
    s.inventory = [Object.assign({}, meat), Object.assign({}, fat), Object.assign({}, berries)];
    Game.knowsTechnique = () => false;
    const inK2 = invKcal(Game);
    Game.makePemmican(); sayText();
    check('E10 makePemmican gated on render knowledge', invKcal(Game) === inK2, `kcal unchanged=${invKcal(Game) === inK2}`);
    Game.knowsTechnique = () => true;
  }

  // ============ E11: sortBag unit conservation ============
  {
    Game.atCamp = () => true;
    // exclude nuts (in-shell: kcalEach 0 by design) and genesis-known plants
    const isNut = (p) => p.id === 'hickory_nut' || p.id === 'acorn_white_oak' || /crack|shell|husk/i.test(p.preparation || '');
    const plant2 = (Game.data.plants || []).find(p => p.id !== plant.id && !isNut(p) &&
      (p.caloriesPerUnit || 0) > 0 && (p.edibility === 'safe' || p.edibility === 'caution') &&
      !((S.codex.plants || {})[p.id] || {}).level);
    check('E11 fixture: second unknown plant', !!plant2, plant2 && plant2.id);
    s.inventory = [];
    const stash = Game.prepStash ? Game.prepStash() : (s.prepStash = []);
    stash.length = 0;
    Game.addUnknownToLump(plant, 7, day, stash);
    Game.addUnknownToLump(plant2, 5, day, stash);
    const lump = stash.find(i => i.lump);
    const totalIn = (lump.units || 0);
    Game.identifyPlant(plant.id, 'taught'); // camp knows this one now
    const unitsBefore = stash.reduce((n, i) => n + (i.units || 0), 0);
    Game.sortBag(null, stash.indexOf(lump), stash);
    sayText();
    const unitsAfter = stash.reduce((n, i) => n + (i.units || 0), 0);
    const named = stash.find(i => i.plantId === plant.id && !i.lump);
    check('E11 sortBag conserves units (no dup/destroy)',
      unitsAfter === unitsBefore, `${unitsBefore}->${unitsAfter}`);
    check('E11 named stack carries honest kcalEach', !!named && named.kcalEach === plant.caloriesPerUnit,
      `named=${!!named} kcalEach=${named && named.kcalEach} cpu=${plant.caloriesPerUnit}`);
    check('E11 unnamed species stays a lump (no free ID)', !!stash.find(i => i.lump), 'lump remains');
    s.inventory = []; stash.length = 0;
  }

  // ============ E12: pantry donate/take round trip ============
  {
    const pantryK0 = (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    s.inventory = [{ name: 'Test dandelion', plantId: plant.id, kcalEach: plant.caloriesPerUnit, units: 8, spoilDay: day + 2, kg: 0.2, edible: true, foodKind: 'plant', foodState: 'ready' }];
    const inK = invKcal(Game);
    Game.donateToPantry(0); sayText();
    const pantryK1 = (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    check('E12 donate moves kcal exactly (no laundering)', pantryK1 - pantryK0 === inK && invKcal(Game) === 0,
      `in=${inK} delta=${pantryK1 - pantryK0} pack=${invKcal(Game)}`);
    const myIdx = (Game.state.village.pantry || []).findIndex(i => i.name === 'Test dandelion');
    check('E12 fixture: my stack is in pantry', myIdx >= 0, 'idx=' + myIdx);
    if (myIdx >= 0) {
      // takeFromPantry takes ONE unit per press (by design) — drain my stack
      for (let i = 0; i < 8; i++) {
        const mi = (Game.state.village.pantry || []).findIndex(x => x.name === 'Test dandelion');
        if (mi < 0) break;
        Game.takeFromPantry(mi);
      }
      sayText();
      const backK = invKcal(Game);
      const pantryK2 = (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      check('E12 take-back returns kcal exactly', backK === inK && pantryK2 === pantryK1 - inK,
        `back=${backK} in=${inK} pantryDelta=${pantryK1 - pantryK2}`);
    }
    s.inventory = [];
  }

  // ============ E13: avoid-plant experiment — riskSense recorded, no free lunch ============
  // use an avoid plant UNKNOWN at genesis (background knowledge varies by seed)
  {
    const poison = (Game.data.plants || []).find(p => p.edibility === 'avoid' &&
      (p.caloriesPerUnit || 0) > 0 && !((S.codex.plants || {})[p.id] || {}).level);
    if (poison) {
      s.inventory = [];
      const lump = { lump: {}, units: 0, name: 'mystery lump', kg: 0.5, spoilDay: day + 2 };
      lump.lump[poison.id] = { units: 8 };
      lump.units = 8;
      s.inventory = [lump];
      s.kcal = 500;
      const k0 = s.kcal;
      for (let i = 0; i < 4; i++) { Game.experimentWith(0); sayText(); }
      const gained = s.kcal - k0;
      const entry = (S.codex.plants || {})[poison.id] || {};
      check('E13 avoid-plant experiments bounded (spit-outs grant no kcal)',
        gained <= 4 * Math.ceil((poison.caloriesPerUnit || 0) * 0.25), `gained=${gained}`);
      check('E13 riskSense recorded for avoid plant', !!entry.riskSense, `riskSense=${entry.riskSense}`);
    } else {
      check('E13 avoid-plant fixture', false, 'no avoid plant with cpu>0');
    }
    s.inventory = [];
  }

  // ============ E14: renderFat conservation ============
  {
    const day14 = s.day; // re-capture: earlier checks ticked the clock
    Game.knowsTechnique = () => true;
    const raw = { name: 'Bear fat (raw)', foodKind: 'fat', foodState: 'raw', edible: false, kcalEach: 0, hiddenKcal: 900, units: 1, spoilDay: day14 + 2, kg: 1.0 };
    s.inventory = [raw];
    Game.renderFat(0); sayText();
    const out = s.inventory[0];
    check('E14 renderFat known: 0.90x, no creation',
      out && out.kcalEach <= 810 && out.kcalEach >= 700 && out.spoilDay === day14 + 90,
      `kcalEach=${out && out.kcalEach} spoil=${out && out.spoilDay} expect=${day14 + 90}`);
    const raw2 = { name: 'Bear fat (raw)', foodKind: 'fat', foodState: 'raw', edible: false, kcalEach: 0, hiddenKcal: 900, units: 1, spoilDay: day14 + 2, kg: 1.0 };
    s.inventory = [raw2];
    Game.knowsTechnique = () => false;
    Game.renderFat(0); sayText();
    const out2 = s.inventory[0];
    check('E14 renderFat blind: ~0.65x scorch',
      out2 && out2.kcalEach <= 600 && out2.kcalEach > 400,
      `kcalEach=${out2 && out2.kcalEach}`);
    Game.knowsTechnique = () => true;
    s.inventory = [];
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ` + fails.join('; ') : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})();
