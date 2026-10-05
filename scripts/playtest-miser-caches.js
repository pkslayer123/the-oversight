// Miser playtest — cache network architect (10 days).
// Bury caches at several REAL distances, live 10 days, then come back and
// dig them up. Measures: robbery by distance, spoilage underground, whether
// the player ever learns WHO robbed them, and dig-up feel at the real node.
// Usage: node scripts/playtest-miser-caches.js
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

let said = [];
const s = () => Game.state.scholar;
const HAVEN = () => ({ x: Game.state.village.px ?? 3, y: Game.state.village.py ?? 3 });
const distFromHaven = () => Math.abs(Game.map.px - HAVEN().x) + Math.abs(Game.map.py - HAVEN().y);

function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  s().water = (s().water || []).slice(0, 1);
  s().inventory = [];
}
// travel one hop to an adjacent node; returns true on success
function hopTo(x, y) {
  const r = Game.travelTo(x, y);
  return r === undefined || r === null;
}
function hopAway(n) {
  const h = HAVEN();
  for (let i = 0; i < n; i++) {
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d > bd) { bd = d; best = t; }
    }
    if (!best) break;
    if (!hopTo(best.x, best.y)) break;
  }
  return distFromHaven();
}
function goHome() {
  const h = HAVEN();
  let guard = 0;
  while ((Game.map.px !== h.x || Game.map.py !== h.y) && guard < 30) {
    guard++;
    const curD = distFromHaven();
    let best = null, bd = curD;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - h.x) + Math.abs(t.y - h.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    if (!hopTo(best.x, best.y)) break;
  }
}
function foodIdx(name) {
  return (s().inventory || []).findIndex(i => i.name === name && (i.kcalEach || 0) > 0);
}
function seedPack() {
  // deterministic hoard: fresh-ish perishable, preserved food, non-food material
  s().inventory.push({ name: 'Venison strips', kcalEach: 250, units: 8, spoilDay: s().day + 2, safe: false, kg: 0.25 });
  s().inventory.push({ name: 'Dried meat', kcalEach: 400, units: 6, spoilDay: 9999, safe: true, kg: 0.3 });
  s().inventory.push({ name: 'Stolen rations', kcalEach: 150, units: 4, spoilDay: s().day + 3, safe: true, kg: 0.2, stolen: true });
  Game.addMaterial('branch', 20);
  Game.addMaterial('stone', 6);
}

