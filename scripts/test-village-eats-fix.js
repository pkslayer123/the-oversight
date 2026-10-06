// villageEats / villageMeal perishable-consumption fix (Steve 2026-10-06).
// BUG: villageMeal/villageEats SORTED the pantry perishable-first but CONSUMED
// from the END (durable-first — a comment said otherwise) and NEVER SKIPPED
// spoiled stacks. Measured (food worker, commit edb9138): 10x100 kcal fresh
// berries sat untouched 3 days while the village burned 178 durable
// bean-units, then the berries were swept as spoiled.
// FIX: consume forward (perishable-first, soonest spoilDay first), skip spoiled
// stacks (swept by endDay's sweepSpoiled — no phantom calories), and 'Foraged
// food' surplus hauls only merge into a stack with a matching fresh spoilDay
// (fresh hauls keep their own clock instead of rotting on an old stack).
// Usage: node scripts/test-village-eats-fix.js   (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
const drain = () => { const m = said.join(' '); said.length = 0; return m; };
const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};
const section = (t) => console.log('\n=== ' + t + ' ===');
const units = (pantry, name) => { const it = (pantry || []).find(p => p.name === name); return it ? it.units : undefined; };
const topStats = (s) => { s.kcal = 2400; s.hydration = 100; s.health = 100; s.energy = 100; };
const fresh = () => {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.scholar;
};
// controlled roster: npc ids (not the player), person records tuned for the test
const npcIds = () => Game.state.village.roster.filter(id => id !== Game.villagerId);
const setForage = (ids, providesPerDay, kcalPerDay) => {
  for (const id of ids) {
    const p = Game.data.villagers.find(x => x.id === id) || Game.data.background_survivors.find(x => x.id === id);
    if (!p) continue;
    p.providesPerDay = providesPerDay;
    p.kcalPerDay = kcalPerDay;
  }
  const v = Game.state.village;
  v.health = v.health || {};
  v.trust = v.trust || {};
  for (const id of ids) { v.health[id] = 100; v.trust[id] = 100; }
  v.taught = {};
};

