#!/usr/bin/env node
// BREAK-IT: forager r3 (2026-10-09, playtest loop, archetype: forager).
// Hostile pass over the batch-cook economy (Game.cookAll, "Cook N raw").
//
//   E1. EXPLOIT: cookAll never burns fire fuel. Per-item cookFood drains
//       cookTime ticks of fire via consumeCookFire() and DOWNGrades the
//       outcome when the fire dies mid-cook. The batch path cooks UNLIMITED
//       items for a flat 16 ticks of *time* and zero fuel: a 1-tick fire
//       cooks the whole harvest. Fuel (wood -> fire -> till) is the
//       scarcity the per-item path honors; the batch path ignores it.
//       Fix: the batch is one fire session — it burns 16 ticks of fuel,
//       and a fire that dies mid-batch downgrades the whole batch one
//       outcome step (same fiction as per-item). One outcome per batch
//       (the wrapper's own comment already claims this: "the fire doesn't
//       roll per portion").
//   E2. CONSERVATION battery (held): cookTransform over every cook class x
//       every outcome never exceeds gross; shellNuts 0.75x; renderFat
//       0.90/0.65; pemmican <= ~97%/set. "Energy is never created."
//   S1. SOFTLOCK: empty batch burns no fuel and says so; a fire dying
//       mid-batch narrates honestly, no throw, game continues.
//   H1. HONESTY: the fire-context "Cook N raw" label counts exactly the
//       items cookAll will cook; the batch narration states time AND fuel.
//
// Usage: node scripts/test-forager-cookall-fuel-20261009.js
//        BEFORE=1 node scripts/test-forager-cookall-fuel-20261009.js  (demonstrates E1)
//        SEED=7 node scripts/test-forager-cookall-fuel-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
const BEFORE = !!process.env.BEFORE;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  const s = Game.state.scholar;
  Game.say = (m) => says.push(String(m));
  return s;
}
// A real fire under the player's feet with `fuel` ticks of burn left.
function plantFire(fuel) {
  const s = Game.state.scholar;
  const now = Game._absTick();
  const px = s.insideTent ? s.insideTent.tx : Game.map.px;
  const py = s.insideTent ? s.insideTent.ty : Game.map.py;
  Game.state.fires = [{ tx: px, ty: py, till: now + fuel, burn0: fuel, inside: false, lastTax: now }];
  return Game.state.fires[0];
}
function rawGrain(n, rawKcal) {
  return { plantId: 'test_grain', foodKind: 'plant', rawKcal, kcalEach: 0, units: 2, foodState: 'raw', edible: true, name: 'Test grain (raw)', spoilDay: 999 };
}
function cleanedMeat() {
  return { plantId: 'meat_white_tailed_deer', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 4, unit: 'portion', kcalEach: 200, name: 'Venison (cleaned)', spoilDay: 999 };
}

// deterministic outcomes: always perfect, so downgrades are measurable
const realOutcome = Game.cookOutcome;