(async () => {
  await Game.init();
  freshGame();
  seedPack();

  // ---- ACT 1: build the cache network at real distances ----
  console.log('DAY 1: building the cache network');
  const network = [];
  const plans = [
    { hops: 1, food: 'Venison strips', qty: 4, spoil: true },   // perishable near haven
    { hops: 1, food: 'Stolen rations', qty: 4, spoil: true },    // stolen goods near haven
    { hops: 1, mat: 'branch', qty: 10 },                        // materials near haven
    { hops: 4, food: 'Dried meat', qty: 3, spoil: false },      // preserved, mid distance
    { hops: 7, food: 'Venison strips', qty: 4, spoil: true },   // perishable far
  ];
  for (const p of plans) {
    const d = hopAway(p.hops);
    const node = { x: Game.map.px, y: Game.map.py };
    let label = '';
    if (p.food) {
      const idx = foodIdx(p.food);
      if (idx < 0) { console.log(`  dist ${d}: no ${p.food} left, skipping`); continue; }
      const it = s().inventory[idx];
      label = `${p.qty}x ${it.name}`;
      Game.buryCache('food', idx, p.qty);
    } else {
      label = `${p.qty}x ${p.mat}`;
      Game.buryCache('material', p.mat, p.qty);
    }
    network.push({ node, dist: d, label, spoil: !!p.spoil, buriedDay: s().day });
    console.log(`  buried ${label} at (${node.x},${node.y}) dist ${d}`);
  }
  goHome();
  Game.enterBuilding();

  // ---- ACT 2: live 10 real days (forage -> home -> eat -> restock -> sleep) ----
  function forageSweep(n) {
    const d0 = s().day;
    let got = 0;
    for (let i = 0; i < n && s().day === d0 && !Game.over; i++) {
      const d = Game.genDetail(Game.map.px, Game.map.py);
      let spot = null;
      for (let y = 0; y < 9 && !spot; y++) for (let x = 0; x < 9; x++) {
        const c = d[y] && d[y][x];
        if (c === 'plant' || c === 'bush' || c === 'thicket') { spot = { x, y }; break; }
      }
      if (spot) { s().mx = Math.max(0, Math.min(8, spot.x - 1)); s().my = Math.max(0, Math.min(8, spot.y)); }
      Game.doAction('forage');
      got++;
    }
    return got;
  }
  function sleepNight() {
    const d0 = s().day;
    let guard = 0;
    while (s().day === d0 && guard < 5 && !Game.over) {
      Game.sleep();
      guard++;
      if (s().day === d0 && !Game.over) Game.doAction('rest');
    }
    return s().day !== d0;
  }
  for (let iter = 2; iter <= 11; iter++) {
    if (Game.over) break;
    Game.exitBuilding();
    forageSweep(6);
    if (Game.over) break;
    goHome();
    Game.enterBuilding();
    Game.eat();
    // restock pack with SAFE preserved food for tomorrow (skip raw beans — food reality)
    try {
      const pan = Game.state.village.pantry || [];
      let took = 0;
      for (let pi = 0; pi < 16 && took < 8 && pan.length; pi++) {
        const idx = pan.findIndex(i => (i.kcalEach || 0) > 0 && i.safe === true && (i.spoilDay ?? 9999) >= s().day + 3 && (i.units || 0) > 0);
        if (idx < 0) break;
        Game.takeFromPantry(idx);
        took++;
      }
      if (iter === 2) say(`  restocked ${took} safe pantry units`);
    } catch (e) {}
    said = [];
    const adv = sleepNight();
    const robbed = said.filter(t => /Disturbed earth\. Empty\. Someone found it\./.test(t)).length;
    const status = network.map(n => {
      const c = Game.playerCaches().find(c => Math.abs(c.node.x - n.node.x) < 0.01 && Math.abs(c.node.y - n.node.y) < 0.01);
      return c ? (c.found ? 'ROBBED' : 'ok') : 'GONE?';
    }).join(' ');
    console.log(`  day ${s().day}${adv ? '' : ' (SLEEP STALLED)'}: ${status}${robbed ? ` (${robbed} robbery lines)` : ''} kcal=${Math.round(s().kcal)} hp=${Math.round(s().health || 0)} over=${!!Game.over}`);
    // capture any gossip/journal hint about WHO
    const whoLines = said.filter(t => /cache|rob|stolen|buried|earth/i.test(t) && !/Disturbed earth\. Empty\. Someone found it\./.test(t));
    if (whoLines.length) { console.log('    !! cache-adjacent lines:'); whoLines.slice(0, 5).forEach(t => console.log('     | ' + t.slice(0, 120))); }
    if (Game.over) break;
  }
  // ---- ACT 3: what do we know about the robbers? ----
  const codexPlaces = (Game.state.codex.places || []).filter(p => /cache|buried/i.test(p.text));
  console.log('\ncodex.places cache entries:');
  codexPlaces.forEach(p => console.log(`  day ${p.day}: ${p.text.slice(0, 140)}`));
  const doubts = (Game.state.codex.doubts || []).filter(d => /cache|rob|theft|stolen/i.test(JSON.stringify(d)));
  console.log(`\nrobbery-related doubts: ${doubts.length}`);
  doubts.forEach(d => console.log(`  ${JSON.stringify(d).slice(0, 160)}`));
  const gossip = (Game.state.codex.gossip || []);
  const theftGossip = gossip.filter(g => /cache|rob|steal/i.test(JSON.stringify(g)));
  console.log(`theft-related gossip items: ${theftGossip.length}`);
  theftGossip.slice(0, 3).forEach(g => console.log('  ' + JSON.stringify(g).slice(0, 160)));

  // ---- ACT 4: go back out and dig up what survives ----
  console.log('\nACT 4: returning to dig up' + (Game.over ? ' (GAME OVER — post-mortem)' : ''));
  Game.exitBuilding();
  for (const n of network) {
    const h = HAVEN();
    // walk to the cache node greedily
    let guard = 0;
    while ((Game.map.px !== n.node.x || Game.map.py !== n.node.y) && guard < 30) {
      guard++;
      let best = null, bd = Infinity;
      for (const t of Game.travelTargets()) {
        const d = Math.abs(t.x - n.node.x) + Math.abs(t.y - n.node.y);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) { console.log('  no path target toward node'); break; }
      const rr = Game.travelTo(best.x, best.y);
      if (rr !== undefined && rr !== null) { console.log(`  walk blocked: ${JSON.stringify(rr).slice(0, 90)}`); break; }
    }
    const c = Game.playerCaches().find(c => Math.abs(c.node.x - n.node.x) < 0.01 && Math.abs(c.node.y - n.node.y) < 0.01);
    if (!c) { console.log(`  ${n.label}: cache entry gone (spent or removed)`); continue; }
    if (Game.map.px !== n.node.x || Game.map.py !== n.node.y) { console.log(`  ${n.label}: could not reach node`); continue; }
    said = [];
    try { Game.digUpCache(c.id); } catch (e) { console.log(`  ${n.label}: dig error ${e.message}`); }
    const digLines = said.filter(t => /Dug up|Disturbed|heavy/i.test(t));
    console.log(`  ${n.label} (buried d${n.buriedDay}, now d${s().day}, spoil=${n.spoil}): ${digLines.map(t => t.slice(0, 110)).join(' // ') || said[0]}`);
    if (n.spoil) {
      const found = (s().inventory || []).find(i => n.label.split(' ')[1] && i.name === n.label.split(' ')[1] + ' ' + (n.label.split(' ')[2] || ''));
    }
  }

  // ---- ACT 5: dig-up location honesty (walk away one node, try) ----
  const c0 = Game.playerCaches().find(c => !c.found);
  if (c0) {
    const t = Game.travelTargets()[0];
    if (t) { hopTo(t.x, t.y); said = []; Game.digUpCache(c0.id); console.log(`\ndig from wrong node: "${said[0] || '(silent)'}"`); }
  }

  console.log('\nFINAL: ' + JSON.stringify({
    day: s().day, caches: Game.playerCaches().length,
    robbedTotal: network.filter(n => { const c = Game.playerCaches().find(c => Math.abs(c.node.x - n.node.x) < 0.01 && Math.abs(c.node.y - n.node.y) < 0.01); return !c || c.found; }).length
  }));
})();
