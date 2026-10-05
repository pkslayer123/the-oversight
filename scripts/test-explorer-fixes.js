// Explorer fixes regression tests (2026-10-05 playtest loop).
// 1. NPC scouts MAP (revealed) but never steal the player's arrival (visited).
// 2. Tree Examine is inspection: takes THIS tree's nuts only, never the area sweep.
// 3. Pack-full examine leaves the nuts on the tree (yield preserved, honest copy).
// 4. 'Forage nuts' (explicit harvest) still runs the area sweep.
// Usage: node scripts/test-explorer-fixes.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let rng = 1234 >>> 0;
Math.random = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
// LOG WINDOW: Game.log caps at 40 entries (say() shifts) — wrap say() and
// keep our own unbounded record for assertions.
const allSaid = [];
let logMark = 0;
const freshSaid = () => { const l = allSaid.slice(logMark); logMark = allSaid.length; return l.join(' | '); };

(async () => {
  await Game.init();
  const _say = Game.say.bind(Game);
  Game.say = (m) => { allSaid.push(m); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // ---------- 1. scout maps, never visits ----------
  const v = Game.state.village;
  const scoutId = v.roster.find(id => id !== Game.villagerId);
  const before = {};
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) before[`${x},${y}`] = Game.tileAt(x, y).revealed;
  for (let i = 0; i < 30; i++) Game.resolveOneAssignment(scoutId, { task: 'scout' });
  let newlyRevealed = 0, stolenVisits = 0;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = Game.tileAt(x, y), k = `${x},${y}`;
    if (!before[k] && t.revealed) newlyRevealed++;
    if (t.visited && k !== '3,3') stolenVisits++;
  }
  ok('scout reveals tiles on the map', newlyRevealed > 0, `revealed=${newlyRevealed}`);
  ok('scout never marks a tile visited', stolenVisits === 0, `visited=${stolenVisits}`);

  // arrival moment still fires on the player's first walk-in to a scouted tile
  let scouted = null;
  for (let y = 0; y < 7 && !scouted; y++) for (let x = 0; x < 7 && !scouted; x++) {
    const k = `${x},${y}`, t = Game.tileAt(x, y);
    if (!before[k] && t.revealed && !t.visited && Math.abs(x - 3) + Math.abs(y - 3) === 1) scouted = { x, y, type: t.type };
  }
  if (scouted) {
    freshSaid();
    Game.travelTo(scouted.x, scouted.y);
    const said = freshSaid();
    ok('arrival text fires on first player walk-in (even if scouted)', /— .+ —/.test(said), said.slice(0, 120));
  } else {
    console.log('SKIP arrival-on-scouted-tile (no adjacent scouted tile this seed)');
  }

  // ---------- 2. examine tree: inspection, not harvest ----------
  Game.travelTo(4, 3);
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const t = Game.playerTile();
  let nutTree = null;
  outer: for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const cell = detail[cy] && detail[cy][cx];
    if (cell !== 'tree' && cell !== 'bigtree') continue;
    const mod = (t.modifiers || {})[cx + ',' + cy];
    const sec = (t.secrets || {})[cx + ',' + cy];
    if (mod && (mod.species === 'oak' || mod.species === 'hickory') && sec && sec.yield > 0 && !sec.known) {
      nutTree = { cx, cy, yield: sec.yield };
      break outer;
    }
  }
  ok('found an unexamined nut tree', !!nutTree);
  if (nutTree) {
    const { cx, cy } = nutTree;
    Game.state.scholar.mx = Math.min(8, cx + 1); Game.state.scholar.my = cy;
    const ticks0 = Game.state.scholar.dayTicks || 0;
    const inv0 = Game.state.scholar.inventory.length;
    freshSaid();
    const r = Game.cellInteract(cx, cy);
    const ticksSpent = (Game.state.scholar.dayTicks || 0) - ticks0;
    const said = freshSaid();
    ok('examine returns truthy', !!r);
    ok('examine says what happened', said.length > 0, said.slice(0, 80));
    ok('examine takes the tree nuts (inventory grew or lumped)', Game.state.scholar.inventory.length > inv0, said.slice(0, 120));
    ok('examine costs ~1 tick, not the 16-tick sweep', ticksSpent <= 4, `ticks=${ticksSpent}`);
    ok('examine marks the tree yield taken', (t.secrets[cx + ',' + cy] || {}).yield === 0);
    // no area depletion: neighboring plant cells must NOT be in detailRegrow
    const regrow = t.detailRegrow || {};
    const neighborDepleted = Object.keys(regrow).some(k => {
      const [rx, ry] = k.split(',').map(Number);
      return Math.max(Math.abs(rx - cx), Math.abs(ry - cy)) <= 1 && !(rx === cx && ry === cy);
    });
    ok('examine does not deplete the surrounding patch', !neighborDepleted);
    // second examine: honest "already checked", still no sweep
    const ticks1 = Game.state.scholar.dayTicks || 0;
    freshSaid();
    Game.cellInteract(cx, cy);
    const said2 = freshSaid();
    ok('re-examine is honest and cheap', /already checked/i.test(said2) && (Game.state.scholar.dayTicks - ticks1) <= 4, said2.slice(0, 80));
  }

  // ---------- 3. pack-full examine: nuts stay on the tree ----------
  let nutTree2 = null;
  outer2: for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const cell = detail[cy] && detail[cy][cx];
    if (cell !== 'tree' && cell !== 'bigtree') continue;
    if (nutTree && cx === nutTree.cx && cy === nutTree.cy) continue;
    const mod = (t.modifiers || {})[cx + ',' + cy];
    const sec = (t.secrets || {})[cx + ',' + cy];
    if (mod && (mod.species === 'oak' || mod.species === 'hickory') && sec && sec.yield > 0 && !sec.known) {
      nutTree2 = { cx, cy, yield: sec.yield };
      break outer2;
    }
  }
  if (nutTree2) {
    // fill the pack
    Game.state.scholar.inventory.push({ name: 'Rocks', units: 50, kg: 5, kcalEach: 0, spoilDay: 9999 });
    const { cx, cy } = nutTree2;
    Game.state.scholar.mx = Math.min(8, cx + 1); Game.state.scholar.my = cy;
    freshSaid();
    Game.cellInteract(cx, cy);
    const said = freshSaid();
    ok('pack-full examine is honest about the pack', /pack/i.test(said), said.slice(0, 120));
    ok('pack-full examine leaves the nuts on the tree', (t.secrets[cx + ',' + cy] || {}).yield === nutTree2.yield, `yield=${(t.secrets[cx + ',' + cy] || {}).yield}`);
    ok('pack-full examine does not claim the take', !/You take them/.test(said), said.slice(0, 120));
    Game.state.scholar.inventory = Game.state.scholar.inventory.filter(i => i.name !== 'Rocks');
  } else {
    console.log('SKIP pack-full tree (no second nut tree this seed)');
  }

  // ---------- 4. 'Forage nuts' (explicit harvest) still sweeps ----------
  let nutTree3 = null;
  outer3: for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const cell = detail[cy] && detail[cy][cx];
    if (cell !== 'tree' && cell !== 'bigtree') continue;
    const mod = (t.modifiers || {})[cx + ',' + cy];
    const sec = (t.secrets || {})[cx + ',' + cy];
    if (mod && (mod.species === 'oak' || mod.species === 'hickory') && sec && sec.yield > 0 && !sec.known) {
      sec.known = true; // player already examined it; UI now offers 'Forage nuts'
      nutTree3 = { cx, cy };
      break outer3;
    }
  }
  if (nutTree3) {
    const { cx, cy } = nutTree3;
    Game.state.scholar.mx = Math.min(8, cx + 1); Game.state.scholar.my = cy;
    const ticks0 = Game.state.scholar.dayTicks || 0;
    Game.cellInteract(cx, cy); // 'Forage nuts' path: known secret, yield > 0
    const ticksSpent = (Game.state.scholar.dayTicks || 0) - ticks0;
    ok("'Forage nuts' still runs the full sweep (16 ticks)", ticksSpent >= 16, `ticks=${ticksSpent}`);
  } else {
    console.log("SKIP 'Forage nuts' (no third nut tree this seed)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
