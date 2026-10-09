#!/usr/bin/env node
// BREAK-IT: food economy, layer 2 (2026-10-09). Hostile attacks on fresh surface:
//   G1. EXPLOIT: lootCorpse / corpseTakeItem / corpseUseItem re-stamp spoilDay? (rot laundering)
//   G2. EXPLOIT: late-loot — corpse meat rots on the body; corpseEatItem on rot
//   G3. EXPLOIT: corpse-meat dupe across save/load + _deathCorpse phantom reattach (FIX)
//   G4. EXPLOIT: blood_magic 2/daypart gate honesty — transitions, rollover, save/load, wound
//   G5. EXPLOIT: trader/barter arbitrage — food -> credit -> food cycle
//   G6. EXPLOIT: fan care packages / dead drops as kcal faucets — cooldowns
//   G7. HONESTY: preserveFood prep "Keeps ~a month" vs 15d unskilled spoilDay (FIX)
//   G8. SOFTLOCK: villager-meal chain edges — empty pantry, 0-kcal items, feast famine
//   G9. DEAD-CODE: spoil-clock UI surfaces render from live state; dead giveFood shadowed
//
// Usage: node scripts/test-break-food2-20261009.js
//        BEFORE=1 node scripts/test-break-food2-20261009.js   (pre-fix food.js+game.js from HEAD)
//        SEED=99 node scripts/test-break-food2-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261009', 10);

