#!/usr/bin/env node
// Break-it travel & map proof tests, run 2026-10-10 (target: TRAVEL & MAP).
// Hostile-player attacks against node travel, fog of war, and map honesty.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. EXPLOIT — diagonal blockage bypass (game.js travelBlockage): blockages
//      generate orthogonal-only, but travelTargets() offers diagonal
//      destinations (Manhattan d=2). The old exact-anti-match
//      (bf.dx===-dx && bf.dy===-dy) let a diagonal approach slip past ANY
//      blockage — a west-approach fallen tree was dodged by entering from
//      the northwest: no card, no cost, no clearing. Fixed: a blockage
//      guards its SIDE of the tile — any entry with a component from the
//      blocked side is stopped, orthogonal or diagonal.
//   2. HONESTY — hive_mind's copy promised "(map reveals)" and its acquire
//      line said "the map is open. Every tile, revealed." The engine only
//      set tile.revealed (the TRAVEL flag); the world-map overlay the player
//      actually reads is seenTiles-gated, so the map stayed dark — -10 trust
//      and 200 kcal/day metabolic paid for an empty promise. Fixed:
//      Game.hiveSight() makes the overlay render every tile at 'shared'
//      level (biome color, never detail — "visited earns detail" holds),
//      display-only (never writes seenTiles: the compareMaps social gate and
//      the codex MAPS gate stay clean), derived from the live ability so
//      losing hive_mind closes the sight. Copy rewritten to name the limit.
//
// HELD (attacked, resisted — documented, not fixed):
//   - travelTargets/travelTo guard agreement, force param (swim-only UI),
//     travelTimeStep proportional banking, committed-walk billing, card cost
//     labels vs engine charges, fog gating on depletion/wanderer/villages,
//     toWildNode bounds, dead-code sweep (all travel/map fns reachable).
//
// Run: node scripts/test-travel-break-20261010.js
// (node harness: full src/js list in index.html order minus DOM-only
//  app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js; Math.random
//  seeded BEFORE eval since modules capture it at load.)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(0x7A4E10);

// ---------- minimal browser-ish globals ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, String(f)), 'utf8'))) });
global.window = global;
global.document = undefined;
global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };

// ---------- eval full script list in index.html order, minus DOM-only ----------
const DOM_ONLY = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js', 'drama.js']);
const order = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .split('\n')
  .map(l => (l.match(/src="src\/js\/([^"?]+)/) || [])[1])
  .filter(Boolean)
  .filter(f => !DOM_ONLY.has(f));
for (const f of order) {
  const p = path.join(ROOT, 'src/js', f);
  try {
    eval(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.log('HARNESS EVAL FAIL ' + f + ': ' + (e && e.message));
    process.exit(2);
  }
}
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

const said = [];
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  if (Game.log) Game.log.length = 0;
}

