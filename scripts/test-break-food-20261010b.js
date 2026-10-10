#!/usr/bin/env node
// BREAK-IT: food economy, round 2 (2026-10-10). Hostile attacks on vectors the
// 2026-10-10 forager run did NOT cover:
//
// T1. EXPLOIT: parasiteRisk (trichinosis) laundering. Bear/boar/javelina meat
//     carries parasiteRisk {trichinosis} until cooked through — canon: only
//     a real cooking kills it (smoking doesn't, the pantry doesn't, the
//     earth doesn't). Every subset-push that rebuilds a food stack dropped
//     the field: donate->take, putAwayFinished (pantryAdd), bury->dig-up,
//     both takenStacks, the light-fingers lift, the homecoming/exile pantry
//     pools. And stacksMatch never compared it, so wormy merged into clean.
//     Net effect: clean bear carcass -> donate -> take -> eat RAW with zero
//     worm roll. Same toxin-laundering class as F1 (2026-10-09), new field.
// T2. HONESTY (K3 class): whoOptions' cook detail hardcoded '32 ticks' — the
//     engine charges the class time (monster 40, tuber 40, grain/legume 48,
//     fruit/greens 12). Unwired from the UI today (only 'butcher' renders),
//     but the copy must be true if it ever gets wired.
// D2. DEAD-CODE: every food.js @ontology "provides" entry is referenced at a
//     call site (static, whole src/js tree).
//
// Usage: node scripts/test-break-food-20261010b.js
//        BEFORE=1 node scripts/test-break-food-20261010b.js
//        SEED=99 node scripts/test-break-food-20261010b.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

