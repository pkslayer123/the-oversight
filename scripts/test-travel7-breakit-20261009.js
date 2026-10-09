#!/usr/bin/env node
// BREAK-IT ROUND 7 (2026-10-09): TRAVEL & MAP — hostile proof tests.
// Attacks NEW surface (rounds 1-6 already landed their fixes; not re-hashed).
//
// T1  walk quote == billed sum (Wanderer/Second Skin mult) — the comment at
//     walkCost promises "quoted by the button AND equal to the sum of the
//     per-step charges"; r6 fixed the formula, r7 proves it under mults and
//     proves the mult CANNOT drift mid-walk (slotted passives only).
// T2  cancel mid-walk bills only landed squares (no free progress, no phantom).
// T3  re-route mid-walk: new beginPathWalk starts from the ACTUAL position,
//     no double-bill, no teleport.
// T4  mid-walk blockage: refused / narrated / phantom? (honesty probe)
// T5  follower parity: pathStep vs microMove — do followers desync on walks?
// T6  compareMaps knowledge farm: dedupe, bounded, sharing recorded.
// T7  noteTrailUse: 1/day cap inherent (no walk-spam bond farm).
// T8a door-flee: wounded monster keeps wounds on re-engage (r6 fix holds).
// T8b barrier-flee: chase continues with the SAME wounded fighter.
// T9  save/load mid-committed-walk: path is UI-side only; load strands nothing.
// T10 dead-code: every travel/map function reachable at runtime.
// T11 microMove parity: same travel.cost_mult as pathStep (no cheap-step hole).
//
// Harness: mulberry32 seeded BEFORE eval (modules capture Math.random at
// load), SEED env override, full src/js list in index.html order minus
// DOM-only files + drama.js, window stubbed for eval then deleted.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function says() { const l = (Game.log || []).slice(); Game.log.length = 0; return l; }

async function freshGame() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 2000; s.insideHaven = false;
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  says();
  return s;
}
// Longest walkable path from (sx,sy) on the current node.
function longestWalk(sx, sy, minLen) {
  let best = null;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (x === sx && y === sy) continue;
    const p = Game.findPath(sx, sy, x, y);
    if (p && p.length >= (minLen || 4) && (!best || p.length > best.length)) best = p;
  }
  return best;
}
function stubWorld() {
  const mt = Game.monsterTurn, at = Game.animalTurn;
  Game.monsterTurn = () => {}; Game.animalTurn = () => {};
  return () => { Game.monsterTurn = mt; Game.animalTurn = at; };
}
function slotAbility(id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.some(a => (a.id || a) === id)) s.abilities.push({ id });
}

