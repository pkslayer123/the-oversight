// Forager playtest loop (Steve): multi-day food loop — forage, haul, sort, pantry.
// Measures what a pure forager actually experiences:
//   - kcal hauled per day vs the ~2000/day self need and village burn
//   - day-part cost of a full forage day (time economy, never AP bookkeeping)
//   - tile depletion feel + 3-day regrow verified across 6 days
//   - the camp ritual: does sorting lumps at camp actually teach/identify?
//   - honesty of the blind-forage message
// Usage: node scripts/test-forager-loop.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const dayNotes = [];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
function edibleKcal(items) {
  return (items || []).reduce((t, i) => t + ((i.kcalEach || 0) > 0 ? (i.kcalEach || 0) * (i.units || 1) : 0), 0);
}
function pantryKcal() {
  return (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}
function wildTargets() {
  return Game.travelTargets().filter(t => {
    if (Game.travelBlockage(t.x, t.y)) return false;
    const tile = Game.tileAt(t.x, t.y);
    return tile && tile.type !== 'haven' && tile.type !== 'ruin';
  });
}
// forage the whole node like a player would: stand on each green cell and sweep.
// returns { forages, ticks, packFull } — packFull means the honest loop says
// haul it home and come back.
function sweepNode() {
  const s = Game.state.scholar;
  const dayStartTicks = s.dayTicks || 0;
  let forages = 0, guard = 0, nulls = 0, packFull = false;
  while (guard++ < 80 && !Game.over) {
    const t = Game.playerTile();
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    let tx = -1, ty = -1;
    outer: for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      const c = detail[cy] && detail[cy][cx];
      if (!FORAGEABLE[c]) continue;
      if (t.detailRegrow && t.detailRegrow[cx + ',' + cy]) continue;
      if (Game.cellScorched && Game.cellScorched(cx, cy)) continue;
      tx = cx; ty = cy; break outer;
    }
    if (tx < 0) break; // nothing green left — the node is honestly depleted
    s.mx = tx; s.my = ty;
    const before = edibleKcal(s.inventory) + edibleKcal(s.prepStash);
    const cap = withCapturedSay(() => Game.doAction('forage'));
    const r = cap.result;
    const after = edibleKcal(s.inventory) + edibleKcal(s.prepStash);
    forages++;
    if (r === null) {
      const t2 = Game.playerTile();
      const c2 = (Game.genDetail(Game.map.px, Game.map.py)[ty] || [])[tx];
      let pid = null;
      try { pid = Game.cellPlantSpecies(t2, tx, ty, c2); } catch (e) { pid = 'ERR'; }
      dayNotes.push(`d${Game.state.scholar.day} NULL@${tx},${ty} cell=${c2} pid=${pid} stock=${t2.stock} regrow=${!!(t2.detailRegrow && t2.detailRegrow[tx + ',' + ty])} msg=${(cap.msgs[cap.msgs.length - 1] || '').slice(0, 80)}`);
    }
    if (forages <= 2) {
      for (const m of cap.msgs.slice(-2)) dayNotes.push(`d${Game.state.scholar.day} f${forages}: ${m.slice(0, 110)}`);
    }
    if (r === null) {
      const lastMsg = cap.msgs[cap.msgs.length - 1] || '';
      if (/pack is full/i.test(lastMsg)) { packFull = true; break; }
      nulls++; if (nulls >= 2) break;
    } else nulls = 0;
    if (after <= before && forages > 30) break; // safety: no yield progress
  }
  return { forages, ticks: (s.dayTicks || 0) - dayStartTicks, packFull };
}
// the camp routine: haul home, eat if hungry, sort the lumps (ask a knower
// when one is HERE), put finished food away. What a forager does between patches.
function campRoutine() {
  Game.returnToVillage();
  let sorted = 0, taught = 0, backlog = 0;
  if (Game.atCamp()) {
    try { if ((Game.state.scholar.kcal || 0) < 1500) Game.eat(); } catch (e) {}
    const sr = sortAllLumps();
    sorted = sr.sorted; taught = sr.taught; backlog = sr.backlog;
    // PROCESS: shell the nuts (batch, no fire needed). Greens/berries are
    // ready once identified. Cooking is a per-item choice; the sim shells.
    try { Game.shellNuts(undefined, Game.state.scholar.prepStash); } catch (e) {}
    Game.putAwayFinished();
  }
  return { sorted, taught, backlog };
}
function sortAllLumps() {
  const s = Game.state.scholar;
  const cont = s.prepStash || [];
  let sorted = 0, taught = 0, guard = 0, dry = 0;
  while (guard++ < 40) {
    const idx = cont.findIndex(i => i.lump);
    if (idx < 0) break;
    // the key teaching moment: ask a knower when one is HERE, sort alone otherwise
    let knowers = [];
    try { knowers = Game.whoKnowsLump(cont[idx]) || []; } catch (e) {}
    const before = Object.keys(Game.state.codex.plants || {}).length;
    if (knowers.length) { Game.sortBag(knowers[0].id, idx, cont); }
    else { Game.sortBag(null, idx, cont); }
    const after = Object.keys(Game.state.codex.plants || {}).length;
    if (after > before && knowers.length) taught++;
    sorted++;
    // player-smart: two sorts in a row that teach nothing and nobody to ask
    // means the rest of the pile is a mystery too — stop grinding.
    if (after === before && !knowers.length) { dry++; if (dry >= 2) break; }
    else dry = 0;
  }
  return { sorted, taught, backlog: cont.filter(i => i.lump).length };
}

