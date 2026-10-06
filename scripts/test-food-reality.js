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
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
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

    // skilled clean on a fresh turkey.
    // (cleanCarcass drops feather/bone byproducts, so locate the carcass by
    // state instead of a hardcoded index.)
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    const carIdx2 = s.inventory.findIndex(i => i.foodState === 'carcass');
    Game.cleanCarcass(carIdx2);
    const raw2 = s.inventory[carIdx2];
    ok('skilled clean: 40% yield', raw2.kcalEach === 300 && raw2.units === 4);

    // cook requires fire; cooking is a technique (messy first time)
    const origNear = Game.nearFire;
    Game.nearFire = () => false;
    Game.cookAll();
    ok('cookAll refused without fire', s.inventory[carIdx2].foodState === 'cleaned');
    Game.nearFire = () => true;
    ok('cook technique unknown before first cook', Game.knowsTechnique('cook') === false);
    Game.cookAll();
    const cooked = s.inventory[carIdx2];
    ok('messy cook: 85% kcal', cooked.kcalEach === 638); // 3000*0.85/4 portions
    ok('messy cook: safe + spoilDay +5', cooked.safe === true && !cooked.diseaseRisk && cooked.spoilDay === s.day + 5);
    ok('messy cook: teaches', Game.knowsTechnique('cook') === true);
    // skilled cook on a fresh turkey: full value
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    const carIdx3 = s.inventory.findIndex(i => i.foodState === 'carcass');
    Game.cleanCarcass(carIdx3);
    Game.cookAll();
    ok('skilled cook: full kcal', s.inventory[carIdx3].kcalEach === 750); // 3000/4 portions
    Game.nearFire = origNear;

    // preserve
    Game.nearFire = () => true;
    const cookIdx = s.inventory.findIndex(i => i.foodState === 'cooked');
    Game.preserveFood(cookIdx);
    const smoked = s.inventory[cookIdx];
    ok('preserved messy: keeps ~2 weeks', smoked.foodState === 'preserved' && smoked.spoilDay === s.day + 15);
    ok('preserved messy: 80% of cooked value', smoked.kcalEach === Math.round(638 * 0.8)); // messy: no technique
    // skilled preserve: full month
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.state.codex.techniques.preserve = true;
    const carIdx4 = s.inventory.findIndex(i => i.foodState === 'carcass');
    Game.cleanCarcass(carIdx4);
    Game.cookAll();
    Game.preserveFood(carIdx4);
    ok('preserved skilled: keeps ~month', s.inventory[carIdx4].spoilDay === s.day + 30);
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
    // watching twice teaches (locate the fresh carcass: byproducts shift indices)
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    const carIdxW = s.inventory.findIndex(i => i.foodState === 'carcass');
    Game.askSpecialist(fakeId, carIdxW);
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

    // water: haven fills DRAW the shared cistern (finite — haulers refill it).
    // (The old "blocked at cap" wrapper was backwards: it blocked creek fills
    // when the cistern was full. Filling draws; hauling fills.)
    Game.state.village.water = { clean: 60, dirty: 0 };
    said = '';
    Game.say = (m) => { said = m; };
    const bw0 = (Game.state.scholar.water || []).length;
    Game.fillWater();
    ok('fillWater draws the cistern', Game.state.village.water.clean === 59 && (Game.state.scholar.water || []).length === bw0 + 1);
    // dry cistern: refused with a clear message, no bottle minted
    Game.state.village.water = { clean: 0, dirty: 0 };
    said = '';
    Game.say = (m) => { said = m; };
    const bw1 = (Game.state.scholar.water || []).length;
    Game.fillWater();
    ok('fillWater refused when cistern dry', /dry/.test(said) && (Game.state.scholar.water || []).length === bw1);
  }

  // ---- 8. HAUL-TO-STASH LOOP (prep staging) ----
  // PREP STASH: unprocessed hauls land on the counter, not in the pantry.
  // Only correctly identified, prepped food goes to the pantry.
  freshGame();
  {
    const s = Game.state.scholar;
    const turkey = animal('wild_turkey');
    const dand = plant('dandelion');
    s.inventory.push(Game.foodCarcass(turkey, 3000, s.day, 'hunted'));
    Game.addUnknownToLump(dand, 6, s.day);
    s.inventory.push(Object.assign(Game.foodForageItem(dand, true, 6, 270, s.day), { spoilDay: s.day + 5 }));
    Game.say = () => {};
    Game.state.village.pantry = [];
    Game.returnToVillage();
    const pan = Game.state.village.pantry;
    const stash = Game.prepStash();
    ok('carcass stages to prep stash', stash.some(i => i.foodState === 'carcass'));
    ok('unknown lump stages to prep stash', stash.some(i => i.lump));
    // THE FIX: the forager keeps a day's food (~2000 kcal) in the pack; only
    // SURPLUS unloads to the pantry. (The old vacuum took everything and the
    // player starved next to a full pantry.) Here the finished haul is 270 kcal
    // — under a day's food — so it all stays in the pack.
    ok('small finished haul stays in the pack (keep a day\'s food)', s.inventory.some(i => i.plantId === 'dandelion' && i.foodState === 'ready'));
    ok('no surplus: pantry gets nothing', !pan.some(i => i.plantId === 'dandelion' && i.foodState === 'ready'));
    ok('unprocessed still stages, pack not wiped of non-food', !s.inventory.some(i => i.foodKind && i.foodState !== 'ready'));

    // carcass keeps state on the counter
    const staged = stash.find(i => i.foodState === 'carcass');
    ok('stash round trip keeps carcass state', !!staged && staged.hiddenKcal === 3000 && staged.edible === false);

    // villageEats doesn't crash on weird pantry, skips 0-kcal
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

  // ---- 9. THE BANK (food is humanity's superpower) ----
  // One pool: the kcal bar IS the reserve. No separate reserveKcal.
  freshGame();
  {
    const s = Game.state.scholar;
    const dand = plant('dandelion');
    Game.say = () => {};
    ok('no separate reserve pool', Game.reserveCap === undefined && Game.addReserve === undefined && Game.feast === undefined);
    ok('baseline cap 2400 (~a day)', Game.kcalCap() === 2400);
    ok('baseline fullLine 2400', Game.fullLine() === 2400);
    ok('baseline maxBank 0', Game.maxBank() === 0);
    ok('baseline feastState empty', Game.feastState() === 'empty');

    // meal quality ladder (unchanged — fuel quality still matters)
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

    // SKILLSET EXPANSION: deep_reserves ×5 → a real war chest
    s.abilities.push({ id: 'deep_reserves' });
    ok('deep_reserves: bankMult 5', Game.bankMult() === 5);
    ok('deep_reserves: cap 12000', Game.kcalCap() === 12000);
    ok('deep_reserves: maxBank 9600 (many days)', Game.maxBank() === 9600);
    ok('bank >> a day of food', Game.maxBank() > 4 * 2000);
    // extra_stomach (legacy eat_target_mult) still expands the bank
    s.abilities.push({ id: 'extra_stomach' });
    ok('extra_stomach stacks: bankMult 10', Game.bankMult() === 10);
    ok('stacked cap 24000', Game.kcalCap() === 24000);
    s.abilities.pop(); // back to deep_reserves only

    // EAT fills the bar to cap — banking is what eating IS past "fed"
    s.kcal = 0; s.kcalQ = 1;
    s.inventory.push(Object.assign({}, cooked, { units: 8, name: 'Turkey (cooked)', spoilDay: s.day + 5 }));
    Game.eat();
    ok('eat fills toward cap', s.kcal === 6000); // 8×750, all bankable
    ok('banked above fed line', Game.banked() === 3600);
    ok('feastState feasting at 37% bank', Game.feastState() === 'feasting');
    s.inventory.push(Object.assign({}, chefMade, { units: 8, name: 'Turkey (chef)', spoilDay: s.day + 5 }));
    Game.eat();
    ok('eat caps at kcalCap', s.kcal === 12000);
    ok('gorged at 75%+ bank', Game.feastState() === 'gorged');
    ok('pool quality tracks best fuel', (s.kcalQ || 1) > 1);
    let said = '';
    Game.say = (m) => { said += m + '\n'; };
    s.kcal = 0;
    s.inventory.push(Object.assign({}, cooked, { units: 4, name: 'Turkey (cooked)', spoilDay: s.day + 5 }));
    Game.eat();
    ok('eat says the bank note past full', /bank/.test(said));

    // FEASTBURN: burns BANKED kcal from the single pool
    said = '';
    s.kcal = 12000; // fully banked
    const mult = Game.feastBurn();
    ok('feastburn returns multiplier', mult > 1);
    ok('feastburn burns the bar', s.kcal === 11600); // gorged burn 400
    ok('feastburn says the line', /FEASTBURN/.test(said) && /feast was the weapon/.test(said));
    s.kcal = 2500; // only 100 banked
    Game.say = () => {};
    ok('feastburn needs 300 banked', Game.feastBurn() === 0);

    // NIGHT DECAY: only the banked war chest leaks, not the body pool
    Game.say = () => {};
    s.kcal = 12000;
    const lost = Game.overnightBankBurn();
    ok('overnight bank leaks 20%', lost === Math.round(9600 * 0.2) && s.kcal === 12000 - lost);
    s.kcal = 2000; // below fed: nothing to leak
    ok('no leak below fed line', Game.overnightBankBurn() === 0 && s.kcal === 2000);

    // MIGRATION: old separate reserve folds into the bar once
    s.reserveKcal = 1000; s.reserveQ = 1.2; s.kcal = 1000;
    Game.migrateReserve();
    ok('migration folds reserve into bar', s.kcal === 2000);
    ok('migration clears legacy fields', s.reserveKcal === undefined && s.reserveQ === undefined);
    ok('migration blends quality', (s.kcalQ || 1) > 1);

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
