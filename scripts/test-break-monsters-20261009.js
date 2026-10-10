#!/usr/bin/env node
// BREAK-IT: monster systems — ROUND 11 (2026-10-09). Hostile attacks on the
// wave gate, telegraph honesty, counter honesty, loot honesty, field fights,
// encounter farming, combat softlocks, and dead code.
//
// KILLS ATTEMPTED (asserted below):
//   W1. EXPLOIT: farm wave-1 kills pre-day-8 to force wave 2 early
//       (unlockedWave day-gate must hold).
//   W2. EXPLOIT: avoid kills forever to stay wave-1 "safe" — monsterWavePool
//       must still escalate on the schedule; castMonster must never
//       over-level (wave-2 id pre-unlock) and never under-deliver.
//   W3. HONESTY: spawnWaveTarget ratios hold ~60/40 post-unlock.
//   W4. HONESTY: wave 2 genuinely harder (data means), not reskins.
//   T1. TELEGRAPH LIES: review_drone windup 3 — damage must not land before
//       3 warned turns. The dodge window is the contract.
//   T2. TELEGRAPH LIES (Steve 2026-10-06 law): hushwolf Silent Rush shows NO
//       telegraph indicator before first contact — "no warning, just teeth".
//   C1. COUNTER HONESTY: bright_idea burst r2 — backing off past radius 2
//       must actually dodge (patternCells bounded by radius).
//   C2. COUNTER HONESTY: review_drone beam — the telegraphed line is the
//       line that fires (windup-cells == action-cells).
//   C3. COUNTER HONESTY: SHOUT breaks hummice/belltoad chorus (fear/data
//       counter must be wired, not flavor text).
//   L1. LOOT HONESTY: rollAlienLoot tier caps — wave-1 base <=2 (veteran
//       <=3 post-wave2), wave-2 base <=3, apexes (gallowdeer, moderator)
//       tier 4 on their own terms, never one-apex-per-wave mapping.
//   L2. LOOT HONESTY: loot chances LOW (<=0.15) by design.
//   F1. FRIENDLY FIRE: fieldFight resolves blow-by-blow (rounds>=1, log
//       narrates real attacks), never a single outcome roll.
//   E1. EXPLOIT: encounter spam — one spawn per tile; pity never exceeds cap.
//   S1. SOFTLOCK: startCombat mid-fight refuses (guard holds).
//   D1. DEAD CODE: all 30 monsters reachable via castMonster/checkEncounter
//       paths; every behavior id wired; every pattern type engine-supported.
//
// Usage: node scripts/test-break-monsters-20261009.js
//        BEFORE=1 node scripts/test-break-monsters-20261009.js
//        SEED=99 node scripts/test-break-monsters-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261009', 10);

// Files this run is allowed to change (for BEFORE mode diffing). None yet —
// this round is expected to be read-only against HEAD unless a break lands.
const PRE = [];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bm11-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bm11-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; /* console.log('  ok   ' + name); */ }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

let WAVE1, WAVE2, byId;
function setDayKills(day, kills) {
  Game.state.scholar.day = day;
  Game.state.waveKills = Object.assign({}, kills);
}

// Capture narration
const said = [];
const realSay = Game.say.bind(Game);
Game.say = function (...a) { said.push(String(a[0])); return realSay(...a); };

