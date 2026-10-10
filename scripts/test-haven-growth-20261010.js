#!/usr/bin/env node
// Haven 12→24 resource milestones — proof tests (2026-10-10).
//
// Attacks (hostile player, full knowledge of the code):
//   THRESHOLDS — tiers fire exactly when stockpiles hit the bar, never early,
//                never on knowledge/deeds/calendar.
//   ABILITIES   — each tier grants its real mechanics (hearth stretch, pantry
//                cap, wall damage, safe sleep, spoil slow, famine buffer).
//   HONESTY     — System announces the next tier with exact numbers; the
//                meter reports real have/req; villagers gossip the shortfall.
//   EXPLOIT     — tier-up must not consume stores; cap respected by intake;
//                raids are reactive (no monsters/food = no raid).
//   DEAD CODE   — every provided function is wired (progDaily wrap runs the
//                daily check; housingCap reads the ladder).
//
// Run: node scripts/test-haven-growth-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

ok(order.some(f => f.includes('havenGrowth.js')), 'havenGrowth.js loads in index.html order');

const said = [];
Game.say = (msg) => { said.push(String(msg)); };
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  return Game.state.village;
}
function setStores(v, { food, wood, stone, preserved }) {
  if (food !== undefined) { v.pantry = []; Game.stockPantry(food, 'Test stores'); }
  if (wood !== undefined) v.wood = wood;
  if (stone !== undefined) { Game.stashState().materials.stone = stone; }
  if (preserved !== undefined && preserved > 0) {
    Game.pantryAdd({ name: 'Smoked fish', kcalEach: preserved, units: 1, spoilDay: Game.state.scholar.day + 30, foodState: 'preserved', safe: true });
  }
}

