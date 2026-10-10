#!/usr/bin/env node
// CRISIS WIRE (Steve 2026-10-09): the road to Arc III. checkArc() gates Arc 3
// on crises>=1 but noteCrisis() had zero callers — the finale was unreachable
// by construction. These five crises give it keys:
//
//   hunger-winter — village intake <60% of need, 3 days running (villageEats)
//   first-grave   — first villager (non-player) death (registerDeath)
//   breach        — hostile combat starts while the player is at the haven
//   schism        — an exile executes (removeVillager 'exiled' / exilePlayer 'moot')
//   blood-on-air  — a villager contestant dies on camera (_contestResolveOthers)
//
// Asserts each fires exactly once under its real trigger, and that repeats /
// wrong-target triggers don't re-fire or misfire.
//
// Usage: node scripts/test-crisis-20261009.js
//        SEED=7 node scripts/test-crisis-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  return Game.state.scholar;
}
function npcId() {
  const v = Game.state.village;
  return (v.roster || []).find(id => id !== Game.villagerId);
}
function crisisCount(name) {
  return says.filter(t => t.includes('CRISIS \u2014 ' + name)).length;
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ C1. hunger-winter ============
  console.log('\n-- C1. hunger-winter: 3 hungry days --');
  {
    freshGame();
    const v = Game.state.village;
    v.pantry = []; // bare pantry: villagers can't eat
    says.length = 0;
    let firedAt = -1;
    for (let d = 0; d < 12 && firedAt < 0; d++) {
      Game.villageEats();
      if ((Game.progState().crises || {})['hunger-winter']) firedAt = d;
    }
    ok('hunger-winter fires on genuine hunger', firedAt >= 0, `firedAt=${firedAt}`);
    for (let d = 0; d < 4; d++) Game.villageEats();
    ok('fires exactly once', crisisCount('THE HUNGER WINTER') === 1, `beats=${crisisCount('THE HUNGER WINTER')}`);
    ok('crisis recorded', !!(Game.progState().crises || {})['hunger-winter']);
  }

  // ============ C2. first-grave ============
  console.log('\n-- C2. first-grave: first villager death --');
  {
    freshGame();
    const nid = npcId();
    says.length = 0;
    Game.registerDeath({ kind: 'person', villagerId: nid, name: 'Test Victim', cause: 'test' });
    ok('first-grave fires on villager death', crisisCount('THE FIRST GRAVE') === 1, says.slice(-3).join(' | ').slice(0, 160));
    const nid2 = (Game.state.village.roster || []).find(id => id !== Game.villagerId && id !== nid) || nid;
    Game.registerDeath({ kind: 'person', villagerId: nid2, name: 'Second', cause: 'test' });
    ok('second death does not re-fire', crisisCount('THE FIRST GRAVE') === 1);
  }
  {
    // player death is not a villager grave
    freshGame();
    says.length = 0;
    Game.registerDeath({ kind: 'person', villagerId: Game.villagerId, name: 'You', cause: 'test' });
    ok('player death does not fire first-grave', crisisCount('THE FIRST GRAVE') === 0);
  }

  // ============ C3. breach ============
  console.log('\n-- C3. breach: hostile at the haven --');
  {
    freshGame();
    // put the player at the haven: map node == village node
    const v = Game.state.village;
    Game.map.px = v.px ?? 4; Game.map.py = v.py ?? 4;
    ok('test setup: player at haven', Game.playerAtHaven());
    says.length = 0;
    Game.startCombat('bulldozer');
    ok('breach fires', crisisCount('THE BREACH') === 1, says.slice(0, 3).join(' | ').slice(0, 160));
    Game.tbfight = null; // end the fight for the next trigger
    Game.startCombat('bulldozer');
    ok('second fight does not re-fire', crisisCount('THE BREACH') === 1);
    Game.tbfight = null;
  }
  {
    // away from haven: no breach (valid distant node: village at 4,4)
    freshGame();
    Game.map.px = 0; Game.map.py = 0;
    if (Game.playerAtHaven()) { Game.map.px = 8; Game.map.py = 8; }
    says.length = 0;
    Game.startCombat('bulldozer');
    ok('wild fight does not fire breach', crisisCount('THE BREACH') === 0);
    Game.tbfight = null;
  }

  // ============ C4. schism ============
  console.log('\n-- C4. schism: exile executes --');
  {
    freshGame();
    const nid = npcId();
    says.length = 0;
    Game.removeVillager(nid, 'exiled');
    ok('schism fires on villager exile', crisisCount('THE SCHISM') === 1, says.slice(-4).join(' | ').slice(0, 180));
    const nid2 = npcId();
    if (nid2) Game.removeVillager(nid2, 'exiled');
    ok('second exile does not re-fire', crisisCount('THE SCHISM') === 1);
  }
  {
    // killed/fled removals are not schisms
    freshGame();
    const nid = npcId();
    says.length = 0;
    Game.removeVillager(nid, 'killed');
    ok('killed removal does not fire schism', crisisCount('THE SCHISM') === 0);
  }

  // ============ C5. blood-on-air ============
  console.log('\n-- C5. blood-on-air: villager dies on camera --');
  {
    freshGame();
    const nid = npcId();
    // stub the engine: this contestant dies
    const orig = Game.contestResolveVillager;
    Game.contestResolveVillager = () => ({ outcome: 'died', detail: 'test blow', log: [] });
    says.length = 0;
    try {
      Game._contestResolveOthers({ others: [nid], contestId: 'pit', name: 'The Pit' });
    } finally {
      Game.contestResolveVillager = orig;
    }
    ok('blood-on-air fires on contest death', crisisCount('BLOOD ON AIR') === 1, says.filter(t => t.includes('CRISIS')).join(' | ').slice(0, 180));
    ok('crisis recorded', !!(Game.progState().crises || {})['blood-on-air']);
  }

  // ============ C6. arc gate integration ============
  console.log('\n-- C6. crisis unblocks the Arc 3 gate --');
  {
    freshGame();
    // force the other Arc 3 gates open, leave only the crisis gate
    Game.state.systemArrived = true;
    const s = Game.state.scholar;
    s.day = 30;
    // breadth: identify 12 plants directly through the codex
    const ids = Game.data.plants.slice(0, 12).map(p => p.id);
    for (const pid of ids) Game.state.codex.plants[pid] = { level: 1, identifiedDay: 1 };
    // stage: push integration to 2
    s.integration = 50;
    const crisesBefore = Object.keys((Game.progState().crises || {})).length;
    Game.checkArc();
    const arcBefore = Game.progState().arc;
    // now fire a crisis and re-check
    const nid = npcId();
    Game.registerDeath({ kind: 'person', villagerId: nid, name: 'Gate Test', cause: 'test' });
    Game.checkArc();
    const arcAfter = Game.progState().arc;
    ok('crisis was the missing gate', arcBefore < 3 && arcAfter >= 3, `arc ${arcBefore} -> ${arcAfter} (crises before: ${crisesBefore})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
