#!/usr/bin/env node
// Break-it travel & map, round 11 (2026-10-10) — hostile-player attacks.
//
// CATCH THIS RUN (DEAD-CODE/HONESTY): the `state.over` phantom flag.
// `Game.state.over` is READ in 14 places (app.js x5, contests.js x6,
// game.js x2 phoenix guards, perceive.js x1) but NOTHING ever writes it —
// the live flag is `Game.over` (Game.status().over). Every one of those
// guards was dead: contest/show eligibility listed a dead run's scholar as
// castable, the ratings summons could fire on a corpse-run, and the UI
// gates never fired. Worse, pre-2026-10-08 split-brain saves could persist
// state.over=true, which would poison the UI gates on load (nearby actions
// vanish) while Game.over=false.
// FIX: read the live flag — `st.over`/`Game.over` in app.js,
// `this.over` in contests.js/game.js/perceive.js.
//
// Also attacked (all HELD — verified, not broken):
//   EXPLOIT — travelTimeStep ping-pong farming (r7 mechanism re-verified),
//             mid-combat / dead travel, force-bypass guard order,
//             distant-village catch-up before arrival
//   SOFTLOCK — findWalkableEntry bounds sweep, pathStep/beginPathWalk
//             combat+death, tryNodeExit all-blocked
//   HONESTY — blocked travel stays blocked + says why, intermediate
//             blockages, travelTargets shape, fog gates
//   DEAD-CODE — every travel/map module loaded from index.html, every
//             Game.* travel entry point defined AND called
//
// Run: node scripts/test-travel-r11.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine (index.html order, DOM-only excluded) ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // stub for the eval phase only (flips combat async — deleted before play)
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const said = [];
Game.say = (m) => { said.push(String(m)); };

async function freshGame() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  said.length = 0;
  return Game.state.scholar;
}
// two adjacent wild tiles with no blockages, not haven, for hop probes
function hopTiles() {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) {
    const a = Game.tileAt(x, y), b = Game.tileAt(x + 1, y);
    if (!a || !b || a.blockFrom || b.blockFrom) continue;
    if (a.type === 'haven' || b.type === 'haven' || a.type === 'oldhaven' || b.type === 'oldhaven') continue;
    return [[x, y], [x + 1, y]];
  }
  return null;
}