// capture Game.say during a fn to diagnose silent/odd outcomes
function withCapturedSay(fn) {
  const msgs = [];
  const orig = Game.say;
  Game.say = (m) => { msgs.push(String(m)); try { orig.call(Game, m); } catch (e) {} };
  try { return { result: fn(), msgs }; }
  finally { Game.say = orig; }
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const days = [];
  let dayOneNode = null; // day-1's first node, revisited on day 4 for the regrow check
  const startDay = Game.state.scholar.day;

  let iter = 0;
  while (Game.state.scholar.day < startDay + 6 && !Game.over && iter++ < 14) {
    const day = Game.state.scholar.day;
    const pantryBefore = pantryKcal();
    const dayStartTicks = Game.state.scholar.dayTicks || 0;
    let forages = 0, nodes = 0, guard = 0, haulTrips = 0;
    let dayNodeA = null, sorted = 0, taught = 0, backlog = 0, revisitForages = -1;
    // a real forager's day: work a node clean, travel, work the next —
    // until the day is spent (~400 of 512 ticks) or midnight comes.
    // Pack full? haul it home, unload, come back out. One node is not a day.
    while (guard++ < 10 && !Game.over
        && Game.state.scholar.day === day
        && ((Game.state.scholar.dayTicks || 0) - dayStartTicks) < 400) {
      const targets = wildTargets();
      if (!targets.length) break;
      const isRevisit = (day === startDay + 3 && guard === 1 && dayOneNode);
      const tg = isRevisit ? dayOneNode : targets[(day + guard) % targets.length];
      if (day === startDay && guard === 1) dayOneNode = tg;
      if (dayNodeA === null) dayNodeA = tg;
      Game.travelTo(tg.x, tg.y);
      nodes++;
      const sweep = sweepNode();
      forages += sweep.forages;
      if (isRevisit) revisitForages = sweep.forages;
      if (sweep.packFull) {
        haulTrips++;
        const cr = campRoutine();
        sorted += cr.sorted; taught += cr.taught;
      }
      if (sweep.forages === 0 && !sweep.packFull) break; // nothing anywhere — stop wandering
    }
    const ticks = (Game.state.scholar.dayTicks || 0) - dayStartTicks;
    const crEnd = campRoutine(); // end of day: everything comes home
    sorted += crEnd.sorted; taught += crEnd.taught; backlog = crEnd.backlog;
    const pantryAfter = pantryKcal();
    const pantryDelta = Math.round(pantryAfter - pantryBefore);
    const elapsed = Math.max(1, Game.state.scholar.day - day);
    const selfKcal = Math.round(Game.state.scholar.kcal || 0);
    const knownPlants = Object.keys(Game.state.codex.plants || {}).length;
    days.push({ day, elapsed, nodes, forages, ticks, haulTrips, pantryDelta, pantryAfter: Math.round(pantryAfter), selfKcal, sorted, taught, backlog, knownPlants, revisitForages });
    if (Game.state.scholar.day === day && !Game.over) {
      const d0 = Game.state.scholar.day;
      Game.sleep();
      ok(`sleep advanced the day (from ${d0})`, Game.state.scholar.day !== d0 || Game.over, `day ${d0} -> ${Game.state.scholar.day}`);
    }
    if (Game.over) break;
  }

  console.log('\n--- forager loop, 6 game days (blind day-1 knowledge, multi-node days) ---');
  console.log('day el nodes forages ticks trips pantryDelta/day pantry self sorted taught backlog known');
  for (const r of days) {
    const perDay = Math.round(r.pantryDelta / r.elapsed);
    console.log(`d${r.day} ${String(r.elapsed).padStart(2)} ${String(r.nodes).padStart(3)} ${String(r.forages).padStart(4)} ${String(r.ticks).padStart(5)} ${String(r.haulTrips).padStart(3)} ${String(perDay).padStart(7)} ${String(r.pantryAfter).padStart(6)} ${String(r.selfKcal).padStart(4)} ${String(r.sorted).padStart(3)} ${String(r.taught).padStart(2)} ${String(r.backlog).padStart(4)} ${r.knownPlants}`);
  }
  console.log('\n--- forage messages (first 2 presses/day) ---');
  for (const n of dayNotes.slice(0, 24)) console.log(n);

  // --- assertions: what the loop must feel like ---
  const d1 = days[0], d4 = days.find(r => r.day === startDay + 3);
  const d1perDay = d1 ? Math.round(d1.pantryDelta / d1.elapsed) : 0;
  // day-1 blind: the haul may sit unidentified on the counter (no knower yet,
  // low familiarity) — the starting pantry is the breathing room to learn.
  // The forager must not LOSE food, and the 6-day arc must feed the village.
  ok('day-1 never loses food', d1perDay >= 0, `delta/day=${d1perDay}`);
  const totalDelta = days.reduce((t, r) => t + r.pantryDelta, 0);
  ok('6-day forager arc feeds the village (knowledge compounds)', totalDelta > 0, `total=${totalDelta}`);
  ok('a forager works multiple nodes per day', d1 && d1.nodes >= 2, `nodes=${d1 && d1.nodes}`);
  ok('a full foraging day spends the day (time economy)', d1 && d1.ticks >= 250, `ticks=${d1 && d1.ticks}`);
  ok('regrow: day-4 revisit of day-1 node is productive again', d4 && d4.revisitForages > 0, `revisit forages=${d4 && d4.revisitForages}`);
  ok('camp ritual taught the forager something', (days[days.length - 1] || {}).knownPlants > 0, `known=${(days[days.length - 1] || {}).knownPlants}`);
  ok('pantry never negative', days.every(r => r.pantryAfter >= 0));
  ok('self kept food (the vacuum bug stays dead)', days.every(r => r.selfKcal > 0), days.map(r => r.selfKcal).join(','));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