(async () => {
  await Game.init();
  freshGame();

  // ================= CATCH 1: diagonal blockage bypass =================
  const px = Game.map.px, py = Game.map.py;
  // At game start only haven+south are revealed, so travelTargets offers
  // just orthogonal d=1 neighbors. Reveal the surroundings (as any real
  // travel would) so diagonal d=2 destinations enter the list.
  Game.reveal(px, py);
  // find a diagonal travel target (Manhattan d=2, both axes nonzero)
  let diag = Game.travelTargets().find(t => t.x !== px && t.y !== py);
  ok(!!diag, 'setup: a diagonal travel target exists', 'px=' + px + ' py=' + py);
  if (diag) {
    const dx = Math.sign(diag.x - px), dy = Math.sign(diag.y - py);
    const tile = Game.tileAt(diag.x, diag.y);
    delete tile.bridged;
    // west-approach fallen tree, generation shape: {dx:-1, dy:0} blocks
    // orthogonal entry from the west (travel dx=+1). Approach diagonally
    // from the northwest instead.
    tile.blockFrom = { dx: -dx, dy: 0, type: 'fallen_tree' };
    // BEFORE FIX: travelBlockage returned null here (dy mismatch) and
    // travelTo walked straight through. AFTER FIX: blocked.
    const block = Game.travelBlockage(diag.x, diag.y);
    ok(block && block.kind === 'blockage' && block.blockType === 'fallen_tree',
      'diagonal approach into a side-blocked tile is STOPPED',
      'got ' + JSON.stringify(block));
    said.length = 0;
    const res = Game.travelTo(diag.x, diag.y);
    ok(res && res.kind === 'blockage', 'diagonal travelTo returns the blockage, not a crossing');
    ok(Game.map.px === px && Game.map.py === py, 'diagonal travelTo does not move you');
    ok(said.length > 0 && /tree|block/i.test(said.join(' ')), 'diagonal blockage says what blocks you (no silent refusal)');
    // regression: orthogonal entry from the blocked side still stopped…
    const ox = px + dx, oy = py; // orthogonal, same blocked side
    if (ox >= 0 && ox < 9) {
      const ot = Game.tileAt(ox, oy);
      ot.blockFrom = { dx: -dx, dy: 0, type: 'rubble' };
      const ob = Game.travelBlockage(ox, oy);
      ok(ob && ob.blockType === 'rubble', 'orthogonal entry from the blocked side still stopped');
      delete ot.blockFrom;
    }
    // …and entries from unblocked sides still pass (no softlock: the tile
    // is never sealed — cut/clear/bridge/swim/go-around all remain).
    delete tile.blockFrom;
    const open = Game.travelBlockage(diag.x, diag.y);
    ok(open === null, 'with the blockage cleared, the diagonal entry is open again');
    // blockage remains clearable by work (the honest path still exists)
    tile.blockFrom = { dx: -dx, dy: 0, type: 'fallen_tree' };
    const before = Game.woodCount();
    Game.state.scholar.kcal = 5000;
    Game.clearBlockage(diag.x, diag.y);
    ok(!Game.tileAt(diag.x, diag.y).blockFrom, 'fallen_tree still clearable by work after the guard change');
    ok(Game.woodCount() >= before, 'clearing still yields the +2 wood the card promises');
  }

  // ================= CATCH 2: hive_mind honesty =================
  const s = Game.state.scholar;
  ok(Game.hiveSight() === false, 'hiveSight() false before acquiring hive_mind');
  const seenBefore = Object.keys(s.seenTiles || {}).length;
  // grant the ability the way the engine does (slot it, then on-acquire)
  s.abilities = s.abilities || [];
  if (!Game.hasAbility('hive_mind')) s.abilities.push({ id: 'hive_mind', name: 'Hive Mind', level: 1, xp: 0 });
  said.length = 0;
  Game.abilityOnAcquire('hive_mind');
  ok(Game.hiveSight() === true, 'hiveSight() true once hive_mind is held');
  const allRevealed = (() => { for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (!Game.tileAt(x, y).revealed) return false; return true; })();
  ok(allRevealed, 'acquire still reveals every tile for travel (the travel flag is intact)');
  const seenAfter = Object.keys(s.seenTiles || {}).length;
  ok(seenAfter === seenBefore, 'hive sight writes NOTHING to seenTiles (display-only; compareMaps/codex gates untouched)',
    'before=' + seenBefore + ' after=' + seenAfter);
  // the acquire line names the limit honestly now
  const acq = said.join(' ');
  ok(/terrain-sense, never detail/i.test(acq), 'acquire line names the limit (terrain-sense, never detail)', acq.slice(0, 120));
  // villageCard: an unseen far village is gated without hive, named with it
  const far = { x: 0, y: 0 };
  if (Game.mapSeen(far.x, far.y)) { far.x = 8; far.y = 8; }
  const ovId = 'test-village-hive';
  Game.state.otherVillages = (Game.state.otherVillages || []).filter(v => v.id !== ovId);
  Game.state.otherVillages.push({ id: ovId, name: 'Test Hollow', x: far.x, y: far.y, generated: true, population: 12, day: 40, knowledgeProfile: { focus: 'forager' }, trust: 0 });
  // temporarily drop the ability -> card must refuse (fog holds without hive)
  s.abilities = s.abilities.filter(a => (a.id || a) !== 'hive_mind');
  ok(Game.hiveSight() === false, 'losing hive_mind closes the sight (derived, no stale flag)');
  ok(Game.villageCard(ovId) === null, 'villageCard refuses an unseen village without hive sight (fog holds)');
  s.abilities.push({ id: 'hive_mind', name: 'Hive Mind', level: 1, xp: 0 });
  const card = Game.villageCard(ovId);
  ok(card && card.name === 'Test Hollow', 'villageCard names the hive-sensed village (the "(map reveals)" promise, kept)');
  ok(card && card.hint && /walk to the edge/i.test(card.hint), 'hive-sensed card still gates actions on face-to-face proximity', card && card.hint);
  // …but the card's knowledge does NOT leak into the codex MAPS gate
  const known = Game.villageMapKnown();
  ok(!known[far.x + ',' + far.y], 'hive-sensed ground stays OUT of villageMapKnown (not village knowledge)');
  Game.state.otherVillages = Game.state.otherVillages.filter(v => v.id !== ovId);
  // copy honesty: the data description no longer claims villager-activity sense
  const ab = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  const hm = ab.find(a => a.id === 'hive_mind');
  ok(hm && !/what all villagers are doing/i.test(hm.description),
    'hive_mind description no longer promises villager-activity sense it cannot deliver');
  ok(hm && /terrain-sense, never detail/i.test(hm.description),
    'hive_mind description states the honest limit');

  // ================= HELD: spot-checks on the attack surface =================
  // travelTo still refuses mid-combat without combatExit
  // (guard predates this run; verifying it still holds after the edits)
  const tt = Game.travelTargets()[0];
  if (tt) {
    Game.tbfight = { dummy: true };
    const cres = Game.travelTo(tt.x, tt.y);
    ok(cres === null, 'travelTo still refuses mid-fight (no free flee)');
    delete Game.tbfight;
  }
  // swim force path still bypasses blockage (the honest UI offers swim only
  // for creek/washed_out) — force is not a general bypass key
  {
    const t2 = Game.travelTargets().find(t => !(t.x === px && t.y === py)) || Game.travelTargets()[0];
    if (t2) {
      const tl = Game.tileAt(t2.x, t2.y);
      tl.type = 'creek'; tl.needsBridge = true; tl.bridged = false; delete tl.blockFrom;
      const stripSwim = (l) => (l || []).filter(a => (a.id || a) !== 'swimmer');
      s.abilities = stripSwim(s.abilities); s.backgroundAbilities = stripSwim(s.backgroundAbilities);
      const cb = Game.travelBlockage(t2.x, t2.y);
      ok(cb && cb.blockType === 'creek', 'hard creek still blocks without the swimmer ability');
    }
  }
  // toWildNode stays in-bounds, off haven/ruin, d>=2 from haven
  {
    const wn = Game.debugToWildNode();
    ok(wn === true, 'toWildNode lands');
    const t = Game.tileAt(Game.map.px, Game.map.py);
    const d = Math.abs(Game.map.px - 4) + Math.abs(Game.map.py - 4);
    ok(t.type !== 'haven' && t.type !== 'ruin' && d >= 2, 'toWildNode: wild tile, d>=2 from haven', 'type=' + t.type + ' d=' + d);
  }

  // static: app.js overlay honors hive sight (DOM-only file — asserted by
  // source, since the node harness cannot render DOM)
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(/Game\.hiveSight && Game\.hiveSight\(\)/.test(appSrc), 'renderMap consults Game.hiveSight() (source check; app.js is DOM-only)');
  ok(/sensed by the hive/.test(appSrc), 'overlay tap copy names the hive limit (source check)');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
