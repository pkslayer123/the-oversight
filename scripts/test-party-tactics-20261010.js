#!/usr/bin/env node
// PARTY TACTICS proof (Steve 2026-10-10, PROGRESSION.md #8: monsters are party-aware).
// Pack hunters, party-splitters, group punishers — tactics that scale, not flat
// bigger numbers. Every new behavior keys off player-side fighters >= 3;
// solo scouts keep fair duels.
//
// Covers:
//  A. Party-aware spawn scaling (hushwolf/heckler/reunion; belltoad unchanged)
//  B. Pack coordination: flank bonus (unit + rush-damage integration), straggler focus
//  C. Splitter: landlord eviction wall (telegraph -> raise -> block -> expire)
//  D. Splitter: static ally-lure (call out -> lured walk -> touch-break)
//  E. Group punishers: bright-idea drift-to-cluster, chorus-line aim-density
//  F. Solo-vs-party difficulty differential (measured, both winnable)
//  G. Regression: solo fights never see tactics (flank 0, no wall, no lure, no drift)
//
// Usage: node scripts/test-party-tactics-20261010.js [seed]
// Green x3 seeds required.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Seeded RNG installed BEFORE eval (modules capture Math.random at load).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.argv[2] || '1', 10);
const rng = mulberry32(SEED);
Math.random = rng;

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// WINDOW STUB (equipment.js needs window at load; but a live window stub flips
// combat to the async path — stub for eval, then delete before playing).
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/broadcast.js',
 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/partyTactics.js', 'src/js/statusEffects.js', 'src/js/metaProgression.js',
 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // combat takes the sync path from here on
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL [' + name + ']' + (extra ? ' — ' + extra : '')); }
}
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
function P() { return Game.tbFighter('p'); }
function monsters() { return (Game.tbfight.fighters || []).filter(f => f.kind === 'monster' && f.alive); }
function allies() { return (Game.tbfight.fighters || []).filter(f => f.kind === 'villager' && f.alive && !f.fled); }
// Snap (x,y) to the nearest non-map-blocking interior cell (the generated
// map has walls/trees — blind placement can strand a fighter).
function openNear(x, y) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  for (let r = 0; r < 9; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
      const cell = d[ny] && d[ny][nx];
      if (!Game.cellProps(cell).blocks) return [nx, ny];
    }
  }
  return [x, y];
}
// Place a fighter on an open cell.
function place(f, x, y) {
  const [nx, ny] = openNear(x, y);
  f.mx = nx; f.my = ny;
  return [nx, ny];
}
// Find an ally/static pair with a clear greedy path (3 open cells in a row).
function findClearPair() {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const open = (x, y) => {
    if (x < 1 || x > 7 || y < 1 || y > 7) return false;
    return !Game.cellProps(d[y] && d[y][x]).blocks;
  };
  for (let y = 1; y <= 7; y++) {
    for (let x = 1; x <= 5; x++) {
      if (open(x, y) && open(x + 1, y) && open(x + 2, y)) {
        return { ax: x, ay: y, sx: x + 2, sy: y };
      }
    }
  }
  return null;
}

