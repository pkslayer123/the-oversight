#!/usr/bin/env node
// BREAK-IT: food economy, layer 4 (2026-10-09). Hostile pass over the
// surfaces layers 1-3 didn't cover: cannibal spoil gate, immortal staples,
// counter-bite risk rolls, specialist plant cooking, dead UI copy, meat
// mastery health grants.
//
// KILLS:
//   K1. EXPLOIT/HONESTY: eatCannibal never checked spoilage. eatOne routes
//       meat_human -> eatCannibal BEFORE its own rot check, so rotten human
//       meat ate at full 550 kcal/portion. FIX (corruption.js): bonus-aware
//       isSpoiled gate mirroring eatOne.
//   K2. SPOILAGE BYPASS: immortal staples everywhere — the ~47k-kcal STARTING
//       PANTRY (dried beans/rice/soup/meat/peanuts), the player's starting
//       trail mix, the exile founder's cache (betrayal.js), and corpse-looted
//       dried meat (corpses.js) all stamped spoilDay 9999: the village sweep
//       could never clear them, hoarders kept them for months. FIX: honest
//       long clocks (dried/smoked-class day+30 per PRESERVATION.md, dry
//       staples/cans day+365, trail mix/peanuts day+60).
//   K3. EXPLOIT/HONESTY: eatStashOne (prep-counter "raw now" bite) rolled
//       diseaseRisk ONLY — raw bear meat off the counter skipped the
//       trichinosis roll AND the poison roll that eatOne performs, and had no
//       shellgut guard on the disease roll. FIX (food.js): mirror eatOne's
//       parasite + poison rolls with the shellgut guard. Also the copy always
//       said "You eat it raw" even for cooked/smoked bites.
//   K4. HONESTY: askSpecialist 'cook' for needsCooking plants just cleared the
//       risk and left kcalEach untouched — zero digestibility while the copy
//       promised "better than you could do" (the player's own fire runs
//       cookTransform and gains real net kcal). FIX (food.js): the specialist
//       branch runs the same cookTransform (knows:true, +5%/skill).
//   K5. HONESTY/DEAD-CODE: whoOptions' unwired 'preserver'/'you' branch said
//       "8 ticks" — smoking costs 16 (Steve 2026-10-09). Only 'butcher' is
//       rendered today; the copy must be true if the rest ever gets wired.
//       FIX (food.js): 16 ticks.
//   K6. HONESTY: meat mastery granted +5 health/bite from deepKnown AND +5
//       from masterKnown = +10/bite, but the mastery copy promises "+5 health
//       every time you eat it". FIX (game.js): elif — mastery keeps the +5,
//       doesn't stack a second.
// HELD (attacked, resisted — with numbers): giveFood trust costs real food;
//   donate/take-back revoke ledgers intact; pantry take/put stack merging
//   (stacksMatch) refuses cross-clock merges; buryCache keeps full processing
//   state and honest clocks; lump split/identify conserves units; bulk-eat
//   path already skips spoiled items incl. human meat; prionRisk is rolled
//   inline in eatCannibal at the item's stated 0.15.
//
// Usage: node scripts/test-break-food4-20261009.js
//        BEFORE=1 node scripts/test-break-food4-20261009.js
//        SEED=7 node scripts/test-break-food4-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261009', 10);

