// PROOF (Steve 2026-10-09, monster vectors): the giant mosquito and the alien
// tick are real map-visible monster fights carrying the alien viruses; ambient
// ticks/mosquitoes are narrated flavor carrying only the mild generic Fever.
// Lemons is ALIEN now (alien tick monster's bite only).
//
// Run: node scripts/test-monster-vectors-20261009.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
const rng = mulberry32(SEED);
Math.random = rng;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function clearSick() {
  const s = Game.state.scholar;
  for (const e of (Game.seList('scholar') || []).slice()) Game.seRemove('scholar', e);
  s.diseases = []; s.health = 100;
}
const realRandom = Math.random;
function forceR(v) { Math.random = () => v; }
function unforce() { Math.random = realRandom; }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  console.log(`seed=${SEED}`);

  // ---- 1. Lemons is alien ----
  const lem = Game.seDef('lemons');
  ok('lemons pool is alien', lem && lem.pool === 'alien');
  ok('seIsDisease rejects lemons', !Game.seIsDisease('lemons'));
  ok('lemons has no symptomLabel/class/mundane cure table', !lem.symptomLabel && !lem.class && Object.keys(lem.cure || {}).length === 0);
  ok('lemons is min-max shaped: transformation + drawback + ability',
    !!(lem.transformation && lem.transformation.length > 20) && lem.debuff && lem.debuff.energyMult === 0.85);
  ok('lemons permanent warping (no duration)', !lem.duration);
  const before = (Game.seList('scholar') || []).length;
  ok('contractDisease refuses lemons', Game.contractDisease('lemons', { source: 'test' }) === false);
  ok('refusal leaves status list untouched', (Game.seList('scholar') || []).length === before);
  // alien apply path works (monster bite uses applyStatus directly)
  clearSick();
  ok('applyStatus can still grant lemons (alien vector path)', Game.applyStatus('scholar', 'lemons', { source: 'test', silent: true }));
  ok('lemons debuff: energy x0.85', Game.diseaseDebuffs('scholar').energyMult === 0.85);
  ok('lemons tick: joint ache 1 HP/part', lem.tick && lem.tick.hp === 1 && lem.tick.per === 'dayPart');

  // ---- 2. monsters exist + spawn via wave tables ----
  const mq = Game.data.monsters.find(m => m.id === 'giant_mosquito');
  const tq = Game.data.monsters.find(m => m.id === 'alien_tick');
  ok('giant_mosquito def exists', !!mq);
  ok('alien_tick def exists', !!tq);
  ok('displayed plainly (the shock is it\'s just a bug)', mq.name === 'mosquito' && tq.name === 'tick');
  ok('both wave 2', mq.wave === 2 && tq.wave === 2);
  const _uw = Game.unlockedWave;
  Game.unlockedWave = () => 2;
  const pool = Game.monsterWavePool().map(m => m.id);
  ok('giant_mosquito in wave-2 spawn pool', pool.includes('giant_mosquito'));
  ok('alien_tick in wave-2 spawn pool', pool.includes('alien_tick'));
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(Game.castMonster().id || Game.castMonster());
  ok('castMonster can draw giant_mosquito', seen.has('giant_mosquito'), [...seen].slice(0, 12).join(','));
  ok('castMonster can draw alien_tick', seen.has('alien_tick'));
  Game.unlockedWave = _uw;

  // ---- 3. mosquito bite applies eurika OR east_nile (real fight) ----
  clearSick();
  Game.startCombat('giant_mosquito');
  let m = Game.tbfight.fighters.find(f => f.kind === 'monster');
  ok('mosquito fight starts', !!m && Game.mosquitoIs(m));
  const p = Game.tbFighter('p');
  m.mx = p.mx + 1; m.my = p.my; m.mosqPhase = 'dive'; // lined up, adjacent
  forceR(0.1); // bite roll: 50/50 -> eurika
  Game.tbMosquitoTurn(m);
  unforce();
  ok('mosquito bite applies eurika (forced roll)', Game.hasStatus('scholar', 'eurika'));
  ok('bite applies exactly one virus', !Game.hasStatus('scholar', 'east_nile'));
  ok('mosquito went heavy after drinking', m.mosqPhase === 'heavy');
  // already carrying one: no double infection
  m.mosqPhase = 'dive'; m.mx = p.mx + 1;
  forceR(0.9);
  Game.tbMosquitoTurn(m);
  unforce();
  ok('no second virus when already carrying', !Game.hasStatus('scholar', 'east_nile') && Game.hasStatus('scholar', 'eurika'));
  // heavy phase: weak blunder only, then back to circling
  const hpBefore = Game.tbFighter('p').hp;
  Game.tbMosquitoTurn(m); Game.tbMosquitoTurn(m);
  ok('heavy is the punish window (back to circle)', m.mosqPhase === 'circle');
  Game.tbfight.over = true; Game.tbfight = null;

  // ---- 4. tick bite applies lemons (real fight) ----
  clearSick();
  Game.startCombat('alien_tick');
  m = Game.tbfight.fighters.find(f => f.kind === 'monster');
  ok('tick fight starts', !!m && Game.tickIs(m));
  const p2 = Game.tbFighter('p');
  m.mx = p2.mx + 1; m.my = p2.my;
  forceR(0.1); // 50% lemons roll -> success
  Game.tbTickTurn(m);
  unforce();
  ok('tick latch applies lemons (forced roll)', Game.hasStatus('scholar', 'lemons'));
  ok('tick is latched', m.tickLatched === true);
  // feed 4 turns -> engorged, drops off
  s.inventory = (s.inventory || []).filter(i => (i.itemId || i.id) !== 'torch');
  for (let i = 0; i < 4; i++) Game.tbTickTurn(m);
  ok('4 feeds -> engorged, drops off', m.tickLatched === false && m.tickPhase === 'engorged');
  // torch burns it off
  m.tickLatched = true; m.tickFeeds = 0; m.tickPhase = 'latch';
  s.inventory.push({ itemId: 'torch', name: 'Pitch torch', units: 1, kg: 0.5 });
  Game.tbTickTurn(m);
  ok('torch burns a latched tick off', m.tickLatched === false);
  s.inventory = s.inventory.filter(i => (i.itemId || i.id) !== 'torch');
  Game.tbfight.over = true; Game.tbfight = null;

  // ---- 5. ambient mosquitoes: never alien ----
  clearSick();
  let alienHit = 0, feverHit = 0;
  const _tile = Game.playerTile;
  Game.playerTile = () => ({ type: 'wetland' });
  const _dp = Object.getOwnPropertyDescriptor(Game, 'dayPart');
  for (let i = 0; i < 400; i++) {
    clearSick();
    Game.dayPart = 2; // dusk
    s.day = 10;
    Game.diseaseVectorTick();
    if (Game.hasStatus('scholar', 'eurika') || Game.hasStatus('scholar', 'east_nile') || Game.hasStatus('scholar', 'lemons')) alienHit++;
    if (Game.hasStatus('scholar', 'disease')) feverHit++;
  }
  Game.playerTile = _tile;
  ok('ambient mosquitoes never grant alien viruses', alienHit === 0, `alien hits: ${alienHit}`);
  ok('ambient mosquitoes can grant mild fever (rare)', feverHit > 0 && feverHit < 40, `fever hits: ${feverHit}/400`);

  // ---- 6. ambient tick escalation: rises, never 100% ----
  Game.playerTile = () => ({ type: 'meadow' });
  Game.dayPart = 0;
  function feverRate(daysOn, trials) {
    let hits = 0;
    for (let i = 0; i < trials; i++) {
      clearSick();
      Game.applyStatus('scholar', 'tick_attached', { silent: true, source: 'test' });
      const te = Game.seList('scholar').find(e => e.id === 'tick_attached');
      s.day = 20; te.day = 20 - daysOn + 1; te.lastRollDay = null;
      Game.diseaseVectorTick();
      if (Game.hasStatus('scholar', 'disease')) hits++;
    }
    return hits / trials;
  }
  const r1 = feverRate(1, 600), r5 = feverRate(5, 600), r10 = feverRate(10, 600);
  console.log(`  info tick fever rate: day1=${(r1 * 100).toFixed(1)}% day5=${(r5 * 100).toFixed(1)}% day10=${(r10 * 100).toFixed(1)}%`);
  ok('day-1 rate near 3%', r1 > 0.005 && r1 < 0.08, `${(r1 * 100).toFixed(1)}%`);
  ok('rate escalates with days attached', r5 > r1 * 2, `d1=${(r1*100).toFixed(1)} d5=${(r5*100).toFixed(1)}`);
  ok('rate plateaus at the 15% cap (day5 ~= day10)', Math.abs(r10 - r5) < 0.06, `d5=${(r5*100).toFixed(1)} d10=${(r10*100).toFixed(1)}`);
  ok('rate capped ~15%, never guaranteed', r10 < 0.30, `${(r10 * 100).toFixed(1)}%`);
  Game.playerTile = _tile;

  // ---- 7. mundane deer tick: attaches ambient tick, never lemons ----
  clearSick();
  s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', units: 1, kg: 0.2 });
  s.inventory.push({ plantId: 'meat_white_tailed_deer', name: 'deer carcass', foodState: 'carcass', units: 1, kg: 20, spoilDay: 99 });
  const idx = s.inventory.length - 1;
  forceR(0.05); // force the 15% tick roll
  Game.cleanCarcass(idx);
  unforce();
  ok('deer tick attaches ambient tick', Game.hasStatus('scholar', 'tick_attached'));
  ok('deer tick never grants lemons', !Game.hasStatus('scholar', 'lemons') && !Game.hasStatus('scholar', 'disease'));
  s.inventory = [];

  // ---- 8. removeTick: gated removal ----
  clearSick();
  Game.applyStatus('scholar', 'tick_attached', { silent: true, source: 'test' });
  Game.grantKnowledge('technique', 'tick_removal', 1, { type: 'taught', by: 'test' });
  Game.removeTick();
  ok('removeTick with technique: clean removal', !Game.hasStatus('scholar', 'tick_attached') && !Game.hasStatus('scholar', 'wound_fever'));
  // blind attempt: success (occupation-granted triage would make this "known" — neutralize for the test)
  delete Game.state.codex.techniques.tick_removal;
  const _ha = Game.hasAbility;
  Game.hasAbility = (id) => ['triage', 'field_medicine', 'herbal_remedy'].includes(id) ? false : _ha.call(Game, id);
  Game.applyStatus('scholar', 'tick_attached', { silent: true, source: 'test' });
  forceR(0.1);
  Game.removeTick();
  unforce();
  ok('blind removal can succeed', !Game.hasStatus('scholar', 'tick_attached') && !Game.hasStatus('scholar', 'wound_fever'));
  // blind attempt: botch -> wound_fever
  Game.applyStatus('scholar', 'tick_attached', { silent: true, source: 'test' });
  forceR(0.9);
  Game.removeTick();
  unforce();
  ok('blind removal can botch (head stays in -> wound_fever)',
    !Game.hasStatus('scholar', 'tick_attached') && Game.hasStatus('scholar', 'wound_fever'));
  Game.hasAbility = _ha;

  // ---- 9. healer teaches tick removal ----
  clearSick();
  delete Game.state.codex.techniques.tick_removal;
  s.abilities = [];
  const v = Game.state.village;
  const hvId = (v.roster || []).find(id => id !== Game.villagerId);
  const hv = hvId && Game.getPerson(hvId);
  if (hv) hv.formerOccupation = 'nurse';
  const _ha2 = Game.hasAbility;
  Game.hasAbility = (id) => ['triage', 'field_medicine', 'herbal_remedy'].includes(id) ? false : _ha2.call(Game, id);
  const _pah = Game.playerAtHaven;
  Game.playerAtHaven = () => true;
  forceR(0.1); // pass the ~50%/day gate
  Game.villagerTickTeachTick();
  unforce();
  Game.playerAtHaven = _pah;
  Game.hasAbility = _ha2;
  ok('camp healer teaches tick_removal', !!((Game.state.codex.techniques || {}).tick_removal));

  // ---- 10. mappings: no alien leaks into mundane paths ----
  ok("villagerDiseaseId 'tick fever' -> 'disease'", Game.villagerDiseaseId({ name: 'tick fever' }) === 'disease');
  ok('no lemons in food.js deer path', !/contractDisease\('lemons'/.test(fs.readFileSync(path.join(ROOT, 'src/js/food.js'), 'utf8')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
