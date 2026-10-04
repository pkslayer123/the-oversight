// Lumped unknowns + breakers + prep stash. Usage: node scripts/test-lumped-unknowns.js
// Steve's rules:
//  - unknown forageables lump into ONE stack per form ("unknown shoots x12");
//    the game secretly tracks true species composition; the player can't see
//    through it in the field.
//  - identification happens BACK AT CAMP by people with knowledge (ritual).
//  - the chicken-and-egg breakers: cautious testing (always available),
//    watching animals (hint, not proof), arriving with it (backgrounds),
//    the System names but never feeds.
//  - the prep stash is the kitchen counter: unprocessed lands there first,
//    urgency-sorted; prep is WHAT FIRST / WHO / HOW FAR; batch, never per-unit.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/food.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const plant = (id) => Game.data.plants.find(p => p.id === id);
const quiet = () => { const _s = Game.say; Game.say = () => {}; return () => { Game.say = _s; }; };

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 100;
  // control background seeding: test plants start unknown
  Game.state.codex.plants = {};
  return s;
}
function toCamp() {
  // mock: the counter is at camp. (Teleporting map.px/py would hit
  // ungenerated tiles; real play walks there.)
  Game.atCamp = () => true;
}

(async () => {
  await Game.init();

  // ============ 1. LUMPED UNKNOWNS ============
  freshGame();
  {
    const dand = plant('dandelion'), yar = plant('yarrow'), bb = plant('blackberry');
    let r = quiet();
    Game.addUnknownToLump(dand, 4, 0);
    Game.addUnknownToLump(yar, 5, 0);
    Game.addUnknownToLump(dand, 3, 0); // same species merges
    Game.addUnknownToLump(bb, 2, 0);   // different form -> separate lump
    r();
    const lumps = Game.state.scholar.inventory.filter(i => i.lump);
    ok('same-form unknowns merge into ONE stack', lumps.filter(i => i.lumpForm === 'shoots').length === 1);
    const shoots = lumps.find(i => i.lumpForm === 'shoots');
    ok('lump totals units (4+5+3)', shoots.units === 12);
    ok('lump named opaquely', shoots.name === 'unknown shoots');
    ok('secret composition tracked', shoots.lump.dandelion.units === 7 && shoots.lump.yarrow.units === 5);
    ok('different form -> separate lump', lumps.filter(i => i.lumpForm === 'berries').length === 1);
    ok('lump has no plantId (opaque)', shoots.plantId === null);
    ok('lump not edible, 0 kcal', shoots.edible === false && shoots.kcalEach === 0);
    // field UI never leaks species
    ok('itemDisplayName shows lump name', Game.itemDisplayName(shoots) === 'unknown shoots');
    // every plant has a form
    const noForm = Game.data.plants.filter(p => !p.form);
    ok('every plant has a lump form', noForm.length === 0);
    const badEd = Game.data.plants.filter(p => !['safe', 'caution', 'cook', 'avoid'].includes(p.edibility));
    ok('every plant has edibility', badEd.length === 0);
  }

  // ============ 2. THE CAMP RITUAL ============
  freshGame(); toCamp();
  {
    const dand = plant('dandelion'), yar = plant('yarrow');
    let r = quiet();
    Game.addUnknownToLump(dand, 4, 0);
    Game.addUnknownToLump(yar, 5, 0);
    Game.stageForPrep();
    r();
    const stash = Game.prepStash();
    ok('stageForPrep moves lump to stash', stash.some(i => i.lump) && !Game.state.scholar.inventory.some(i => i.lump));
    const idx = stash.findIndex(i => i.lump);
    // sorting NOT at camp is refused
    Game.atCamp = () => false;
    r = quiet(); Game.sortBag(null, idx, stash); r();
    ok('sorting away from camp refused', stash[idx].lump.dandelion.units === 4);
    toCamp();
    // unskilled player sorting alone: splits only what THEY know (nothing)
    r = quiet(); Game.sortBag(null, idx, stash); r();
    ok('unskilled sorting is partial (nothing split)', stash[idx].lump.dandelion.units === 4);
    // a knowledgeable villager sorts: teaches the player
    const v = Game.state.village;
    const vid = (v.roster || []).find(id => id !== Game.villagerId);
    v.plantKnowledge[vid] = ['dandelion'];
    // knower must be "here" — fake their node at camp
    const origNode = Game.npcNode;
    Game.npcNode = () => ({ nx: Game.map.px, ny: Game.map.py });
    const knowers = Game.whoKnowsLump(stash[idx]);
    ok('whoKnowsLump finds the knower', knowers.some(k => k.id === vid));
    r = quiet(); Game.sortBag(vid, idx, stash); r();
    Game.npcNode = origNode;
    ok('known species splits out of lump', stash.some(i => i.name === 'Dandelion' && i.units === 4));
    ok('remainder stays lumped', stash.some(i => i.lump && i.units === 5 && i.lump.yarrow));
    ok('teacher transfers knowledge (player learns)', Game.plantKnown('dandelion'));
    ok('unknown species untouched by sorting', !Game.plantKnown('yarrow'));
  }

  // ============ 3. BREAKERS ============
  // 3a. cautious testing: safe plant, full protocol
  freshGame(); toCamp();
  {
    const dand = plant('dandelion');
    let r = quiet();
    Game.addUnknownToLump(dand, 4, 0);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const idx = stash.findIndex(i => i.lump);
    const rnd = Math.random; Math.random = () => 0.99; // no reactions
    r = quiet(); Game.testCautiously(idx, {}, stash); r();
    Math.random = rnd;
    ok('cautious testing identifies safe plant', Game.plantKnown('dandelion'));
    ok('tested species splits out', stash.some(i => i.name === 'Dandelion'));
    ok('testing costs real time', (Game.state.scholar.dayTicks || 0) > 40);
  }
  // 3b. rushed testing on avoid plant: reaction, honest sickness, still learns
  freshGame(); toCamp();
  {
    const yar = plant('yarrow'); // edibility 'avoid'
    let r = quiet();
    Game.addUnknownToLump(yar, 3, 0);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const idx = stash.findIndex(i => i.lump);
    const e0 = Game.state.scholar.energy;
    const rnd = Math.random; Math.random = () => 0.01; // reactions fire
    r = quiet(); Game.testCautiously(idx, { rush: true }, stash); r();
    Math.random = rnd;
    ok('rushed test on avoid plant makes you sick', Game.state.scholar.energy < e0);
    ok('bad test still teaches (not food)', Game.plantKnown('yarrow'));
    const ye = Game.state.codex.plants['yarrow'];
    ok('tested flag recorded', ye && ye.tested === 'avoid');
  }
  // 3c. careful test on avoid plant also catches it (lips stage)
  freshGame(); toCamp();
  {
    const yar = plant('yarrow');
    let r = quiet();
    Game.addUnknownToLump(yar, 3, 0);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const idx = stash.findIndex(i => i.lump);
    let n = 0; const rnd = Math.random;
    Math.random = () => (++n === 2 ? 0.01 : 0.99); // react at lips
    r = quiet(); Game.testCautiously(idx, {}, stash); r();
    Math.random = rnd;
    ok('lips-stage reaction stops the test + identifies', Game.plantKnown('yarrow'));
  }
  // 3d. watch the fauna: hint, not proof
  freshGame(); toCamp();
  {
    const dand = plant('dandelion');
    let r = quiet();
    Game.addUnknownToLump(dand, 4, 0);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const idx = stash.findIndex(i => i.lump);
    r = quiet(); Game.watchFauna(idx, stash); r();
    ok('fauna watch sets a hint', !!stash[idx].hint && ['safe', 'avoid'].includes(stash[idx].hint.kind));
    ok('hint does NOT identify', !Game.plantKnown('dandelion'));
  }
  // 3e. the System names, never feeds
  freshGame(); toCamp();
  {
    const dand = plant('dandelion');
    let r = quiet();
    Game.addUnknownToLump(dand, 4, 0);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const idx = stash.findIndex(i => i.lump);
    const said = [];
    Game.say = (m) => said.push(m);
    Game.state.systemArrived = true;
    Game.askSystemAbout(idx, stash);
    Game.say = () => {};
    const text = said.join(' ');
    ok('System gives taxonomy', /Taraxacum officinale/.test(text));
    ok('System cannot say edible', !/safe to eat|you can eat|is edible|nutritious|good food/i.test(text));
    ok('System never identifies', !Game.plantKnown('dandelion'));
    ok('System jokes about the face-hole', /face-hole/i.test(text));
    Game.state.systemArrived = false;
  }
  // 3f. background seeding: someone arrived knowing things
  {
    freshGame();
    const pk = Game.state.village.plantKnowledge || {};
    const seeded = Object.keys(pk).filter(id => (pk[id] || []).length > 0);
    ok('background seeding gives villagers plant knowledge', seeded.length > 0);
    const allIds = Game.data.plants.map(p => p.id);
    ok('seeded knowledge is real species', seeded.every(id => pk[id].every(pid => allIds.includes(pid))));
  }
  // 3g. identification via any path splits lumps (observation path)
  freshGame(); toCamp();
  {
    const dand = plant('dandelion');
    let r = quiet();
    Game.addUnknownToLump(dand, 4, 0);
    Game.addUnknownToLump(plant('yarrow'), 2, 0);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    r = quiet(); Game.identifyPlant('dandelion', 'observation'); r();
    ok('identifyPlant splits lump via refresh', stash.some(i => i.name === 'Dandelion' && i.units === 4));
    const lump = stash.find(i => i.lump);
    ok('other species stays lumped', lump && lump.units === 2 && lump.lump.yarrow);
  }

  // ============ 4. PREP STASH ============
  // 4a. triage ordering by spoilage
  freshGame(); toCamp();
  {
    const s = Game.state.scholar;
    let r = quiet();
    s.inventory.push(Game.foodCarcass({ id: 'turkey', name: 'Turkey', calories: 3000 }, 3000, s.day, 'hunted'));
    const dand = plant('dandelion');
    const known = Game.foodForageItem(dand, true, 6, 270, s.day);
    known.needsCooking = true; known.diseaseRisk = { p: 0.25, dmg: 8, note: 'test' };
    known.spoilDay = s.day + 5;
    s.inventory.push(known);
    Game.stageForPrep(); r();
    const order = Game.stashUrgency();
    ok('stash auto-sorts by urgency', order.length === 2 && order[0].left <= order[1].left);
    ok('carcass (2d) sorts before greens (5d)', order[0].it.foodState === 'carcass');
    const clock = Game.stashClock(order[0].it);
    ok('spoilage clock visible', /spoil/i.test(clock));
    const needs = Game.prepNeeds(order[0].it);
    ok('needs line honest', /clean/.test(needs));
  }
  // 4b. delegation trade-offs stated
  freshGame(); toCamp();
  {
    const s = Game.state.scholar;
    let r = quiet();
    s.inventory.push(Game.foodCarcass({ id: 'turkey', name: 'Turkey', calories: 3000 }, s.day, 'hunted'));
    // give player a knife-less state? keep knife for the 'you' option; check both branches exist
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const carcass = stash.find(i => i.foodState === 'carcass');
    const who = Game.whoOptions(carcass, 'butcher');
    ok('who options: you + specialist-or-note', who.some(o => o.id === 'you') && who.length >= 2);
    ok('trade-off stated (yield + learning)', who.some(o => /LEARN|kcal/i.test(o.detail)));
  }
  // 4c. depth options with stated costs
  freshGame(); toCamp();
  {
    const s = Game.state.scholar;
    let r = quiet();
    const carcass = Game.foodCarcass({ id: 'turkey', name: 'Turkey', calories: 3000 }, s.day, 'hunted');
    s.inventory.push(carcass);
    Game.stageForPrep();
    const stash = Game.prepStash();
    const ci = stash.findIndex(i => i.foodState === 'carcass');
    // give knife + clean technique for the test
    s.inventory.push({ name: 'Knife', itemId: 'knife' });
    Game.state.codex.techniques = Game.state.codex.techniques || {};
    Game.state.codex.techniques.clean = true;
    Game.cleanCarcass(ci, stash);
    r();
    const cleaned = stash.find(i => i.foodState === 'cleaned');
    ok('batch clean works on stash', !!cleaned && cleaned.units === 4);
    const how = Game.howFarOptions(cleaned);
    ok('three depth options', how.map(o => o.id).join(',') === 'raw,cook,smoke');
    ok('costs stated before committing', how.every(o => /tick|fast|risky|safe/i.test(o.detail)));
    ok('yield stated', how.some(o => /portion|kcal/i.test(o.detail)));
  }
  // 4d. batch-not-per-unit: shell all, smoke all
  freshGame(); toCamp();
  {
    const s = Game.state.scholar;
    let r = quiet();
    const nut = plant('hickory_nut');
    const n1 = Game.foodForageItem(nut, true, 5, 500, s.day);
    const n2 = Game.foodForageItem(nut, true, 3, 300, s.day);
    s.inventory.push(n1, n2);
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    r = quiet(); Game.shellNuts(undefined, stash); r();
    ok('shell batch handles all lots at once', stash.filter(i => i.foodState === 'shelled').length === 2);
  }
  // 4e. missing prerequisites named, not hidden
  freshGame(); toCamp();
  {
    const s = Game.state.scholar;
    let r = quiet();
    s.inventory.push(Game.foodCarcass({ id: 'turkey', name: 'Turkey', calories: 3000 }, s.day, 'hunted'));
    Game.stageForPrep(); r();
    const stash = Game.prepStash();
    const carcass = stash.find(i => i.foodState === 'carcass');
    const who = Game.whoOptions(carcass, 'butcher');
    const you = who.find(o => o.id === 'you');
    // player starts without knife in fresh game? check the messaging either way
    ok('prerequisite surfaced in who options', /knife|LEARN|practiced|messy/i.test(you.detail + ' ' + (you.blocked || '')));
    const needs = Game.prepNeeds(carcass);
    ok('needs line names missing prereqs', needs.length > 0);
  }
  // 4f. putAwayFinished: only finished food -> pantry
  freshGame(); toCamp();
  {
    const s = Game.state.scholar;
    let r = quiet();
    const dand = plant('dandelion');
    const ready = Game.foodForageItem(dand, true, 6, 270, s.day);
    Game.prepStash().push(ready);
    s.inventory.push(Game.foodCarcass({ id: 'turkey', name: 'Turkey', calories: 3000 }, s.day, 'hunted'));
    Game.stageForPrep(); r();
    const before = Game.state.village.pantry.length;
    r = quiet(); Game.putAwayFinished(); r();
    ok('finished food put away to pantry', Game.state.village.pantry.length === before + 1);
    ok('unfinished stays on counter', Game.prepStash().some(i => i.foodState === 'carcass'));
  }
  // 4g. returnToVillage routes correctly
  freshGame();
  {
    const s = Game.state.scholar;
    const dand = plant('dandelion');
    let r = quiet();
    Game.addUnknownToLump(dand, 6, s.day);
    s.inventory.push(Game.foodCarcass({ id: 'turkey', name: 'Turkey', calories: 3000 }, s.day, 'hunted'));
    const ready = Game.foodForageItem(dand, true, 6, 270, s.day);
    s.inventory.push(ready);
    Game.state.village.pantry = [];
    Game.returnToVillage();
    r();
    ok('finished -> pantry on return', Game.state.village.pantry.some(i => i.plantId === 'dandelion' && i.foodState === 'ready'));
    ok('lump -> stash on return', Game.prepStash().some(i => i.lump));
    ok('carcass -> stash on return', Game.prepStash().some(i => i.foodState === 'carcass'));
    ok('unprocessed NOT in pantry', !Game.state.village.pantry.some(i => i.foodState === 'carcass' || i.lump));
  }
  // 4h. migrateLumps folds old-style piles
  freshGame();
  {
    const s = Game.state.scholar;
    const dand = plant('dandelion');
    let r = quiet();
    s.inventory.push(Game.foodForageItem(dand, false, 4, 180, s.day)); // old-style unknown
    s._lumpsMigrated = false; // migration ran at init; re-arm for the test
    Game.migrateLumps(); r();
    ok('old piles migrate into lumps', s.inventory.some(i => i.lump && i.lump.dandelion));
    ok('no old-style unknowns remain', !s.inventory.some(i => i.foodState === 'unknown' && !i.lump && i.plantId));
  }

  console.log(`\nlumped-unknowns: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(1); });
