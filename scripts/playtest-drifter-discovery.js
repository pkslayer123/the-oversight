// DRIFTER playtest 2026-10-05 (night): can a player actually FIND another village?
// Nobody teleports here: every leg goes through travelTargets() -> travelTo()
// with no force and no manual reveal — exactly what the map UI offers.
// Two modes: 'smart' (follow rich ground, keep heading, don't backtrack — a
// canny player) vs 'random' (uniform wanderer). Part A measures discovery odds
// across seeds; Part B narrates one full blind journey for feel.
// Usage: node scripts/playtest-drifter-discovery.js [--narrate seed]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let rngState = 1 >>> 0;
function reseed(seed) { rngState = seed >>> 0; }
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

let sayLog = [];
const origSay = Game.say.bind(Game);
Game.say = function (...a) { sayLog.push(String(a[0] || '').slice(0, 220)); return origSay(...a); };

function edibleIdx() {
  const inv = Game.state.scholar.inventory || [];
  let best = -1, bestK = 0;
  inv.forEach((it, i) => {
    if (!it || (it.kcalEach || 0) <= 0 || (it.units || 0) <= 0) return;
    if (it.edible === false) return;
    const k = it.kcalEach * it.units;
    if (k > bestK) { bestK = k; best = i; }
  });
  return best;
}
function eatUp() {
  const s = Game.state.scholar;
  let guard = 0;
  while ((s.kcal || 0) < 2200 && guard++ < 12) {
    const i = edibleIdx();
    if (i < 0) break;
    Game.eatOne(i);
  }
}
function forageHere() {
  const s = Game.state.scholar;
  try { Game.doAction('forage', { cx: s.mx ?? 4, cy: s.my ?? 4 }); } catch (e) {}
}
function drinkUp() {
  const s = Game.state.scholar;
  if ((s.hydration || 0) < 35) { try { Game.doAction('drink'); } catch (e) {} }
}

// One blind journey. Returns metrics. narrate=true logs every leg.
async function journey(seed, mode, narrate) {
  reseed(seed);
  sayLog = [];
  await Game.init();
  Game.genRoster('Minneapolis, USA');
  Game.newGame('Minneapolis, USA', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.fillWaterFromVillage(); } catch (e) {}
  const s = Game.state.scholar;
  const villages = (Game.state.otherVillages || []).map(v => ({ name: v.name, x: v.x, y: v.y }));
  const home = { x: 3, y: 3 };
  const visited = new Set(['3,3']);
  const blocked = new Set();
  let heading = null, prev = { x: 3, y: 3 };
  let legs = 0, forages = 0, blocks = 0, sleeps = 0, drinks = 0;
  let discovered = null, died = null;
  const trace = [];
  const MAX_DAYS = 6;

  while ((s.day || 1) <= MAX_DAYS && !Game.over) {
    // walk while it's light
    let guard = 0;
    while (Game.dayPart < 3 && guard++ < 40 && !Game.over) {
      const cands = Game.travelTargets().filter(t => !blocked.has(`${Game.map.px},${Game.map.py}>${t.x},${t.y}`));
      if (!cands.length) break;
      let pick = null;
      if (mode === 'random') {
        pick = cands[Math.floor(Math.random() * cands.length)];
      } else {
        let best = -1e18;
        for (const t of cands) {
          const key = `${t.x},${t.y}`;
          const back = (t.x === prev.x && t.y === prev.y);
          let score = 0;
          try { score += Game.turfKcal(t.x, t.y); } catch (e) {}
          if (!visited.has(key)) score += 1500;
          if (back && cands.length > 1) score -= 5000;
          if (heading) {
            const dx = Math.sign(t.x - Game.map.px), dy = Math.sign(t.y - Game.map.py);
            if (dx === heading.x && dy === heading.y) score += 1200;
          }
          score -= 300 * t.d; // nearer legs first
          if (score > best) { best = score; pick = t; }
        }
      }
      if (!pick) break;
      const fx = Game.map.px, fy = Game.map.py;
      const ret = Game.travelTo(pick.x, pick.y);
      if (ret && ret.blockType) {
        blocked.add(`${fx},${fy}>${pick.x},${pick.y}`);
        blocks++;
        if (narrate) trace.push(`leg ${legs}: blocked ${ret.blockType} -> (${pick.x},${pick.y})`);
        continue;
      }
      heading = { x: Math.sign(pick.x - fx), y: Math.sign(pick.y - fy) };
      prev = { x: fx, y: fy };
      visited.add(`${pick.x},${pick.y}`);
      legs++;
      if (legs % 4 === 0) { forageHere(); forages++; }
      if ((s.kcal || 0) < 1100) eatUp();
      if ((s.hydration || 0) < 35) { drinkUp(); drinks++; }
      if (narrate) trace.push(`leg ${legs}: -> (${pick.x},${pick.y}) ${Game.playerTile().type} kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} hp=${Math.round(s.health)} part=${Game.dayPart} tick=${s.dayTicks}`);
      const found = (Game.state.otherVillages || []).find(v => v.generated);
      if (found && !discovered) {
        discovered = { name: found.name, day: s.day, legs, x: found.x, y: found.y };
        const smoke = sayLog.filter(l => l.includes(found.name)).slice(-3);
        if (narrate) { trace.push(`*** DISCOVERED ${found.name} at (${found.x},${found.y}) on day ${s.day}, leg ${legs} ***`); smoke.forEach(l => trace.push('  | ' + l)); }
      }
      if (Game.over) break;
    }
    if (Game.over) break;
    // night: sleep rough
    if (!Game.over) {
      try { Game.sleep(); sleeps++; } catch (e) { trace.push('sleep threw: ' + e.message); break; }
      eatUp();
    }
    if (Game.over) { died = `day ${s.day}`; break; }
  }
  return {
    seed, mode, legs, forages, blocks, sleeps, drinks, discovered,
    died, over: !!Game.over, endDay: s.day,
    kcal: Math.round(s.kcal || 0), hp: Math.round(s.health || 0), hyd: Math.round(s.hydration || 0),
    visitedTiles: visited.size, villages, trace,
    smokeLines: sayLog.filter(l => /smoke on the horizon/i.test(l)),
  };
}