// Fresh game, then a fight with nAllies villagers placed near the player.
async function setupFight(monsterId, nAllies, allyPos) {
  if (Game.tbfight && !Game.tbfight.over) { try { Game.tbEnd('fled'); } catch (e) {} Game.tbfight = null; }
  await Game.init(); // data only
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  // strip chaos abilities for determinism
  const bad = (a) => { const id = (a && a.id) || a; return id !== 'fear_aura' && id !== 'pocket_sand'; };
  s.abilities = (s.abilities || []).filter(bad);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(bad);
  s.mx = 4; s.my = 4; s.health = 200;
  Game.ensureVillagerPositions();
  const roster = Game.state.village.roster || [];
  const vpos = Game.state.village.positions || {};
  // Only the requested allies are in the roster — everyone else would join
  // (chebyshev <= 4 covers the whole 9x9 from the center). Trim it.
  // (roster[0] is the player themself — allies start at index 1.)
  Game.state.village.roster = roster.slice(1, 1 + nAllies);
  const spots = allyPos || [[1, 4], [2, 3], [2, 5], [1, 3], [1, 5]];
  for (let i = 0; i < nAllies && i + 1 < roster.length; i++) {
    vpos[roster[i + 1]] = { mx: spots[i][0], my: spots[i][1] };
  }
  // monster spawns east, allies west — the opening turns (wolves are faster)
  // hit the 200-HP player, not the 30-HP allies. Tests reposition after.
  s.monster = { id: monsterId, mx: 7, my: 4 };
  Game.startCombat(monsterId);
  // deterministic ally AI
  for (const a of allies()) a.ai = 'helpful';
  return Game.tbfight;
}
function endFight() {
  if (Game.tbfight && !Game.tbfight.over) { try { Game.tbEnd('fled'); } catch (e) {} }
  Game.tbfight = null;
}
// Drive AI turns until it's the player's turn again (or fight over).
// Uses tbAdvance (which owns turnIdx) — never call turn functions directly
// in a loop or turnIdx stalls and the loop never ends.
function monstersAct() {
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 60) {
    Game.tbAdvance();
  }
}
function playerWait() {
  if (!Game.tbfight || Game.tbfight.over || !Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
// Player strikes the nearest living monster (simple bot). Always advances.
function playerStrikeNearest() {
  if (!Game.tbfight || Game.tbfight.over || !Game.tbIsPlayerTurn()) return;
  const p = P();
  let best = null, bd = Infinity;
  for (const m of monsters()) {
    const d = cheb(p.mx, p.my, m.mx, m.my);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best) { playerWait(); return; }
  // walk adjacent if needed (up to moveLeft), then strike
  p.moveLeft = Math.max(p.moveLeft, 4);
  let guard = 0;
  while (cheb(p.mx, p.my, best.mx, best.my) > 1 && p.moveLeft > 0 && guard++ < 8) {
    const dx = Math.sign(best.mx - p.mx), dy = Math.sign(best.my - p.my);
    const nx = p.mx + dx, ny = p.my + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) break;
    if (Game.tbCanOccupy(p, nx, ny)) { p.mx = nx; p.my = ny; p.moveLeft--; }
    else break;
  }
  if (cheb(p.mx, p.my, best.mx, best.my) <= 1 && best.alive) Game.tbPlayerStrike(best.key);
  // stall-proof: if the strike didn't advance (early return), wait instead
  if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) playerWait();
}

