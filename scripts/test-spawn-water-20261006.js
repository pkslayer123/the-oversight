// WATER-MONSTER SPAWN AUDIT (Steve 2026-10-06) — proof tests.
// 1. waterAffinity data audit (4 monsters) + schema validation.
// 2. Spawn gating: 'in' monsters never picked on dry grids; re-pick works.
// 3. Placement: 'in' spawns ON water; 'near' spawns on walkable shore cells.
// 4. 100 simulated wetland encounters: water monsters only with water present.
// 5. Wanderer: castMonster never casts 'in' monsters; contact placement is water-aware.
// 6. Gameplay: 3 full catfish fights as a player (2 night fights, 1 daytime
//    dormant-glow check) — feel verdict from played passes, not static reads.
// Deterministic RNG (seed 20261006 + 77). Turn hygiene: endTurn = exactly one
// AI round per player turn; movement on interior tiles 1..7 only.
// Plain node, NOT jest. No concurrent test processes.
// Run: node scripts/test-spawn-water-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
(function seed(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(20261083);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(name, detail) { console.log(`  NOTE ${name}${detail ? ' — ' + detail : ''}`); }

const P = () => Game.tbFighter('p');
// TURN HYGIENE: advance exactly one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return; p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
let says = [];
function newFightOnWater(id, wx, wy, playerHp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  says = [];
  Game.state.scholar.monster = { id, mx: wx, my: wy };
  Game.startCombat(id);
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (!m) throw new Error('newFightOnWater: no monster for ' + id);
  const pl = P(); pl.hp = pl.maxHp = (playerHp || 120);
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}
function moveAdjacent(tx, ty) {
  const p = P(); if (!p) return;
  let guard = 0;
  while (Game.tbIsPlayerTurn() && !p.acted && p.moveLeft > 0 && guard++ < 10 &&
    Math.max(Math.abs(p.mx - tx), Math.abs(p.my - ty)) > 1) {
    // step to an interior walkable neighbor closer to the target
    let best = null, bestD = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = p.mx + ox, ny = p.my + oy;
      if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
      if (Game.tbBlocked(nx, ny)) continue;
      const d = Math.max(Math.abs(nx - tx), Math.abs(ny - ty));
      if (d < bestD) { bestD = d; best = [nx, ny]; }
    }
    if (!best) break;
    if (!Game.tbPlayerMove(best[0], best[1])) break;
  }
}
function strikeKey(key) {
  if (Game.tbIsPlayerTurn() && P() && !P().acted) return Game.tbPlayerStrike(key);
  return null;
}
function playRound(strategy) {
  const st = { over: false, result: null };
  const f0 = Game.tbfight;
  if (!f0 || f0.over) { st.over = true; st.result = f0 && f0.result; return st; }
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over || f0.over;
  st.result = f0.over ? f0.result : null;
  return st;
}
// Fixed test grid: 3x3 water pool at x3-5/y3-5, grass elsewhere (interior-safe).
function waterGrid() {
  const g = [];
  for (let y = 0; y < 9; y++) {
    const row = [];
    for (let x = 0; x < 9; x++) row.push((x >= 3 && x <= 5 && y >= 3 && y <= 5) ? 'water' : 'grass');
    g.push(row);
  }
  return g;
}
function grassGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function wetCellCount(detail) {
  let n = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (detail[y][x] === 'water') n++;
  return n;
}
function nearWater(detail, x, y) {
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const nx = x + ox, ny = y + oy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    if (detail[ny][nx] === 'water') return true;
  }
  return false;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;
  Game.say = (t) => { says.push(String(t)); };
  Game.audioEvent = () => {};
  const byId = (id) => Game.data.monsters.find(m => m.id === id);

  console.log('== 1. DATA AUDIT: waterAffinity on the four water monsters ==');
  {
    const expect = { nightlight_catfish: 'in', white_noise_heron: 'near', belltoad: 'near', speedbump_turtle: 'near' };
    for (const [id, aff] of Object.entries(expect)) {
      const m = byId(id);
      check(`${id} waterAffinity='${aff}'`, !!m && m.waterAffinity === aff, m && `got '${m.waterAffinity}'`);
    }
    const ins = Game.data.monsters.filter(m => m.waterAffinity === 'in').map(m => m.id);
    check(`only nightlight_catfish is 'in'`, ins.length === 1 && ins[0] === 'nightlight_catfish', ins.join(','));
    const bad = Game.data.monsters.filter(m => m.waterAffinity && !['in', 'near'].includes(m.waterAffinity));
    check('no invalid waterAffinity values', bad.length === 0, bad.map(m => m.id).join(','));
  }

  console.log('== 2. SPAWN GATING: dry grid never yields an \'in\' monster ==');
  {
    Game.genDetail = grassGrid;
    Game.map.px = 3; Game.map.py = 3;
    const mdefs = Game.monsterWavePool();
    const picks = {};
    let sawIn = 0;
    for (let i = 0; i < 400; i++) {
      const m = Game.pickSpawnMonster(mdefs);
      if (!m) continue;
      picks[m.id] = (picks[m.id] || 0) + 1;
      if (m.waterAffinity === 'in') sawIn++;
    }
    check('400 dry picks, zero waterAffinity=\'in\'', sawIn === 0, `sawIn=${sawIn}`);
    check('dry picks still produce monsters (fallback works)', Object.keys(picks).length > 3, Object.keys(picks).length + ' species');
    // unit: catfish on a dry grid must be re-picked away
    const cat = byId('nightlight_catfish');
    let catSurvived = 0;
    for (let i = 0; i < 50; i++) {
      const m = Game.pickSpawnMonster([cat, byId('speedbump_turtle')]);
      if (m && m.id === 'nightlight_catfish') catSurvived++;
    }
    check('catfish re-picked away on dry grid (2-monster pool)', catSurvived === 0, `survived ${catSurvived}/50`);
    // degenerate: pool of ONLY 'in' monsters on a dry grid -> null (skip encounter, no crash)
    const none = Game.pickSpawnMonster([cat]);
    check('all-\'in\' pool on dry grid returns null (skip, no crash)', none === null, `got ${none && none.id}`);
  }

  console.log('== 3. PLACEMENT: \'in\' ON water, \'near\' on shore ==');
  {
    let cur = waterGrid();
    Game.genDetail = () => cur;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 6;
    let onWater = 0, onShoreEdge = 0, n = 0;
    for (let i = 0; i < 100; i++) {
      const spot = Game.placeSpawnMonster(byId('nightlight_catfish'));
      n++;
      if (cur[spot.my][spot.mx] === 'water') onWater++;
      if (cur[spot.my][spot.mx] === 'water' && nearWater(cur, spot.mx, spot.my)) {
        // shoreline = this water cell touches walkable land (reachable fight)
        let touchesLand = false;
        for (let oy = -1; oy <= 1 && !touchesLand; oy++) for (let ox = -1; ox <= 1 && !touchesLand; ox++) {
          if (!ox && !oy) continue;
          const nx = spot.mx + ox, ny = spot.my + oy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          if (!Game.cellProps(cur[ny][nx]).blocks) touchesLand = true;
        }
        if (touchesLand) onShoreEdge++;
      }
    }
    check(`catfish placed ON water 100/100`, onWater === n, `${onWater}/${n}`);
    check(`catfish prefers shoreline water (reachable fights)`, onShoreEdge === n, `${onShoreEdge}/${n}`);
    let shoreOk = 0; n = 0;
    for (const id of ['white_noise_heron', 'belltoad', 'speedbump_turtle']) {
      for (let i = 0; i < 60; i++) {
        const spot = Game.placeSpawnMonster(byId(id));
        n++;
        const cell = cur[spot.my][spot.mx];
        if (!Game.cellProps(cell).blocks && nearWater(cur, spot.mx, spot.my)) shoreOk++;
      }
    }
    check(`'near' monsters on walkable shore cells`, shoreOk === n, `${shoreOk}/${n}`);
    // 'near' on a dry grid falls back to the old 4±2 box (no crash, in-bounds)
    cur = grassGrid();
    let inBounds = 0; n = 0;
    for (let i = 0; i < 60; i++) {
      const spot = Game.placeSpawnMonster(byId('white_noise_heron'));
      n++;
      if (spot.mx >= 0 && spot.mx <= 8 && spot.my >= 0 && spot.my <= 8) inBounds++;
    }
    check(`'near' on dry grid: in-bounds fallback`, inBounds === n, `${inBounds}/${n}`);
    // minDist honored (wanderer contact contract)
    cur = waterGrid();
    let distOk = 0; n = 0;
    for (let i = 0; i < 60; i++) {
      const spot = Game.placeSpawnMonster(byId('white_noise_heron'), { minDist: 4, fullGrid: true });
      n++;
      const d = Math.max(Math.abs(spot.mx - 4), Math.abs(spot.my - 6));
      if (d >= 4 && nearWater(cur, spot.mx, spot.my)) distOk++;
    }
    check(`wanderer-contact placement: dist>=4 and shore`, distOk === n, `${distOk}/${n}`);
  }

  console.log('== 4. 100 WETLAND ENCOUNTERS: water monsters only with water present ==');
  {
    Game.map.px = 3; Game.map.py = 3;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    const mdefs = Game.monsterWavePool();
    let inPicks = 0, inOnWater = 0, nearShore = 0, nearPicks = 0, total = 0, errors = 0;
    for (let i = 0; i < 100; i++) {
      // fresh wetland-like detail: ~20% water per cell
      const g = [];
      for (let y = 0; y < 9; y++) {
        const row = [];
        for (let x = 0; x < 9; x++) row.push(Math.random() < 0.2 ? 'water' : (Math.random() < 0.5 ? 'grass' : 'plant'));
        g.push(row);
      }
      Game.genDetail = () => g;
      const wetN = wetCellCount(g);
      try {
        const m = Game.pickSpawnMonster(mdefs);
        if (!m) continue;
        const spot = Game.placeSpawnMonster(m);
        total++;
        const cell = g[spot.my][spot.mx];
        if (m.waterAffinity === 'in') {
          inPicks++;
          if (wetN > 0 && cell === 'water') inOnWater++;
          else errors++;
        } else if (m.waterAffinity === 'near') {
          nearPicks++;
          if (wetN > 0 && !Game.cellProps(cell).blocks && nearWater(g, spot.mx, spot.my)) nearShore++;
        }
      } catch (e) { errors++; note('encounter threw', e.message); }
    }
    check(`'in' picks placed ON water with water present`, inPicks > 0 && inOnWater === inPicks, `${inOnWater}/${inPicks} 'in' picks`);
    check(`'near' picks placed on walkable shore cells`, nearPicks > 0 && nearShore === nearPicks, `${nearShore}/${nearPicks} 'near' picks`);
    check(`no placement errors across 100 encounters`, errors === 0, `${errors} errors`);
    note('wetland encounter mix', `${total} spawns: ${inPicks} 'in', ${nearPicks} 'near'`);
  }

  console.log('== 5. WANDERER: no \'in\' casts; contact placement water-aware ==');
  {
    let sawIn = 0;
    for (let i = 0; i < 300; i++) {
      const cast = Game.castMonster();
      const id = cast.id || cast;
      const m = byId(id);
      if (m && m.waterAffinity === 'in') sawIn++;
    }
    check(`300 wanderer casts, zero 'in' monsters`, sawIn === 0, `sawIn=${sawIn}`);
    Game.genDetail = waterGrid;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 6;
    const wdef = byId('white_noise_heron');
    const spot = Game.placeSpawnMonster(wdef, { minDist: 4, fullGrid: true });
    const d = Math.max(Math.abs(spot.mx - 4), Math.abs(spot.my - 6));
    check('heron wanderer-contact: dist>=4, shore cell', d >= 4 && nearWater(waterGrid(), spot.mx, spot.my), `d=${d} at ${spot.mx},${spot.my}`);
  }

  console.log('== 6. GAMEPLAY: catfish fights as a player ==');
  Game.genDetail = waterGrid;
  // --- Fight 1: the natural path. Night, catfish in its pool, player on the shore.
  // Feel the full loop: wait through lure -> still -> GRASP (take the hit), then kill it.
  {
    says = [];
    Game.dayPart = 3; // night
    Game.map.px = 3; Game.map.py = 3;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 6; // shore, dist 2 from pool center
    Game.state.scholar.monster = { id: 'nightlight_catfish', mx: 4, my: 4 }; // ON water
    Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
    Game.state.scholar.health = 120;
    let turns = 0;
    while (!Game.tbfight && turns++ < 10) Game.monsterTurn();
    check('F1: night ambush near water starts combat', !!Game.tbfight, `turns=${turns}`);
    const m0 = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
    check('F1: catfish fighter starts ON its water cell', !!m0 && waterGrid()[m0.my][m0.mx] === 'water', m0 && `${m0.mx},${m0.my}`);
    // Play: hold at spear range (dist 2), wait 2 rounds to feel the lure->still->grasp,
    // THEN kill it. The grasp is AoE<=2 — standing at 2 means taking the hit.
    let graspDmg = 0, sawLure = false, sawStill = false, sawGrasp = false, rounds = 0, result = null;
    let lastPhp = 120, strikes = 0;
    while (rounds++ < 30) {
      const r = rounds;
      const st = playRound(() => {
        const mm = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        if (r <= 2) return; // wait: let it lure and go still
        if (mm && Math.max(Math.abs(mm.mx - P().mx), Math.abs(mm.my - P().my)) <= 2) {
          if (strikeKey(mm.key)) strikes++;
        }
      });
      const blob = says.join('\n');
      if (/glow pulses|Pretty/i.test(blob)) sawLure = true;
      if (/too still|TOO STILL/i.test(blob)) sawStill = true;
      if (/LURE AND GRASP|GRASP!/i.test(blob)) sawGrasp = true;
      if (P() && P().hp < lastPhp) graspDmg += Math.round(lastPhp - P().hp);
      if (P()) lastPhp = P().hp;
      if (st.over) { result = st.result; break; }
    }
    check('F1: fight resolves (win/lose/flee), no hang', result !== null, `result=${result} rounds=${rounds}`);
    check('F1: lure beat played', sawLure);
    check('F1: still beat played', sawStill);
    check('F1: grasp beat fired and hurt (the teeth)', sawGrasp && graspDmg > 0, `grasp=${sawGrasp} dmg=${graspDmg}`);
    check('F1: player strikes killed it from the shore', strikes >= 1 && result === 'won', `strikes=${strikes} result=${result}`);
    note('F1: feel', `won in ${rounds} rounds, ${strikes} spear strikes from shore, took ${graspDmg} grasp dmg`);
  }
  // --- Fight 2: bare hands at the water's edge. Does melee (range 1) reach a
  // monster sitting ON a water cell? Player wades to the adjacent shore tile.
  {
    says = [];
    Game.dayPart = 3;
    Game.map.px = 3; Game.map.py = 3;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 6;
    Game.state.scholar.health = 150;
    Game.state.scholar.equipped = {}; // hands: range 1
    // REAL placement: the shoreline water cell the spawn code would choose.
    const wspot = Game.placeSpawnMonster(byId('nightlight_catfish'));
    check('F2: spawn placement is a shoreline water cell',
      waterGrid()[wspot.my][wspot.mx] === 'water' && nearWater(waterGrid(), wspot.mx, wspot.my) &&
      (() => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = wspot.mx + ox, ny = wspot.my + oy;
        if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && waterGrid()[ny][nx] !== 'water') return true;
      } return false; })(), `${wspot.mx},${wspot.my}`);
    const m = newFightOnWater('nightlight_catfish', wspot.mx, wspot.my, 150);
    m.hp = m.maxHp = 30;
    const p = P(); p.mx = 4; p.my = 6;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 6;
    let rounds = 0, result = null, strikes = 0, lastPhp = 150, dmgTaken = 0;
    while (rounds++ < 40) {
      const st = playRound(() => {
        moveAdjacent(m.mx, m.my); // adjacent shore tile, dist 1
        const mm = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
        if (mm && Math.max(Math.abs(mm.mx - P().mx), Math.abs(mm.my - P().my)) <= 1) {
          if (strikeKey(mm.key)) strikes++;
        }
      });
      if (P() && P().hp < lastPhp) dmgTaken += Math.round(lastPhp - P().hp);
      if (P()) lastPhp = P().hp;
      if (st.over) { result = st.result; break; }
    }
    check('F2: unarmed shore brawl resolves', result !== null, `result=${result} rounds=${rounds}`);
    check('F2: melee range-1 strikes reach the water-sitting catfish', strikes >= 2, `strikes=${strikes}`);
    note('F2: feel', `result=${result} in ${rounds} rounds, ${strikes} unarmed strikes, took ${dmgTaken} dmg`);
    check('F2: the fight costs you (grasp punishes the close-in)', dmgTaken > 0, `dmgTaken=${dmgTaken}`);
  }
  // --- Fight 3: daytime — the glow sits dormant, "just a glow". No hunt. ---
  {
    says = [];
    try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
    Game.state.scholar.monster = null;
    Game.dayPart = 1; // midday
    Game.map.px = 3; Game.map.py = 3;
    Game.state.scholar.mx = 4; Game.state.scholar.my = 6;
    Game.state.scholar.monster = { id: 'nightlight_catfish', mx: 4, my: 4 };
    Game.state.scholar.health = 120;
    let turns = 0;
    while (!Game.tbfight && Game.state.scholar.monster && turns++ < 8) Game.monsterTurn();
    check('F3: daytime catfish does NOT start combat', !Game.tbfight, Game.tbfight ? 'combat started' : 'no combat');
    check('F3: daytime glow stays put (dormant, not hunting, not vanished)',
      !!Game.state.scholar.monster && Game.state.scholar.monster.id === 'nightlight_catfish',
      Game.state.scholar.monster ? 'still there' : 'vanished');
  }

  console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
