#!/usr/bin/env node
// HUNTER ATTACK 2026-10-09 (adversarial playtest loop, archetype 5).
// Hostile probes against the hunt/trap/butcher/preservation systems.
// Canon: docs/BEAR.md (bear, butchering, trichinosis), docs/PRESERVATION.md
// (food ladder, smoking 16 ticks, pemmican ~97% retention).
//
//   A. CRASH: askSpecialist('butcher') — the disease-rework worker copy-pasted
//      the trichinosis block into the specialist branch but left `aid2`
//      referenced BEFORE its block-scoped `const` (food.js:824 vs 833).
//      Expect ReferenceError on ANY specialist butcher. Post-fix: clean
//      completion, full yields, trichinosis attached for bear/boar/javelina.
//   B. EXPLOIT: pemmican calorie creation — the recipe consumes 2 preserved
//      meat UNITS + 1 rendered fat UNIT + 2 berry units and pays a FIXED
//      3x600 bars. Small inputs (smoked fish portions + javelina fat) turn
//      ~1058 kcal into 1800. Post-fix: bars scale with input kcal (~97%
//      retention, half-bar granularity); full-size inputs still pay 3 bars.
//   C. HONESTY: howFarOptions smoke label says "8 ticks"; preserveFood
//      charges 16 ticks and narrates "(16 ticks)". Canon: 16 = 1/8 day-part
//      (Steve 2026-10-09, restored 8->16 in b1227f2; the label was missed).
//   D. TRAP ECONOMY (regression): snare-wire shortcut = 2-use improvised
//      snare; trap breaks after uses exhausted; set cost honest (16/96).
//   E. SOFTLOCK: specialist-butcher on an already-cleaned item refuses
//      honestly, no mutation (regression guard for the A fix).
//   F. PREY-AI (data probe): every flee-capable behavior resolves a sane
//      encPreyCfg (notice > 0) — prey that can't notice can't flee.
//
// Harness: mulberry32, SEED env override (default 20261009), full src/js
// module list in index.html order minus DOM-only files and drama.js, window
// stubbed for eval then deleted, Math.random seeded BEFORE eval.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(name);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const inv = s.inventory;

  const tickLog = [];
  const origTick = Game.tickAction;
  Game.tickAction = function (n) { tickLog.push(n); return origTick ? origTick.call(this, n) : null; };
  Game.say = function () {};
  Game.feedback = function () {};
  Game.nearFire = () => true;
  const day = Game.state.scholar.day;
  const animals = Game.data.animals;
  const byId = id => animals.find(a => a.id === id);

  const addButcher = () => {
    const v = Game.state.village;
    v.roster = v.roster || []; v.rosterChars = v.rosterChars || {}; v.nodePos = v.nodePos || {};
    if (!v.roster.includes('testbutch')) v.roster.push('testbutch');
    v.rosterChars['testbutch'] = { id: 'testbutch', name: 'Test Butcher', formerOccupation: 'butcher' };
    v.nodePos['testbutch'] = { nx: Game.map.px, ny: Game.map.py };
  };
  const carcass = (aid, gross) => ({
    name: byId(aid).name + ' (carcass)', plantId: 'meat_' + aid,
    foodKind: 'meat', foodState: 'carcass', hiddenKcal: gross, kcalEach: 0,
    units: 1, spoilDay: day + 2,
  });

  console.log('== A. SPECIALIST BUTCHER CRASH (aid2 TDZ) ==');
  addButcher();
  inv.length = 0;
  inv.push(carcass('white_tailed_deer', 20000));
  let threw = null;
  try { Game.askSpecialist('testbutch', 0, undefined, 'butcher'); }
  catch (e) { threw = e; }
  check('specialist butcher does not throw', !threw, threw ? threw.constructor.name + ': ' + threw.message : 'clean');
  const deerMeat = inv.find(i => i.foodState === 'cleaned');
  check('deer: cleaned item exists', !!deerMeat, deerMeat ? deerMeat.name : 'none');
  if (deerMeat) {
    check('deer: name updated to (cleaned)', /\(cleaned\)$/.test(deerMeat.name), deerMeat.name);
    check('deer: portions honest (~500 cap, ~40%+skill)', deerMeat.kcalEach <= 550 && (deerMeat.kcalEach * deerMeat.units) >= 20000 * 0.40, `${deerMeat.units}x${deerMeat.kcalEach}`);
    check('deer: spoilDay = day+2', deerMeat.spoilDay === day + 2, `spoilDay=${deerMeat.spoilDay}`);
    check('deer: NO trichinosis (not a carrier)', !deerMeat.parasiteRisk, JSON.stringify(deerMeat.parasiteRisk));
  }
  check('deer: butcher yields (hide/bone/antler) landed', inv.some(i => i.material === 'hide') && inv.some(i => i.material === 'antler'), inv.filter(i => i.material).map(i => i.material).join(','));

  console.log('== A2. SPECIALIST BUTCHER: BEAR (trichinosis + fat) ==');
  inv.length = 0;
  inv.push(carcass('black_bear', 30000));
  threw = null;
  try { Game.askSpecialist('testbutch', 0, undefined, 'butcher'); }
  catch (e) { threw = e; }
  check('bear: no throw', !threw, threw ? threw.message : 'clean');
  const bearMeat = inv.find(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
  if (bearMeat) {
    check('bear: trichinosis attached (canon: bear carries it)', bearMeat.parasiteRisk && bearMeat.parasiteRisk.id === 'trichinosis', JSON.stringify(bearMeat.parasiteRisk));
    check('bear: ~31 portions of ~500 (skill-3 specialist bonus, 52% yield)', bearMeat.units >= 28 && bearMeat.units <= 34 && bearMeat.kcalEach <= 550, `${bearMeat.units}x${bearMeat.kcalEach}`);
  } else check('bear: cleaned meat exists', false, 'missing');
  const fatUnits = inv.filter(i => i.foodKind === 'fat').reduce((a, i) => a + (i.units || 1), 0);
  check('bear: 6 raw fat slabs', fatUnits === 6, `got ${fatUnits}`);

  console.log('== E. SPECIALIST BUTCHER ON CLEANED ITEM (softlock guard) ==');
  const before = JSON.stringify(inv.map(i => [i.name, i.units]));
  threw = null;
  try { Game.askSpecialist('testbutch', inv.findIndex(i => i.foodState === 'cleaned'), undefined, 'butcher'); }
  catch (e) { threw = e; }
  check('already-cleaned: no throw', !threw, threw ? threw.message : 'clean');
  check('already-cleaned: inventory unmutated', JSON.stringify(inv.map(i => [i.name, i.units])) === before, 'mutated!');

  console.log('== C. SMOKE LABEL HONESTY (8 vs 16 ticks) ==');
  inv.length = 0;
  inv.push({ name: 'Deer (cleaned)', plantId: 'meat_white_tailed_deer', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 2, unit: 'portion', kcalEach: 400, spoilDay: day + 2 });
  const opts = Game.howFarOptions(inv[0]);
  const smoke = opts.find(o => o.id === 'smoke');
  check('smoke option exists', !!smoke, 'missing');
  if (smoke) check('smoke label says 16 ticks (engine charges 16)', /16 ticks/.test(smoke.detail), smoke.detail);

  console.log('== B. PEMMICAN CALORIE CREATION ==');
  Game.learnTechnique('render', 'test');
  inv.length = 0;
  const mkFish = () => ({ name: 'Bluegill (smoked)', plantId: 'meat_bluegill', foodKind: 'meat', foodState: 'preserved', edible: true, units: 1, unit: 'portion', kcalEach: 114, spoilDay: day + 30 });
  inv.push(mkFish(), mkFish());
  inv.push({ name: 'Javelina fat (rendered)', plantId: 'fat_javelina', foodKind: 'fat', foodState: 'rendered', edible: true, units: 1, unit: 'slab', kcalEach: 780, spoilDay: day + 90 });
  inv.push({ name: 'Salmonberries', plantId: 'salmonberry', foodKind: 'plant', edible: true, units: 2, kcalEach: 25, spoilDay: day + 2 });
  const inKcal = 2 * 114 + 780 + 2 * 25;
  tickLog.length = 0;
  Game.makePemmican();
  const bars = inv.filter(i => i.itemId === 'pemmican').reduce((a, i) => a + (i.units || 1), 0);
  // HONEST MEASURE (hunter loop 2026-10-09): small sets pay honest small
  // bars (kcalEach scaled per set) — measuring bars*600 overstated output
  // and hid the fix behind a +-300 tolerance. Sum the real calories.
  const outKcal = inv.filter(i => i.itemId === 'pemmican').reduce((a, i) => a + (i.units || 1) * (i.kcalEach || 0), 0);
  console.log(`  input ${inKcal} kcal -> ${bars} bars = ${outKcal} kcal (canon retention ~97% -> ~${Math.round(inKcal * 0.97)})`);
  check('pemmican: no calorie creation (output ~= 97% of input)', Math.abs(outKcal - inKcal * 0.97) <= Math.max(60, inKcal * 0.05), `${outKcal} vs ~${Math.round(inKcal * 0.97)}`);
  check('pemmican: costs 20 ticks', tickLog.includes(20), tickLog.join(','));

  console.log('== B2. PEMMICAN CANON CASE (full inputs -> 3 bars) ==');
  inv.length = 0;
  const mkDeer = () => ({ name: 'Deer (smoked)', plantId: 'meat_white_tailed_deer', foodKind: 'meat', foodState: 'preserved', edible: true, units: 1, unit: 'portion', kcalEach: 475, spoilDay: day + 30 });
  inv.push(mkDeer(), mkDeer());
  inv.push({ name: 'Bear fat (rendered)', plantId: 'fat_black_bear', foodKind: 'fat', foodState: 'rendered', edible: true, units: 1, unit: 'slab', kcalEach: 900, spoilDay: day + 90 });
  inv.push({ name: 'Blackberries', plantId: 'blackberry', foodKind: 'plant', edible: true, units: 2, kcalEach: 65, spoilDay: day + 2 });
  const inKcal2 = 2 * 475 + 900 + 2 * 65;
  Game.makePemmican();
  const bars2 = inv.filter(i => i.itemId === 'pemmican').reduce((a, i) => a + (i.units || 1), 0);
  console.log(`  input ${inKcal2} kcal -> ${bars2} bars = ${bars2 * 600} kcal`);
  check('pemmican: full inputs pay 3 bars (canon)', bars2 === 3, `${bars2} bars`);
  check('pemmican: 120-day shelf', inv.find(i => i.itemId === 'pemmican').spoilDay === day + 120, 'spoilDay');

  console.log('== D. TRAP ECONOMY ==');
  inv.length = 0; s.tools = [];
  // wire-snare shortcut: 1 wire -> improvised 2-use snare
  inv.push({ name: 'Snare wire', itemId: 'snare_wire', units: 1 });
  const wireBefore = inv.find(i => i.itemId === 'snare_wire').units;
  tickLog.length = 0;
  Game.setTrap('snare');
  const pt = Game.playerTile();
  const wireTrap = (pt.traps || []).find(t => t.recipeId === 'snare');
  check('wire snare: trap set', !!wireTrap, 'none');
  check('wire snare: wire consumed', !inv.some(i => i.itemId === 'snare_wire'), `wire units before=${wireBefore}`);
  check('wire snare: improvised 2 uses', wireTrap && wireTrap.uses === 2, `uses=${wireTrap && wireTrap.uses}`);
  check('snare set: costs 16 ticks', tickLog.includes(16), tickLog.join(','));
  // force catches: rabbit on the tile, rng forced
  pt.wildlife = { cottontail_rabbit: 9 };
  const realRandom = Math.random;
  Math.random = () => 0; // always catch while eligible
  Game.checkTraps();
  const after1 = (pt.traps || []).find(t => t.recipeId === 'snare');
  check('trap: 1 catch -> uses 1, carcass in pack', after1 && after1.uses === 1 && inv.some(i => i.foodState === 'carcass'), `uses=${after1 && after1.uses}`);
  pt.wildlife = { cottontail_rabbit: 9 };
  Game.checkTraps();
  Math.random = realRandom;
  check('trap: 2nd catch breaks it (uses exhausted)', !(pt.traps || []).some(t => t.recipeId === 'snare'), 'trap still there');
  // undefined-uses backfill: no infinite trap
  pt.traps = pt.traps || [];
  pt.traps.push({ recipeId: 'snare', mx: 4, my: 4, setDay: day, uses: undefined });
  pt.wildlife = { cottontail_rabbit: 9 };
  Math.random = () => 0;
  Game.checkTraps();
  Math.random = realRandom;
  const bf = (pt.traps || []).find(t => t.recipeId === 'snare');
  check('trap: undefined uses backfilled to recipe (10), decremented on catch', !bf || bf.uses === 9, `uses=${bf && bf.uses}`);

  console.log('== F. PREY-AI DATA PROBE ==');
  const NEVER = { unbothered: 1, quilled: 1, territorial: 1, stalker: 1, defensive: 1, aggressive: 1, charger: 1, sentinel: 1, armored: 1, bedding: 1, sentinel_mob: 1 };
  const AMBUSH = { ambush: 1, aquatic_ambush: 1, camouflaged: 1, still: 1, patient: 1, burrowing: 1, arboreal: 1, aquatic: 1, semiaquatic: 1, aerial: 1, wading: 1 };
  let preyBad = 0;
  for (const a of animals) {
    const beh = a.behavior || 'skittish';
    if (NEVER[beh] || AMBUSH[beh]) continue; // standers/hiders by design
    const cfg = Game.encPreyCfg(a.id);
    if (!(cfg && cfg.notice > 0 && cfg.stamina > 0)) { preyBad++; console.log(`    BADCFG ${a.id} beh=${beh} cfg=${JSON.stringify(cfg)}`); }
  }
  check('flee-capable prey all have sane notice/stamina', preyBad === 0, `${preyBad} bad`);

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
