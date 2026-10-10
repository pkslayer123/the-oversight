#!/usr/bin/env node
// PROOF (break-it food 2026-10-10, run C): cooking resurrected butchered-away calories.
//
// CATCH E1 (exploit/honesty, canon): cookTransform derived meat's "gross" as
//   cleaned/cls.raw (1/0.6 = 1.67x) and cooked at gross x cls.cooked —
//   perfect delivered ~1.42x the cleaned value. A 400-kcal cleaned portion
//   cooked to 567. This contradicts:
//     - canon docs/PRESERVATION.md (cooked = 100% known yield),
//     - the howFarOptions decision label ("~400/portion"),
//     - the COOK PRESERVES comment (hunter loop 2026-10-08),
//     - the eat path (eatOne/eatStashOne grant cleaned kcalEach in full,
//       so raw digestibility is 1.0 in practice — the 0.6 was invented),
//     - the village-meals path (game.js: cleaned meat cooks at kcalEach, 100%),
//     - the specialist-preserver no-creation cap (capped at 1.00x).
//   FIX: for meat, gross = the cleaned total; perfect = 100% (safety + shelf
//   life are the ladder's reward, never new calories). Plants keep the
//   raw-digestibility model (their kcalEach is the raw NET; tubers unlock).
//
// SIBLING (same bug class): askSpecialist's meat-cook branch duplicated the
//   old formula inline (1.42x, plus +5%/level mult on top -> ~1.77x) and its
//   whoOptions label promised "+5%/level". Now it calls the fixed
//   cookTransform with a guaranteed perfect outcome — skill buys reliability
//   (never burnt/undercooked, worms dead), never phantom energy; label fixed.
//
// HONESTY (same class): howFarOptions blind-cook label promised 0.85x, but
//   cookOutcome(knows=false) can never roll perfect — blind ceiling is decent
//   (0.8x). Label now 0.8x.
//
// HELD (attacked, resisted — documented, not fixed):
//   H1 hunt.meat_yield stacking (ability x1.3 x synergy x1.5 x relic x1.15 =
//      up to 2.24x the carcass gross): earned bonuses on a depleting resource
//      (tile ecology empties); prior hunter break-it runs blessed the fiction
//      "your skill kept more of the carcass". Documented, not changed.
//   H2 tidecaller fishing.yield x1.5 on netted fish: single source, synergy
//      with 3 requirements + minLevel 2, tile stock depletes. Same doctrine.
//   H3 pantry deposit/withdraw round-trip: kcal conserved exactly (regression).
//   H4 gill net: uses stamped at set (12), consumed item, backfill for pre-fix
//      nets (regression).
//   H5 BEANS can (mislabeled_beans): data says 350 kcal, baseEffect says
//      "350 kcal, honestly edible" — the old 350-kcal catch stays fixed.
//
// Run: node scripts/test-break-food-20261010c.js   (SEED env override)
// Multi-seed: for s in 7 42 99; do SEED=$s node scripts/test-break-food-20261010c.js; done
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  Game.say = () => {};
  console.log(`seed=${SEED}`);

  const OUTCOMES = {
    perfect: { key: 'perfect', mult: 1.0 },
    decent: { key: 'decent', mult: 0.8 },
    undercooked: { key: 'undercooked', mult: 0.7, riskStays: true },
    burnt: { key: 'burnt', mult: 0.4 },
  };
  const meatItem = (kcalEach, units, plantId) => ({
    kcalEach, units, foodKind: 'meat', foodState: 'cleaned', plantId,
    spoilDay: (s.day || 0) + 2, edible: true, safe: false, name: 'Deer (cleaned)',
  });

  // ================= E1: cookTransform no longer resurrects butchered kcal =================
  console.log('\n[exploit] E1: cookTransform meat — perfect = 100% of cleaned, never 1.42x');
  {
    const it = meatItem(400, 2, 'meat_white_tailed_deer');
    const r = Game.cookTransform(it, { outcome: OUTCOMES.perfect });
    ok('meat perfect: kcalEach 400 (not 567)', r && r.kcalEach === 400, `got ${r && r.kcalEach}`);
    ok('meat perfect: cookedTotal 800 (not 1133)', r && r.cookedTotal === 800, `got ${r && r.cookedTotal}`);
    const rd = Game.cookTransform(meatItem(400, 2, 'meat_white_tailed_deer'), { outcome: OUTCOMES.decent });
    ok('meat decent: 320/portion', rd && rd.kcalEach === 320, `got ${rd && rd.kcalEach}`);
    const ru = Game.cookTransform(meatItem(400, 2, 'meat_white_tailed_deer'), { outcome: OUTCOMES.undercooked });
    ok('meat undercooked: 280/portion', ru && ru.kcalEach === 280, `got ${ru && ru.kcalEach}`);
    const rb = Game.cookTransform(meatItem(400, 2, 'meat_white_tailed_deer'), { outcome: OUTCOMES.burnt });
    ok('meat burnt: 160/portion', rb && rb.kcalEach === 160, `got ${rb && rb.kcalEach}`);
  }

  console.log('\n[exploit] E1b: monster-class meat — same 100% rule');
  {
    // monster cook class (raw 0.55/cooked 0.8) must not grant 1.45x either
    const mid = ((Game.data.monsters || [])[0] || {}).id || 'hushwolf';
    const it = meatItem(300, 1, 'meat_' + mid);
    const cls = Game.cookClassFor(it) || {};
    const r = Game.cookTransform(it, { outcome: OUTCOMES.perfect });
    ok('monster meat perfect: 300 (not ' + Math.round(300 / (cls.raw || 0.55) * (cls.cooked || 0.8)) + ')',
      r && r.kcalEach === 300, `got ${r && r.kcalEach}`);
  }

  console.log('\n[exploit] E1c: plants UNCHANGED — tuber still unlocks at the fire');
  {
    const tuberPid = Object.keys(((Game.data || {}).cooking || {}).plantClasses || {}).find(p => Game.data.cooking.plantClasses[p] === 'tuber');
    const r = Game.cookTransform({ kcalEach: 100, units: 1, foodKind: 'plant', plantId: tuberPid }, { outcome: OUTCOMES.perfect });
    const expect = Math.round(Math.min(100 / 0.35, (100 / 0.35) * 0.8));
    ok('tuber 100 raw -> ~229 cooked (design intact)', r && r.kcalEach === expect, `got ${r && r.kcalEach}, want ${expect}`);
    const rb = Game.cookTransform({ kcalEach: 100, units: 2, foodKind: 'plant', plantId: tuberPid, rawKcal: 100 }, { outcome: OUTCOMES.perfect });
    ok('plant conservation still bounded by gross', rb && rb.cookedTotal <= rb.rawTotal / 0.35 + 1, `cookedTotal=${rb && rb.cookedTotal}`);
  }

  console.log('\n[honesty] E1d: howFarOptions cook label matches the fixed engine');
  {
    const it = meatItem(400, 2, 'meat_white_tailed_deer');
    // known cook: label must promise ~400/portion and engine must deliver 400
    const origKnows = Game.knowsTechnique;
    Game.knowsTechnique = () => true;
    const opts = Game.howFarOptions(it);
    const cook = opts.find(o => o.id === 'cook');
    ok('known cook label says ~400/portion', cook && /~400\/portion/.test(cook.detail), `detail=${cook && cook.detail}`);
    Game.knowsTechnique = () => false;
    const optsB = Game.howFarOptions(it);
    const cookB = optsB.find(o => o.id === 'cook');
    ok('blind cook label says ~320/portion (0.8x ceiling, not 0.85x)', cookB && /~320\/portion/.test(cookB.detail), `detail=${cookB && cookB.detail}`);
    Game.knowsTechnique = origKnows;
  }

  // ================= E2: sibling — specialist cook uses the same honest math =================
  console.log('\n[sibling] E2: askSpecialist cook — guaranteed perfect, 100%, no +5%/level phantom');
  {
    const inv = s.inventory;
    const it = meatItem(400, 2, 'meat_white_tailed_deer');
    it.diseaseRisk = { p: 0.35, dmg: 10, note: 'raw meat' };
    inv.push(it);
    const idx = inv.length - 1;
    const origSH = Game.specialistsHere;
    const origVP = Game.villagePeople;
    Game.specialistsHere = () => [{ id: 'spec1', name: 'Mara', skill: 5 }];
    Game.villagePeople = () => [];
    Game.askSpecialist('spec1', idx, inv, 'cook');
    Game.specialistsHere = origSH; Game.villagePeople = origVP;
    const after = inv[idx];
    ok('specialist cook: 400/portion (not 567, not 708)', after && after.kcalEach === 400, `got ${after && after.kcalEach}`);
    ok('specialist cook: wellMade (the real reward)', after && after.wellMade === true);
    ok('specialist cook: diseaseRisk cleared', after && !after.diseaseRisk);
    ok('specialist cook: parasiteRisk dead', after && !after.parasiteRisk);
    ok('specialist cook: foodState cooked', after && after.foodState === 'cooked');
    // whoOptions label honesty
    const _sh2 = Game.specialistsHere;
    Game.specialistsHere = () => [{ id: 'spec1', name: 'Mara', skill: 5, occupation: 'Cook' }];
    const wopts = Game.whoOptions(meatItem(400, 2, 'meat_white_tailed_deer'), 'cook');
    Game.specialistsHere = _sh2;
    const specOpt = wopts.find(o => String(o.id).startsWith('spec:'));
    ok('whoOptions specialist label: no +5%/level claim', specOpt && !/\+5%\/level/.test(specOpt.detail), `detail=${specOpt && specOpt.detail}`);
    inv.splice(idx, 1);
  }

  // ================= E3: pantry round-trip conserves kcal (regression) =================
  console.log('\n[regression] E3: donate -> take round-trip conserves kcal exactly');
  {
    v.pantry = [];
    const origAccess = Game.havenStoresAccess;
    Game.havenStoresAccess = () => 'inside';
    s.inventory = [{ name: 'Smoked venison', kcalEach: 200, units: 5, spoilDay: 9999, kg: 0.2, foodKind: 'meat', foodState: 'preserved', edible: true }];
    const before = 200 * 5;
    Game.donateToPantry(0);
    const inPantry = Game.pantryKcal();
    ok('donate moves 1000 kcal to pantry', inPantry === before && s.inventory.length === 0, `pantry=${inPantry} inv=${s.inventory.length}`);
    const invBefore = 0;
    let back = 0;
    for (let t = 0; t < 5; t++) { // takeFromPantry takes one unit per call, by design
      Game.takeFromPantry(0);
      const cur = s.inventory[s.inventory.length - 1] || {};
      if (t === 4) back = (cur.kcalEach || 0) * (cur.units || 0);
    }
    // units of the same stack merge via stacksMatch (same fields) — total must be exact
    const totalBack = (s.inventory || []).reduce((x, i) => x + (i.kcalEach || 0) * (i.units || 0), 0);
    ok('take returns exactly 1000 kcal', totalBack === before, `got ${totalBack}`);
    ok('pantry drained to 0', Game.pantryKcal() === 0, `pantry=${Game.pantryKcal()}`);
    Game.havenStoresAccess = origAccess;
    v.pantry = []; s.inventory = [];
  }

  // ================= E4: gill net regression =================
  console.log('\n[regression] E4: gill net — consumed on set, 12 uses stamped');
  {
    // Convert the player's own tile to creek (map gen is seed-dependent; the
    // world edit is test-only, the setNet contract under test is unchanged).
    const px = Game.map.px, py = Game.map.py;
    const tile = Game.tileAt(px, py);
    const wasType = tile.type;
    tile.type = 'creek'; tile.nets = null;
    s.inventory = [{ name: 'Gill net', itemId: 'gill_net', id: 'gill_net', units: 1, kcalEach: 0 }];
    const r = Game.setNet();
    ok('setNet accepts on water', tile.nets && tile.nets.length === 1, `nets=${(tile.nets || []).length}`);
    ok('net stamped with 12 uses', tile.nets && tile.nets[0].uses === 12, `uses=${tile.nets && tile.nets[0].uses}`);
    ok('net item consumed from pack', !s.inventory.some(i => (i.itemId || i.id) === 'gill_net'), `inv=${JSON.stringify(s.inventory.map(i => i.itemId || i.id))}`);
    tile.type = wasType; tile.nets = null;
    s.inventory = [];
  }

  // ================= E5: BEANS honesty (regression) =================
  console.log('\n[regression] E5: mislabeled_beans — 350 kcal, honestly labeled');
  {
    const beans = (Game.data.items || []).find(i => i.id === 'mislabeled_beans');
    ok('beans data: 350 kcalEach', beans && beans.kcalEach === 350, `got ${beans && beans.kcalEach}`);
    ok('beans data: effect copy honest', beans && /350/.test(beans.baseEffect || ''), `effect=${beans && beans.baseEffect}`);
  }

  // ================= D1: dead-code — food.js provides() all reachable =================
  console.log('\n[dead-code] D1: every food.js provided export has a call site');
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/food.js'), 'utf8');
    const provMatch = src.match(/\/\/ provides:\n((?:\/\/.*\n)+)/);
    const names = [];
    if (provMatch) {
      for (const m of provMatch[1].matchAll(/- (\w+)\(/g)) names.push(m[1]);
    }
    const allSrc = execSync("grep -rhoE '\\b(Game\\.)?[a-zA-Z_]+\\(' src/js/ | sort | uniq -c | sort -rn", { cwd: ROOT }).toString();
    let dead = [];
    for (const n of names) {
      // definition site + at least one other mention
      const hits = execSync(`grep -rl "${n}" src/js/ | wc -l`, { cwd: ROOT }).toString().trim();
      const callHits = execSync(`grep -rhE "(Game\\.)?${n}\\(|['\\\"]${n}['\\\"]" src/js/ | wc -l`, { cwd: ROOT }).toString().trim();
      if (parseInt(callHits, 10) < 2) dead.push(`${n} (mentions=${callHits})`);
    }
    ok('no dead food.js exports', dead.length === 0, dead.join('; ') || `checked ${names.length}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
