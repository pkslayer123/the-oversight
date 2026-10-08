#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-08), FORAGER archetype — "The Camp Kitchen".
// The leg of the forager loop nobody has played: the haul comes home and
// the prep stash (kitchen counter) takes over — stage, triage, sort lumps,
// shell nuts, ask specialists, watch twice and learn, cook/smoke, put away,
// eat. Design questions:
//  (a) does the kitchen leg feel like a satisfying payoff to the haul, or
//      an admin chore? (Steve: knowledge -> food -> power, teaching moment
//      when the haul comes home)
//  (b) is every processing action honest about cost/yield (no silent actions)?
//  (c) does the specialist trade-off (you fast+worse+learn vs specialist
//      slower+better+teaches-after-2-watches) actually land in play?
//  (d) does the gross->net shelling math reconcile exactly (75%)?
//  (e) is there ALWAYS a route to safe food on day 1 (cautious testing when
//      no specialist exists)?
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Run: HARNESS_ROOT=/tmp/fk SEED=20261008 node scripts/play-feel-20261008-forager-kitchen.js
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HARNESS_ROOT || path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
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
  'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
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
function walkOut(skip) {
  const home = [Game.map.px, Game.map.py];
  const targets = (Game.travelTargets() || []).filter(t => {
    const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'ruin' && tt.type !== 'haven';
  });
  const scored = targets.map(g => {
    const detail = Game.genDetail(g.x, g.y);
    let n = 0;
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      const c = detail[y] && detail[y][x];
      if (['plant', 'bush', 'tree', 'bigtree'].includes(c)) n++;
    }
    const d = Math.abs(g.x - home[0]) + Math.abs(g.y - home[1]);
    return { g, n, d };
  }).filter(x => x.n > 0 && !skip.has(x.g.x + ',' + x.g.y));
  if (!scored.length) return null;
  scored.sort((a, b) => b.n - a.n || a.d - b.d);
  Game.travelTo(scored[0].g.x, scored[0].g.y);
  return [scored[0].g.x, scored[0].g.y, scored[0].n];
}
// bounded sweep: tap at most maxGreens greens, second-tap examine-only ones.
function sweep(maxGreens) {
  const tapped = new Set();
  let presses = 0, silent = 0;
  const texts = [];
  let guard = 90;
  while (guard-- > 0 && tapped.size < maxGreens) {
    const greens = greensNow().filter(g => !tapped.has(g[0] + ',' + g[1]));
    if (!greens.length) break;
    greens.sort((a, b) => (Math.abs(a[0] - s().mx) + Math.abs(a[1] - s().my)) - (Math.abs(b[0] - s().mx) + Math.abs(b[1] - s().my)));
    const m = tap(greens[0][0], greens[0][1]);
    tapped.add(greens[0][0] + ',' + greens[0][1]);
    if (m === null) continue;
    presses++; texts.push(m);
    if (!m.trim()) silent++;
    if (/you don't recognize|berry bush — berries, certainly/i.test(m) && !/you work the patch|shot in the dark|no food in these trees/i.test(m)) {
      const m2 = tap(greens[0][0], greens[0][1]);
      if (m2) { presses++; texts.push(m2); if (!m2.trim()) silent++; }
    }
  }
  return { pressed: tapped.size, presses, silent, texts };
}
const stash = () => Game.prepStash();
const findIdx = (cont, pred) => cont.findIndex(pred);

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const home = [Game.map.px, Game.map.py];
  note(`haven at ${home}; roster=${(Game.state.village.roster || []).length}; seed=${SEED}`);
  note(`   day ${s().day} ${DAYPARTS[Game.dayPart]}, kcal=${s().kcal}`);

  // ---------- PHASE A: the haul (real presses, bounded) ----------
  const skip = new Set();
  let haul = { presses: 0, silent: 0 };
  for (let leg = 0; leg < 2 && haul.presses < 20; leg++) {
    const dest = walkOut(skip);
    if (!dest) break;
    skip.add(dest[0] + ',' + dest[1]);
    const r = sweep(12);
    haul.presses += r.presses; haul.silent += r.silent;
  }
  note(`A. haul: ${haul.presses} presses, ${haul.silent} silent`);
  const inv = s().inventory;
  const comp = { lump: 0, nut: 0, needsCooking: 0, ready: 0, other: 0 };
  for (const it of inv) {
    if (it.lump) comp.lump++;
    else if (it.foodKind === 'nut') comp.nut++;
    else if (it.needsCooking) comp.needsCooking++;
    else if (it.edible && (it.kcalEach || 0) > 0) comp.ready++;
    else comp.other++;
  }
  note(`   inventory: ${inv.length} items — lumps:${comp.lump} in-shell-nuts:${comp.nut} needsCooking:${comp.needsCooking} ready:${comp.ready} other:${comp.other}`);
  check('haul: no silent presses', haul.silent === 0, `${haul.silent} silent`);
  check('haul: has processing work (nuts or unknowns)', comp.nut + comp.lump > 0, JSON.stringify(comp));

  // ---------- PHASE B: home ----------
  says.length = 0;
  Game.travelTo(home[0], home[1]);
  const homeMsg = says.join(' || '); says.length = 0;
  note(`B. home. atCamp=${Game.atCamp ? Game.atCamp() : 'n/a'}, nearFire=${Game.nearFire()}`);
  note(`   homecoming (staging + teaching moment): "${homeMsg.slice(0, 600)}"`);
  check('homecoming: says something (staging/teaching)', !!homeMsg.trim());

  // ---------- PHASE C: the kitchen ----------
  // C1. stage: everything unprocessed pack -> counter.
  says.length = 0;
  Game.stageForPrep();
  const stageMsg = says.join(' || '); says.length = 0;
  note(`C1. stage: "${stageMsg.slice(0, 120)}"`);
  note(`   stash=${stash().length} items, pack=${s().inventory.length} left`);
  check('stage: says something', !!stageMsg.trim());
  check('stage: stash non-empty', stash().length > 0, `${stash().length} items`);

  // C2. triage: the mission board reads honest.
  const urg = Game.stashUrgency();
  note('C2. triage lines:');
  let silentTriage = 0;
  for (const { it, idx, left } of urg.slice(0, 8)) {
    const needs = Game.prepNeeds(it), clock = Game.stashClock(it);
    note(`   [${idx}] ${it.name} — ${clock} — needs: ${needs}`);
    if (!needs.trim()) silentTriage++;
  }
  check('triage: every stash item names its needs', silentTriage === 0);
  const clockOrder = urg.map(u => u.left);
  check('triage: sorted most-urgent first', clockOrder.every((v, i, a) => i === 0 || a[i - 1] <= v), clockOrder.join(','));

  // C3. sort the lumps, solo first.
  let sorted = 0, taught = 0, clicked = 0;
  for (let i = stash().length - 1; i >= 0; i--) {
    const it = stash()[i];
    if (!it || !it.lump) continue;
    const comp = it.lump || {};
    const before = Object.keys(comp).length;
    says.length = 0;
    Game.sortBag(null, i, stash());
    const m = says.join(' || '); says.length = 0;
    if (before) {
      sorted++;
      note(`C3. solo sort lump[${i}]: "${m.slice(0, 200)}"`);
      if (!m.trim()) note('   ^^ SILENT sort — violation');
      if (/yours now too|taught/i.test(m)) taught++;
      if (/it clicks/i.test(m)) clicked++;
    }
  }
  note(`   sorted ${sorted} lumps, taught=${taught}, clicked=${clicked}`);

  // C3b. ask a villager who knows what's left.
  for (let i = stash().length - 1; i >= 0; i--) {
    const it = stash()[i];
    if (!it || !it.lump) continue;
    const knowers = Game.whoKnowsLump(it);
    note(`C3b. lump[${i}] "${it.name}": knowers=${knowers.map(k => k.name + '(' + k.knows + ')').join(', ') || 'NONE'}`);
    if (knowers.length) {
      says.length = 0;
      Game.sortBag(knowers[0].id, i, stash());
      const m = says.join(' || '); says.length = 0;
      note(`   ${knowers[0].name} sorts: "${m.slice(0, 220)}"`);
      check('villager sort: says something', !!m.trim());
    }
  }

  // C4. shell the nuts: gross -> net must reconcile at exactly 75%.
  const nutIdx = stash().map((it, i) => [it, i]).filter(([it]) => it.foodKind === 'nut' && it.foodState === 'in_shell');
  if (nutIdx.length) {
    const grossByLot = nutIdx.map(([it]) => it.hiddenKcal || it.kcalEach || 0);
    const gross = grossByLot.reduce((a, b) => a + b, 0);
    says.length = 0;
    Game.shellNuts(undefined, stash());
    const m = says.join(' || '); says.length = 0;
    const shelled = stash().filter(it => it.foodKind === 'nut' && it.foodState === 'shelled');
    const net = shelled.reduce((a, it) => a + (it.kcalEach || 0), 0);
    const expected = grossByLot.reduce((a, g) => a + Math.round(g * 0.75), 0);
    note(`C4. shell: gross=${gross} -> net=${net}, expected=${expected} (75% per lot)`);
    note(`   "${m.slice(0, 140)}"`);
    check('shell: net == round(gross*0.75) per lot', net === expected, `${net} vs ${expected}`);
    check('shell: says something', !!m.trim());
  } else note('C4. shell: no in-shell nuts in stash — skipped');

  // C5. specialists here at camp?
  const specCook = Game.specialistsHere('cook'), specPres = Game.specialistsHere('preserver'), specButch = Game.specialistsHere('butcher');
  note(`C5. specialists here — cook:[${specCook.map(x => x.name + '/' + x.occupation).join(', ')}] preserver:[${specPres.map(x => x.name + '/' + x.occupation).join(', ')}] butcher:[${specButch.map(x => x.name + '/' + x.occupation).join(', ')}]`);

  // C6. whoOptions honesty on a cookable item (needsCooking plant).
  let cookable = findIdx(stash(), it => it.needsCooking && it.diseaseRisk);
  if (cookable >= 0) {
    const it = stash()[cookable];
    const opts = Game.whoOptions(it, 'cook');
    note(`C6. whoOptions on "${it.name}" (cook):`);
    let blockedHonest = true;
    for (const o of opts) {
      note(`   - ${o.label}: ${o.detail}${o.blocked ? ' [BLOCKED: ' + o.blocked + ']' : ''}`);
      if (!o.detail || !o.detail.trim()) blockedHonest = false;
    }
    check('whoOptions: every option states its terms', blockedHonest);
    check('whoOptions: no empty labels', opts.every(o => o.label && o.label.trim()));
  } else note('C6. whoOptions: no cookable item in stash — skipped');

  // C7. the delegation path: ask the cook twice -> learn by watching.
  let learnedCook = false;
  if (cookable >= 0 && specCook.length) {
    const vid = specCook[0].id;
    const techBefore = Game.knowsTechnique('cook');
    for (let w = 0; w < 2; w++) {
      cookable = findIdx(stash(), it => it.needsCooking && it.diseaseRisk);
      if (cookable < 0) break;
      says.length = 0;
      Game.askSpecialist(vid, cookable, stash());
      const m = says.join(' || '); says.length = 0;
      note(`C7. ask ${specCook[0].name} (watch #${w + 1}): "${m.slice(0, 200)}"`);
      if (!m.trim()) note('   ^^ SILENT delegation — violation');
    }
    learnedCook = Game.knowsTechnique('cook') && !techBefore;
    note(`   learnedCook by watching: ${learnedCook} (before=${techBefore})`);
    check('watch twice -> learn cooking', learnedCook);
  } else note(`C7. delegation: ${cookable < 0 ? 'nothing cookable left' : 'no cook specialist here'} — skipped`);

  // C7b. no-specialist honesty: whoOptions for cook with no cook here.
  if (cookable < 0) cookable = findIdx(stash(), it => it.foodKind === 'nut' && it.foodState === 'shelled' && it.kcalEach > 0);
  if (!specCook.length && cookable >= 0) {
    const opts = Game.whoOptions(stash()[cookable], 'cook');
    const nospec = opts.find(o => o.id === 'nospec');
    note(`C7b. no-cook-here honesty: ${nospec ? `"${nospec.label}: ${nospec.detail}"` : 'NO nospec option!'}`);
    check('no cook here: honest blocked option', !!nospec && /no cook here|none here/i.test(nospec.detail));
  }

  // C8. self-cook: the trial path (burnt in spots, you learn).
  cookable = findIdx(stash(), it => it.needsCooking && it.diseaseRisk);
  if (cookable >= 0 && !learnedCook) {
    const it = stash()[cookable];
    const ticksBefore = (s().ticksToday || 0);
    says.length = 0;
    Game.cookFood(cookable, stash());
    const m = says.join(' || '); says.length = 0;
    note(`C8. self-cook "${it.name}": "${m.slice(0, 220)}"`);
    check('self-cook: says something', !!m.trim());
    check('self-cook: learned by trial', Game.knowsTechnique('cook'), `cook=${Game.knowsTechnique('cook')}`);
    check('self-cook: no disease risk remains', !stash()[cookable] || !stash()[cookable].diseaseRisk, 'diseaseRisk=' + (stash()[cookable] && JSON.stringify(stash()[cookable].diseaseRisk)));
  } else note(`C8. self-cook: ${cookable < 0 ? 'nothing cookable' : 'already learned via watching'} — skipped`);

  // C9. eat a real meal: the pay-off.
  const kcalBefore = s().kcal, cap = Game.kcalCap();
  says.length = 0;
  Game.eat();
  const eatMsg = says.join(' || '); says.length = 0;
  note(`C9. eat: kcal ${kcalBefore} -> ${s().kcal} (cap ${cap})`);
  note(`   "${eatMsg.slice(0, 260)}"`);
  check('eat: gained kcal', s().kcal > kcalBefore, `${kcalBefore} -> ${s().kcal}`);
  check('eat: says something', !!eatMsg.trim());

  // C10. put away finished food; pantry math honest.
  const pantryBefore = (Game.state.village.pantry || []).length;
  says.length = 0;
  Game.putAwayFinished();
  const putMsg = says.join(' || '); says.length = 0;
  const pantry = Game.state.village.pantry || [];
  const pantryKcal = pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  note(`C10. putAway: pantry ${pantryBefore} -> ${pantry.length}, kcal=${pantryKcal}`);
  note(`   "${putMsg.slice(0, 160)}"`);
  check('putAway: says something', !!putMsg.trim());
  check('putAway: pantry kcal honest', Math.abs(pantryKcal - (Game.state.village.pantryKcal || 0)) < 1, `calc=${pantryKcal} stored=${Game.state.village.pantryKcal}`);

  // C11. leftovers on the counter: the stash still shows its clocks.
  note(`C11. counter leftovers: ${stash().length} items`);
  for (const it of stash().slice(0, 6)) note(`   - ${it.name}: ${Game.stashClock(it)} — ${Game.prepNeeds(it)}`);

  // ---------- SUMMARY ----------
  const fails = results.filter(r => !r[1]);
  note(`\n== RESULT: ${results.length - fails.length}/${results.length} checks green ==`);
  if (fails.length) { note('FAILURES:'); for (const [n, , d] of fails) note(`   - ${n}${d ? ' — ' + d : ''}`); }
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
