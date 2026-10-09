#!/usr/bin/env node
// BREAK-IT ROUND 7 (2026-10-09): TRAVEL & MAP — flee honesty proofs.
//
// T8a door-flee: beat a monster to low HP, flee through a door mid-fight,
//   go back out — the monster keeps its wounds (r6 fix: stashed HP honored
//   on re-engage). A free full-heal here would be a no-cost damage reset.
// T8b barrier-flee: flee across a node boundary with a relentless chaser —
//   the chase continues on the new node with the SAME wounded fighter.
// T9  save/load mid-committed-walk: the committed path lives in the UI
//   (MoveAnim queue), not in Game.state — a save/load round-trip abandons
//   the un-walked remainder without stranding, double-billing, or phantom
//   state.
//
// Same harness as test-travel7-breakit-20261009.js.
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
function forcePlayerTurn() {
  const f = Game.tbfight;
  const p = Game.tbFighter('p');
  f.turnIdx = f.order.indexOf('p');
  p.moveLeft = 5; p.acted = false;
}
// Plant a 'door' cell adjacent to (x,y); returns its coords. Skips cells
// occupied by live monster fighters (tbPlayerMove won't stroll through them).
function plantDoor(x, y) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const occ = new Set();
  try {
    for (const m of (Game.tbfight ? Game.tbfight.fighters : []))
      if ((m.kind === 'monster' || m.kind === 'hostile') && m.alive) occ.add(m.mx + ',' + m.my);
  } catch (e) {}
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    if (occ.has(nx + ',' + ny)) continue;
    const c = detail[ny] && detail[ny][nx];
    if (c && !Game.cellProps(c).blocks) { detail[ny][nx] = 'door'; return [nx, ny]; }
  }
  return null;
}

