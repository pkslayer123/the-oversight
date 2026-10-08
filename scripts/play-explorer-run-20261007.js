#!/usr/bin/env node
// EXPLORER RUN 2026-10-07 — play as the explorer: node travel, examine,
// discovery beats, map fill-in, world edge, traveler rumors. Judged as a player.
// Run: node scripts/play-explorer-run-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // runtime checks must take the sync path
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

const says = [];
function note(t) { console.log(t); }
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flushSays(tag, max = 5) {
  for (const t of says.splice(0).slice(0, max)) note(`   | ${tag} ${String(t).slice(0, 170)}`);
}
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} part=${s.part} @node(${m.px},${m.py}) kcal=${Math.round(s.kcal || 0)} dayTicks=${Math.round(s.dayTicks || 0)}`);
}
function stepToward(tx, ty) {
  const axes = [];
  if (Game.map.px !== tx) axes.push([Game.map.px + Math.sign(tx - Game.map.px), Game.map.py]);
  if (Game.map.py !== ty) axes.push([Game.map.px, Game.map.py + Math.sign(ty - Game.map.py)]);
  for (const [nx, ny] of axes) {
    const before = [Game.map.px, Game.map.py];
    says.length = 0;
    const ok = Game.travelTo(nx, ny);
    if (Game.map.px !== before[0] || Game.map.py !== before[1]) return true;
  }
  return false;
}
function counts() {
  let revealed = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (Game.tileAt(x, y).revealed) revealed++;
  const seen = Object.keys(Game.state.scholar.seenTiles || {}).length;
  return { revealed, seen };
}
function mapAscii() {
  const seen = (Game.state.scholar.seenTiles || {});
  const rows = [];
  for (let y = 0; y < 9; y++) {
    let r = '';
    for (let x = 0; x < 9; x++) {
      const t = Game.tileAt(x, y);
      const e = seen[x + ',' + y];
      let c = t.revealed ? 'R' : '.';
      if (e && e.k === 'v') c = 'V'; else if (e && e.k === 's') c = 's';
      if (x === Game.map.px && y === Game.map.py) c = c + '*';
      r += c.padEnd(3, ' ');
    }
    rows.push(`   ${y} ${r}`);
  }
  return rows.join('\n');
}
function plantCells() {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const t = Game.playerTile();
  const out = [];
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const cell = detail[cy] && detail[cy][cx];
    if (['plant', 'bush', 'tree', 'bigtree'].indexOf(cell) === -1) continue;
    let pid = null;
    if (cell === 'bush') pid = (t.bushSpecies || {})[cx + ',' + cy] || null;
    else if (cell === 'plant') pid = (t.plantSpecies || {})[cx + ',' + cy] || null;
    else { const mod = t.modifiers && t.modifiers[cx + ',' + cy]; if (mod && mod.species) pid = 'tree_' + mod.species; }
    out.push({ cx, cy, cell, pid });
  }
  return out;
}
function standNextTo(p) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = p.cx + dx, ny = p.cy + dy;
    if (nx < 0 || ny < 0 || nx > 8 || ny > 8) continue;
    const c = detail[ny] && detail[ny][nx];
    if (['plant', 'bush', 'tree', 'bigtree', 'water', 'wall'].indexOf(c) !== -1) continue;
    Game.state.scholar.mx = nx; Game.state.scholar.my = ny;
    return true;
  }
  return false;
}
const FAILS = [];
function check(label, cond, extra) {
  note(`   ${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) FAILS.push(label);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.village.trust[Game.villagerId] = 70;
  note('=== EXPLORER RUN 2026-10-07 ===');
  vstate('start');
  const hx = Game.map.px, hy = Game.map.py;
  note(`   haven @ (${hx},${hy}) worldSeed saved: ${!!(Game.map.worldSeed || Game.state.worldSeed)}`);

  // --- ACT 1: the walk — long hike to a far corner, watching arrival beats ---
  note('\n=== ACT 1: the walk — hiking to the far corner ===');
  const corner = [8, 0];
  says.length = 0;
  let hops = 0, blocks = 0, arrivals = 0;
  let guard = 24;
  while (guard-- > 0 && (Game.map.px !== corner[0] || Game.map.py !== corner[1])) {
    const moved = stepToward(corner[0], corner[1]);
    if (moved) { hops++; if (says.length) { arrivals++; flushSays('walk', 2); } }
    else { blocks++; flushSays('blocked', 3); break; }
  }
  note(`   hops=${hops} blocks=${blocks} nodes-with-arrival-text=${arrivals}`);
  vstate('at-corner');
  check('corner reached', Game.map.px === 8 && Game.map.py === 0, `at (${Game.map.px},${Game.map.py})`);

  // --- ACT 2: examine sweep on the far node ---
  note('\n=== ACT 2: examine — far node, unknown flora ===');
  const cells = plantCells().filter(c => c.pid);
  note(`   plant cells with pids: ${cells.length}`);
  let examined = 0, leaks = 0;
  for (const c of cells.slice(0, 8)) {
    if (Game.plantKnown(c.pid)) continue; // only unknowns (codex-gated, background varies)
    if (!standNextTo(c)) continue;
    says.length = 0;
    Ex.examinePlantCell(c.cx, c.cy);
    const txt = says.splice(0).join(' ');
    examined++;
    if (txt.toLowerCase().indexOf(c.pid.replace('tree_', '')) !== -1 && !c.pid.startsWith('tree_')) {
      leaks++;
      note(`   LEAK? examine names pid "${c.pid}": ${txt.slice(0, 120)}`);
    }
    if (examined === 1) note(`   sample unknown-examine: ${txt.slice(0, 220)}`);
  }
  note(`   examined=${examined} naming-leaks=${leaks}`);
  check('no knowledge leaks in examine', leaks === 0);
  // repeated examine progression
  const rep = cells.find(c => c.pid && !Game.plantKnown(c.pid) && standNextTo(c));
  if (rep) {
    says.length = 0;
    Ex.examinePlantCell(rep.cx, rep.cy); Ex.examinePlantCell(rep.cx, rep.cy); Ex.examinePlantCell(rep.cx, rep.cy);
    const t3 = says.splice(0).join('\n');
    note(`   3x re-examine recognition beat fired: ${/💡/u.test(t3) ? 'yes' : 'no'}`);
  }

  // --- ACT 3: discovery — walk back via village/ruin, check discovery beats ---
  note('\n=== ACT 3: discovery beats — villages, ruins, rumors ===');
  const targets = { village: null, ruin: null };
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const ty = Game.tileAt(x, y).type;
    if (ty === 'village' && !targets.village && (x !== hx || y !== hy)) targets.village = [x, y];
    if (ty === 'ruin' && !targets.ruin) targets.ruin = [x, y];
  }
  note(`   village at ${targets.village}, ruin at ${targets.ruin}`);
  for (const k of ['village', 'ruin']) {
    const t = targets[k];
    if (!t) { note(`   no ${k} on this worldgen`); continue; }
    says.length = 0;
    guard = 24;
    while (guard-- > 0 && (Game.map.px !== t[0] || Game.map.py !== t[1])) if (!stepToward(t[0], t[1])) break;
    const msgs = says.splice(0);
    note(`   ${k} arrival lines: ${msgs.length}`);
    for (const m of msgs.slice(0, 3)) note(`     | ${String(m).slice(0, 160)}`);
    const tile = Game.playerTile();
    note(`   discovery flags stored: ${k === 'ruin' ? !!tile.ruinStory : ('story=' + !!tile.villageStory)}`);
  }
  // traveler rumors (living-world 2026-10-07): ask around
  says.length = 0;
  const rumorFns = ['travelerRumor', 'getTravelerRumor', 'rumor', 'hearRumor'];
  let rumorFound = null;
  for (const fn of rumorFns) if (typeof Game[fn] === 'function') { rumorFound = fn; break; }
  note(`   rumor API: ${rumorFound || 'none of ' + rumorFns.join('/')}`);
  if (rumorFound) { try { Game[rumorFound](); flushSays('rumor', 3); } catch (e) { note('   rumor call threw: ' + e.message); } }
  const rumorKeys = ['rumors', 'travelerRumors'];
  let rumorState = null;
  for (const k of rumorKeys) if (Game.state[k] || (Game.state.scholar && Game.state.scholar[k])) rumorState = k;
  note(`   rumor state present: ${rumorState || 'NO rumor state found'}`);

  // --- ACT 4: world edge (real path: rim-walk via tryNodeExit) ---
  note('\n=== ACT 4: world edge ===');
  says.length = 0;
  guard = 20;
  while (guard-- > 0 && Game.map.px !== 8) if (!stepToward(8, Game.map.py)) break;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4; // stand on the east rim
  says.length = 0;
  const edgeRes = Game.tryNodeExit(1, 0); // walk east off the true edge
  const edgeMsgs = says.splice(0).join(' ');
  note(`   tryNodeExit east from (8,y): ${JSON.stringify(edgeRes)} pos=${Game.map.px},${Game.map.py}`);
  note(`   edge message: "${edgeMsgs.slice(0, 140)}"`);
  check('edge blocks cleanly with words', edgeRes === null && Game.map.px === 8 && edgeMsgs.length > 10);
  check('no silent edge action', edgeMsgs.length > 0);
  // and the NEAR edge (7,y) must NOT claim the world ends — the 9x9 regression
  guard = 20;
  while (guard-- > 0 && Game.map.px !== 7) if (!stepToward(7, Game.map.py)) break;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4;
  says.length = 0;
  const nearRes = Game.tryNodeExit(1, 0);
  const nearMsgs = says.splice(0).join(' ');
  check('near edge (7,y) walks through to (8,y)', nearRes && nearRes.moved && Game.map.px === 8,
    `got ${JSON.stringify(nearRes)}`);
  check('no fake world-ends message at (7,y)', nearMsgs.indexOf('known world ends here') === -1);

  // --- ACT 5: map fill-in + persistence ---
  note('\n=== ACT 5: map knowledge + persistence ===');
  const c = counts();
  note(`   revealed=${c.revealed} seenTiles=${c.seen}`);
  check('map shows only stepped tiles', c.seen <= c.revealed);
  note('map:\n' + mapAscii());
  // save/load round trip keeps world
  const seedBefore = Game.map.worldSeed || (Game.state && Game.state.worldSeed);
  let persisted = false, saveErr = null;
  try {
    if (typeof Game.save === 'function') { Game.save('explorer-test'); }
    if (typeof Game.load === 'function') { Game.load('explorer-test'); persisted = true; }
  } catch (e) { saveErr = e.message; }
  note(`   save/load round trip: ${persisted ? 'ok' : 'SKIPPED/failed'}${saveErr ? ' — ' + saveErr : ''}`);
  if (persisted) {
    const seedAfter = Game.map.worldSeed || (Game.state && Game.state.worldSeed);
    check('world seed persists across save/load', !!seedAfter && seedBefore === seedAfter, `before=${seedBefore} after=${seedAfter}`);
    const tileType = Game.tileAt(0, 0).type;
    note(`   tile(0,0) type after load: ${tileType}`);
  }

  vstate('end');
  note('\n=== EXPLORER RUN COMPLETE ===');
  note(FAILS.length ? `FAILURES: ${FAILS.join('; ')}` : 'all checks passed');
  process.exit(FAILS.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
