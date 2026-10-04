// Gameplay simulator: bots play the full loop, we measure the economy.
// Usage: node scripts/simulate.js [runs] [policy]
// Policies: random | greedy
// Answers: win rate, days, pantry trajectory, death causes, per-tile EV.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function richnessAt(x, y) {
  const b = Game.bountyFor(x, y);
  return b ? b.richness : 1;
}

// --- static EV table: expected kcal per forage by tile type ---
function evTable() {
  const plants = Game.data.plants;
  const rows = {};
  const types = ['grove', 'meadow', 'thicket', 'wetland', 'creek', 'trail_edge', 'forest_floor'];
  for (const ty of types) {
    // emulate genMap richness for a pure tile of this type with water adjacency
    const RICH = { grove: 1.5, wetland: 1.4, creek: 1.3, meadow: 1.3, thicket: 1.2, trail_edge: 1.0, forest_floor: 0.8 };
    const r = RICH[ty];
    // sample the forage table 2000x via the real engine on a synthetic tile
    const tile = { type: ty, stock: 99, maxStock: 99, bountySampled: true, foraged: false };
    let kcal = 0, n = 2000;
    const bounty = ty === 'forest_floor' ? null : { favored: { grove: 'hickory_nut', meadow: 'dandelion', thicket: 'blackberry', wetland: 'cattail', creek: 'cattail', trail_edge: 'dandelion' }[ty], richness: r, why: '' };
    for (let i = 0; i < n; i++) {
      const rr = globalThis.Scattering.forage.forage(
        { ...tile }, Game.biome(), plants, Game.state.scholar, Game.state.codex, Game.data.abilities, bounty);
      kcal += rr.kcal;
    }
    const perForage = kcal / n;
    const stock = r >= 1.5 ? 3 : r >= 1.0 ? 2 : 1;
    rows[ty] = { richness: r, perForage: Math.round(perForage), stock, dailyEV: Math.round(perForage * stock) };
  }
  return rows;
}

// --- bot policies ---
function freeUpkeep() {
  const s = Game.state.scholar;
  if (s.kcal < 1500 && s.inventory.length) Game.eat();
  if (s.hydration < 60 && s.water > 0) Game.drinkTreated();
}

function nearestWater() {
  const st = Game.status();
  let best = null, bd = 99;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = Game.tileAt(x, y);
    if (t.type !== 'creek' && t.type !== 'wetland') continue;
    const d = Math.abs(x - st.px) + Math.abs(y - st.py);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

function bestTile() {
  const st = Game.status();
  let best = null, bv = -1;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven' || tile.type === 'ruin') continue;
    const v = richnessAt(t.x, t.y) * (tile.stock || 0) / t.d;
    if (v > bv) { bv = v; best = t; }
  }
  return best;
}

function greedyPart() {
  freeUpkeep();
  const st = Game.status();
  const tile = Game.playerTile();
  // water crisis
  if (st.hydration < 40) {
    if (tile.type === 'creek' || tile.type === 'wetland') {
      if (st.water < 2) { Game.doAction('treat'); return; }
      Game.drinkWild(); return;
    }
    const w = nearestWater();
    if (w) { const tg = Game.travelTargets().find(t => t.x === w.x && t.y === w.y) || bestTile(); if (tg) { Game.travelTo(tg.x, tg.y); return; } }
  }
  // carrying surplus → go home and bank it (the pantry is the score)
  const packKcal = st.invKcal;
  if (packKcal > 2500 || (Game.state.scholar.day % 3 === 0 && packKcal > 1000)) {
    const home = Game.travelTargets().find(t => t.x === 3 && t.y === 3);
    if (home) { Game.travelTo(3, 3); return; }
    // head toward home
    const t = Game.travelTargets().sort((a, b) =>
      (Math.abs(a.x - 3) + Math.abs(a.y - 3)) - (Math.abs(b.x - 3) + Math.abs(b.y - 3)))[0];
    if (t) { Game.travelTo(t.x, t.y); return; }
  }
  // forage here if worth it
  // work what's in front of you — walking past food to find better food is how you starve
  if (tile.stock > 0 && tile.type !== 'haven' && tile.type !== 'ruin') {
    Game.doAction('forage'); return;
  }
  // ruin with loot → scavenge
  if (tile.type === 'ruin' && (tile.loot || []).length) { Game.doAction('forage'); return; }
  // move to best tile
  const b = bestTile();
  if (b) { Game.travelTo(b.x, b.y); return; }
  Game.doAction('wait');
}

