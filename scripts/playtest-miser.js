// Miser playtest: a full week of hoarding as a player.
// The miser fantasy: skim the pantry, bury far caches, drain the stash,
// steal rations — and wake up richer than everyone while the village
// watches. Judges: is hoarding worth it (kcal in vs time in, spoilage)?
// Does the theft → notice → confrontation → justice chain feel legible
// and scary? Is burying far worth the walk? What does the robbed-cache
// gut-punch feel like?
// Usage: node scripts/playtest-miser.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
const ME = () => s().villagerId;
const log = [];
const say = (m) => log.push(m);
const drainSay = () => {
  const lines = Game.log.splice(0, Game.log.length);
  for (const l of lines.slice(-10)) log.push(`  [game] ${l.slice(0, 180)}`);
};
const packKcal = () => (s().inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
const cacheKcal = () => Game.playerCaches().reduce((t, c) =>
  t + (c.items || []).reduce((t2, i) => t2 + (i.kcalEach || 0) * (i.units || 1), 0), 0);
const pantryKcal = () => (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
const trustOf = (vid) => Math.round(((Game.state.village.trust || {})[vid || ME()]) || 0);
const takesGives = () => {
  const v = Game.state.village;
  const stashTakes = Object.values((v.stashTakes || {})[ME()] || {}).reduce((t, x) => t + (x || 0), 0);
  return `takes=${Math.round((v.takes || {})[ME()] || 0)} gives=${Math.round((v.gives || {})[ME()] || 0)} stashTakes=${stashTakes}`;
};
const snap = () => `kcal=${Math.round(s().kcal)} pack=${packKcal()}kcal pantry=${pantryKcal()}kcal caches=${Game.playerCaches().length}(${cacheKcal()}kcal) trust=${trustOf()} heat=${Game.justiceHeat()} stage=${Game.justiceState().stage}`;
const HAVEN = () => ({ x: Game.state.village.px ?? 3, y: Game.state.village.py ?? 3 });
const distFromHaven = () => Math.abs(Game.map.px - HAVEN().x) + Math.abs(Game.map.py - HAVEN().y);

function bestForageTile() {
  let best = null, bv = -1;
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven') continue;
    const vv = (tile.stock || 0) / (t.d + 1) + (tile.type === 'forest' ? 2 : 0) + (tile.type === 'field' ? 2 : 0) + (tile.type === 'meadow' ? 1 : 0);
    if (vv > bv) { bv = vv; best = t; }
  }
  return best;
}
// hopAway: walk n hops away from haven, always increasing node distance.
// Returns final distance. Logs blockages instead of silently failing.
function hopAway(n) {
  const h = HAVEN();
  for (let i = 0; i < n; i++) {
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d > bd) { bd = d; best = t; }
    }
    if (!best) { say(`  no farther hop (dist ${curD})`); break; }
    const r = Game.travelTo(best.x, best.y);
    if (r !== undefined && r !== null) { say(`  hop blocked: ${JSON.stringify(r).slice(0, 100)}`); break; }
  }
  return distFromHaven();
}
function goHome() {
  // continuous travel: haven may be several hops away — walk it node by node
  const h = HAVEN();
  let guard = 0;
  while ((Game.map.px !== h.x || Game.map.py !== h.y) && guard < 20) {
    guard++;
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    const r = Game.travelTo(best.x, best.y);
    if (r !== undefined && r !== null) { say(`  travel home blocked: ${JSON.stringify(r).slice(0, 80)}`); break; }
  }
  if (Game.map.px !== h.x || Game.map.py !== h.y) say(`  WARNING: not home (at ${Game.map.px},${Game.map.py})`);
  Game.enterBuilding(); // the stash and pantry live inside the hall
}
// walk the player adjacent to a forageable cell, then forage from there
function findCell(want) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const c = d[y] && d[y][x];
    if (want.indexOf(c) !== -1) return { cx: x, cy: y, cell: c };
  }
  return null;
}
function moveNear(cx, cy) {
  s().mx = Math.max(0, Math.min(8, cx + (cx > 4 ? -1 : 1)));
  s().my = Math.max(0, Math.min(8, cy > 4 ? cy - 1 : cy + 1));
}
function forageFew(n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const d0 = s().day;
    const spot = findCell(['plant', 'bush', 'tree', 'bigtree']);
    if (spot) moveNear(spot.cx, spot.cy);
    Game.doAction('forage');
    got++;
    if (s().day !== d0) break;
    if (Game.state.over) break;
  }
  return got;
}
// bury everything kcal-bearing except 1 unit of each stack (trail rations)
function buryFood() {
  const buried = [];
  for (let i = (s().inventory || []).length - 1; i >= 0; i--) {
    const it = s().inventory[i];
    if ((it.kcalEach || 0) > 0 && (it.units || 1) >= 2 && !it.stolen) {
      const idx = s().inventory.indexOf(it);
      const n = (it.units || 1) - 1;
      Game.buryCache('food', idx, n);
      buried.push(`${n}x ${it.name}`);
      if (Game.state.over) break;
    }
  }
  return buried;
}
function sleepNight(tag) {
  const hp0 = Math.round(s().health), d0 = s().day;
  let guard = 0;
  while (s().day === d0 && guard < 4 && !Game.state.over) {
    Game.sleep();
    guard++;
    if (s().day === d0 && !Game.state.over) Game.doAction('rest');
  }
  const adv = s().day !== d0;
  Game.log.length = 0;
  say(`${tag}: day ${d0} -> ${s().day}${adv ? '' : ' (SLEEP DID NOT ADVANCE)'}, hp ${hp0} -> ${Math.round(s().health)}, ${snap()}`);
}
function eatLight() {
  // miser eats when hungry, but only one meal at a time — the rest is hoarded
  if (Math.round(s().kcal) > 900) return 0;
  const k0 = Math.round(s().kcal);
  Game.eat();
  return Math.round(s().kcal) - k0;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;
  Game.state.scholar.water = (Game.state.scholar.water || []).slice(0, 2);
  say(`MISER WEEK — haven at (${HAVEN().x},${HAVEN().y}). Opening: ${snap()}`);

  // ===== DAY 1: forage hard, eat light, bury FAR =====
  say(`\nD1 MORNING ${snap()}`);
  let t = bestForageTile();
  if (t) { const r = Game.travelTo(t.x, t.y); if (r) say(`  travel blocked: ${JSON.stringify(r).slice(0, 80)}`); }
  const g1 = forageFew(4);
  const e1 = eatLight();
  say(`foraged ${g1}x on ${Game.playerTile().type}, ate +${e1} kcal. ${snap()}`);
  drainSay();
  const d1 = hopAway(6);
  say(`walked out ${d1} tiles from haven to ${Game.playerTile().type}`);
  const b1 = buryFood();
  say(`buried far cache #1: ${b1.join('; ') || 'nothing worth burying'}`);
  drainSay();
  goHome();
  // cover story: donate a little to the stash so the ledger shows a giver
  Game.addMaterial('branch', 4);
  Game.donateMaterial('branch', 2);
  say(`cover story: donated 2 branches. ledger: ${Game.stashLedgerText(2).replace(/\n/g, ' | ')}`);
  sleepNight('D1 END');

  // ===== DAY 2: forage, bury far #2, skim the pantry =====
  say(`\nD2 MORNING ${snap()}`);
  Game.exitBuilding();
  t = bestForageTile();
  if (t) Game.travelTo(t.x, t.y);
  const g2 = forageFew(4);
  const e2 = eatLight();
  const d2 = hopAway(6);
  const b2 = buryFood();
  say(`foraged ${g2}x ate +${e2}, walked ${d2} out, buried far cache #2: ${b2.join('; ') || 'nothing'}`);
  drainSay();
  goHome();
  // THE SKIM: pack a big load from the pantry (running total feeds theftConfrontation at 4000)
  const pk0 = pantryKcal();
  const pantry = Game.state.village.pantry || [];
  const sels = {};
  for (let i = 0; i < pantry.length; i++) sels[i] = Math.min(pantry[i].units || 0, 12);
  if (Object.keys(sels).length) Game.takeFromPantryBulk(sels);
  say(`pantry skim: ${pk0} -> ${pantryKcal()} kcal in pantry. ${takesGives()}`);
  drainSay();
  sleepNight('D2 END');

  // ===== DAY 3: donate-then-take-back exploit probe + pickpocket =====
  say(`\nD3 MORNING ${snap()}`);
  // exploit probe: donate food, then take it back — the game should notice
  const inv = s().inventory || [];
  const fi = inv.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0);
  if (fi >= 0) {
    const nm = inv[fi].name;
    Game.donateToPantry(fi);
    const gi = (Game.state.village.pantry || []).findIndex(i => i.name === nm);
    const trB = trustOf();
    if (gi >= 0) Game.takeFromPantry(gi);
    say(`donate-then-take-back '${nm}': trust ${trB} -> ${trustOf()}`);
  } else say('no food to donate — exploit probe skipped');
  drainSay();
  // THE THEFT: lift rations from a villager
  Game.exitBuilding();
  const victim = Game.state.village.roster.find(id => id !== ME());
  Game.state.village.pack = Game.state.village.pack || {};
  Game.packKcal(victim);
  Game.state.village.pack[victim].kcal = 1200;
  let r, tries = 0;
  do { r = Game.stealFrom(victim); tries++; } while (r !== 'caught' && r !== 'unseen' && tries < 5);
  say(`lifted rations: result=${r} (tries=${tries}). pack now ${packKcal()}kcal.`);
  drainSay();
  Game.theftNoticeSweep();
  say(`notice sweep done. ${snap()}`);
  drainSay();
  goHome();
  sleepNight('D3 END');

  // ===== DAY 4: fallout — gossip batches, justice tick, second theft in a new day-part =====
  say(`\nD4 MORNING ${snap()}`);
  say(`justice: stage=${Game.justiceState().stage} heat=${Game.justiceHeat()} cold=${Game.justiceCold()}`);
  for (let b = 0; b < 8; b++) Game.npcBatchTurn();
  drainSay();
  say(`after gossip: trust=${trustOf()} heat=${Game.justiceHeat()} stage=${Game.justiceState().stage}`);
  Game.exitBuilding();
  // second theft, new day = new crime (dedupe is per day-part)
  Game.state.village.pack[victim].kcal = 1200;
  tries = 0;
  do { r = Game.stealFrom(victim); tries++; } while (r !== 'caught' && r !== 'unseen' && tries < 5);
  say(`second lift: result=${r}.`);
  Game.theftNoticeSweep();
  for (let b = 0; b < 8; b++) Game.npcBatchTurn();
  drainSay();
  say(`after 2nd theft: trust=${trustOf()} heat=${Game.justiceHeat()} stage=${Game.justiceState().stage} cold=${Game.justiceCold()}`);
  const e4 = eatLight();
  say(`ate +${e4} kcal. ${snap()}`);
  goHome();
  sleepNight('D4 END');

  // ===== DAY 5: dig up far cache #1 — the payoff. Spoilage check. =====
  say(`\nD5 MORNING ${snap()}`);
  const e5 = eatLight();
  if (e5) say(`ate +${e5} kcal.`);
  const far1 = Game.playerCaches().filter(c => !c.found)
    .sort((a, b) => (Math.abs(b.node.x - HAVEN().x) + Math.abs(b.node.y - HAVEN().y)) - (Math.abs(a.node.x - HAVEN().x) + Math.abs(a.node.y - HAVEN().y)))[0];
  if (far1) {
    Game.exitBuilding();
    // walk back out to the cache node, hop by hop
    let guard = 0;
    while ((Game.map.px !== far1.node.x || Game.map.py !== far1.node.y) && guard < 20) {
      guard++;
      const curD = Math.abs(Game.map.px - far1.node.x) + Math.abs(Game.map.py - far1.node.y);
      let best = null, bd = curD;
      for (const t of Game.travelTargets()) {
        const d = Math.abs(t.x - far1.node.x) + Math.abs(t.y - far1.node.y);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) break;
      const rr = Game.travelTo(best.x, best.y);
      if (rr !== undefined && rr !== null) { say(`  blocked on the way back: ${JSON.stringify(rr).slice(0, 80)}`); break; }
    }
    const dd = distFromHaven();
    say(`returned to farthest cache (${dd} tiles out), buried day ${far1.day}, now day ${s().day}`);
    const before = packKcal();
    Game.digUpCache(far1.id);
    say(`dug up '${far1.label}': pack ${before} -> ${packKcal()} kcal. caches left: ${Game.playerCaches().length}`);
    drainSay();
  } else say('no intact cache left to dig up');
  goHome();
  sleepNight('D5 END');

  // ===== DAY 6: final accounting =====
  say(`\nD6 MORNING ${snap()}`);
  say(`ledger:\n${Game.stashLedgerText(8)}`);
  say(`caches remaining: ${Game.playerCaches().map(c => `${c.label} @(${c.node.x},${c.node.y}) found=${c.found}`).join(' | ') || 'none'}`);
  say(`${takesGives()}`);
  say(`FINAL: day=${s().day} ${snap()} exiled=${!!Game.justiceState().exiled}`);

  console.log(log.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'playtests', '2026-10-05-miser-week.md'),
    ['# 2026-10-05 miser week (playtest loop)', '',
     'Six days as a hoarder: forage hard, eat light, bury far, skim the pantry, steal twice, watch the fallout.', '',
     '```', log.join('\n'), '```', ''].join('\n'));
  console.log('\n(wrote playtests/2026-10-05-miser-week.md)');
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
