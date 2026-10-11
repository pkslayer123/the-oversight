#!/usr/bin/env node
// PROOF: trap recipe reachability (structural 2026-10-10, Worker D).
// Before: trap supplies + hunting knowledge co-occurred in 1/60 runs —
//   - villager profiles dropped occupation knowsSnare (dormant TRAPS objective,
//     nobody to learn from),
//   - village codices never carried trap recipes (81 codex studies, 0 trap teaches),
//   - trap books were 4 of 34 on one uniform shelf (lottery),
//   - the System's trap manual had no spawn at all.
// After: four real channels — hunter teaching beat, village codices by strategy,
// themed ruin shelves, System field manual on the stalk trial — plus an
// end-to-end trapline run through the real engine (craft/setTrap/checkTraps).
//
// Run: node scripts/test-structural-traps-proof.js   (from repo root)
// Deterministic per SEED env (mulberry32 seeded BEFORE eval via sim-harness).
'use strict';
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

function quiet(Game) {
  Game.say = () => {}; Game.sysSay = () => {};
  let ticks = 0;
  Game.tickAction = (n) => { ticks += Math.max(0, Math.round(n || 0)); return undefined; };
  Game.__ticks = () => ticks;
}

async function fresh(seed) {
  const { Game } = await H.loadGame({ seed: seed == null ? SEED : seed });
  await H.setupGame(Game);
  quiet(Game);
  return Game;
}

function recipeLevel(Game, rid) {
  return (((Game.state.codex || {}).recipes || {})[rid] || {}).level || 0;
}

// ---------------------------------------------------------------------------
// T1: occupation trap knowledge reaches the villager profile (the dropped wire)
// ---------------------------------------------------------------------------
async function t1() {
  console.log('T1: genCharacter inherits knowsSnare from occupation');
  const Game = await fresh();
  const cg = Game.data.characterGen || {};
  const occById = {};
  for (const o of (cg.occupations || [])) occById[o.id] = o;
  let n = 0, bad = 0, hunters = 0;
  const usedNames = new Set(), usedOccs = new Set();
  for (let i = 0; i < 60; i++) {
    let c;
    try { c = Game.genCharacter({ origin: 'Georgia, USA', usedNames, usedOccs }); }
    catch (e) { console.log('  genCharacter threw: ' + e.message); break; }
    if (!c || !c.occupationId) continue;
    n++;
    const occ = occById[c.occupationId] || {};
    if (c.occupationId === 'hunting_guide') hunters++;
    if (!!c.knowsSnare !== !!occ.knowsSnare) { bad++; }
  }
  check('generated 60 characters', n === 60, `n=${n}`);
  check('hunting guides generated (spot check)', hunters > 0, `hunters=${hunters}`);
  check('knowsSnare matches occupation on every profile', bad === 0, `mismatches=${bad}`);
}

// ---------------------------------------------------------------------------
// T2: hunter teaching beat — witnessed return teaches snare L1 (taught)
// ---------------------------------------------------------------------------
async function t2() {
  console.log('T2: hunter teaching beat (objReturnEffect traps)');
  const Game = await fresh();
  const v = Game.state.village;
  // player at haven so the return is witnessed
  Game.map.px = (v.px == null ? 4 : v.px);
  Game.map.py = (v.py == null ? 4 : v.py);
  const vid = 'vh_teach1';
  const vp = { id: vid, name: 'Test Hunter', occupationId: 'hunting_guide', knowsSnare: true };
  v.rosterChars = v.rosterChars || {};
  v.rosterChars[vid] = vp;
  v.roster = v.roster || [];
  if (v.roster.indexOf(vid) < 0) v.roster.push(vid);
  v.trust = v.trust || {};
  delete ((Game.state.codex || {}).recipes || {})['snare'];

  // 2a: stranger (trust 10) does NOT teach — the craft is earned on regard
  v.trust[vid] = 10;
  Game.objReturnEffect(vid, 'traps');
  check('no teach at trust 10 (stranger)', recipeLevel(Game, 'snare') === 0);

  // 2b: regarded hunter (trust 20) teaches on the witnessed return
  v.trust[vid] = 20;
  Game.objReturnEffect(vid, 'traps');
  const rk = ((Game.state.codex || {}).recipes || {})['snare'] || {};
  check('snare L1 after taught return', rk.level === 1, `level=${rk.level}`);
  check('taught via=taught with teacher recorded', rk.via === 'taught' && !!rk.learnedFrom,
    `via=${rk.via} from=${rk.learnedFrom}`);
  check('villager flagged (one lesson)', vp.taughtSnare === true);

  // 2c: no double-teach on later returns
  Game.objReturnEffect(vid, 'traps');
  check('still L1 after second return (no re-grant)', recipeLevel(Game, 'snare') === 1);

  // 2d: a villager WITHOUT knowsSnare never teaches, however trusted
  const vid2 = 'vh_teach2';
  v.rosterChars[vid2] = { id: vid2, name: 'Test Cook', occupationId: 'cook', knowsSnare: false };
  v.trust[vid2] = 90;
  delete (((Game.state.codex || {}).recipes || {})['snare']);
  Game.objReturnEffect(vid2, 'traps');
  check('non-hunter never teaches', recipeLevel(Game, 'snare') === 0);
}

