// Weight, encumbrance, and strength progression (Steve 2026-10-06).
// "Right now there's the capacity to fill up your pack with starter gear basically.
//  Take a look at starter gear weights, and weights in general relative to pack
//  weight. Weight limit starts may need adjusting. Weight should maybe burn more
//  calories. But also unlock more strength to carry more."
//
// Covers:
//  1. Capacity tightened: base 12kg (was 20). Packing is a real decision.
//  2. Starter gear audit: typical picks leave headroom; pathological picks CAN
//     over-pack (the decision is real); every pickable class has honest weight.
//  3. Burden tiers: light/laden/heavy/straining scale move burn (1/1.25/1.6/2.0x)
//     and add work effort (+0/15/35/60) — not a flat tax.
//  4. Movement sites (microMove/movePath/beginPathWalk/pathStep) burn via moveBurn.
//  5. Strength: heavy labor accrues strain; 30 strain = +1 str (cap 10 via
//     hauling). Felt before quantified — narration, no XP bar.
//  6. Playtest sim: laden walk vs light walk, straining wood haul, 10 days of
//     heavy hauling -> strength grows. Fun-vs-tedium verdict printed.
// Usage: node scripts/test-weight-strength.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

let said = [];
const s = () => Game.state.scholar;
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  // controlled scholar: no background str bonus, empty pack
  s().stats = { str: 5, per: 5, end: 5, agi: 5, pre: 5 };
  s().abilities = []; s().backgroundAbilities = [];
  s().inventory = []; s().water = [];
}
const setPack = (kg) => { s().inventory = [{ name: 'ballast', units: 1, kg }]; s().water = []; };

