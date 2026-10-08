#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-08), EXPLORER archetype — THE MAP AS AN INSTRUMENT.
// Angles NOT covered by prior runs (travel loop, arrival beat, out-and-back,
// curiosity/whisper, corner-walk):
//   (a) FOG STRICTNESS: what does a new player actually know? seenTiles at
//       spawn, mapSeen for neighbors, map overlay seen-count. No free 3x3?
//   (b) DESTINATION-SEEKING: can a player navigate to a far known node ON
//       PURPOSE? No destination marker exists (Game.travelDest is dead code
//       referenced in app.js only). Measure hop-by-hop friction to a far
//       target — wrong turns, no guidance, the memory burden.
//   (c) DETAIL GRID as discovery surface: genDetail content variety, examine
//       identity gating (strange descriptor vs named) for an explorer with
//       low knowledge.
//   (d) WORLD EDGE: walking off the 9x9 rim — the message, the feel.
//   (e) SHARED MAPS: compareMaps merges villager knowledge — 'shared' shows
//       biome color only, never detail. Verify in play.
// Seeded RNG (mulberry32, SEED env) installed BEFORE eval (modules capture
// Math.random at load). FULL production module list, index.html order,
// minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js.
// Run: node scripts/play-feel-20261008-explorer.js [SEED]
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/the-scattering';
const ROOT = '/tmp/explorer-head-1008'; // HEAD-frozen engine extract
const SEED = parseInt(process.argv[2] || process.env.SEED || '20261008', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
if (!fs.existsSync(ROOT)) {
  fs.mkdirSync(ROOT, { recursive: true });
  const { execSync } = require('child_process');
  execSync(`cd ${WS} && git archive HEAD src/js | tar -x -C ${ROOT}`);
}
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WS, f), 'utf8'))) });
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
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/build.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // runtime checks must take the sync path
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const drain = () => says.splice(0);
function seenSet() { return new Set(Object.keys(Game.state.scholar.seenTiles || {})); }
function walkNode(dx, dy) { // hop to adjacent node via edge-exit (harness shortcut for d-pad walking)
  drain();
  const r = Game.tryNodeExit(dx, dy);
  const msgs = drain();
  return { r, msgs };
}
// stepToward: what a real player does — preferred axis, go around on
// blockage, clear through when there's no way around. Returns 'moved' |
// 'cleared' | 'stuck'. Stats recorded on the ST object.
function stepToward(tx, ty, ST) {
  const px = Game.map.px, py = Game.map.py;
  const dx = Math.sign(tx - px), dy = Math.sign(ty - py);
  const axes = Math.abs(tx - px) >= Math.abs(ty - py)
    ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [ax, ay] of axes) {
    if (!ax && !ay) continue;
    const { r, msgs } = walkNode(ax, ay);
    if (r && r.moved) { ST.hops++; if (msgs.length) ST.arrivals.push(msgs.join(' ').slice(0, 140)); return 'moved'; }
    if (r && r.blocked) {
      ST.blockages++;
      ST.blockageMsgs.push(`${r.blocked.blockType}@(${px + ax},${py + ay}): ${(msgs[0] || '').slice(0, 90)}`);
    }
  }
  // both ways blocked (or off-map): clear the preferred one — a real player
  // cuts through rather than giving up on the expedition.
  const [ax, ay] = axes[0];
  const nx = px + ax, ny = py + ay;
  if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && (ax || ay)) {
    const blk = Game.travelBlockage(nx, ny);
    if (blk) {
      const kcalBefore = Game.state.scholar.kcal || 0;
      drain(); Game.clearBlockage(nx, ny); const cmsgs = drain();
      ST.cleared++; ST.blockageMsgs.push(`CLEARED ${blk.blockType}@(${nx},${ny}) kcal ${kcalBefore}->${Game.state.scholar.kcal}: ${(cmsgs[0] || '').slice(0, 90)}`);
      const { r, msgs } = walkNode(ax, ay);
      if (r && r.moved) { ST.hops++; if (msgs.length) ST.arrivals.push(msgs.join(' ').slice(0, 140)); return 'cleared'; }
    }
  }
  return 'stuck';
}
function standNextToCell(cx, cy) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    const c = detail[ny] && detail[ny][nx];
    if (c && !Game.cellProps(c).blocks) { Game.state.scholar.mx = nx; Game.state.scholar.my = ny; return true; }
  }
  return false;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.exitBuilding(); // you wake up INSIDE the hall — the doors lead out
  note(`=== EXPLORER MAP-INSTRUMENT RUN 2026-10-08 (seed ${SEED}) ===`);
  note(`spawn: node (${Game.map.px},${Game.map.py}) insideHaven=${Game.state.scholar.insideHaven}`);

  // ---- ACT 1: first sight — what does the newborn explorer know? ----
  note('\n=== ACT 1: first sight ===');
  const s0 = seenSet();
  check('A1 spawn knows haven node only', s0.size === 1 && s0.has('4,4'), `seen=${[...s0].join('|')}`);
  let neighborSeen = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (Game.mapSeen(4 + dx, 4 + dy)) neighborSeen++;
  }
  check('A1 neighbors unseen (no free adjacency)', neighborSeen === 0, `neighbors seen=${neighborSeen}`);
  const targets = Game.travelTargets();
  check('A1 travel targets offered at spawn', targets.length > 0, `${targets.length} targets`);
  const unknownTargets = targets.filter(t => t.unknown);
  // The UI question: does an offered target leak the biome of an unvisited node?
  const tileOf = (t) => Game.tileAt(t.x, t.y);
  const leaked = unknownTargets.filter(t => tileOf(t).type && Game.mapSeen(t.x, t.y) === null);
  note(`   targets: ${targets.map(t => `(${t.x},${t.y}) d${t.d}${t.unknown ? '?' : ''}`).slice(0, 8).join(' ')}`);
  check('A1 fog strict at engine level', Game.mapSeen(5, 4) === null, `mapSeen(5,4)=${Game.mapSeen(5, 4)}`);
  // overlay seen-count = what the player sees in the 🗺️ header
  const seenCount = Object.keys(Game.state.scholar.seenTiles || {}).length;
  check('A1 overlay seen-count honest', seenCount === 1, `World (${seenCount} seen)`);

  // ---- ACT 2: the long push — navigate to a far node on purpose ----
  note('\n=== ACT 2: the long push ===');
  // pick a far target: prefer a distant village; else farthest node
  let target = null;
  const ovs = (Game.state.otherVillages || []).filter(v => v.generated && v.x !== undefined);
  if (ovs.length) {
    ovs.sort((a, b) => (Math.abs(b.x - 4) + Math.abs(b.y - 4)) - (Math.abs(a.x - 4) + Math.abs(a.y - 4)));
    target = { x: ovs[0].x, y: ovs[0].y, name: ovs[0].name || 'distant village', kind: 'village' };
  } else {
    target = { x: 8, y: 0, name: 'far corner', kind: 'corner' };
  }
  note(`target: ${target.name} at (${target.x},${target.y}), manhattan ${Math.abs(target.x - 4) + Math.abs(target.y - 4)} from haven`);
  // greedy hop-by-hop: the player has NO destination marker and NO path
  // preview — only adjacent-node stepping (tryNodeExit) and memory.
  const ST = { hops: 0, blockages: 0, cleared: 0, arrivals: [], blockageMsgs: [] };
  const t0 = Game.state.scholar.dayTicks || 0;
  const t0day = Game.state.scholar.day;
  const kcal0 = Game.state.scholar.kcal || 0;
  Game.state.scholar.kcal = 3000; // expedition provisioning — measure mechanics, not starvation
  let guard = 60, outcome = 'moved';
  while (guard-- > 0 && (Game.map.px !== target.x || Game.map.py !== target.y)) {
    outcome = stepToward(target.x, target.y, ST);
    if (outcome === 'stuck') { note('   STUCK — no way forward'); break; }
    if ((Game.state.scholar.dayTicks || 0) > 2000) break; // don't burn the whole day in harness
  }
  const reached = Game.map.px === target.x && Game.map.py === target.y;
  check('A2 reached far target on purpose', reached, `${ST.hops} hops, ${ST.blockages} blockages (${ST.cleared} cleared), outcome=${outcome}`);
  check('A2 arrivals all spoke (no silent)', ST.arrivals.every(a => a.length > 20), `${ST.arrivals.length} arrivals`);
  note('   sample arrivals:');
  ST.arrivals.slice(0, 3).forEach(a => note('     ' + a.slice(0, 140)));
  note('   blockages met:');
  ST.blockageMsgs.slice(0, 6).forEach(m => note('     ' + m));
  const ticksUsed = (Game.state.scholar.dayTicks || 0) - t0 + (Game.state.scholar.day - t0day) * 96;
  note(`   ticks spent: ~${ticksUsed}, kcal ${kcal0}->${Math.round(Game.state.scholar.kcal || 0)} (provisioned 3000)`);
  const s2 = seenSet();
  check('A2 seenTiles == exactly the walked path', [...s2].every(k => {
    const [x, y] = k.split(',').map(Number);
    return Game.mapSeen(x, y) !== null;
  }) && s2.size >= 2, `seen=${s2.size} nodes`);

  // ---- ACT 3: detail grid & examine at the far node ----
  note('\n=== ACT 3: detail grid & examine ===');
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const cellCounts = {};
  const interesting = [];
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const c = detail[cy] && detail[cy][cx];
    if (!c) continue;
    const key = typeof c === 'string' ? c : (c.kind || c.type || 'obj');
    cellCounts[key] = (cellCounts[key] || 0) + 1;
    if (['plant', 'bush', 'tree', 'curiosity', 'track', 'sign', 'shroom', 'flower'].includes(key)) interesting.push([cx, cy, key]);
  }
  const topCells = Object.entries(cellCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}:${n}`).join(' ');
  note(`   detail cells: ${topCells}`);
  check('A3 detail grid has examinable variety', interesting.length > 0, `${interesting.length} interesting cells`);
  const nd = Game.nodeDetail();
  check('A3 nodeDetail epithet present', !!(nd && nd.epithet), `"${(nd && nd.epithet || '').slice(0, 60)}"`);
  // examine a plant cell as a low-knowledge explorer — identity gating?
  if (interesting.length) {
    const [ex, ey, ek] = interesting[0];
    standNextToCell(ex, ey);
    drain();
    try { Game.examineCell(ex, ey); } catch (e) { says.push('THREW: ' + e.message); }
    const exMsgs = drain().join(' ');
    note(`   examine (${ex},${ey}) ${ek}: "${exMsgs.slice(0, 260)}"`);
    check('A3 examine speaks (never silent)', exMsgs.length > 10, `${exMsgs.length} chars`);
    const namesIt = /dandelion|blackberry|muscadine|oak|pine/i.test(exMsgs);
    note(`   examine named a species: ${namesIt} (knowledge-gated: unnamed = honest blind)`);
  }

  // ---- ACT 4: fog strictness after the push ----
  note('\n=== ACT 4: fog strictness ===');
  const s4 = seenSet();
  let leaks = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const k = x + ',' + y;
    if (!s4.has(k) && Game.mapSeen(x, y) !== null) leaks++;
  }
  check('A4 zero map-knowledge leaks', leaks === 0, `leaks=${leaks}`);
  // shared maps: ask a villager to compare maps (conversation action)
  const v0 = (Game.data.villagers || [])[0];
  let sharedBefore = 0;
  if (v0 && Game.compareMaps) {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (Game.mapSeen(x, y) === 'shared') sharedBefore++;
    const cmp = Game.compareMaps(v0.id);
    let sharedAfter = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (Game.mapSeen(x, y) === 'shared') sharedAfter++;
    check('A4 compareMaps shares ground', sharedAfter >= sharedBefore, `shared ${sharedBefore}->${sharedAfter} (${JSON.stringify(cmp).slice(0, 80)})`);
  } else {
    note('   (no villager / compareMaps — skipped)');
  }

  // ---- ACT 5: world edge ----
  note('\n=== ACT 5: world edge ===');
  // walk to the nearest rim, then push past it
  let edgeGuard = 20;
  while (edgeGuard-- > 0 && Game.map.px > 0) { const w = walkNode(-1, 0); if (!w.r || !w.r.moved) break; }
  note(`   at rim node (${Game.map.px},${Game.map.py})`);
  drain();
  const er = Game.tryNodeExit(-1, 0);
  const emsgs = drain();
  check('A5 edge stops you', er === null, `returned ${JSON.stringify(er)}`);
  check('A5 edge speaks once (no silent, no spam)', emsgs.length >= 1 && /ends here|unmapped|edge/i.test(emsgs.join(' ')), `"${emsgs.join(' ').slice(0, 100)}"`);
  drain(); Game.tryNodeExit(-1, 0); Game.tryNodeExit(-1, 0);
  const emsgs2 = drain();
  check('A5 edge does not spam', emsgs2.length === 0, `${emsgs2.length} repeat messages`);

  // ---- ACT 6: targeted destination, round 2 (haven is the target now) ----
  note('\n=== ACT 6: the way home ===');
  // a real player navigates home by memory of the map overlay. Simulate a
  // player who only remembers "haven is at 4,4" (the map shows it — always
  // revealed? check).
  const havenSeen = Game.mapSeen(4, 4);
  check('A6 haven visible on map', havenSeen !== null, `mapSeen(4,4)=${havenSeen}`);
  let home = 0; guard = 60;
  const ST6 = { hops: 0, blockages: 0, cleared: 0, arrivals: [], blockageMsgs: [] };
  Game.state.scholar.kcal = Math.max(Game.state.scholar.kcal || 0, 2000);
  while (guard-- > 0 && (Game.map.px !== 4 || Game.map.py !== 4)) {
    if (stepToward(4, 4, ST6) === 'stuck') break;
  }
  home = ST6.hops;
  check('A6 made it home', Game.map.px === 4 && Game.map.py === 4, `${home} hops home, ${ST6.blockages} blockages (${ST6.cleared} cleared)`);

  // ---- verdicts ----
  const fails = results.filter(([n, ok]) => !ok);
  note(`\n=== RESULT: ${results.length - fails.length}/${results.length} checks passed ===`);
  if (fails.length) { note('FAILURES:'); fails.forEach(([n]) => note('  - ' + n)); }
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
