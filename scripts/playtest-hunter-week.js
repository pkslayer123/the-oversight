// HUNTER WEEK — a player plays the hunter loop end-to-end across 4 in-game days.
// Day 1: stalk (ignorant vs knowledgeable sign reading), strike, kill → gut → cook → eat.
// Day 1 night: night stalk practice, night feel.
// Day 2: trapline — craft snare, set traps on 2 tiles, catch processing.
// Day 3: monster on grid WHILE hunting — does the loop survive?
// Day 4: trap checks + carcass spoilage.
// Verdicts are qualitative. Usage: node scripts/playtest-hunter-week.js
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
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL  ' + name); } }
function say() { const l = Game.log.join(' | '); Game.log.length = 0; return l; }
function scene(s) { console.log('\n### ' + s); }

const PARTS = ['morning', 'afternoon', 'evening', 'night'];

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 2400;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
  const villager = Game.data.villagers.find(v => v.id === Game.villagerId) || {};
  console.log('Player: ' + (villager.name || Game.villagerId) + ' (' + (villager.formerOccupation || 'unknown') + ')');
  console.log('tracker known?', Game.trackKnown(), '| knife?', Game.hasCuttingTool());

  // ================= DAY 1 MORNING: first stalk =================
  scene('DAY 1 morning — the first stalk (sign reading)');
  s.animal = { id: 'cottontail_rabbit', mx: 6, my: 5, aware: 0, pstate: 'graze' };
  Game.log.length = 0;
  Game.stalkAnimal();
  const stalkTxt = say();
  console.log('> ' + stalkTxt);
  ok('stalk narrates something', stalkTxt.length > 20);
  if (!Game.trackKnown()) ok('ignorant stalk: disturbed earth, honest', /disturbed earth/i.test(stalkTxt));
  else ok('knowledgeable stalk: reads species sign', /prints/i.test(stalkTxt));
  console.log('time cost check: dayTicks=' + s.dayTicks + ' (stalk should be cheap, strike costs 100 kcal)');

  scene('DAY 1 — the strike and the kill chain');
  // stalk until adjacent then strike
  let strikes = 0, killed = false;
  while (!killed && strikes < 20) {
    const a = s.animal;
    if (!a) break;
    const dist = Math.max(Math.abs(a.mx - (s.mx ?? 4)), Math.abs(a.my - (s.my ?? 4)));
    Game.log.length = 0;
    if (dist <= 2) { Game.huntAnimal(); strikes++; }
    else { Game.stalkAnimal(); }
    if (!s.animal) { killed = true; console.log('> ' + say()); break; }
  }
  ok('kill happened within 20 actions', killed);
  const carcIdx = s.inventory.findIndex(i => i.foodState === 'carcass');
  ok('carcass in inventory', carcIdx >= 0);
  if (carcIdx >= 0) {
    console.log('carcass: ' + JSON.stringify({ name: s.inventory[carcIdx].name, kcal: s.inventory[carcIdx].hiddenKcal, spoilDay: s.inventory[carcIdx].spoilDay, prep: s.inventory[carcIdx].prep }));
    // clean it
    if (!Game.hasCuttingTool()) s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife' });
    const kcalBefore = s.kcal;
    Game.log.length = 0;
    Game.cleanCarcass(carcIdx);
    console.log('> ' + say());
    const ci = s.inventory.findIndex(i => i.foodState === 'cleaned');
    ok('cleaned meat exists', ci >= 0);
    if (ci >= 0) {
      const meat = s.inventory[ci];
      console.log('cleaned: ' + meat.units + 'x ' + meat.kcalEach + ' kcal, spoilDay=' + meat.spoilDay + ', disease=' + JSON.stringify(meat.diseaseRisk));
      // cook it at haven fire
      Game.log.length = 0;
      Game.cookFood(ci);
      console.log('> ' + say());
      const coi = s.inventory.findIndex(i => i.foodState === 'cooked' && /rabbit/i.test(i.name));
      ok('cooked meat exists', coi >= 0);
      if (coi >= 0) {
        console.log('cooked: ' + s.inventory[coi].units + 'x ' + s.inventory[coi].kcalEach + ' kcal = ' + (s.inventory[coi].units * s.inventory[coi].kcalEach) + ' total, spoilDay=' + s.inventory[coi].spoilDay);
        // eat it
        Game.log.length = 0;
        Game.eat(coi);
        console.log('> eat: ' + say().slice(0, 200));
        console.log('kcal after eat: ' + s.kcal + ' (was ' + Math.round(kcalBefore) + ' at dawn-ish)');
      }
    }
  }

  // ================= DAY 1 NIGHT: night play =================
  scene('DAY 1 night — night stalk practice');
  Game.dayPart = 3; s.dayTicks = Game.TIME.TICKS_PER_PART * 3;
  console.log('isNight: ' + Game.isNight());
  s.animal = { id: 'gray_fox', mx: 6, my: 5, aware: 0, pstate: 'graze' };
  const xpBefore = JSON.stringify((s.abilities || []).find(a => a.id === 'night_hunting') || (s.backgroundAbilities || []).find(a => a.id === 'night_hunting') || 'none');
  Game.log.length = 0;
  Game.stalkAnimal(); // night stalk → practice
  console.log('> ' + say().slice(0, 300));
  const xpAfter = JSON.stringify((s.abilities || []).find(a => a.id === 'night_hunting') || (s.backgroundAbilities || []).find(a => a.id === 'night_hunting') || 'none');
  console.log('night_hunting before: ' + xpBefore + ' | after: ' + xpAfter);
  // night strike
  s.animal = { id: 'gray_fox', mx: 5, my: 4, aware: 0, pstate: 'graze' };
  let nightKills = 0;
  for (let i = 0; i < 12 && !nightKills; i++) { Game.log.length = 0; Game.huntAnimal(); if (!s.animal) { nightKills++; console.log('> ' + say()); break; } else s.animal = { id: 'gray_fox', mx: 5, my: 4, aware: 0, pstate: 'graze' }; }
  console.log('night kills: ' + nightKills + ' in ≤12 strikes (night bonus should make fox hittable)');
  Game.dayPart = 1; s.dayTicks = Game.TIME.TICKS_PER_PART * 1;
  s.animal = null;

  // ================= DAY 2: trapline =================
  scene('DAY 2 — trapline: craft, set, process a catch');
  Game.learnRecipe('snare', 2);
  s.inventory.push({ material: 'vine', units: 4 }, { material: 'stick', units: 4 });
  Game.log.length = 0;
  let made = null;
  for (let i = 0; i < 5 && !made; i++) made = Game.craft('snare');
  console.log('> craft: ' + say().slice(0, 160));
  ok('snare crafted', !!made);
  const home = { x: Game.map.px, y: Game.map.py };
  Game.log.length = 0;
  Game.setTrap('snare');
  console.log('> set trap: ' + say().slice(0, 160));
  // simulate 3 dawns, keep player alive
  for (let d = 0; d < 3; d++) {
    Game.map.px = home.x; Game.map.py = home.y;
    Game.endDay();
    s.kcal = 2400; s.hydration = 100; s.health = 100;
    if (Game.over) break;
  }
  const trap = (Game.tileAt(home.x, home.y).traps || [])[0];
  console.log('after 3 dawns: trap uses left ' + (trap ? trap.uses : 'BROKE/missing') + '/10');
  const trapCarc = s.inventory.findIndex(i => /\(trapped\)/.test(i.name || ''));
  console.log('trapped carcass in inventory?', trapCarc >= 0);
  if (trapCarc >= 0) {
    console.log('trapped: ' + s.inventory[trapCarc].name + ' spoilDay=' + s.inventory[trapCarc].spoilDay + ' (day now ' + s.day + ')');
    Game.log.length = 0;
    Game.cleanCarcass(trapCarc);
    console.log('> clean trapped: ' + say().slice(0, 160));
  }

  // ================= DAY 3: monster on grid while hunting =================
  scene('DAY 3 — monster on the grid WHILE an animal is present');
  Game.map.px = home.x; Game.map.py = home.y;
  s.mx = 4; s.my = 4;
  s.monster = { id: 'thornback_boar', mx: 7, my: 3 };
  s.animal = { id: 'cottontail_rabbit', mx: 5, my: 4, aware: 0, pstate: 'graze' };
  Game.log.length = 0;
  Game.stalkAnimal();
  const monsterStalk = say();
  console.log('> stalk w/ monster present: ' + monsterStalk.slice(0, 260));
  ok('stalk still works with monster on grid', /stalk|Strike/i.test(monsterStalk));
  // does the monster advance while you stalk? (turn economy)
  const mBefore = JSON.stringify({ mx: s.monster.mx, my: s.monster.my });
  Game.log.length = 0;
  Game.huntAnimal();
  const mAfter = JSON.stringify(s.monster ? { mx: s.monster.mx, my: s.monster.my } : 'monster gone');
  console.log('> strike w/ monster present: ' + say().slice(0, 200));
  console.log('monster pos before: ' + mBefore + ' | after: ' + mAfter);
  s.monster = null; s.animal = null;

  // ================= DAY 4: spoilage =================
  scene('DAY 4 — carcass spoilage (neglect a kill)');
  s.mx = 4; s.my = 4; s.kcal = 2400;
  s.animal = { id: 'wild_turkey', mx: 5, my: 4 };
  let k2 = false;
  for (let i = 0; i < 30 && !k2; i++) { Game.huntAnimal(); if (!s.animal) k2 = true; else s.animal = { id: 'wild_turkey', mx: 5, my: 4 }; }
  const c2 = s.inventory.findIndex(i => i.foodState === 'carcass');
  console.log('neglected carcass spoilDay=' + (c2 >= 0 ? s.inventory[c2].spoilDay : '?') + ', day now=' + s.day);
  for (let d = 0; d < 4; d++) { Game.endDay(); s.kcal = 2400; s.hydration = 100; s.health = 100; if (Game.over) break; }
  Game.log.length = 0;
  Game.checkSpoilage ? Game.checkSpoilage() : null;
  const c2now = s.inventory.findIndex(i => i.foodState === 'carcass' && /turkey/i.test(i.name || ''));
  console.log('after 4 dawns: carcass present=' + (c2now >= 0) + ' (day ' + s.day + ')');
  console.log('> ' + say().slice(0, 260));

  console.log('\n== HUNTER WEEK: ' + pass + ' pass, ' + fail + ' fail ==');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