(async () => {
  const narrateArg = (process.argv.find(a => a.startsWith('--narrate')) || '').split('=')[1];
  if (narrateArg !== undefined && narrateArg !== '') {
    const r = await journey(parseInt(narrateArg, 10), 'smart', true);
    console.log(`\n===== NARRATED BLIND JOURNEY — seed ${r.seed} =====`);
    console.log(`villages on this map: ${r.villages.map(v => `${v.name}@(${v.x},${v.y})`).join('  ')}`);
    r.trace.forEach(l => console.log('  ' + l));
    console.log(`\nRESULT: ${r.discovered ? `FOUND ${r.discovered.name} day ${r.discovered.day} after ${r.discovered.legs} legs` : 'NEVER FOUND ANYONE'}${r.died ? ` — DIED ${r.died}` : ''}`);
    console.log(`legs=${r.legs} visited=${r.visitedTiles}/49 forages=${r.forages} blocks=${r.blocks} sleeps=${r.sleeps} end kcal=${r.kcal} hp=${r.hp} hyd=${r.hyd}`);
    console.log(`smoke announcements: ${r.smokeLines.length}`);
    r.smokeLines.forEach(l => console.log('  > ' + l.slice(0, 200)));
    return;
  }
  const SEEDS = 16;
  const rows = [];
  for (let i = 0; i < SEEDS; i++) {
    const a = await journey(1000 + i, 'smart', false);
    const b = await journey(2000 + i, 'random', false);
    rows.push(a, b);
    console.log(`seed ${1000 + i} smart: ${a.discovered ? `FOUND ${a.discovered.name} d${a.discovered.day} l${a.discovered.legs}` : 'miss'}${a.died ? ' DIED' : ''} legs=${a.legs} kcal=${a.kcal} | seed ${2000 + i} random: ${b.discovered ? `FOUND ${b.discovered.name} d${b.discovered.day}` : 'miss'}${b.died ? ' DIED' : ''} legs=${b.legs}`);
  }
  for (const mode of ['smart', 'random']) {
    const rs = rows.filter(r => r.mode === mode);
    const found = rs.filter(r => r.discovered);
    const died = rs.filter(r => r.died);
    const avgLegs = found.length ? (found.reduce((t, r) => t + r.discovered.legs, 0) / found.length).toFixed(1) : '—';
    console.log(`\n${mode.toUpperCase()}: found ${found.length}/${rs.length} in 6 days, died ${died.length}/${rs.length}, avg legs-to-find ${avgLegs}`);
  }
})();