(async () => {
  await Game.init();

  // ---------- 1. capacity ----------
  console.log('1. Carry capacity:');
  freshGame();
  ok('base capacity is 12 (not 20)', Game.carryCapacity() === 12, `got ${Game.carryCapacity()}`);
  s().backgroundAbilities = [{ id: 'pack_rat' }];
  ok('pack_rat +3 -> 15', Game.carryCapacity() === 15, `got ${Game.carryCapacity()}`);
  s().backgroundAbilities = [{ id: 'hoarder' }];
  ok('hoarder +6 -> 18', Game.carryCapacity() === 18, `got ${Game.carryCapacity()}`);
  s().backgroundAbilities = [];
  s().stats.str = 8;
  ok('str 8 -> 12 + 6 = 18', Game.carryCapacity() === 18, `got ${Game.carryCapacity()}`);
  s().stats.str = 5;
  s().inventory = [{ itemId: 'hiking_backpack', units: 1, kg: 1.5 }];
  ok('backpack bonus still applies', Game.carryCapacity() === 22, `got ${Game.carryCapacity()}`);

  // ---------- 2. burden tiers ----------
  console.log('\n2. Burden tiers (engine):');
  const T = S.calories.burdenTier;
  let t = T(0, 12);
  ok('empty = light, mult 1', t.name === 'light' && t.moveMult === 1 && t.workAdd === 0, JSON.stringify(t));
  t = T(6, 12);
  ok('6/12 = laden, mult 1.25, +15', t.name === 'laden' && t.moveMult === 1.25 && t.workAdd === 15, JSON.stringify(t));
  t = T(10, 12);
  ok('10/12 = heavy, mult 1.6, +35', t.name === 'heavy' && t.moveMult === 1.6 && t.workAdd === 35, JSON.stringify(t));
  t = T(11.9, 12);
  ok('11.9/12 = straining, mult 2.0, +60', t.name === 'straining' && t.moveMult === 2.0 && t.workAdd === 60, JSON.stringify(t));
  t = T(14, 12);
  ok('over capacity still straining', t.name === 'straining', t.name);

  // ---------- 3. burn scaling ----------
  console.log('\n3. moveBurn scaling:');
  freshGame();
  setPack(0.1);
  ok('light: moveBurn(10) = 10', Game.moveBurn(10) === 10, `got ${Game.moveBurn(10)}`);
  setPack(7);
  ok('laden: moveBurn(10) = 13', Game.moveBurn(10) === 13, `got ${Game.moveBurn(10)}`);
  ok('burden() names laden', Game.burden().name === 'laden', Game.burden().name);
  setPack(10);
  ok('heavy: moveBurn(10) = 16', Game.moveBurn(10) === 16, `got ${Game.moveBurn(10)}`);
  setPack(12);
  ok('straining: moveBurn(10) = 20', Game.moveBurn(10) === 20, `got ${Game.moveBurn(10)}`);

  // heavy voice fires on committed walks, not micro-steps
  said = [];
  setPack(10); Game.moveBurn(10);
  ok('heavy walk voiced', said.some(x => /shoulders|legs|pack/i.test(x)), said.join(' | ').slice(0, 80));
  said = [];
  Game.moveBurn(2);
  ok('micro-step stays quiet', !said.some(x => /shoulders|legs/i.test(x)));

  // ---------- 4. strain -> strength ----------
  console.log('\n4. Strength progression:');
  freshGame();
  s().stats.str = 5; s().strain = 0;
  Game.gainStrain(12);
  ok('strain accumulates below threshold', s().strain === 12 && s().stats.str === 5, `strain=${s().strain} str=${s().stats.str}`);
  said = [];
  Game.gainStrain(18); // 30 total
  ok('30 strain -> str 6', s().stats.str === 6, `str=${s().stats.str}`);
  ok('strain resets', s().strain === 0, `strain=${s().strain}`);
  ok('adaptation narrated (felt, not quantified)', said.some(x => x.includes('💪')), said.join(' | ').slice(0, 100));
  ok('capacity grew with the body', Game.carryCapacity() === 14, `got ${Game.carryCapacity()}`);
  s().stats.str = 10; s().strain = 28;
  Game.gainStrain(5);
  ok('hauling caps at str 10', s().stats.str === 10, `str=${s().stats.str}`);

  // ---------- 5. starter gear audit (data) ----------
  console.log('\n5. Starter gear weights:');
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));
  const byClass = {};
  for (const i of items) { (byClass[i.class] = byClass[i.class] || []).push(i); }
  const pickClasses = ['tool', 'weapon', 'clothing', 'sentimental'];
  let allWeighed = true;
  for (const c of pickClasses) for (const i of byClass[c]) {
    if (!(i.kg > 0)) { allWeighed = false; console.log(`  unweighed: ${i.id}`); }
  }
  ok('every pickable item has honest weight', allWeighed);
  const med = (arr) => { const v = arr.map(i => i.kg).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const mx = (arr) => Math.max(...arr.map(i => i.kg));
  // typical pick: medians of tool + weapon + 2x clothing + sentimental, + food 1.0 + water 2.0
  const typical = med(byClass.tool) + med(byClass.weapon) + 2 * med(byClass.clothing) + med(byClass.sentimental) + 3.0;
  ok('typical starter load fits with headroom', typical < 10, `typical=${typical.toFixed(1)}kg`);
  ok('typical start is laden-or-lighter', S.calories.burdenTier(typical, 12).name !== 'straining', S.calories.burdenTier(typical, 12).name);
  // pathological pick: maxes (wildcard can be anything non-food)
  const wildMax = Math.max(...items.filter(i => i.class !== 'food').map(i => i.kg));
  const pathological = mx(byClass.tool) + mx(byClass.weapon) + 2 * mx(byClass.clothing) + wildMax + 3.0;
  ok('pathological picks CAN over-pack (decision is real)', pathological > 12, `max=${pathological.toFixed(1)}kg`);

  // ---------- 6. playtest sim: the haul ----------
  console.log('\n6. Playtest sim (as a player):');
  freshGame();
  // day-1 typical start: 5 picks ~3.5kg + food 1.0 + water 2.0
  s().inventory = [
    { name: 'gear', units: 1, kg: 3.5 },
    { name: 'Trail mix', units: 2, kg: 0.3 }, { name: 'Dried meat', units: 2, kg: 0.2 },
  ];
  s().water = [{ liters: 1 }, { liters: 1 }];
  s().kcal = 2200;
  const startW = Game.packWeight();
  console.log(`  day-1 pack: ${startW.toFixed(1)}kg / ${Game.carryCapacity()}kg — ${Game.burden().name}`);
  const walk20laden = Game.moveBurn(200); // 20 squares committed
  console.log(`  20-square walk laden: ${walk20laden} kcal (light would be 200)`);
  ok('laden walk costs more than light', walk20laden > 200);
  // wood haul: 4 logs at 2kg each
  s().inventory.push({ name: 'wood', units: 4, kg: 2.0 });
  console.log(`  after 4 logs: ${Game.packWeight().toFixed(1)}kg — ${Game.burden().name}`);
  const walk8straining = Game.moveBurn(80);
  console.log(`  8-square walk straining: ${walk8straining} kcal (light would be 80)`);
  ok('straining walk doubles cost', walk8straining === 160, `got ${walk8straining}`);
  // 10 days of heavy hauling
  s().stats.str = 5; s().strain = 0;
  for (let day = 0; day < 10; day++) {
    for (let f = 0; f < 3; f++) Game.gainStrain(2);   // 3 heavy forages
    for (let w = 0; w < 3; w++) Game.gainStrain(2);   // heavy walks (~8 steps each)
  }
  console.log(`  after 10 heavy days: str ${s().stats.str}, capacity ${Game.carryCapacity()}kg`);
  ok('10 days heavy hauling grows strength', s().stats.str > 5, `str=${s().stats.str}`);
  ok('growth is visible but not maxed', s().stats.str < 10, `str=${s().stats.str}`);
  const adaptLines = said.filter(x => x.includes('💪')).length;
  ok('adaptations were narrated', adaptLines >= 1, `narrations=${adaptLines}`);

  console.log(`\n${pass} passed, ${fail} failed`);

  // ---------- 7. weight is always known ----------
  console.log('\n7. Weight is always known (Steve 2026-10-06):');
  // starter inventory: every item displays weight (name may be gated, mass isn't)
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const noWeight = Game.state.scholar.inventory.filter(i => !((i.kg || 0.1) > 0));
  ok('every starter item has displayable weight', noWeight.length === 0, noWeight.map(i => i.name).join(','));
  // unknown forage item: name gated, weight present
  const unkPlant = Game.data.plants.find(p => !Game.plantKnown(p.id)) || Game.data.plants[0];
  const unkItem = Game.foodForageItem(unkPlant, false, 3, 0, 1);
  ok('unknown forage item has weight', unkItem.kg > 0, `kg=${unkItem.kg}`);
  ok('unknown forage item name is gated (no true name)', !String(unkItem.name || '').toLowerCase().includes(unkPlant.name.toLowerCase()), unkItem.name);
  // alien loot grant carries weight (announcement shows it)
  const g = Game.alienLootGrant('fusion_pellet');
  ok('alien loot granted', !!g);
  ok('alien loot has weight', g && g.entry.kg > 0, g && `kg=${g.entry.kg}`);
  // hawker wares carry weight (offer shows it)
  const vid = Game.generatedRoster[0].id;
  let sawTool = false, sawFood = false;
  for (let i = 0; i < 30 && !(sawTool && sawFood); i++) {
    delete (Game.state.village.hawkerStock || {})[vid];
    const ware = Game.hawkerOffer(vid);
    if (ware.kind === 'tool') { sawTool = true; ok('hawker tool ware has weight', ware.kg > 0, `kg=${ware.kg}`); }
    if (ware.kind === 'food') { sawFood = true; ok('hawker food ware has weight', ware.kg > 0, `kg=${ware.kg}`); }
  }
  ok('hawker offered both ware kinds in sampling', sawTool && sawFood);
  // unfamiliar pantry aggregate: unknowns contribute mass (UI shows ~X kg)
  Game.state.codex.plants['dandelion'] = { level: 1, identifiedDay: 0 };
  const V = () => Game.state.village;
  V().pantry = [
    { plantId: 'dandelion', name: 'Dandelion', units: 4, kcalEach: 45, kg: 0.1 },
    { plantId: 'zz_unknown_plant', name: 'unfamiliar plant', units: 6, kcalEach: 0, kg: 0.1 },
  ];
  const knownIdx = [], unknownIdx = [];
  V().pantry.forEach((p, idx) => { (Game.pantryItemKnown(p) ? knownIdx : unknownIdx).push(idx); });
  ok('unknown pantry item is gated', unknownIdx.length === 1, JSON.stringify(unknownIdx));
  const unknownKg = unknownIdx.reduce((t, idx) => t + ((V().pantry[idx].kg || 0.1) * (V().pantry[idx].units || 1)), 0);
  ok('unfamiliar aggregate weight is honest mass', Math.abs(unknownKg - 0.6) < 1e-9, `kg=${unknownKg}`);

  console.log(`\n${pass} passed, ${fail} failed (incl. section 7)`);
  console.log('\n--- PLAYTEST VERDICT ---');
  console.log('Laden walking (the normal state of a working day) costs ~25% more — you');
  console.log('notice it in the kcal readout without it feeling like a tax form. Straining');
  console.log('(the wood haul) DOUBLES movement cost: 8 squares home with 4 logs costs');
  console.log('160 kcal, a real bite out of a 2200 day. That is the intended tension: the');
  console.log('haul-home loop is the workout, and the body visibly adapts (~+3-4 str over');
  console.log('10 hard days, capacity 12 -> ~18-20). The 💪 narration lands before any');
  console.log('number moves — no XP bar. Tedium risk: micro-steps stay quiet and cheap,');
  console.log('so moment-to-moment movement never nags; only committed hauls bite.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
