#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07): SURVIVALIST 7 — THE WATER-WISE GAUNTLET.
// Archetype 3 (survivalist): water, fire, shelter, rest, needs management.
// Fresh ground vs survivalist 1-6 (haven cistern honesty, long-march nomadism):
// the WILD-WATER loop end to end — creek findability, fill honesty, the risky
// drink gamble (30%), boil economy at a wild camp, the dehydration spiral, and
// the disease -> herbal_remedy cure chain (surfaced the ghost-disease bug).
// Judge like a player: is wild water fun logistics or a chore? Does the body
// feel real? Where does the fiction lie?
// Run: node scripts/play-feel-20261007-survivalist7.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '21', 10);
Math.random = mulberry32(SEED);
// FULL PRODUCTION SCRIPT LIST, index.html order, minus DOM-only modules.
// drama.js excluded (2026-10-07): top-level document access crashes node eval.
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function drainSays() { const t = says.splice(0); return t; } // capture BEFORE any check
function show(tag, arr, max = 3) { for (const t of arr.slice(0, max)) note(`   | ${tag} ${String(t).slice(0, 170)}`); }
function lastOf(arr) { return arr.length ? String(arr[arr.length - 1]) : ''; }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const s = () => Game.state.scholar;
function vstate(label) {
  note(`   [${label}] day=${s().day} part=${Game.dayPart} ticks=${s().dayTicks} hp=${Math.round(s().health)} kcal=${Math.round(s().kcal)} hyd=${Math.round(s().hydration)} en=${Math.round(s().energy)} H2O=${(s().water || []).length}L pack=${(Game.packWeight() || 0).toFixed(1)}/${(Game.packCapacity ? Game.packCapacity() : '?')} tile=(${Game.map.px},${Game.map.py})`);
}
// resolve a turn-based fight by fleeing through the node barrier (grid edges).
// Bounded: never spins forever; the player may take hits — that's the cost.
function resolveFight() {
  let guard = 0;
  const hp0 = Math.round(s().health || 0);
  while (Game.tbfight && !Game.tbfight.over && !Game.state.over && guard++ < 40) {
    try {
      if (!Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); continue; }
      const p = Game.tbFighter('p');
      if (!p) break;
      const tx = (p.mx ?? 4) < 4 ? 0 : 8;
      if (!Game.tbPlayerMove(tx, p.my ?? 4)) Game.tbPlayerWait();
    } catch (e) { break; }
  }
  Game.log.length = 0; drainSays();
  return { fled: !Game.tbfight || !!Game.tbfight.over, tookHit: hp0 - Math.round(s().health || 0), guard };
}
function clearCells() {
  const out = [];
  try {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
      const c = detail[y] && detail[y][x];
      if (['dirt', 'grass', 'clearing', 'path'].indexOf(c) !== -1) out.push([x, y]);
    }
  } catch (e) {}
  return out;
}
function treeCells() {
  const out = [];
  try {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
      const c = detail[y] && detail[y][x];
      if (c === 'tree' || c === 'bigtree') out.push([x, y]);
    }
  } catch (e) {}
  return out;
}
// fuel like a player: deadfall first, cut if needed (survivalist6 pattern)
function gatherFuel() {
  for (const [cx, cy] of treeCells().slice(0, 3)) {
    try { Game.doAction('forage', { cx, cy }); } catch (e) {}
  }
  drainSays();
  let branches = Game.materialCount('branch');
  if (branches < 2 && Game.woodCount() < 1) {
    const tc = treeCells()[0];
    if (tc) {
      // walk up to the tree like a player would (cutTree needs adjacency)
      s().mx = Math.max(1, Math.min(7, tc[0] + (tc[0] < 7 ? 1 : -1)));
      s().my = tc[1];
      try { Game.cutTree(tc[0], tc[1]); } catch (e) {} drainSays();
    }
    branches = Game.materialCount('branch');
  }
  return branches >= 2 || Game.woodCount() >= 1;
}
function makeFire() {
  if (!gatherFuel()) return false; // no fuel on this tile — honest scarcity
  const clears = clearCells();
  if (!clears.length) return false;
  const [fx, fy] = clears[0];
  s().mx = Math.max(1, Math.min(7, fx + (fx < 7 ? 1 : -1)));
  s().my = Math.max(1, Math.min(7, fy));
  if (s().mx === fx && s().my === fy) s().mx = Math.max(1, fx - 1);
  Game.makeFire(fx, fy);
  return Game.nearFire();
}

