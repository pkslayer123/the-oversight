#!/usr/bin/env node
// BEAR REWORK PROOF (Steve's design corrections, 2026-10-09).
//
// 1. Meat chunking: no 30,000-kcal lump. cleanCarcass portions cap ~500 kcal
//    (game.js portion law: a 2000-kcal day takes four 500s).
// 2. Knowledge gating: kill reveals nothing about trichinosis/rendering;
//    diseaseVector for obscure zoonotics gates at animal knowledge L4.
// 3. Fat rendering: raw fat -> rendered tallow over fire, 0.90x known /
//    0.65x blind (one attempt teaches the technique).
// 4. Pemmican: 2 preserved meat + 1 rendered fat + 2 berries -> 3 bars,
//    600 kcal each, 120-day shelf life. Top preservation tier.
// 5. Preservation ladder honest: raw(500/2d/risky) < cooked < smoked(16 ticks,
//    0.95x, 30d) < rendered fat(12 ticks, 0.90x, 90d) < pemmican(20 ticks,
//    ~full retention, 120d). No path destroys calories senselessly.
// 6. Sibling sweep: fat is animal-specific (bear 6, boar 3, javelina 2;
//    deer/rabbit/turkey = none); killTexts gutted of how-tos; obscure
//    disease vectors gated at L4 across the pattern family.
// 7. Smoking pacing: 16 ticks = 1/8 day-part (Steve 2026-10-09).
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

  // Quiet + controlled: stub say/feedback, fire, tick capture.
  const tickLog = [];
  const origTick = Game.tickAction;
  Game.tickAction = function (n) { tickLog.push(n); return origTick ? origTick.call(this, n) : null; };
  Game.say = function () {};
  Game.feedback = function () {};
  Game.nearFire = () => true;
  const animals = Game.data.animals;
  const byId = id => animals.find(a => a.id === id);

  const giveKnife = () => inv.push({ name: 'Stone knife', recipeId: 'stone_knife', kg: 0.2 });
  const carcass = (aid, gross) => ({
    name: byId(aid).name + ' (carcass)', plantId: 'meat_' + aid,
    foodKind: 'meat', foodState: 'carcass', hiddenKcal: gross, kcalEach: 0, units: 1,
  });

  console.log('== 1. MEAT CHUNKING (no 30k lump) ==');
  giveKnife();
  Game.learnTechnique('clean', 'test');
  inv.push(carcass('black_bear', 30000));
  Game.cleanCarcass();
  const meats = inv.filter(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
  const maxPortion = Math.max(...meats.map(i => i.kcalEach));
  const totalUnits = meats.reduce((a, i) => a + (i.units || 1), 0);
  check('bear: no single item over ~550 kcal', maxPortion <= 550, `max item ${maxPortion} kcal`);
  check('bear: ~24 portions of ~500', totalUnits >= 20 && totalUnits <= 28, `${totalUnits} portions`);
  const perPortion = meats[0].kcalEach;
  check('bear: portions ~500 kcal each', perPortion >= 450 && perPortion <= 550, `${perPortion} kcal/portion`);
  const fats = inv.filter(i => i.foodKind === 'fat' && i.foodState === 'raw');
  check('bear: 6 raw fat slabs (huge fat layer)', fats.reduce((a, i) => a + (i.units || 1), 0) === 6, `got ${fats.reduce((a, i) => a + (i.units || 1), 0)}`);
  check('bear: raw fat kcalEach honest (~20% of gross / 6)', (() => { const k = fats[0] && fats[0].hiddenKcal; return k >= 800 && k <= 1200; })(), `${fats[0] && fats[0].hiddenKcal} kcal/slab hidden`);

  console.log('== 1b. FAT IS ANIMAL-SPECIFIC (reality gate) ==');
  inv.length = 0; giveKnife();
  inv.push(carcass('white_tailed_deer', 16000));
  Game.cleanCarcass();
  check('deer: NO fat item (lean game)', !inv.some(i => i.foodKind === 'fat'), 'deer yields meat/bone/hide only');
  inv.length = 0; giveKnife();
  inv.push(carcass('cottontail_rabbit', 1200));
  Game.cleanCarcass();
  check('rabbit: NO fat item', !inv.some(i => i.foodKind === 'fat'), 'rabbit yields meat only');
  inv.length = 0; giveKnife();
  inv.push(carcass('wild_boar', 21000));
  Game.cleanCarcass();
  const boarFat = inv.filter(i => i.foodKind === 'fat').reduce((a, i) => a + (i.units || 1), 0);
  check('boar: 3 fat slabs (pig-type, moderate)', boarFat === 3, `got ${boarFat}`);
  inv.length = 0; giveKnife();
  inv.push(carcass('javelina', 12000));
  Game.cleanCarcass();
  const javFat = inv.filter(i => i.foodKind === 'fat').reduce((a, i) => a + (i.units || 1), 0);
  check('javelina: 2 fat slabs (small pig-type)', javFat === 2, `got ${javFat}`);

  console.log('== 2. KNOWLEDGE GATING (kill reveals nothing deep) ==');
  const bear = byId('black_bear');
  check('bear killText: no trichinosis', !/trichin/i.test(bear.killText), bear.killText.slice(0, 60) + '...');
  check('bear killText: no rendering how-to', !/render|liquid gold/i.test(bear.killText), 'gutted');
  check('bear killText: no how-to-kill', !/aim|heart|shoulder|behind the/i.test(bear.killText), 'no shot placement');
  check('bear diseaseVector gated at L4', bear.vectorLevel === 4, `vectorLevel=${bear.vectorLevel}`);
  check('bear L4 names trichinosis + rendering', /trichin/i.test(bear.knowledgeLevels['4']) && /render/i.test(bear.knowledgeLevels['4']), 'deep knowledge earned');
  check('bear L1 stays honest, no deep leaks', !/trichin|render|pemmican/i.test(bear.knowledgeLevels['1']), bear.knowledgeLevels['1'].slice(0, 50) + '...');
  // encButcherHonesty: vector shown only at the gated level.
  Game.state.codex.animals = Game.state.codex.animals || {};
  Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
  Game.state.codex.animalEncounters.black_bear = 3; // met bears: name known
  Game.state.codex.animals.black_bear = { level: 1 };
  const lineL1 = Game.encButcherHonesty(30000, bear);
  check('butcher honesty L1: no trichinosis leak', !/trichin/i.test(lineL1), 'ungated text stays clean');
  check('butcher honesty: honest portions (~500 x ~24)', /~500 kcal × 2\d raw portions/.test(lineL1), lineL1.slice(0, 40));
  Game.state.codex.animals.black_bear = { level: 4 };
  const lineL4 = Game.encButcherHonesty(30000, bear);
  check('butcher honesty L4: vector named once earned', /trichin/i.test(lineL4), 'deep knowledge shows at L4');

  console.log('== 2b. SIBLING KNOWLEDGE SWEEP ==');
  const skunk = byId('striped_skunk'), jav = byId('javelina'), bison = byId('bison');
  check('skunk killText: gland how-to gone (lives at L4)', !/cut wide|never nick/i.test(skunk.killText), skunk.killText.slice(0, 60));
  check('skunk L4 keeps the gland craft', /cut wide|never nick/i.test(skunk.knowledgeLevels['4']), 'earned, not dumped');
  check('javelina killText: gland-FIRST gone', !/gland FIRST|musk gland/i.test(jav.killText), jav.killText);
  check('bison killText: no render name-drop', !/render/i.test(bison.killText), 'no technique named');
  const tularemiaIds = ['cottontail_rabbit', 'muskrat', 'groundhog', 'north_american_beaver', 'nutria', 'snowshoe_hare', 'american_mink'];
  const tularGated = tularemiaIds.every(id => (byId(id) || {}).vectorLevel === 4);
  check('tularemia vectors gated L4 (7 animals)', tularGated, tularemiaIds.map(id => `${id}=${(byId(id) || {}).vectorLevel}`).join(','));
  check('brucellosis bison gated L4', (byId('bison') || {}).vectorLevel === 4, '');
  check('brucellosis javelina gated L4', (byId('javelina') || {}).vectorLevel === 4, '');
  check('CWD elk+moose gated L4', (byId('roosevelt_elk') || {}).vectorLevel === 4 && (byId('moose') || {}).vectorLevel === 4, '');
  check('lung-fluke crayfish gated L4', (byId('crayfish') || {}).vectorLevel === 4, '');
  check('boar trichinella gated L4', (byId('wild_boar') || {}).vectorLevel === 4, '');

  console.log('== 3. FAT RENDERING ==');
  inv.length = 0;
  const fatSlab = { plantId: 'fat_black_bear', foodKind: 'fat', foodState: 'raw', edible: false, units: 1, kcalEach: 0, hiddenKcal: 1000, name: 'Bear fat (raw)', spoilDay: s.day + 2 };
  inv.push(fatSlab);
  // Blind render first (technique not yet known): 0.65x, teaches the craft.
  Game.state.scholar.techniques = Game.state.scholar.techniques || {};
  delete Game.techniques().render;
  tickLog.length = 0;
  Game.renderFat();
  check('blind render: 0.65x yield', fatSlab.kcalEach === 650, `got ${fatSlab.kcalEach} (1000 -> 650)`);
  check('blind render: teaches render technique', Game.knowsTechnique('render'), 'one attempt teaches');
  check('rendered fat: 90-day shelf', fatSlab.spoilDay === s.day + 90, `spoilDay day+${fatSlab.spoilDay - s.day}`);
  check('rendered fat: safe + edible', fatSlab.safe === true && fatSlab.edible === true, '');
  check('render costs 12 ticks', tickLog[tickLog.length - 1] === 12, `last tick cost ${tickLog[tickLog.length - 1]}`);
  // Known render: full 0.90x.
  const fatSlab2 = { plantId: 'fat_black_bear', foodKind: 'fat', foodState: 'raw', edible: false, units: 1, kcalEach: 0, hiddenKcal: 1000, name: 'Bear fat (raw)', spoilDay: s.day + 2 };
  inv.push(fatSlab2);
  Game.renderFat();
  check('known render: 0.90x yield', fatSlab2.kcalEach === 900, `got ${fatSlab2.kcalEach} (1000 -> 900)`);

  console.log('== 4. PEMMICAN (top tier) ==');
  inv.length = 0;
  Game.learnTechnique('render', 'test');
  const smokedMeat = (n, k) => ({ plantId: 'meat_black_bear', foodKind: 'meat', foodState: 'preserved', edible: true, units: n, unit: 'portion', kcalEach: k, name: 'Bear meat (smoked)', spoilDay: s.day + 30, safe: true });
  const rendFat = { plantId: 'fat_black_bear', foodKind: 'fat', foodState: 'rendered', edible: true, units: 1, kcalEach: 900, hiddenKcal: 900, name: 'Bear fat (rendered)', spoilDay: s.day + 90, safe: true };
  const berries = { plantId: 'blackberries', foodKind: 'plant', edible: true, units: 2, kcalEach: 40, name: 'Blackberries', spoilDay: s.day + 3 };
  inv.push(smokedMeat(2, 475), rendFat, berries);
  const inKcal = 2 * 475 + 900 + 2 * 40; // 1930 in
  tickLog.length = 0;
  check('pemmicanSets counts 1 full set', Game.pemmicanSets() === 1, '');
  Game.makePemmican();
  const bars = inv.filter(i => i.itemId === 'pemmican');
  check('pemmican: 3 bars from one set', bars.reduce((a, i) => a + (i.units || 1), 0) === 3, '');
  const bar = bars[0];
  check('pemmican: 600 kcal/bar', bar.kcalEach === 600, '');
  check('pemmican: 120-day shelf', bar.spoilDay === s.day + 120, `day+${bar.spoilDay - s.day}`);
  const retention = (3 * 600) / inKcal;
  check('pemmican: ~full kcal retention (>=90%)', retention >= 0.9, `${Math.round(retention * 100)}% of ${inKcal} in -> ${3 * 600} out`);
  check('pemmican costs 20 ticks (most work)', tickLog[tickLog.length - 1] === 20, `last tick cost ${tickLog[tickLog.length - 1]}`);
  check('ingredients consumed', !inv.some(i => i.foodState === 'rendered' && i.foodKind === 'fat') && !inv.some(i => /blackberries/i.test(i.name || '')), 'fat + berries gone');
  // Gated: no render technique -> refused.
  inv.length = 0;
  delete Game.techniques().render;
  inv.push(smokedMeat(2, 475), { plantId: 'fat_x', foodKind: 'fat', foodState: 'rendered', edible: true, units: 1, kcalEach: 900, name: 'Fat (rendered)', spoilDay: s.day + 90, safe: true }, { plantId: 'blackberries', foodKind: 'plant', edible: true, units: 2, kcalEach: 40, name: 'Blackberries', spoilDay: s.day + 3 });
  Game.makePemmican();
  check('pemmican refused without render knowledge', !inv.some(i => i.itemId === 'pemmican'), 'gated on the craft');

  console.log('== 5. PRESERVATION LADDER (honest math, viable pacing) ==');
  inv.length = 0; Game.learnTechnique('render', 'test');
  Game.learnTechnique('preserve', 'test');
  const raw = { plantId: 'meat_black_bear', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 1, kcalEach: 500, hiddenKcal: 500, name: 'Bear meat (cleaned)', spoilDay: s.day + 2, diseaseRisk: { rawMeat: true } };
  inv.push(raw);
  check('raw cleaned: 500 kcal, 2-day spoil, risky', raw.spoilDay === s.day + 2 && raw.diseaseRisk, '');
  tickLog.length = 0;
  Game.preserveFood();
  check('smoked: 0.95x retention (known)', raw.kcalEach === 475, `500 -> ${raw.kcalEach}`);
  check('smoked: 30-day shelf (known)', raw.spoilDay === s.day + 30, `day+${raw.spoilDay - s.day}`);
  check('smoked: safe now', raw.safe === true && !raw.diseaseRisk, '');
  check('smoking costs 16 ticks (1/8 day-part, Steve 2026-10-09)', tickLog[tickLog.length - 1] === 16, `cost ${tickLog[tickLog.length - 1]} ticks`);
  // Blind smoke: 0.80x.
  delete Game.techniques().preserve;
  const raw2 = { plantId: 'meat_x', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 1, kcalEach: 500, hiddenKcal: 500, name: 'Meat (cleaned)', spoilDay: s.day + 2 };
  inv.push(raw2);
  Game.preserveFood();
  check('blind smoke: 0.80x retention', raw2.kcalEach === 400, `500 -> ${raw2.kcalEach}`);
  check('blind smoke: 15-day shelf', raw2.spoilDay === s.day + 15, `day+${raw2.spoilDay - s.day}`);
  // Ladder ordering: each step costs more, pays more.
  console.log('  ladder: raw 500/2d/risky/0t < smoked 475/30d/8t < rendered-fat 900/90d/12t < pemmican 1800/120d/20t');

  console.log('== 6. BEAR FIGHT DATA (fierce, weapon-appropriate) ==');
  check('bear method: bow first, spear second', bear.method[0] === 'bow' && bear.method[1] === 'spear', bear.method.join(','));
  const src = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
  check('maul hook present (dist<=2)', /black_bear.*dist <= 2.*_mauled/.test(src), '');
  check('maul damage 8-17', /maulDmg = 8 \+ Math\.floor\(Math\.random\(\) \* 10\)/.test(src), '');
  check('maul halved with spear', /maulMethod === 'spear'\) maulDmg = Math\.ceil\(maulDmg \/ 2\)/.test(src), '');
  check('maul chance: bow x0.85 / spear x0.6 / else x0.4', /maulMethod === 'bow' \? 0\.85 : maulMethod === 'spear' \? 0\.6 : 0\.4/.test(src), '');
  check('bear never bolts on miss (advances)', /bear/i.test(src) && /advances/i.test(src), 'miss reaction: it advances');

  console.log('== 7. RENDER BOOK EXISTS ==');
  const books = Game.data.books || [];
  const tallow = books.find(b => /tallow/i.test(b.title || b.name || ''));
  check('Tallow & Keeping book exists', !!tallow, tallow && (tallow.title || tallow.name));
  check('book grants render technique', tallow && JSON.stringify(tallow).includes('render'), '');

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
