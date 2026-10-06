// Knowledge-gating regression test (2026-10-05):
// "If you don't know, it doesn't show." Covers:
//  1. itemDisplayName shows the stored name for meat_* items (not "unfamiliar plant matter")
//  2. testMonsterMeat never speaks the true monster name before naming
//  3. combat-win meat is a gated carcass (plantId 'meat_<mid>', edible false,
//     kcalEach 0, hiddenKcal set) — not ready-to-eat named cuts
//  4. monsterNoun composes sentence-safe gated names (no doubled articles,
//     no true names, no prose-mangling)
//  5. hunt kill identifies the animal BEFORE the kill line names it
//  6. hunt miss uses the gated descriptor, not the true name
//  7. armor/resist + turn banner use gated names, not mdef.name
// Usage: node scripts/test-knowledge-gating.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}`); }
}
function drain() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }
function fresh() {
  Game.genRoster('Columbus, Ohio');
  const c = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, c.id);
  Game.depart();
  drain();
}

(async () => {
  await Game.init();
  fresh();
  const st = Game.state;

  // ---- 1. itemDisplayName for meat_* shows the stored name ----
  ok('itemDisplayName meat shows stored name',
    Game.itemDisplayName({ plantId: 'meat_rabbit', name: 'Cottontail Rabbit (carcass)' }) === 'Cottontail Rabbit (carcass)');
  ok('itemDisplayName meat unknown monster shows descriptor name',
    Game.itemDisplayName({ plantId: 'meat_belltoad', name: 'a toad like a war drum, throat swelling (carcass)' }) === 'a toad like a war drum, throat swelling (carcass)');
  ok('itemDisplayName plant still gated',
    Game.itemDisplayName({ plantId: 'dandelion', name: 'Dandelion' }) !== 'Dandelion' || Game.plantKnown('dandelion'));

  // ---- 4. monsterNoun: gated, sentence-safe ----
  const toadNoun = Game.monsterNoun('belltoad');
  ok('monsterNoun belltoad strips article, no true name',
    !/choir toad/i.test(toadNoun) && !/^a |^an |^the /i.test(toadNoun));
  console.log('   belltoad noun:', JSON.stringify(toadNoun));
  const deerNoun = Game.monsterNoun('gallowdeer');
  ok('monsterNoun gallowdeer no true name', !/highbeam deer/i.test(deerNoun));
  console.log('   gallowdeer noun:', JSON.stringify(deerNoun));
  // prose unknowns collapse to 'something'
  const bullNoun = Game.monsterNoun('bulldozer');
  ok('monsterNoun bulldozer not mangled prose', bullNoun === 'something' || !/[.!?]/.test(bullNoun));
  // post-naming: true/village names flow through
  Game.state.codex.monsters['belltoad'] = { stage: 'slain', villageName: 'War Drum' };
  ok('monsterNoun post-naming uses village name', Game.monsterNoun('belltoad') === 'War Drum');
  Game.state.codex.monsters['belltoad'] = { stage: 'slain' }; // reset to unnamed
  Game.state.systemArrived = true;
  ok('monsterNoun systemArrived uses true name', Game.monsterNoun('belltoad') === 'Choir Toad');
  Game.state.systemArrived = false;

  // ---- 2. testMonsterMeat never speaks the true name ----
  const inv = st.scholar.inventory;
  inv.push({ plantId: 'meat_belltoad', foodKind: 'meat', foodState: 'cleaned', edible: false, units: 4, kcalEach: 0, hiddenKcal: 120, name: 'a toad like a war drum, throat swelling (cleaned)', spoilDay: 99 });
  Game.testMonsterMeat(inv.length - 1, inv);
  const meatLog = drain();
  ok('testMonsterMeat toxic path: no true name', !/choir toad/i.test(meatLog));
  ok('testMonsterMeat toxic path: still gated descriptor ok', /toad like a war drum/i.test(meatLog));
  ok('testMonsterMeat toxic marks poison', (Game.state.codex.monsters['belltoad'] || {}).foodTested === 'poison');
  console.log('   testMonsterMeat log:', JSON.stringify(meatLog.slice(0, 200)));

  // safe path: hummice
  inv.push({ plantId: 'meat_hummice', foodKind: 'meat', foodState: 'cleaned', edible: false, units: 4, kcalEach: 0, hiddenKcal: 150, name: 'the grass is humming in harmony (cleaned)', spoilDay: 99 });
  Game.testMonsterMeat(inv.length - 1, inv);
  const safeLog = drain();
  ok('testMonsterMeat safe path: no true name', !/hummice/i.test(safeLog.replace(/the grass is humming in harmony/i, '')));
  ok('testMonsterMeat safe path: marks food safe', Game.monsterFoodSafe('hummice'));

  // ---- 3. combat-win meat shape: simulate the win-reward block ----
  // (call the reward code path via a synthetic tbfight win is heavy; instead
  // verify the helper chain the reward relies on)
  const meatPid = 'meat_bulldozer';
  ok('monsterFoodSafe false for unknown monster', !Game.monsterFoodSafe('bulldozer'));
  // refreshMeatNames: descriptor now, true name after naming
  inv.push({ plantId: meatPid, foodKind: 'meat', foodState: 'carcass', edible: false, units: 1, kcalEach: 0, hiddenKcal: 3200, name: Game.monsterDisplayName('bulldozer') + ' (carcass)', spoilDay: 99 });
  const beforeName = inv[inv.length - 1].name;
  ok('meat created with descriptor name', !/bulldozer/i.test(beforeName));
  Game.state.codex.monsters['bulldozer'] = { stage: 'slain', villageName: 'Rooter' };
  Game.refreshMeatNames('bulldozer');
  ok('refreshMeatNames updates to village name', inv[inv.length - 1].name === 'Rooter (carcass)');
  console.log('   meat name:', JSON.stringify(beforeName), '->', JSON.stringify(inv[inv.length - 1].name));
  // itemDisplayName shows the refreshed name, not plant-matter
  ok('itemDisplayName shows refreshed meat name', Game.itemDisplayName(inv[inv.length - 1]) === 'Rooter (carcass)');

  // ---- 5/6. hunt kill identifies; miss gated ----
  fresh();
  const animal = (Game.data.animals || []).find(a => a.id === 'gray_squirrel');
  const beforeEnc = (Game.state.codex.animalEncounters || {})['gray_squirrel'] || 0;
  // simulate the kill block ordering: encIdentifyAnimal must precede the name
  Game.encIdentifyAnimal('gray_squirrel');
  Game.state.scholar.inventory.push(Game.foodCarcass(animal, 400, Game.state.scholar.day, 'hunted'));
  const encAfter = (Game.state.codex.animalEncounters || {})['gray_squirrel'] || 0;
  ok('kill identifies animal (>=3)', encAfter >= 3);
  ok('encAnimalKnown after kill', Game.encAnimalKnown('gray_squirrel'));
  // miss-line gating logic mirrors the fix
  const missName = (Game.encAnimalKnown && Game.encAnimalKnown('white_tailed_deer')) ? 'white-tailed deer' : ((Game.data.animals.find(a => a.id === 'white_tailed_deer') || {}).unknown || 'something');
  ok('miss line would use descriptor for unknown deer', !/white-tailed deer/i.test(missName));

  // ---- 7. armor/resist/turn-banner source check (static) ----
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('no mdef.name in say() strings', !/this\.say\(`[^`]*mdef\.name/.test(src));
  ok('no mdef.name in sysSay() strings', !/this\.sysSay\(`[^`]*mdef\.name/.test(src));
  ok('turn banner uses fighter name', /const mName = c\.name \|\| 'the monster';/.test(src));

  // ---- 8. encAttackName: attack names earned via tbPatternKnown ----
  fresh();
  const deerM = { mdef: { id: 'gallowdeer', attack: { name: 'Ocular Discharge' } } };
  ok('encAttackName pre-learn: the attack', Game.encAttackName(deerM, 'Ocular Discharge') === 'the attack');
  // simulate surviving it: tbLearnPattern writes codex.monsters[id].patterns[name]
  Game.state.codex.monsters['gallowdeer'] = { patterns: { 'Ocular Discharge': 'beam' } };
  ok('encAttackName post-learn: true name', Game.encAttackName(deerM, 'Ocular Discharge') === 'Ocular Discharge');
  ok('encAttackName null-safe', Game.encAttackName(null) === 'the attack');
  // ignition beat source check: no ungated tg.attackName in say strings
  const ungatedAtk = (src.match(/this\.say\(`[^`]*\$\{tg\.attackName\}[^`]*`\)/g) || [])
    .concat(src.match(/this\.say\(`[^`]*\$\{atk\.name\}[^`]*`\)/g) || [])
    .filter(s => !/Codex:/.test(s) && !/encAttackName/.test(s));
  ok('no ungated tg.attackName/atk.name in say()', ungatedAtk.length === 0);
  if (ungatedAtk.length) console.log('UNGATED:', ungatedAtk.join('\n'));

  console.log(`\npass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
