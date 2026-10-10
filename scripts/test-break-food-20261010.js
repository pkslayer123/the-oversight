#!/usr/bin/env node
// BREAK-IT: forager economy (2026-10-10). Hostile attacks on the food pipeline:
// pemmican batch consumption, the squirrel-gift nut bypass, decision-label
// honesty vs engine costs, and kcal conservation under hostile stack layouts.
//
// KILLS ATTEMPTED:
//   K1. EXPLOIT+CRASH: makePemmican consumes via STALE INDICES. The plan is
//       computed once (pemmicanPlan), then each set consumes by index and
//       SPLICES — so a set-1 splice shifts every later set's picks. With two
//       preserved-meat stacks (small one at a higher index), set 1 splices it
//       and pushes fresh pemmican; set 2 then eats the NEW pemmican as "meat",
//       consumes berries as "fat", and leaves real fat untouched — phantom
//       kcal + item destruction. (Or a TypeError when the stale index lands
//       past the array end.)
//   K2. HONESTY: the squirrel_friend gift branch pushes known hickory nuts as
//       {kcalEach: 100} with no foodKind/foodState/edible:false — the nuts
//       arrive SHELLED and edible, bypassing the in-shell rule the sweep
//       itself honors ("(in shell — shell them to eat)"). 200 free kcal per
//       proc, zero work, and the copy promises "+200 kcal" for unshelled nuts.
//   K3. HONESTY: howFarOptions' cook label hardcodes "32 ticks", but cookFood
//       charges cls.time — 40 ticks for monster meat. The decision label lies
//       about the cost on exactly the meat the player is most anxious about.
//   K4. INVARIANT: pemmicanSets/pemmicanPlan/pemmicanPreview agree; fuzz over
//       hostile multi-stack layouts asserts kcal conservation (out <= in),
//       no negative units, no unplanned consumption.
//
// Usage: node scripts/test-break-food-20261010.js
//        BEFORE=1 node scripts/test-break-food-20261010.js
//        SEED=99 node scripts/test-break-food-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