// ---------------------------------------------------------------------------
// T3: village codices carry trap recipes by strategy; study teaches them
// ---------------------------------------------------------------------------
async function t3() {
  console.log('T3: strategy codices teach trap recipes');
  const Game = await fresh();
  const worldT = (x, y, type) => {
    if (x < 0 || x > 8 || y < 0 || y > 8) return;
    Game.map.tiles[y][x] = Object.assign(Game.map.tiles[y][x] || {}, { type });
  };
  const cases = [
    { focus: 'fisher', want: ['minnow_trap', 'fish_weir'], paint: [['water', 3], ['creek', 1]] },
    { focus: 'forager', want: ['snare'], paint: [['forest', 4], ['grove', 1]] },
    { focus: 'scavenger', want: ['deadfall'], paint: [['ruin', 2]] },
    { focus: 'farmer', want: [], paint: [['meadow', 4], ['field', 1]] },
  ];
  for (const c of cases) {
    const vx = 2, vy = 2; // radius 2 stays fully in-bounds on the 9x9 world
    // paint surroundings on a neutral filler ('thicket' counts toward no focus)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) worldT(vx + dx, vy + dy, 'thicket');
    let k = 0;
    for (const [tt, n] of c.paint) for (let i = 0; i < n; i++) { worldT(vx - 2 + (k % 5), vy - 2 + Math.floor(k / 5), tt); k++; }
    const vil = { id: 'v_t3_' + c.focus, name: 'T3 ' + c.focus, x: vx, y: vy };
    Game.genVillageKnowledgeProfile(vil);
    const got = Object.keys((vil.codex || {}).recipes || {});
    const ok = c.want.every(r => got.indexOf(r) !== -1);
    check(`${c.focus} codex carries ${c.want.join(',') || '(no traps, by design)'}`, ok, `got=[${got}]`);
  }
  // study path: a forager village teaches snare at L3 via the real action
  const Game2 = await fresh();
  const vil = { id: 'village_0', name: 'Study Village', x: 3, y: 3,
    codex: { plants: {}, techniques: {}, recipes: { snare: { known: true, learnedDay: 0 } }, animals: {} } };
  Game2.state.otherVillages = [vil];
  Game2.map.px = 3; Game2.map.py = 3;
  delete (((Game2.state.codex || {}).recipes || {})['snare']);
  let res = null;
  try { res = Game2.studyVillageCodex('village_0'); } catch (e) { res = 'THREW: ' + e.message; }
  const rk = ((Game2.state.codex || {}).recipes || {})['snare'] || {};
  check('studyVillageCodex teaches snare L3', rk.level === 3 && rk.via === 'taught',
    `level=${rk.level} via=${rk.via} res=${String(res).slice(0, 60)}`);
}

