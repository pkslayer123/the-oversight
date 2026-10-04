// Food reality tests. Usage: node scripts/test-food-reality.js
// Covers: knowledge-gated recognition (unknown berry not food), food states
// (turkey pipeline carcass->cleaned->cooked->preserved), shelling net<gross,
// raw disease risk, spoilage timing, prey reaction + weapon range,
// technique knowledge + specialist economy, pantry/water caps + upgrades.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.health = 100;
  s.inventory = [];
  return s;
}
const plant = (id) => Game.data.plants.find(p => p.id === id);
const animal = (id) => Game.data.animals.find(a => a.id === id);
const origRandom = Math.random;

(async () => {
  await Game.init();

  // ---- 1. KNOWLEDGE GATING ----
  freshGame();
  const dand = plant('dandelion');
  const unk = Game.foodForageItem(dand, false, 6, 6 * 45, 1);
  ok('unknown: not edible', unk.edible === false);
  ok('unknown: kcalEach 0', unk.kcalEach === 0);
  ok('unknown: hides real kcal', unk.hiddenKcal === 45);
  const known = Game.foodForageItem(dand, true, 6, 6 * 45, 1);
  ok('known dandelion: edible', known.edible === true && known.kcalEach === 45);

  const hick = plant('hickory_nut');
  const nut = Game.foodForageItem(hick, true, 10, 10 * 200, 1);
  ok('known nut: in shell, not food yet', nut.edible === false && nut.foodState === 'in_shell' && nut.kcalEach === 0);
  ok('known nut: gross remembered', nut.hiddenKcal === 200);

  const elder = plant('elderberry');
  const eb = Game.foodForageItem(elder, true, 8, 8 * 40, 1);
  ok('must-cook plant: flagged', eb.needsCooking === true && !!eb.diseaseRisk);

  // eat() skips unknown/inedible food
  freshGame();
  {
    const s = Game.state.scholar;
    s.kcal = 100;
    s.inventory.push(Game.foodForageItem(dand, false, 6, 450, s.day));
    s.inventory.push(Object.assign(Game.foodForageItem(dand, true, 6, 450, s.day), { spoilDay: s.day + 5 }));
    Game.say = () => {};
    Game.eat();
    ok('eat skips unknown haul', s.inventory.some(i => i.foodState === 'unknown'));
    ok('eat ate the known food', !s.inventory.some(i => i.foodState === 'ready'));
  }

  // identification flips the haul into real food
  freshGame();
  {
    const s = Game.state.scholar;
    // pick a plant the background didn't already grant (background knowledge
    // is random per run — using dandelion here flakes).
    const p2 = Game.data.plants.find(p => !Game.plantKnown(p.id) && !/crack|shell|husk/i.test(p.preparation || '') && (p.caloriesPerUnit || 0) > 0);
    s.inventory.push(Game.foodForageItem(p2, false, 6, 6 * p2.caloriesPerUnit, s.day));
    ok('pre-identify: still unknown', Game.state.scholar.inventory[0].edible === false);
    Game.say = () => {};
    Game.identifyPlant(p2.id, 'observation');
    const it = Game.state.scholar.inventory[0];
    ok('identify flips unknown -> edible', it.edible === true && it.kcalEach === p2.caloriesPerUnit && it.foodState === 'ready');
  }

  // ---- 2. TURKEY PIPELINE ----
  freshGame();
  {
    const s = Game.state.scholar;
    const turkey = animal('wild_turkey');
    const car = Game.foodCarcass(turkey, 3000, s.day, 'hunted');
    ok('carcass: not food', car.edible === false && car.kcalEach === 0);
    ok('carcass: spoils ~2 days', car.spoilDay === s.day + 2);
    ok('carcass: gross remembered', car.hiddenKcal === 3000);
    s.inventory.push(car);

    Game.say = () => {};
    Game.cleanCarcass(0); // no knife
    ok('clean refused without knife', s.inventory[0].foodState === 'carcass');
    s.inventory.push({ name: "Grandfather's knife", units: 1, kcalEach: 0 });

    // force unknown technique: wipe grants
    Game.state.codex.techniques = { clean: false, cook: false, preserve: false, shell: true };
    Game.cleanCarcass(0); // messy attempt
    const raw = s.inventory[0];
    ok('messy clean: works, lower yield', raw.foodState === 'cleaned' && raw.units === 4 && raw.kcalEach === 225);
    ok('messy clean: risky + spoils fast', !!raw.diseaseRisk && raw.spoilDay === s.day + 2);
    ok('messy clean: teaches', Game.knowsTechnique('clean') === true);

    // skilled clean on a fresh turkey
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.cleanCarcass(2);
    const raw2 = s.inventory[2];
    ok('skilled clean: 40% yield', raw2.kcalEach === 300 && raw2.units === 4);

    // cook requires fire; cooking is a technique (messy first time)
    const origNear = Game.nearFire;
    Game.nearFire = () => false;
    Game.cookAll();
    ok('cookAll refused without fire', s.inventory[2].foodState === 'cleaned');
    Game.nearFire = () => true;
    ok('cook technique unknown before first cook', Game.knowsTechnique('cook') === false);
    Game.cookAll();
    const cooked = s.inventory[2];
    ok('messy cook: 85% kcal', cooked.kcalEach === 638); // 3000*0.85/4 portions
    ok('messy cook: safe + spoilDay +5', cooked.safe === true && !cooked.diseaseRisk && cooked.spoilDay === s.day + 5);
    ok('messy cook: teaches', Game.knowsTechnique('cook') === true);
    // skilled cook on a fresh turkey: full value
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.cleanCarcass(3);
    Game.cookAll();
    ok('skilled cook: full kcal', s.inventory[3].kcalEach === 750); // 3000/4 portions
    Game.nearFire = origNear;

    // preserve
    Game.nearFire = () => true;
    Game.preserveFood(2);
    const smoked = s.inventory[2];
    ok('preserved messy: keeps ~2 weeks', smoked.foodState === 'preserved' && smoked.spoilDay === s.day + 15);
    ok('preserved messy: 80% of cooked value', smoked.kcalEach === Math.round(638 * 0.8)); // messy: no technique
    // skilled preserve: full month
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.state.codex.techniques.preserve = true;
    Game.cleanCarcass(4);
    Game.cookAll();
    Game.preserveFood(4);
    ok('preserved skilled: keeps ~month', s.inventory[4].spoilDay === s.day + 30);
    Game.nearFire = origNear;
  }

  // ---- 3. SHELLING NET < GROSS ----
  freshGame();
  {
    const s = Game.state.scholar;
    s.inventory.push(Game.foodForageItem(hick, true, 10, 600, s.day));
    Game.say = () => {};
    Game.shellNuts(0);
    const sh = s.inventory[0];
    ok('shelled: edible', sh.edible === true && sh.foodState === 'shelled');
    ok('shelled: net 75% of gross', sh.kcalEach === 150); // 200 * 0.75
  }

  // ---- 4. RAW DISEASE ----
  freshGame();
  {
    const s = Game.state.scholar;
    s.kcal = 100;
    const raw = Object.assign(Game.foodForageItem(dand, true, 2, 150, s.day), { spoilDay: s.day + 5 });
    raw.diseaseRisk = { p: 0.35, dmg: 12, note: 'raw meat' };
    s.inventory.push(raw);
    Game.say = () => {};
    Math.random = () => 0; // force the roll
    const h0 = s.health;
    Game.eat();
    Math.random = origRandom;
    ok('raw disease: health drops', s.health < h0);
  }

  // ---- 5. PREY REACTION + RANGE ----
  freshGame();
  {
    const s = Game.state.scholar;
    const turkey = animal('wild_turkey');
    s.animal = { id: turkey.id, mx: 5, my: 4 };
    Game.say = () => {};
    Game.genDetail = Game.genDetail || (() => Array.from({ length: 9 }, () => Array(9).fill('grass')));
    const origGen = Game.genDetail;
    Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('grass'));
    Math.random = () => 0; // force flee
    const fled = Game.preyReaction(s.animal);
    Math.random = origRandom;
    ok('prey reaction: can bolt', fled === true);
    // cornered: nowhere to run
    s.animal = { id: turkey.id, mx: 0, my: 0 };
    s.mx = 1; s.my = 0;
    let fledCount = 0;
    Math.random = () => 0.5;
    for (let i = 0; i < 20; i++) if (Game.preyReaction({ id: turkey.id, mx: 0, my: 0 })) fledCount++;
    Math.random = origRandom;
    ok('cornered prey rarely flees', fledCount < 5);
    Game.genDetail = origGen;
    // range: unarmed too far at dist 2
    s.animal = { id: turkey.id, mx: 6, my: 4 };
    s.mx = 4; s.my = 4;
    let said = '';
    Game.say = (m) => { said = m; };
    Math.random = () => 0.99; // no flee: test the range gate itself
    Game.huntAnimal();
    Math.random = origRandom;
    ok('unarmed hunt at dist 2: too far (no free reaction roll)', /Too far/.test(said));
  }

  // ---- 6. TECHNIQUES + SPECIALISTS ----
  freshGame();
  {
    ok('shelling known by all', Game.knowsTechnique('shell') === true);
    // plant a chef at the haven
    const v = Game.state.village;
    v.nodePos = v.nodePos || {};
    const fakeId = 'bg_chef_test';
    v.roster.push(fakeId);
    v.rosterChars[fakeId] = { id: fakeId, name: 'Mara Test', formerOccupation: 'chef' };
    v.nodePos[fakeId] = { nx: Game.map.px, ny: Game.map.py };
    const cooks = Game.specialistsHere('cook');
    ok('specialist found here', cooks.length > 0 && cooks[0].skill >= 2);
    const butchers0 = Game.specialistsHere('butcher');
    ok('chef is also a butcher (skill 2)', butchers0.some(b => b.id === fakeId));

    // ask the specialist to clean a carcass: better yield than messy self
    const s = Game.state.scholar;
    const turkey = animal('wild_turkey');
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.say = () => {};
    Game.state.codex.techniques.clean = false;
    Game.askSpecialist(fakeId, 0);
    const cleaned = s.inventory[0];
    ok('specialist clean: 48% yield (skill 2)', cleaned.kcalEach === 360 && cleaned.units === 4);
    // watching twice teaches
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.askSpecialist(fakeId, 1);
    ok('watched twice: learned cleaning', Game.knowsTechnique('clean') === true);
  }

  // ---- 7. PANTRY / WATER CAPS ----
  freshGame();
  {
    ok('default pantry cap 120k', Game.pantryCapKcal() === 120000);
    ok('default water cap 40L', Game.waterCapL() === 40);
    const s = Game.state.scholar;
    // fill pantry to the brim with phantom kcal
    Game.state.village.pantry = [{ name: 'X', units: 1, kcalEach: 119999, spoilDay: 99 }];
    s.inventory.push({ name: 'Y', units: 1, kcalEach: 500, spoilDay: 99 });
    let said = '';
    Game.say = (m) => { said = m; };
    Game.donateToPantry(0);
    ok('donate blocked at cap', /full/.test(said) && s.inventory.length === 1);

    // expand: materials + labor
    Game.state.village.pantry = [];
    s.inventory = [
      { material: 'branch', units: 20, name: 'Branch', kcalEach: 0, spoilDay: 9999 },
      { material: 'stone', units: 20, name: 'Stone', kcalEach: 0, spoilDay: 9999 },
      { material: 'vine', units: 20, name: 'Vine', kcalEach: 0, spoilDay: 9999 },
    ];
    // remove the fake chef so no builder discount... (chef isn't a builder anyway)
    Game.say = () => {};
    Game.expandStorage();
    ok('expand: tier 1', Game.storageTier() === 1);
    ok('expand: pantry cap x1.5', Game.pantryCapKcal() === 180000);
    ok('expand: water +20L', Game.waterCapL() === 60);
    ok('expand: consumed materials', s.inventory.every(i => i.units < 20));

    // water cap enforced
    Game.state.village.water = { clean: 60, dirty: 0 };
    said = '';
    Game.say = (m) => { said = m; };
    Game.fillWater();
    ok('fillWater blocked at cap', /full/.test(said));
  }

  // ---- 8. HAUL-TO-PANTRY LOOP (specialist economy) ----
  freshGame();
  {
    const s = Game.state.scholar;
    const turkey = animal('wild_turkey');
    const dand = plant('dandelion');
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    s.inventory.push(Game.foodForageItem(dand, false, 6, 270, s.day));
    s.inventory.push(Object.assign(Game.foodForageItem(dand, true, 6, 270, s.day), { spoilDay: s.day + 5 }));
    Game.say = () => {};
    Game.state.village.pantry = [];
    Game.returnToVillage();
    const pan = Game.state.village.pantry;
    ok('carcass unloads to pantry', pan.some(i => i.foodState === 'carcass'));
    ok('unknown haul unloads to pantry', pan.some(i => i.foodState === 'unknown'));
    ok('pantry cap ignores ingredients (0 kcal)', Game.pantryKcal() === 270);
    ok('pack cleared of hauls', !s.inventory.some(i => i.foodKind));

    // take the carcass back out: state survives the round trip
    const cIdx = pan.findIndex(i => i.foodState === 'carcass');
    Game.takeFromPantryBulk({ [cIdx]: 1 });
    const back = s.inventory.find(i => i.foodState === 'carcass');
    ok('pantry round trip keeps carcass state', !!back && back.hiddenKcal === 3000 && back.edible === false);

    // villageEats doesn't crash on ingredient pantry, skips 0-kcal
    Game.state.village.pantry = [Game.foodCarcass(turkey, 3000, s.day, 'hunted')];
    try { Game.villageEats(); ok('villageEats tolerates carcass pantry', true); }
    catch (e) { ok('villageEats tolerates carcass pantry', false); }

    // villageHasSpecialty
    const v = Game.state.village;
    const fakeId = 'bg_cook_test';
    v.roster.push(fakeId);
    v.rosterChars[fakeId] = { id: fakeId, name: 'Aki Test', formerOccupation: 'sushi chef' };
    ok('villageHasSpecialty(cook)', Game.villageHasSpecialty('cook') === true);
    ok('villageHasSpecialty(preserver) via sushi chef', Game.villageHasSpecialty('preserver') === true);
  }

  // ---- 9. THE RESERVE (food is humanity's superpower) ----
  freshGame();
  {
    const s = Game.state.scholar;
    const dand = plant('dandelion');
    Game.say = () => {};
    ok('reserve cap 4800', Game.reserveCap() === 4800);
    ok('reserve starts empty', Game.reserve() === 0 && Game.feastState() === 'empty');

    // meal quality ladder
    const rawMeat = { foodKind: 'meat', foodState: 'cleaned', diseaseRisk: { p: 0.3 }, kcalEach: 300 };
    const cooked = { foodKind: 'meat', foodState: 'cooked', safe: true, kcalEach: 750 };
    const smoked = { foodKind: 'meat', foodState: 'preserved', safe: true, kcalEach: 700 };
    const chefMade = Object.assign({}, cooked, { wellMade: true });
    const greens = { foodKind: 'plant', foodState: 'ready', kcalEach: 45 };
    ok('quality: raw risky 0.5', Game.mealQuality(rawMeat) === 0.5);
    ok('quality: cooked 1.0', Game.mealQuality(cooked) === 1.0);
    ok('quality: preserved 1.1', Game.mealQuality(smoked) === 1.1);
    ok('quality: specialist 1.3', Game.mealQuality(chefMade) === 1.3);
    ok('quality: safe raw 0.7', Game.mealQuality(greens) === 0.7);

    // FEAST: deliberate, quality-rated, capped
    s.inventory.push(Object.assign({}, cooked, { units: 4, name: 'Turkey (cooked)', spoilDay: s.day + 5 }));
    Game.feast();
    ok('feast fills reserve at quality', s.reserveKcal === 3000); // 4×750×1.0
    ok('feast state feasting', Game.feastState() === 'feasting');
    s.inventory.push(Object.assign({}, chefMade, { units: 4, name: 'Turkey (chef)', spoilDay: s.day + 5 }));
    Game.feast();
    ok('reserve capped at 4800', s.reserveKcal === 4800);
    ok('gorged at 3600+', Game.feastState() === 'gorged');
    ok('reserve quality tracks best fuel', Game.reserveQuality() > 1);

    // FEASTBURN: visible pipeline
    let said = '';
    Game.say = (m) => { said = m; };
    const mult = Game.feastBurn();
    ok('feastburn returns multiplier', mult > 1);
    ok('feastburn burns reserve', s.reserveKcal === 4400); // gorged burn 400
    ok('feastburn says the line', /FEASTBURN/.test(said) && /feast was the weapon/.test(said));
    s.reserveKcal = 100;
    Game.say = () => {};
    ok('feastburn needs 300 reserve', Game.feastBurn() === 0);

    // eat() overshoot banks into reserve instead of vanishing
    s.kcal = 2300; s.reserveKcal = 0;
    s.inventory.push(Object.assign(Game.foodForageItem(dand, true, 2, 90, s.day), { spoilDay: s.day + 5, units: 2 }));
    Game.say = () => {};
    Game.eat(); // target 2400: eats 2×45=90 → 2390... need bigger overshoot
    // force a real overshoot: big unit
    s.kcal = 2350;
    s.inventory.push({ name: 'Big meal', units: 1, kcalEach: 500, spoilDay: s.day + 5, foodKind: 'meat', foodState: 'cooked', safe: true });
    Game.eat();
    ok('eat caps body kcal at target', s.kcal === 2400);
    ok('overshoot banks to reserve', s.reserveKcal > 0);

    // wellMade set by specialist
    const turkey = animal('wild_turkey');
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    const v = Game.state.village;
    const fakeId = 'bg_chefw_test';
    v.roster.push(fakeId);
    v.rosterChars[fakeId] = { id: fakeId, name: 'Aki W', formerOccupation: 'sushi chef' };
    v.nodePos = v.nodePos || {};
    v.nodePos[fakeId] = { nx: Game.map.px, ny: Game.map.py };
    Game.techniques(); // init
    Game.state.codex.techniques.clean = true;
    s.inventory.push({ name: "Grandfather's knife", units: 1, kcalEach: 0 });
    const cIdx = s.inventory.findIndex(i => i.foodState === 'carcass');
    Game.cleanCarcass(cIdx);
    const mIdx = s.inventory.findIndex(i => i.foodState === 'cleaned');
    Game.nearFire = () => true;
    Game.askSpecialist(fakeId, mIdx);
    // askSpecialist with a cook-specialist on cleaned meat → cook branch sets wellMade
    const wm = s.inventory.find(i => i.wellMade);
    ok('specialist cooking marks wellMade', !!wm);
  }

  console.log(`\nfood-reality: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