(async () => {
  // ============ T8a: door-flee keeps wounds ============
  {
    await Game.init();
    Game.debugScenario('hushpuppy');
    says();
    const s = Game.state.scholar;
    // door-flee is a HAVEN mechanic (walled haven: edges blocked, doors work).
    // travelTo only walks adjacent nodes, so place the fight at the haven
    // node directly (arrival bookkeeping is not under test here).
    const hx = Game.state.village.px ?? 4, hy = Game.state.village.py ?? 4;
    Game.map.px = hx; Game.map.py = hy;
    try { const ht = Game.tileAt(hx, hy); if (ht) ht.detail = null; } catch (e) {}
    s.insideHaven = false; s.mx = 4; s.my = 4;
    says();
    Game.startCombat('hushwolf');
    says();
    const f = Game.tbfight;
    ok('T8a fight started', !!f && !f.over);
    const wolf = f.fighters.find(x => x.kind === 'monster');
    const p = Game.tbFighter('p');
    ok('T8a wolf + player fighters exist', !!wolf && !!p);
    const maxHp = wolf.maxHp || wolf.hp;
    // hostile: wound the WHOLE pack to distinct low HPs, then flee.
    // (r7 catch: the r6 fix honored only the first monster's wounds —
    // the rest of the pack respawned fresh.)
    const pack = f.fighters.filter(x => x.kind === 'monster');
    const woundedHps = pack.map((m, i) => 12 + i * 3);
    pack.forEach((m, i) => { m.hp = woundedHps[i]; });
    // stand the fighter next to a door, then step onto it mid-fight
    p.mx = 4; p.my = 4; s.mx = 4; s.my = 4;
    const door = plantDoor(4, 4);
    ok('T8a door cell planted', !!door);
    forcePlayerTurn();
    says();
    const r = Game.tbPlayerMove(door[0], door[1]);
    ok('T8a door-flee move accepted', r === true, 'got ' + r);
    ok('T8a fight ended as fled', !Game.inCombat());
    const stashed = (Game.state.doorFledMonsters || [])[0];
    ok('T8a monster stashed with WOUNDED hp', !!stashed && stashed.hp === woundedHps[0], JSON.stringify(stashed && stashed.hp));
    ok('T8a whole pack stashed (every monster, every wound)',
      (Game.state.doorFledMonsters || []).length === pack.length,
      `stashed ${(Game.state.doorFledMonsters || []).length} of ${pack.length}`);
    ok('T8a player is inside after door-flee', s.insideHaven === true);
    // go back out: re-engage must honor the stashed wounds, not full-heal.
    // (the pack ambushes on re-entry — go in healthy for a deterministic test)
    s.health = 500;
    says();
    const r2 = Game.exitBuilding(true);
    ok('T8a exitBuilding re-engages', r2 === true && Game.inCombat());
    const f2 = Game.tbfight;
    const pack2 = f2.fighters.filter(x => x.kind === 'monster');
    const hps2 = pack2.map(m => m.hp).sort((a, b) => a - b);
    const want = woundedHps.slice().sort((a, b) => a - b);
    ok('T8a EVERY re-engaged monster keeps its wounds (no free heal)',
      pack2.length === pack.length && JSON.stringify(hps2) === JSON.stringify(want),
      `got [${hps2}] want [${want}]`);
    Game.tbfight.over = true; Game.tbfight = null;
  }

  // ============ T8b: barrier-flee chase keeps wounds ============
  {
    await Game.init();
    Game.debugScenario('hushpuppy');
    says();
    Game.startCombat('hushwolf');
    says();
    const f = Game.tbfight;
    const wolf = f.fighters.find(x => x.kind === 'monster');
    const p = Game.tbFighter('p');
    wolf.hp = 25;
    // pick an unblocked, in-world exit direction (a blocked far side is a
    // different, already-tested honest path)
    let dir = null;
    for (const [dx, dy, ex, ey] of [[-1, 0, 0, 4], [1, 0, 8, 4], [0, -1, 4, 0], [0, 1, 4, 8]]) {
      const nx = Game.map.px + dx, ny = Game.map.py + dy;
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      let blocked = false;
      try { blocked = !!Game.travelBlockage(nx, ny); } catch (e) {}
      if (!blocked) { dir = { dx, dy, ex, ey }; break; }
    }
    ok('T8b unblocked exit direction exists', !!dir);
    p.mx = dir.ex; p.my = dir.ey; // on the edge being pushed through
    forcePlayerTurn();
    says();
    const r = Game.tbBarrierExit(dir.dx, dir.dy);
    const lines = says();
    if (r === true && Game.inCombat()) {
      // relentless hushwolf chases across the barrier — same fighter object
      const wolf2 = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
      ok('T8b chase continues with the wounded fighter', !!wolf2 && wolf2.hp === 25, `hp=${wolf2 && wolf2.hp}`);
      ok('T8b chase is narrated', lines.some(l => /right behind you|still coming/i.test(l)));
    } else {
      // blocked far side or world edge: the push is honestly refused/consumed
      ok('T8b blocked/edge crossing handled honestly', r === true, 'got ' + r);
    }
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  }

  // ============ T9: save/load mid-committed-walk ============
  {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar;
    s.mx = 4; s.my = 4; s.kcal = 2000; s.insideHaven = false;
    says();
    const mt = Game.monsterTurn, at = Game.animalTurn;
    Game.monsterTurn = () => {}; Game.animalTurn = () => {};
    let path = null;
    for (let y = 0; y < 9 && !path; y++) for (let x = 0; x < 9 && !path; x++) {
      const p = Game.findPath(4, 4, x, y);
      if (p && p.length >= 5) path = p;
    }
    ok('T9 test path exists', !!path);
    const begun = Game.beginPathWalk(path[path.length - 1][0], path[path.length - 1][1]);
    Game.pathStep(begun[0][0], begun[0][1]);
    Game.pathStep(begun[1][0], begun[1][1]);
    const kMid = s.kcal, mxMid = s.mx, myMid = s.my;
    // SAVE mid-walk (the committed path lives in the UI MoveAnim queue —
    // hostile check: is any of it in Game.state?)
    const walkKeys = Object.keys(Game.state).filter(k => /walk|path|pending/i.test(k));
    ok('T9 no walk state serialized in Game.state', walkKeys.length === 0, walkKeys.join(','));
    const snap = JSON.parse(JSON.stringify(Game.state));
    // LOAD (fresh state object, as a real load produces)
    Game.state = snap;
    const s2 = Game.state.scholar;
    ok('T9 position survives load (landed squares kept)', s2.mx === mxMid && s2.my === myMid);
    ok('T9 kcal survives load (no re-bill, no refund)', s2.kcal === kMid);
    // keep playing: stepping still works, no phantom walk resumes
    const k2 = s2.kcal;
    const stepOk = Game.pathStep(begun[2][0], begun[2][1]);
    ok('T9 play continues cleanly after load', stepOk === true);
    ok('T9 post-load step bills exactly one square', (k2 - s2.kcal) === Game.walkStepKcal());
    Game.monsterTurn = mt; Game.animalTurn = at;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failures: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