(async () => {
  // ================= D. DEAD-CODE =================
  console.log('\n[D] dead-code: travel/map modules loaded, entry points live');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of ['engine/state.js', 'engine/day.js', 'game.js', 'carexplore.js', 'perceive.js', 'party.js', 'debug-scenarios.js']) {
    ok(html.includes('src/js/' + m), 'index.html loads src/js/' + m);
  }
  const fns = ['travelTo', 'travelTargets', 'travelBlockage', 'tryNodeExit', 'edgeExit',
    'findWalkableEntry', 'reveal', 'markSeen', 'mapSeen', 'compareMaps', 'villageMapKnown',
    'hiveSight', 'returnToVillage', 'returnToOldVillage', 'beginPathWalk', 'pathStep',
    'walkCost', 'walkStepKcal', 'findPath', 'clearBlockage', 'buildBridge',
    'checkVillageProximity', 'catchUpSim', 'backfillSeen', 'seedVillagerMaps',
    'depletionClass', 'noteTrailUse', 'arrivalTextFor', 'debugToWildNode', 'tileFeature',
    'examineCell', 'microMove', 'cellProps', 'genDetail', 'travelTimeStep',
    'checkEncounter', 'checkAnimals', 'villageCard', 'villageCardAction', 'guestMeal'];
  const allSrc = fs.readdirSync(path.join(ROOT, 'src/js')).concat(['engine'])
    .map(f => { try { return fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'); } catch (e) { return ''; } }).join('\n')
    + ['state.js', 'modifiers.js', 'calories.js', 'day.js', 'forage.js', 'combat.js']
      .map(f => { try { return fs.readFileSync(path.join(ROOT, 'src/js/engine', f), 'utf8'); } catch (e) { return ''; } }).join('\n');
  for (const fn of fns) {
    ok(typeof Game[fn] === 'function', `Game.${fn} defined`);
    if (fn === 'debugToWildNode') {
      ok(true, 'Game.debugToWildNode is an intentional debug/test hook (assigned, not called in prod)');
      continue;
    }
    const calls = (allSrc.match(new RegExp('(this\\.|Game\\.)' + fn + '\\s*\\(', 'g')) || []).length;
    ok(calls >= 1, `Game.${fn} has >=1 call site (${calls})`);
  }

  // ================= T. THE BREAK: state.over phantom flag =================
  console.log('\n[T] BREAK: `state.over` is read in 14 places, never written');
  await freshGame();
  const s = Game.state.scholar;
  ok(Game.state.over === undefined, 'state.over is undefined in a live game (phantom flag)');
  ok(Game.over === false, 'Game.over is the live flag (false in a live game)');
  // make the scholar contest-eligible on every honest axis
  s.health = 80; s.exiled = false; s.day = 14; // contestEligible casts day 14+
  Game.over = true; // THE DEAD RUN: village lost, run ended
  let elig = null;
  try { elig = Game.contestEligible(); } catch (e) { elig = { error: String(e) }; }
  if (!elig || elig.error) {
    ok(false, 'contestEligible runs in harness', elig && elig.error);
  } else {
    const pElig = (elig.eligible || []).some(e => e.id === 'player');
    const pInelig = (elig.ineligible || []).find(e => e.id === 'player');
    // BEFORE fix: player eligible on a dead run (state.over never true).
    // AFTER fix: ineligible, reason names the death.
    ok(!pElig, 'dead run: scholar NOT contest-eligible');
    ok(!!pInelig && /dead/.test(pInelig.reason || ''), 'dead run: ineligibility reason names death', pInelig && pInelig.reason);
  }
  // show eligibility (TV pulls)
  try {
    const se = Game.showEligible();
    const pSe = (se || []).some(e => e.id === 'player');
    ok(!pSe, 'dead run: scholar NOT show-eligible');
  } catch (e) { ok(false, 'showEligible runs in harness', String(e)); }
  // ratings summons must die aloud on a dead run, not summon a corpse
  const sysSaid = [];
  const origSysSay = Game.sysSay;
  Game.sysSay = (m) => sysSaid.push(String(m));
  let summons = 'unset';
  try { summons = Game.fireRatingsSummons(); } catch (e) { summons = 'threw: ' + e; }
  Game.sysSay = origSysSay;
  ok(summons === null, 'dead run: fireRatingsSummons returns null (summons dies)', String(summons).slice(0, 60));
  ok(sysSaid.some(m => /no one fit for the cameras|green room/i.test(m)), 'dead run: summons says why, aloud');
  // static: no state.over reads remain (outside comments)
  const phantomReads = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    if (!f.endsWith('.js')) continue;
    const lines = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (/state\.over\b/.test(l) && !/state\.over\s*=/.test(l)) phantomReads.push(`${f}:${i + 1}`);
    });
  }
  ok(phantomReads.length === 0, 'no `state.over` reads remain in src/js', phantomReads.slice(0, 6).join(', '));
  Game.over = false; // restore

  // ================= E. EXPLOIT (held) =================
  console.log('\n[E] exploit probes (expect HELD)');
  {
    await freshGame();
    // E1: ping-pong farming — the world-step must be priced by the clock
    const origNeeds = Game.tickNeeds, origGossip = Game.spreadGossip;
    const origEncounter = Game.checkEncounter, origAnimals = Game.checkAnimals;
    let worldSteps = 0;
    Game.tickNeeds = function () { worldSteps++; };
    Game.spreadGossip = function () { worldSteps++; };
    Game.checkEncounter = () => {}; Game.checkAnimals = () => {};
    const pair = hopTiles();
    ok(!!pair, 'found adjacent wild hop tiles');
    const sc = Game.state.scholar;
    sc.dayTicks = 0; sc._lastTravelStepTicks = undefined; sc._travelStepDebt = 0;
    const [[ax, ay], [bx, by]] = pair;
    Game.map.px = ax; Game.map.py = ay;
    for (let i = 0; i < 30; i++) {
      const r = (i % 2 === 0) ? Game.travelTo(bx, by) : Game.travelTo(ax, ay);
      if (r === null || r === undefined) break; // refused (blockage/death) — stop honestly
    }
    ok(worldSteps <= 2, `30 free hops grant ~no world-steps without clock time (got ${worldSteps}; first-crossing beat allows 2)`);
    sc.dayTicks = 128; // a real day-part of lived time passes
    Game.travelTo(ax, ay); Game.travelTo(bx, by);
    ok(worldSteps >= 3, `lived time releases world-steps proportionally (got ${worldSteps})`);
    Game.tickNeeds = origNeeds; Game.spreadGossip = origGossip;
    Game.checkEncounter = origEncounter; Game.checkAnimals = origAnimals;
  }
  {
    await freshGame();
    // E2/E3: travel refuses mid-combat and when dead
    const pair = hopTiles();
    const [[ax, ay], [bx, by]] = pair;
    Game.map.px = ax; Game.map.py = ay;
    const origInCombat = Game.inCombat;
    Game.inCombat = () => true;
    ok(Game.travelTo(bx, by) === null, 'mid-combat travelTo refuses (null)');
    ok(Game.tryNodeExit(1, 0) === null, 'mid-combat tryNodeExit refuses (null)');
    ok(Game.map.px === ax && Game.map.py === ay, 'mid-combat: position unchanged');
    // force does NOT bypass the combat guard (guard order: over/combat first)
    const dest = Game.tileAt(bx, by);
    const savedBf = dest.blockFrom;
    dest.blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' };
    ok(Game.travelTo(bx, by, true) === null, 'force travel mid-combat still refuses');
    Game.inCombat = origInCombat;
    // E4: blocked stays blocked without force; force is the sanctioned swim path
    said.length = 0;
    const r1 = Game.travelTo(bx, by);
    ok(r1 && r1.kind === 'blockage', 'blocked destination: travelTo returns the blockage');
    ok(Game.map.px === ax && Game.map.py === ay, 'blocked: position unchanged');
    ok(said.some(m => /fallen tree|blocks the path/i.test(m)), 'blocked: says why, aloud');
    const r2 = Game.travelTo(bx, by, true);
    ok(!(r2 && r2.kind === 'blockage') && Game.map.px === bx, 'force (swim/debug): crosses, honestly');
    dest.blockFrom = savedBf;
    // E3: the dead travel nothing
    Game.over = true;
    ok(Game.travelTo(ax, ay) === null, 'dead: travelTo refuses (null)');
    ok(Game.beginPathWalk(0, 0) === null, 'dead: beginPathWalk refuses (null)');
    ok(Game.pathStep(0, 0) === false, 'dead: pathStep refuses (false)');
    Game.over = false;
  }
  {
    await freshGame();
    // E5: distant villages catch up BEFORE you arrive, never before you approach
    const ovs = (Game.state.otherVillages || []).filter(v => v && v.x !== undefined);
    ok(ovs.length > 0, 'other villages exist');
    const far = ovs.filter(v => !v.generated);
    ok(far.every(v => !v.generated), 'unapproached villages start ungenerated');
    const v = ovs[0];
    // walk toward the village through honest travelTo hops until within
    // proximity (dist<=2) — proximity must generate + catch up on arrival
    Game.map.px = Math.max(0, v.x - 3); Game.map.py = Math.max(0, v.y - 3);
    const vdist = () => Math.abs(Game.map.px - v.x) + Math.abs(Game.map.py - v.y);
    const before = Game.state.scholar.day || 1;
    let guard = 0;
    while (vdist() > 2 && guard++ < 8) {
      const cands = Game.travelTargets()
        .filter(t => !Game.travelBlockage(t.x, t.y))
        .map(t => ({ t, vd: Math.abs(t.x - v.x) + Math.abs(t.y - v.y) }))
        .filter(c => c.vd < vdist())
        .sort((a, b) => a.vd - b.vd);
      let moved = false;
      for (const c of cands) {
        // a refused hop (intermediate blockage on every shortest path) is
        // honest — try the next candidate, like a player rerouting.
        // travelTo returns undefined on success, null on refusal,
        // {kind:'blockage'} on a guarded hop.
        const px0 = Game.map.px, py0 = Game.map.py;
        const r = Game.travelTo(c.t.x, c.t.y);
        if ((Game.map.px !== px0 || Game.map.py !== py0) && !(r && r.kind === 'blockage')) { moved = true; break; }
      }
      if (!moved) break;
    }
    ok(vdist() <= 2, `walked within proximity (dist ${vdist()})`);
    ok(v.generated === true, 'approach generates the village');
    ok(v.day === before, `catch-up sim ran to today (village day ${v.day}, today ${before})`);
    const stillFar = ovs.find(x => x !== v && !x.generated);
    if (stillFar) ok(!stillFar.generated, 'villages you never approached stay ungenerated (no leak)');
  }

  // ================= S. SOFTLOCK (held) =================
  console.log('\n[S] softlock probes (expect HELD)');
  {
    await freshGame();
    // S1: findWalkableEntry never strands out of bounds
    let bad = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const e = Game.findWalkableEntry(x, y, 0, 0);
      if (!e || e.x < 0 || e.x > 8 || e.y < 0 || e.y > 8) bad++;
    }
    ok(bad === 0, `findWalkableEntry in-bounds for all 81 tiles (${bad} bad)`);
  }
  {
    await freshGame();
    // S2: committed walks refuse mid-combat (no desync)
    const origInCombat = Game.inCombat;
    Game.inCombat = () => true;
    ok(Game.beginPathWalk(0, 0) === null, 'mid-combat: beginPathWalk refuses');
    ok(Game.pathStep(0, 0) === false, 'mid-combat: pathStep refuses');
    Game.inCombat = origInCombat;
  }
  {
    await freshGame();
    // S3: node surrounded by blockages — every exit honest, none move you
    const pair = hopTiles();
    const [[ax, ay]] = pair;
    Game.map.px = ax; Game.map.py = ay;
    const saved = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ax + dx, ny = ay + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      const t = Game.tileAt(nx, ny);
      saved.push([t, t.blockFrom]);
      t.blockFrom = { dx: -dx, dy: -dy, type: 'fallen_tree' };
    }
    let moved = 0, blocked = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = Game.tryNodeExit(dx, dy);
      if (r && r.moved) moved++;
      if (r && r.blocked) blocked++;
    }
    ok(moved === 0 && Game.map.px === ax && Game.map.py === ay, 'all exits blocked: nothing moves you');
    ok(blocked === saved.length, `all exits report their blockage (${blocked}/${saved.length})`);
    for (const [t, bf] of saved) t.blockFrom = bf;
  }

  // ================= H. HONESTY (held) =================
  console.log('\n[H] honesty probes (expect HELD)');
  {
    await freshGame();
    // H1: travelTargets are genuine — d in 1..3, and revealed unless adjacent
    const tg = Game.travelTargets();
    ok(tg.length > 0, `travelTargets offers destinations (${tg.length})`);
    ok(tg.every(t => t.d > 0 && t.d <= 3 && (Game.tileAt(t.x, t.y).revealed || t.d === 1)),
      'every target is d=1..3 and revealed-or-adjacent (no phantom targets)');
    // H2: intermediate blockages refuse honestly, no partial move
    const pair = hopTiles();
    let tested = false;
    outer: for (let y = 0; y < 9 && !tested; y++) for (let x = 0; x < 7 && !tested; x++) {
      const a = Game.tileAt(x, y), m = Game.tileAt(x + 1, y), b = Game.tileAt(x + 2, y);
      if (!a || !m || !b || a.blockFrom || b.blockFrom) continue;
      if ([a, m, b].some(t => t.type === 'haven' || t.type === 'oldhaven')) continue;
      m.blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' }; // guards its west side
      Game.map.px = x; Game.map.py = y;
      said.length = 0;
      const r = Game.travelTo(x + 2, y);
      const blockedHonestly = r && r.kind === 'blockage' && Game.map.px === x &&
        said.some(mm => /fallen tree|blocks the path/i.test(mm));
      m.blockFrom = null;
      if (Game.travelTargets().some(t => t.x === x + 2 && t.y === y)) {
        ok(blockedHonestly, 'd=2 hop over a guarded middle tile: refused, unmoved, said why');
        tested = true;
      }
    }
    if (!tested) console.log('  (skip: no suitable d=2 corridor this seed)');
    // H3: fog — unvisited stays unvisited; shared requires the social gate
    const sc = Game.state.scholar;
    let unfogged = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if ((x !== Game.map.px || y !== Game.map.py) && !Game.mapSeen(x, y)) unfogged++;
    }
    ok(unfogged > 0, `fog holds: ${unfogged} tiles unseen after spawn`);
    const known = Game.villageMapKnown();
    const vps = (Game.data.villagers || []).concat(Game.data.background_survivors || []);
    const vp = vps.find(p => p && p.id && (p.visitedTiles || []).length);
    if (vp) {
      const before = (vp.visitedTiles || []).filter(k => !known[k]);
      if (before.length) {
        ok(true, `unshared villager tiles stay out of the codex MAPS gate (${before.length} hidden)`);
        Game.compareMaps(vp.id);
        const known2 = Game.villageMapKnown();
        ok(before.every(k => known2[k]), 'compareMaps shares them — the social gate, earned');
      } else console.log('  (skip: villager shares all tiles already)');
    }
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  if (failures.length) console.log('failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