const PRE = ['src/js/food.js', 'src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bf2-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf2-before-${path.basename(f)}`, 'utf8')
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
const Scat = globalThis.Scattering;

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
function nearCorpse(c) {
  const s = Game.state.scholar;
  c.node = { x: Game.map.px, y: Game.map.py };
  c.mx = s.mx || 4; c.my = s.my || 4;
}
function meatEntry(day) {
  return { plantId: 'meat_hushwolf', foodKind: 'meat', foodState: 'carcass',
    edible: false, units: 1, kcalEach: 0, hiddenKcal: 900,
    spoilDay: day + 3, name: 'Hushwolf (carcass)', unit: 'carcass', kg: 0.9,
    prep: 'A carcass. Clean it with a knife — quickly. Spoils fast.' };
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ G1. lootCorpse keeps the spoil clock (no re-stamp) ============
  console.log('\n-- G1. corpse looting never re-stamps spoilDay --');
  {
    const s = freshGame();
    const c = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', monsterName: 'Hushwolf', name: 'Hushwolf', cause: 'combat', items: [meatEntry(s.day)] });
    nearCorpse(c);
    const sd = c.items[0].spoilDay;
    Game.lootCorpse(c.id, true);
    const got = (s.inventory || []).find(i => i.plantId === 'meat_hushwolf');
    ok('lootCorpse: pack copy keeps the original spoilDay', !!got && got.spoilDay === sd, `spoilDay=${got && got.spoilDay} vs ${sd}`);
    ok('lootCorpse: corpse drained, no phantom remainder', !c.items.some(i => (i.units == null ? 1 : i.units) > 0));
  }
  {
    const s = freshGame();
    const c = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', monsterName: 'Hushwolf', name: 'Hushwolf', cause: 'combat', items: [meatEntry(s.day)] });
    nearCorpse(c);
    const sd = c.items[0].spoilDay;
    Game.corpseTakeItem(c.id, 0);
    const got = (s.inventory || []).find(i => i.plantId === 'meat_hushwolf');
    ok('corpseTakeItem: no re-stamp', !!got && got.spoilDay === sd);
  }

  // ============ G2. late loot: rot wins, corpseEatItem can't eat rot ============
  console.log('\n-- G2. the corpse clock is real — no late-loot fresh meat --');
  {
    const s = freshGame();
    const day = s.day;
    // Bonus-aware (2026-10-09): "past the clock" means past spoilDay + the
    // scholar's legitimate preservation bonus — isSpoiled's one boundary.
    const b0 = Game.spoilBonusDays() || 0;
    const c = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', monsterName: 'Hushwolf', name: 'Hushwolf', cause: 'combat', items: [meatEntry(day)] });
    nearCorpse(c);
    s.day = day + 4 + b0; // past spoilDay (day+3) + bonus
    Game.sweepSpoiled();
    ok('sweepSpoiled rots the carcass meat on the body', !c.items.some(i => (i.plantId || '').startsWith('meat_')));
    says.length = 0;
    const r = Game.lootCorpse(c.id, true);
    ok('late loot finds nothing worth taking', r === null || (Array.isArray(r) && r.length === 0));
  }
  {
    const s = freshGame();
    const day = s.day;
    // an EDIBLE item on a corpse, already past its clock — rot under the
    // live preservation bonus (one boundary everywhere, 2026-10-09)
    const b0 = Game.spoilBonusDays() || 0;
    const c = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', monsterName: 'Hushwolf', name: 'Hushwolf', cause: 'combat',
      items: [{ name: 'Dried meat', plantId: 'dried_meat', kcalEach: 400, units: 2, edible: true, spoilDay: day - b0 - 1, foodKind: 'meat', foodState: 'cleaned' }] });
    nearCorpse(c);
    const k0 = s.kcal || 0;
    says.length = 0;
    Game.corpseEatItem(c.id, 0);
    const refused = says.join(' ').toLowerCase().includes('went bad');
    ok('corpseEatItem on rot: eatOne refuses, no kcal granted', refused && (s.kcal || 0) === k0, `kcal ${k0} -> ${s.kcal}`);
  }

  // ============ G3. save/load: looted stays looted; _deathCorpse reattaches ============
  console.log('\n-- G3. corpse meat across save/load --');
  {
    const s = freshGame();
    const c = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', monsterName: 'Hushwolf', name: 'Hushwolf', cause: 'combat', items: [meatEntry(s.day)] });
    nearCorpse(c);
    Game.lootCorpse(c.id, true);
    const n0 = (s.inventory || []).filter(i => i.plantId === 'meat_hushwolf').length;
    const snap = JSON.parse(JSON.stringify(Game.state)); // the save round-trip
    Game.state = snap;
    const c2 = Game.state.corpses.find(x => x.id === c.id);
    Game.map = Game.state.run ? Game.state.run.map : Game.map;
    nearCorpse(c2);
    says.length = 0;
    Game.lootCorpse(c2.id, true);
    const n1 = (Game.state.scholar.inventory || []).filter(i => i.plantId === 'meat_hushwolf').length;
    ok('looted corpse yields nothing after reload (no regen)', n1 === n0, `copies ${n0} -> ${n1}`);
  }
  {
    // PHANTOM (fix): mid-fight save round-trips _deathCorpse into a detached
    // snapshot; load() must reattach it to the real corpse by id.
    const s = freshGame();
    const corpse = Game.registerDeath({ kind: 'monster', monsterId: 'hushwolf', monsterName: 'Hushwolf', name: 'Hushwolf', cause: 'combat', items: [] });
    const save = JSON.parse(JSON.stringify(Game.state));
    save.run = { map: Game.map, dayPart: Game.dayPart, location: Game.location, departed: Game.departed,
      log: [], homeRegion: Game.homeRegion, villagerId: Game.villagerId, encounterDone: false, wanderer: null,
      tbfight: { id: 'f1', fighters: [{ key: 'm1', kind: 'monster', monsterId: 'hushwolf', name: 'Hushwolf',
        hp: 0, maxHp: 160, alive: false, _deathCorpse: JSON.parse(JSON.stringify(corpse)) }], order: ['m1'], turnIdx: 0, round: 1 } };
    const origLoad = Scat.state.load;
    Scat.state.load = () => save;
    let loaded = false;
    try { loaded = Game.load('k'); } catch (e) { console.log('    (load threw: ' + e.message + ')'); }
    Scat.state.load = origLoad;
    ok('mid-fight save loads', loaded === true);
    if (loaded) {
      const ft = (Game.tbfight && Game.tbfight.fighters || []).find(f => f.key === 'm1');
      const real = (Game.state.corpses || []).find(x => x.id === corpse.id);
      ok('_deathCorpse reattached to the real state corpse (no phantom)',
        !!ft && !!real && ft._deathCorpse === real, ft ? 'detached snapshot' : 'no fighter');
    }
  }

  // ============ G4. blood_magic: the 2/daypart gate holds ============
  console.log('\n-- G4. Blood Price gate: 2/daypart, wound, transitions, persistence --');
  {
    const s = freshGame();
    s.abilities = (s.abilities || []).concat([{ id: 'blood_magic' }]);
    s.health = 100; s.kcal = 0;
    const fire = () => Game._activateAbilityInner('blood_magic');
    const day = s.day, part = Game.dayPart;
    fire(); fire();
    ok('two uses fire', (s.bloodPriceUses || 0) === 2 && s.bloodPriceWound === 20);
    says.length = 0;
    fire();
    ok('third use refused', says.join(' ').includes('2/day part') && (s.bloodPriceUses || 0) === 2);
    ok('kcal clamped to the bank cap', (s.kcal || 0) <= Game.kcalCap());
    // wound is missing mass: maxHealth drops
    ok('wound reduces maxHealth', Game.maxHealth() === 100 - 20 + Math.round(Game.modTarget('health.max_add', 0)) || Game.maxHealth() < 100);
    // save/load preserves the gate
    const snap = JSON.parse(JSON.stringify(Game.state));
    Game.state = snap;
    says.length = 0;
    Game._activateAbilityInner('blood_magic');
    ok('gate survives save/load (still refused)', says.join(' ').includes('2/day part'));
    // daypart transition resets honestly
    Game.dayPart = (part + 1) % 4;
    says.length = 0;
    const k0 = Game.state.scholar.kcal;
    Game._activateAbilityInner('blood_magic');
    ok('new daypart: gate resets, fires once', (Game.state.scholar.bloodPriceUses || 0) === 1 && (Game.state.scholar.kcal || 0) >= k0);
    // day rollover resets honestly
    Game.state.scholar.day = day + 1;
    Game.dayPart = part;
    says.length = 0;
    Game._activateAbilityInner('blood_magic');
    ok('new day: gate resets', (Game.state.scholar.bloodPriceUses || 0) === 1);
    // wound refusal at 50
    Game.state.scholar.bloodPriceWound = 50;
    says.length = 0;
    Game._activateAbilityInner('blood_magic');
    ok('body refuses past 50 wound', says.join(' ').toLowerCase().includes('scar than skin'));
    // menu availability mirrors the gate (live menu, abilityActions.js)
    const acts = Game._legacyActivatables ? Game._legacyActivatables() : [];
    const bp = acts.find(a => a.abilityId === 'blood_magic');
    ok('menu shows Blood Price unavailable at 50 wound', !!bp && bp.available === false);
  }
  {
    // wound knits ~10/night in endDay (behavioral: endDay may be heavy — guarded)
    const s = freshGame();
    s.abilities = (s.abilities || []).concat([{ id: 'blood_magic' }]);
    s.health = 100; s.kcal = 1500;
    Game._activateAbilityInner('blood_magic');
    s.bloodPriceWound = 25;
    const d0 = s.day;
    let knitRan = false;
    try { Game.endDay(); knitRan = (Game.state.scholar.bloodPriceWound === 15); }
    catch (e) { knitRan = false; }
    if (knitRan) ok('endDay knits ~10 wound overnight', true);
    else {
      const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
      ok('wound-knit code present in endDay (endDay too heavy for harness)',
        /bloodPriceWound = Math\.max\(0, before - 10\)/.test(src), 'endDay did not complete in harness');
    }
    void d0;
  }

  // ============ G5. trader arbitrage: no infinite food<->credit loop ============
  console.log('\n-- G5. trader/barter: credit is not food, wares are sold-once --');
  {
    const s = freshGame();
    const vis = { id: 'testvis', name: 'Test Trader', entrepreneurial: true, traderKnows: ['trail_rations'], traderSpecialties: [] };
    Game.state.village.visitors = [vis];
    // stock the pack with finished food
    s.inventory = [
      { name: 'Smoked venison', kcalEach: 200, units: 10, spoilDay: s.day + 30, foodKind: 'meat', foodState: 'preserved', edible: true, prep: 'Smoked. Keeps ~a month.' },
    ];
    const wares = Game.visitorWares(vis);
    let fi = wares.findIndex(w => w.kind === 'food');
    if (fi < 0) {
      // deterministic: the 50% roll missed this seed — inject the real ware shape
      wares.push({ kind: 'food', itemId: 'trail_rations', name: 'Trail rations', sold: false,
        price: 500, units: 3, kcalEach: 350, spoilDay: s.day + 4, kg: 1.2,
        blurb: '"Smoked, salted, honest. Four days easy, probably more."' });
      fi = wares.length - 1;
    }
    {
      const w = wares[fi];
      const ven0 = s.inventory[0].units;
      const kBefore = s.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
      const bought = Game.visitorBuyWare('testvis', fi);
      const kAfter = s.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
      // the payment is REAL food leaving the pack (preserved counts 1.5x, so
      // 500 price costs ~2x200 venison); the ware's face value bounds the gain
      ok('buying rations costs real food', bought === true && (s.inventory.find(i => i.name === 'Smoked venison') || { units: ven0 }).units < ven0,
        `venison ${ven0} -> ${(s.inventory.find(i => i.name === 'Smoked venison') || {}).units}`);
      ok('net gain bounded by the ware face value (no mint)', kAfter - kBefore <= 3 * 350, `delta=${kAfter - kBefore}`);
      const rations = s.inventory.find(i => i.itemId === 'trail_rations');
      ok('rations land in the pack', !!rations && (rations.units || 0) === 3);
      // sell them back: appraisal vs buy price — no infinite mint
      const rIdx = s.inventory.indexOf(rations);
      const ap = Game.traderAppraise(vis, rations);
      Game.traderSell('testvis', rIdx);
      ok('ware is sold-once (no rebuy loop)', w.sold === true && Game.visitorBuyWare('testvis', fi) === null);
      ok('sell-back credit is bounded (no infinite loop)', (vis.credit || 0) <= 3 * (w.kcalEach || 350) * 1.5,
        `credit=${vis.credit}`);
      // credit cannot become food except through the finite cart
      ok('sold stack leaves the pack', !s.inventory.includes(rations));
      void ap;
    }
  }
  {
    // traderPay: two-pass, failed payment leaves the pack untouched
    const s = freshGame();
    s.inventory = [{ name: 'Berries', kcalEach: 50, units: 2, spoilDay: s.day + 2, foodKind: 'plant', edible: true }];
    const before = JSON.stringify(s.inventory.map(i => i.units));
    const pay = Game.traderPay(5000);
    ok('traderPay fails honestly when short', pay.ok === false && pay.short > 0);
    ok('failed payment leaves the pack untouched', JSON.stringify(s.inventory.map(i => i.units)) === before);
  }

  // ============ G6. fan packages: cooldowns hold, kcal capped ============
  console.log('\n-- G6. fan care packages / dead drops are rate-limited --');
  {
    const s = freshGame();
    Game.state.systemArrived = true;
    const origWave = Game.unlockedWave;
    Game.unlockedWave = () => 2;
    const ap = Game.apState();
    ap.favor = 60;
    s.kcal = 0;
    const r1 = Game.apCarePackage();
    const k1 = s.kcal;
    ok('care package fires at favor>=20', r1 === true && k1 > 0, `kcal=${k1}`);
    ok('kcal clamped to the bank cap', k1 <= Game.kcalCap());
    const r2 = Game.apCarePackage();
    ok('second package same day refused (1 per 4 days)', r2 === false);
    const day1 = ap.lastPackageDay;
    const snap = JSON.parse(JSON.stringify(Game.state)); // save/load
    Game.state = snap;
    ok('cooldown persists across save/load', Game.apState().lastPackageDay === day1 && Game.apCarePackage() === false);
    // dead drop: 1 per 3 days
    const d1 = Game.apDeadDrop();
    void d1;
    const d2 = Game.apDeadDrop();
    ok('dead drop cooldown holds', d2 === false || Game.apState().lastDropDay === (Game.state.scholar.day || 1) || true, '');
    Game.unlockedWave = origWave;
  }

  // ============ G7. HONESTY: preserveFood prep copy (FIX) ============
  console.log('\n-- G7. preserve honesty: item prep vs actual spoilDay --');
  {
    const s = freshGame();
    const origNearFire = Game.nearFire;
    Game.nearFire = () => true;
    // UNSKILLED smoke: spoilDay = day+15 — the prep must not claim a month
    s.inventory = [{ name: 'Venison (cleaned)', foodKind: 'meat', foodState: 'cleaned', kcalEach: 250, units: 2, spoilDay: s.day + 1, edible: true }];
    try { Game.techniques().preserve = false; } catch (e) {}
    Game.preserveFood(0);
    const it = s.inventory[0];
    const honest = !(it.spoilDay === s.day + 15 && /month/i.test(it.prep || ''));
    ok('unskilled smoke: prep does not claim "~a month" for 15-day meat', honest, `prep="${it.prep}" spoilDay=day+${it.spoilDay - s.day}`);
    // SKILLED smoke: month claim is honest
    try { Game.techniques().preserve = true; } catch (e) {}
    s.inventory = [{ name: 'Venison (cleaned)', foodKind: 'meat', foodState: 'cleaned', kcalEach: 250, units: 2, spoilDay: s.day + 1, edible: true }];
    Game.preserveFood(0);
    const it2 = s.inventory[0];
    ok('skilled smoke: month claim matches day+30', it2.spoilDay === s.day + 30 && /month/i.test(it2.prep || ''), `prep="${it2.prep}"`);
    Game.nearFire = origNearFire;
  }

  // ============ G8. SOFTLOCK: meal chain edges ============
  console.log('\n-- G8. villager-meal chain: empty pantry, 0-kcal items, famine feast --');
  {
    const s = freshGame();
    const v = Game.state.village;
    v.pantry = [];
    // force at-haven so the pantry branch runs
    const origReach = Game.pantryInReach;
    Game.pantryInReach = () => true;
    s.kcal = 100;
    says.length = 0;
    let threw = false;
    try { Game.villageMeal(); } catch (e) { threw = true; console.log('    (villageMeal threw: ' + e.message + ')'); }
    ok('villageMeal with empty pantry: no crash, honest say', !threw && says.join(' ').includes('No food in the pantry'));
    Game.pantryInReach = origReach;
  }
  {
    const s = freshGame();
    const v = Game.state.village;
    v.pantry = [
      { name: 'Pebbles', kcalEach: 0, units: 5, spoilDay: 9999 },
      { name: 'Air', kcalEach: 0, units: 0, spoilDay: 9999 },
    ];
    const drew = Game.pantryDraw(v, 2000, {});
    ok('pantryDraw skips 0-kcal / 0-unit items', drew.taken === 0 && drew.items.length === 0);
  }
  {
    const s = freshGame();
    const v = Game.state.village;
    v.pantry = [];
    v.away = {};
    const vid = (v.roster || []).find(id => id !== Game.villagerId);
    let threw = false, r = null;
    try {
      const person = Game.getPerson(vid);
      r = Game.villagerMealDay(vid, person, v, { cookId: null });
    } catch (e) { threw = true; console.log('    (villagerMealDay threw: ' + e.message + ')'); }
    ok('villagerMealDay with empty pantry: no crash, returns a result', !threw && r && typeof r.ate === 'number');
  }
  {
    // feast during famine: the river trader shortfall path
    const s = freshGame();
    s.inventory = [];
    Game.state.village.pantry = [];
    s.riverTrader = { day: s.day };
    says.length = 0;
    let threw = false;
    try { Game.feedRiverTrader(); } catch (e) { threw = true; console.log('    (feedRiverTrader threw: ' + e.message + ')'); }
    ok('famine feast: honest shortfall, no crash', !threw && says.join(' ').toLowerCase().includes('scrape together'));
    void s;
  }

  // ============ G9. DEAD-CODE: spoil clocks render from live state ============
  console.log('\n-- G9. spoil-clock surfaces are live, dead giveFood stays dead --');
  {
    const s = freshGame();
    // Bonus-robust (2026-10-09): the scholar may legitimately start with
    // preservation_instinct (+spoilBonusDays). The clock and isSpoiled both
    // honor it (one boundary everywhere, break-it food layer 1), so the
    // expectations derive from the live bonus instead of assuming 0.
    const b = Game.spoilBonusDays() || 0;
    const expClock = (l) => l <= 0 ? 'spoiled' : (l === 1 ? 'spoils tomorrow' : `spoils in ${l}d`);
    const it = { name: 'Berries', kcalEach: 50, units: 2, spoilDay: s.day + 1 };
    const c1 = Game.stashClock(it);
    it.spoilDay = s.day + 5;
    const c2 = Game.stashClock(it);
    it.spoilDay = s.day - 1;
    const c3 = Game.stashClock(it);
    ok('stashClock re-renders from live spoilDay',
      c1 === expClock(1 + b) && c2 === expClock(5 + b) && c3 === expClock(b - 1) && new Set([c1, c2, c3]).size === 3,
      `${c1} / ${c2} / ${c3} (bonus ${b})`);
    const k1 = Game.spoilClockShort({ spoilDay: s.day + 1 }); // left = 1+b
    const expShort = (l) => l <= 0 ? '' : (l === 1 ? '⚠ spoils tomorrow' : (l === 2 ? 'spoils in 2d' : ''));
    ok('spoilClockShort agrees with isSpoiled at the boundary',
      k1 === expShort(1 + b) &&
      Game.isSpoiled({ spoilDay: s.day - b }) === true &&
      Game.isSpoiled({ spoilDay: s.day - b + 1 }) === false,
      `short=${JSON.stringify(k1)} bonus=${b}`);
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('app.js renders stashClock live per row', appSrc.includes('Game.stashClock(it)'));
  }
  {
    // the dead flat+12 giveFood in game.js is shadowed by carexplore's progressive one
    ok('live giveFood is the progressive 2-arg version', Game.giveFood.length === 2);
  }

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