(async () => {
  await Game.init();
  note(`seed=${SEED}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const sch = s();
  sch.health = 100; sch.kcal = 2600; sch.hydration = 90; sch.energy = 100;
  sch.inventory = (sch.inventory || []).concat([
    { itemId: 'knife', name: 'Knife', units: 1, kg: 0.4 },
    { itemId: 'hatchet', name: 'Hatchet', units: 1, kg: 1.2 },
    { itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.05 },
    { itemId: 'camp_pot', name: 'Camp pot', units: 1, kg: 0.8 },
  ]);
  sch.water = [];
  drainSays();

  note('\n=== ACT 1: find water in the wild, fill honestly ===');
  const cist0 = (Game.state.village.water || {}).clean;
  Game.fillWater(); drainSays();
  check('haven fill draws the cistern', ((Game.state.village.water || {}).clean || 0) === cist0 - 1);
  check('haven fill is clean quality', (s().water[s().water.length - 1] || {}).quality === 'clean');
  Game.depart(); drainSays();

  // a player walks outward looking for water — scan targets at any range
  let creekT = null;
  for (let attempt = 0; attempt < 4 && !creekT; attempt++) {
    const targets = Game.travelTargets();
    creekT = targets.find(t => { const tl = Game.tileAt(t.x, t.y); return tl && tl.type === 'creek'; });
    if (!creekT && targets.length) { drainSays(); Game.travelTo(targets[0].x, targets[0].y); }
  }
  check('creek tiles exist in the generated world (a player can walk to water)', !!creekT, `scanned ${4} target sets`);
  if (creekT) {
    drainSays(); Game.travelTo(creekT.x, creekT.y);
    const arr = drainSays(); show('travel', arr, 2);
    const tt = Game.playerTile();
    check('standing on a creek tile', tt && tt.type === 'creek', `type=${tt && tt.type}`);
    check('a creek tile is not haven (fill will be risky, not cistern)', !(tt && tt.type === 'haven'));
  }
  vstate('at-water');

  const kcalBefore = s().kcal;
  const h20Before = (s().water || []).length;
  Game.fillWater();
  const fillLines = drainSays(); show('creek-fill', fillLines, 1);
  const b = (s().water || [])[s().water.length - 1] || {};
  check('creek fill is risky quality', b.quality === 'risky', `quality=${b.quality}`);
  check('creek fill names the source honestly', /unknown/i.test(fillLines.join(' ') + b.source), lastOf(fillLines).slice(0, 90));
  check('fill costs 10 kcal (hauling is work)', Math.round(kcalBefore - s().kcal) === 10, `spent ${Math.round(kcalBefore - s().kcal)}`);
  check('fill adds exactly 1L', (s().water || []).length === h20Before + 1);
  check('creek fill does NOT touch the cistern', ((Game.state.village.water || {}).clean || 0) === cist0 - 1);

  let fills = 1;
  while (fills < 40) { const n0 = (s().water || []).length; Game.fillWater(); fills++; if ((s().water || []).length === n0) break; }
  const refuseLines = drainSays();
  check('water has mass — the pack refuses when full', /full|heavy|weight|carry/i.test(refuseLines.join(' ')), lastOf(refuseLines).slice(0, 100));
  note(`   (filled to ${(s().water || []).length}L before refusal)`);
  vstate('water-laden');

  note('\n=== ACT 2: the risky drink gamble ===');
  // drop the clean haven bottles: a nomad away from home drinks creek water
  s().water = (s().water || []).filter(x => x.quality === 'risky');
  s().hydration = 40; s().health = 100;
  delete (Game.state.codex || {}).waterWise;
  Game.drinkWater();
  const d1 = drainSays(); show('drink-risky', d1, 1);
  check('risky drink narrates the gamble honestly', /lucky|gamble|risky|stomach/i.test(d1.join(' ')), lastOf(d1).slice(0, 100));
  // force the sick path for the coaching check
  let sick = false, sickText = '';
  for (let i = 0; i < 4 && !sick; i++) {
    if (!(s().water || []).some(x => x.quality === 'risky')) break;
    s().hydration = 40; const hp0 = s().health;
    const realR = Math.random; Math.random = () => 0.05;
    Game.drinkWater(); Math.random = realR;
    const dl = drainSays();
    if (s().health < hp0) { sick = true; sickText = dl.join(' '); }
  }
  check('risky drink CAN sicken (-15 health)', sick, 'forced-fail never landed');
  if (sick) {
    check('sick line names the cost', /-15|stomach/i.test(sickText), sickText.slice(0, 110));
    check('sick line teaches (boil next time)', /boil/i.test(sickText), sickText.slice(0, 110));
    check('learned the hard way: waterWise set', !!(Game.state.codex || {}).waterWise);
    check('risky-drink sickness is one-shot, NOT a lingering disease (design: cramps vs fever)', (s().diseases || []).length === 0, `diseases=${(s().diseases || []).length}`);
  }
  s().hydration = 96;
  const n0 = (s().water || []).length;
  Game.drinkWater();
  const nt = drainSays(); show('not-thirsty', nt, 1);
  check('not thirsty — save it (no quiet liter tax)', (s().water || []).length === n0, lastOf(nt).slice(0, 80));
  vstate('post-drinks');

  note('\n=== ACT 3: boil economy at a wild camp ===');
  s().hydration = 50;
  check('clear ground exists for a camp', clearCells().length > 0);
  check('fire lights', makeFire());
  const k0 = Math.round(s().kcal);
  const riskyN = (s().water || []).filter(x => x.quality === 'risky').length;
  Game.boilWater();
  const bl = drainSays(); show('boil', bl, 1);
  check('boil converts all risky to clean', (s().water || []).every(x => x.quality !== 'risky'), `still risky=${(s().water || []).filter(x => x.quality === 'risky').length}/${riskyN}`);
  check('boil names the 30 kcal tax', /-30|30 kcal/i.test(bl.join(' ')), lastOf(bl).slice(0, 110));
  check('boil charged exactly 30 kcal', Math.round(k0 - s().kcal) === 30, `spent ${Math.round(k0 - s().kcal)}`);
  Game.boilWater();
  const bl2 = drainSays(); show('boil2', bl2, 1);
  check('second boil with no risky water is honest', /no risky/i.test(bl2.join(' ')), lastOf(bl2).slice(0, 80));
  const h0 = s().hydration;
  Game.drinkWater();
  drainSays();
  check('clean drink hydrates +50', Math.round(s().hydration - h0) === 50, `+${Math.round(s().hydration - h0)}`);
  vstate('post-boil');

  note('\n=== ACT 4: the dehydration spiral ===');
  // burn the day's ticks so sleep is legal (dawn refusal is honest design);
  // fights on the march get fled first (a real night, not a refused one)
  Game.tickAction(200); drainSays();
  if (Game.tbfight && !Game.tbfight.over) {
    const r = resolveFight();
    note(`   (fled a fight on the march: tookHit=${r.tookHit}, guard=${r.guard})`);
  }
  s().hydration = 20; s().kcal = 2600; s().health = 100; s().energy = 100;
  const prev = Game.sleepPreview();
  check('sleep preview telegraphs the night drink (hyd <= 35)', /35 hydration/i.test(prev.warn || ''), (prev.warn || '').slice(0, 120));
  s().hydration = 0;
  const prev0 = Game.sleepPreview();
  check('sleep preview warns on empty (no recovery tonight)', /empty|no water/i.test(prev0.warn || ''), (prev0.warn || '').slice(0, 120));
  const hpB = Math.round(s().health), enB = Math.round(s().energy);
  Game.sleep();
  const sl = drainSays(); show('sleep-dry', sl, 4);
  check('the dry night voices DEHYDRATED (no silent spiral)', /dehydrat/i.test(sl.join(' ')), 'no DEHYDRATED voice found');
  check('dry night costs health', Math.round(s().health) < hpB, `hp ${hpB} -> ${Math.round(s().health)}`);
  check('dry night costs energy', Math.round(s().energy) < enB, `en ${enB} -> ${Math.round(s().energy)}`);
  check('survived the night (not an insta-kill)', !Game.state.over, `over=${!!Game.state.over}`);
  vstate('dry-morning');

  note('\n=== ACT 5: disease -> herbal_remedy chain ===');
  s().health = 100; s().hydration = 80; s().kcal = 2600; s().energy = 100;
  s().abilities = (s().abilities || []).concat([{ id: 'herbal_remedy', name: 'Herbal Remedy', level: 1, xp: 0 }]);
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'the bad water' });
  const ap = drainSays(); show('apply', ap, 1);
  check('disease applies with a voice (fever by nightfall)', /fever/i.test(ap.join(' ')), lastOf(ap).slice(0, 110));
  check('legacy bridge mirrors s.diseases', (s().diseases || []).length > 0);
  const hpD0 = Math.round(s().health);
  drainSays();
  for (let i = 0; i < 8; i++) { Game.advancePart(); }
  const tk = drainSays();
  const feverN = (tk.join(' ').match(/fever/gi) || []).length;
  check('disease ticks across day parts (fever voice)', feverN > 0, `fever mentions=${feverN}`);
  check('disease ticks cost health (-2/part)', Math.round(s().health) < hpD0, `hp ${hpD0} -> ${Math.round(s().health)}`);
  check('disease expires on its own AND clears the legacy mirror (fixed)', engine0() === 0 && (s().diseases || []).length === 0, `engine=${engine0()}, legacy=${(s().diseases || []).length}`);
  // re-apply and cure mid-course
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'the bad water' });
  drainSays();
  Game.activateAbility('herbal_remedy');
  const cu = drainSays(); show('remedy', cu, 2);
  check('herbal_remedy cures engine + legacy', engine0() === 0 && (s().diseases || []).length === 0, cu.join(' ').slice(0, 100));
  check('cure narrates (no silent cure)', /fever breaks|cured|remedy/i.test(cu.join(' ')), lastOf(cu).slice(0, 120));
  Game.activateAbility('herbal_remedy');
  const cu2 = drainSays(); show('remedy2', cu2, 1);
  check('remedy once-per-day gate is honest', /already used|not sick/i.test(cu2.join(' ')), lastOf(cu2).slice(0, 80));
  vstate('cured');

  note(`\nRESULT: ${pass} ok, ${fail} FAIL (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
  function engine0() { return (s().statuses || []).filter(x => x.id === 'disease').length; }
})().catch(e => { console.error('SCRIPT ERROR:', e && e.message, e && e.stack && e.stack.split('\n')[1]); process.exit(2); });
