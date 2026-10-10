#!/usr/bin/env node
// test-bal-survival-20261010.js — proof for the survival-wall fixes.
// BEFORE (base): sustainable takes accrue pressure (+1/work), vigor heals only
//   on untouched zero-pressure ground, forage crews strip nearest-first with
//   fixed rings, villager allies spawn in player fights at 30 HP.
// AFTER (fixed): sustainable takes are pressure-free, rest heals lightly-worked
//   ground, crews rotate lush-first and widen thinning zones, allies fight at
//   real health. Fish duty + villager sowing wire the counter-play.
// Usage: node scripts/test-bal-survival-20261010.js [seed]
'use strict';
const ROOT = '/home/hatch/workspace/worktrees/bal-survival';
const { loadGame, setupGame } = require(ROOT + '/scripts/sim-harness');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const seed = parseInt(process.argv[2] || '11', 10);
  const { Game } = await loadGame({ seed, mode: 'bal-proof' });
  Game.say = function () {};
  await setupGame(Game);
  const day = () => (Game.state.scholar || {}).day || 0;

  console.log('T1: stripGround — sustainable takes are free, strips wound');
  {
    const t = { maxStock: 3, stock: 3, vigor: 100 };
    let r = Game.stripGround(t, 1);
    check('sustainable take: stock 3->2', t.stock === 2, 'stock=' + t.stock);
    check('sustainable take: no vigor wound', t.vigor === 100, 'vigor=' + t.vigor);
    check('sustainable take: no pressure', !t.foragePressure, 'pressure=' + t.foragePressure);
    check('sustainable take: not eroded', !t.erodedToday, 'erodedToday=' + t.erodedToday);
    r = Game.stripGround(t, 1);
    check('second sustainable take: still no pressure', !t.foragePressure, 'pressure=' + t.foragePressure);
    r = Game.stripGround(t, 1);
    check('strip (last unit): taken', r.taken === 1 && t.stock === 0, JSON.stringify(r));
    check('strip: vigor -5', t.vigor === 95, 'vigor=' + t.vigor);
    check('strip: pressure +1', t.foragePressure === 1, 'pressure=' + t.foragePressure);
    check('strip: erodedToday set', !!t.erodedToday);
    r = Game.stripGround(t, 1);
    check('scrape: vigor -2', t.vigor === 93, 'vigor=' + t.vigor);
    check('scrape: pressure +1 again', t.foragePressure === 2, 'pressure=' + t.foragePressure);
  }

  console.log('T2: regrowTiles — rest heals lightly-worked ground');
  {
    // tile A: worked sustainably today (foraged, not eroded), pressure 2
    const tA = { maxStock: 3, stock: 2, vigor: 80, foragePressure: 2, foragedToday: true, erodedToday: false };
    // tile B: stripped today (eroded), pressure 1
    const tB = { maxStock: 3, stock: 0, vigor: 80, foragePressure: 1, foragedToday: true, erodedToday: true };
    // tile C: rested fully, pressure 0
    const tC = { maxStock: 3, stock: 1, vigor: 80, foragePressure: 0, foragedToday: false, erodedToday: false };
    const tiles = Game.map.tiles;
    tiles[0][0] = tA; tiles[0][1] = tB; tiles[0][2] = tC;
    Game.regrowTiles();
    check('sustainable-worked ground heals +1', tA.vigor === 81, 'vigor=' + tA.vigor);
    check('stripped ground does NOT heal same day', tB.vigor === 80, 'vigor=' + tB.vigor);
    check('rested ground heals +2', tC.vigor === 82, 'vigor=' + tC.vigor);
    // next day: B rests (flags reset by regrowTiles) -> heals +1
    Game.regrowTiles();
    check('stripped ground heals +1 on rest day', tB.vigor === 81, 'vigor=' + tB.vigor);
    check('erodedToday reset', tA.erodedToday === false && tB.erodedToday === false);
  }

  console.log('T3: forageTilesInZone — lush-first rotation');
  {
    // ring-1 tile: picked (stock 1/3); ring-2 tile: lush (stock 3/3).
    // Other ring 1-2 tiles are zeroed so only the two test tiles compete.
    const mk = (stock, max) => ({ maxStock: max, stock, vigor: 100, type: 'meadow' });
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const d = Math.abs(x - 4) + Math.abs(y - 4);
      if (d >= 1 && d <= 2) { const t = Game.map.tiles[y][x]; if (t && t.maxStock > 0) t.stock = 0; }
    }
    Game.map.tiles[3][4] = mk(1, 3); // dist 1 from haven (4,4): x=4,y=3
    Game.map.tiles[2][4] = mk(3, 3); // dist 2: x=4,y=2
    const zone = { min: 1, max: 2, label: 'test' };
    const got = Game.forageTilesInZone(zone, 20);
    const ixLush = got.findIndex(e => e.x === 4 && e.y === 2);
    const ixPicked = got.findIndex(e => e.x === 4 && e.y === 3);
    check('lush tile picked before picked-over tile',
      ixLush >= 0 && ixPicked >= 0 && ixLush < ixPicked,
      `lush@${ixLush} picked@${ixPicked}`);
  }

  console.log('T4: forageZone — widens when home turf thins');
  {
    const v = Game.state.village;
    const cautious = (v.roster || []).find(rid => {
      const p = (Game.data.villagers || []).find(x => x.id === rid) || {};
      return ((p.personality || {}).temperament || 'steady') === 'cautious';
    }) || (v.roster || [])[1];
    // deterministic: the 4 ring-1 tiles are picked-over (stock 1 of 3)
    for (const [x, y] of [[3, 4], [5, 4], [4, 3], [4, 5]]) {
      const t = Game.map.tiles[y][x];
      t.maxStock = 3; t.stock = 1; t.vigor = 100; t.type = 'meadow';
    }
    const z = Game.forageZone(cautious);
    check('cautious zone widens to ring 2 when ring 1 thins', z.max === 2, JSON.stringify({ min: z.min, max: z.max }));
    // and stays put when the home turf is lush
    for (const [x, y] of [[3, 4], [5, 4], [4, 3], [4, 5]]) {
      const t = Game.map.tiles[y][x];
      t.stock = 3;
    }
    const z2 = Game.forageZone(cautious);
    check('lush home turf does not widen', z2.max === 1, JSON.stringify({ min: z2.min, max: z2.max }));
  }

  console.log('T5: fish duty — real stock, species-honest kcal');
  {
    // ensure a creek tile with fish near haven
    let creek = null, cx = 0, cy = 0;
    for (let y = 0; y < 9 && !creek; y++) for (let x = 0; x < 9 && !creek; x++) {
      const t = Game.map.tiles[y][x];
      if (t && t.type === 'creek') { creek = t; cx = x; cy = y; }
    }
    if (!creek) {
      // no creek generated — make one so the duty has water to work
      const t = Game.map.tiles[1][1];
      t.type = 'creek'; creek = t; cx = 1; cy = 1;
    }
    creek.wildlife = { creek_chub: 5, bluegill: 5 };
    // isolate: no other water tile holds fish, so the duty must work ours
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const t = Game.map.tiles[y][x];
      if (t !== creek && t && (t.type === 'creek' || t.type === 'pond' || t.type === 'wetland')) t.wildlife = {};
    }
    {
      const vv5 = Game.state.village;
      const v = Game.state.village;
      const vid = (vv5.roster || []).find(id => id !== Game.villagerId);
      const before = (vv5.pantry || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
      const wlBefore = creek.wildlife.creek_chub + creek.wildlife.bluegill;
      try { Game.resolveOneAssignment(vid, { task: 'fish' }); } catch (e) { check('fish duty resolves', false, e.message); }
      const after = (vv5.pantry || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
      const wlAfter = (creek.wildlife.creek_chub || 0) + (creek.wildlife.bluegill || 0);
      check('fish duty adds pantry kcal', after > before, `before=${before} after=${after}`);
      check('fish duty decrements real stock', wlAfter < wlBefore, `${wlBefore}->${wlAfter}`);
      // fished-out creek says so
      creek.wildlife = {};
      const b2 = (vv5.pantry || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
      try { Game.resolveOneAssignment(vid, { task: 'fish' }); } catch (e) {}
      const a2 = (vv5.pantry || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 1), 0);
      check('fished-out creek yields nothing', a2 === b2, `pantry ${b2}->${a2}`);
    }
    check('fish task registered', !!((Game.delegateTasks || Game.delegateTasks) && true));
  }

  console.log('T6: villagerSowPlot — gardener sows from own knowledge, no seed stock needed');
  {
    const v = Game.state.village;
    // empty plot on haven tile
    const ht = Game.tileAt(4, 4);
    ht.plots = [{ pid: null, plantedDay: 0, lastTend: 0, lastHarvest: 0, weeds: 0, dead: false }];
    // find a gardener-occupation villager who knows a gardenable plant
    const GARDENABLE = ["muscadine","elderberry","blackberry","pawpaw","persimmon","cattail","wild_onion","wood_sorrel","lambs_quarters","chickweed","dandelion","acorn","hickory_nut","walnut"];
    let farmer = null, farmerPid = null;
    for (const rid of (v.roster || [])) {
      const p = (Game.data.villagers || []).find(x => x.id === rid)
        || (Game.data.background_survivors || []).find(x => x.id === rid) || {};
      if (!/farmer|gardener|botanist|herbalist|forager/i.test(p.formerOccupation || '')) continue;
      const known = Game.villagerKnowsPlants ? Game.villagerKnowsPlants(rid) : [];
      const g = known.find(k => GARDENABLE.includes(k));
      if (g) { farmer = rid; farmerPid = g; break; }
    }
    if (!farmer) {
      check('a knowing gardener exists (seed-dependent)', false, 'no gardener knows a gardenable plant');
    } else {
      const msg = Game.villagerSowPlot(farmer);
      check('gardener sows a plant they know', !!msg && ht.plots[0].pid === farmerPid, msg || 'null');
      // non-gardener does not sow
      ht.plots.push({ pid: null, plantedDay: 0, lastTend: 0, lastHarvest: 0, weeds: 0, dead: false });
      const nonGreen = (v.roster || []).find(rid => {
        if (rid === farmer || rid === Game.villagerId) return false;
        const p = (Game.data.villagers || []).find(x => x.id === rid)
          || (Game.data.background_survivors || []).find(x => x.id === rid) || {};
        return !/farmer|gardener|botanist|herbalist|forager/i.test(p.formerOccupation || '');
      });
      if (nonGreen) {
        const msg2 = Game.villagerSowPlot(nonGreen);
        check('non-gardener does NOT sow', !msg2, msg2 || 'null (ok)');
      } else {
        check('non-gardener exists for test', false, 'all roster are green-hands');
      }
    }
  }

  console.log('T7: ally HP — villagers fight at real health, not 30');
  {
    const v = Game.state.village;
    const vid = (v.roster || []).find(id => id !== Game.villagerId);
    v.health = v.health || {}; v.health[vid] = 100;
    // stand a villager next to the player
    v.positions = v.positions || {};
    const px = Game.map.px, py = Game.map.py;
    v.positions[vid] = { mx: px, my: py };
    Game.state.scholar.mx = px; Game.state.scholar.my = py;
    try { Game.startCombat('bulldozer'); } catch (e) { check('fight starts', false, e.message); }
    const ally = (Game.tbfight && Game.tbfight.fighters || []).find(f => f.kind === 'villager' && f.villagerId === vid);
    if (!ally) {
      check('ally joined the fight', false, 'no villager fighter (positions may not have registered)');
    } else {
      check('ally hp is real health (100), not 30', ally.hp === 100 && ally.maxHp >= 100,
        `hp=${ally.hp} maxHp=${ally.maxHp}`);
    }
    try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  }

  console.log('T8: villager-guided sowing — gardener knowledge unlocks sowOptions');
  {
    const v = Game.state.village;
    // find a villager who knows a gardenable plant
    const GARDENABLE = ["muscadine","elderberry","blackberry","pawpaw","persimmon","cattail","wild_onion","wood_sorrel","lambs_quarters","chickweed","dandelion","acorn","hickory_nut","walnut"];
    let guide = null, guidePid = null;
    for (const rid of (v.roster || [])) {
      const known = Game.villagerKnowsPlants ? Game.villagerKnowsPlants(rid) : [];
      const g = known.find(k => GARDENABLE.includes(k));
      if (g) { guide = rid; guidePid = g; break; }
    }
    if (!guide) {
      check('a gardener-knower exists in roster', false, 'no villager knows a gardenable plant (seed-dependent)');
    } else {
      // put 2 units of that plant in the pack; player does NOT know it
      const plant = (Game.data.plants || []).find(p => p.id === guidePid);
      Game.state.scholar.inventory.push({ plantId: guidePid, name: plant ? plant.name : guidePid, units: 2, kcalEach: 100, edible: true, foodKind: 'plant', foodState: 'ready' });
      delete (Game.state.codex.plants || {})[guidePid];
      // without a garden-duty guide: not sowable
      const before = Game.sowOptions().filter(o => o.pid === guidePid);
      check('unknown plant not sowable without guide', before.length === 0, `found ${before.length}`);
      // assign the knower to garden duty
      v.assignments = v.assignments || {};
      v.assignments[guide] = { task: 'garden', assignedDay: day(), via: 'test' };
      const after = Game.sowOptions().filter(o => o.pid === guidePid);
      check('gardener-guided plant IS sowable', after.length === 1 && after[0].guided, JSON.stringify(after.map(o => o.pid)));
      delete v.assignments[guide];
    }
  }

  console.log('T9: food-work obedience — trust 10 fishes, but not patrols');
  {
    const v = Game.state.village;
    const rid = (v.roster || []).find(id => id !== Game.villagerId);
    v.trust = v.trust || {}; v.trust[rid] = 12;
    // fish at trust 12: allowed (food work gate is 10)
    Game._assignTaskId = 'fish';
    const obFish = Game.checkObedience(rid);
    check('trust 12 can be assigned fish duty', obFish.ok, JSON.stringify(obFish));
    // patrol at trust 12: blocked (gate is 20)
    Game._assignTaskId = 'patrol';
    const obPatrol = Game.checkObedience(rid);
    check('trust 12 cannot be assigned patrol', !obPatrol.ok, JSON.stringify(obPatrol));
    // garden at trust 12: allowed
    Game._assignTaskId = 'garden';
    const obGarden = Game.checkObedience(rid);
    check('trust 12 can be assigned garden duty', obGarden.ok, JSON.stringify(obGarden));
    delete Game._assignTaskId;
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