const PRE = ['src/js/food.js', 'src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bf10-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf10-before-${path.basename(f)}`, 'utf8')
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
function grantRender() {
  Game.state.codex.techniques = Game.state.codex.techniques || {};
  Game.state.codex.techniques.render = true;
}
function kcalTotal(inv) {
  return (inv || []).reduce((a, it) => a + (it ? (it.kcalEach || 0) * (it.units || 1) : 0), 0);
}
function pemmicanStacks(inv) {
  return (inv || []).filter(it => it && it.foodState === 'pemmican');
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ K1. makePemmican stale-index consumption ============
  console.log('\n-- K1. makePemmican: multi-set consumption must eat the planned items --');
  {
    const s = freshGame();
    grantRender();
    const day = s.day;
    // Hostile layout: two preserved-meat stacks; the SMALL one sits at a
    // HIGHER index so set 1 exhausts it -> splice -> set 2's indices go stale.
    s.inventory = [
      { name: 'Venison (smoked)', plantId: 'meat_deer', foodKind: 'meat', foodState: 'preserved', edible: true, units: 10, unit: 'portion', kcalEach: 400, spoilDay: day + 30, safe: true },
      { name: 'Venison (smoked)', plantId: 'meat_deer', foodKind: 'meat', foodState: 'preserved', edible: true, units: 1, unit: 'portion', kcalEach: 400, spoilDay: day + 30, safe: true },
      { name: 'Tallow (rendered)', plantId: 'fat_deer', foodKind: 'fat', foodState: 'rendered', edible: true, units: 2, unit: 'slab', kcalEach: 900, spoilDay: day + 90, safe: true },
      { name: 'Blackberries', plantId: 'blackberry', foodKind: 'plant', foodState: 'ready', edible: true, units: 4, unit: 'handful', kcalEach: 50, spoilDay: day + 2, safe: true },
    ];
    const inKcal = kcalTotal(s.inventory);
    const sets = Game.pemmicanSets(s.inventory);
    const plan = Game.pemmicanPlan(s.inventory);
    ok('K1a. hostile layout yields 2 planned sets', sets === 2 && plan.length === 2, `sets=${sets} plan=${plan.length}`);
    const expectBars = plan.reduce((a, p) => a + p.bars, 0);
    let threw = null;
    try { Game.makePemmican(); } catch (e) { threw = e; }
    ok('K1b. makePemmican does not throw', threw === null, threw && threw.message);
    const pem = pemmicanStacks(s.inventory);
    const outBars = pem.reduce((a, p) => a + (p.units || 0), 0);
    const outKcal = kcalTotal(pem);
    ok('K1c. planned bar count survives (set 2 must not eat set 1\'s bars)',
      outBars === expectBars, `expected ${expectBars} bars, got ${outBars}`);
    ok('K1d. energy never created (out <= ~98% of in)',
      outKcal <= inKcal * 0.98 + pem.length, `in=${inKcal} out=${outKcal}`);
    const fatLeft = s.inventory.filter(it => it.foodKind === 'fat' && it.foodState === 'rendered');
    ok('K1e. the planned rendered fat is actually consumed (not left behind)',
      fatLeft.length === 0, `fat stacks left: ${fatLeft.length}`);
    const negUnits = s.inventory.filter(it => it && (it.units || 0) < 0);
    ok('K1f. no phantom negative-unit stacks', negUnits.length === 0, `neg=${negUnits.length}`);
    const meatLeft = s.inventory.filter(it => it.foodKind === 'meat' && it.foodState === 'preserved');
    const meatUnitsLeft = meatLeft.reduce((a, it) => a + (it.units || 0), 0);
    ok('K1g. leftover preserved meat is honest (11u - 4u planned = 7u)',
      meatUnitsLeft === 7, `left=${meatUnitsLeft}`);
  }

  // ============ K2. squirrel-gift nuts: in-shell honesty ============
  console.log('\n-- K2. squirrel gift: known nuts must arrive in-shell, not edible --');
  {
    const s = freshGame();
    // Drive the REAL forage path. The world: one rich 9x9 patch of hickory.
    const t = Game.playerTile();
    t.type = 'forest'; t.stock = 100;
    s.mx = 4; s.my = 4;
    const detail = [];
    for (let y = 0; y < 9; y++) { detail.push([]); for (let x = 0; x < 9; x++) detail[y].push('plant'); }
    Game.genDetail = () => detail;
    Game.cellScorched = () => false;
    const nut = Game.data.plants.find(p => p.id === 'hickory_nut');
    Game.cellPlantSpecies = () => 'hickory_nut';
    Game.plantKnown = (pid) => pid === 'hickory_nut'; // the player KNOWS hickory
    const oModTarget = Game.modTarget.bind(Game);
    Game.modTarget = (k, d) => k === 'forage.gift_chance' ? 1 : oModTarget(k, d); // squirrel_friend: guaranteed
    try { Game.doAction('forage', { cx: 4, cy: 4 }); } catch (e) { console.log('  (forage drive threw: ' + e.message + ')'); }
    Game.modTarget = oModTarget;
    const gift = (s.inventory || []).find(it => it && it.name && it.name.startsWith('Squirrel gift (hickory nuts'));
    ok('K2a. the gift landed in the pack', !!gift, gift ? '' : 'no gift item found');
    if (gift) {
      ok('K2b. gift is a nut (foodKind nut)', gift.foodKind === 'nut', 'foodKind=' + gift.foodKind);
      ok('K2c. gift is in-shell (foodState in_shell)', gift.foodState === 'in_shell', 'foodState=' + gift.foodState);
      ok('K2d. gift is NOT edible yet', gift.edible === false, 'edible=' + gift.edible);
      ok('K2e. gift carries no free kcal (kcalEach 0, hiddenKcal 200)',
        gift.kcalEach === 0 && gift.hiddenKcal === (nut.caloriesPerUnit || 200),
        `kcalEach=${gift.kcalEach} hiddenKcal=${gift.hiddenKcal}`);
      const giftMsg = says.find(x => /squirrel/i.test(x) && /gift/i.test(x));
      ok('K2f. no "+200 kcal" promise on unshelled nuts', !(giftMsg && /\+\d+\s*kcal/.test(giftMsg)), giftMsg ? giftMsg.slice(0, 90) : 'no message');
    }
  }

  // ============ K3. howFarOptions cook label vs engine cost ============
  console.log('\n-- K3. decision label: cook ticks must match the engine --');
  {
    freshGame();
    const day = Game.state.scholar.day;
    const mkMeat = (pid, name) => ({
      name, plantId: pid, foodKind: 'meat', foodState: 'cleaned', edible: true,
      units: 2, unit: 'portion', kcalEach: 300, spoilDay: day + 2,
      diseaseRisk: { p: 0.35, dmg: 12, note: 'raw meat' },
    });
    const deerOpts = Game.howFarOptions(mkMeat('meat_deer', 'Venison (cleaned)'));
    const deerCook = deerOpts.find(o => o.id === 'cook');
    const deerTime = (Game.cookClassFor(mkMeat('meat_deer', 'x')) || {}).time || 32;
    ok('K3a. deer label matches engine (' + deerTime + ' ticks)',
      deerCook && deerCook.detail.includes(deerTime + ' ticks'), deerCook && deerCook.detail);
    const monOpts = Game.howFarOptions(mkMeat('meat_hushwolf', 'Hushwolf (cleaned)'));
    const monCook = monOpts.find(o => o.id === 'cook');
    const monTime = (Game.cookClassFor(mkMeat('meat_hushwolf', 'x')) || {}).time || 32;
    ok('K3b. monster-meat label matches engine (' + monTime + ' ticks, not 32)',
      monCook && monCook.detail.includes(monTime + ' ticks'), monCook && monCook.detail);
  }

  // ============ K4. sets/plan/preview agreement + conservation fuzz ============
  console.log('\n-- K4. pemmican plan agreement + conservation fuzz --');
  {
    const rng = mulberry32(SEED ^ 0x5eed);
    let worst = 0, bad = 0;
    for (let trial = 0; trial < 60; trial++) {
      const s = freshGame();
      grantRender();
      says.length = 0;
      Game.say = () => {};
      const day = s.day;
      // hostile: 1-4 meat stacks with ragged unit counts, 1-3 fat, 1-3 berry stacks
      const inv = [];
      const nMeat = 1 + Math.floor(rng() * 4);
      for (let i = 0; i < nMeat; i++) {
        const u = 1 + Math.floor(rng() * 6);
        inv.push({ name: 'M (smoked)', plantId: 'meat_deer', foodKind: 'meat', foodState: 'preserved', edible: true, units: u, unit: 'portion', kcalEach: 200 + Math.floor(rng() * 400), spoilDay: day + 30, safe: true });
      }
      const nFat = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < nFat; i++) {
        const u = 1 + Math.floor(rng() * 3);
        inv.push({ name: 'F (rendered)', plantId: 'fat_deer', foodKind: 'fat', foodState: 'rendered', edible: true, units: u, unit: 'slab', kcalEach: 700 + Math.floor(rng() * 400), spoilDay: day + 90, safe: true });
      }
      const nBer = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < nBer; i++) {
        const u = 1 + Math.floor(rng() * 5);
        inv.push({ name: 'B', plantId: 'blackberry', foodKind: 'plant', foodState: 'ready', edible: true, units: u, unit: 'handful', kcalEach: 30 + Math.floor(rng() * 40), spoilDay: day + 2, safe: true });
      }
      // a decoy stack the plan must never touch: cooked meat is NOT a valid
      // pemmican ingredient (MEAT pred needs foodState 'preserved'), so any
      // disturbance proves consumption is hitting unplanned items.
      inv.push({ name: 'Cooked venison (precious)', plantId: 'meat_deer', foodKind: 'meat', foodState: 'cooked', edible: true, units: 9, unit: 'portion', kcalEach: 333, spoilDay: day + 5, safe: true, decoy: true });
      // shuffle
      for (let i = inv.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [inv[i], inv[j]] = [inv[j], inv[i]]; }
      s.inventory = inv;
      const inKcal = kcalTotal(inv);
      const sets = Game.pemmicanSets(inv);
      const plan = Game.pemmicanPlan(inv);
      const prev = Game.pemmicanPreview(inv);
      if (plan.length !== sets || prev.sets !== sets || prev.bars !== plan.reduce((a, p) => a + p.bars, 0)) {
        bad++; console.log(`  trial ${trial}: sets/plan/preview disagree (sets=${sets} plan=${plan.length} prev=${prev.sets}/${prev.bars})`);
        continue;
      }
      let threw = null;
      try { Game.makePemmican(); } catch (e) { threw = e; }
      if (threw) { bad++; console.log(`  trial ${trial}: THREW ${threw.message}`); continue; }
      const outKcal = kcalTotal(s.inventory);
      const ratio = inKcal > 0 ? outKcal / inKcal : 1;
      worst = Math.max(worst, ratio);
      if (ratio > 1.02) { bad++; console.log(`  trial ${trial}: ENERGY CREATED ratio=${ratio.toFixed(3)} in=${inKcal} out=${outKcal}`); }
      const neg = s.inventory.filter(it => it && (it.units || 0) <= 0);
      if (neg.length) { bad++; console.log(`  trial ${trial}: ${neg.length} zero/negative-unit stacks left`); }
      const decoy = s.inventory.find(it => it && it.decoy);
      if (!decoy || decoy.units !== 9) { bad++; console.log(`  trial ${trial}: decoy stack disturbed (units=${decoy && decoy.units})`); }
      Game.say = (t) => { says.push(String(t)); return osay(t); };
    }
    Game.say = (t) => { says.push(String(t)); return osay(t); };
    ok('K4a. 60 hostile layouts: no throw, no disagreement, no energy created', bad === 0, `bad=${bad} worstRatio=${worst.toFixed(3)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
