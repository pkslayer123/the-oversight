#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), FORAGER archetype — the knowledge loop.
// Steve's core loop: learn -> recognize -> forage deliberately -> haul home
// -> identify -> learn more. This playtests the second half as a player:
// forage blind on day 1 (haul comes home as unknowns), return to camp,
// sort the bag (solo + with a knower), and verify the haul becomes FOOD.
// Questions: (a) field text never leaks true names; (b) solo sort with zero
// familiarity is honest (no fake identification); (c) field-click path works
// (familiarity -> "it clicks"); (d) villager sorting teaches (taught beat);
// (e) named items register real kcal or honest processing needs (nuts in
// shell, must-cook warnings); (f) after learning, foraging is deliberate,
// not blind; (g) eat honesty for raw identified food.
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Run: HARNESS_ROOT=/tmp/fh SEED=7 node scripts/play-feel-20261007-forager-learn.js
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
function walkOut() {
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
    return { g, n, stock: tt.stock || 0 };
  }).filter(x => x.n > 0);
  if (!scored.length) return null;
  scored.sort((a, b) => b.n - a.n || b.stock - a.stock);
  Game.travelTo(scored[0].g.x, scored[0].g.y);
  return [scored[0].g.x, scored[0].g.y];
}
// sweep a tile blind: tap every green cell, second-tap when the first tap
// was examine-only. Returns {fieldText, lumpsGained}.
function sweepBlind() {
  const tapped = new Set(), fieldText = [];
  let guard = 60;
  while (guard-- > 0) {
    const greens = greensNow().filter(g => !tapped.has(g[0] + ',' + g[1]));
    if (!greens.length) break;
    greens.sort((a, b) => (Math.abs(a[0] - s().mx) + Math.abs(a[1] - s().my)) - (Math.abs(b[0] - s().mx) + Math.abs(b[1] - s().my)));
    const m = tap(greens[0][0], greens[0][1]);
    if (m === null) { tapped.add(greens[0][0] + ',' + greens[0][1]); continue; }
    let mm = m;
    if (/you don't recognize|berry bush — berries, certainly/i.test(m) && !/you work the patch|shot in the dark|no food in these trees/i.test(m)) {
      const m2 = tap(greens[0][0], greens[0][1]);
      if (m2) mm = m + ' || ' + m2;
    }
    if (mm) fieldText.push(mm);
    tapped.add(greens[0][0] + ',' + greens[0][1]);
  }
  return fieldText;
}
const plantName = (pid) => { const p = (Game.data.plants || []).find(x => x.id === pid); return p ? p.name : pid; };

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  note('\n=== DAY 1: forage blind, haul home ===');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const home = [Game.map.px, Game.map.py];
  note(`   haven at ${home}`);
  const dest = walkOut();
  if (!dest) { note('setup FAIL: no green tile'); process.exitCode = 1; return; }
  const fieldText = sweepBlind();
  const lumps = s().inventory.filter(i => i && i.lump);
  const lumpPids = lumps.flatMap(l => Object.keys(l.lump || {}));
  const unitsHaul = lumps.reduce((n, l) => n + (l.units || 0), 0);
  note(`   tile ${dest} — hauled ${unitsHaul} units as ${lumps.length} lump(s), ${lumpPids.length} species: ${lumpPids.map(plantName).join(', ')}`);

  // CHECK A: no true names leak in the field
  const knownBefore = lumpPids.filter(pid => Game.plantKnown(pid));
  let leaked = [];
  const ft = fieldText.join(' \n ');
  for (const pid of lumpPids) {
    const nm = plantName(pid);
    if (nm && nm.length > 3 && new RegExp('\\b' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(ft)) leaked.push(pid);
  }
  check('field text never leaks true plant names', leaked.length === 0 && knownBefore.length === 0,
    leaked.length ? `leaked: ${leaked.map(plantName).join(', ')}` : `${fieldText.length} taps, all blind`);

  note('\n=== CAMP: the sort ritual ===');
  Game.travelTo(home[0], home[1]);
  check('player is at camp (atCamp)', Game.atCamp(), `at ${Game.map.px},${Game.map.py}`);
  Game.stageForPrep();
  const stash = Game.prepStash();
  const lumpIdx = stash.findIndex(i => i && i.lump);
  check('haul staged onto the counter (prepStash)', lumpIdx >= 0, `prepStash=${stash.length} items`);

  // CHECK C: solo sort with zero familiarity — honest failure
  says.length = 0;
  Game.sortBag(null, lumpIdx, stash);
  const soloMsg = says.join(' || '); says.length = 0;
  const namedAfterSolo = lumpPids.filter(pid => Game.plantKnown(pid));
  check('solo sort with no familiarity names nothing, says so honestly',
    namedAfterSolo.length === 0 && /nothing.*name with confidence|nothing you can name/i.test(soloMsg),
    soloMsg.slice(0, 120));

  // CHECK D: field-click path — force familiarity over threshold, sort the
  // lump that actually contains that species.
  const clickPid = lumpPids[0];
  if (clickPid) {
    Game.state.codex.encounters = Game.state.codex.encounters || {};
    Game.state.codex.encounters[clickPid] = 99;
    const th = (Game.state.codex.learnThreshold || {})[clickPid] || 3;
    const lumpIdxClick = stash.findIndex(i => i && i.lump && i.lump[clickPid]);
    note(`   forcing familiarity for ${plantName(clickPid)} (threshold ${th}), lump idx=${lumpIdxClick}`);
    says.length = 0;
    Game.sortBag(null, lumpIdxClick, stash);
    const clickMsg = says.join(' || '); says.length = 0;
    check('field-click: solo sort identifies the familiar species',
      Game.plantKnown(clickPid) && /it clicks/i.test(clickMsg),
      clickMsg.slice(0, 140));
  } else {
    check('field-click: solo sort identifies the familiar species', false, 'no lump species hauled');
  }

  // CHECK E: villager sort teaches
  const remaining = lumpPids.filter(pid => !Game.plantKnown(pid));
  const roster = (Game.state.village.roster || []);
  let taughtPid = null, teacher = null;
  for (const vid of roster) {
    const known = Game.villagerKnowsPlants(vid) || [];
    const hit = remaining.find(pid => known.includes(pid));
    if (hit) { taughtPid = hit; teacher = vid; break; }
  }
  if (taughtPid && teacher) {
    const lumpIdx2 = stash.findIndex(i => i && i.lump && i.lump[taughtPid]);
    note(`   ${Game.displayName(teacher)} knows ${plantName(taughtPid)} — asking them to sort`);
    says.length = 0;
    Game.sortBag(teacher, lumpIdx2, stash);
    const teachMsg = says.join(' || '); says.length = 0;
    check('villager sort teaches the player (taught beat)',
      Game.plantKnown(taughtPid) && /yours now too|watch closely/i.test(teachMsg),
      teachMsg.slice(0, 160));
  } else {
    check('villager sort teaches the player (taught beat)', true,
      `no knower found for remaining species (${remaining.map(plantName).join(', ')}) — skipped, not failed`);
  }

  // Ensure a bush species is learned for the H1 recognition check: if the
  // haul contains blackberry/muscadine, force field familiarity and solo-sort
  // it via the same field-click mechanic as CHECK D.
  const bushPidHaul = lumpPids.find(p => ['blackberry', 'muscadine'].includes(p) && !Game.plantKnown(p));
  if (bushPidHaul) {
    Game.state.codex.encounters[bushPidHaul] = 99;
    const bi = stash.findIndex(i => i && i.lump && i.lump[bushPidHaul]);
    if (bi >= 0) {
      says.length = 0; Game.sortBag(null, bi, stash); says.length = 0;
      note(`   force-learned bush species for H1: ${plantName(bushPidHaul)} (known=${Game.plantKnown(bushPidHaul)})`);
    }
  }

  // CHECK F: named items register real kcal or honest processing needs
  const named = stash.filter(i => i && i.plantId && !i.lump);
  const readyFood = named.filter(i => i.edible !== false && (i.kcalEach || 0) > 0);
  const needProcess = named.filter(i => i.edible === false || (i.kcalEach || 0) === 0);
  const procHonest = needProcess.every(i => /shell|cook|process|risk|not food/i.test((i.prep || '') + (i.name || '')));
  note(`   named items: ${named.length} (${readyFood.length} ready, ${needProcess.length} need processing)`);
  for (const i of named.slice(0, 4)) note(`     - ${i.name}: ${i.units}u x ${i.kcalEach}kcal, state=${i.foodState}, prep="${(i.prep || '').slice(0, 70)}"`);
  check('identified haul is real food or honestly-flagged processing work',
    named.length > 0 && readyFood.length + needProcess.length === named.length && procHonest,
    `${readyFood.reduce((n, i) => n + i.units * i.kcalEach, 0)} kcal ready`);

  // CHECK G: eat honesty — eat a ready identified food
  if (readyFood.length) {
    const inv = s().inventory;
    const idx = inv.findIndex(i => i === readyFood[0]);
    let k0, m;
    if (idx >= 0) { k0 = s().kcal; says.length = 0; Game.eatOne(idx); m = says.join(' || '); says.length = 0; }
    else { // item is in prepStash; move a unit back to inventory for the eat test
      inv.push({ ...readyFood[0], units: 1 }); readyFood[0].units -= 1;
      k0 = s().kcal; says.length = 0; Game.eatOne(inv.length - 1); m = says.join(' || '); says.length = 0;
    }
    const gained = s().kcal - k0;
    check('eating identified food credits real kcal, honestly',
      gained > 0 && !/isn't food yet|nothing edible/i.test(m), `+${gained} kcal`);
  } else {
    check('eating identified food credits real kcal, honestly', true, 'no ready food in this haul — skipped');
  }

  // CHECK H: recognition after learning — each learned species should be
  // named in the field by its cell kind:
  //   H1 bush (blackberry/muscadine): examine names it ("That's muscadine grapes")
  //   H2 plant: area sweep names it in knownBits ("You work the patch: 2× Mayapple")
  //   H3 tree nut (hickory/acorn): tree examine names the species ("This hickory")
  const escName = (nm) => nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const learnedPids = lumpPids.filter(pid => Game.plantKnown(pid));
  const isBushPid = (pid) => ['blackberry', 'muscadine'].includes(pid);
  // tree nuts are the only pids cellPlantSpecies() returns for tree cells
  // (oak->acorn_white_oak, hickory->hickory_nut); other "nut" species
  // (hazelnut, walnut, groundnut) come from plant cells.
  const isTreeNutPid = (pid) => ['hickory_nut', 'acorn_white_oak'].includes(pid);
  const recResults = [];
  const recCheck = (label, ran, ok, detail) => {
    recResults.push({ label, ran, ok });
    note(`   [${!ran ? 'SKIP' : ok ? 'OK' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  };

  // H1: bush recognition on the foraged tile
  const bushPid = learnedPids.find(isBushPid);
  if (bushPid) {
    Game.travelTo(dest[0], dest[1]);
    const t = tile(), d = Game.genDetail(Game.map.px, Game.map.py);
    const cands = [];
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      if ((d[y] && d[y][x]) !== 'bush') continue;
      if (Game.cellPlantSpecies(t, x, y, 'bush') === bushPid) cands.push([x, y]);
    }
    let h1cell = null;
    for (const [cx, cy] of cands) { if (walkTo(cx, cy)) { h1cell = [cx, cy]; break; } }
    if (h1cell) {
      says.length = 0; Game._cellInteract(h1cell[0], h1cell[1]);
      const m = says.join(' || '); says.length = 0;
      const shortName = plantName(bushPid).split(' ')[0];
      const named = new RegExp(`that's ${escName(shortName)}`, 'i').test(m) ||
                    new RegExp(`that's ${escName(bushPid)}`, 'i').test(m);
      recCheck('H1 bush examine names the learned species', true, named, m.slice(0, 110));
    } else recCheck('H1 bush examine names the learned species', true, false,
      cands.length ? 'bush cells exist but none reachable' : 'no bush cell found');
  } else recCheck('H1 bush examine names the learned species', false, true, 'no bush species learned');

  // H2: deliberate sweep names a learned plant species
  const plantPid = learnedPids.find(pid => !isBushPid(pid) && !isTreeNutPid(pid));
  if (plantPid) {
    const d3c = walkOut();
    let h2done = false, h2ok = false, h2det = 'no fresh tile';
    if (d3c) {
      const t3 = tile(), d3 = Game.genDetail(Game.map.px, Game.map.py);
      const cands = [];
      for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
        if ((d3[y] && d3[y][x]) !== 'plant') continue;
        if (t3.detailRegrow && t3.detailRegrow[x + ',' + y]) continue;
        if (Game.cellPlantSpecies(t3, x, y, 'plant') === plantPid) cands.push([x, y]);
      }
      let h2cell = null;
      for (const [cx, cy] of cands) { if (walkTo(cx, cy)) { h2cell = [cx, cy]; break; } }
      if (h2cell) {
        says.length = 0; Game.doAction('forage');
        const m = says.join(' || '); says.length = 0;
        h2done = true;
        h2ok = /you work the patch/i.test(m) && new RegExp(escName(plantName(plantPid)), 'i').test(m);
        h2det = m.slice(0, 130);
      } else h2det = cands.length ? 'plant cells exist but none reachable' : 'no known plant cell on the fresh tile';
    }
    recCheck('H2 deliberate sweep names the learned species', h2done, h2ok, h2det);
  } else recCheck('H2 deliberate sweep names the learned species', false, true, 'no plant species learned');

  // H3: tree examine names the species for a learned nut (codex.trees gate)
  const nutPid = learnedPids.find(isTreeNutPid);
  if (nutPid) {
    Game.travelTo(dest[0], dest[1]);
    const t = tile(), d = Game.genDetail(Game.map.px, Game.map.py);
    const cands = [];
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      const c = d[y] && d[y][x];
      if (c !== 'tree' && c !== 'bigtree') continue;
      if (Game.cellPlantSpecies(t, x, y, c) === nutPid) {
        const mod = t.modifiers && t.modifiers[x + ',' + y];
        cands.push({ x, y, sp: mod && mod.species });
      }
    }
    let h3cell = null, treeSp = null;
    for (const cand of cands) { if (walkTo(cand.x, cand.y)) { h3cell = [cand.x, cand.y]; treeSp = cand.sp; break; } }
    if (h3cell) {
      says.length = 0; Game._cellInteract(h3cell[0], h3cell[1]);
      const m = says.join(' || '); says.length = 0;
      const named = treeSp && new RegExp(`this ${escName(treeSp)}`, 'i').test(m);
      recCheck('H3 tree examine names the species (common-knowledge gate)', true, !!named, m.slice(0, 120));
    } else recCheck('H3 tree examine names the species (common-knowledge gate)', true, false,
      cands.length ? 'tree cells exist but none reachable' : 'no tree cell for ' + nutPid);
  } else recCheck('H3 tree examine names the species (common-knowledge gate)', false, true, 'no nut species learned');

  const ranRec = recResults.filter(r => r.ran);
  check('field recognition works for every learned cell kind',
    ranRec.length > 0 && ranRec.every(r => r.ok),
    ranRec.length ? ranRec.map(r => `${r.label.split(' ')[0]}:${r.ok ? 'ok' : 'FAIL'}`).join(' ') : 'nothing learned');

  note('\n=== FORAGER LEARN-LOOP VERDICT ===');
  const passed = results.filter(r => r[1]).length;
  note(`checks: ${passed}/${results.length} pass (seed ${SEED})`);
  const fails = results.filter(r => !r[1]).map(r => r[0]);
  if (fails.length) { note('FAILS: ' + fails.join(' | ')); process.exitCode = 1; }
})();
