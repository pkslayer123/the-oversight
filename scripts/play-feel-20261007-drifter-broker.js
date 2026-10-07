#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-07), DRIFTER archetype run 7 — "the knowledge broker".
// NEW territory: the drifter as KNOWLEDGE BRIDGE. Drift to a distant village,
// study their codex, learn plants you don't know, come home, teach YOUR people.
// The beats under test:
//   (a) while studying AWAY: does home "watch" you learn? (identifyPlant's
//       witness line + plantRumor seeding + spreadPlantKnowledge teaching home
//       villagers from the absent player — all while you're 20 tiles away)
//   (b) on a KNOWLEDGE-ONLY return (no food haul): does any teaching moment
//       fire? returnToVillage's teaching moment is gated on brought>0 ||
//       hasUnprocessed — the broker who brings KNOWLEDGE instead of food gets
//       no beat, and their plants never get taught around home's fire.
//   (c) the broker's payoff: do the learned plants reach home's taught[] and
//       get spoken about, turning the drift into village food (KNOWLEDGE FEEDS)?
// Played as a player, judged like a player. RNG seeded mulberry32
// (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };

const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, extra) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const flush = (tag, re, n) => {
  const hit = says.filter(t => re.test(t));
  for (const t of hit.slice(0, n || 8)) note(`   ${tag} ${String(t).slice(0, 220)}`);
};
const dname = (vid) => { try { return Game.displayName(vid); } catch (e) { return String(vid); } };
function giveFood(kcalEach, units, name) {
  Game.state.scholar.inventory.push({ name: name || 'Trail ration', kcalEach, units, spoilDay: 9999, safe: true, kg: 0.2, unit: 'pack', edible: true, foodState: 'ready', foodKind: 'plant', ration: true });
}
function eatUp() {
  const s = Game.state.scholar;
  let guard = 0;
  while ((s.kcal || 0) < 2200 && guard++ < 60 && !Game.over) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && i.edible !== false);
    if (idx < 0) break;
    try { Game.eatOne(idx); } catch (e) { break; }
  }
}
function waterUp() {
  const s = Game.state.scholar;
  says.length = 0;
  try { Game.fillWater(); } catch (e) {}
  try { Game.drinkWater(); } catch (e) {}
  const refused = says.some(t => /pack is full/i.test(t));
  says.length = 0;
  if (refused && (s.hydration || 0) < 40) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0);
    if (idx >= 0) { s.inventory.splice(idx, 1); note('   (dropped a food stack to make room for water)'); }
  }
}
function dayTick(label) {
  says.length = 0;
  try { Game.endDay(); } catch (e) { note(`   !! ENDDAY ERROR: ${e.message}`); }
  says.length = 0;
  eatUp();
  waterUp();
  if (label) note(`   [${label}] day=${Game.state.scholar.day}`);
}
function walkTo(tx, ty, tag) {
  const allLines = [];
  const visited = new Set();
  note(`   walking to (${tx},${ty})${tag ? ' [' + tag + ']' : ''}:`);
  for (let step = 0; step < 60 && !Game.over; step++) {
    const dist = Math.abs(Game.map.px - tx) + Math.abs(Game.map.py - ty);
    if (dist === 0) break;
    visited.add(Game.map.px + ',' + Game.map.py);
    const opts = Game.travelTargets().filter(t => t.d === 1);
    if (!opts.length) { note('   !! no adjacent travel targets — stuck'); break; }
    opts.sort((a, b) => {
      const av = visited.has(a.x + ',' + a.y) ? 100 : 0, bv = visited.has(b.x + ',' + b.y) ? 100 : 0;
      return (Math.abs(a.x - tx) + Math.abs(a.y - ty) + av) - (Math.abs(b.x - tx) + Math.abs(b.y - ty) + bv);
    });
    const bx = Game.map.px, by = Game.map.py;
    // try options in order — a blocked tile (creek) is routed around, not fatal
    let moved = false;
    for (const o of opts) {
      says.length = 0;
      Game.travelTo(o.x, o.y);
      const lines = says.splice(0);
      for (const l of lines) allLines.push(String(l));
      if (Game.map.px !== bx || Game.map.py !== by) { moved = true; break; }
    }
    if (!moved) { note(`   !! step ${step + 1}: all adjacent tiles blocked`); break; }
  }
  note(`   arrived: (${Game.map.px},${Game.map.py})`);
  return allLines;
}
const myPlants = () => Object.keys(Game.state.codex.plants || {});
const meId0 = null; // set after Game.init
const homeTaughtCount = (pid) => (Game.state.village.roster || []).filter(rid => rid !== Game.villagerId && ((Game.state.village.taught || {})[rid] || []).includes(pid)).length;

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  note(`=== DRIFTER RUN 7 — "the knowledge broker" (seed ${_seed}) ===`);

  // ================= ACT 1: home, days 1-3 =================
  Game.genRoster('Columbus, Ohio');
  const pick = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, pick.id);
  Game.depart();
  const s = Game.state.scholar;
  const meId = Game.villagerId;
  const homeName = Game.state.village.name;
  giveFood(350, 40, 'Smoked fish');
  giveFood(300, 30, 'Parched corn');
  const homeRoster = (Game.state.village.roster || []).filter(id => id !== meId);
  const homePx = Game.state.village.px ?? 4, homePy = Game.state.village.py ?? 4;
  note(`\n=== ACT 1: home days 1-3 (${homeName}) ===`);
  note(`   I know ${myPlants().length} plants. home taught[me]=${((Game.state.village.taught || {})[meId] || []).length}`);
  for (let d = 0; d < 3 && !Game.over; d++) dayTick('home d' + (d + 1));
  const knownBefore = new Set(myPlants());

  // ================= ACT 2: walk to a distant village =================
  note(`\n=== ACT 2: the walk ===`);
  const myCodex = Game.state.codex.plants || {};
  const ovs = (Game.state.otherVillages || []).filter(v => v.x !== Game.map.px || v.y !== Game.map.py)
    .sort((a, b) => (Math.abs(a.x - Game.map.px) + Math.abs(a.y - Game.map.py)) - (Math.abs(b.x - Game.map.px) + Math.abs(b.y - Game.map.py)));
  const dest = ovs[0];
  check('a distant village exists to drift to', !!dest, dest ? `${dest.name} at (${dest.x},${dest.y})` : 'none');
  if (!dest) { note('!! no distant village'); process.exit(1); }
  walkTo(dest.x, dest.y, 'out to ' + dest.name);
  // first sight generates the village (catch-up sim); THEN count new plants
  const gen = (Game.state.otherVillages || []).find(v => v.id === dest.id);
  const codexNow = (gen && gen.codex && gen.codex.plants) || {};
  const newPlants = Object.keys(codexNow).filter(pid => !knownBefore.has(pid));
  note(`   first sight: ${gen.name} — knows ${Object.keys(codexNow).length} plants, ${newPlants.length} new to me`);
  check('village codex holds plants I do not know', newPlants.length > 0, `${newPlants.length} new plants`);
  if (!newPlants.length) { note('!! nothing to broker this seed'); process.exit(1); }
  // leak-pure baseline: who at home already knows these plants BEFORE I study?
  const baselineTaught = {};
  for (const pid of newPlants) baselineTaught[pid] = homeTaughtCount(pid);
  note(`   home already knows (taught counts): ${newPlants.map(pid => { const p = (Game.data.plants || []).find(x => x.id === pid); return (p ? p.name : pid) + '=' + baselineTaught[pid]; }).join(', ')}`);
  const atHavenNow = Game.playerAtHaven();
  check('player is genuinely away (playerAtHaven false)', !atHavenNow, `playerAtHaven()=${atHavenNow}`);

  // ================= ACT 3: study their codex =================
  note(`\n=== ACT 3: study ${dest.name}'s codex ===`);
  const dist = Math.abs(dest.x - Game.map.px) + Math.abs(dest.y - Game.map.py);
  note(`   distance to village center: ${dist}`);
  says.length = 0;
  const studyResult = Game.studyVillageCodex(dest.id);
  const studySay = says.splice(0).map(String);
  const gained = myPlants().filter(pid => !knownBefore.has(pid));
  note(`   study result: ${String(studyResult).slice(0, 120)}`);
  note(`   gained ${gained.length} new plants: ${gained.map(pid => { const p = (Game.data.plants || []).find(x => x.id === pid); return p ? p.name : pid; }).join(', ')}`);
  check('studied codex and learned new plants', gained.length > 0, `${gained.length} plants`);
  const watchLines = studySay.filter(t => /was watching/i.test(t));
  note(`   "was watching" lines at study time: ${watchLines.length}`);
  for (const t of watchLines) note(`      !! ${t.slice(0, 180)}`);
  check('no home witness line while away', watchLines.length === 0);
  const rumorsNow = Object.keys(Game.state.village.plantRumors || {}).filter(pid => gained.includes(pid));
  note(`   home plantRumors seeded for learned plants (while away): ${rumorsNow.length}`);
  check('no home rumor seeded while away', rumorsNow.length === 0);
  check('player personally knows the plants (codex grew)', gained.every(pid => Game.plantKnown(pid)));
  const queued = (Game.state.scholar.awayLearned || []).filter(pid => gained.includes(pid));
  note(`   awayLearned queue: ${queued.length}/${gained.length}`);
  check('away-learned plants queued for the homecoming (not leaked)', queued.length === gained.length);

  // ================= ACT 4: four days away at their fire =================
  note(`\n=== ACT 4: four days away (does home learn without me?) ===`);
  for (let d = 0; d < 4 && !Game.over; d++) dayTick('away d' + (d + 1));
  const taughtAway = gained.map(pid => ({ pid, n: homeTaughtCount(pid), base: baselineTaught[pid] || 0 }));
  for (const t of taughtAway) {
    const p = (Game.data.plants || []).find(x => x.id === t.pid);
    const villagerFound = !!((Game.state.village.sharedKnowledge || {})[t.pid]); // discovered by a VILLAGER, not me
    note(`   ${p ? p.name : t.pid}: ${t.n}/${Game.state.village.roster.length} taught while away (baseline ${t.base}${villagerFound ? ', villager-discovered' : ''})`);
    t.ok = (t.n === t.base) || (t.base > 0) || villagerFound;
  }
  check('home taught[] grew only via legitimate background discovery while away',
    taughtAway.every(t => t.ok),
    `delta=${taughtAway.map(t => t.n - t.base).join(',')}`);

  // ================= ACT 5: walk home, knowledge-only return =================
  note(`\n=== ACT 5: the knowledge-only return ===`);
  // dump all edible pack food: this return carries KNOWLEDGE, not calories
  const before = s.inventory.length;
  s.inventory = s.inventory.filter(i => i.ration || !((i.kcalEach || 0) > 0 && (i.units || 0) > 0));
  note(`   emptied pack of non-ration food (${before} -> ${s.inventory.length} stacks)`);
  const returnLines = walkTo(homePx, homePy, 'home');
  const haulLines = returnLines.filter(t => /unload|keep a day's food|pooledFood|onto the counter/i.test(t));
  const teachLines = returnLines.filter(t => /show your haul|Around the fire|taught|taught you|show us|what you learned/i.test(t));
  const homecoming = returnLines.filter(t => /days gone|days\.|walk back into Haven|come home after/i.test(t));
  note(`   homecoming lines: ${homecoming.length}; haul lines: ${haulLines.length}; teaching lines: ${teachLines.length}`);
  for (const t of homecoming.slice(0, 3)) note(`   home> ${String(t).slice(0, 170)}`);
  for (const t of teachLines.slice(0, 5)) note(`   teach> ${String(t).slice(0, 200)}`);
  const newsLines = returnLines.filter(t => /While you were gone/i.test(t));
  note(`   awayNews delivered: ${newsLines.length > 0}`);
  check('homecoming beat fired', homecoming.length > 0);
  const rumorOnReturn = Object.keys(Game.state.village.plantRumors || {}).filter(pid => gained.includes(pid));
  note(`   home plantRumors for learned plants after return: ${rumorOnReturn.length}`);
  const drained = (Game.state.scholar.awayLearned || []).length === 0;
  check('awayLearned queue drained on return', drained);
  check('knowledge-only return triggers a teaching moment', teachLines.length > 0 || rumorOnReturn.length > 0,
    teachLines.length + ' teaching lines, ' + rumorOnReturn.length + ' rumors');

  // ================= ACT 6: days at home — does the bridge pay off? =================
  note(`\n=== ACT 6: four days home (does the bridge pay off?) ===`);
  for (let d = 0; d < 4 && !Game.over; d++) {
    says.length = 0;
    // turn the day-parts honestly: advancePart is the per-part sim tick
    // (resolveAssignments -> rumor spread). doAction('forage') on depleted
    // home tiles exits BEFORE ticking the clock — no parts, no spread.
    for (let p = 0; p < 4; p++) { try { Game.advancePart(); } catch (e) { break; } }
    const fire = says.filter(t => /fireside|showed|by the fire|word gets around|what you learned out there/i.test(t)).map(String);
    for (const t of fire.slice(0, 3)) note(`   fire> ${t.slice(0, 170)}`);
    says.length = 0;
    try { Game.endDay(); } catch (e) {}
    says.length = 0;
    eatUp(); waterUp();
  }
  const taughtHome = gained.map(pid => ({ pid, n: homeTaughtCount(pid), base: baselineTaught[pid] || 0 }));
  let spread = 0;
  for (const t of taughtHome) {
    const p = (Game.data.plants || []).find(x => x.id === t.pid);
    note(`   ${p ? p.name : t.pid}: ${t.n}/${Game.state.village.roster.length} taught (baseline ${t.base})`);
    if (t.n > t.base) spread++;
  }
  check('brokered knowledge spreads through home village after return', spread > 0, `${spread}/${gained.length} plants spread beyond baseline`);

  note(`\n=== SUMMARY ===`);
  const fails = results.filter(r => !r[1]);
  note(`   ${results.length - fails.length}/${results.length} checks passed`);
  if (fails.length) { note('   failed:'); for (const f of results.filter(r => !r[1])) note(`     - ${f[0]}`); }
  process.exit(fails.length ? 1 : 0);
})();
