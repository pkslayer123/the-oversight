// PROOF (adversarial forager, Steve 2026-10-08): rot resurrection via cooking.
//
// HOSTILE CLAIM: the spoilage clock is advisory, not a cost. Let cleaned meat
// go rotten, then "cook" or "smoke" it — every transform rewrites spoilDay to
// day+X with NO rot check, while cleanCarcass/preserveFood/askSpecialist-butcher
// all honestly refuse rot ("rot can't be X back into food"). The cook paths
// were simply missed, so rot -> fresh food, forever.
//
// Vectors (all UI-reachable: counter "Cook — you", "Cook — ask X", "Smoke — ask X"):
//   A. self-cook rotten cleaned meat        (G.cookFood wrapper, food.js)
//   B. specialist-cook rotten cleaned meat  (askSpecialist cook branch, food.js)
//   C. specialist-smoke rotten cleaned meat (askSpecialist preserver branch — pays day+30+5*skill!)
//   D. self-cook rotten needsCooking plant   (G.cookFood wrapper branch 2)
//   E. putAwayFinished launders rotten finished food into the pantry mid-day
// Controls (must HOLD pre- and post-fix):
//   F. self-preserve rotten meat refused (preserveFood already guards)
//   G. self-clean rotten carcass refused (cleanCarcass already guards)
//   H. blood_magic 3rd tap refused (break-it food run fix holds)
//   I. dropItem discard path exists (full-pack softlock has an exit)
//   J. stockPantry stocks REAL items with a clock (phantom-pantry fix holds)
//   K. feastBurn with <300 banked returns 0 (no free burn)
//
// Run pre-fix : RED  (A-E resurrect rot)
// Run post-fix: GREEN (A-E refused + discarded honestly; F-K still hold)
//   node scripts/test-forager-rot-resurrect-20261008.js   (SEED env override)
//
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
let lastSaid = '';
const origSay = Game.say.bind(Game);
Game.say = (t) => { lastSaid = String(t); try { return origSay(t); } catch (e) { return null; } };

