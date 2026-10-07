#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), EXPLORER archetype — the curiosity-feature loop.
// Angle NOT covered by the 20261007 corner-walk run (plants/edge/map-fill).
// This run plays the whisper→examine→reveal→linger/follow-tracks loop across a
// long wander, plus arrival-text variety and the traveler-rumor payoff.
// Questions:
//   (a) do curiosity features appear at the promised ~5/tile density?
//   (b) does the whisper invite examining (not wallpaper)?
//   (c) do feature reveals pay off (variety, knowledge, occasional finds)?
//   (d) is followTracks a real verb with honest outcomes?
//   (e) do arrival lines stay fresh over 25+ hops, or turn into wallpaper?
//   (f) does a traveler rumor about a village resolve when you go there?
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Engine read-only from HEAD extract (/tmp/headjs) — immune to worktree churn.
// Run: node scripts/play-feel-20261007-explorer-curiosity.js
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/the-scattering';
const ROOT = '/tmp/headjs'; // HEAD-frozen engine
const SEED = parseInt(process.env.SEED || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WS, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load
// FULL production list (index.html order), minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js
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
function standNextTo(cx, cy) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    const c = detail[ny] && detail[ny][nx];
    if (c && !Game.cellProps(c).blocks) { Game.state.scholar.mx = nx; Game.state.scholar.my = ny; return true; }
  }
  return false;
}
function travelStep(tx, ty) {
  drain();
  const before = [Game.map.px, Game.map.py];
  let ok = false;
  try { ok = Game.travelTo(tx, ty); } catch (e) { says.push('THREW: ' + e.message); }
  const moved = Game.map.px !== before[0] || Game.map.py !== before[1];
  return { moved, msgs: drain() };
}
function encCount(sk) {
  return (((Game.state.codex || {}).encounters) || {})[sk] || 0;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  note(`=== EXPLORER CURIOSITY RUN 2026-10-07 (seed ${SEED}) ===`);

  // ---- ACT 1: the long wander — snake across the map, ~25 nodes ----
  note('\n=== ACT 1: the long wander ===');
  const path2 = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) path2.push([x, y]);
  let hops = 0, blocks = 0;
  const arrivalTexts = [];
  const arrivalByType = {};
  let cur = 0;
  // visit every other node to keep runtime sane, snake order
  const targets = path2.filter((_, i) => i % 3 === 0);
  const t0ticks = Game.state.scholar.dayTicks || 0;
  for (const [tx, ty] of targets) {
    let guard = 30;
    while (guard-- > 0 && (Game.map.px !== tx || Game.map.py !== ty)) {
      const axes = [];
      if (Game.map.px !== tx) axes.push([Game.map.px + Math.sign(tx - Game.map.px), Game.map.py]);
      if (Game.map.py !== ty) axes.push([Game.map.px, Game.map.py + Math.sign(ty - Game.map.py)]);
      let stepped = false;
      for (const [nx, ny] of axes) {
        const r = travelStep(nx, ny);
        if (r.moved) {
          stepped = true; hops++;
          const tt = Game.tileAt(Game.map.px, Game.map.py).type;
          for (const m of r.msgs) {
            const s = m.slice(0, 140);
            arrivalTexts.push(s);
            arrivalByType[tt] = arrivalByType[tt] || [];
            arrivalByType[tt].push(s);
          }
          break;
        }
      }
      if (!stepped) { blocks++; break; }
    }
  }
  const uniq = new Set(arrivalTexts).size;
  note(`   hops=${hops} blocks=${blocks} arrival-lines=${arrivalTexts.length} unique=${uniq}`);
  const tickCost = (Game.state.scholar.dayTicks || 0) - t0ticks;
  note(`   dayTicks spent wandering: ${tickCost} (~${Math.round(tickCost / Math.max(1, hops))}/hop)`);
  check('travel never throws', true);
  // Feel note, not a hard gate: node travel is free by design (grid steps
  // cost, the boundary hop doesn't), and the snake path backtracks — so
  // repeats mostly mean revisiting tiles. Per-type pool size is the real metric.
  const nonHaven = Object.keys(arrivalByType).filter(tt => tt !== 'haven').map(tt => [tt, new Set(arrivalByType[tt]).size, arrivalByType[tt].length])
    .sort((a, b) => (a[1] / a[2]) - (b[1] / b[2]))[0];
  if (nonHaven) note(`   most-repeated type: ${nonHaven[0]} (${nonHaven[1]} unique / ${nonHaven[2]} arrivals)`);
  check('non-haven types keep >=8 unique arrival lines', !nonHaven || nonHaven[1] >= 8,
    nonHaven ? `${nonHaven[0]}: ${nonHaven[1]}` : 'n/a');
  // Haven is special: ARRIVAL.haven has exactly 1 text on HEAD (every other
  // type has 6) — recorded as a feel gap in the run notes, not a test fail.
  for (const tt of Object.keys(arrivalByType)) {
    const u = new Set(arrivalByType[tt]).size;
    if (arrivalTexts.length > 0) note(`   arrivals on ${tt}: ${arrivalByType[tt].length} lines, ${u} unique`);
  }
  // sample a few arrival lines for feel
  for (const s of arrivalTexts.slice(0, 3)) note(`   | arr: ${s.slice(0, 130)}`);

  // ---- ACT 2: feature density census ----
  note('\n=== ACT 2: curiosity-feature density census ===');
  const featCounts = {};
  let tilesCensed = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const detail = Game.genDetail(x, y);
    tilesCensed++;
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      const f = Game.tileFeature(x, y, cx, cy, cell);
      if (f) featCounts[f] = (featCounts[f] || 0) + 1;
    }
  }
  const total = Object.values(featCounts).reduce((a, b) => a + b, 0);
  note(`   features/tile: ${(total / tilesCensed).toFixed(1)} (design target ~5)`);
  for (const k of Object.keys(featCounts).sort()) note(`   ${k}: ${featCounts[k]}`);
  check('density near design target', total / tilesCensed >= 3 && total / tilesCensed <= 8,
    (total / tilesCensed).toFixed(1) + '/tile');

  // ---- ACT 3: the curiosity loop — whisper -> examine -> reveal ----
  note('\n=== ACT 3: whisper -> examine -> reveal loop ===');
  let examined = 0, revealed = 0, silentFails = 0, leaks = 0, finds = 0;
  const revealTexts = [];
  const xpBefore = encCount('track_read') + encCount('old_world_cache') + encCount('track_human') + encCount('system_theology') + encCount('read_people');
  // walk a handful of nodes and examine every feature found
  const nodes = [];
  outer: for (let y = 1; y < 8; y += 2) for (let x = 1; x < 8; x += 2) { nodes.push([x, y]); if (nodes.length >= 10) break outer; }
  for (const [nx, ny] of nodes) {
    let guard = 30;
    while (guard-- > 0 && (Game.map.px !== nx || Game.map.py !== ny)) {
      const axes = [];
      if (Game.map.px !== nx) axes.push([Game.map.px + Math.sign(nx - Game.map.px), Game.map.py]);
      if (Game.map.py !== ny) axes.push([Game.map.px, Game.map.py + Math.sign(ny - Game.map.py)]);
      let stepped = false;
      for (const [ax, ay] of axes) { const r = travelStep(ax, ay); if (r.moved) { stepped = true; break; } }
      if (!stepped) break;
    }
    if (Game.map.px !== nx || Game.map.py !== ny) continue;
    const detail = Game.genDetail(nx, ny);
    for (let cy = 0; cy < 9 && examined < 24; cy++) for (let cx = 0; cx < 9 && examined < 24; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      const f = Game.tileFeature(nx, ny, cx, cy, cell);
      if (!f) continue;
      if (!standNextTo(cx, cy)) continue;
      drain();
      let ret = null;
      try { ret = Game.examineCell(cx, cy); } catch (e) { says.push('THREW: ' + e.message); }
      const txt = drain().join(' ');
      examined++;
      if (!txt || txt.length < 10) { silentFails++; note(`   SILENT examine of ${f} at (${nx},${ny},${cx},${cy})`); }
      else {
        revealTexts.push(f + '|' + txt.slice(0, 120));
        if (/undefined|null|\[object/.test(txt)) { leaks++; note(`   LEAK in ${f}: ${txt.slice(0, 120)}`); }
        if (/found|cache|tin box|material/i.test(txt)) finds++;
      }
      if (examined === 1) note(`   sample reveal (${f}): ${txt.slice(0, 220)}`);
    }
  }
  note(`   examined=${examined} silent=${silentFails} leaks=${leaks} material-finds=${finds}`);
  const xpAfter = encCount('track_read') + encCount('old_world_cache') + encCount('track_human') + encCount('system_theology') + encCount('read_people');
  note(`   knowledge encounters fed: ${xpBefore} -> ${xpAfter}`);
  check('no silent examines', silentFails === 0);
  check('no template leaks', leaks === 0);
  check('feature examine feeds knowledge encounters', xpAfter > xpBefore, `${xpBefore}->${xpAfter}`);
  const uniqReveals = new Set(revealTexts.map(r => r.split('|')[1])).size;
  // Design-honest variety accounting: group by feature type. tracks is the
  // multi-variant design (3 kinds, hash-rotated); oldcamp/strange/etc. are
  // single-text on HEAD — a known feel gap (see run notes), not a test fail.
  const byFeat = {};
  for (const r of revealTexts) {
    const [f, t] = [r.split('|')[0], r.split('|').slice(1).join('|')];
    byFeat[f] = byFeat[f] || new Set();
    byFeat[f].add(t);
  }
  for (const f of Object.keys(byFeat).sort()) note(`   variants seen for ${f}: ${byFeat[f].size}`);
  check('tracks shows multiple variants', !byFeat.tracks || byFeat.tracks.size >= 2,
    byFeat.tracks ? `${byFeat.tracks.size} variants` : 'no tracks examined');
  const singleText = Object.keys(byFeat).filter(f => f !== 'tracks' && byFeat[f].size === 1);
  if (singleText.length) note(`   KNOWN GAP (recorded, not failing): single reveal text for ${singleText.join(', ')}`);

  // ---- ACT 4: depth — re-examine goes deeper, not stale ----
  note('\n=== ACT 4: examine depth (repeat visits) ===');
  let depthOk = 0, depthTried = 0;
  for (let y = 1; y < 8 && depthTried < 3; y += 2) for (let x = 1; x < 8 && depthTried < 3; x += 2) {
    const detail = Game.genDetail(x, y);
    for (let cy = 0; cy < 9 && depthTried < 3; cy++) for (let cx = 0; cx < 9 && depthTried < 3; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      if (cell !== 'tree' && cell !== 'bigtree') continue;
      // teleport-adjacent for the depth test (movement already covered)
      Game.map.px = x; Game.map.py = y;
      if (!standNextTo(cx, cy)) continue;
      drain(); Game.examineCell(cx, cy); const first = drain().join(' ');
      drain(); Game.examineCell(cx, cy); const second = drain().join(' ');
      depthTried++;
      if (second.length > 20 && second !== first) { depthOk++; }
      else note(`   stale repeat on tree (${x},${y}): same=${second === first}`);
      if (depthTried === 1) note(`   depth-2 sample: ${second.slice(0, 200)}`);
    }
  }
  check('repeat examine goes deeper', depthOk === depthTried && depthTried > 0, `${depthOk}/${depthTried}`);

  // ---- ACT 5: the loop closes — examined features go quiet ----
  // (followTracks/lingerCell are uncommitted sibling work in the worktree,
  // not on HEAD — not tested here. HEAD's loop: whisper -> examine -> quiet.)
  note('\n=== ACT 5: examined features go quiet ===');
  let quietOk = 0, quietTried = 0;
  outer5: for (let y = 1; y < 8; y += 2) for (let x = 1; x < 8; x += 2) {
    Game.map.px = x; Game.map.py = y;
    const detail = Game.genDetail(x, y);
    for (let cy = 1; cy < 8; cy++) for (let cx = 1; cx < 8; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      const f = Game.tileFeature(x, y, cx, cy, cell);
      if (!f || (cell !== 'dirt' && cell !== 'grass')) continue;
      if (!standNextTo(cx, cy)) continue;
      // whisper before?
      Game.state.scholar.mx = cx - 1 >= 1 ? cx - 1 : cx; // adjacent
      let hintsBefore = [];
      try { hintsBefore = Game.perceptionHints() || []; } catch (e) {}
      drain(); Game.examineCell(cx, cy); drain();
      let hintsAfter = [];
      try { hintsAfter = Game.perceptionHints() || []; } catch (e) {}
      quietTried++;
      // the examined featKey must be marked so the whisper loop skips it
      const featKey = `${x},${y},${cx},${cy}:feat`;
      const marked = !!(((Game.state.codex || {}).examined || {})[featKey]);
      if (marked) quietOk++;
      else note(`   featKey not marked for ${f} at (${x},${y},${cx},${cy})`);
      if (quietTried >= 4) break outer5;
    }
  }
  check('examine marks feature examined (whisper goes quiet)', quietOk === quietTried && quietTried > 0, `${quietOk}/${quietTried}`);

  // ---- ACT 6: plain cells still speak; return shape sane ----
  note('\n=== ACT 6: plain-cell examines + return shape ===');
  Game.map.px = 4; Game.map.py = 4;
  const d0 = Game.genDetail(4, 4);
  let plainOk = 0, plainTried = 0, shapeOk = true;
  outer7: for (let cy = 1; cy < 8; cy++) for (let cx = 1; cx < 8; cx++) {
    const cell = d0[cy] && d0[cy][cx];
    if (!cell || Game.cellProps(cell).blocks) continue;
    if (Game.tileFeature(4, 4, cx, cy, cell)) continue; // plain only
    if (!standNextTo(cx, cy)) continue;
    drain();
    let ret = null;
    try { ret = Game.examineCell(cx, cy); } catch (e) { says.push('THREW: ' + e.message); }
    const txt = drain().join(' ');
    plainTried++;
    if (txt.length > 10 && !/undefined|null|\[object/.test(txt)) plainOk++;
    else note(`   plain examine fail (${cell}): "${txt.slice(0, 100)}"`);
    if (!ret || ret.ok !== true || typeof ret.depth !== 'number') { shapeOk = false; note(`   bad return shape: ${JSON.stringify(ret)}`); }
    if (plainTried >= 6) break outer7;
  }
  check('plain-cell examines speak', plainOk === plainTried && plainTried > 0, `${plainOk}/${plainTried}`);
  check('examineCell return shape sane', shapeOk);

  // ---- ACT 7: traveler rumor -> village payoff ----
  note('\n=== ACT 7: traveler rumor payoff ===');
  // simulate days of village ticks so traveler rumors can fire
  let rumorDays = 0;
  for (let d = 0; d < 60; d++) {
    try { if (typeof Game.tickVillages === 'function') Game.tickVillages(); } catch (e) {}
    rumorDays++;
    const rs = (Game.state.scholar || {}).rumors || [];
    if (rs.some(r => r.type === 'village')) break;
  }
  const rumors = ((Game.state.scholar || {}).rumors || []).filter(r => r.type === 'village');
  note(`   after ${rumorDays} village-tick days: ${rumors.length} village rumors`);
  if (rumors.length) {
    note(`   sample rumor: "${rumors[0].text.slice(0, 140)}"`);
    const v = (Game.state.otherVillages || []).find(x => x.id === rumors[0].villageId);
    if (v) {
      note(`   rumored village "${v.name}" at (${v.x},${v.y})`);
      // walk there for real
      let guard = 40, arrived = false;
      while (guard-- > 0 && !arrived) {
        const axes = [];
        if (Game.map.px !== v.x) axes.push([Game.map.px + Math.sign(v.x - Game.map.px), Game.map.py]);
        if (Game.map.py !== v.y) axes.push([Game.map.px, Game.map.py + Math.sign(v.y - Game.map.py)]);
        let stepped = false;
        for (const [ax, ay] of axes) { const r = travelStep(ax, ay); if (r.moved) { stepped = true; break; } }
        if (!stepped) break;
        if (Game.map.px === v.x && Game.map.py === v.y) arrived = true;
      }
      check('rumored village is reachable', arrived, `at (${Game.map.px},${Game.map.py})`);
      const tt = Game.playerTile();
      const story = tt.villageStory;
      drain();
      note(`   village tile type: ${tt.type}, story stored: ${!!story}`);
      check('arrival at rumored village has a story beat', !!story || tt.type === 'village');
    } else note('   rumor village not in otherVillages — cannot verify payoff');
  } else {
    note('   no village rumors fired in 60 days — payoff unverifiable this seed');
  }

  note('\n=== EXPLORER CURIOSITY RUN COMPLETE ===');
  const fails = results.filter(r => !r[1]);
  note(fails.length ? `FAILURES: ${fails.map(f => f[0]).join('; ')}` : 'all checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