function randomPart() {
  freeUpkeep();
  const opts = ['forage', 'treat', 'wait'];
  const t = Game.travelTargets();
  if (t.length && Math.random() < 0.5) {
    const d = t[Math.floor(Math.random() * t.length)];
    Game.travelTo(d.x, d.y); return;
  }
  Game.doAction(opts[Math.floor(Math.random() * opts.length)]);
}

function runOnce(policy, maxDays = 60) {
  Game.genRoster();
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const pantry = [];
  let parts = 0, forages = 0, starveDays = 0;
  while (!Game.status().over && Game.state.scholar.day <= maxDays && parts < maxDays * 4) {
    const before = (Game.state.telemetry || []).length;
    if (policy === 'greedy') greedyPart(); else randomPart();
    if ((Game.state.telemetry || []).slice(before).some(e => e.type === 'forage')) forages++;
    parts++;
    const s = Game.state.scholar;
    if (s.kcal < 500) starveDays++;
    if (Game.status().over) break;
    pantry.push(Math.round(Game.state.village.pantryKcal));
  }
  const st = Game.status();
  return {
    won: !!st.won, days: Game.state.scholar.day, parts, forages, starveDays,
    pantryEnd: Math.round(Game.state.village.pantryKcal),
    pantryMax: Math.max(...pantry), pantryMin: Math.min(...pantry),
    codex: Object.keys(Game.state.codex.plants).length,
  };
}

(async () => {
  await Game.init();
  const args = process.argv.slice(2);
  const runs = parseInt(args[0] || '30', 10);

  console.log('=== PER-TILE EV (kcal per forage, 2000 samples) ===');
  Game.genRoster();
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const ev = process.env.SKIP_EV ? {} : evTable();
  for (const [ty, r] of Object.entries(ev))
    console.log(`${ty.padEnd(13)} rich ${r.richness.toFixed(1)}  stock ${r.stock}  E/forage ${r.perForage}  E/day ${r.dailyEV}`);
  // real map carrying capacity: sample actual tiles
  if (process.env.SKIP_EV) { console.log('(EV skipped)'); }
  else {
  let cap = 0;
  const seen = {};
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = Game.tileAt(x, y);
    if (t.type === 'haven' || t.type === 'ruin') continue;
    const key = t.type;
    if (!seen[key]) seen[key] = ev[key].dailyEV;
    cap += seen[key];
  }
  console.log(`actual map daily carrying capacity: ~${cap} kcal vs need 3000/day (2200 scholar + 800 village)`);
  }

  for (const policy of ['random', 'greedy']) {
    const res = [];
    for (let i = 0; i < runs; i++) res.push(runOnce(policy));
    const wins = res.filter(r => r.won).length;
    const avg = (k) => Math.round(res.reduce((s, r) => s + r[k], 0) / res.length);
    console.log(`\n=== ${policy.toUpperCase()} x${runs} ===`);
    console.log(`win rate ${(wins / runs * 100).toFixed(0)}% | avg days ${avg('days')} | avg forages ${avg('forages')} | avg starve-days ${avg('starveDays')}`);
    console.log(`pantry end ${avg('pantryEnd')} | max ${avg('pantryMax')} | min ${avg('pantryMin')} | codex ${avg('codex')}`);
  }
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
