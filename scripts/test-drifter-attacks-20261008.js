#!/usr/bin/env node
// HOSTILE PLAYTEST (drifter archetype, 2026-10-08): break distance.
// Verbs: catch-up sim exploits, free travel, village-state corruption on return.
//   A1 EXPLOIT: catchUpSim regrow multiplication (approach village B after A)
//   A2 SOFTLOCK: contest abduct mid-combat / mid-travel + return integrity
//   A3 HONESTY: travel/blockage button labels vs engine costs
// Run: SEED=1 node scripts/test-drifter-attacks-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // stub for eval phase only
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;
const drain = () => { const l = Game.log || []; l.length = 0; };
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };

function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  drain();
  return s;
}
const keepAlive = s => { s.kcal = 2400; s.hydration = 100; if (s.health < 200) s.health = 500; };
const mapStock = () => {
  let t = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const tl = Game.tileAt(x, y); if (tl) t += (tl.stock || 0); }
  return t;
};
function synthFight(monId) {
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  Game.state.systemArrived = false;
  Game.resetPerFightFlags();
  const mdef = Game.data.monsters.find(m => m.id === monId) || Game.data.monsters[0];
  Game.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false, aimed: false },
      { key: 'm_test', kind: 'monster', monsterId: mdef.id, mdef, name: 'TestMonster', emoji: '👹', hp: 30, maxHp: 30, speed: 3, mx: 6, my: 4, alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0 },
    ],
    over: false, round: 1, order: ['p', 'm_test'], turnIdx: 0,
  };
  Game.tbfight.fightersByKey = {};
  for (const f of Game.tbfight.fighters) Game.tbfight.fightersByKey[f.key] = f;
}

(async () => {
  await Game.init();
  console.log('== DRIFTER ATTACKS — SEED ' + SEED + ' ==');

  // ============ A1: catchUpSim regrow multiplication ============
  {
    const s = fresh();
    for (let d = 0; d < 30 && !Game.over; d++) { keepAlive(s); Game.state.village.pantryKcal = 99999; try { Game.endDay(); } catch (e) { console.log('endDay threw: ' + e.message); break; } drain(); }
    const day = s.day;
    const villages = (Game.state.otherVillages || []).filter(v => !v.generated);
    let regrowCalls = 0;
    const _rg = Game.regrowTiles.bind(Game);
    Game.regrowTiles = function () { regrowCalls++; return _rg(); };
    const stock0 = mapStock();
    const perVillage = [];
    for (const v of villages) {
      const before = regrowCalls;
      Game.catchUpSim(v); drain();
      perVillage.push({ name: v.name, calls: regrowCalls - before, day: v.day });
    }
    const stock1 = mapStock();
    Game.regrowTiles = _rg; // restore
    const total = perVillage.reduce((a, p) => a + p.calls, 0);
    const expected = Math.max(0, day - 0); // land should heal once per elapsed day, total
    const broke = total > expected + 2; // tolerance: first-day edge effects
    attack('A1 catchUpSim regrow multiplication',
      broke,
      `day=${day}, villages=${villages.length}, regrowTiles calls=${total} (budget ${expected}), stock ${stock0}->${stock1}; per-village: ` +
      perVillage.map(p => `${p.name}:${p.calls}`).join(', '));
  }

  // ============ A2: abduct mid-combat + mid-travel, return integrity ============
  {
    const s = fresh();
    // mid-travel: stand on a wild node after a travelTo
    Game.map.px = 5; Game.map.py = 5; s.mx = 4; s.my = 4;
    synthFight('hushwolf');
    const hadFight = !!Game.tbfight;
    const px0 = Game.map.px, py0 = Game.map.py, mx0 = s.mx, my0 = s.my;
    let threw = null;
    try {
      Game.warnChallenge({ name: 'Test Game', firesDay: s.day });
      Game.abduct([Game.villagerId], 'ch_test');
      drain();
    } catch (e) { threw = e; }
    const fightCleared = !Game.tbfight && !Game.fight;
    let ret = null, retThrew = null;
    try { Game.returnFromArena(); drain(); } catch (e) { retThrew = e; }
    const posOk = Game.map.px === px0 && Game.map.py === py0 && s.mx === mx0 && s.my === my0;
    let canAct = false;
    try { canAct = Game.microMove(4, 5) === true || Game.microMove(5, 4) === true; } catch (e) {}
    const broke = !!threw || !!retThrew || !fightCleared || !posOk || !canAct || Game.over;
    attack('A2 abduct mid-combat/mid-travel + return',
      broke,
      `fight existed=${hadFight}, cleared=${fightCleared}, pos intact=${posOk}, can step after=${canAct}, threw=${threw ? threw.message : 'no'}/${retThrew ? retThrew.message : 'no'}`);
  }

  // ============ A3: blockage button labels vs engine ============
  {
    const s = fresh();
    Game.map.px = 5; Game.map.py = 5; s.mx = 4; s.my = 4;
    const tx = 6, ty = 5;
    const dest = Game.tileAt(tx, ty);
    const results = [];
    for (const [type, kcalCost] of [['fallen_tree', 60], ['rubble', 40]]) {
      dest.blockFrom = { dx: 0, dy: 0, type };
      s.kcal = 2400;
      const k0 = s.kcal, t0 = s.actionClock || 0;
      Game.clearBlockage(tx, ty); drain();
      const dKcal = k0 - s.kcal, dTicks = (s.actionClock || 0) - t0;
      results.push(`${type}: -${dKcal}kcal (label ${kcalCost}), ${dTicks} ticks (label "1 part" = 128 ticks)`);
    }
    const tickLie = results.some(r => !r.includes('128 ticks'));
    attack('A3 blockage labels "(1 part, N kcal)" vs engine',
      tickLie,
      results.join(' | '));
  }

  console.log('\n== SUMMARY ==');
  for (const [n, b] of verdicts) console.log(`  ${b ? 'BREAK' : 'HELD '} ${n}`);
  const nBreak = verdicts.filter(v => v[1]).length;
  console.log(`  ${nBreak} break(s), ${verdicts.length - nBreak} held`);
  process.exit(nBreak ? 2 : 0);
})().catch(e => { console.error('HARNESS FATAL: ' + (e && e.stack || e)); process.exit(3); });
