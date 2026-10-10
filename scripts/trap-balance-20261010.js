#!/usr/bin/env node
// BALANCE MEASUREMENT (2026-10-10): per-method 30-day net edible-kcal EV.
// Drives the REAL engine (setTrap/craft/checkTraps/checkNets/doAction,
// cleanCarcass, cookFood) with seeded RNG. Daily processing (a competent
// player cleans/cooks the same day — carcasses rot in 2 days).
// Run: SEED=N node scripts/trap-balance-20261010.js   (from repo root)
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);

function tile(Game, x, y) { return Game.map.tiles[y][x]; }
function gotoTile(Game, x, y) {
  Game.map.px = x; Game.map.py = y;
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
}

async function fresh(light) {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const errs = [];
  Game.say = () => {}; Game.sysSay = () => {};
  const s = Game.state.scholar;
  if (!Game.hasCuttingTool()) s.inventory.push({ name: 'stone knife', recipeId: 'stone_knife', units: 1, kg: 0.3 });
  try { Game.learnTechnique('clean', 'trial'); } catch (e) { errs.push('clean:' + e.message); }
  try { Game.learnTechnique('cook', 'trial'); } catch (e) { errs.push('cook:' + e.message); }
  if (!light) {
    const mat = (material, units, name) => s.inventory.push({ material, units, name, kcalEach: 0, spoilDay: 99999, kg: 0.05 });
    mat('stick', 999, 'Stick'); mat('vine', 999, 'Vine'); mat('branch', 999, 'Branch');
    s.inventory.push({ name: 'Acorns', kcalEach: 60, units: 999, foodKind: 'plant', edible: true, spoilDay: 99999, kg: 0.01 });
  }
  for (const r of ['pit_trap', 'snare', 'spring_snare', 'box_trap', 'minnow_trap'])
    try { Game.grantKnowledge('recipe', r, 3, { type: 'test' }); } catch (e) { errs.push('recipe:' + e.message); }
  let ticks = 0;
  Game.tickAction = (n) => { ticks += Math.max(0, Math.round(n || 0)); return undefined; };
  Game.__ticks = () => ticks;
  Game.__dmg = 0;
  if (errs.length) console.log('  setup warnings: ' + errs.join(' | '));
  return Game;
}

// clean + cook everything edible-meat currently in inventory; returns kcal added
function processDay(Game) {
  const s = Game.state.scholar;
  try { Game.cleanCarcass(); } catch (e) { console.log('  cleanCarcass threw: ' + e.message); }
  for (let guard = 0; guard < 200; guard++) {
    const idx = (s.inventory || []).findIndex(it =>
      it && !it._tbCooked && it.foodKind === 'meat' &&
      (it.foodState === 'cleaned' || it.foodState === 'raw') && (it.kcalEach || 0) > 0);
    if (idx < 0) break;
    s.inventory[idx]._tbCooked = true;
    try { Game.cookFood(idx); } catch (e) { console.log('  cookFood threw: ' + e.message); break; }
  }
}

function netMeatKcal(Game) {
  let net = 0;
  for (const it of (Game.state.scholar.inventory || []))
    if (it.edible && (it.kcalEach || 0) > 0 && (it.foodKind === 'meat' || it.foodKind === 'plant' || it.foodKind === 'fish'))
      net += (it.kcalEach || 0) * (it.units || 1);
  return Math.round(net);
}

// generic passive-trap method runner (pit_trap / snare / spring_snare)
async function runTrapMethod({ recipeId, tileType, wildlife, label }) {
  const Game = await fresh();
  const s = Game.state.scholar;
  const TX = 2, TY = 2;
  gotoTile(Game, TX, TY);
  const t = tile(Game, TX, TY);
  t.type = tileType; t.wildlife = Object.assign({}, wildlife); t.traps = []; t.nets = [];
  let catches = 0, sets = 0, gross = 0, falls = 0, boars = 0;
  const k0 = netMeatKcal(Game);
  for (let d = 1; d <= 30; d++) {
    s.day = d;
    const has = (t.traps || []).some(x => x.recipeId === recipeId);
    if (!has) {
      if (recipeId === 'pit_trap' && sets > 0) {
        // walk back onto the tile to re-dig: emulated entry, engine's own rolls
        if (Math.random() < 0.5) {
          const dmg = 15 + Math.floor(Math.random() * 11);
          s.health = Math.max(1, (s.health || 100) - dmg);
          Game.__dmg += dmg; falls++;
        }
      }
      gotoTile(Game, TX, TY);
      Game.craft(recipeId);
      Game.setTrap(recipeId);
      sets++;
    }
    Game.simEcology();
    const cb = (s.inventory || []).length;
    Game.checkTraps();
    for (const it of (s.inventory || []).slice(cb)) {
      if (it.foodKind === 'meat' && it.foodState === 'carcass') {
        gross += it.hiddenKcal || 0; catches++;
        if ((it.plantId || '').includes('boar')) boars++;
      }
    }
    processDay(Game);
  }
  const net = netMeatKcal(Game) - k0;
  return { label, catches, sets, grossKcal: Math.round(gross), netKcal: net, ticks: Game.__ticks(), dmg: Game.__dmg, falls, boars };
}

