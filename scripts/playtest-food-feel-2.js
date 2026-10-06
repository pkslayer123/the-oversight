// Food/forager FEEL playtest #2: overnight pantry rot legibility, scarcity
// pressure, the forage->haul->identify->learn loop, per-item eating.
// Runs AS A PLAYER: multi-day survival with narrated experience log,
// plus node asserts for every food.js fix.
// Usage: node scripts/playtest-food-feel-2.js   (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
const drain = () => { const m = said.join(' '); said.length = 0; return m; };
const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};
const section = (t) => console.log('\n=== ' + t + ' ===');
const narr = (t) => console.log('  ' + t);
const invKcal = () => (Game.state.scholar.inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
const snapPantry = () => (Game.state.village.pantry || []).map(i => `${i.name}×${i.units}@sp${i.spoilDay}`);

function greenCells(t) {
  const out = [];
  if (!t.detail) return out;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const c = t.detail[y] && t.detail[y][x];
    if (c !== 'plant' && c !== 'bush' && c !== 'tree' && c !== 'bigtree') continue;
    if (t.detailRegrow && t.detailRegrow[x + ',' + y]) continue;
    out.push({ x, y, c });
  }
  return out;
}
function richestTile(s) {
  const v = Game.state.village;
  const hx = v.px ?? 3, hy = v.py ?? 3;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
  const cand = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.abs(x - hx) + Math.abs(y - hy);
    if (d < 1 || d > 2) continue;
    const t = Game.tileAt(x, y);
    if (!t || t.type === 'haven' || t.type === 'ruin') continue;
    cand.push({ x, y, t });
  }
  Game.travelTo(hx, hy);
  let best = null;
  for (const c of cand) {
    Game.travelTo(c.x, c.y);
    const g = greenCells(c.t).length;
    if (!best || g > best.g) best = { ...c, g };
  }
  Game.travelTo(best.x, best.y);
  return best;
}
const topStats = (s) => { s.kcal = 2400; s.hydration = 100; s.health = 100; s.energy = 100; };
const fresh = () => {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.scholar;
};