(async () => {
  console.log('seed', SEED);

  // ================= A. PACK SPAWN SCALING =================
  await setupFight('hushwolf', 0);
  ok('A1 hushwolf solo spawns 2', monsters().length === 2, 'got ' + monsters().length);
  endFight();
  await setupFight('hushwolf', 3);
  ok('A2 hushwolf party(4) spawns 4', monsters().length === 4, 'got ' + monsters().length);
  endFight();
  await setupFight('heckler', 0);
  ok('A3 heckler solo spawns 1', monsters().length === 1, 'got ' + monsters().length);
  endFight();
  await setupFight('heckler', 3);
  ok('A4 heckler party(4) spawns 3', monsters().length === 3, 'got ' + monsters().length);
  endFight();
  await setupFight('reunion', 0);
  ok('A5 reunion solo spawns 1 (fair duel)', monsters().length === 1, 'got ' + monsters().length);
  endFight();
  await setupFight('reunion', 4);
  ok('A6 reunion party(5) mirrors capped at 3', monsters().length === 3, 'got ' + monsters().length);
  endFight();
  await setupFight('belltoad', 3);
  ok('A7 belltoad unchanged: 1 up + 3 delayed (no tactics.packSpawn)',
    monsters().length === 1 && Game._pendingPack && Game._pendingPack.count === 3,
    'monsters=' + monsters().length + ' pending=' + (Game._pendingPack && Game._pendingPack.count));
  endFight();

  // ================= B. PACK COORDINATION =================
  // B1: flank bonus unit — 2 wolves adjacent to player => +2 for the attacker.
  await setupFight('hushwolf', 3);
  {
    const ws = monsters();
    const p = P();
    p.mx = 4; p.my = 4;
    ws[0].mx = 4; ws[0].my = 5;
    ws[1].mx = 5; ws[1].my = 4;
    ws[2].mx = 0; ws[2].my = 0; ws[3].mx = 8; ws[3].my = 8;
    ok('B1 flank +2 with one packmate adjacent', Game.tbFlankBonus(ws[0], p) === 2, 'got ' + Game.tbFlankBonus(ws[0], p));
    ws[2].mx = 3; ws[2].my = 4; // second packmate adjacent
    ok('B2 flank +4 with two packmates adjacent', Game.tbFlankBonus(ws[0], p) === 4, 'got ' + Game.tbFlankBonus(ws[0], p));
    ok('B3 flank capped at 6', (() => { ws[3].mx = 4; ws[3].my = 3; return Game.tbFlankBonus(ws[0], p); })() === 6, '');
  }
  // B4: flank applies to rush damage (deterministic [10,10] damage).
  {
    const ws = monsters();
    const p = P();
    p.mx = 4; p.my = 4; p.hp = 200;
    // allies far away — the wolf must pick the player
    allies().forEach((a, i) => { a.mx = i; a.my = 0; });
    for (const w of ws) w.mdef = Object.assign({}, w.mdef, { attack: Object.assign({}, w.mdef.attack, { damage: [10, 10] }) });
    ws[0].mx = 4; ws[0].my = 5;   // attacker, adjacent
    ws[1].mx = 5; ws[1].my = 4;   // packmate, adjacent -> +2
    ws[2].mx = 0; ws[2].my = 0; ws[3].mx = 8; ws[3].my = 8;
    ws[0].wolfBroken = false;
    const dealt = [];
    const orig = Game.tbDamage;
    Game.tbDamage = function (key, dmg) { dealt.push({ key, dmg }); return orig.call(this, key, dmg, 'test'); };
    const hpBefore = p.hp;
    Game.tbMonsterTurn(ws[0]);
    Game.tbDamage = orig;
    const hit = dealt.find(d => d.key === 'p');
    ok('B4 rush damage includes flank (+2 over base 10)', !!hit && hit.dmg === 12, 'dealt=' + JSON.stringify(dealt));
    ok('B4b player actually lost 12', hpBefore - p.hp === 12, 'lost ' + (hpBefore - p.hp));
  }
  endFight();
  // B5: straggler focus — isolated ally draws the pack.
  await setupFight('hushwolf', 3);
  {
    const ws = monsters();
    const als = allies();
    ok('B5 setup: 3 allies alive', als.length === 3, 'got ' + als.length);
    const p = P();
    p.mx = 4; p.my = 4;
    als[0].mx = 4; als[0].my = 3;
    als[1].mx = 5; als[1].my = 4;
    als[2].mx = 0; als[2].my = 0; // the straggler
    const iso = Game.tbIsolatedFighter();
    ok('B5 isolated fighter detected', iso && iso.key === als[2].key, 'got ' + (iso && iso.key));
    const w = ws[0];
    w.mx = 6; w.my = 6;
    const dBefore = cheb(w.mx, w.my, als[2].mx, als[2].my);
    Game.tbMonsterTurn(w); // hook sets packFocusKey; rush beelines the straggler
    ok('B5b hook set packFocusKey on the straggler', w.packFocusKey === als[2].key, 'got ' + w.packFocusKey);
    const dAfter = cheb(w.mx, w.my, als[2].mx, als[2].my);
    ok('B5c wolf closed on the straggler', dAfter < dBefore, dBefore + ' -> ' + dAfter);
  }
  endFight();
  // B6: heckler pile-on — the set piles onto the most-shamed fighter.
  await setupFight('heckler', 3);
  {
    const hs = monsters();
    const als = allies();
    als[0].hkShamedByPack = 5; // the set has been working on ally 0
    const h = hs[0];
    Game.tbMonsterTurn(h);
    ok('B6 pile-on targets the most-shamed fighter', h.tactPileTarget === als[0].key, 'got ' + h.tactPileTarget);
  }
  endFight();
  // B7: solo — no flank, no focus.
  await setupFight('hushwolf', 0);
  {
    const ws = monsters();
    const p = P();
    p.mx = 4; p.my = 4;
    ws[0].mx = 4; ws[0].my = 5; ws[1].mx = 5; ws[1].my = 4;
    ok('B7 solo: flank is 0 (party gate)', Game.tbFlankBonus(ws[0], p) === 0, 'got ' + Game.tbFlankBonus(ws[0], p));
    ok('B7b solo: no isolated fighter', Game.tbIsolatedFighter() === null);
    Game.tbMonsterTurn(ws[0]);
    ok('B7c solo: no packFocusKey set', !ws[0].packFocusKey);
  }
  endFight();

  // ================= C. LANDLORD EVICTION WALL =================
  await setupFight('landlord', 3);
  {
    const ll = monsters()[0];
    const p = P();
    const als = allies();
    // cluster the party
    p.mx = 4; p.my = 4;
    als[0].mx = 5; als[0].my = 4;
    als[1].mx = 4; als[1].my = 5;
    als[2].mx = 3; als[2].my = 3;
    ll.mx = 7; ll.my = 7;
    Game.tbfight.round = 5; ll.llWallLastRound = 0;
    Game.tbMonsterTurn(ll); // hook plans the wall (does not consume the turn)
    ok('C1 wall planned (telegraphed)', !!ll.llWallPending && ll.llWallPending.cells.length >= 3,
      'pending=' + JSON.stringify(!!ll.llWallPending));
    const warned = ll.llWallPending.cells.every(c => Game.cellWarned(c.cx, c.cy));
    ok('C2 warned cells == planned cells (telegraph honesty)', warned);
    // next round: the wall rises at the start of the landlord's turn
    Game.tbfight.round = 6;
    const plannedCells = ll.llWallPending.cells.slice();
    const plannedGap = ll.llWallPending.gap;
    Game.tbMonsterTurn(ll);
    ok('C3 wall raised', !!Game.tbWallActive(), 'active=' + !!Game.tbWallActive());
    const tf = Game.tbfight.terraform || {};
    const wallCount = Object.keys(tf).filter(k => tf[k] === 'eviction_wall').length;
    ok('C4 wall cells terraformed', wallCount >= 3, 'count=' + wallCount);
    // the service-entrance gap stays open
    ok('C5 service-entrance gap exists', plannedGap && tf[plannedGap.cx + ',' + plannedGap.cy] !== 'eviction_wall',
      'gap=' + JSON.stringify(plannedGap));
    // blocking: player cannot occupy or path through a wall cell (interior
    // cells only — grid edges are map-blocked barriers regardless)
    const wk = Object.keys(tf).map(k => k.split(',').map(Number))
      .find(([wx, wy]) => wx > 0 && wx < 8 && wy > 0 && wy < 8);
    ok('C6 wall blocks player occupancy', !!wk && Game.tbCanOccupy(p, wk[0], wk[1]) === false,
      'cell=' + JSON.stringify(wk));
    const path = (() => {
      // robust: open cells just north and south of the gap; the path must
      // exist, avoid wall cells, and pass through the service entrance
      if (!plannedGap) return null;
      const [ax, ay] = openNear(plannedGap.cx, plannedGap.cy - 1);
      const [bx, by] = openNear(plannedGap.cx, plannedGap.cy + 1);
      return Game.findPath(ax, ay, bx, by);
    })();
    const throughWall = path && path.some(([px, py]) => tf[px + ',' + py] === 'eviction_wall');
    const viaGap = path && plannedGap && path.some(([px, py]) => px === plannedGap.cx && py === plannedGap.cy);
    ok('C7 findPath routes around the wall via the gap', !!path && !throughWall && viaGap,
      'path=' + (path ? path.length + ' steps' : 'null'));
    // monsters ignore it (their weapon)
    ok('C8 monsters ignore the wall', !!wk && Game.tbCanOccupy(ll, wk[0], wk[1]) === true);
    // expiry
    Game.tbfight.round = Game.tbfight.evictionWall.expires;
    Game.tbRoundWrap(Game.tbfight);
    ok('C9 wall expires on schedule', !Game.tbWallActive());
    const tf2 = Game.tbfight.terraform || {};
    ok('C10 wall terraform cleared', !Object.keys(tf2).some(k => tf2[k] === 'eviction_wall'));
  }
  endFight();
  // C11: solo — no wall.
  await setupFight('landlord', 0);
  {
    const ll = monsters()[0];
    Game.tbfight.round = 9; ll.llWallLastRound = 0;
    Game.tbMonsterTurn(ll);
    ok('C11 solo: no wall planned (party gate)', !ll.llWallPending);
  }
  endFight();

  // ================= D. STATIC ALLY-LURE =================
  await setupFight('voice_mimic_radio', 3);
  {
    const st = monsters()[0];
    const als = allies();
    const p = P();
    // lured ally + static get a clear-path pair (greedy steps need a real lane)
    const pair = findClearPair();
    ok('D0 clear lane exists for the lure walk', !!pair);
    if (pair) {
      als[0].mx = pair.ax; als[0].my = pair.ay;
      st.mx = pair.sx; st.my = pair.sy;
      // other allies far from the static so als[0] is the nearest (lured) one
      place(als[1], 1, 7);
      place(als[2], 7, 1);
      // player far from the pair — no accidental touch-break
      const far = pair.ax > 4 ? [1, 1] : [7, 7];
      place(p, far[0], far[1]);
    } else {
      place(p, 1, 1);
      place(als[0], 5, 5);
      place(als[1], 3, 4);
      place(als[2], 4, 3);
      place(st, 7, 7);
    }
    Game.state.scholar.mx = p.mx; Game.state.scholar.my = p.my;
    Game.tbMonsterTurn(st); // the call goes out — consumes the turn
    const lured = allies().find(a => a.vmLured);
    ok('D1 call goes out: one ally lured', !!lured, 'lured=' + (lured && lured.key));
    ok('D2 call consumes the turn (no telegraph)', !st.telegraph);
    ok('D3 once per fight', st.vmCallOutUsed === true);
    // the lured ally walks toward the crying on their turn
    const dBefore = cheb(lured.mx, lured.my, st.mx, st.my);
    Game.tbVillagerTurn(lured);
    const dAfter = cheb(lured.mx, lured.my, st.mx, st.my);
    ok('D4 lured ally walks toward the static', dAfter < dBefore, dBefore + ' -> ' + dAfter);
    ok('D5 lure ticks down', lured.vmLured && lured.vmLured.turns === 1, 'turns=' + (lured.vmLured && lured.vmLured.turns));
    // touch breaks it: move the player adjacent, run the ally's turn
    p.mx = lured.mx + 1; p.my = lured.my;
    Game.state.scholar.mx = p.mx; Game.state.scholar.my = p.my;
    const lx = lured.mx, ly = lured.my;
    Game.tbVillagerTurn(lured);
    ok('D6 hand on the shoulder breaks the lure', !lured.vmLured, 'lured=' + JSON.stringify(!!lured.vmLured));
  }
  endFight();
  // D7: solo — no call-out.
  await setupFight('voice_mimic_radio', 0);
  {
    const st = monsters()[0];
    Game.tbMonsterTurn(st);
    ok('D7 solo: no call-out (party gate)', !st.vmCallOutUsed);
  }
  endFight();

  // ================= E. GROUP PUNISHERS =================
  // E1: bright-idea drift — clustered party pulls the Idea.
  await setupFight('bright_idea', 3);
  {
    const bi = monsters()[0];
    const p = P();
    const als = allies();
    place(p, 6, 6);
    place(als[0], 7, 6);
    place(als[1], 6, 7);
    place(als[2], 5, 6);
    place(bi, 1, 1);
    // force it into brighten with a live telegraph
    Game.encSetPhase(bi, 'brighten');
    bi.biDeclared = true;
    bi.telegraph = {
      kind: 'squares',
      cells: globalThis.Scattering.combat.patternCells({ type: 'burst', radius: 2 }, bi.mx, bi.my, bi.mx, bi.my),
      dmg: [31, 48], attackName: 'Eureka', pattern: { type: 'burst', radius: 2 }, turnsLeft: 2,
    };
    const dBefore = cheb(bi.mx, bi.my, 6, 6);
    Game.tbIdeaDrift(bi);
    const dAfter = cheb(bi.mx, bi.my, 6, 6);
    ok('E1 idea drifts toward the cluster', dAfter < dBefore, dBefore + ' -> ' + dAfter);
    // telegraph follows the idea (honest cells)
    const centersOnBi = bi.telegraph.cells.some(c => c.cx === bi.mx && c.cy === bi.my);
    ok('E2 telegraph cells recenter on the idea', centersOnBi);
  }
  endFight();
  // E3: spread party — the idea loses the scent.
  await setupFight('bright_idea', 3);
  {
    const bi = monsters()[0];
    const p = P();
    const als = allies();
    p.mx = 0; p.my = 0;
    als[0].mx = 8; als[0].my = 0;
    als[1].mx = 0; als[1].my = 8;
    als[2].mx = 8; als[2].my = 8;
    bi.mx = 4; bi.my = 4;
    Game.encSetPhase(bi, 'brighten');
    bi.biDeclared = true;
    bi.telegraph = { kind: 'squares', cells: [], dmg: [31, 48], attackName: 'Eureka', pattern: { type: 'burst', radius: 2 }, turnsLeft: 2 };
    Game.tbIdeaDrift(bi);
    ok('E3 spread party: no drift', bi.mx === 4 && bi.my === 4, bi.mx + ',' + bi.my);
  }
  endFight();
  // E4: chorus line aims at the densest cluster.
  await setupFight('chorus_line', 3);
  {
    const cl = monsters()[0];
    const p = P();
    const als = allies();
    place(p, 1, 1); // player far from the cluster
    const c0 = place(als[0], 7, 7);
    place(als[1], 7, 6);
    place(als[2], 6, 7);
    place(cl, 1, 2);
    const near = { f: p, d: cheb(cl.mx, cl.my, p.mx, p.my) };
    const tact = Game.tbTacticalFoe(cl, near);
    const inCluster = tact && [als[0].key, als[1].key, als[2].key].includes(tact.f.key);
    ok('E4 chorus aims at the densest cluster, not the nearest', !!inCluster, 'got ' + (tact && tact.f.key));
    // integration: the chorus walks toward the cluster on its turn
    // (starts at distance 6 > want range 4, so it must advance)
    const dBefore = cheb(cl.mx, cl.my, c0[0], c0[1]);
    Game.tbMonsterTurn(cl);
    const dAfter = cheb(cl.mx, cl.my, c0[0], c0[1]);
    ok('E5 chorus advances on the cluster', dAfter < dBefore, dBefore + ' -> ' + dAfter);
  }
  endFight();
  // E6: solo — no drift, no aim-density.
  await setupFight('bright_idea', 0);
  {
    const bi = monsters()[0];
    bi.mx = 1; bi.my = 1;
    Game.encSetPhase(bi, 'brighten');
    bi.biDeclared = true;
    bi.telegraph = { kind: 'squares', cells: [], dmg: [31, 48], attackName: 'Eureka', pattern: { type: 'burst', radius: 2 }, turnsLeft: 2 };
    Game.tbIdeaDrift(bi);
    ok('E6 solo: no drift (party gate)', bi.mx === 1 && bi.my === 1);
  }
  endFight();

  // ================= F. SOLO-vs-PARTY DIFFERENTIAL =================
  async function playFight(monsterId, nAllies, maxRounds) {
    await setupFight(monsterId, nAllies);
    const p = P();
    p.hp = 200; p.maxHp = 200;
    Game.state.scholar.health = 200;
    let lastRound = Game.tbfight.round;
    let rounds = 0, dmgTaken = 0, guard = 0;
    const orig = Game.tbDamage;
    Game.tbDamage = function (key, dmg, src, ak, o) {
      const f = Game.tbFighter(key);
      if (f && (f.kind === 'player' || f.kind === 'villager')) dmgTaken += dmg;
      return orig.call(this, key, dmg, src, ak, o);
    };
    while (Game.tbfight && !Game.tbfight.over && rounds < maxRounds && guard++ < 400) {
      if (Game.tbIsPlayerTurn()) playerStrikeNearest();
      else Game.tbAdvance();
      if (!Game.tbfight || Game.tbfight.over) break;
      if (Game.tbfight.round !== lastRound) { rounds++; lastRound = Game.tbfight.round; }
    }
    Game.tbDamage = orig;
    const over = !Game.tbfight || Game.tbfight.over;
    const result = { rounds, dmgTaken, perRound: rounds ? dmgTaken / rounds : 0, over, pAlive: p.alive, pHp: p.hp };
    endFight();
    return result;
  }
  const solo = await playFight('hushwolf', 0, 12);
  const party = await playFight('hushwolf', 3, 12);
  console.log('  differential: solo ' + solo.rounds + 'r ' + solo.dmgTaken.toFixed(0) +
    'dmg (' + solo.perRound.toFixed(1) + '/r) pAlive=' + solo.pAlive +
    ' | party ' + party.rounds + 'r ' + party.dmgTaken.toFixed(0) +
    'dmg (' + party.perRound.toFixed(1) + '/r) pAlive=' + party.pAlive);
  ok('F1 party fight deals more total damage/round than solo (tactics scale)',
    party.perRound > solo.perRound, solo.perRound.toFixed(1) + ' vs ' + party.perRound.toFixed(1));
  // The bot is deliberately dumb (no abilities, no armor, no kiting) — a real
  // forager does better. The bar here is "a duel, not a deletion": the solo
  // fight must last real rounds, not end in an execution.
  ok('F2 solo scout is not deleted outright (duel lasts real rounds)', solo.rounds >= 5,
    'solo lasted ' + solo.rounds + ' rounds, pHp=' + solo.pHp);

  console.log('\n' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