async function main() {
  const rows = [];
  rows.push(await runTrapMethod({
    recipeId: 'pit_trap', tileType: 'forest', label: 'pit_trap',
    wildlife: { white_tailed_deer: 6, wild_boar: 2 },
  }));
  rows.push(await runTrapMethod({
    recipeId: 'snare', tileType: 'meadow', label: 'snare',
    wildlife: { cottontail_rabbit: 6, gray_squirrel: 4 },
  }));
  rows.push(await runTrapMethod({
    recipeId: 'spring_snare', tileType: 'meadow', label: 'spring_snare',
    wildlife: { wild_turkey: 4, cottontail_rabbit: 4 },
  }));
  // gill net — passive fishing
  {
    const Game = await fresh();
    const s = Game.state.scholar;
    const TX = 3, TY = 3;
    gotoTile(Game, TX, TY);
    const t = tile(Game, TX, TY);
    t.type = 'creek'; t.wildlife = { creek_chub: 6, bluegill: 6 }; t.traps = []; t.nets = [];
    let catches = 0, sets = 0, gross = 0;
    const k0 = netMeatKcal(Game);
    for (let d = 1; d <= 30; d++) {
      s.day = d;
      if (!(t.nets || []).length) {
        s.inventory.push({ name: 'Gill net', itemId: 'gill_net', units: 1, kg: 0.5 });
        gotoTile(Game, TX, TY);
        Game.setNet(); sets++;
      }
      Game.simEcology();
      const cb = (s.inventory || []).length;
      Game.checkNets();
      for (const it of (s.inventory || []).slice(cb))
        if (it.foodKind === 'meat' && it.foodState === 'carcass') { gross += it.hiddenKcal || 0; catches++; }
      processDay(Game);
    }
    rows.push({ label: 'gill_net', catches, sets, grossKcal: Math.round(gross), netKcal: netMeatKcal(Game) - k0, ticks: Game.__ticks(), dmg: 0, falls: 0, boars: 0 });
  }
  // forage — active, 10-tile berry rotation, 2 sweeps/day (rotation lets patches
  // regrow; inventory cleared daily = eaten — a real player eats ~2,200/day).
  // NOTE: light inventory (no 999-stack materials) so the pack isn't pre-full.
  {
    const Game = await fresh(true);
    const s = Game.state.scholar;
    try {
      Game.grantKnowledge('plant', 'blackberry', 4, { type: 'test' });
      Game.grantKnowledge('plant', 'muscadine', 4, { type: 'test' });
    } catch (e) { console.log('  berry knowledge failed: ' + e.message); }
    const tiles = [];
    for (let i = 0; i < 10; i++) {
      const x = i % 9, y = Math.floor(i / 9);
      tiles.push([x, y]);
      const t = tile(Game, x, y);
      t.type = 'grove'; t.stock = 99; t.detailRegrow = {}; t.foragePressure = 0;
      t.detail = [];
      for (let yy = 0; yy < 9; yy++) { t.detail[yy] = []; for (let xx = 0; xx < 9; xx++) t.detail[yy][xx] = 'bush'; }
    }
    let sweeps = 0, eaten = 0;
    for (let d = 1; d <= 30; d++) {
      s.day = d;
      for (let k = 0; k < 2; k++) {
        const [x, y] = tiles[(d * 2 + k) % 10];
        gotoTile(Game, x, y);
        try { Game.doAction('forage', {}); } catch (e) { console.log('  forage threw: ' + e.message); }
        sweeps++;
      }
      // eat the day's gather (clear edibles, count as net)
      for (const it of (s.inventory || []))
        if (it.edible && (it.kcalEach || 0) > 0 && (it.foodKind === 'plant' || it.foodKind === 'meat' || it.foodKind === 'fish'))
          eaten += (it.kcalEach || 0) * (it.units || 1);
      s.inventory = (s.inventory || []).filter(it => !(it.edible && (it.kcalEach || 0) > 0));
    }
    rows.push({ label: 'forage_2xday', catches: sweeps, sets: sweeps, grossKcal: Math.round(eaten), netKcal: Math.round(eaten), ticks: Game.__ticks(), dmg: 0, falls: 0, boars: 0 });
  }

  console.log('SEED ' + SEED + ' — 30-day net EV per method (real engine paths, daily processing)');
  console.log('method        catches  sets  gross_kcal  net_kcal  ticks   kcal/tick  net/day  dmg');
  for (const r of rows) {
    const kpt = r.ticks ? (r.netKcal / r.ticks).toFixed(1) : 'n/a';
    console.log(
      r.label.padEnd(14) + String(r.catches).padStart(7) + String(r.sets).padStart(6) +
      String(r.grossKcal).padStart(12) + String(r.netKcal).padStart(10) + String(r.ticks).padStart(7) +
      String(kpt).padStart(11) + String(Math.round(r.netKcal / 30)).padStart(9) + String(r.dmg).padStart(6) +
      (r.boars ? `  (boars:${r.boars} falls:${r.falls})` : ''));
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
