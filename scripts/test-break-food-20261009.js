#!/usr/bin/env node
// BREAK-IT: food economy (2026-10-09). Hostile attacks on the food pipeline:
// eating/cooking/preserving, pantry/haven stores, caches, spoilage clocks,
// food-as-power (ONE economy), corpse meat rot.
//
// KILLS ATTEMPTED:
//   F1. EXPLOIT: pantryAdd (the putAwayFinished choke point) rebuilds the
//       pantry stack with a SUBSET of fields — drops poisonRisk, hiddenKcal,
//       rawKcal, burnt, cookedKcal. Poisoned meat washed through the pantry
//       loses its toxin: villagers eat it risk-free (trackMealExposure reads
//       item.poisonRisk), and taking it back yields a clean stack.
//   F2. HONESTY: digUpCache/takeFromCache apply the RAW spoil check
//       (it.spoilDay <= today) instead of the bonus-aware isSpoiled(). A
//       scholar with preservation_instinct (+2d/level) has food destroyed
//       underground that their own pack would still call edible.
//   F3. EXPLOIT: re-cook / re-preserve spoil refresh (held — re-cook only
//       reachable via the orig path once, kcal capped at gross, spoilDay
//       untouched by orig; re-preserve refused outright).
//   F4. SOFTLOCK: eatOne on spoiled food refuses with a say, no state change,
//       no phantom removal; digUpCache from the wrong node refuses with the
//       cache intact.
//   H1. HONESTY: spoilClockShort/stashClock vs isSpoiled boundary consistency
//       across spoilDay offsets and bonus levels.
//   D1. DEAD CODE: every food-module provided function is referenced at a call
//       site (static) + the main pipeline functions run in the harness.
//
// Usage: node scripts/test-break-food-20261009.js
//        BEFORE=1 node scripts/test-break-food-20261009.js
//        SEED=99 node scripts/test-break-food-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261009', 10);