(async () => {
  await Game.init();

  // ================= PART A: narrated 3-day solo poor-knowledge run =================
  section('PART A — 3-day solo run, poor forager knowledge (narrated as a player)');
  const s = fresh();
  const v = Game.state.village;
  // poor knowledge: the player arrives knowing nothing local
  Game.state.codex.plants = {};
  v.taught = {};
  console.log(`day ${s.day}: I wake at Haven. kcal=${Math.round(s.kcal)} pack=${Math.round(invKcal())}kcal pantry=${Math.round(Game.pantryKcal())}kcal villagers=${(v.roster || []).length}`);
  const best = richestTile(s);
  narr(`richest natural tile nearby: (${best.x},${best.y}) type=${best.t.type} greenCells=${best.g}`);
  topStats(s);

  // DAY 1: forage
  section('DAY 1 — foraging (as a player)');
  let presses = 0, y0 = invKcal(), kcalSpent = 0, t0 = s.dayTicks || 0;
  const templates = {};
  for (let g = 0; g < 12; g++) {
    const greens = greenCells(best.t);
    if (!greens.length) { narr('tile picked clean'); break; }
    const gc = greens[0];
    s.mx = gc.x; s.my = gc.y;
    const before = s.kcal;
    drain(); Game.doAction('forage'); presses++;
    kcalSpent += Math.max(0, before - s.kcal);
    const m = drain();
    const key = m.replace(/\d+×/g, 'N×').replace(/\+?[\d,]+ kcal/g, 'K kcal').slice(0, 110);
    templates[key] = (templates[key] || 0) + 1;
  }
  const gained = invKcal() - y0;
  const ticks = (s.dayTicks || 0) - t0;
  narr(`12 presses (actual ${presses}): haul +${Math.round(gained)} kcal, cost ${Math.round(kcalSpent)} kcal + ${ticks} ticks`);
  narr(`~${(gained / Math.max(1, presses)).toFixed(0)} kcal/press — Steve's target village haul/day is 400-800`);
  console.log('  message templates this tile:');
  for (const [k, n] of Object.entries(templates)) console.log(`    [x${n}] ${k}`);

  // return, eat per-item from pack
  Game.returnToVillage(); drain();
  const edible = (s.inventory || []).map((it, idx) => ({ it, idx })).filter(({ it }) => it.edible && (it.kcalEach || 0) > 0);
  narr(`back at Haven with ${edible.length} edible stacks in pack. Eat button is gone — per-item Eat from Pack.`);
  for (const { it, idx } of edible.slice(0, 3)) {
    const kcalBefore = s.kcal;
    drain(); Game.eatOne(idx); const m = drain();
    narr(`ate 1x "${it.name}": kcal ${Math.round(kcalBefore)} -> ${Math.round(s.kcal)}`);
    for (const line of m.split(/(?<=[.!?])\s+/).slice(0, 3)) narr(`    "${line.slice(0, 140)}"`);
    break; // one is enough for feel; pack reindexes after splice
  }
  // stage the rest on the prep counter
  drain(); Game.stageForPrep();
  narr('stageForPrep: ' + drain().slice(0, 120));
  try {
    const urg = Game.stashUrgency().slice(0, 5);
    narr('prep counter triage (what the player can see):');
    for (const { it, left } of urg) narr(`    "${it.name}" — clock: ${Game.stashClock(it)}`);
  } catch (e) { narr('stashUrgency unavailable: ' + e.message); }

  section('DAY 1 -> 2 DAWN (narrated)');
  topStats(s); // isolate the rot from hunger deaths
  drain(); Game.endDay();
  const dawn = drain();
  const rotLines = dawn.split(/(?<=[.!?])\s+/).filter(l => /spoil|rot|rotten|mold|gone bad|wasted|flies|threw out/i.test(l));
  narr('rot/sweep lines the player actually saw at dawn:');
  for (const l of rotLines) narr(`    "${l.slice(0, 160)}"`);
  if (!rotLines.length) narr('    (none — nothing spoiled overnight this time)');
  narr(`after dawn: pack=${Math.round(invKcal())}kcal pantry=${Math.round(Game.pantryKcal())}kcal`);

  section('DAY 2 — identification legibility (as a player)');
  const lumps = (s.inventory || []).map((it, idx) => ({ it, idx })).filter(({ it }) => it.lump);
  narr(`unknown lumps in pack: ${lumps.length}`);
  if (lumps.length) {
    const { it, idx } = lumps[0];
    drain(); Game.testCautiously(idx, {}, s.inventory);
    const m = drain();
    narr(`testCautiously on "${it.name}" (costs an afternoon):`);
    for (const line of m.split(/(?<=[.!?])\s+/).slice(0, 4)) narr(`    "${line.slice(0, 150)}"`);
    narr(`    dayTicks after: ${s.dayTicks}`);
  } else {
    // stash the unknowns via stageForPrep then inspect the counter
    drain(); Game.stageForPrep(); drain();
    const st = Game.prepStash() || [];
    const lump = st.find(i => i.lump);
    narr(`lumps on prep counter: ${st.filter(i => i.lump).length}`);
    if (lump) {
      drain(); Game.testCautiously(st.indexOf(lump), {}, st);
      const m = drain();
      narr(`testCautiously from counter:`);
      for (const line of m.split(/(?<=[.!?])\s+/).slice(0, 4)) narr(`    "${line.slice(0, 150)}"`);
    }
  }
  // donate a perishable to the pantry — watch it rot under the village
  Game.travelTo(best.x, best.y); topStats(s);
  for (let g = 0; g < 4; g++) {
    const greens = greenCells(best.t);
    if (!greens.length) break;
    s.mx = greens[0].x; s.my = greens[0].y;
    drain(); Game.doAction('forage'); drain();
  }
  Game.returnToVillage(); drain();
  const perish = (s.inventory || []).map((it, idx) => ({ it, idx })).find(({ it }) => (it.spoilDay ?? 9999) <= s.day + 2 && (it.kcalEach || 0) > 0 && it.edible);
  if (perish) {
    narr(`donating perishable "${perish.it.name}" (spoils ~day ${perish.it.spoilDay}) to the communal pantry`);
    drain(); Game.donateToPantry(perish.idx);
    narr('donate says: ' + drain().slice(0, 140));
  } else narr('(no perishable to donate this run)');
  narr('pantry now: ' + JSON.stringify(snapPantry().slice(0, 6)));

  section('DAY 2 -> 3 DAWN (narrated — the rot mechanic)');
  topStats(s);
  drain(); Game.endDay();
  const dawn3 = drain();
  const rot3 = dawn3.split(/(?<=[.!?])\s+/).filter(l => /spoil|rot|rotten|mold|gone bad|wasted|flies|threw out/i.test(l));
  narr('rot/sweep lines at dawn:');
  for (const l of rot3) narr(`    "${l.slice(0, 180)}"`);
  if (!rot3.length) narr('    (none)');
  narr(`pantry after dawn: ${Math.round(Game.pantryKcal())}kcal across ${(v.pantry || []).length} stacks`);
  narr('stacks: ' + JSON.stringify(snapPantry().slice(0, 8)));

  // ================= PART B: communal week, perishable-first measurement =================
  section('PART B — communal week: what does villageEats actually consume?');
  const s2 = fresh();
  const v2 = Game.state.village;
  v2.taught = {};
  // controlled pantry: perishable stack (expires tomorrow) + durable control
  v2.pantry.push({ name: 'Fresh-picked berries', kcalEach: 100, units: 10, spoilDay: s2.day + 1, safe: true, kg: 0.2 });
  v2.pantry.push({ name: 'Control beans', kcalEach: 100, units: 300, spoilDay: 9999, safe: true, kg: 0.2 });
  for (let d = 0; d < 3 && !Game.over && !Game.villageLost; d++) {
    const before = snapPantry();
    const berriesBefore = (v2.pantry.find(p => p.name === 'Fresh-picked berries') || {}).units;
    const beansBefore = (v2.pantry.find(p => p.name === 'Control beans') || {}).units;
    topStats(s2);
    drain(); Game.endDay();
    const msgs = drain().split(/(?<=[.!?])\s+/).filter(l => /spoil|rot|rotten|mold|gone bad|wasted|flies|threw out|Village meal/i.test(l));
    const berriesAfter = (v2.pantry.find(p => p.name === 'Fresh-picked berries') || {}).units;
    const beansAfter = (v2.pantry.find(p => p.name === 'Control beans') || {}).units;
    console.log(`day ${s2.day}: berries ${berriesBefore}->${berriesAfter === undefined ? 'gone' : berriesAfter} | beans ${beansBefore}->${beansAfter}`);
    for (const l of msgs.slice(0, 3)) narr(`    "${l.slice(0, 150)}"`);
    if (Game.over || Game.villageLost) { narr('GAME OVER / VILLAGE LOST'); break; }
  }

  // ================= PART C: famine honesty =================
  section('PART C — famine honesty (3 days, empty pantry, no eating)');
  const s3 = fresh();
  const v3 = Game.state.village;
  v3.pantry = []; v3.pantryKcal = 0;
  v3.taught = {};
  s3.kcal = 0; // start empty — the player is already hungry
  const vHealth0 = Object.assign({}, v3.health);
  for (let d = 0; d < 3 && !Game.over && !Game.villageLost; d++) {
    drain(); Game.endDay();
    const hv = Object.entries(v3.health || {}).map(([k, h]) => `${k.split(' ')[0]}:${h}`).join(' ');
    console.log(`day ${s3.day}: player kcal=${Math.round(s3.kcal)} health=${Math.round(s3.health)} | villager health: ${hv.slice(0, 100)}`);
    if (Game.over || Game.villageLost) { narr('GAME OVER / VILLAGE LOST'); break; }
  }

  // ================= PART D: asserts =================
  section('PART D — asserts');
  const s4 = fresh();
  const v4 = Game.state.village;
  v4.taught = {};
  // A1: perishable pantry stack rots overnight and is announced BY NAME
  // (post-89dae4b the village eats perishable-first, so the stack must exceed
  // the village's daily need (~24k kcal) for berries to genuinely go uneaten)
  v4.pantry.push({ name: 'Fresh-picked berries', kcalEach: 100, units: 300, spoilDay: s4.day + 1, safe: true, kg: 0.2 });
  topStats(s4);
  said.length = 0; Game.endDay(); const a1 = drain();
  check('A1 pantry rot announced by name', /Fresh-picked berries/i.test(a1), a1.slice(-200));
  check('A2 rot message teaches preservation (what to DO about it)', /smok|dry|rack|fire/i.test(a1), a1.slice(-220));
  const noSpoiled = !(v4.pantry || []).some(i => Game.isSpoiled(i));
  check('A3 no spoiled stacks linger in pantry', noSpoiled);
  const derived = (v4.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  check('A4 pantryKcal honest after rot', Math.round(v4.pantryKcal) === Math.round(derived));
  // A5: pack rot announcement also teaches preservation when the player lacks it
  const s5 = fresh();
  s5.inventory.push({ name: 'Green stuff', kcalEach: 50, units: 4, spoilDay: s5.day + 1, safe: true, foodKind: 'plant', foodState: 'ready', edible: true });
  topStats(s5); said.length = 0; Game.endDay(); const a5 = drain();
  check('A5 pack rot teaches preservation when technique unknown', /smok/i.test(a5), a5.slice(-220));
  // A6: foodMarker shows the spoilage clock near the deadline (legibility)
  const near = { name: 'Berries', spoilDay: s5.day + 1, foodState: 'ready' };
  const mk = Game.foodMarker(near);
  check('A6 foodMarker flags food spoiling tomorrow', /tomorrow|SPOILING|spoils/i.test(mk), 'marker=' + mk);
  const far = { name: 'Beans', spoilDay: s5.day + 40, foodState: 'ready' };
  check('A7 foodMarker quiet for durable food', !/spoil/i.test(Game.foodMarker(far)), 'marker=' + Game.foodMarker(far));
  const dead = { name: 'Rot', spoilDay: s5.day - 1, foodState: 'ready' };
  check('A8 foodMarker quiet for fully spoiled (UI rows flag ⚠ spoiled)', Game.foodMarker(dead) === '', 'marker=' + Game.foodMarker(dead));
  const today = { name: 'Greens', spoilDay: s5.day, foodState: 'ready' };
  check('A9 stashClock SPOILING TODAY at left=0', Game.stashClock({ spoilDay: s5.day }) === 'SPOILING TODAY');
  check('A10 foodMarker SPOILING TODAY at left=0', /SPOILING TODAY/.test(Game.foodMarker(today)), 'marker=' + Game.foodMarker(today));
  const two = { name: 'Berries', spoilDay: s5.day + 2, foodState: 'ready' };
  check('A11 foodMarker countdown at left=2', /spoils in 2d/.test(Game.foodMarker(two)), 'marker=' + Game.foodMarker(two));
  const ulump = { name: 'unknown shoots', spoilDay: s5.day + 1, foodState: 'unknown', lump: true };
  const um = Game.foodMarker(ulump);
  check('A12 unknown lump marker keeps mystery AND clock', /unknown/.test(um) && /spoils tomorrow/.test(um), 'marker=' + um);
  // A13: once the player knows preservation, the village message shortens (no re-teaching)
  // (300 units: village eats perishable-first post-89dae4b, so the stack must
  // exceed daily need for rot to genuinely occur)
  const s7 = fresh();
  const v7 = Game.state.village;
  Game.learnTechnique('preserve', 'trial');
  v7.pantry.push({ name: 'Fresh-picked berries', kcalEach: 100, units: 300, spoilDay: s7.day + 1, safe: true, kg: 0.2 });
  topStats(s7); said.length = 0; Game.endDay(); const a13 = drain();
  check('A13 village rot message shortens when preservation known', /smoke rack going cold/.test(a13) && !/Old Mara/.test(a13), a13.slice(-200));
  check('A10 eatOne refuses spoiled mid-day', (() => {
    const s6 = fresh();
    s6.inventory.push({ name: 'Bad greens', kcalEach: 50, units: 2, spoilDay: s6.day, safe: true, foodKind: 'plant', foodState: 'ready', edible: true });
    said.length = 0; Game.eatOne(s6.inventory.length - 1);
    const m = drain();
    return /went bad|beyond eating|Nothing edible/i.test(m) && s6.inventory.some(i => i.name === 'Bad greens');
  })());

  console.log('\n' + (failures.length ? `FAILURES: ${failures.join('; ')}` : 'ALL FOOD-FEEL TESTS PASS'));
  if (failures.length) process.exit(1);
})().catch(e => { console.error('PLAYTEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