(async () => {
  await Game.init();

  // ---------- T1: villageMeal takes perishable-first ----------
  section('T1 — villageMeal: perishable-first consumption order');
  const s1 = fresh();
  const v1 = Game.state.village;
  Game.returnToVillage(); drain();
  const day1 = Game.state.scholar.day;
  v1.pantry = [
    { name: 'Fresh-picked berries', kcalEach: 100, units: 10, spoilDay: day1 + 2, safe: true, kg: 0.2 },
    { name: 'Control beans', kcalEach: 100, units: 300, spoilDay: 9999, safe: true, kg: 0.2 },
  ];
  s1.kcal = 500; // room for a meal; trust 10 → half ration 1000 kcal
  (v1.trust = v1.trust || {})[Game.villagerId] = 10;
  Game.villageMeal(); drain();
  const b1 = units(v1.pantry, 'Fresh-picked berries');
  const c1 = units(v1.pantry, 'Control beans');
  check('meal ate the perishable berries first', b1 === undefined, `berries units now ${b1} (gone = all 10 eaten)`);
  check('meal left durable beans untouched', c1 === 300, `beans units now ${c1}`);

  // ---------- T2: villageEats consumes perishable-first ----------
  section('T2 — villageEats: perishable-first consumption order');
  const s2 = fresh();
  const v2 = Game.state.village;
  const ids2 = npcIds();
  v2.roster = ids2.slice(0, 2); // two villagers, player away (not eating from pantry)
  setForage(v2.roster, 0, 2000); // forage nothing, need 2000 each → net 4000
  const day2 = Game.state.scholar.day;
  v2.pantry = [
    { name: 'Fresh-picked berries', kcalEach: 100, units: 10, spoilDay: day2 + 2, safe: true, kg: 0.2 },
    { name: 'Control beans', kcalEach: 100, units: 300, spoilDay: 9999, safe: true, kg: 0.2 },
  ];
  Game.villageEats(); drain();
  const b2 = units(v2.pantry, 'Fresh-picked berries');
  const c2 = units(v2.pantry, 'Control beans');
  check('village ate the perishable berries first', b2 === undefined, `berries units now ${b2}`);
  check('village then burned 30 durable beans for the rest', c2 === 270, `beans units now ${c2}`);

  // ---------- T3: spoiled stacks skipped — never eaten at full value ----------
  section('T3 — villageEats: spoiled stacks skipped, swept by sweepSpoiled');
  const s3 = fresh();
  const v3 = Game.state.village;
  const ids3 = npcIds();
  v3.roster = ids3.slice(0, 2);
  setForage(v3.roster, 0, 2000); // net 4000
  const day3 = Game.state.scholar.day;
  v3.pantry = [
    { name: 'Old berries', kcalEach: 100, units: 10, spoilDay: day3 - 1, safe: true, kg: 0.2 }, // SPOILED
    { name: 'Control beans', kcalEach: 100, units: 300, spoilDay: 9999, safe: true, kg: 0.2 },
  ];
  Game.villageEats(); drain();
  const b3 = units(v3.pantry, 'Old berries');
  const c3 = units(v3.pantry, 'Control beans');
  check('spoiled stack NOT eaten (no phantom calories)', b3 === 10, `spoiled units now ${b3}`);
  check('the 4000 kcal deficit came from fresh beans', c3 === 260, `beans units now ${c3}`);
  drain(); Game.sweepSpoiled(); const sweepMsg = drain();
  const b3b = units(v3.pantry, 'Old berries');
  check('sweepSpoiled removed the expired stack (existing spoil path)', b3b === undefined, `spoiled units after sweep: ${b3b}`);
  check('sweep announced the loss by name', /Old berries/i.test(sweepMsg), sweepMsg.slice(0, 120));

  // ---------- T4: 'Foraged food' surplus keeps a fresh clock on merge ----------
  section('T4 — surplus hauls do not rot on an old stack\'s clock');
  const s4 = fresh();
  const v4 = Game.state.village;
  const ids4 = npcIds();
  v4.roster = ids4.slice(0, 1);
  setForage(v4.roster, 20000, 2000); // huge surplus → give = (20000-2000)*1.0 = 18000
  const day4 = v4.day;
  v4.pantry = [
    { name: 'Foraged food', kcalEach: 200, units: 5, spoilDay: day4 + 1, safe: true, kg: 0.2 }, // old haul
  ];
  Game.villageEats(); drain();
  const oldStack = v4.pantry.find(p => p.name === 'Foraged food' && p.spoilDay === day4 + 1);
  const freshStack = v4.pantry.find(p => p.name === 'Foraged food' && p.spoilDay === day4 + 3);
  check('old stack kept its own (shorter) clock', !!oldStack && oldStack.units === 5, oldStack ? `units=${oldStack.units} spoilDay=${oldStack.spoilDay}` : 'old stack missing');
  check('fresh haul landed on a NEW stack with a fresh clock', !!freshStack && freshStack.units === 90, freshStack ? `units=${freshStack.units} spoilDay=${freshStack.spoilDay}` : 'fresh stack missing');
  check('the two stacks were NOT merged', v4.pantry.filter(p => p.name === 'Foraged food').length === 2);
  // same-day second haul merges into the same fresh clock (no stack explosion)
  v4.pantry = v4.pantry.filter(p => !(p.name === 'Foraged food' && p.spoilDay === day4 + 1));
  setForage(v4.roster, 20000, 2000);
  Game.villageEats(); drain();
  const merged = v4.pantry.filter(p => p.name === 'Foraged food' && p.spoilDay === day4 + 3);
  check('same-clock haul merges (one fresh stack, not two)', merged.length === 1, `fresh stacks: ${merged.length}`);

  // ---------- T5: 3-day village sim — perishables no longer wasted ----------
  section('T5 — 3-day village sim: perishables eaten first, never swept');
  const s5 = fresh();
  const v5 = Game.state.village;
  const day5 = Game.state.scholar.day;
  v5.pantry = [
    { name: 'Fresh-picked berries', kcalEach: 100, units: 10, spoilDay: day5 + 3, safe: true, kg: 0.2 },
    { name: 'Control beans', kcalEach: 100, units: 300, spoilDay: 9999, safe: true, kg: 0.2 },
  ];
  const berriesTrace = [];
  let berriesSwept = false;
  for (let d = 0; d < 3 && !Game.over && !Game.villageLost; d++) {
    const before = units(v5.pantry, 'Fresh-picked berries');
    const beansBefore = units(v5.pantry, 'Control beans');
    topStats(s5);
    drain(); Game.endDay();
    const msgs = drain();
    const berriesAfter = units(v5.pantry, 'Fresh-picked berries');
    const beansAfter = units(v5.pantry, 'Control beans');
    berriesTrace.push(`day${s5.day}: berries ${before}->${berriesAfter === undefined ? 'gone' : berriesAfter}, beans ${beansBefore}->${beansAfter}`);
    if (/threw out spoiled stores:.*Fresh-picked berries/i.test(msgs)) berriesSwept = true;
    if (Game.over || Game.villageLost) break;
  }
  for (const t of berriesTrace) console.log('  ' + t);
  check('day 1 consumed the perishable berries (not the beans)', /berries 10->gone/.test(berriesTrace[0] || ''), berriesTrace[0]);
  check('no perishable berries were ever thrown out as spoiled', !berriesSwept);

  console.log(failures.length ? `\n${failures.length} FAILURES: ${failures.join('; ')}` : '\nALL CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