// ---------------------------------------------------------------------------
// T4: themed ruin shelves — wild ruins yield field books at a real rate
// ---------------------------------------------------------------------------
const TRAP_BOOKS = new Set(['trappers_handbook', 'system_manual_traps', 'fishers_ledger', 'basket_weavers_primer']);
function trapBookInInv(Game) {
  return (Game.state.scholar.inventory || []).find(i => i && i.bookId && TRAP_BOOKS.has(i.bookId));
}
async function ruinTrials(n, wild, seedBase) {
  let hits = 0, books = 0;
  for (let i = 0; i < n; i++) {
    const Game = await fresh(seedBase + i);
    const px = 2, py = 2;
    Game.map.px = px; Game.map.py = py;
    const s = Game.state.scholar; s.mx = 4; s.my = 4;
    // paint the world tile + surroundings
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const ax = px + dx, ay = py + dy;
      if (ax < 0 || ax > 8 || ay < 0 || ay > 8) continue;
      Game.map.tiles[ay][ax] = Object.assign(Game.map.tiles[ay][ax] || {}, { type: wild ? 'forest' : 'meadow' });
    }
    Game.map.tiles[py][px] = Object.assign(Game.map.tiles[py][px] || {}, { type: 'ruin', bookChecked: false, loot: [] });
    s.inventory = [];
    try { Game.doAction('forage'); } catch (e) { /* action-level throw = infra issue */ }
    const got = (s.inventory || []).find(x => x && x.bookId);
    if (got) {
      books++;
      if (TRAP_BOOKS.has(got.bookId)) hits++;
    }
  }
  return { hits, books, n };
}
async function t4() {
  console.log('T4: wild-ruin shelf vs tame-ruin shelf (40 trials each)');
  const w = await ruinTrials(40, true, SEED + 1000);
  const t = await ruinTrials(40, false, SEED + 2000);
  console.log(`  wild ruin: ${w.hits}/${w.n} trap books (${w.books} books total)`);
  console.log(`  tame ruin: ${t.hits}/${t.n} trap books (${t.books} books total)`);
  check('wild ruins yield trap books at a real rate', w.hits >= 3, `hits=${w.hits}/40`);
  check('books still spawn on tame ruins (channel not narrowed)', t.books >= 3, `books=${t.books}/40`);
}

// ---------------------------------------------------------------------------
// T5: System stalk trial issues the field manual; reading teaches spring_snare
// ---------------------------------------------------------------------------
async function t5() {
  console.log('T5: stalk trial pamphlet -> readBook -> spring_snare');
  const Game = await fresh();
  const s = Game.state.scholar;
  delete (((Game.state.codex || {}).recipes || {})['spring_snare']);
  s.trialOffer = { day: 1, options: [{ id: 'stalk', label: 'Trial of the Long Stalk', desc: 'Take game with patience, not noise.' }] };
  s.day = 2;
  let r = null;
  try { r = Game.chooseTrialOption('stalk'); } catch (e) { r = 'THREW: ' + e.message; }
  const pam = (s.inventory || []).find(i => i && i.bookId === 'system_manual_traps');
  check('pamphlet issued into pack', !!pam, `r=${String(r).slice(0, 40)}`);
  if (pam) {
    let rb = null;
    try { rb = Game.readBook('system_manual_traps'); } catch (e) { rb = 'THREW: ' + e.message; }
    const rk = ((Game.state.codex || {}).recipes || {})['spring_snare'] || {};
    check('readBook teaches spring_snare L3', rk.level === 3 && rk.via === 'read',
      `level=${rk.level} via=${rk.via}`);
    check('pamphlet consumed by reading', !(s.inventory || []).some(i => i && i.bookId === 'system_manual_traps'));
  }
  // no duplicate issue when the recipe is already known
  const Game2 = await fresh();
  Game2.grantKnowledge('recipe', 'spring_snare', 3, { type: 'test' });
  const s2 = Game2.state.scholar;
  s2.trialOffer = { day: 1, options: [{ id: 'stalk', label: 'x', desc: 'y' }] };
  s2.day = 2;
  try { Game2.chooseTrialOption('stalk'); } catch (e) {}
  check('no duplicate pamphlet when recipe known',
    !(s2.inventory || []).some(i => i && i.bookId === 'system_manual_traps'));
}

