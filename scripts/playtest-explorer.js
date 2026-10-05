// EXPLORER playtest: node travel, examine, discovery, map feel.
// A narrated run — plays like a player over 3 in-game days, reports the
// story, the friction, and what breaks.
// Usage: node scripts/playtest-explorer.js [--seed N]
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

let seed = 42;
const argSeed = (process.argv.find(a => a.startsWith('--seed')) || '').split('=')[1];
if (argSeed) seed = parseInt(argSeed, 10);
let rngState = seed >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

let logMark = 0;
const allSaid = [];
// LOG WINDOW FIX: Game.log is capped at 40 entries (say() shifts). An
// absolute index into it goes stale — wrap say() and keep our own record.
function freshLines() { const l = allSaid.slice(logMark); logMark = allSaid.length; return l; }
function beat(title) {
  console.log('\n' + '='.repeat(64));
  console.log('  ' + title);
  console.log('='.repeat(64));
  for (const l of freshLines()) console.log('  | ' + (l || '').toString().slice(0, 220));
}

const kcal0 = () => Game.state.scholar.kcal;
const explored = new Set();
const arrivalsSeen = [];
let examineCalls = 0, examineDupes = 0, cellBugs = 0, deadExamine = 0;

(async () => {
  await Game.init();
  const _say = Game.say.bind(Game);
  Game.say = (m) => { allSaid.push(m); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  freshLines();

  console.log('EXPLORER RUN — 3 days, roam the wild map, examine everything.\n');
  console.log(`world: ${Game.map.tiles.length}x${Game.map.tiles[0].length}, haven @ ${Game.map.px},${Game.map.py} (${Game.playerTile().type})`);
  console.log(`party: ${Game.state.village.roster.length} souls`);

  // ---- DAY LOOP ----
  let totalTravelKcal = 0, nodeVisits = 0;
  const daySummaries = [];
  for (let day = 1; day <= 3; day++) {
    const kStart = kcal0();
    const nodesThisDay = [];
    // visit up to 4 new nodes per day
    for (let v = 0; v < 4; v++) {
      const targets = Game.travelTargets();
      const unvisited = targets.filter(t => !Game.tileAt(t.x, t.y).visited);
      const pool = unvisited.length ? unvisited : targets;
      if (!pool.length) break;
      const t = pool[Math.floor(Math.random() * pool.length)];
      const block = Game.travelBlockage(t.x, t.y);
      if (block && block.kind === 'blockage') {
        console.log(`  !! blocked path to ${t.x},${t.y} (${block.blockType}) — clearing`);
        Game.clearBlockage(t.x, t.y);
        freshLines();
      }
      const dest = Game.tileAt(t.x, t.y);
      const tileType = dest.type;
      Game.travelTo(t.x, t.y);
      nodeVisits++;
      const arr = freshLines().join('\n');
      arrivalsSeen.push(`${tileType}: ${arr.split('\n')[0]}`);
      console.log('  arrival copy: ' + JSON.stringify(arr.slice(0, 400)));
      beat(`arrival — ${tileType} @ ${t.x},${t.y}`);

      // walk around the 9x9: teleport to each quadrant to see what an explorer
      // experiences — perception hints + examine every interesting cell
      const seenCells = {};
      for (const [qx, qy] of [[1, 1], [6, 1], [1, 6], [6, 6], [4, 4]]) {
        Game.state.scholar.mx = qx; Game.state.scholar.my = qy;
        try {
          const hints = Game.perceptionHints().map(h => h.text || h);
          if (hints.length) {
            console.log(`  at ${qx},${qy} → perception: ${hints.map(h => JSON.stringify(h)).join(' ‖ ')}`);
          }
        } catch (e) { cellBugs++; console.log(`  !! perceptionHints threw at ${qx},${qy}: ${e.message}`); }
        const detail = Game.genDetail(Game.map.px, Game.map.py);
        for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
          const cell = detail[cy] && detail[cy][cx];
          if (!cell) continue;
          const cp = (() => { try { return Game.cellProps(cell); } catch (e) { return null; } })();
          if (!cp) { cellBugs++; continue; }
          const interesting = ['tree', 'bigtree', 'bush', 'water', 'tent', 'rubble', 'wall', 'plant', 'stone', 'mound', 'nest'].includes(cell);
          if (!interesting || seenCells[cell + cp.label]) continue;
          seenCells[cell + cp.label] = true;
          // move player next to it, examine
          Game.state.scholar.mx = Math.max(0, Math.min(8, cx + 1));
          Game.state.scholar.my = cy;
          let actions = [];
          try { actions = Game.cellActions(cx, cy) || []; } catch (e) { cellBugs++; console.log(`  !! cellActions(${cx},${cy}) [${cell}] threw: ${e.message}`); continue; }
          const label = (cp.label || cell);
          if (actions.includes('Examine')) {
            examineCalls++;
            try { Game.cellInteract(cx, cy); } catch (e) { cellBugs++; console.log(`  !! cellInteract(${cx},${cy}) [${cell}] threw: ${e.message}`); continue; }
            const out = freshLines().join(' | ');
            console.log(`  examine [${cell}] ${label}: ${out.slice(0, 200) || '(silent)'}`);
            if (!out.trim()) deadExamine++;
            // examine again — second examine should not repeat discovery copy
            try { Game.cellInteract(cx, cy); } catch (e) { cellBugs++; }
            const out2 = freshLines().join(' | ');
            if (out2.trim() && out2 === out) examineDupes++;
          } else if (actions.length) {
            console.log(`  [${cell}] ${label} — actions w/o examine: ${actions.join(', ')}`);
          } else {
            console.log(`  [${cell}] ${label} — no actions at all`);
          }
        }
      }
      nodesThisDay.push(`${t.x},${t.y}:${tileType}`);
      explored.add(`${t.x},${t.y}`);
    }
    // end the day
    if (Game.endDay) Game.endDay(); else Game.dayPart = 0;
    freshLines();
    const kSpent = kStart - kcal0();
    totalTravelKcal += 0; // kcal tracked separately below via travel deltas
    daySummaries.push({ day, nodes: nodesThisDay, kcalStart: kStart, kcalEnd: kcal0() });
    console.log(`\n--- end of day ${day}: scholar kcal ${kStart} → ${kcal0()} (spent ${kStart - kcal0()}) ---`);
  }

  console.log('\n' + '='.repeat(64));
  console.log('  EXPLORER REPORT');
  console.log('='.repeat(64));
  console.log(`nodes visited: ${nodeVisits} (unique: ${explored.size})`);
  console.log(`examine calls: ${examineCalls}, silent examines: ${deadExamine}, copy-dupe 2nd examines: ${examineDupes}, cell bugs: ${cellBugs}`);
  for (const d of daySummaries) console.log(`  day ${d.day}: ${d.nodes.join(' ')} | kcal ${d.kcalStart}→${d.kcalEnd}`);
  console.log('\narrival text samples (type: first line):');
  for (const a of arrivalsSeen.slice(0, 14)) console.log(`  - ${a.slice(0, 160)}`);
  console.log(`\nscholar: alive=${!Game.state.over}, kcal=${Game.state.scholar.kcal}`);
  console.log('\nDone. Feel verdict written by the runner.');
})();
