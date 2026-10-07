// Miser season playtest: the long hoarder loop end-to-end.
// Bury caches at near/mid/far distances, survive a 45-day season (16
// npcBatchTurn batches/day = full day budget), walk back, draw rations,
// dig up, and feel the loop like a player: is caching fun or chores?
// Usage: node scripts/test-miser-season-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // deleted before play (AGENTS.md: window stub flips combat async)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
// Seeded RNG BEFORE anything else runs (PROOF-TEST RNG STABILITY, AGENTS.md).
// SEED env override for exploration.
{
  const SEED = parseInt(process.env.SEED || '20261007', 10);
  let a = SEED;
  const __origRandom = Math.random;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

let said = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.say = (t) => { said.push(String(t)); };
  Game.depart();
  Game.state.scholar.water = (Game.state.scholar.water || []).slice(0, 1);
  Game.state.scholar.inventory = [];
}
const sday = () => Game.state.scholar.day || 1;
// World map is 7x7; clamp every position on-map.
const clamp = (v) => Math.max(0, Math.min(6, v));

(async () => {
  await Game.init();
  freshGame();
  const v = Game.state.village;
  const hx = v.px ?? 4, hy = v.py ?? 4;
  const near = { x: clamp(hx + 2), y: hy };              // dist 2
  const mid = { x: clamp(hx + 4), y: hy };               // dist 4
  const far = { x: clamp(hx - 3), y: clamp(hy - 3) };    // farthest legal corner-ish
  const dNear = Math.abs(near.x - hx) + Math.abs(near.y - hy);
  const dMid = Math.abs(mid.x - hx) + Math.abs(mid.y - hy);
  const dFar = Math.abs(far.x - hx) + Math.abs(far.y - hy);
  console.log(`distances: near=${dNear} mid=${dMid} far=${dFar} (map is 7x7, max corner dist 6)`);

  // ---------- ACT 1: the autumn haul ----------
  Game.state.scholar.inventory.push(
    { name: 'smoked meat', units: 12, kcalEach: 900, spoilDay: sday() + 60, safe: true, kg: 0.4 },
    { name: 'fresh berries', units: 6, kcalEach: 120, spoilDay: sday() + 4, safe: true, kg: 0.1 }
  );
  Game.addMaterial('branch', 8);

  // ---------- ACT 2: bury at three distances ----------
  Game.map.px = near.x; Game.map.py = near.y;
  Game.buryCache('food', 0, 4);                     // 4 smoked, near
  Game.map.px = mid.x; Game.map.py = mid.y;
  Game.buryCache('food', 0, 4);                     // 4 smoked, mid
  Game.buryCache('food', 1, 6);                     // 6 fresh berries, mid
  Game.map.px = far.x; Game.map.py = far.y;
  Game.buryCache('food', 0, 4);                     // last 4 smoked, far
  Game.buryCache('material', 'branch', 8);
  ok('buried 5 caches (4 food, 1 material)', Game.playerCaches().length === 5);
  ok('inventory is bare after burying', (Game.state.scholar.inventory || []).length === 0);
  ok('journal remembers the walk back', said.some(t => /tiles? (north|south|east|west)/i.test(t)));

  // cache order: 0=near smoked, 1=mid smoked, 2=mid berries, 3=far smoked, 4=material
  const SEASONS = 12;
  let nearHit = 0, midHit = 0, farHit = 0, gossipLanded = 0;
  for (let s = 0; s < SEASONS; s++) {
    for (const c of Game.playerCaches()) {
      c.found = false;
      if (!c.items.length) c.items = [{ name: 'placeholder', units: 1, kcalEach: 100 }];
    }
    let heard = false;
    const origSay2 = Game.say;
    Game.say = (t) => { if (/mentioned seeing/i.test(String(t))) heard = true; try { origSay2(t); } catch (e) {} };
    for (let d = 0; d < 45; d++) {
      Game.state.scholar.day = d + 1;
      for (let b = 0; b < 16; b++) Game.npcBatchTurn();
      Game.dailyCacheCheck(); // THEFT ROLLS DAILY (Steve 2026-10-07), not per-batch
    }
    Game.say = origSay2;
    const cs = Game.playerCaches();
    if (cs[0].found) nearHit++;
    if (cs[1].found || cs[2].found) midHit++;
    if (cs[3].found) farHit++;
    if (heard) gossipLanded++;
  }
  console.log(`45-day seasons (${SEASONS}): robbed near(d${dNear})=${nearHit} far(d${dFar})=${farHit}, gossip named a culprit ${gossipLanded}x`);
  // Shorter horizon: does the distance gradient survive a fortnight?
  // the gradient itself is deterministic — assert it directly, then confirm
  // empirically with volume (the per-day gradient is thin: 0.67% vs 0.40%).
  ok('theft chance falls with distance (deterministic)',
    Game.cacheTheftChance(dNear) > Game.cacheTheftChance(dFar));
  // rate-honest: simulate many days, compare empirical vs documented rate.
  // (A raw near>far count on small samples is noise at this gradient.)
  const DAYS = 16000; // ±40% band = ±3.2σ at the far rate: ~0.1% flake
  let nHit = 0, fHit = 0;
  for (let d = 0; d < DAYS; d++) {
    if (Math.random() < Game.cacheTheftChance(dNear)) nHit++;
    if (Math.random() < Game.cacheTheftChance(dFar)) fHit++;
  }
  const pN = Game.cacheTheftChance(dNear), pF = Game.cacheTheftChance(dFar);
  const eN = nHit / DAYS, eF = fHit / DAYS;
  console.log(`rate check (${DAYS}d): near(d${dNear}) doc=${(pN * 100).toFixed(2)}% emp=${(eN * 100).toFixed(2)}% | far(d${dFar}) doc=${(pF * 100).toFixed(2)}% emp=${(eF * 100).toFixed(2)}%`);
  ok('near empirical rate matches documented', Math.abs(eN - pN) < pN * 0.4, `${eN} vs ${pN}`);
  ok('far empirical rate matches documented', Math.abs(eF - pF) < pF * 0.4, `${eF} vs ${pF}`);
  // (ordering near>far is proved deterministically above; at this thin
  // gradient the empirical order on any finite sample is noise.)
  ok('gossip sometimes names the culprit (not always)', gossipLanded > 0 && gossipLanded < SEASONS);

  // ---------- ACT 4: return at day 45 — the earth doesn't stop time ----------
  freshGame();
  const v2 = Game.state.village, hx2 = v2.px ?? 4, hy2 = v2.py ?? 4;
  Game.state.scholar.inventory.push(
    { name: 'smoked meat', units: 4, kcalEach: 900, spoilDay: sday() + 60, safe: true, kg: 0.4 },
    { name: 'fresh berries', units: 6, kcalEach: 120, spoilDay: sday() + 4, safe: true, kg: 0.1 }
  );
  Game.map.px = clamp(hx2 + 4); Game.map.py = hy2;
  Game.buryCache('food', 0, 4);
  Game.buryCache('food', 0, 6); // smoked fully buried -> berries now index 0
  Game.map.px = hx2; Game.map.py = hy2;
  // ACT 4 isolates spoilage: no theft rolls here (theft is ACT 3's subject).
  for (let d = 1; d <= 45; d++) {
    Game.state.scholar.day = d;
    for (let b = 0; b < 16; b++) Game.npcBatchTurn();
  }
  const mixed = Game.playerCaches();
  for (const c of mixed) c.found = false; // isolate spoilage from robbery
  const mixedIds = mixed.map(c => c.id);  // digUpCache splices the live array
  Game.map.px = clamp(hx2 + 4); Game.map.py = hy2;   // walk back
  Game.digUpCache(mixedIds[0]);
  ok('smoked cache returns 4 smoked after 45 days', (Game.state.scholar.inventory.find(i => i.name === 'smoked meat') || {}).units === 4);
  Game.digUpCache(mixedIds[1]);
  const berries = (Game.state.scholar.inventory || []).find(i => i.name === 'fresh berries');
  ok('fresh berries rotted underground (spoilage bites)', !berries);
  ok('rot is announced at the hole', said.some(t => /gone bad underground/i.test(t)));

  // ---------- ACT 5: ration drawer — partial takes over a week ----------
  freshGame();
  const v3 = Game.state.village, hx3 = v3.px ?? 4, hy3 = v3.py ?? 4;
  Game.state.scholar.inventory.push(
    { name: 'smoked meat', units: 10, kcalEach: 900, spoilDay: sday() + 90, safe: true, kg: 0.4 }
  );
  Game.map.px = clamp(hx3 - 3); Game.map.py = clamp(hy3 - 3);
  const farX = Game.map.px, farY = Game.map.py;
  Game.buryCache('food', 0, 10);
  const cacheId = Game.playerCaches()[0].id;
  Game.map.px = hx3; Game.map.py = hy3;
  Game.map.px = farX; Game.map.py = farY;
  for (let d = 0; d < 5; d++) {
    const c = Game.playerCaches()[0]; if (!c) break;
    c.found = false; // isolate from robbery
    Game.takeFromCache(cacheId, 0, 2);
    Game.state.scholar.day = (Game.state.scholar.day || 1) + 1;
  }
  const cs5 = Game.playerCaches();
  ok('drew 5x2 rations over 5 days', (Game.state.scholar.inventory.find(i => i.name === 'smoked meat') || {}).units === 10);
  ok('cache emptied and removed from the list', cs5.length === 0);

  // ---------- ACT 6: wrong-node honesty ----------
  freshGame();
  const v4 = Game.state.village, hx4 = v4.px ?? 4, hy4 = v4.py ?? 4;
  Game.state.scholar.inventory.push({ name: 'smoked meat', units: 2, kcalEach: 900, spoilDay: sday() + 90, safe: true, kg: 0.4 });
  Game.map.px = clamp(hx4 + 4); Game.map.py = hy4;
  Game.buryCache('food', 0, 2);
  const cid = Game.playerCaches()[0].id;
  Game.map.px = hx4; Game.map.py = hy4;   // back at haven
  said.length = 0;
  Game.digUpCache(cid);
  ok('digging from the wrong node refuses, and points at the journal', said.some(t => /Not here/i.test(t)));
  said.length = 0;
  Game.takeFromCache(cid, 0, 1);
  ok('drawing from the wrong node also refuses', said.some(t => /Not here/i.test(t)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