const PRE = ['src/js/food.js', 'src/js/storage.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bf-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
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
  return Game.state.scholar;
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ F1. pantryAdd field laundering ============
  console.log('\n-- F1. pantryAdd keeps the full processing state --');
  {
    const s = freshGame();
    const day = s.day;
    // hostile item: poisoned belltoad-style meat, burnt, with reveal math fields
    const it = {
      name: 'Belltoad flesh (cleaned)', kcalEach: 120, units: 4, spoilDay: day + 2,
      safe: false, kg: 0.5, unit: 'portion',
      plantId: 'meat_belltoad', foodKind: 'meat', foodState: 'cleaned', edible: false,
      hiddenKcal: 1200, rawKcal: 300, cookedKcal: null, burnt: true,
      poisonRisk: { p: 0.5, note: 'throat sac toxin' },
      diseaseRisk: { p: 0.35, dmg: 12, note: 'raw meat' },
      prep: 'Gut it carefully.', wellMade: false,
    };
    const added = Game.pantryAdd(it);
    ok('F1a. pantryAdd accepts the stack', added === true, 'added=' + added);
    const p = Game.state.village.pantry[Game.state.village.pantry.length - 1];
    ok('F1b. poisonRisk survives put-away', !!(p.poisonRisk && p.poisonRisk.p === 0.5 && /throat sac/.test(p.poisonRisk.note || '')), 'got ' + JSON.stringify(p.poisonRisk));
    ok('F1c. hiddenKcal survives put-away', p.hiddenKcal === 1200, 'got ' + p.hiddenKcal);
    ok('F1d. rawKcal survives put-away', p.rawKcal === 300, 'got ' + p.rawKcal);
    ok('F1e. burnt survives put-away', p.burnt === true, 'got ' + p.burnt);
    // the payoff: villagers eat pantry stacks through trackMealExposure
    const exp = { raw: [], unsafe: 0, poison: [], monster: [] };
    Game.trackMealExposure(exp, p, false);
    ok('F1f. villager meal still sees the toxin', exp.poison.length === 1 && /throat sac/.test(exp.poison[0].note || ''), 'poison exposures=' + exp.poison.length);
    // and take-back must not mint a clean stack
    const pi = Game.state.village.pantry.length - 1;
    Game.state.scholar.inventory = [];
    Game.takeFromPantry(pi);
    const back = Game.state.scholar.inventory.find(i => /Belltoad/.test(i.name || ''));
    ok('F1g. take-back keeps the poison', !!(back && back.poisonRisk && back.poisonRisk.p === 0.5), back ? 'got ' + JSON.stringify(back.poisonRisk) : 'stack missing');
  }

  // ============ F2. cache spoil check vs preservation bonus ============
  console.log('\n-- F2. buried food honors preservation_instinct --');
  {
    const s = freshGame();
    // bonus is seed-dependent (backgrounds can grant preservation_instinct) —
    // measure it, then place test items relative to the measured bonus.
    s.abilities = (s.abilities || []).filter(a => (a.id || a) !== 'preservation_instinct');
    s.abilities.push({ id: 'preservation_instinct', level: 1 });
    const bonus = Game.spoilBonusDays();
    ok('F2a. bonus is live', bonus >= 2, 'bonus=' + bonus);
    const buryDay = s.day;
    // bonus-alive but raw-spoiled: spoilDay+bonus = day+1 > day -> edible in pack
    const it = { name: 'Dried berries', kcalEach: 50, units: 3, spoilDay: buryDay - bonus + 1, safe: true, kg: 0.1, unit: 'handful', plantId: 'bx', foodKind: 'plant', foodState: 'ready', edible: true, prep: 'x' };
    ok('F2b. pack calls it edible (bonus-aware)', Game.isSpoiled(it) === false, 'isSpoiled=' + Game.isSpoiled(it));
    s.inventory = [it];
    Game.buryCache('food', 0, 3);
    const c = Game.playerCaches()[Game.playerCaches().length - 1];
    ok('F2c. cache created', !!c && c.items.length === 1, 'caches=' + Game.playerCaches().length);
    const digDay = Game.state.scholar.day;
    Game.digUpCache(c.id);
    // self-consistent expectation whatever the day did during the dig
    const expectSurvive = ((buryDay - bonus + 1) + bonus) > digDay;
    const back = Game.state.scholar.inventory.find(i => i.name === 'Dried berries');
    ok('F2d. dig-up matches the pack rule (bonus-aware)', (!!back) === expectSurvive,
      `spoilDay=${buryDay - bonus + 1} bonus=${bonus} buryDay=${buryDay} digDay=${digDay} expectSurvive=${expectSurvive} found=${!!back}`);
    if (expectSurvive) ok('F2e. units intact on return', back && back.units === 3, 'units=' + (back && back.units));
    // control: genuinely rotten even with the bonus must still die
    const rot = { name: 'Ancient jerky', kcalEach: 50, units: 2, spoilDay: digDay - bonus - 1, safe: true, kg: 0.1, unit: 'handful', plantId: 'aj', foodKind: 'plant', foodState: 'ready', edible: true, prep: 'x' };
    ok('F2f. control is truly rotten', Game.isSpoiled(rot) === true);
    Game.state.scholar.inventory = [rot];
    Game.buryCache('food', 0, 2);
    const c2 = Game.playerCaches()[Game.playerCaches().length - 1];
    Game.digUpCache(c2.id);
    const back2 = Game.state.scholar.inventory.find(i => i.name === 'Ancient jerky');
    ok('F2g. true rot still destroyed underground', !back2, 'found=' + !!back2);
    // takeFromCache shares the rule
    const it3 = { name: 'Cached roots', kcalEach: 40, units: 4, spoilDay: Game.state.scholar.day - bonus + 1, safe: true, kg: 0.1, unit: 'piece', plantId: 'cr', foodKind: 'plant', foodState: 'ready', edible: true, prep: 'x' };
    Game.state.scholar.inventory = [it3];
    Game.buryCache('food', 0, 4);
    const c3 = Game.playerCaches()[Game.playerCaches().length - 1];
    const sd3 = c3.items[0].spoilDay;
    const d3 = Game.state.scholar.day;
    Game.takeFromCache(c3.id, 0, 2);
    const expect3 = (sd3 + bonus) > d3;
    const inv3 = Game.state.scholar.inventory.find(i => i.name === 'Cached roots');
    ok('F2h. takeFromCache matches the pack rule', (!!inv3) === expect3,
      `expectSurvive=${expect3} found=${!!inv3} units=${inv3 && inv3.units}`);
  }

  // ============ F3. re-cook / re-preserve spoil refresh (held) ============
  console.log('\n-- F3. re-cook / re-preserve cannot extend shelf life --');
  {
    const s = freshGame();
    Game.nearFire = () => true;
    const day = s.day;
    // real cleaned meat (no rawKcal): wrapper path
    const meat = { name: 'Turkey (cleaned)', kcalEach: 100, units: 4, spoilDay: day + 2, safe: false, kg: 0.5, unit: 'portion', plantId: 'meat_turkey', foodKind: 'meat', foodState: 'cleaned', edible: true, hiddenKcal: 1000, diseaseRisk: { p: 0.35, dmg: 12, note: 'raw meat' }, prep: 'x' };
    s.inventory = [meat];
    Game.cookFood(0);
    const m1 = s.inventory[0];
    ok('F3a. first cook lands', m1.foodState === 'cooked' && m1.spoilDay === day + 5, `state=${m1.foodState} spoilDay=${m1.spoilDay}`);
    const kcal1 = m1.kcalEach * m1.units;
    Game.cookFood(0); // second cook: wrapper needs 'cleaned', orig needs rawKcal — neither
    const m2 = s.inventory[0];
    ok('F3b. cooked meat refuses re-cook', m2.kcalEach * m2.units === kcal1 && m2.spoilDay === day + 5, `total=${m2.kcalEach * m2.units} spoilDay=${m2.spoilDay}`);
    // real rawKcal staple (dried beans): orig path, one-shot
    const beans = { name: 'Dried beans', rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 20, spoilDay: 9999, safe: false, kg: 0.5, needsCooking: true, unit: 'scoop' };
    s.inventory = [beans];
    Game.cookFood(0);
    const b1 = s.inventory[0];
    ok('F3c. beans cook once', b1.rawKcal === null && b1.kcalEach > 0, `rawKcal=${b1.rawKcal} kcalEach=${b1.kcalEach}`);
    const bk = b1.kcalEach;
    Game.cookFood(0);
    const b2 = s.inventory[0];
    ok('F3d. beans refuse second cook', b2.kcalEach === bk && says.some(t => /Nothing to cook/.test(t)), `kcalEach=${b2.kcalEach}`);
    // undercooked finishing is the INTENDED re-cook: force an undercooked outcome
    const oco = Game.cookOutcome;
    Game.cookOutcome = () => ({ key: 'undercooked', mult: 0.7, riskStays: true });
    const tuber = { name: 'Wild tuber', kcalEach: 80, units: 3, spoilDay: day + 2, safe: false, kg: 0.2, unit: 'piece', plantId: 'tuber_x', foodKind: 'plant', foodState: 'ready', edible: true, needsCooking: true, diseaseRisk: { p: 0.25, dmg: 8, note: 'raw (it needed cooking)' }, prep: 'x' };
    s.inventory = [tuber];
    Game.cookFood(0);
    const t1 = s.inventory[0];
    ok('F3e. undercooked keeps the job open', t1.needsCooking === true && !!t1.diseaseRisk, `needsCooking=${t1.needsCooking}`);
    Game.cookOutcome = () => ({ key: 'decent', mult: 0.9, riskStays: false });
    Game.cookFood(0);
    const t2 = s.inventory[0];
    ok('F3f. finishing cook closes it', t2.needsCooking === false && t2.diseaseRisk === null, `needsCooking=${t2.needsCooking}`);
    Game.cookOutcome = oco;
    // re-preserve refused
    Game.preserveFood(0); // nothing valid in inventory now (tuber is cooked plant) — use meat instead
    const pm = { name: 'Turkey (cooked)', kcalEach: 120, units: 4, spoilDay: day + 5, safe: true, kg: 0.5, unit: 'portion', plantId: 'meat_turkey', foodKind: 'meat', foodState: 'cooked', edible: true, prep: 'x' };
    s.inventory = [pm];
    Game.preserveFood(0);
    const p3 = s.inventory[0];
    const pspoil = p3.spoilDay;
    ok('F3g. preserve lands once', p3.foodState === 'preserved', `state=${p3.foodState} spoilDay=${p3.spoilDay}`);
    Game.preserveFood(0);
    const p4 = s.inventory[0];
    ok('F3h. re-preserve refused, spoilDay frozen', p4.spoilDay === pspoil && p4.foodState === 'preserved', `spoilDay=${p4.spoilDay} state=${p4.foodState}`);
    delete Game.nearFire;
  }

  // ============ F4. softlock: spoiled eat, wrong-node dig ============
  console.log('\n-- F4. refusal paths leave no wreckage --');
  {
    const s = freshGame();
    const day = s.day;
    const kcal0 = s.kcal || 0;
    const rot = { name: 'Old stew', kcalEach: 200, units: 2, spoilDay: day - 1, safe: true, kg: 0.3, unit: 'bowl', plantId: 'os', foodKind: 'plant', foodState: 'ready', edible: true, prep: 'x' };
    s.inventory = [rot];
    Game.eatOne(0);
    ok('F4a. spoiled eat refused, kcal untouched', (s.kcal || 0) === kcal0, `kcal=${s.kcal} was=${kcal0}`);
    ok('F4b. spoiled item stays put (sweep owns removal)', s.inventory.length === 1 && s.inventory[0].name === 'Old stew', 'inv=' + s.inventory.length);
    ok('F4c. refusal is announced', says.some(t => /went bad|beyond eating/.test(t)), says.slice(-2).join(' | '));
    // wrong-node dig: cache intact
    const it = { name: 'Trail mix', kcalEach: 60, units: 2, spoilDay: day + 9, safe: true, kg: 0.1, unit: 'handful', plantId: 'tm', foodKind: 'plant', foodState: 'ready', edible: true, prep: 'x' };
    s.inventory = [it];
    Game.buryCache('food', 0, 2);
    const c = Game.playerCaches()[Game.playerCaches().length - 1];
    const ox = Game.map.px, oy = Game.map.py;
    Game.map.px = ox + 50; Game.map.py = oy + 50;
    const r = Game.digUpCache(c.id);
    ok('F4d. wrong-node dig refused', r === null, 'r=' + r);
    ok('F4e. cache intact after refused dig', Game.playerCaches().some(x => x.id === c.id), 'caches=' + Game.playerCaches().length);
    Game.map.px = ox; Game.map.py = oy;
  }

  // ============ H1. spoil clock honesty vs isSpoiled ============
  // The clocks themselves read the REAL bonus (spoilBonusDays), so the test
  // must grant/remove preservation_instinct to match the expected bonus.
  console.log('\n-- H1. spoil clocks agree with the spoil boundary --');
  {
    const s = freshGame();
    // measure the live bonus (seed-dependent: backgrounds can grant it)
    s.abilities = (s.abilities || []).filter(a => (a.id || a) !== 'preservation_instinct');
    const baseBonus = Game.spoilBonusDays();
    for (const extra of [0, 1]) {
      s.abilities = (s.abilities || []).filter(a => (a.id || a) !== 'preservation_instinct');
      if (extra) s.abilities.push({ id: 'preservation_instinct', level: 1 });
      const bonus = Game.spoilBonusDays();
      ok(`H1 setup. extra=${extra} bonus=${bonus}`, bonus === baseBonus + extra * 2, 'base=' + baseBonus);
      for (let off = -3; off <= 4; off++) {
        const day = s.day;
        const it = { name: 'x', kcalEach: 10, units: 1, spoilDay: day + off, safe: true, kg: 0.1 };
        const spoiled = Game.isSpoiled(it);
        const expectSpoiled = (day + off + bonus) <= day;
        if (spoiled !== expectSpoiled) { ok(`H1 boundary off=${off} b=${bonus}`, false, `isSpoiled=${spoiled}`); continue; }
        const clock = Game.spoilClockShort(it);
        const sclock = Game.stashClock(it);
        const left = off + bonus;
        if (spoiled) {
          ok(`H1a. spoiled (off=${off},b=${bonus}): clocks silent`, clock === '' && sclock === 'spoiled', `clock=${JSON.stringify(clock)} stash=${JSON.stringify(sclock)}`);
        } else if (left === 1) {
          ok(`H1b. off=${off},b=${bonus}: "tomorrow"`, clock === '⚠ spoils tomorrow' && sclock === 'spoils tomorrow', `clock=${JSON.stringify(clock)} stash=${JSON.stringify(sclock)}`);
        } else if (left === 2) {
          ok(`H1c. off=${off},b=${bonus}: "in 2d"`, clock === 'spoils in 2d' && sclock === 'spoils in 2d', `clock=${JSON.stringify(clock)} stash=${JSON.stringify(sclock)}`);
        } else {
          // spoilClockShort only speaks when urgent (left<=2); stashClock shows the full range
          ok(`H1d. off=${off},b=${bonus}: quiet pack, full stash`, clock === '' && sclock === `spoils in ${left}d`, `clock=${JSON.stringify(clock)} stash=${JSON.stringify(sclock)}`);
        }
      }
    }
  }

  // ============ H2. ONE economy: every source clamps to kcalCap ============
  console.log('\n-- H2. no kcal source bypasses the bank cap --');
  {
    const s = freshGame();
    const cap = Game.kcalCap();
    ok('H2a. cap is sane', cap >= 2400, 'cap=' + cap);
    s.kcal = cap - 10;
    s.inventory = [{ name: 'Feast', kcalEach: 5000, units: 1, spoilDay: s.day + 5, safe: true, kg: 0.5, plantId: 'fx', foodKind: 'plant', foodState: 'ready', edible: true, prep: 'x' }];
    Game.eatOne(0);
    ok('H2b. eating clamps to cap', s.kcal === cap, `kcal=${s.kcal} cap=${cap}`);
    // feastburn only spends banked; returns 0 when poor
    s.kcal = Game.fullLine() + 100;
    const fb0 = Game.feastBurn();
    ok('H2c. no burn under 300 banked', fb0 === 0 && s.kcal === Game.fullLine() + 100, `fb=${fb0} kcal=${s.kcal}`);
    // deep_reserves x5 bank: now there IS a war chest to burn
    s.abilities = (s.abilities || []).concat([{ id: 'deep_reserves', level: 1 }]);
    const cap2 = Game.kcalCap();
    s.kcal = cap2;
    const banked0 = Game.banked();
    ok('H2d setup. banked>0', banked0 >= 300, `banked=${banked0} cap=${cap2}`);
    const fb1 = Game.feastBurn();
    const expectBurn = Math.min(banked0, Game.feastState() === 'gorged' ? 400 : 300);
    ok('H2d. burn spends exactly the stated amount', fb1 > 0 && s.kcal === cap2 - expectBurn, `fb=${fb1} kcal=${s.kcal} expectBurn=${expectBurn}`);
    // overnight leak only touches banked
    const b1 = Game.banked();
    const lost = Game.overnightBankBurn();
    ok('H2e. overnight leak is 20% of banked', lost === Math.round(b1 * 0.2) && s.kcal === Game.fullLine() + (b1 - lost), `lost=${lost} b1=${b1}`);
  }

  // ============ D1. dead code: every food API is referenced ============
  console.log('\n-- D1. food pipeline is wired (static + runtime) --');
  {
    // static scan over ALL scripts in index.html order (including the
    // DOM-only ones, which are legitimate call sites for food actions)
    const allFiles = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1]);
    const allSrc = allFiles.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    const apis = ['foodMarker', 'cleanCarcass', 'cookFood', 'preserveFood', 'cookTransform', 'cookClassFor',
      'cookOutcome', 'consumeCookFire', 'downgradeOutcome', 'stacksMatch', 'spoilBonusDays', 'isSpoiled',
      'spoilClockShort', 'stashClock', 'sweepSpoiled', 'putAwayFinished', 'eatStashOne', 'howFarOptions',
      'feastBurn', 'feastState', 'overnightBankBurn', 'pantryAdd', 'pantryKcal', 'pantryCapKcal', 'kcalCap',
      'fullLine', 'banked', 'maxBank', 'mealQuality', 'donateToPantry', 'refreshItemNames', 'knowsTechnique',
      'learnTechnique', 'cookAll', 'buryCache', 'digUpCache', 'takeFromCache', 'playerCaches', 'dailyCacheCheck',
      'registerDeath', 'lootCorpse', 'corpseTakeItem', 'corpseEatItem', 'testMonsterMeat', 'testCautiously',
      'villageMeal', 'trackMealExposure', 'villagerFoodPoisoning', 'resolveDay', 'dailyNeed'];
    for (const api of apis) {
      const n = (allSrc.match(new RegExp(`\\b${api}\\b`, 'g')) || []).length;
      ok(`D1. ${api} referenced`, n >= 2, `occurrences=${n}`);
    }
    // runtime smoke: the core pipeline actually runs
    const s = freshGame();
    ok('D1r. foodMarker runs', typeof Game.foodMarker({ foodState: 'cooked' }) === 'string');
    ok('D1r. mealQuality runs', Game.mealQuality({ burnt: true }) === 0.45);
    ok('D1r. resolveDay runs', (() => { const r = globalThis.Scattering.calories.resolveDay({ kcal: 2500, health: 100, energy: 80, hydration: 80, injuries: [] }, {}, {}); return r && r.ok === true; })());
    ok('D1r. corpses engine loaded', typeof Game.registerDeath === 'function' && typeof Game.lootCorpse === 'function');
    ok('D1r. forage engine loaded', typeof globalThis.Scattering.forage === 'object');
  }

  // ============ SIBLING SWEEP: same bug classes in related systems ============
  console.log('\n-- SIB. sibling sweep --');
  {
    const s = freshGame();
    s.abilities = (s.abilities || []).filter(a => (a.id || a) !== 'preservation_instinct');
    s.abilities.push({ id: 'preservation_instinct', level: 1 });
    const bonus = Game.spoilBonusDays();
    const day = s.day;
    // trader appraisal: the merchant smells the same food you stored right
    const vis = { traderKnows: [], traderSpecialties: [] };
    const bonusAlive = { name: 'Smoked venison', kcalEach: 150, units: 2, spoilDay: day - bonus + 1, safe: true, kg: 0.3, foodKind: 'meat', plantId: 'meat_deer' };
    ok('SIB0. bonus-alive is edible in pack', Game.isSpoiled(bonusAlive) === false);
    const r1 = Game.traderAppraise(vis, bonusAlive);
    ok('SIB1. trader does not refuse bonus-alive meat', r1.verdict !== 'refuse', `verdict=${r1.verdict}`);
    const trulyRot = { name: 'Old venison', kcalEach: 150, units: 2, spoilDay: day - bonus - 1, safe: true, kg: 0.3, foodKind: 'meat', plantId: 'meat_deer' };
    ok('SIB1b. control is truly rotten', Game.isSpoiled(trulyRot) === true);
    const r2 = Game.traderAppraise(vis, trulyRot);
    ok('SIB2. trader still refuses true rot', r2.verdict === 'refuse', `verdict=${r2.verdict}`);
    // source-level: carexplore edibleStacks + betrayal appraisal use the boundary
    const ce = fs.readFileSync(path.join(ROOT, 'src/js/carexplore.js'), 'utf8');
    ok('SIB3. carexplore uses Game.isSpoiled', ce.includes('Game.isSpoiled(i)'), 'missing');
    ok('SIB4. carexplore spillDay typo gone', !/i\.spillDay/.test(ce), 'typo still present');
    const bt = fs.readFileSync(path.join(ROOT, 'src/js/betrayal.js'), 'utf8');
    ok('SIB5. traderAppraise uses isSpoiled', bt.includes('this.isSpoiled(it)'), 'missing');
    // source-level: pantry pushes that REBUILD from an existing item carry poisonRisk now
    const gm = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    const pushes = [...gm.matchAll(/\.pantry\.push\(\{[^}]*\}\)/g)].map(m => m[0]);
    const rebuilds = pushes.filter(p => /item\./.test(p));
    ok('SIB6. all rebuild pantry pushes carry poisonRisk', rebuilds.length > 0 && rebuilds.every(p => p.includes('poisonRisk')), `rebuilds=${rebuilds.length}`);
    ok('SIB7. downriver smoked fish has a spoilDay', gm.includes("spoilDay: this.state.scholar.day + 30, safe: true, unit: 'fish'"), 'missing');
  }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