const PRE = ['src/js/food.js', 'src/js/game.js', 'src/js/storage.js', 'src/js/abilityActions.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bf10b-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf10b-before-${path.basename(f)}`, 'utf8')
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
// Real pipeline: black bear carcass -> cleaned meat (carries trichinosis).
function bearMeat(day) {
  const bear = (Game.data.animals || []).find(a => a.id === 'black_bear');
  const carc = Game.foodCarcass(bear, 2000, day, 'hunted'); // light: keeps the dig-up under carry weight
  const inv = [carc];
  Game.carcassToMeat(inv, 0, true);
  return inv.find(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ T1. parasiteRisk laundering ============
  console.log('\n-- T1. trichinosis must survive every storage round-trip --');
  {
    const s = freshGame();
    const day = s.day;
    const meat = bearMeat(day);
    ok('T1a. the real butchering pipeline attaches the worms',
      !!(meat && meat.parasiteRisk && meat.parasiteRisk.id === 'trichinosis' && meat.parasiteRisk.p === 0.35),
      meat ? JSON.stringify(meat.parasiteRisk) : 'no meat');
    // ditch the heavy hide/bone/fat so the take-back isn't weight-refused
    s.inventory = [meat];
    Game.donateToPantry(0);
    const p = Game.state.village.pantry[Game.state.village.pantry.length - 1];
    ok('T1b. donate keeps the worms in the pantry',
      !!(p && p.parasiteRisk && p.parasiteRisk.id === 'trichinosis'), p ? JSON.stringify(p.parasiteRisk) : 'no pantry stack');
    Game.takeFromPantry(Game.state.village.pantry.length - 1);
    const back = s.inventory.find(i => i.foodKind === 'meat');
    ok('T1c. take-back does NOT wash the worms',
      !!(back && back.parasiteRisk && back.parasiteRisk.id === 'trichinosis'),
      back ? 'parasiteRisk=' + JSON.stringify(back.parasiteRisk) : 'stack missing');
    // merge gate: wormy must never merge into clean
    if (back) {
      const clean = Object.assign({}, back); delete clean.parasiteRisk;
      ok('T1d. stacksMatch keeps wormy and clean apart', Game.stacksMatch(back, clean) === false,
        'matched=' + Game.stacksMatch(back, clean));
      const wormy2 = Object.assign({}, back);
      ok('T1e. stacksMatch still merges wormy into wormy', Game.stacksMatch(back, wormy2) === true);
    }
    // the payoff: eating the round-tripped meat RAW must still roll the worms
    if (back && back.parasiteRisk) {
      const contracted = [];
      const ocd = Game.contractDisease.bind(Game);
      Game.contractDisease = (id, opts) => { contracted.push(id); };
      const orr = Math.random; Math.random = () => 0.0; // force every roll to fire
      s.health = 100;
      try { Game.eatOne(s.inventory.indexOf(back)); } catch (e) { console.log('  (eatOne threw: ' + e.message + ')'); }
      Math.random = orr;
      Game.contractDisease = ocd;
      ok('T1f. eating laundered raw bear still risks trichinosis',
        contracted.includes('trichinosis'), 'contracted=' + JSON.stringify(contracted));
    } else {
      ok('T1f. eating laundered raw bear still risks trichinosis', false, 'no wormy stack to eat (see T1c)');
    }
  }
  // putAwayFinished (pantryAdd) path — undercooked bear: finished, still wormy
  {
    const s = freshGame();
    const day = s.day;
    Game.nearFire = () => true;
    const meat = bearMeat(day);
    s.inventory = [meat];
    const oco = Game.cookOutcome;
    Game.cookOutcome = () => ({ key: 'undercooked', mult: 0.7, riskStays: true });
    Game.cookFood(0);
    Game.cookOutcome = oco;
    const uw = s.inventory[0];
    const wormy = !!(uw && uw.foodState === 'cooked' && uw.undercooked && uw.parasiteRisk);
    ok('T1g. undercooked bear is finished food, still wormy', wormy,
      uw ? `state=${uw.foodState} undercooked=${uw.undercooked} pz=${JSON.stringify(uw.parasiteRisk)}` : 'no item');
    if (wormy) {
      Game.prepStash().length = 0;
      Game.prepStash().push(uw);
      s.inventory = [];
      Game.putAwayFinished();
      const p = Game.state.village.pantry[Game.state.village.pantry.length - 1];
      ok('T1h. pantryAdd (put-away) does NOT wash the worms',
        !!(p && p.parasiteRisk && p.parasiteRisk.id === 'trichinosis'),
        p ? 'parasiteRisk=' + JSON.stringify(p.parasiteRisk) + ' name=' + p.name : 'no pantry stack');
    }
  }
  // buryCache -> digUpCache path
  {
    const s = freshGame();
    const day = s.day;
    const meat = bearMeat(day);
    s.inventory = [meat];
    Game.buryCache('food', 0, 1);
    const c = Game.playerCaches()[Game.playerCaches().length - 1];
    ok('T1i. cache created', !!c && c.items.length === 1);
    const buried = c && c.items[0];
    ok('T1j. the earth does not cure worms (buried stack keeps risk)',
      !!(buried && buried.parasiteRisk && buried.parasiteRisk.id === 'trichinosis'),
      buried ? JSON.stringify(buried.parasiteRisk) : 'no buried stack');
    // the buried risk object must be a COPY — a partial bury leaves a pack
    // stack behind, and the two must not alias (mutating one must not move
    // the other).
    {
      const packLeft = s.inventory.find(i => i.foodKind === 'meat');
      const hasBuried = !!(buried && buried.parasiteRisk);
      const aliased = hasBuried && !!(packLeft && packLeft.parasiteRisk === buried.parasiteRisk);
      ok('T1k. buried risk is a copy, not an alias of the pack stack',
        hasBuried && !aliased,
        'buried=' + JSON.stringify(buried && buried.parasiteRisk) + ' aliased=' + aliased);
    }
    Game.digUpCache(c.id);
    // Second burial: the FULL remaining stack, so the dig-up result is
    // unambiguous (no pack leftover for a merge to hide behind). In BEFORE
    // mode the merge-laundering masked the wash: the clean dug units were
    // absorbed into the wormy leftover.
    const rest = s.inventory.find(i => i.foodKind === 'meat' && /Black Bear/.test(i.name || ''));
    const restIdx = s.inventory.indexOf(rest);
    Game.buryCache('food', restIdx, rest.units);
    const c2 = Game.playerCaches()[Game.playerCaches().length - 1];
    const buried2 = c2 && c2.items[0];
    ok('T1m. full burial keeps the worms',
      !!(buried2 && buried2.parasiteRisk && buried2.parasiteRisk.id === 'trichinosis'),
      buried2 ? JSON.stringify(buried2.parasiteRisk) : 'no buried stack');
    Game.digUpCache(c2.id);
    // HONEST INVARIANT: no worm-free bear meat may exist after the dig-up.
    const meats = s.inventory.filter(i => i.foodKind === 'meat' && /Black Bear/.test(i.name || ''));
    const allWormy = meats.length > 0 && meats.every(i => i.parasiteRisk && i.parasiteRisk.id === 'trichinosis');
    ok('T1l. dig-up does NOT wash the worms', allWormy,
      meats.map(i => `${i.units}u:pz=${JSON.stringify(i.parasiteRisk)}`).join(' | ') || 'no meat stacks');
  }

  // ============ T2. whoOptions cook ticks vs engine ============
  console.log('\n-- T2. delegation labels must name the engine\'s real tick cost --');
  {
    const s = freshGame();
    const day = s.day;
    const mkCleaned = (pid, name) => ({
      name, plantId: pid, foodKind: 'meat', foodState: 'cleaned', edible: true,
      units: 2, unit: 'portion', kcalEach: 300, spoilDay: day + 2, prep: 'x',
    });
    const deer = Game.whoOptions(mkCleaned('meat_white_tailed_deer', 'Venison (cleaned)'), 'cook')
      .find(o => o.id === 'you');
    ok('T2a. deer cook label says 32 ticks', !!deer && /32 ticks/.test(deer.detail), deer && deer.detail);
    const wolf = Game.whoOptions(mkCleaned('meat_hushwolf', 'Hushwolf (cleaned)'), 'cook')
      .find(o => o.id === 'you');
    ok('T2b. monster-meat cook label says 40 ticks, not 32', !!wolf && /40 ticks/.test(wolf.detail), wolf && wolf.detail);
    const beans = {
      name: 'Dried beans', plantId: 'bean_x', foodKind: 'plant', foodState: 'ready',
      edible: true, units: 4, unit: 'scoop', kcalEach: 150, rawKcal: 150, spoilDay: 9999,
      needsCooking: true, diseaseRisk: { p: 0.25, dmg: 8, note: 'raw' }, prep: 'x',
    };
    const beanOpt = Game.whoOptions(beans, 'cook').find(o => o.id === 'you');
    ok('T2c. grain/legume cook label says 48 ticks', !!beanOpt && /48 ticks/.test(beanOpt.detail), beanOpt && beanOpt.detail);
    const smoke = Game.whoOptions(mkCleaned('meat_white_tailed_deer', 'Venison (cleaned)'), 'preserver')
      .find(o => o.id === 'you');
    ok('T2d. smoke label still says 16 ticks', !!smoke && /16 ticks/.test(smoke.detail), smoke && smoke.detail);
    // engine cross-check: the label must equal what cookFood actually charges
    Game.nearFire = () => true;
    const charged = [];
    const otick = Game.tickAction.bind(Game);
    Game.tickAction = (n) => { charged.push(n); return otick(n); };
    s.inventory = [mkCleaned('meat_hushwolf', 'Hushwolf (cleaned)')];
    Game.cookFood(0);
    s.inventory = [mkCleaned('meat_white_tailed_deer', 'Venison (cleaned)')];
    Game.cookFood(0);
    Game.tickAction = otick;
    delete Game.nearFire;
    ok('T2e. engine charges what the labels say (40 monster, 32 deer)',
      charged[0] === 40 && charged[1] === 32, 'charged=' + JSON.stringify(charged));
  }

  // ============ D2. dead-code: food.js provides all referenced ============
  console.log('\n-- D2. every food.js provided function has a call site --');
  {
    const head = fs.readFileSync(path.join(ROOT, 'src/js/food.js'), 'utf8').split('/* FOOD REALITY')[0];
    const provides = [...head.matchAll(/^\/\/\s+-\s+([A-Za-z_$][\w$]*)\(\)/gm)].map(m => m[1]);
    const all = FILES.map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
    const dead = [];
    for (const name of provides) {
      // definition forms: `name(` method shorthand, `G.name = function`
      const calls = (all.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;
      if (calls < 2) dead.push(`${name} (${calls} occurrence)`);
    }
    ok(`D2. ${provides.length} provided, none orphaned`, dead.length === 0, dead.join('; '));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