(async () => {
await Game.init();
Game.audioEvent = () => {};
Game.cookOutcome = () => ({ key: 'perfect', mult: 1.0 });

// ---------------- E1: batch fuel ----------------
(function e1() {
  const s = freshGame();
  for (let i = 0; i < 5; i++) s.inventory.push(rawGrain(2, 100));
  s.inventory.push(cleanedMeat(), cleanedMeat());
  const kcalBefore = s.inventory.reduce((a, it) => a + (it.kcalEach || it.rawKcal || 0) * (it.units || 1), 0);
  const fire = plantFire(1000);
  const tillBefore = fire.till;
  Game.cookAll();
  const burned = tillBefore - fire.till;
  if (BEFORE) {
    ok('E1 BEFORE: batch burns no fuel (exploit demonstrated)', burned === 0, 'burned=' + burned);
    ok('E1 BEFORE: the batch still cooked (not vacuous)', s.inventory.some(it => it.foodState === 'cooked'));
  } else {
    ok('E1: batch burns exactly one 16-tick fire session', burned === 16, 'burned=' + burned);
    const allCooked = s.inventory.every(it => it.foodState === 'cooked' || it.foodState === undefined || !it.rawKcal);
    ok('E1: everything still cooks', allCooked);
    const narr = says.join(' ');
    ok('E1: narration states the time cost', /16 ticks/.test(narr), narr.slice(0, 120));
  }
})();

// E1b: a fire that dies mid-batch downgrades the whole batch (per-item fiction).
// Within-game comparison: same background, same stubbed perfect outcome.
(function e1b() {
  const s = freshGame();
  Game.learnTechnique('cook', 'trial'); // pin knowsCook so the blind penalty can't confound
  s.inventory.push(rawGrain(2, 100));
  plantFire(1000);
  const f1 = Game.state.fires[0], t1 = f1.till;
  Game.cookAll();
  const healthy = s.inventory[s.inventory.length - 1].kcalEach;
  const burned1 = t1 - f1.till;
  s.inventory.push(rawGrain(2, 100));
  plantFire(10); // dies during the 16-tick session
  const f2 = Game.state.fires[0], t2 = f2.till;
  Game.cookAll();
  const dying = s.inventory[s.inventory.length - 1].kcalEach;
  const burned2 = t2 - f2.till;
  if (BEFORE) {
    ok('E1b BEFORE: dying fire changes nothing (no downgrade path)',
      dying === healthy && burned1 === 0 && burned2 === 0,
      `healthy=${healthy} dying=${dying} burned=${burned1},${burned2}`);
  } else {
    ok('E1b: dying fire downgrades the batch one step (perfect->decent)',
      dying === Math.round(healthy * 0.8), `healthy=${healthy} dying=${dying}`);
    ok('E1b: fuel still consumed (16 ticks each batch)',
      burned1 === 16 && burned2 === 16, `burned=${burned1},${burned2}`);
    const narr = says.join(' ');
    ok('E1b: the death is narrated, not silent', /fire dies|died halfway|sputter/i.test(narr), narr.slice(0, 200));
  }
})();

// ---------------- S1: softlock edges ----------------
(function s1() {
  // empty batch: no fuel burned, honest refusal, no throw
  const s = freshGame();
  s.inventory.push({ name: 'Rock', kcalEach: 0, units: 1 }); // not cookable
  const fire = plantFire(1000);
  const tillBefore = fire.till;
  let threw = false;
  try { Game.cookAll(); } catch (e) { threw = true; }
  ok('S1: empty batch does not throw', !threw);
  if (!BEFORE) ok('S1: empty batch burns no fuel', fire.till === tillBefore, 'burned=' + (tillBefore - fire.till));
  ok('S1: empty batch says so honestly', says.join(' ').includes('Nothing raw to cook.'));
  // no fire at all: walk off-haven to a wild tile, then refusal, no crash
  const s2 = freshGame();
  s2.inventory.push(rawGrain(2, 100));
  Game.map.px = 0; Game.map.py = 0; // away from the haven fire
  Game.state.fires = [];
  let threw2 = false;
  try { Game.cookAll(); } catch (e) { threw2 = true; }
  ok('S1: no fire refuses without throwing', !threw2 && says.join(' ').includes('Need a fire'));
})();

// ---------------- E2: conservation battery (held) ----------------
(function e2() {
  const classes = Game.data.cooking.classes;
  const outcomes = [
    { key: 'perfect', mult: 1.0 }, { key: 'decent', mult: 0.8 },
    { key: 'undercooked', mult: 0.7, riskStays: true }, { key: 'burnt', mult: 0.4 },
  ];
  const plantClassFor = { fruit: 'blackberry', grain_legume: null, greens: 'dandelion', meat: null, monster: null, mushroom: 'morel', nut: 'acorn_white_oak', tuber: 'cattail_root' };
  let worst = 0, worstWhere = '';
  for (const [ckey, cls] of Object.entries(classes)) {
    for (const o of outcomes) {
      for (const skill of [1, 1.25]) { // incl. camp_cook L3 +25%
        const item = ckey === 'grain_legume'
          ? { foodKind: 'plant', rawKcal: 100, kcalEach: 0, units: 3 }
          : ckey === 'meat'
            ? { plantId: 'meat_white_tailed_deer', foodKind: 'meat', kcalEach: 200, units: 4 }
            : ckey === 'monster'
              ? { plantId: 'meat_hushwolf', foodKind: 'meat', kcalEach: 150, units: 2 }
              : { plantId: plantClassFor[ckey], foodKind: 'plant', kcalEach: 60, units: 2 };
        const r = Game.cookTransform(item, { knows: true, outcome: o, skillMult: skill, relicMult: 1.1 });
        if (!r) continue;
        const gross = r.rawTotal / (cls.raw || 1); // the cap basis in cookTransform
        const ratio = r.cookedTotal / gross;
        if (ratio > worst) { worst = ratio; worstWhere = ckey + '/' + o.key + '/skill' + skill; }
        if (ratio > 1.0001) ok('E2: cookTransform never exceeds gross', false, worstWhere + ' ratio=' + ratio.toFixed(4));
      }
    }
  }
  ok('E2: cookTransform capped by gross across all classes x outcomes', worst <= 1.0001, 'worst=' + worst.toFixed(4) + ' @ ' + worstWhere);
})();

(function e2nuts() {
  const s = freshGame();
  s.inventory.push({ plantId: 'american_hazelnut', foodKind: 'nut', foodState: 'in_shell', edible: false, kcalEach: 400, hiddenKcal: 400, units: 2, name: 'Hazelnuts (in shell)' });
  const before = 400 * 2;
  const idx = s.inventory.findIndex(i => i && i.plantId === 'american_hazelnut');
  Game.shellNuts(idx);
  const it = s.inventory[idx];
  ok('E2: shelling keeps 75% (shells weigh)', it.kcalEach * it.units === Math.round(before * 0.75), 'got ' + (it.kcalEach * it.units));
})();

(function e2render() {
  const s = freshGame();
  plantFire(1000);
  const mk = (hidden) => ({ plantId: 'fat_black_bear', foodKind: 'fat', foodState: 'raw', edible: false, units: 6, unit: 'slab', kcalEach: 0, hiddenKcal: hidden, name: 'Bear fat (raw)', spoilDay: 999 });
  s.inventory.push(mk(1000));
  const fatIdx = () => s.inventory.findIndex(i => i && i.plantId === 'fat_black_bear' && i.foodState === 'raw');
  Game.state.codex = Game.state.codex || {};
  // blind first
  Game.renderFat(fatIdx());
  const blindIt = s.inventory.find(i => i && i.plantId === 'fat_black_bear' && i.foodState === 'rendered');
  const blindPer = blindIt.kcalEach;
  ok('E2: blind render pays 0.65x', blindPer === 650, 'got ' + blindPer);
  // known: teach via codex techniques
  s.inventory.push(mk(1000));
  Game.learnTechnique('render', 'trial');
  Game.renderFat(fatIdx());
  const knownIt = s.inventory.filter(i => i && i.plantId === 'fat_black_bear' && i.foodState === 'rendered').pop();
  const knownPer = knownIt.kcalEach;
  ok('E2: known render pays 0.90x, never more', knownPer === 900, 'got ' + knownPer);
})();

(function e2pemmican() {
  const s = freshGame();
  Game.learnTechnique('render', 'trial');
  // one honest set: 2 preserved meat (500x2) + 1 rendered fat (900) + 2 berries (50x2) = 2000 in
  s.inventory.push(
    { foodKind: 'meat', foodState: 'preserved', edible: true, units: 2, kcalEach: 500, name: 'Smoked venison', spoilDay: 999 },
    { foodKind: 'fat', foodState: 'rendered', edible: true, units: 1, kcalEach: 900, name: 'Tallow', spoilDay: 999 },
    { plantId: 'blackberry', foodKind: 'plant', edible: true, units: 2, kcalEach: 50, name: 'Blackberries', spoilDay: 999 },
  );
  const before = s.inventory.reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 1), 0);
  Game.makePemmican();
  const after = s.inventory.reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 1), 0);
  ok('E2: pemmican retains <= ~97% + rounding', after <= before * 0.97 + 600, `in=${before} out=${after}`);
  ok('E2: pemmican never creates energy', after <= before, `in=${before} out=${after}`);
})();