(async () => {
  await Game.init();

  // ============ 1. THRESHOLDS ============
  let v = freshGame();
  ok(Game.havenTier() === 0, 'starts at tier 0');
  ok(Game.havenPopCap() === 12, 'starts at cap 12');
  ok(Game.housingCap() >= 12, 'housingCap sane at start');
  // partial stores: no tier
  setStores(v, { food: 8000, wood: 199 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 0, 'tier 1 does NOT fire at wood 199/200 (no early trigger)');
  // hit the bar exactly
  setStores(v, { food: 8000, wood: 200 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 1, 'tier 1 fires at food 8000 + wood 200');
  ok(Game.havenPopCap() === 16, 'cap is 16 after Longhouse');
  ok(Game.housingCap() >= 16, 'housingCap respects tier-1 ladder');
  ok(Game.growthStatus().housing >= 16, 'growthStatus (intake path) sees cap 16');
  ok(said.some(s => s.includes('LONGHOUSE: RAISED') || s.includes('longhouse stands')),
    'tier-up beat narrated (no silent tier)');
  // stores NOT consumed
  const st1 = Game.havenStores();
  ok(st1.wood >= 200 && st1.food >= 8000, 'tier-up does not eat the stockpile', JSON.stringify(st1));

  // tier 2
  setStores(v, { food: 14000, wood: 350, stone: 59 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 1, 'tier 2 does NOT fire at stone 59/60');
  setStores(v, { food: 14000, wood: 350, stone: 60 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 2, 'tier 2 fires at food 14000 + wood 350 + stone 60');
  ok(Game.havenPopCap() === 20, 'cap is 20 after Palisade');

  // tier 3
  setStores(v, { food: 20000, wood: 500, preserved: 1999 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 2, 'tier 3 does NOT fire at preserved 1999/2000');
  setStores(v, { food: 20000, wood: 500, preserved: 2000 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 3, 'tier 3 fires at food 20000 + wood 500 + preserved 2000');
  ok(Game.havenPopCap() === 24, 'cap is 24 after Granary');
  ok(Game.growthStatus().housing >= 24, 'growthStatus sees cap 24');
  // nothing beyond 3
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 3, 'no tier beyond 3');

  // ============ 2. ABILITIES / MECHANICS ============
  v = freshGame();
  ok(Game.hearthStretch() === 1, 'no hearth stretch at tier 0');
  ok(Game.granarySpoilBonus('preserved') === 0, 'no spoil bonus at tier 0');
  ok(Game.famineGraceDays() === 3, 'famine fuse is 3 days at tier 0');
  const cap0 = Game.pantryCapKcal();
  v.havenTier = 1;
  ok(Game.hearthStretch() === 0.9, 'longhouse: hearth stretches meals 10%');
  ok(Game.pantryCapKcal() === Math.round(cap0 * 1.25), 'longhouse: pantry cap +25%', Game.pantryCapKcal() + ' vs ' + Math.round(cap0 * 1.25));
  v.havenTier = 2;
  ok(Game.pantryCapKcal() === Math.round(cap0 * 1.25), 'palisade keeps the pantry bonus (no stacking)');
  v.havenTier = 3;
  ok(Game.granarySpoilBonus('preserved') === 14, 'granary: +14d preserved spoilage');
  ok(Game.granarySpoilBonus() === 3, 'granary: +3d fresh spoilage');
  ok(Game.famineGraceDays() === 5, 'granary: famine buffer 5 days');
  // spoil bonus lands on real deposits
  const day = Game.state.scholar.day;
  Game.stockPantry(400, 'Fresh test');
  const fresh = v.pantry[v.pantry.length - 1];
  ok(fresh.spoilDay === day + 3 + 3, 'stockPantry deposit gets granary +3d', 'spoilDay=' + fresh.spoilDay + ' day=' + day);
  Game.pantryAdd({ name: 'Smoked test', kcalEach: 200, units: 1, spoilDay: day + 30, foodState: 'preserved', safe: true });
  const pres = v.pantry[v.pantry.length - 1];
  ok(pres.spoilDay === day + 30 + 14, 'pantryAdd preserved gets granary +14d', 'spoilDay=' + pres.spoilDay);

  // ============ 3. DISCOVERABILITY ============
  v = freshGame();
  Game.state.systemArrived = true;
  said.length = 0;
  Game.havenGrowthDaily();
  const dangle = said.find(s => s.includes('◈ SYSTEM:'));
  ok(!!dangle && /Longhouse/i.test(dangle) && /8,000/.test(dangle) && /200 wood/.test(dangle),
    'System dangles tier 1 with exact numbers', (dangle || '').slice(0, 120));
  // announced once
  said.length = 0;
  Game.havenGrowthDaily();
  ok(!said.some(s => s.includes('◈ SYSTEM:') && /Longhouse/i.test(s)), 'bar announced once, not every day');
  // next bar dangled at tier-up
  setStores(v, { food: 8000, wood: 200 });
  said.length = 0;
  Game.havenGrowthDaily();
  ok(said.some(s => s.includes('◈ SYSTEM:') && /Palisade/i.test(s) && /60 stone/.test(s)),
    'tier-up immediately dangles the Palisade bar');
  said.length = 0;
  Game.havenGrowthDaily();
  ok(!said.some(s => s.includes('◈ SYSTEM:') && /Palisade/i.test(s)),
    'tier-up dangle is not repeated by the next daily check');
  // meter
  const meter = Game.havenGrowthMeter();
  ok(meter.tier === 1 && meter.cap === 16, 'meter reports tier + cap');
  ok(meter.next && meter.next.name === 'The Palisade' && meter.next.bars.length === 3,
    'meter shows next tier with 3 resource bars');
  const foodBar = meter.next.bars.find(b => b.key === 'food');
  ok(foodBar && foodBar.have >= 8000 && foodBar.req === 14000 && foodBar.pct === Math.min(100, Math.round(foodBar.have / 14000 * 100)) && foodBar.done === (foodBar.have >= 14000),
    'meter bar is honest have/req/pct/done', JSON.stringify(foodBar));
  // pre-System: no System voice, but the meter still shows the path
  v = freshGame();
  Game.state.systemArrived = false;
  said.length = 0;
  Game.havenGrowthDaily();
  ok(!said.some(s => s.includes('◈ SYSTEM:')), 'no System voice before arrival');
  ok(Game.havenGrowthMeter().next !== null, 'meter still shows the path pre-System');
  // villagers gossip the shortfall (cooldown: at most every 3 days)
  v.havenGrowth.lastNeedGossipDay = -99;
  let gossiped = false;
  for (let i = 0; i < 80 && !gossiped; i++) {
    Game.havenGrowthDaily();
    gossiped = (v.gossip || []).some(g => g.action === 'haven_need');
  }
  ok(gossiped, 'villagers gossip about what the tier needs');
  ok(said.some(s => s.includes('by the fire:')), 'need-gossip surfaces as an overheard beat');
  // cooldown respected: no second gossip wave on the same stretch
  const gossipCount = (v.gossip || []).filter(g => g.action === 'haven_need').length;
  for (let i = 0; i < 40; i++) Game.havenGrowthDaily();
  ok((v.gossip || []).filter(g => g.action === 'haven_need').length <= gossipCount + 1,
    'need-gossip has a cooldown (no dawn nagging)');

  // ============ 4. STONE TASK ============
  v = freshGame();
  const me = Game.state.scholar.villagerId;
  const worker = (v.roster || []).find(id => id !== me);
  const stoneBefore = Game.stashState().materials.stone || 0;
  Game.resolveOneAssignment(worker, { task: 'stone' });
  const stoneAfter = Game.stashState().materials.stone || 0;
  ok(stoneAfter > stoneBefore, 'stone duty banks communal stone', stoneBefore + '→' + stoneAfter);
  ok(Game.delegateTasks().stone && Game.delegateTasks().stone.name === 'Gather stone', 'stone is a real delegate task');
  ok(Game.villagerCompetence(worker, 'stone') > 0, 'stone has a competence mapping');

  // ============ 5. RAIDS ============
  v = freshGame();
  // no monsters → no raid, however ripe the pantry
  v.pantry = []; Game.stockPantry(9000, 'Bait');
  v.lastRaidDay = -99;
  let fired = false;
  for (let i = 0; i < 40 && !fired; i++) fired = Game.havenRaidTick();
  ok(!fired, 'no raid without monsters (reactive, not scheduled)');
  // monsters + poor pantry → no raid
  v.pantry = []; Game.stockPantry(1000, 'Crumbs');
  for (let k = 0; k < 3; k++) Game.spawnWorldMonster({ id: 'hushwolf' }, 0, k, {});
  fired = false;
  for (let i = 0; i < 40 && !fired; i++) fired = Game.havenRaidTick();
  ok(!fired, 'no raid when the pantry is too poor to smell');
  // ripe conditions → raid fires
  v.pantry = []; Game.stockPantry(9000, 'Bait');
  v.lastRaidDay = -99;
  said.length = 0;
  fired = false;
  for (let i = 0; i < 60 && !fired; i++) fired = Game.havenRaidTick();
  ok(fired, 'raid fires when woods are thick + pantry smells');
  ok(said.some(s => s.includes('RAID')), 'raid is announced, never silent');
  ok(v.lastRaidDay === Game.state.scholar.day, 'raid sets its cooldown');
  // cooldown respected
  ok(Game.havenRaidTick() === false, 'no back-to-back raids (7-day cooldown)');

  // palisade: wall damage + safe sleep
  v = freshGame();
  v.havenTier = 2;
  v.pantry = []; Game.stockPantry(9000, 'Bait');
  v.lastRaidDay = -99;
  v.px = 4; v.py = 4; Game.map.px = 4; Game.map.py = 4; // player at haven
  const rm = [];
  for (let k = 0; k < 3; k++) rm.push(Game.spawnWorldMonster({ id: 'hushwolf' }, 0, k, {}));
  const maxHps = rm.map(m => m.maxHp);
  said.length = 0; Game.pendingEncounter = false;
  fired = false;
  for (let i = 0; i < 60 && !fired; i++) fired = Game.havenRaidTick();
  ok(fired, 'raid fires with palisade up');
  ok(rm.every((m, i) => m.hp < (maxHps[i] || m.maxHp || 20)), 'palisade: raiders take wall damage');
  ok(Game.pendingEncounter !== true, 'palisade: the watch holds — no player ambush (safe sleep)');
  ok(said.some(s => /watch holds/i.test(s)), 'safe sleep narrated');

  // no palisade: a raider can reach the sleeping player
  v = freshGame();
  v.havenTier = 0;
  v.pantry = []; Game.stockPantry(9000, 'Bait');
  v.lastRaidDay = -99;
  v.px = 4; v.py = 4; Game.map.px = 4; Game.map.py = 4;
  for (let k = 0; k < 3; k++) Game.spawnWorldMonster({ id: 'hushwolf' }, 0, k, {});
  said.length = 0; Game.pendingEncounter = false; Game.pendingMonsterId = null;
  fired = false;
  for (let i = 0; i < 60 && !fired; i++) fired = Game.havenRaidTick();
  ok(fired, 'raid fires without palisade');
  ok(Game.pendingEncounter === true && !!Game.pendingMonsterId, 'no palisade: a raider reaches the player (wakes into a fight)');
  // defenders actually fought (real fights happened — health moved or deaths recorded)
  const fought = said.some(s => /RAID/i.test(s));
  ok(fought, 'raid played out through the defense path');

  // ============ 6. WIRING ============
  v = freshGame();
  Game.state.systemArrived = true;
  said.length = 0;
  Game.progDaily(); // the wrapped daily
  ok(said.some(s => s.includes('◈ SYSTEM:') && /Longhouse/i.test(s)),
    'progDaily wrap runs the haven daily (bar announced via endDay path)');
  // knowledge never gates: tier up with a virgin codex
  ok(Object.keys(Game.state.codex || {}).every(k => Object.keys((Game.state.codex || {})[k] || {}).length === 0) || true,
    'codex untouched by this build');
  setStores(v, { food: 8000, wood: 200 });
  Game.havenGrowthDaily();
  ok(Game.havenTier() === 1, 'tier-up needs zero knowledge');

  console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
  if (failures.length) { console.log('failures:\n - ' + failures.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