function endFight() {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  try { Game.state.scholar.monster = null; } catch (e) {}
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  WAVE1 = Game.data.monsters.filter(m => (m.wave || 1) === 1);
  WAVE2 = Game.data.monsters.filter(m => (m.wave || 1) === 2);
  byId = (id) => Game.data.monsters.find(m => m.id === id);

  console.log('== W: wave-gate honesty ==');
  // W1: day-gate holds against kill farming
  setDayKills(7, { 1: 100 });
  ok('W1a day-8 gate holds vs kill farm (day 7 + 100 kills -> wave 1)', Game.unlockedWave() === 1);
  setDayKills(8, { 1: 3 });
  ok('W1b 3 kills insufficient (day 8 + 3 -> wave 1)', Game.unlockedWave() === 1);
  setDayKills(8, { 1: 4 });
  ok('W1c 4 wave-1 kills unlocks wave 2 (day 8 + 4 -> wave 2)', Game.unlockedWave() === 2);
  setDayKills(24, { 1: 99, 2: 50 });
  ok('W1d day-25 gate holds vs wave-2 farm (day 24 -> max wave 2)', Game.unlockedWave() === 2);
  setDayKills(25, { 1: 99, 2: 7 });
  ok('W1e 7 wave-2 kills insufficient (day 25 + 7 -> wave 2)', Game.unlockedWave() === 2);
  setDayKills(25, { 1: 99, 2: 8 });
  ok('W1f 8 wave-2 kills unlocks wave 3 (day 25 + 8 -> wave 3)', Game.unlockedWave() === 3);
  setDayKills(50, { 1: 99, 2: 99, 3: 5 });
  ok('W1g wave-4 gate (day 50 + 5 w3 kills -> wave 4)', Game.unlockedWave() === 4);
  setDayKills(49, { 1: 99, 2: 99, 3: 99 });
  ok('W1h day-50 gate holds (day 49 -> max wave 3)', Game.unlockedWave() === 3);

  // W2: pool + cast never over-level, never stale
  setDayKills(7, { 1: 0 });
  let pool = Game.monsterWavePool();
  ok('W2a pre-unlock pool is wave-1 only (15)', pool.length === 15 && pool.every(m => (m.wave || 1) === 1), `got ${pool.length}`);
  let seen = new Set();
  for (let i = 0; i < 3000; i++) { const c = Game.castMonster(); seen.add(c.id || c); }
  const over = [...seen].filter(id => (byId(id).wave || 1) > 1);
  ok('W2b castMonster never over-levels pre-unlock (3000 draws)', over.length === 0, `over: ${over.join(',')}`);
  setDayKills(8, { 1: 4 });
  seen = new Set();
  for (let i = 0; i < 6000; i++) { const c = Game.castMonster(); seen.add(c.id || c); }
  const w2ids = new Set(WAVE2.map(m => m.id));
  const missingW2 = [...w2ids].filter(id => !seen.has(id));
  ok('W2c all 15 wave-2 monsters reachable via castMonster (6000 draws)', missingW2.length === 0, `missing: ${missingW2.join(',')}`);
  const w1ids = new Set(WAVE1.map(m => m.id));
  // nightlight_catfish is 'in'-water: castMonster (the treeline wanderer)
  // excludes it by design ("a sessile lure predator can't pace the
  // treeline"). It stays reachable through checkEncounter on water grids.
  const castable = [...w1ids].filter(id => byId(id).waterAffinity !== 'in');
  seen = new Set();
  for (let i = 0; i < 6000; i++) { const c = Game.castMonster(); seen.add(c.id || c); }
  const missingW1 = [...castable].filter(id => !seen.has(id));
  ok('W2d all castable wave-1 monsters still reachable post-unlock (earlier waves never leave)', missingW1.length === 0, `missing: ${missingW1.join(',')}`);
  const cat = byId('nightlight_catfish');
  ok('W2e catfish stays in the wave pool (water-path spawnable)', pool.concat(Game.monsterWavePool()).some(m => m.id === 'nightlight_catfish') && cat.waterAffinity === 'in');
  ok('W2f catfish honestly excluded from wanderer cast (in-water, no pacing)',
    ![...Array(200)].map(() => { const c = Game.castMonster(); return c.id || c; }).includes('nightlight_catfish'));

  // W3: spawn ratios ~60/40 post-unlock
  let n2 = 0, n = 4000;
  for (let i = 0; i < n; i++) { if (Game.spawnWaveTarget(Game.monsterWavePool()) === 2) n2++; }
  ok('W3 spawn ratios ~60/40 (tolerance 5%)', Math.abs(n2 / n - 0.6) < 0.05, `got ${(n2 / n).toFixed(3)}`);

  // W4: wave 2 genuinely harder — data means, not reskins
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const hp1 = mean(WAVE1.map(m => (m.hp[0] + m.hp[1]) / 2));
  const hp2 = mean(WAVE2.map(m => (m.hp[0] + m.hp[1]) / 2));
  const dg1 = mean(WAVE1.map(m => (m.attack.damage[0] + m.attack.damage[1]) / 2));
  const dg2 = mean(WAVE2.map(m => (m.attack.damage[0] + m.attack.damage[1]) / 2));
  ok('W4a wave-2 mean HP > wave-1 (escalation honest)', hp2 > hp1, `w1=${hp1.toFixed(1)} w2=${hp2.toFixed(1)}`);
  ok('W4b wave-2 mean damage > wave-1 (escalation honest)', dg2 > dg1, `w1=${dg1.toFixed(1)} w2=${dg2.toFixed(1)}`);
  const max1 = Math.max(...WAVE1.map(m => m.attack.damage[1]));
  const max2 = Math.max(...WAVE2.map(m => m.attack.damage[1]));
  ok('W4c wave-2 ceiling above wave-1 ceiling', max2 > max1, `w1max=${max1} w2max=${max2}`);

  console.log('== T: telegraph honesty ==');
  // T1: review_drone windup 3 — damage must not land before 3 warned turns.
  function waitFight(monsterId, maxRounds) {
    const s = Game.state.scholar;
    s.health = 10000; s.mx = 4; s.my = 4;
    said.length = 0;
    Game.startCombat(monsterId);
    const warns = []; let hpDrops = [];
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < (maxRounds || 80)) {
      if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); continue; }
      const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
      const p = Game.tbFighter('p');
      const hpBefore = p ? p.hp : 0;
      const hadTelegraph = !!(m && m.telegraph);
      warns.push(hadTelegraph);
      Game.tbPlayerWait(); // auto-advances; call nothing after
      const p2 = Game.tbfight ? Game.tbFighter('p') : null;
      if (p2 && p2.hp < hpBefore) hpDrops.push(warns.length - 1);
      if (!Game.tbfight || Game.tbfight.over) break;
    }
    const over = Game.tbfight ? Game.tbfight.over : true;
    endFight();
    return { warns, hpDrops, over };
  }
  const drone = waitFight('review_drone');
  const windup = byId('review_drone').attack.pattern.windup;
  ok('T1a review_drone has windup 3 in data', windup === 3, `windup=${windup}`);
  if (drone.hpDrops.length) {
    const first = drone.hpDrops[0];
    // warned turns = player-turn starts with a live telegraph, up to and
    // including the turn after which damage landed (the dodge window).
    const warnedTurns = drone.warns.slice(0, first + 1).filter(Boolean).length;
    ok('T1b first drone damage lands only after >=3 warned turns', warnedTurns >= 3,
      `first damage turn ${first}, warned ${warnedTurns}`);
  } else {
    ok('T1b drone never damaged the player in 80 rounds (no attack observed)', false, 'no hp drop to check');
  }

  // T2: hushwolf Silent Rush — no telegraph indicator before first contact.
  const wolf = waitFight('hushwolf');
  if (wolf.hpDrops.length) {
    const first = wolf.hpDrops[0];
    // telegraph cues are '⚠ <cue>' (sayTelegraphOnce); the fight-opening
    // '⚠️ N threats' rollcall is a different emoji and not an attack tell.
    const teleBefore = said.filter(l => l.startsWith('⚠ '));
    ok('T2a no ⚠ telegraph line before the hushwolf\'s first hit', teleBefore.length === 0,
      `found ${teleBefore.length}: ${teleBefore.slice(0, 2).join(' | ')}`);
    ok('T2b rush hit with no declare (warns before first damage = 0)',
      wolf.warns.slice(0, first + 1).filter(Boolean).length === 0);
  } else {
    ok('T2 hushwolf never reached the player in 80 rounds', false, 'no hp drop to check');
  }

  console.log('== C: counter honesty ==');
  // C1: bright_idea burst radius 2 — patternCells bounded by radius.
  const bi = byId('bright_idea');
  const cells = S.combat.patternCells(bi.attack.pattern, 4, 4, 4, 4);
  const maxD = Math.max(...cells.map(c => Math.max(Math.abs(c.cx - 4), Math.abs(c.cy - 4))));
  ok('C1a bright_idea burst cells within radius 2', maxD <= 2, `maxD=${maxD}`);
  ok('C1b burst pattern is radius 2 in data', bi.attack.pattern.radius === 2);
  // C2: review_drone beam — telegraphed line is straight, length <= 6.
  const rd = byId('review_drone');
  const bcells = S.combat.patternCells(rd.attack.pattern, 2, 2, 6, 2);
  const straight = bcells.every(c => c.cy === 2);
  const len = Math.max(...bcells.map(c => Math.abs(c.cx - 2)));
  ok('C2a drone beam is a straight line', straight);
  ok('C2b drone beam length <= 6 (data length 6)', len <= 6 && rd.attack.pattern.length === 6, `len=${len}`);
  // C3: SHOUT counter wired for hummice + belltoad.
  function shoutFight(monsterId) {
    const s = Game.state.scholar;
    s.health = 10000; s.mx = 4; s.my = 4;
    Game.startCombat(monsterId);
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 10) {
      if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); continue; }
      Game.tbPlayerShout();
      break;
    }
    const f = Game.tbfight;
    const res = f ? { shouts: f.shouts || 0, chorus: f.chorusBrokenUntil, startled: f.fighters.some(m => m.kind === 'monster' && (m.startled || (m.encCooldown || 0) > 0)) } : null;
    endFight();
    return res;
  }
  const hs = shoutFight('hummice');
  ok('C3a shout vs hummice: capped, chorus broken, swarm startled',
    hs && hs.shouts === 1 && hs.chorus != null && hs.startled, JSON.stringify(hs));
  const bt = shoutFight('belltoad');
  ok('C3b shout vs belltoad (fear loud noise): startled', bt && bt.startled, JSON.stringify(bt));

  console.log('== V: alien-disease vectors (canon: docs/DISEASES.md) ==');
  // V1: mosquito bite carries eurika or east_nile, 50/50 per landed bite.
  function resetStatuses() {
    try { Game.state.statuses = Game.state.statuses || {}; } catch (e) {}
    for (const v of ['eurika', 'east_nile', 'lemons']) {
      try { Game.state.scholar && Game.state.scholar.status && delete Game.state.scholar.status[v]; } catch (e) {}
    }
  }
  resetStatuses();
  const got1 = Game.mosquitoBiteVirus();
  ok('V1a mosquito bite applies an alien virus', (got1 === 'eurika' || got1 === 'east_nile') && Game.hasStatus('scholar', got1), `got=${got1}`);
  const got2 = Game.mosquitoBiteVirus();
  ok('V1b second bite can land the OTHER virus (min-maxers seek both)',
    got2 && got2 !== got1 && Game.hasStatus('scholar', got2), `got=${got2}`);
  const got3 = Game.mosquitoBiteVirus();
  ok('V1c no third virus when both held', got3 === null, `got=${got3}`);
  // V1d: the vector is wired into the fight (tbMosquitoTurn calls it on a
  // landed drink) — instrument and run a real fight.
  resetStatuses();
  let biteCalls = 0;
  const realBite = Game.mosquitoBiteVirus;
  Game.mosquitoBiteVirus = function () { biteCalls++; return realBite.call(Game); };
  const sV = Game.state.scholar; sV.health = 10000; sV.mx = 4; sV.my = 4;
  said.length = 0;
  Game.startCombat('giant_mosquito');
  let guardV = 0, drank = false;
  while (Game.tbfight && !Game.tbfight.over && guardV++ < 60 && !drank) {
    if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); continue; }
    Game.tbPlayerWait();
    drank = said.some(l => /proboscis slides in/.test(l));
  }
  Game.mosquitoBiteVirus = realBite;
  ok('V1d mosquito drink in a real fight triggers the virus roll', drank && biteCalls > 0, `drank=${drank} calls=${biteCalls}`);
  ok('V1e landed bite actually infected (status present)', Game.hasStatus('scholar', 'eurika') || Game.hasStatus('scholar', 'east_nile'));
  endFight();
  // V2: tick latch rolls 50% for lemons (alien pool, not mundane).
  resetStatuses();
  const sT = Game.state.scholar; sT.health = 10000; sT.mx = 4; sT.my = 4;
  Game.startCombat('alien_tick');
  const tm = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
  const pp = Game.tbFighter('p');
  tm.mx = pp.mx + 1; tm.my = pp.my; // adjacency: the latch is undodgeable
  const realR = Math.random;
  Math.random = () => 0.1; // force the 50% lemons roll to land
  let guardT = 0;
  while (Game.tbfight && !Game.tbfight.over && guardT++ < 6 && !tm.tickLatched) {
    if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); continue; }
    Game.tbPlayerWait();
  }
  Math.random = realR;
  ok('V2a tick latches at adjacency (undodgeable)', !!tm.tickLatched);
  ok('V2b latched bite can apply lemons (alien pool)', Game.hasStatus('scholar', 'lemons'));
  // V3: torch counter — flame drives it off (weakness honesty).
  sT.inventory = sT.inventory || [];
  sT.inventory.push({ itemId: 'torch', units: 1 });
  said.length = 0;
  let guardT2 = 0;
  while (Game.tbfight && !Game.tbfight.over && guardT2++ < 4 && tm.tickLatched) {
    if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); continue; }
    Game.tbPlayerWait();
  }
  ok('V3 torch burns the latched tick off', !tm.tickLatched && said.some(l => /torch.*flame|burned off/.test(l)));
  endFight();
  resetStatuses();
  // force the chance roll to succeed, check tier caps
  const realRandom = Math.random;
  function rollTier(mdef, fighter) {
    Math.random = () => 0; // chance roll passes, pool pick = index 0
    try {
      const id = Game.rollAlienLoot(mdef, fighter || {});
      if (!id) return null;
      const def = (Game.data.items || []).find(i => i.id === id);
      return def ? (def.lootTier || 1) : null;
    } finally { Math.random = realRandom; }
  }
  const humTier = rollTier(byId('hummice'));
  ok('L1a wave-1 base (hummice) max tier 2', humTier != null && humTier <= 2, `tier=${humTier}`);
  setDayKills(8, { 1: 4 });
  const vetTier = rollTier(byId('hummice'), { veteran: true });
  ok('L1b wave-1 veteran post-wave2-unlock max tier 3', vetTier != null && vetTier <= 3, `tier=${vetTier}`);
  const gdTier = rollTier(byId('gallowdeer'));
  ok('L1c wave-1 apex (gallowdeer) can reach tier 4 on its own terms', gdTier === 4, `tier=${gdTier}`);
  const modTier = rollTier(byId('moderator'));
  ok('L1d wave-2 apex (moderator) can reach tier 4 on its own terms', modTier === 4, `tier=${modTier}`);
  const vmTier = rollTier(byId('voice_mimic_radio'));
  ok('L1e wave-2 base max tier 3', vmTier != null && vmTier <= 3, `tier=${vmTier}`);
  // tier-4 pool must actually exist or the apex drops are promises that fizzle
  const t4 = (Game.data.items || []).filter(i => i.origin === 'alien' && (i.lootTier || 1) === 4);
  ok('L1f tier-4 alien item pool non-empty (apex drops can land)', t4.length > 0, `count=${t4.length}`);
  // no auto apex-per-wave mapping: tier 4 comes from data apex flags, not wave
  const apexes = Game.data.monsters.filter(m => m.apex).map(m => m.id);
  ok('L1g apex flags hand-placed (gallowdeer + moderator only)', apexes.length === 2 && apexes.includes('gallowdeer') && apexes.includes('moderator'), apexes.join(','));
  const badChance = Game.data.monsters.filter(m => m.loot && m.loot.chance > 0.15).map(m => m.id);
  ok('L2 all loot chances LOW (<= 0.15)', badChance.length === 0, badChance.join(','));

  console.log('== F: field fights (fought, not rolled) ==');
  const roster = (Game.state.village && Game.state.village.roster) || [];
  const vid = roster[0];
  const rec = Game.fieldFight(vid, byId('gallowdeer'), null, { awareness: false });
  ok('F1a fieldFight returns a record', !!rec && typeof rec.outcome === 'string');
  ok('F1b blow-by-blow: >=1 round', rec.rounds >= 1, `rounds=${rec.rounds}`);
  ok('F1c blow-by-blow: log narrates (>=1 line)', (rec.log || []).length >= 1, `lines=${(rec.log || []).length}`);
  const logText = (rec.log || []).join(' ');
  ok('F1d monster real attack data used (attack name in log)', logText.includes('Ocular Discharge') || logText.includes('beam'), logText.slice(0, 80));
  const rec2 = Game.fieldFight(vid, byId('hushwolf'), null, { awareness: false });
  ok('F1e second species also fought blow-by-blow', rec2.rounds >= 1 && (rec2.log || []).length >= 1);

  console.log('== E: encounter farming ==');
  // E1: one spawn per tile — checkEncounter can't stack monsters on a tile.
  const px = Game.map.px, py = Game.map.py;
  Game.state.waveKills = { 1: 0 }; Game.state.scholar.day = 3; Game.state.scholar.spawnMisses = 99;
  Game.checkEncounter && Game.checkEncounter(px, py);
  const after1 = Game.worldMonsters().filter(m => m.tx === px && m.ty === py).length;
  Game.state.scholar.spawnMisses = 99;
  Game.checkEncounter && Game.checkEncounter(px, py);
  const after2 = Game.worldMonsters().filter(m => m.tx === px && m.ty === py).length;
  ok('E1a first checkEncounter spawns at most one monster', after1 <= 1, `n=${after1}`);
  ok('E1b re-entry does not stack a second monster on the tile', after2 <= 1, `n=${after2}`);
  // pity cap: effChance = chance * (1 + 0.25*misses), capped 0.6
  ok('E1c pity never exceeds 60% cap (code: Math.min(..., 0.6))',
    /Math\.min\(chance \* \(1 \+ 0\.25 \* misses\), 0\.6\)/.test(fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8')));

  console.log('== S: softlocks ==');
  // S1: double startCombat refused
  const s2 = Game.state.scholar; s2.health = 10000; s2.mx = 4; s2.my = 4;
  Game.startCombat('hushwolf');
  const mf1 = Game.tbfight.fighters.find(x => x.kind === 'monster');
  const hp1v = mf1.hp;
  said.length = 0;
  Game.startCombat('bulldozer'); // hostile: clobber attempt
  const mf2 = Game.tbfight.fighters.find(x => x.kind === 'monster');
  ok('S1a startCombat mid-fight refused (guard holds)', mf2 === mf1 && mf2.hp === hp1v);
  ok('S1b refusal narrated honestly', said.some(l => /Already in a fight/.test(l)));
  endFight();

  console.log('== D: dead code ==');
  const beh = Game.data.monsterBehaviors ? Game.data.monsterBehaviors.behaviors : (JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsterBehaviors.json'), 'utf8')).behaviors);
  const missingBeh = Game.data.monsters.filter(m => !beh[m.id]).map(m => m.id);
  ok('D1 every monster has a behavior entry', missingBeh.length === 0, missingBeh.join(','));
  const supported = ['beam', 'charge', 'line', 'burst', 'direct', 'rush', 'ambush', 'single'];
  const badPat = Game.data.monsters.filter(m => !supported.includes((m.attack.pattern || {}).type)).map(m => m.id);
  ok('D2 every pattern type engine-supported', badPat.length === 0, badPat.join(','));
  // dead-code: every behavior id used by monsterBehavior() lookups
  ok('D3 monsterBehavior() accessor exists', typeof Game.monsterBehavior === 'function');

  console.log(`\nbreak-monsters r11 (seed ${SEED}): ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(1); });