function rottenCleanedMeat() {
  const day = Game.state.scholar.day;
  return {
    name: 'Rabbit (cleaned)', plantId: 'meat_rabbit', foodKind: 'meat', foodState: 'cleaned',
    edible: true, units: 4, unit: 'portion', kcalEach: 120, hiddenKcal: 480,
    spoilDay: day - 1, // ROTTEN yesterday
    diseaseRisk: { p: 0.35, dmg: 8, note: 'raw meat' }, safe: false, kg: 0.5,
  };
}
function rottenNeedsCookingPlant() {
  const day = Game.state.scholar.day;
  return {
    name: 'Groundnut', plantId: 'groundnut', foodKind: 'plant', foodState: 'ready',
    edible: true, units: 3, unit: 'tuber', kcalEach: 90,
    spoilDay: day - 1, // ROTTEN yesterday
    needsCooking: true, diseaseRisk: { p: 0.4, dmg: 10, note: 'raw groundnut' },
    prep: 'Risky raw — cook it.', kg: 0.3,
  };
}
function putInPack(item) {
  Game.state.scholar.inventory.push(item);
  return Game.state.scholar.inventory.length - 1;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const day = s.day;
  console.log(`seed=${SEED} day=${day}`);

  // fire everywhere (harness stub — the vector is the rot check, not fire finding)
  Game.nearFire = () => true;
  // player at the village node so the test specialist is "here"
  Game.map.px = Game.state.village.px ?? 4;
  Game.map.py = Game.state.village.py ?? 4;
  // a chef specialist on the roster
  const v = Game.state.village;
  v.roster = v.roster || [];
  v.rosterChars = v.rosterChars || {};
  if (!v.roster.includes('testchef')) v.roster.push('testchef');
  v.rosterChars['testchef'] = { name: 'Test Chef', formerOccupation: 'chef' };
  const chefHere = (Game.specialistsHere('cook') || []).some(x => x.id === 'testchef');
  ok('setup: test chef is a cook specialist here', chefHere);

  // ---- A. self-cook rotten cleaned meat ----
  {
    s.inventory = [];
    const idx = putInPack(rottenCleanedMeat());
    lastSaid = '';
    Game.cookFood(idx);
    const gone = !s.inventory.some(i => i && i.plantId === 'meat_rabbit');
    const resurrected = s.inventory.some(i => i && i.plantId === 'meat_rabbit' && i.foodState === 'cooked' && i.spoilDay > day);
    ok('A. self-cook cannot resurrect rotten meat', gone && !resurrected && /went bad|rotten|flies/i.test(lastSaid),
      `gone=${gone} resurrected=${resurrected} said=${JSON.stringify(lastSaid.slice(0, 90))}`);
  }

  // ---- B. specialist-cook rotten cleaned meat ----
  {
    s.inventory = [];
    const idx = putInPack(rottenCleanedMeat());
    lastSaid = '';
    Game.askSpecialist('testchef', idx, s.inventory, 'cook');
    const gone = !s.inventory.some(i => i && i.plantId === 'meat_rabbit');
    const resurrected = s.inventory.some(i => i && i.plantId === 'meat_rabbit' && i.spoilDay > day);
    ok('B. specialist-cook cannot resurrect rotten meat', gone && !resurrected && /went bad|rotten|flies|won.t touch/i.test(lastSaid),
      `gone=${gone} resurrected=${resurrected} said=${JSON.stringify(lastSaid.slice(0, 90))}`);
  }

  // ---- C. specialist-smoke rotten cleaned meat (the big payout: day+30+) ----
  {
    s.inventory = [];
    const idx = putInPack(rottenCleanedMeat());
    lastSaid = '';
    Game.askSpecialist('testchef', idx, s.inventory, 'preserver');
    const gone = !s.inventory.some(i => i && i.plantId === 'meat_rabbit');
    const resurrected = s.inventory.some(i => i && i.plantId === 'meat_rabbit' && i.foodState === 'preserved' && i.spoilDay > day);
    ok('C. specialist-smoke cannot resurrect rotten meat', gone && !resurrected && /went bad|rotten|flies|won.t touch/i.test(lastSaid),
      `gone=${gone} resurrected=${resurrected} said=${JSON.stringify(lastSaid.slice(0, 90))}`);
  }

  // ---- D. self-cook rotten needsCooking plant ----
  {
    s.inventory = [];
    const idx = putInPack(rottenNeedsCookingPlant());
    lastSaid = '';
    Game.cookFood(idx);
    const gone = !s.inventory.some(i => i && i.plantId === 'groundnut');
    const resurrected = s.inventory.some(i => i && i.plantId === 'groundnut' && i.spoilDay > day);
    ok('D. self-cook cannot resurrect rotten needsCooking plant', gone && !resurrected && /went bad|rotten|flies/i.test(lastSaid),
      `gone=${gone} resurrected=${resurrected} said=${JSON.stringify(lastSaid.slice(0, 90))}`);
  }

  // ---- E. putAwayFinished must not launder rotten finished food into the pantry ----
  {
    Game.prepStash().length = 0;
    v.pantry = []; v.pantryKcal = 0;
    Game.prepStash().push({
      name: 'Smoked rabbit', plantId: 'meat_rabbit', foodKind: 'meat', foodState: 'preserved',
      edible: true, units: 2, unit: 'portion', kcalEach: 100, spoilDay: day - 1, // ROTTEN, finished
      safe: true, kg: 0.4,
    });
    const saidAll = [];
    const keepSay = Game.say;
    Game.say = (t) => { saidAll.push(String(t)); return keepSay(t); };
    Game.putAwayFinished();
    Game.say = keepSay;
    const laundered = (v.pantry || []).some(i => i.plantId === 'meat_rabbit');
    const stillStash = Game.prepStash().some(i => i.plantId === 'meat_rabbit');
    const honest = saidAll.some(t => /went bad|rotten|flies/i.test(t));
    ok('E. put-away refuses rotten finished food', !laundered && !stillStash && honest,
      `inPantry=${laundered} stillStash=${stillStash} said=${JSON.stringify(saidAll).slice(0, 120)}`);
  }

  // ---- F. CONTROL: self-preserve already refuses rot (must keep holding) ----
  {
    s.inventory = [];
    const idx = putInPack(rottenCleanedMeat());
    lastSaid = '';
    Game.preserveFood(idx);
    const gone = !s.inventory.some(i => i && i.plantId === 'meat_rabbit');
    ok('F. control: preserveFood still refuses rot', gone && /went bad|smoking won.t save/i.test(lastSaid),
      `said=${JSON.stringify(lastSaid.slice(0, 80))}`);
  }

  // ---- G. CONTROL: cleanCarcass already refuses rot (must keep holding) ----
  {
    s.inventory = [];
    s.inventory.push({
      name: 'Rabbit (carcass)', plantId: 'meat_rabbit', foodState: 'carcass',
      hiddenKcal: 1200, spoilDay: day - 1, kg: 1.2,
    });
    lastSaid = '';
    Game.cleanCarcass(0);
    const gone = !s.inventory.some(i => i && i.foodState === 'carcass');
    ok('G. control: cleanCarcass still refuses rot', gone && /went bad|Beyond cleaning/i.test(lastSaid),
      `said=${JSON.stringify(lastSaid.slice(0, 80))}`);
  }

  // ---- H. CONTROL: blood_magic 3rd tap refused (break-it food fix holds) ----
  {
    s.abilities = s.abilities || [];
    if (!s.abilities.some(a => a.id === 'blood_magic')) s.abilities.push({ id: 'blood_magic', name: 'blood_magic', level: 1, xp: 0 });
    s.health = 100; s.kcal = 2000;
    s.bloodPriceDayPart = undefined; s.bloodPriceUses = 0;
    Game.activateAbility('blood_magic');
    Game.activateAbility('blood_magic');
    lastSaid = '';
    const kBefore = s.kcal;
    Game.activateAbility('blood_magic');
    const thirdFired = s.kcal > kBefore;
    ok('H. control: blood_magic 3rd tap refused', !thirdFired,
      `kcalBefore=${kBefore} kcalAfter=${s.kcal} said=${JSON.stringify(lastSaid.slice(0, 80))}`);
  }

  // ---- I. CONTROL: dropItem gives the full-pack softlock an exit ----
  {
    s.inventory = [{ name: 'Rock', kcalEach: 0, units: 1, kg: 2 }];
    Game.dropItem(0);
    ok('I. control: dropItem discards (softlock exit exists)', s.inventory.length === 0);
  }

  // ---- J. CONTROL: stockPantry stocks real items with a clock ----
  // NOTE (forager run 2026-10-08): GRANULAR PIECES (Steve 2026-10-08, game.js
  // stockPantry) supersedes the old single-slab behavior — 3000 kcal now
  // arrives as 6x500 pieces so villageMeal can take what it needs. The old
  // assertion (kcalEach === 3000) contradicted HEAD's documented design.
  {
    v.pantry = []; v.pantryKcal = 0;
    Game.stockPantry(3000, 'Genesis fruit');
    const items = (v.pantry || []).filter(i => i.name === 'Genesis fruit');
    const it = items[0];
    ok('J. control: stockPantry creates real items with a clock (granular pieces)',
      items.length > 0 && items.every(i => i.kcalEach <= 500 && i.spoilDay === day + 3) &&
        items.reduce((t, i) => t + i.kcalEach * (i.units || 1), 0) === 3000 && v.pantryKcal === 3000,
      `items=${JSON.stringify(items)}`);
  }

  // ---- K. CONTROL: feastBurn needs 300 banked ----
  {
    s.kcal = 100; // nowhere near banked
    lastSaid = '';
    const r = Game.feastBurn();
    ok('K. control: feastBurn returns 0 when not banked', r === 0, `returned=${r}`);
  }

  // ---- L. donateToPantry refuses rot (no trust for garbage) ----
  {
    s.inventory = [];
    v.pantry = []; v.pantryKcal = 0;
    const trustBefore = (v.trust || {})[s.villagerId] || 0;
    const idx = putInPack({
      name: 'Smoked rabbit', plantId: 'meat_rabbit', foodKind: 'meat', foodState: 'preserved',
      edible: true, units: 2, unit: 'portion', kcalEach: 100, spoilDay: day - 1, // ROTTEN
      safe: true, kg: 0.4,
    });
    lastSaid = '';
    Game.donateToPantry(idx);
    const inPantry = (v.pantry || []).some(i => i.plantId === 'meat_rabbit');
    const trustAfter = (v.trust || {})[s.villagerId] || 0;
    ok('L. donate refuses rot (no pantry stock, no trust)', !inPantry && trustAfter <= trustBefore && /went bad|rot/i.test(lastSaid),
      `inPantry=${inPantry} trust ${trustBefore}->${trustAfter} said=${JSON.stringify(lastSaid.slice(0, 80))}`);
  }

  // ---- M. specialist preserver teaches the REAL 'preserve' technique ----
  // (pre-fix the watch path learned phantom key 'preserver': the "watch twice"
  // message printed "you'll pick up undefined" and knowsTechnique('preserve')
  // stayed false forever — recorded in the pre-fix run output)
  {
    s.inventory = [];
    const techBefore = Game.knowsTechnique('preserve');
    const mk = () => ({
      name: 'Rabbit (cleaned)', plantId: 'meat_rabbit', foodKind: 'meat', foodState: 'cleaned',
      edible: true, units: 4, unit: 'portion', kcalEach: 120, hiddenKcal: 480,
      spoilDay: day + 2, // FRESH
      diseaseRisk: { p: 0.35, dmg: 8, note: 'raw meat' }, safe: false, kg: 0.5,
    });
    const i1 = putInPack(mk());
    Game.askSpecialist('testchef', i1, s.inventory, 'preserver');
    const i2 = putInPack(mk());
    lastSaid = '';
    Game.askSpecialist('testchef', i2, s.inventory, 'preserver');
    const learned = Game.knowsTechnique('preserve');
    ok('M. watching the preserver twice teaches preserve', !techBefore && learned && !/undefined/.test(lastSaid),
      `preserveKnown=${learned} said=${JSON.stringify(lastSaid.slice(0, 80))}`);
  }

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e && e.stack || e); process.exit(2); });
