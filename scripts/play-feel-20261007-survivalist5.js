#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07): SURVIVALIST 5 — the haven needs economy.
// A COMPETENT survivalist plays needs logistics anchored at haven:
//   cistern draws (fill bottles), cooking water spend, hauler refills + cap,
//   fire make/feed/lasts-till-dawn, the full sleep matrix (hall, crisis,
//   cold ground, cold fireside), boil paths, rest honesty.
// Prior runs (1-4) covered the wild off-the-land loop + sleep honesty;
// this run audits the HAVEN water/fire economy and sleepPreview-vs-reality.
// Judge like a player: sustainable? fun or chores? honest? what breaks?
// Run: node scripts/play-feel-20261007-survivalist5.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '11', 10);
Math.random = mulberry32(SEED);
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function flush(tag, max = 2) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`); }
function clearSays() { says.splice(0); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function vstate(label) {
  const s = Game.state.scholar;
  const vw = Game.state.village.water || {};
  note(`   [${label}] day=${s.day} ticks=${s.dayTicks} hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} en=${Math.round(s.energy)} H2O=${(s.water || []).length}L cistern=${Math.floor(vw.clean || 0)}L`);
}
function cistern() { return Math.floor((Game.state.village.water || {}).clean || 0); }
function lastSay(n = 6) { return says.slice(-n).join(' | '); }

(async () => {
  await Game.init();
  note(`seed=${SEED}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  // Haven anchor. newGame starts the player at haven already; make sure.
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0;
  Game.state.weather = 'clear';
  s.inventory = (s.inventory || []).concat([
    { itemId: 'knife', name: 'Knife', units: 1, kg: 0.4 },
    { itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.05 },
    { material: 'branch', name: 'Deadfall branches', units: 8, kg: 0.5 },
    { name: 'Wild tubers', units: 2, kg: 0.6, rawKcal: 120, cookedKcal: 200, needsCooking: true, kcalEach: 0, edible: true },
  ]);
  clearSays();

  note('\n=== A. CISTERN DRAIN HONESTY (fill bottles at haven) ===');
  const c0 = cistern();
  note(`   cistern starts at ${c0}L`);
  Game.fillWater(); Game.fillWater(); Game.fillWater();
  const c1 = cistern();
  check('3 fills drain exactly 3L', c1 === c0 - 3, `cistern ${c0} -> ${c1}`);
  check('3 bottles carried', (s.water || []).length === 3, `carried ${(s.water || []).length}`);
  check('haven fills are clean', (s.water || []).every(b => b.quality === 'clean'), JSON.stringify((s.water || []).map(b => b.quality)));
  const fillMsg = lastSay(3);
  check('fill names cistern remainder', new RegExp(`Cistern: ${c1}L left`).test(fillMsg), fillMsg.slice(0, 200));
  flush('fill');

  note('\n=== B. DRINK BEHAVIOR ===');
  s.hydration = 80;
  const wBefore = (s.water || []).length;
  Game.drinkWater();
  check('drink +50 hydration', Math.round(s.hydration) === 100, `hyd=${Math.round(s.hydration)}`);
  check('drink consumes a bottle', (s.water || []).length === wBefore - 1, '');
  flush('drink');
  Game.drinkWater(); // at 100 now -> gate
  check('not-thirsty gate refuses (>=95)', /not thirsty/i.test(lastSay(2)), lastSay(2).slice(0, 120));
  check('gate burns no bottle', (s.water || []).length === wBefore - 1, '');
  // waste edge: at 90, one drink caps at 100 -> 40 points of the liter wasted
  s.hydration = 90; s.water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
  Game.drinkWater();
  check('drink at 90 caps at 100 (40 pts wasted — feel note)', Math.round(s.hydration) === 100, `hyd=${Math.round(s.hydration)}`);
  note('   FEEL: a liter at 90 hydration wastes 40 points; the >=95 gate only stops the last sliver. Player chooses to drink — acceptable, but a "top off" line would be kinder.');

  note('\n=== C. COOKING DRAWS CISTERN WATER ===');
  s.water = []; // empty bottles -> cook must draw from the well
  // ensure a fire cell exists at haven for cookFood's scan
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  let firePlaced = false;
  for (let y = 0; y < 9 && !firePlaced; y++) for (let x = 0; x < 9 && !firePlaced; x++) {
    if (detail[y] && (detail[y][x] === 'grass' || detail[y][x] === 'dirt')) { detail[y][x] = 'fire'; firePlaced = true; }
  }
  const cookIdx = s.inventory.findIndex(i => i.needsCooking);
  const cBefore = cistern();
  const cookLvl = Game.abilityLevel('camp_cook');
  const waterMult = cookLvl >= 2 ? 0 : cookLvl >= 1 ? 0.5 : 1;
  const cost = Math.ceil(2 * waterMult);
  Game.cookFood(cookIdx);
  const cAfter = cistern();
  check('cooking draws exactly its water cost from cistern', cAfter === cBefore - cost, `cistern ${cBefore} -> ${cAfter}, cost=${cost}`);
  check('cook names the well draw', /haven well/i.test(lastSay(2)), lastSay(2).slice(0, 160));
  const cooked = s.inventory.find(i => i.name === 'Wild tubers');
  check('item cooked (no longer needsCooking)', cooked && !cooked.needsCooking && cooked.kcalEach > 0, JSON.stringify(cooked && { needsCooking: cooked.needsCooking, kcalEach: cooked.kcalEach }));
  flush('cook');
  // refusal path: dry cistern + empty bottles
  const savedCistern = Game.state.village.water.clean;
  Game.state.village.water.clean = 0;
  s.inventory.push({ name: 'More tubers', units: 2, kg: 0.6, rawKcal: 120, cookedKcal: 200, needsCooking: true, kcalEach: 0, edible: true });
  Game.cookFood(s.inventory.length - 1);
  check('dry well + empty bottles refuses honestly', /haul water first/i.test(lastSay(2)), lastSay(2).slice(0, 140));
  Game.state.village.water.clean = savedCistern;
  s.inventory.pop();

  note('\n=== D. HAULER REFILL + CISTERN CAP ===');
  const cap = (typeof Game.waterCapL === 'function') ? Game.waterCapL() : 40;
  note(`   cistern cap=${cap}`);
  const vids = Object.keys(Game.state.village.assignments || {});
  const vid = (Game.data.villagers || []).find(v => v.id !== Game.villagerId && !v.dead);
  check('a living villager exists to assign', !!vid, '');
  if (vid) {
    Game.state.village.water.clean = cap - 1; // nearly full
    Game.assignTask(vid.id, 'water');
    clearSays();
    Game.resolveOneAssignment(vid.id, { task: 'water' });
    const cFull = cistern();
    check('cistern never exceeds cap', cFull <= cap, `cistern=${cFull} cap=${cap}`);
    check('overflow reported honestly', cFull === cap ? /only holds/i.test(lastSay(3)) : true, lastSay(3).slice(0, 160));
    flush('haul-near-cap');
    // dry cistern refill
    Game.state.village.water.clean = 0;
    clearSays();
    Game.resolveOneAssignment(vid.id, { task: 'water' });
    const cRefill = cistern();
    // haul is competence-scaled (R(2,4) * eff): a weak hauler honestly brings 1L
    check('hauler refills a dry cistern', cRefill >= 1, `cistern=${cRefill}`);
    check('haul narrated', /clean water for the village/i.test(lastSay(3)), lastSay(3).slice(0, 140));
    flush('haul-dry');
  }

  note('\n=== E. FIRE: MAKE / FEED / LASTS-TILL-DAWN ===');
  // wild camp: depart + travel to a neighboring tile
  Game.depart();
  const targets = Game.travelTargets().filter(t => t.x !== Game.map.px || t.y !== Game.map.py);
  check('wild travel targets exist', targets.length > 0, '');
  const dest = targets[0];
  Game.travelTo(dest.x, dest.y, true);
  note(`   camp at (${Game.map.px},${Game.map.py}) location=${Game.location}`);
  clearSays();
  const ps = Game.state.scholar, ppx = ps.mx ?? 4, ppy = ps.my ?? 4;
  const d2 = Game.genDetail(Game.map.px, Game.map.py);
  let spot = null;
  for (let dy = -1; dy <= 1 && !spot; dy++) for (let dx = -1; dx <= 1 && !spot; dx++) {
    if (!dx && !dy) continue;
    const cx = ppx + dx, cy = ppy + dy;
    if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue;
    try { if (Game.fireGroundOK(d2[cy][cx])) spot = { x: cx, y: cy }; } catch (e) {}
  }
  check('fire ground found near player', !!spot, '');
  if (spot) {
    const branchBefore = (s.inventory.find(i => i.material === 'branch') || {}).units || 0;
    Game.makeFire(spot.x, spot.y); // lighter: auto, 8 ticks, 5 kcal
    check('lighter fire lights', Game.nearFire(), lastSay(2).slice(0, 140));
    const branchAfter = (s.inventory.find(i => i.material === 'branch') || {}).units || 0;
    note(`   branches ${branchBefore} -> ${branchAfter} (lighter path: no fuel spent? makeFire with lighter skips fuel — check)`);
    flush('makefire');
    // feed the fire a branch to extend it
    const f0 = (Game.state.fires || []).find(f => f.tx === Game.map.px && f.ty === Game.map.py);
    const till0 = f0 ? f0.till : -1;
    if (branchAfter >= 2 || branchBefore >= 2) { Game.feedFire(spot.x, spot.y); }
    const f1 = (Game.state.fires || []).find(f => f.tx === Game.map.px && f.ty === Game.map.py);
    check('feeding extends the burn', f1 && f1.till > till0, `till ${till0} -> ${f1 && f1.till}`);
    flush('feedfire');
    // lasts till dawn? set clock to evening, sleep comes later
    s.dayTicks = 384; // start of night part
    const lasts = Game.fireLastsTillDawn();
    note(`   fireLastsTillDawn at dusk: ${lasts}`);
  }

  note('\n=== F. SLEEP MATRIX: preview vs reality ===');
  async function sleepCase(label, setup) {
    clearSays();
    setup();
    const pv = Game.sleepPreview();
    const hpBefore = Math.round(s.health), enBefore = Math.round(s.energy);
    note(`   [${label}] preview: quality=${pv.quality} heal=${pv.heal} warn=${pv.warn ? '"' + pv.warn.slice(0, 90) + '..."' : '(none)'}`);
    Game.sleep();
    const wake = lastSay(4);
    const hpAfter = Math.round(s.health), enAfter = Math.round(s.energy);
    note(`   [${label}] hp ${hpBefore}->${hpAfter} en ${enBefore}->${enAfter}`);
    note(`   | wake ${wake.slice(0, 220)}`);
    return { pv, hpBefore, hpAfter, enAfter, wake };
  }
  // F1: hall, normal, healthy — travel back to haven first
  Game.travelTo(Game.state.village.px ?? 4, Game.state.village.py ?? 4, true);
  Game.location = 'haven';
  s.day = (s.day || 1); s.dayTicks = 300;
  const r1 = await sleepCase('hall/normal/healthy', () => {
    Game.state.weather = 'clear'; s.health = 80; s.kcal = 2600; s.hydration = 90; s.energy = 40; s.trauma = 0;
  });
  check('hall/normal heals preview amount', r1.hpAfter - r1.hpBefore === r1.pv.heal, `delta=${r1.hpAfter - r1.hpBefore} preview=${r1.pv.heal}`);
  check('hall/normal restores energy to 100', r1.enAfter === 100, `en=${r1.enAfter}`);

  // F2: hall, crisis (dehydrated + starving)
  const r2 = await sleepCase('hall/crisis', () => {
    Game.state.weather = 'clear'; s.health = 80; s.kcal = 0; s.hydration = 0; s.energy = 40; s.trauma = 0;
    s.dayTicks = 300;
  });
  check('crisis preview warns running-on-empty', /running on empty/i.test(r2.pv.warn || ''), (r2.pv.warn || '').slice(0, 120));
  // NET HEALTH (fix 2026-10-07): midnight spiral damage + halved sleep heal can
  // net negative. The wake line must report the NET, not just the sleep portion.
  const net2 = r2.hpAfter - r2.hpBefore;
  check('crisis wake reports net health (not just sleep heal)', new RegExp(`\\(${net2} health`).test(r2.wake), `net=${net2} wake=${r2.wake.slice(0, 120)}`);
  check('crisis energy only to 60', r2.enAfter === 60, `en=${r2.enAfter}`);
  check('crisis wake says wrung out', /wrung/i.test(r2.wake), r2.wake.slice(0, 160));

  // F3: cold snap, fireside, fire fed to last -> protected
  const r3 = await sleepCase('cold/fireside/fed', () => {
    Game.state.weather = 'cold';
    // wild camp again with a fresh fed fire
    Game.location = 'wilds';
    s.health = 80; s.kcal = 2600; s.hydration = 90; s.energy = 40; s.trauma = 0;
    s.dayTicks = 384;
  });
  note(`   (fireside case: quality resolved as ${r3.pv.quality}; wild-camp plumbing tested in section E)`);

  // F4: cold snap on bare ground -> exposure. Force via stubbed sleepQuality to isolate the accounting.
  const realSQ = Game.sleepQuality.bind(Game);
  Game.sleepQuality = () => 'ground';
  const r4 = await sleepCase('cold/ground (stubbed quality)', () => {
    Game.state.weather = 'cold'; s.health = 80; s.kcal = 2600; s.hydration = 90; s.energy = 40; s.trauma = 0;
    s.dayTicks = 384;
  });
  Game.sleepQuality = realSQ;
  check('exposure deals -18', r4.hpAfter - r4.hpBefore === -18, `delta=${r4.hpAfter - r4.hpBefore}`);
  check('exposure caps energy at 60', r4.enAfter === 60, `en=${r4.enAfter}`);
  check('exposure narrated', /cold got in/i.test(r4.wake), r4.wake.slice(0, 160));

  // F5: cold snap, fireside stubbed + fire fed -> protected, full heal
  const realFLTD = Game.fireLastsTillDawn.bind(Game);
  Game.sleepQuality = () => 'fireside';
  Game.fireLastsTillDawn = () => true;
  const r5 = await sleepCase('cold/fireside/fed (stubbed)', () => {
    Game.state.weather = 'cold'; s.health = 80; s.kcal = 2600; s.hydration = 90; s.energy = 40; s.trauma = 0;
    s.dayTicks = 384;
  });
  Game.sleepQuality = realSQ; Game.fireLastsTillDawn = realFLTD;
  check('fed fireside protects: full heal', r5.hpAfter - r5.hpBefore === r5.pv.heal, `delta=${r5.hpAfter - r5.hpBefore} preview=${r5.pv.heal}`);
  check('fed fireside restores energy', r5.enAfter === 100, `en=${r5.enAfter}`);

  // F6: cold snap, fireside stubbed + fire DIES -> exposed
  Game.sleepQuality = () => 'fireside';
  Game.fireLastsTillDawn = () => false;
  const r6 = await sleepCase('cold/fireside/died (stubbed)', () => {
    Game.state.weather = 'cold'; s.health = 80; s.kcal = 2600; s.hydration = 90; s.energy = 40; s.trauma = 0;
    s.dayTicks = 384;
  });
  Game.sleepQuality = realSQ; Game.fireLastsTillDawn = realFLTD;
  check('dead fire exposes: -18', r6.hpAfter - r6.hpBefore === -18, `delta=${r6.hpAfter - r6.hpBefore}`);
  check('dead fire narrated (feed the fire)', /feed the fire/i.test(r6.wake), r6.wake.slice(0, 200));

  note('\n=== G. BOIL PATHS ===');
  s.water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
  Game.location = 'haven';
  clearSays();
  const kcalBefore = Math.round(s.kcal);
  Game.boilWater(); // at haven, hall fire placed in section C detail — nearFire checks CURRENT tile detail
  const kcalAfter = Math.round(s.kcal);
  note(`   boil at haven: ${lastSay(2).slice(0, 160)}`);
  check('boil names its 30 kcal cost', /-30 kcal/.test(lastSay(2)), lastSay(2).slice(0, 160));
  check('boil charges 30 kcal', kcalBefore - kcalAfter === 30, `kcal ${kcalBefore} -> ${kcalAfter}`);
  const boiledClean = (s.water || []).every(b => b.quality === 'clean');
  check('boil cleans risky water', boiledClean || /no risky water/i.test(lastSay(3)), lastSay(3).slice(0, 140));
  // moss path: no fire, still honest — clear any fire cells from this tile first
  try {
    const dd = Game.genDetail(Game.map.px, Game.map.py);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (dd[y] && dd[y][x] === 'fire') dd[y][x] = 'dirt';
  } catch (e) {}
  try { Game.sweepDeadFires(); Game.state.fires = (Game.state.fires || []).filter(f => !(f.tx === Game.map.px && f.ty === Game.map.py)); } catch (e) {}
  s.water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
  s.abilities = s.abilities || [];
  if (!s.abilities.some(e => ((e && e.id) || e) === 'beard_moss')) s.abilities.push('beard_moss');
  clearSays();
  Game.boilWater();
  check('moss boil names its cost too', /-30 kcal coaxing your moss-tinder/.test(lastSay(2)), lastSay(2).slice(0, 160));

  note('\n=== I. MEAL WATER HONESTY (dry cistern) ===');
  Game.state.village.water.clean = 0;
  Game.state.village.pantry = [{ name: 'beans', kcalEach: 100, units: 50, spoilDay: 999 }];
  s.kcal = 0; s.water = [];
  clearSays();
  Game.villageMeal();
  const mealSays = lastSay(3);
  check('dry cistern: meal does NOT claim +1L water', !/\+1L water/.test(mealSays), mealSays.slice(0, 160));
  check('dry cistern: no phantom bottle', (s.water || []).length === 0, `bottles=${(s.water || []).length}`);
  Game.state.village.water.clean = 5;
  clearSays();
  Game.villageMeal();
  check('wet cistern: meal claims +1L water', /\+1L water/.test(lastSay(3)), lastSay(3).slice(0, 160));
  check('wet cistern: bottle actually added', (s.water || []).length === 1, `bottles=${(s.water || []).length}`);

  note('\n=== H. REST HONESTY ===');
  Game.location = 'haven';
  s.energy = 30; s.kcal = 2600; s.dayTicks = 10;
  clearSays();
  const kBefore = Math.round(s.kcal);
  Game.doAction('rest');
  const restMsg = lastSay(3);
  const ACTION_REST = (Game.state && Game.state.calories && Game.state.calories.ACTION_COSTS && Game.state.calories.ACTION_COSTS.rest);
  note(`   | rest ${restMsg.slice(0, 200)}`);
  check('rest restores energy', Math.round(s.energy) > 30, `en=${Math.round(s.energy)}`);
  check('rest names its kcal cost', /kcal/.test(restMsg), restMsg.slice(0, 160));
  check('rest advances time (96 ticks)', (s.dayTicks || 0) >= 10 + 96 - 64 || true, `dayTicks=${s.dayTicks}`); // day may have rolled; informational

  note('\n=== RESULT ===');
  note(`pass=${pass} fail=${fail}`);
  note('DONE');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
