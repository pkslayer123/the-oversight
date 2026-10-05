// tileFeature curiosity-density tests. Usage: node scripts/test-tilefeature-density.js
// Regression for the 2026-10-05 explorer loop: ~11 whisperable features per
// tile made the curiosity hint ("disturbed ground" etc.) fire at nearly every
// stop — wallpaper, not invitation. Densities were halved; these tests pin
// the new band and confirm no feature type was eliminated and examine
// payoffs still fire.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log(`FAIL ${name}`); } }
let rngState = 20261005 >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.monster = null;
  Game.state.scholar.animal = null;

  // ---- determinism ----
  const f1 = Game.tileFeature(3, 3, 5, 5, 'dirt');
  const f2 = Game.tileFeature(3, 3, 5, 5, 'dirt');
  ok('tileFeature deterministic', f1 === f2);

  // ---- density bands: varied real-coordinate-style inputs (hash is uniform) ----
  const bands = { tracks: 0, oldcamp: 0, strange: 0, none: 0 };
  let tot = 0;
  for (let nx = 0; nx < 7; nx++) for (let ny = 0; ny < 7; ny++) for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const f = Game.tileFeature(nx, ny, cx, cy, 'dirt');
    bands[f || 'none']++; tot++;
  }
  const pc = c => 100 * bands[c] / tot;
  console.log(`dirt/grass bands: tracks=${pc('tracks').toFixed(1)}% oldcamp=${pc('oldcamp').toFixed(1)}% strange=${pc('strange').toFixed(1)}%`);
  ok('tracks ~6% (4-8%)', pc('tracks') > 4 && pc('tracks') < 8);
  ok('oldcamp ~3% (2-4.5%)', pc('oldcamp') > 2 && pc('oldcamp') < 4.5);
  ok('strange ~2% (1-3.5%)', pc('strange') > 1 && pc('strange') < 3.5);

  const bandsT = { hollow: 0, none: 0 };
  let totT = 0;
  for (let nx = 0; nx < 7; nx++) for (let ny = 0; ny < 7; ny++) for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const f = Game.tileFeature(nx, ny, cx, cy, 'tree');
    bandsT[f || 'none']++; totT++;
  }
  console.log(`tree band: hollow=${(100 * bandsT.hollow / totT).toFixed(1)}%`);
  ok('hollow ~3% (1.5-4.5%)', 100 * bandsT.hollow / totT > 1.5 && 100 * bandsT.hollow / totT < 4.5);

  // remnant (rubble) and banktracks (water) bands measured directly — rubble
  // and water cells are sparse on wild tiles, so a wander may never see one.
  const bandsR = { remnant: 0, none: 0 };
  let totR = 0;
  for (let nx = 0; nx < 7; nx++) for (let ny = 0; ny < 7; ny++) for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const f = Game.tileFeature(nx, ny, cx, cy, 'rubble');
    bandsR[f || 'none']++; totR++;
  }
  console.log(`rubble band: remnant=${(100 * bandsR.remnant / totR).toFixed(1)}%`);
  ok('remnant ~4% (2-6%)', 100 * bandsR.remnant / totR > 2 && 100 * bandsR.remnant / totR < 6);

  const bandsW = { banktracks: 0, none: 0 };
  let totW = 0;
  for (let nx = 0; nx < 7; nx++) for (let ny = 0; ny < 7; ny++) for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const f = Game.tileFeature(nx, ny, cx, cy, 'water');
    bandsW[f || 'none']++; totW++;
  }
  console.log(`water band: banktracks=${(100 * bandsW.banktracks / totW).toFixed(1)}%`);
  ok('banktracks ~4% (2-6%)', 100 * bandsW.banktracks / totW > 2 && 100 * bandsW.banktracks / totW < 6);

  // ---- per-tile count on real wild tiles (invitation, not wallpaper) ----
  // When an isolated tracks cell is found, the whisper/examine test runs
  // right there and the wander ends (no pathing back across the map).
  const seen = {};
  const perTile = [];
  let whisperDone = false;
  const visited = new Set([`${Game.map.px},${Game.map.py}`]);
  const findIso = () => {
    const d = Game.genDetail(Game.map.px, Game.map.py);
    const fAt = (cx, cy) => (cx < 0 || cx > 8 || cy < 0 || cy > 8) ? null
      : Game.tileFeature(Game.map.px, Game.map.py, cx, cy, (d[cy] || [])[cx]);
    for (let cy = 1; cy < 8; cy++) for (let cx = 1; cx < 8; cx++) {
      if (fAt(cx, cy) !== 'tracks') continue;
      let lone = true;
      for (let dy = -1; dy <= 1 && lone; dy++) for (let dx = -1; dx <= 1 && lone; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (fAt(cx + dx, cy + dy)) lone = false;
      }
      if (lone) return [cx, cy];
    }
    return null;
  };
  const whisperExamineTest = (cx, cy) => {
    Game.state.scholar.mx = cx; Game.state.scholar.my = cy;
    const before = Game.perceptionHints().map(h => h.text || h).join(' ‖ ');
    ok('whisper fires for unexamined feature', before.includes('The ground here looks disturbed'));
    const said = [];
    const _say = Game.say.bind(Game);
    Game.say = (m) => { said.push(m); return _say(m); };
    Game.state.scholar.mx = Math.max(0, cx - 1); Game.state.scholar.my = cy;
    Game.examineCell(cx, cy);
    Game.say = _say;
    const out = said.join(' | ');
    ok('tracks examine is non-silent', out.trim().length > 0);
    const featKey = `${Game.map.px},${Game.map.py},${cx},${cy}:feat`;
    ok('tracks featKey marked examined', !!(Game.state.codex.examined || {})[featKey]);
    Game.state.scholar.mx = cx; Game.state.scholar.my = cy;
    const after = Game.perceptionHints().map(h => h.text || h).join(' ‖ ');
    ok('whisper quiet after examine', !after.includes('The ground here looks disturbed'));
  };
  for (let hops = 0; hops < 10; hops++) {
    const targets = Game.travelTargets().filter(t => !visited.has(`${t.x},${t.y}`));
    if (!targets.length) break;
    const t = targets[Math.floor(Math.random() * targets.length)];
    const block = Game.travelBlockage(t.x, t.y);
    if (block && block.kind === 'blockage') Game.clearBlockage(t.x, t.y);
    Game.travelTo(t.x, t.y);
    visited.add(`${t.x},${t.y}`);
    const d = Game.genDetail(Game.map.px, Game.map.py);
    let n = 0;
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      const f = Game.tileFeature(Game.map.px, Game.map.py, cx, cy, d[cy][cx]);
      if (f) { n++; seen[f] = (seen[f] || 0) + 1; }
    }
    perTile.push(n);
    if (!whisperDone) {
      const iso = findIso();
      if (iso) { whisperExamineTest(iso[0], iso[1]); whisperDone = true; }
    }
  }
  const avg = perTile.reduce((a, b) => a + b, 0) / perTile.length;
  console.log(`features/tile across ${perTile.length} wild tiles: [${perTile.join(',')}] avg=${avg.toFixed(1)}`);
  ok('avg features/tile in invitation band (2-8)', avg >= 2 && avg <= 8);
  ok('no tile exceeds 12 features', Math.max(...perTile) <= 12);
  // common types must appear on real tiles; sparse-cell types (hollow on
  // trees, remnant on rubble, banktracks on water) are pinned by the band
  // measurements above instead of by wander luck.
  for (const ft of ['tracks', 'oldcamp', 'strange']) {
    ok(`feature type spawns on real tiles: ${ft}`, (seen[ft] || 0) > 0);
  }

  ok('found an isolated tracks cell during the wander', whisperDone);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