// ---------------------------------------------------------------------------
// E2E: trapline end to end — teach -> materials -> blind craft -> set -> catch
// ---------------------------------------------------------------------------
async function e2e() {
  console.log('E2E: trapline end-to-end through the real engine');
  const Game = await fresh();
  const s = Game.state.scholar;
  const v = Game.state.village;
  Game.map.px = (v.px == null ? 4 : v.px);
  Game.map.py = (v.py == null ? 4 : v.py);
  delete (((Game.state.codex || {}).recipes || {})['snare']);

  // 1. acquire the recipe through the hunter teaching beat (real channel)
  const vid = 'vh_e2e';
  v.rosterChars = v.rosterChars || {};
  v.rosterChars[vid] = { id: vid, name: 'E2E Hunter', occupationId: 'hunting_guide', knowsSnare: true };
  v.trust = v.trust || {}; v.trust[vid] = 25;
  Game.objReturnEffect(vid, 'traps');
  check('E2E: recipe acquired via teaching (L1)', recipeLevel(Game, 'snare') === 1);

  // 2. materials in hand (vine + stick as material items)
  const mat = (material, units, name) => s.inventory.push({ material, units, name, kcalEach: 0, spoilDay: 99999, kg: 0.05 });
  mat('vine', 20, 'Vine'); mat('stick', 20, 'Stick');

  // 3. blind craft (L1, 35%) — the practice ladder; success teaches L2
  let crafted = 0, attempts = 0;
  for (; attempts < 12 && recipeLevel(Game, 'snare') < 2; attempts++) {
    try { if (Game.craft('snare')) crafted++; } catch (e) {}
  }
  check('E2E: blind craft succeeded within 12 tries (seeded)', crafted > 0, `attempts=${attempts}`);
  check('E2E: successful blind craft taught L2', recipeLevel(Game, 'snare') === 2);

  // 4. set the trap on wild ground with real wildlife
  const TX = 5, TY = 5;
  Game.map.px = TX; Game.map.py = TY; s.mx = 4; s.my = 4;
  const t = Game.map.tiles[TY][TX];
  Object.assign(t, { type: 'meadow', wildlife: { cottontail_rabbit: 6, gray_squirrel: 4 }, traps: [] });
  let setOk = false;
  try { setOk = !!Game.setTrap('snare'); } catch (e) { console.log('  setTrap threw: ' + e.message); }
  check('E2E: trap set on the tile', setOk && (t.traps || []).length === 1);

  // 5. run dawn checks; the trapline must catch
  let catches = 0;
  for (let d = 1; d <= 25; d++) {
    s.day = d;
    const cb = (s.inventory || []).length;
    try { Game.checkTraps(); } catch (e) { console.log('  checkTraps threw d' + d + ': ' + e.message); break; }
    for (const it of (s.inventory || []).slice(cb)) {
      if (it && it.foodKind === 'meat') catches++;
    }
    // re-set if the snare broke (2 catches per snare); keep the line running
    if (!(t.traps || []).length && d < 25) {
      try { if (Game.craft('snare')) Game.setTrap('snare'); } catch (e) {}
    }
  }
  check('E2E: trapline caught game within 25 days', catches > 0, `catches=${catches}`);
  console.log(`  E2E summary: recipe L1(taught) -> L2(blind craft) -> ${catches} catches, ticks=${Game.__ticks()}`);
}

// ---------------------------------------------------------------------------
// AVAILABILITY SWEEP: how often do the new channels EXIST in a fresh run?
// ---------------------------------------------------------------------------
async function sweep() {
  console.log('SWEEP: channel availability across 12 fresh runs');
  let hunterVillages = 0, trapVillages = 0, n = 12;
  const focusTraps = { fisher: ['minnow_trap'], forager: ['snare'], scavenger: ['deadfall'] };
  for (let i = 0; i < n; i++) {
    const Game = await fresh(SEED + 5000 + i);
    const v = Game.state.village || {};
    const roster = v.roster || [];
    let hasHunter = false;
    for (const vid of roster) {
      const vp = Game.vpOf ? Game.vpOf(vid) : {};
      if (vp && vp.knowsSnare) { hasHunter = true; break; }
    }
    if (hasHunter) hunterVillages++;
    let hasTrapVillage = false;
    for (const ov of (Game.state.otherVillages || [])) {
      try {
        const vil = { x: ov.x, y: ov.y };
        const prof = Game.genVillageKnowledgeProfile(vil);
        const recs = Object.keys((vil.codex || {}).recipes || {});
        const traps = (focusTraps[prof.focus] || []);
        if (traps.some(r => recs.indexOf(r) !== -1)) { hasTrapVillage = true; break; }
      } catch (e) {}
    }
    if (hasTrapVillage) trapVillages++;
  }
  console.log(`  runs with a knowsSnare villager at home: ${hunterVillages}/${n}`);
  console.log(`  runs with a trap-teaching village nearby: ${trapVillages}/${n}`);
  // The hunter-at-home channel is rare by design (1 occupation in 55 knows the
  // wire — canon, not a knob). The bar here is existence in the wild: the wire
  // fix must produce real hunters in real generation, not just in fixtures.
  check('hunters spawn in real generation (channel exists in the wild)', hunterVillages >= 1, `${hunterVillages}/${n}`);
  // The village-study channel is the workhorse: every run should have a
  // trap-teaching village reachable by travel + a day-part of study.
  check('a trap-teaching village exists in a sane share of runs', trapVillages >= 4, `${trapVillages}/${n}`);
}

async function main() {
  console.log(`test-structural-traps-proof (seed ${SEED})`);
  await t1();
  await t2();
  await t3();
  await t4();
  await t5();
  await e2e();
  await sweep();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS FATAL: ' + (e && e.stack || e)); process.exit(2); });
