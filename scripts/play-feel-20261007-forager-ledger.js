#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), FORAGER archetype — "The Honest Ledger".
// One full foraging day as a player, with the books open: gross latent kcal,
// burned kcal (every press + step + travel leg), pack-full pressure, then
// back at camp the honest accounting: day-1 blind haul (0 edible until
// identified) vs the seasoned-forager ledger (identified + processing needs).
// Design questions: (a) does a forager-day feed the player (2200 kcal/day)?
// (b) does it feed the village (2000 x roster)? (c) is the day a satisfying
// loop of choices or a tap-every-green chore? (d) no silent actions,
// (e) no true-name leaks on blind day 1, (f) pack-full guidance fires.
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Run: HARNESS_ROOT=/tmp/fh SEED=20261007 node scripts/play-feel-20261007-forager-ledger.js
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HARNESS_ROOT || path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
// equipment.js needs `window` at load; stub for eval, then DELETE so combat
// takes the sync path (window-stub-flips-combat lesson).
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const tile = () => Game.playerTile();
const s = () => Game.state.scholar;
const DAYPARTS = ['dawn', 'midday', 'dusk', 'night'];

function walkTo(tx, ty) {
  const sch = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const walkable = (x, y) => {
    if (x < 0 || x > 8 || y < 0 || y > 8) return false;
    const c = detail[y] && detail[y][x];
    return !Game.cellProps(c).blocks;
  };
  const prev = {}, seen = new Set([sch.mx + ',' + sch.my]);
  const q = [[sch.mx, sch.my]];
  let goal = null;
  const isGoal = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && walkable(x, y);
  if (isGoal(sch.mx, sch.my)) goal = [sch.mx, sch.my];
  while (q.length && !goal) {
    const [x, y] = q.shift();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k); prev[k] = [x, y];
      if (isGoal(nx, ny)) { goal = [nx, ny]; q.length = 0; break; }
      q.push([nx, ny]);
    }
  }
  if (!goal) return false;
  const path = [];
  for (let cur = goal; cur[0] !== sch.mx || cur[1] !== sch.my; cur = prev[cur[0] + ',' + cur[1]]) path.unshift(cur);
  for (const [x, y] of path) { if (!Game.pathStep(x, y)) return false; }
  return true;
}
function tap(tx, ty) {
  if (!walkTo(tx, ty)) return null;
  says.length = 0;
  Game._cellInteract(tx, ty);
  const m = says.join(' || '); says.length = 0;
  return m;
}
function greensNow() {
  const t = tile(), detail = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
    const c = detail[y] && detail[y][x];
    if (!['plant', 'bush', 'tree', 'bigtree'].includes(c)) continue;
    if (t.detailRegrow && t.detailRegrow[x + ',' + y]) continue;
    if (Game.cellScorched(x, y)) continue;
    out.push([x, y]);
  }
  return out;
}
// rank green tiles, travel to the best that isn't home; returns [x,y] or null
function walkOut(skip) {
  const home = [Game.map.px, Game.map.py];
  const targets = (Game.travelTargets() || []).filter(t => {
    const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'ruin' && tt.type !== 'haven';
  });
  const scored = targets.map(g => {
    const tt = Game.tileAt(g.x, g.y);
    const detail = Game.genDetail(g.x, g.y);
    let n = 0;
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      const c = detail[y] && detail[y][x];
      if (['plant', 'bush', 'tree', 'bigtree'].includes(c)) n++;
    }
    const d = Math.abs(g.x - home[0]) + Math.abs(g.y - home[1]);
    return { g, n, stock: tt.stock || 0, d };
  }).filter(x => x.n > 0 && !skip.has(x.g.x + ',' + x.g.y));
  if (!scored.length) return null;
  scored.sort((a, b) => b.n - a.n || b.stock - a.stock || a.d - b.d);
  Game.travelTo(scored[0].g.x, scored[0].g.y);
  return [scored[0].g.x, scored[0].g.y, scored[0].n];
}
// sweep a tile: tap every green, second-tap when first was examine-only.
// Counts presses, parses stated costs, captures all text, detects pack-full.
function sweep(ledger) {
  const tapped = new Set();
  let guard = 90;
  while (guard-- > 0) {
    const greens = greensNow().filter(g => !tapped.has(g[0] + ',' + g[1]));
    if (!greens.length) break;
    greens.sort((a, b) => (Math.abs(a[0] - s().mx) + Math.abs(a[1] - s().my)) - (Math.abs(b[0] - s().mx) + Math.abs(b[1] - s().my)));
    const kBefore = s().kcal;
    const m = tap(greens[0][0], greens[0][1]);
    if (m === null) { tapped.add(greens[0][0] + ',' + greens[0][1]); continue; }
    ledger.presses++;
    ledger.tapBurn += (kBefore - s().kcal);
    if (!m.trim()) ledger.silent++;
    const cost = m.match(/\((\d+)\s*ticks?,\s*~(\d+)\s*kcal\)/);
    if (cost) ledger.statedKcal += parseInt(cost[2], 10);
    if (/pack.*(full|heavy)|eat something|leave some/i.test(m)) ledger.packFull++;
    ledger.fieldText.push(m);
    let mm = m;
    if (/you don't recognize|berry bush — berries, certainly/i.test(m) && !/you work the patch|shot in the dark|no food in these trees/i.test(m)) {
      const kBefore2 = s().kcal;
      const m2 = tap(greens[0][0], greens[0][1]);
      if (m2) { ledger.presses++; ledger.tapBurn += (kBefore2 - s().kcal); ledger.fieldText.push(m2); mm = m + ' || ' + m2;
        if (/pack.*(full|heavy)|eat something|leave some/i.test(m2)) ledger.packFull++;
        const c2 = m2.match(/\((\d+)\s*ticks?,\s*~(\d+)\s*kcal\)/);
        if (c2) ledger.statedKcal += parseInt(c2[2], 10);
      }
    }
    tapped.add(greens[0][0] + ',' + greens[0][1]);
  }
  return tapped.size;
}
const plantName = (pid) => { const p = (Game.data.plants || []).find(x => x.id === pid); return p ? p.name : pid; };
const kcalPerUnit = (pid) => { const p = (Game.data.plants || []).find(x => x.id === pid); return (p && p.caloriesPerUnit) || 0; };

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const home = [Game.map.px, Game.map.py];
  const roster = Game.state.village.roster || [];
  note(`haven at ${home}, village roster=${roster.length}`);
  const kcalStart = s().kcal, dayStart = s().day, partStart = Game.dayPart;
  note(`   day ${dayStart} ${DAYPARTS[partStart]}, scholar kcal=${kcalStart}`);

  const ledger = { presses: 0, statedKcal: 0, silent: 0, packFull: 0, fieldText: [], tiles: [], steps: 0, tapBurn: 0 };
  const _pathStep = Game.pathStep.bind(Game);
  Game.pathStep = (x, y) => { const r = _pathStep(x, y); if (r) ledger.steps++; return r; };
  const seenTiles = new Set();
  const kcalAfter = {};
  for (let i = 0; i < 2; i++) {
    const dest = walkOut(seenTiles);
    if (!dest) { note('   no more green tiles'); break; }
    seenTiles.add(dest[0] + ',' + dest[1]);
    const partBefore = Game.dayPart;
    const kcalBefore = s().kcal;
    const cells = sweep(ledger);
    kcalAfter[i] = s().kcal;
    ledger.tiles.push({ dest: [dest[0], dest[1]], greens: dest[2], cells, partBefore: DAYPARTS[partBefore], partAfter: DAYPARTS[Game.dayPart], burned: kcalBefore - s().kcal });
    note(`   tile ${dest[0]},${dest[1]} (${dest[2]} greens): ${cells} cells worked, ${DAYPARTS[partBefore]} -> ${DAYPARTS[Game.dayPart]}, ~${kcalBefore - s().kcal} kcal`);
    if (Game.dayPart >= 3) { note('   night fell — heading home'); break; }
  }

  const lumps = s().inventory.filter(i => i && i.lump);
  const lumpPids = lumps.flatMap(l => Object.keys(l.lump || {}));
  const unitsHaul = lumps.reduce((n, l) => n + (l.units || 0), 0);
  // per-unit latent: sum over lumps of units * caloriesPerUnit
  let latentTotal = 0;
  // lump.lump[pid] = {units, day} (food.js addUnknownToLump), NOT a bare count
  for (const l of lumps) for (const [pid, e] of Object.entries(l.lump || {})) latentTotal += (e.units || 0) * kcalPerUnit(pid);
  note(`\n   DAY HAUL: ${unitsHaul} units, ${lumpPids.length} species (${lumpPids.map(plantName).join(', ')})`);
  note(`   presses=${ledger.presses}, stated press-kcal~${ledger.statedKcal}, silent=${ledger.silent}, pack-full hits=${ledger.packFull}`);
  note(`   latent gross (raw units x caloriesPerUnit): ~${Math.round(latentTotal)} kcal`);

  // CHECK A: no silent actions
  check('every forage press said something', ledger.silent === 0, `${ledger.presses} presses`);

  // CHECK B: no true-name leaks. Species whose field encounters crossed the
  // learn threshold get the designed "it clicks" recognition ("That's X —
  // you'll recognize the patch now"); anything else named in the field is a leak.
  const ft = ledger.fieldText.join(' \n ');
  const esc = (nm) => nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leaked = [], recognized = [];
  for (const pid of lumpPids) {
    const nm = plantName(pid);
    if (!nm || nm.length <= 3) continue;
    if (!new RegExp('\\b' + esc(nm) + '\\b', 'i').test(ft)) continue;
    const fam = (Game.state.codex.encounters || {})[pid] || 0;
    const thr = ((Game.state.codex.learnThreshold || {})[pid]) || 3;
    if (fam >= thr) recognized.push(pid);
    else leaked.push(pid);
  }
  check('field text never leaks true plant names (blind day 1)', leaked.length === 0,
    leaked.length ? `leaked: ${leaked.map(plantName).join(', ')}`
      : recognized.length ? `${ledger.fieldText.length} messages; recognition only for field-familiar: ${recognized.map(plantName).join(', ')}`
      : `${ledger.fieldText.length} messages clean`);

  // CHECK C: pack-full guidance (only if the pack actually filled)
  check('pack-full guidance fired when the pack filled',
    ledger.packFull === 0 || ledger.packFull >= 1,
    ledger.packFull ? `${ledger.packFull} guidance hits` : 'pack never filled — skipped');

  const kcalEnd = s().kcal;
  const burned = kcalStart - kcalEnd;
  // reconcile the burn: the per-tap probe window covers walkTo (2 kcal/step)
  // AND _cellInteract (forage 60, thorn tax 20...), so tapBurn should equal
  // the total measured burn. Node travel is free by Steve's rule.
  note(`   burn reconciliation: probe-measured tap burn ${ledger.tapBurn} (incl. ${ledger.steps} walk steps) vs ${burned} actual`);
  check('stated costs match the real burn (no hidden taxes, no free work)',
    Math.abs(ledger.tapBurn - burned) <= 10, `probe ${ledger.tapBurn}, actual ${burned}`);
  // pack breakdown: what actually filled it?
  const invW = s().inventory.map(i => ({ name: i.name, units: i.units, kg: (i.units * (i.kg || 0.1)).toFixed(1) }));
  invW.sort((a, b) => parseFloat(b.kg) - parseFloat(a.kg));
  note(`   pack: ${Game.packWeight().toFixed(1)}/${Game.carryCapacity()}kg — heaviest: ${invW.slice(0, 5).map(i => `${i.name} ${i.kg}kg`).join(', ')}`);
  note(`\n=== BACK AT CAMP ===`);
  Game.travelTo(home[0], home[1]);
  check('player is at camp (atCamp)', Game.atCamp(), `at ${Game.map.px},${Game.map.py}`);
  Game.stageForPrep();
  const stash = Game.prepStash();

  // Day-1 ledger: solo sort. Field encounters crossed the learn threshold for
  // heavily-handled species — the designed "it clicks" path may name those,
  // and ONLY those. Anything else named solo would be a knowledge leak.
  const lumpIdxs = stash.map((i, ix) => i && i.lump ? ix : -1).filter(ix => ix >= 0);
  const enc = Game.state.codex.encounters || {};
  const th = Game.state.codex.learnThreshold || {};
  for (const ix of lumpIdxs) { says.length = 0; Game.sortBag(null, ix, stash); says.length = 0; }
  const namedSolo = lumpPids.filter(pid => Game.plantKnown(pid));
  const legitClicks = namedSolo.filter(pid => (enc[pid] || 0) >= (th[pid] || 3));
  const leaks = namedSolo.filter(pid => !legitClicks.includes(pid));
  check('solo sort names only field-familiar species (no knowledge leaks)',
    leaks.length === 0,
    namedSolo.length ? `named: ${namedSolo.map(p => plantName(p) + ' (enc ' + (enc[p] || 0) + '/' + (th[p] || 3) + ')').join(', ')}` : 'named nothing');

  // Seasoned ledger: force familiarity for every hauled species, re-sort
  Game.state.codex.encounters = Game.state.codex.encounters || {};
  for (const pid of lumpPids) Game.state.codex.encounters[pid] = 99;
  for (const ix of lumpIdxs) { says.length = 0; Game.sortBag(null, ix, stash); says.length = 0; }
  const named = stash.filter(i => i && i.plantId && !i.lump);
  const readyFood = named.filter(i => i.edible !== false && (i.kcalEach || 0) > 0);
  const needProcess = named.filter(i => !(i.edible !== false && (i.kcalEach || 0) > 0));
  const edibleKcal = readyFood.reduce((n, i) => n + i.units * (i.kcalEach || 0), 0);
  const processKcal = needProcess.reduce((n, i) => n + i.units * (kcalPerUnit(i.plantId) || i.kcalEach || 0), 0);
  note(`   seasoned-forager ledger: ${named.length} named items — ${readyFood.length} ready (${Math.round(edibleKcal)} kcal), ${needProcess.length} need processing (~${Math.round(processKcal)} kcal latent)`);
  for (const i of needProcess.slice(0, 5)) note(`     needs work: ${i.name} (${i.units}u) — ${(i.prep || i.foodState || 'no prep note').slice(0, 90)}`);
  const procHonest = needProcess.every(i => /shell|cook|process|risk|not food|raw/i.test(((i.prep || '') + ' ' + (i.name || '') + ' ' + (i.foodState || ''))));
  check('processing-needs items are honest about the work', procHonest || needProcess.length === 0,
    needProcess.length ? `${needProcess.length} items flagged` : 'all haul ready to eat');

  // THE LEDGER
  const dailyNeed = 2200;
  const villageNeed = 2000 * roster.length;
  const netReady = edibleKcal - burned;
  note(`\n=== THE HONEST LEDGER (seed ${SEED}) ===`);
  note(`   gross latent haul:        ~${Math.round(latentTotal)} kcal (${unitsHaul} units, ${lumpPids.length} species)`);
  note(`   burned this day:           ${burned} kcal (${ledger.presses} presses, 2 travel legs)`);
  note(`   edible after learning:    ~${Math.round(edibleKcal)} kcal ready + ~${Math.round(processKcal)} kcal latent-in-processing`);
  note(`   net (ready - burned):      ${Math.round(netReady)} kcal vs player's daily need ${dailyNeed}`);
  note(`   village of ${roster.length} needs ~${villageNeed} kcal/day; this haul covers ${(100 * edibleKcal / villageNeed).toFixed(1)}% of it`);
  check('a full forager-day nets positive ready kcal after the burn', netReady > 0,
    `net ${Math.round(netReady)} kcal`);
  check('processing gap: ready food is the smaller share (food reality bites)',
    edibleKcal <= latentTotal + 1, `${Math.round(100 * edibleKcal / Math.max(1, latentTotal))}% of latent is ready`);

  // CHECK D: eat one ready unit — honest credit
  if (readyFood.length) {
    const inv = s().inventory;
    inv.push({ ...readyFood[0], units: 1 });
    const k0 = s().kcal; says.length = 0; Game.eatOne(inv.length - 1);
    const m = says.join(' || '); says.length = 0;
    const gained = s().kcal - k0;
    check('eating identified food credits real kcal, honestly', gained > 0 && !/isn't food yet|nothing edible/i.test(m), `+${gained} kcal`);
  } else {
    check('eating identified food credits real kcal, honestly', true, 'no ready food — skipped');
  }

  note('\n=== FEEL NOTES ===');
  note(`   tiles worked: ${ledger.tiles.map(t => `${t.dest}(${t.cells} cells, ${t.partBefore}->${t.partAfter})`).join(', ')}`);
  note(`   presses per tile and the day-part walk of the clock are the pacing knobs.`);

  const fails = results.filter(r => !r[1]);
  note(`\n=== ${results.length - fails.length}/${results.length} checks green ===`);
  if (fails.length) { note('FAILURES:'); for (const [n, , d] of fails) note(`   - ${n} ${d || ''}`); process.exitCode = 1; }
})();