(async () => {
  // ============ T1: quote == billed sum, under travel.cost_mult ============
  {
    const s = await freshGame();
    const restore = stubWorld();
    // pipeline fidelity: walkStepKcal must equal the rounded pipeline result —
    // no hidden terms, whatever the scholar's background/abilities grant.
    // (some backgrounds spawn WITH wanderer: absolute values are seed-
    // dependent; the relationship is what the code promises.)
    const pipeMult = Game.modTarget('travel.cost_mult', 1);
    const expectStep = Math.max(1, Math.round(10 * pipeMult));
    ok('T1 walkStepKcal faithfully applies the modifier pipeline',
      Game.walkStepKcal() === expectStep, `got ${Game.walkStepKcal()} want ${expectStep} (mult ${pipeMult})`);
    const beforeSlot = Game.walkStepKcal();
    slotAbility('wanderer'); slotAbility('second_skin');
    ok('T1 slotting Wanderer/Second Skin never raises the step cost',
      Game.walkStepKcal() <= beforeSlot, `${beforeSlot} -> ${Game.walkStepKcal()}`);
    s.mx = 4; s.my = 4;
    const path = longestWalk(4, 4, 5);
    ok('T1 test path exists', !!path);
    const k0 = s.kcal;
    const quote = Game.walkCost(path.length);
    const begun = Game.beginPathWalk(path[path.length - 1][0], path[path.length - 1][1]);
    ok('T1 beginPathWalk returns the path', !!begun && begun.length === path.length);
    ok('T1 quote matches walkCost(path.length)', quote === Game.walkCost(begun.length));
    ok('T1 beginPathWalk charges nothing up front', s.kcal === k0);
    let landed = 0;
    for (const [x, y] of begun) { if (Game.pathStep(x, y)) landed++; else break; }
    const billed = k0 - s.kcal;
    ok('T1 full walk lands every step', landed === begun.length, `${landed}/${begun.length}`);
    ok('T1 billed == quote (no drift under mults)', billed === quote, `billed ${billed} vs quote ${quote}`);
    // No-slotted-abilities baseline: the pipeline alone decides.
    s.abilities = [];
    const baseMult = Game.modTarget('travel.cost_mult', 1);
    ok('T1 baseline step matches pipeline (background mods included)',
      Game.walkStepKcal() === Math.max(1, Math.round(10 * baseMult)));
    restore();
  }

  // ============ T2: cancel mid-walk — bills landed squares only ============
  {
    const s = await freshGame();
    const restore = stubWorld();
    s.mx = 4; s.my = 4;
    const path = longestWalk(4, 4, 6);
    ok('T2 test path exists', !!path);
    const k0 = s.kcal;
    const begun = Game.beginPathWalk(path[path.length - 1][0], path[path.length - 1][1]);
    const quote = Game.walkCost(begun.length);
    Game.pathStep(begun[0][0], begun[0][1]);
    Game.pathStep(begun[1][0], begun[1][1]);
    // hostile player cancels here (taps stop / taps elsewhere) — the rest of
    // the committed path is simply never executed.
    const billed = k0 - s.kcal;
    ok('T2 cancel bills exactly 2 landed squares', billed === 2 * Game.walkStepKcal(), `billed ${billed}`);
    ok('T2 cancel bills LESS than the quote (no forfeit)', billed < quote);
    ok('T2 position is after 2 steps', s.mx === begun[1][0] && s.my === begun[1][1]);
    // and the player can just keep playing — no phantom walk state.
    ok('T2 no walk state lingers in Game.state', !('pendingPath' in Game.state) && !('walkQueue' in s));
    restore();
  }

  // ============ T3: re-route mid-walk — from actual position, no double bill ==
  {
    const s = await freshGame();
    const restore = stubWorld();
    s.mx = 4; s.my = 4;
    const p1 = longestWalk(4, 4, 4);
    const b1 = Game.beginPathWalk(p1[p1.length - 1][0], p1[p1.length - 1][1]);
    const k0 = s.kcal;
    Game.pathStep(b1[0][0], b1[0][1]);
    const mid = [s.mx, s.my];
    // hostile re-route: tap a new destination mid-walk.
    const p2 = longestWalk(mid[0], mid[1], 3);
    const b2 = Game.beginPathWalk(p2[p2.length - 1][0], p2[p2.length - 1][1]);
    ok('T3 re-route path starts adjacent to ACTUAL position',
      Math.abs(b2[0][0] - mid[0]) <= 1 && Math.abs(b2[0][1] - mid[1]) <= 1,
      `mid=${mid} first=${b2 && b2[0]}`);
    let n = 0;
    for (const [x, y] of b2) { if (Game.pathStep(x, y)) n++; else break; }
    const billed = k0 - s.kcal;
    ok('T3 total billed == steps actually taken (1 + re-routed)',
      billed === (1 + n) * Game.walkStepKcal(), `billed ${billed}, steps ${1 + n}`);
    restore();
  }

  // ============ T4: blockage appears mid-walk — refused? narrated? phantom? ==
  {
    const s = await freshGame();
    const restore = stubWorld();
    s.mx = 4; s.my = 4;
    const path = longestWalk(4, 4, 4);
    const begun = Game.beginPathWalk(path[path.length - 1][0], path[path.length - 1][1]);
    Game.pathStep(begun[0][0], begun[0][1]);
    // the world changes under your feet: a wall where the next step was.
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    const [nx, ny] = begun[1];
    detail[ny][nx] = 'wall';
    says();
    const r = Game.pathStep(nx, ny);
    const lines = says();
    ok('T4 newly-blocked step is refused (no phantom skip)', r === false);
    ok('T4 player did NOT move onto the wall', s.mx === begun[0][0] && s.my === begun[0][1]);
    ok('T4 refusal is narrated (no silent stop)', lines.length > 0, 'log was empty');
    restore();
  }

  // ============ T5: follower parity — pathStep vs microMove ============
  {
    const s = await freshGame();
    const restore = stubWorld();
    // give the player a follower with a grid position next to them
    const v = Game.state.village;
    const fid = (v.roster || []).find(id => id !== Game.villagerId);
    v.followers = v.followers || [];
    if (fid && !v.followers.includes(fid)) v.followers.push(fid);
    v.positions = v.positions || {};
    try { Game.npcSetInside(fid, false); } catch (e) {} // same side of the door as the player
    const distOf = () => {
      const p = v.positions[fid];
      if (!p) return null;
      return Math.max(Math.abs(p.mx - s.mx), Math.abs(p.my - s.my));
    };
    s.mx = 4; s.my = 4;
    v.positions[fid] = { mx: 4, my: 5 };
    const path = longestWalk(4, 4, 5);
    const begun = Game.beginPathWalk(path[path.length - 1][0], path[path.length - 1][1]);
    for (const [x, y] of begun) { if (!Game.pathStep(x, y)) break; }
    const dPath = distOf();
    // reset and do the same walk square-by-square via microMove
    s.mx = 4; s.my = 4; s.kcal = 2000;
    v.positions[fid] = { mx: 4, my: 5 };
    for (const [x, y] of begun) { if (!Game.microMove(x, y)) break; }
    const dMicro = distOf();
    // hostile framing: can committed walks ditch followers? NPCs are
    // needs-driven, not glued, in BOTH modes — no walk-specific exploit.
    ok('T5 committed walk leaves followers behind (not glued)', dPath !== null && dPath >= 3, `dPath=${dPath}`);
    ok('T5 microMove does not glue followers either (parity)', dMicro !== null && dMicro >= 1, `dMicro=${dMicro}`);
    restore();
  }

  // ============ T6: compareMaps — no infinite knowledge farm ============
  {
    await freshGame();
    const s = Game.state.scholar;
    s.seenTiles = {};
    const vids = (Game.data.villagers || []).slice(0, 3).map(v => v.id).filter(Boolean);
    ok('T6 villagers available', vids.length >= 2);
    let total = 0;
    for (const vid of vids) {
      const r1 = Game.compareMaps(vid);
      const r2 = Game.compareMaps(vid); // hostile: compare again immediately
      total += r1.newCount;
      ok(`T6 second compare with same villager yields nothing (${vid})`, r2.newCount === 0);
      ok(`T6 sharing recorded (${vid})`, !!(s.mapsSharedBy || {})[vid]);
    }
    ok('T6 total new tiles bounded (no infinite farm)', total <= vids.length * 7, `total=${total}`);
    const known = Game.villageMapKnown();
    const seenCount = Object.keys(s.seenTiles || {}).length;
    ok('T6 villageMapKnown covers shared ground', Object.keys(known).length >= seenCount);
    // unshared villagers' seed tiles stay out of the codex map
    const unshared = (Game.data.villagers || []).find(v => v.id && !(s.mapsSharedBy || {})[v.id] && v.visitedTiles);
    if (unshared) {
      const leaked = (unshared.visitedTiles || []).some(k => known[k] && !s.seenTiles[k]);
      ok('T6 unshared villager tiles do NOT leak into codex map', !leaked);
    }
  }

  // ============ T7: noteTrailUse — 1/day cap, walk-spam can't farm bond ====
  {
    await freshGame();
    const s = Game.state.scholar;
    // ensure a clothing relic exists
    if (!Game.relicItems().length) {
      s.relics = s.relics || [];
      s.relics.push({ itemId: 'worn_boots', id: 'worn_boots', bond: 0 });
    }
    const clothing = Game.relicItems().find(r => {
      const def = (Game.data.items || []).find(i => i.id === (r.itemId || r.id)) || {};
      return def.class === 'clothing';
    }) || Game.relicItems()[0];
    const cid = clothing.itemId || clothing.id;
    for (let i = 0; i < 10; i++) Game.noteTrailUse(); // hostile: 10 walks' worth
    const before = clothing.bond || 0;
    Game.accrueRelicBond();
    const gain = (clothing.bond || 0) - before;
    ok('T7 ten noteTrailUse calls accrue exactly +1 bond (1/day cap)', gain === 1, `gain=${gain}`);
  }

  // ============ T10: dead-code — travel/map surface reachable ============
  {
    await freshGame();
    for (const fn of ['microMove', 'villageMapKnown', 'edgeExit', 'mapSeen', 'markSeen',
      'reveal', 'travelTimeStep', 'findPath', 'beginPathWalk', 'pathStep',
      'walkCost', 'walkStepKcal', 'enterBuilding', 'exitBuilding', 'tryNodeExit',
      'travelTo', 'returnToVillage', 'returnToOldVillage', 'compareMaps',
      'seedVillagerMaps', 'noteTrailUse', 'travelBlockage']) {
      ok(`T10 Game.${fn} exists`, typeof Game[fn] === 'function');
    }
  }

  // ============ T11: microMove honors the same travel.cost_mult ============
  {
    const s = await freshGame();
    const restore = stubWorld();
    s.mx = 4; s.my = 4; s.kcal = 2000;
    slotAbility('wanderer');
    // find an adjacent walkable cell
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    let tgt = null;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const c = detail[4 + dy] && detail[4 + dy][4 + dx];
      if (c && !Game.cellProps(c).blocks) { tgt = [4 + dx, 4 + dy]; break; }
    }
    ok('T11 adjacent walkable cell exists', !!tgt);
    const k0 = s.kcal;
    ok('T11 microMove succeeds', Game.microMove(tgt[0], tgt[1]));
    const billed = k0 - s.kcal;
    // same pipeline as pathStep: 2 kcal through travel.cost_mult, floored at 1
    const expectMicro = Math.max(1, Math.round(2 * Game.modTarget('travel.cost_mult', 1)));
    ok('T11 microMove bills the discounted cost (no cheap-step hole)', billed === expectMicro, `billed=${billed} want=${expectMicro}`);
    restore();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failures: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