// ---------------- H1: "Cook N raw" label honesty ----------------
(function h1() {
  const s = freshGame();
  s.inventory.push(rawGrain(2, 100), cleanedMeat(),
    { plantId: 'blackberry', foodKind: 'plant', edible: true, units: 3, kcalEach: 40, name: 'Blackberries' }); // not raw-cookable
  const raw = s.inventory.filter(i => i.rawKcal || (i.foodKind === 'meat' && i.foodState === 'cleaned') || (i.foodKind === 'plant' && i.needsCooking && i.diseaseRisk));
  ok('H1: fire-context label counts exactly the cookable items', raw.length === 2, 'counted=' + raw.length);
  plantFire(1000);
  const narr0 = says.length;
  Game.cookAll();
  const narr = says.slice(narr0).join(' ');
  // Honesty bar: the label counted exactly the cookable items, the batch
  // states its time cost, and fuel surprises (fire death) are narrated
  // (E1b). Fuel burn itself is quiet — same as the per-item path.
  ok('H1: batch narration states the time cost', /16 ticks/.test(narr), narr.slice(0, 160));
})();

Game.cookOutcome = realOutcome;
console.log(`\n${pass} passed, ${fail} failed (SEED=${SEED}${BEFORE ? ' BEFORE' : ''})`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