const PRE = ['src/js/corruption.js', 'src/js/game.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/food.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bf4-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf4-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  return Game.state.scholar;
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ K1. eatCannibal spoilage gate ============
  console.log('\n-- K1. eatCannibal refuses rot --');
  {
    const s = freshGame();
    const day = s.day;
    s.kcal = 0;
    const rot = Game.humanMeatItem(1);
    // rot past the LIVE bonus boundary (preservation_instinct varies by seed)
    const bonus = Game.spoilBonusDays ? Game.spoilBonusDays() : 0;
    rot.spoilDay = day - bonus - 1; // rotten by every rule
    s.inventory.push(rot);
    const meals0 = s.cannibalMeals || 0;
    const kcal0 = s.kcal;
    says.length = 0;
    Game.eatOne(s.inventory.length - 1); // routes meat_human -> eatCannibal
    const kept = s.inventory.some(i => i && i.plantId === 'meat_human' && (i.units || 0) > 0);
    if (BEFORE) {
      ok('BEFORE: rotten human meat is eaten (spoil gate missing)', !kept || (s.cannibalMeals || 0) > meals0,
        `kept=${kept} meals=${s.cannibalMeals}`);
    } else {
      ok('AFTER: rotten human meat refused, units intact', kept && (s.cannibalMeals || 0) === meals0,
        `kept=${kept} meals=${s.cannibalMeals}`);
      ok('AFTER: refusal is said out loud', says.some(t => /went bad/i.test(t)), says.slice(-2).join(' | '));
      ok('AFTER: no kcal granted from rot', s.kcal === kcal0, `kcal=${s.kcal}`);
    }
  }
  {
    // control: fresh human meat still eats
    const s = freshGame();
    const day = s.day;
    s.kcal = 0;
    const fresh = Game.humanMeatItem(1);
    fresh.spoilDay = day + 2;
    s.inventory.push(fresh);
    const meals0 = s.cannibalMeals || 0;
    Game.eatOne(s.inventory.length - 1);
    if (BEFORE) {
      ok('BEFORE control: fresh human meat eats', (s.cannibalMeals || 0) > meals0, `meals=${s.cannibalMeals}`);
    } else {
      ok('AFTER control: fresh human meat still eats (gate is rot-only)', (s.cannibalMeals || 0) > meals0,
        `meals=${s.cannibalMeals}`);
    }
  }

  // ============ K2a. starting pantry + pack honest clocks ============
  console.log('\n-- K2a. starting pantry / pack clocks --');
  {
    const s = freshGame();
    const day = s.day;
    const pantry = Game.state.village.pantry || [];
    const find = (n) => pantry.find(i => i.name === n);
    const dm = find('Dried meat'), beans = find('Dried beans'), rice = find('Rice'),
      soup = find('Canned soup'), nuts = find('Peanuts');
    const pack = s.inventory || [];
    const tm = pack.find(i => i.name === 'Trail mix');
    if (BEFORE) {
      ok('BEFORE: starting staples are immortal (spoilDay 9999)',
        [dm, beans, rice, soup, nuts].every(i => i && i.spoilDay === 9999),
        [dm, beans, rice, soup, nuts].map(i => i && i.spoilDay).join(','));
      ok('BEFORE: starting trail mix is immortal', tm && tm.spoilDay === 9999, `spoilDay=${tm && tm.spoilDay}`);
    } else {
      ok('AFTER: dried meat keeps ~a month (canon)', dm && dm.spoilDay <= day + 30 && dm.spoilDay > day, `spoilDay=${dm && dm.spoilDay} day=${day}`);
      ok('AFTER: dry staples/cans keep ~a year', [beans, rice, soup].every(i => i && i.spoilDay <= day + 365 && i.spoilDay > day + 30),
        [beans, rice, soup].map(i => i && i.spoilDay).join(','));
      ok('AFTER: peanuts keep ~two months', nuts && nuts.spoilDay <= day + 60 && nuts.spoilDay > day, `spoilDay=${nuts && nuts.spoilDay}`);
      ok('AFTER: trail mix keeps ~two months', tm && tm.spoilDay <= day + 60 && tm.spoilDay > day, `spoilDay=${tm && tm.spoilDay}`);
      ok('AFTER: no immortal food in the starting stock', pantry.concat(pack).every(i => !i || (i.kcalEach || 0) <= 0 || (i.spoilDay || 0) < 9999));
      ok('AFTER: the pantry still sweeps (isSpoiled honors the clocks)',
        Game.isSpoiled({ spoilDay: day + 30 }, 0) === false && Game.isSpoiled({ spoilDay: day - 1 }, 0) === true);
    }
  }

  // ============ K2b. founder's cache (exile fork) ============
  console.log('\n-- K2b. exile founder\'s cache clocks --');
  {
    const s = freshGame();
    const day = s.day;
    let forked = false;
    try { forked = Game._forkNewHaven(); } catch (e) { console.log('  (fork threw: ' + e.message + ')'); }
    const pantry = (Game.state.village && Game.state.village.pantry) || [];
    if (BEFORE) {
      ok('BEFORE: founder\'s cache is immortal', forked && pantry.length === 3 && pantry.every(i => i.spoilDay === 9999),
        pantry.map(i => i && i.spoilDay).join(','));
    } else {
      ok('AFTER: founder\'s cache has honest clocks', forked && pantry.length === 3 && pantry.every(i => i.spoilDay < 9999 && i.spoilDay > day),
        pantry.map(i => `${i.name}:${i.spoilDay}`).join(', '));
      const fdm = pantry.find(i => i.name === 'Dried meat');
      ok('AFTER: cache dried meat ~a month', fdm && fdm.spoilDay <= day + 30, `spoilDay=${fdm && fdm.spoilDay}`);
    }
  }

  // ============ K2c. corpse-loot dried meat ============
  console.log('\n-- K2c. corpse-loot dried meat clock --');
  {
    const s = freshGame();
    const day = s.day;
    const meats = [];
    for (let i = 0; i < 40 && meats.length < 3; i++) {
      for (const it of Game.generatePossessions({})) {
        if (it.name === 'Dried meat') meats.push(it);
      }
    }
    if (BEFORE) {
      ok('BEFORE: corpse-looted dried meat is immortal', meats.length > 0 && meats.every(m => m.spoilDay === 9999),
        `n=${meats.length} clocks=${meats.map(m => m.spoilDay).join(',')}`);
    } else {
      ok('AFTER: corpse-looted dried meat rots honestly', meats.length > 0 && meats.every(m => m.spoilDay < 9999 && m.spoilDay <= day + 30),
        `n=${meats.length} clocks=${meats.map(m => m.spoilDay).join(',')}`);
      // control: non-food gear still doesn't rot
      const gear = [];
      for (let i = 0; i < 10; i++) for (const it of Game.generatePossessions({})) if ((it.kcalEach || 0) <= 0 && !it.keepsake) gear.push(it);
      ok('AFTER control: corpse gear stays non-rotting', gear.length > 0 && gear.every(g => g.spoilDay === 9999), `n=${gear.length}`);
    }
  }

  // ============ K3. eatStashOne risk rolls ============
  console.log('\n-- K3. counter bite rolls parasite + poison --');
  {
    const s = freshGame();
    const day = s.day;
    s.kcal = 0;
    const diseaseCalls = [], poisonCalls = [];
    const oContract = Game.contractDisease, oApply = Game.applyStatus;
    Game.contractDisease = function (id, opts) { diseaseCalls.push(id); };
    Game.applyStatus = function (who, id, opts) { if (id === 'poison') poisonCalls.push(id); return oApply && oApply.call(this, who, id, opts); };
    const stash = Game.prepStash();
    stash.length = 0;
    stash.push({
      name: 'Bear meat (cleaned)', plantId: 'meat_black_bear', foodKind: 'meat', foodState: 'cleaned',
      edible: true, kcalEach: 400, units: 1, spoilDay: day + 2,
      parasiteRisk: { p: 1, id: 'trichinosis' }, poisonRisk: { p: 1, note: 'bitter almonds' },
    });
    says.length = 0;
    Game.eatStashOne(0);
    Game.contractDisease = oContract; Game.applyStatus = oApply;
    if (BEFORE) {
      ok('BEFORE: counter bite skips the worm roll', diseaseCalls.length === 0, `diseaseCalls=${diseaseCalls.length}`);
      ok('BEFORE: counter bite skips the poison roll', poisonCalls.length === 0, `poisonCalls=${poisonCalls.length}`);
    } else {
      ok('AFTER: counter bite rolls the worms', diseaseCalls.includes('trichinosis'), `diseaseCalls=${diseaseCalls}`);
      ok('AFTER: counter bite rolls poison', poisonCalls.includes('poison'), `poisonCalls=${poisonCalls}`);
    }
  }
  {
    // K3 copy honesty: cooked bites aren't "raw"
    const s = freshGame();
    const day = s.day;
    s.kcal = 0;
    const stash = Game.prepStash();
    stash.length = 0;
    stash.push({
      name: 'Pemmican', plantId: null, foodKind: 'meat', foodState: 'pemmican',
      edible: true, kcalEach: 600, units: 1, spoilDay: day + 120, safe: true,
    });
    says.length = 0;
    Game.eatStashOne(0);
    const eatLine = says.find(t => /600 kcal/.test(t)) || says[says.length - 1] || '';
    if (BEFORE) {
      ok('BEFORE: cooked counter bite claims "raw"', /eat it raw/i.test(eatLine), eatLine.slice(0, 80));
    } else {
      ok('AFTER: cooked counter bite copy is honest', !/eat it raw/i.test(eatLine) && /\+600 kcal/.test(eatLine), eatLine.slice(0, 80));
    }
  }

  // ============ K4. specialist plant cooking ============
  console.log('\n-- K4. specialist cook grants digestibility --');
  {
    const s = freshGame();
    const day = s.day;
    const v = Game.state.village;
    const vid = v.roster.find(id => id !== Game.villagerId);
    const person = Game.getPerson(vid);
    person.formerOccupation = 'chef'; // cook specialty, skill 3
    s.inventory.push({
      name: 'Burdock root', plantId: 'burdock', foodKind: 'plant', foodState: 'ready',
      edible: true, kcalEach: 100, units: 2, spoilDay: day + 2,
      needsCooking: true, diseaseRisk: { p: 0.25, dmg: 8, note: 'raw root' },
    });
    const idx = s.inventory.length - 1;
    says.length = 0;
    Game.askSpecialist(vid, idx);
    const it = s.inventory[idx] || s.inventory.find(i => i && i.name === 'Burdock root');
    if (BEFORE) {
      ok('BEFORE: specialist plant-cook grants zero digestibility', it && it.kcalEach === 100, `kcalEach=${it && it.kcalEach}`);
    } else {
      ok('AFTER: specialist plant-cook gains real kcal', it && it.kcalEach > 100, `kcalEach=${it && it.kcalEach}`);
      ok('AFTER: risk cleared, needsCooking cleared', it && !it.diseaseRisk && !it.needsCooking,
        `diseaseRisk=${!!(it && it.diseaseRisk)} needsCooking=${it && it.needsCooking}`);
      ok('AFTER: still clocked honestly', it && it.spoilDay === day + 5, `spoilDay=${it && it.spoilDay}`);
    }
  }

  // ============ K5. whoOptions smoke time ============
  console.log('\n-- K5. whoOptions smoke-time copy --');
  {
    freshGame();
    const opts = Game.whoOptions({ foodKind: 'meat', foodState: 'cleaned', hiddenKcal: 1000, kcalEach: 400, units: 2, name: 'meat' }, 'preserver') || [];
    const you = opts.find(o => o.id === 'you');
    const detail = (you && you.detail) || '';
    if (BEFORE) {
      ok('BEFORE: unwired smoke option says 8 ticks', /8 ticks/.test(detail), detail);
    } else {
      ok('AFTER: unwired smoke option says 16 ticks', /16 ticks/.test(detail), detail);
    }
  }

  // ============ K6. meat mastery health grant ============
  console.log('\n-- K6. mastery health: +5 not +10 --');
  {
    const s = freshGame();
    s.kcal = 0;
    s.health = 50;
    Game.state.codex.animalPrep = Game.state.codex.animalPrep || {};
    Game.state.codex.animalPrep['white_tailed_deer'] = { tastings: 10, prepKnown: true, deepKnown: true, masterKnown: true };
    const oEnc = Game.encAnimalKnown;
    Game.encAnimalKnown = () => true;
    const grants = [];
    const oAdd = Game.addHealth;
    Game.addHealth = function (n) { grants.push(n); return oAdd.call(this, n); };
    s.inventory.push({
      name: 'Venison (cooked)', plantId: 'meat_white_tailed_deer', foodKind: 'meat', foodState: 'cooked',
      edible: true, safe: true, kcalEach: 100, units: 1, spoilDay: s.day + 5, unit: 'portion',
    });
    Game.eatOne(s.inventory.length - 1);
    Game.addHealth = oAdd; Game.encAnimalKnown = oEnc;
    const total = grants.reduce((a, b) => a + b, 0);
    if (BEFORE) {
      ok('BEFORE: mastery bite grants +10 (double)', total === 10, `grants=${grants.join('+')}`);
    } else {
      ok('AFTER: mastery bite grants the promised +5', total === 5, `grants=${grants.join('+')}`);
    }
  }

  // ============ DEAD CODE: fixed functions are live ============
  console.log('\n-- dead-code: fixed systems are wired --');
  {
    freshGame();
    ok('eatCannibal reachable (eatOne routes meat_human)', typeof Game.eatCannibal === 'function');
    ok('eatStashOne reachable (prep counter)', typeof Game.eatStashOne === 'function');
    ok('askSpecialist reachable', typeof Game.askSpecialist === 'function');
    ok('whoOptions reachable', typeof Game.whoOptions === 'function');
    ok('generatePossessions reachable', typeof Game.generatePossessions === 'function');
    ok('_forkNewHaven reachable', typeof Game._forkNewHaven === 'function');
    const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const m of ['corruption.js', 'food.js']) {
      ok(`index.html loads ${m}`, idxHtml.includes(m));
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
