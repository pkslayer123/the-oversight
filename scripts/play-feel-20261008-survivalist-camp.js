#!/usr/bin/env node
// SURVIVALIST playtest (2026-10-08): THE CAMP AUDIT.
// The player-camp system (Steve 2026-10-07, commit 4aa4b14) is the freshest
// survivalist content: tent + campfire -> "a shitty breakable version of a
// haven". This run lives out of a camp for 3 days and audits the promise:
//   "Sorting, resting, and camp rituals work here."
//   "wind, beasts, or bad luck can take it. Not safe like a haven."
// Also: the water filter chain (cloth + charcoal -> filter) vs boiling,
// fire-as-cooking-hub, and whether the wild survivalist needs the village.
// Seeded RNG BEFORE eval (load-time Math.random captures). Exit non-zero on
// any assertion failure.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
rng.reset = () => { /* re-seed by re-installing */ Math.random = mulberry32(SEED); };
Math.random = mulberry32(SEED); // installed BEFORE module eval
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(require(path.join(ROOT, f))) });
global.window = global; // equipment.js touches window at load
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'].forEach(f => eval(require('fs').readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;

const note = t => console.log(t);
const fails = [];
const ok = (name, cond, extra) => { console.log(`  [${cond ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails.push(name); };
const drain = () => { const l = (Game.log || []).map(x => x.text || x).join(' | '); Game.log.length = 0; return l; };
const S = () => Game.state.scholar;
const snap = () => `hyd=${Math.round(S().hydration || 0)} kcal=${Math.round(S().kcal || 0)} hp=${Math.round(S().health || 0)} en=${Math.round(S().energy || 0)} H2O=${(S().water || []).length}(${S().water.filter(b => b.quality === 'clean').length}c)`;

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
}
// wild node far from haven, with a creek tile and clear ground around player
function toCampSite() {
  const tiles = Game.map.tiles;
  let best = null;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x];
    if (!t || t.type === 'haven' || t.type === 'ruin') continue;
    const d = Math.abs(x - 3) + Math.abs(y - 3);
    if (d < 3) continue;
    if (!best || d > best.d) best = { x, y, d };
  }
  Game.map.px = best.x; Game.map.py = best.y;
  const t = tiles[best.y][best.x]; t.visited = true; t.revealed = true; t.type = 'creek';
  const s = S(); s.insideHaven = false; s.mx = 4; s.my = 4;
  // clear 3x3 of workable ground, water cell adjacent for fill flavor
  const detail = Game.genDetail(best.x, best.y);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) detail[y][x] = 'grass';
  detail[3][3] = 'water'; // adjacent water for fill flavor; fire goes on (4,3) grass
  return { tx: best.x, ty: best.y };
}
function kitSurvivalist() {
  const s = S();
  s.inventory = s.inventory || [];
  s.inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it on clear ground for shelter.' });
  s.inventory.push({ material: 'branch', name: 'Fallen branches', units: 12, kg: 0.3 });
  s.inventory.push({ itemId: 'lighter', id: 'lighter', name: 'Lighter', units: 1, kg: 0.05 });
  s.inventory.push({ material: 'charcoal', name: 'Charcoal', units: 2, kg: 0.1 });
  s.inventory.push({ itemId: 'cloth', id: 'cloth', name: 'Cloth', units: 1, kg: 0.2 });
  // raw meat: needs cleaning knowledge or a butcher; cookable once cleaned
  s.inventory.push({ name: 'Raw venison', units: 2, rawKcal: 400, cookedKcal: 900, foodKind: 'meat', edible: true, safe: false, foodState: 'raw' });
  s.water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }, { liters: 1, quality: 'risky', source: 'Creek (unknown)', chemical: true }];
  s.kcal = 2400; s.hydration = 80; s.health = 60; s.energy = 90;
  s.tools = s.tools || [];
}

async function main() {
await Game.init();
freshGame();
const site = toCampSite();
kitSurvivalist();
note('== site: wild creek node, day ' + S().day + ' ==');
note('   start: ' + snap());

// ---------- A. CAMP SETUP FLOW ----------
note('\n==== A. pitch tent + fire + setUpCamp ====');
Game.pitchTent(4, 5);
let d0 = drain();
ok('pitchTent says shelter', /Canvas up|shelter/i.test(d0), d0.slice(0, 90));
let detail = Game.genDetail(Game.map.px, Game.map.py);
ok('tent cell placed', detail[5][4] === 'tent', 'detail[5][4]=' + detail[5][4]);
Game.makeFire(4, 3); // lighter = fire on demand
d0 = drain();
ok('makeFire with lighter', /lighter catches|Fire on demand/i.test(d0), d0.slice(0, 90));
detail = Game.genDetail(Game.map.px, Game.map.py);
ok('fire cell placed', detail[3][4] === 'fire', 'detail[3][4]=' + detail[3][4]);
ok('canSetUpCamp true (tent+fire near)', Game.canSetUpCamp() === true);
Game.setUpCamp();
d0 = drain();
ok('camp state set', !!(Game.state.camp && Game.state.camp.px === Game.map.px), JSON.stringify(Game.state.camp));
ok('camp promise says breakable', /not a haven|breakable|wind/i.test(d0), d0.slice(0, 120));
ok('second camp refused', (Game.setUpCamp(), /already have a camp/i.test(drain())));
ok('canSetUpCamp false once camped', Game.canSetUpCamp() === false);

// ---------- B. CAMP RITUALS: sorting the bag ----------
note('\n==== B. sortBag ritual at player camp ====');
const plants = Game.data.plants || [];
const knownPid = plants[0] && plants[0].id, unknownPid = plants[1] && plants[1].id;
Game.identifyPlant(knownPid, 'taught');
drain(); // isolate: identifyPlant's own log line must not satisfy sortBag assertions
S().prepStash = [{ lump: true, name: 'Forage bag', units: 6, lump: { [knownPid]: { units: 3 }, [unknownPid]: { units: 3 } } }];
ok('atCamp true at player camp', Game.atCamp() === true);
Game.sortBag(null, 0);
d0 = drain();
ok('sortBag names the known plant', /spread the bag|naming:/i.test(d0) && new RegExp(plants[0].name.split(' ')[0], 'i').test(d0), d0.slice(0, 140));
ok('unknown stays a mystery', /mystery/i.test(d0), d0.slice(-120));
// away from camp: ritual refuses
const savedCamp = Game.state.camp;
Game.map.px = 3; Game.map.py = 3; // different node
S().prepStash = [{ lump: true, name: 'Forage bag', units: 3, lump: { [unknownPid]: { units: 3 } } }];
Game.sortBag(null, 0);
d0 = drain();
ok('sortBag refuses off-camp', /flat surface and good light|at camp/i.test(d0), d0.slice(0, 90));
Game.map.px = savedCamp.px; Game.map.py = savedCamp.py;

// ---------- C. SLEEP AT CAMP ----------
note('\n==== C. sleep: tent quality + cold snap protection ====');
ok('sleepQuality is tent (tent outranks fire)', Game.sleepQuality() === 'tent');
Game.state.weather = 'cold';
const prev = Game.sleepPreview();
ok('cold snap: tent warns nothing', !/exposed|hurt/i.test(prev.warn || ''), 'warn=' + (prev.warn || '(none)').slice(0, 80));
ok('tent heal value 25', prev.heal === 25, 'heal=' + prev.heal);
const hpBefore = Math.round(S().health || 0);
// advance to evening so sleep() allows it
Game.state.scholar.dayTicks = Game.TIME.TICKS_PER_DAY - Game.TIME.TICKS_PER_BATCH;
Game.sleep();
d0 = drain();
const hpAfter = Math.round(S().health || 0);
ok('tent sleep heals on cold night', hpAfter >= hpBefore, `before=${hpBefore} after=${hpAfter}`);
ok('no exposure bite in tent', !/cold got in|no healing/i.test(d0), d0.slice(-160));
note('   after night 1: ' + snap());

// ---------- D. CAMP BREAKING: the storm takes it ----------
note('\n==== D. storm front: the camp breaks (2026-10-08 fix) ====');
Game.state.weather = 'storm'; // daily rotation never rolls storms; documents the gap
Game.state.scholar.dayTicks = 0;
Game.endDay();
d0 = drain();
ok('daily weather never breaks camps (no storm state in rotation)', !!Game.state.camp, Game.state.camp ? 'still there' : 'GONE');
// the real storm: Storm Front event, caught out AT the camp
try { Game.evStormFront({}); } catch (e) { note('   (evStormFront: ' + e.message + ')'); }
drain();
const tentCellBefore = (() => { const dt = Game.genDetail(Game.state.camp.px, Game.state.camp.py); for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (dt[y][x] === 'tent') return x + ',' + y; return null; })();
ok('tent cell exists before storm', !!tentCellBefore, tentCellBefore);
try { Game.resolveStormFront(); } catch (e) { note('   (resolveStormFront: ' + e.message + ')'); }
d0 = drain();
ok('storm breaks the camp (caught out at it)', !Game.state.camp, d0.slice(0, 130));
const tentCellAfter = (() => { const dt = Game.genDetail(site.tx, site.ty); for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (dt[y][x] === 'tent') return x + ',' + y; return null; })();
ok('wrecked tent cell cleared from grid', !tentCellAfter, 'cell=' + tentCellAfter);
ok('wrecked tent NOT back in pack (it is wrecked)', !(S().inventory || []).some(i => i.kind === 'tent' && (i.units || 0) > 0));
ok('camp cannot be re-established on the wreck', Game.canSetUpCamp() === false);
ok('storm says the camp loss out loud', /camp is gone|storm tore/i.test(d0), d0.slice(-160));
// sheltered at Haven with a camp out there: the storm still takes it
note('   -- re-pitch far camp, shelter at Haven for the next storm --');
S().inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it on clear ground for shelter.' });
S().inventory.push({ material: 'branch', name: 'Fallen branches', units: 6, kg: 0.3 });
Game.map.px = site.tx; Game.map.py = site.ty; S().mx = 4; S().my = 4;
detail = Game.genDetail(site.tx, site.ty);
for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) if (detail[y][x] !== 'water') detail[y][x] = 'grass';
Game.pitchTent(4, 5); drain();
Game.makeFire(4, 3); drain();
Game.setUpCamp(); drain();
ok('far camp re-established', !!Game.state.camp);
const v = Game.state.village;
Game.map.px = v.px ?? 4; Game.map.py = v.py ?? 4; // Haven
try { Game.evStormFront({}); } catch (e) {}
drain();
try { Game.resolveStormFront(); } catch (e) { note('   (resolveStormFront: ' + e.message + ')'); }
d0 = drain();
ok('storm takes the distant camp too (you left it out there)', !Game.state.camp, d0.slice(-140));
// rebuild at the original site for the remaining sections
note('   -- rebuild camp at site for water/cook/rest sections --');
Game.map.px = site.tx; Game.map.py = site.ty; S().mx = 4; S().my = 4;
S().inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it on clear ground for shelter.' });
S().inventory.push({ material: 'branch', name: 'Fallen branches', units: 6, kg: 0.3 });
S().inventory.push({ itemId: 'lighter', id: 'lighter', name: 'Lighter', units: 1, kg: 0.05 });
detail = Game.genDetail(site.tx, site.ty);
for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) if (detail[y][x] !== 'water') detail[y][x] = 'grass';
detail[3][3] = 'water';
Game.pitchTent(4, 5); drain();
Game.makeFire(4, 3); drain();
Game.setUpCamp(); drain();
ok('camp rebuilt for remaining sections', !!Game.state.camp);
S().kcal = 2400; S().hydration = 80; S().health = 60; S().energy = 90;

// ---------- E. WATER: boil vs filter at camp ----------
note('\n==== E. water loop: boil vs filter ====');
// fire may have died overnight; re-light for the boil test
Game.sweepDeadFires && Game.sweepDeadFires();
detail = Game.genDetail(Game.map.px, Game.map.py);
if (detail[3][4] !== 'fire') { detail[3][4] = 'fire'; (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx: 4, cy: 3, till: Game._absTick() + 5000 }); }
S().kcal = 500; // top up: the storm sections may have drained the tank; the 30-kcal charge must be measurable
const kcalBefore = Math.round(S().kcal || 0);
const chemBefore = S().water.filter(b => b.chemical).length;
Game.boilWater();
d0 = drain();
const kcalAfter = Math.round(S().kcal || 0);
ok('boilWater cleans risky (non-chemical)', S().water.filter(b => b.quality === 'clean').length >= 1, d0.slice(0, 110));
ok('boilWater costs the named 30 kcal', kcalBefore - kcalAfter === 30, `cost=${kcalBefore - kcalAfter}`);
ok('chemical survives boiling (honest)', S().water.some(b => b.chemical && b.quality === 'risky'), d0.slice(-100));
// craft the filter: cloth + charcoal
S().tools.push({ recipeId: 'water_filter', name: 'Water filter', uses: 20 });
const usesBefore = S().tools.find(t => t.recipeId === 'water_filter').uses;
Game.filterWater();
d0 = drain();
const usesAfter = (S().tools.find(t => t.recipeId === 'water_filter') || {}).uses;
ok('filterWater strips chemical', !S().water.some(b => b.chemical), d0.slice(0, 120));
ok('filterWater consumes 1 use per liter', usesBefore - usesAfter === 1, `${usesBefore}->${usesAfter}`);
ok('all water clean now', S().water.every(b => b.quality === 'clean'));
// drink: clean first
S().hydration = 40;
Game.drinkWater();
d0 = drain();
ok('drinkWater drinks clean first', S().hydration > 40, 'hyd=' + Math.round(S().hydration));
// risky-only warning path
S().water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
S().hydration = 40;
Game.drinkWater();
d0 = drain();
ok('risky-only drink is honest', /risk|dice|hope|unknown/i.test(d0), d0.slice(0, 130));
note('   after water loop: ' + snap());

// ---------- F. FIRE AS COOKING HUB ----------
note('\n==== F. cookAll at the campfire ====');
const meatBefore = (S().inventory.find(i => i.name === 'Raw venison') || {}).rawKcal;
Game.cookAll();
d0 = drain();
const meatAfter = S().inventory.find(i => i.name === 'Raw venison');
ok('cookAll converts rawKcal', meatAfter && !meatAfter.rawKcal && meatAfter.kcalEach > 0, d0.slice(0, 100) + ` kcalEach=${meatAfter && meatAfter.kcalEach}`);
ok('cooked meat marked safe', meatAfter && meatAfter.safe === true);

// ---------- G. REST ECONOMICS ----------
note('\n==== G. rest at camp ====');
S().energy = 40;
const ticksBefore = S().dayTicks || 0;
Game.doAction('rest');
d0 = drain();
ok('rest recovers energy', (S().energy || 0) > 40, 'en=' + Math.round(S().energy || 0) + ' | ' + d0.slice(0, 100));

// ---------- H. MOVE CAMP: pack up, relocate, re-establish ----------
note('\n==== H. pack up and move camp ====');
Game.packTent(4, 5);
d0 = drain();
ok('packTent breaks the camp', !Game.state.camp, d0.slice(0, 100));
ok('tent back in pack', (S().inventory.find(i => i.kind === 'tent') || {}).units >= 1);
// relocate two nodes over, re-pitch, re-fire, re-camp
Game.map.px = site.tx - 1 > 0 ? site.tx - 1 : site.tx + 1;
S().mx = 4; S().my = 4;
detail = Game.genDetail(Game.map.px, Game.map.py);
for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) detail[y][x] = 'grass';
Game.pitchTent(4, 5); drain();
Game.makeFire(4, 3); drain();
ok('canSetUpCamp at new site', Game.canSetUpCamp() === true);
Game.setUpCamp(); drain();
ok('new camp established', !!Game.state.camp && Game.state.camp.px === Game.map.px);

// ---------- I. 3-DAY CAMP LEDGER (feel) ----------
note('\n==== I. 3-day camp ledger ====');
for (let day = 0; day < 3; day++) {
  S().kcal = Math.max(S().kcal, 2000); S().hydration = Math.max(S().hydration, 70);
  // morning chores: fill 2L risky, boil them
  S().water = [];
  Game.fillWater(); Game.fillWater(); drain();
  Game.boilWater(); drain();
  // gather fuel, feed fire for the night
  if (!S().inventory.some(i => i.material === 'branch' && i.units >= 1)) S().inventory.push({ material: 'branch', name: 'Fallen branches', units: 4, kg: 0.3 });
  detail = Game.genDetail(Game.map.px, Game.map.py);
  const f = (Game.state.fires || []).find(f => f.tx === Game.map.px && f.ty === Game.map.py);
  if (f && Game.feedFuel()) { Game.feedFire(f.cx, f.cy); drain(); }
  S().dayTicks = Game.TIME.TICKS_PER_DAY - Game.TIME.TICKS_PER_BATCH;
  Game.state.weather = day === 1 ? 'cold' : 'clear';
  Game.sleep(); drain();
  note(`   day ${day + 1} end: ` + snap() + ` weather=${day === 1 ? 'cold' : 'clear'}`);
}
ok('3 days at camp: alive', !Game.over && (S().health || 0) > 0, snap());
ok('camp still standing after 3 days', !!Game.state.camp);

note('\n==== RESULT: ' + fails.length + ' failures ====');
if (fails.length) { note('FAILED: ' + fails.join(' | ')); process.exit(1); }
note('ALL GREEN — camp fantasy holds: tent+fire+camp works, rituals fire, water loop honest.');
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
