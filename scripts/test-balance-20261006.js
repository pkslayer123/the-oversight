#!/usr/bin/env node
// ASSERTS (Steve 2026-10-06): regression guards for the balance mechanics
// re-tested in scripts/playtest-balance-20261006.js. Deterministic where
// possible; the drone crowd test drives real turns (no RNG in the mechanism).
// Run: node scripts/test-balance-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function freshCombat(scenario) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.debugScenario(scenario);
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.genDetail = () => flatGrid();
  Game.canSee = () => true;
  Game.log = [];
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P(); if (pf) { pf.hp = pf.maxHp = 9000; }
  return s;
}
function addVillagers(n, noticeMonsters) {
  const f = Game.tbfight;
  for (let i = 0; i < n; i++) {
    const key = 'vill' + i + '_' + Math.floor(Math.random() * 1e6);
    f.fighters.push({ key, kind: 'villager', name: 'Villager ' + i, mx: 4, my: 4, hp: 40, maxHp: 40, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
    for (const m of noticeMonsters) Game.encNoticeFighter(m, key, true);
  }
}
function freshHunt() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}

(async () => {
  await Game.init();

  // ---- 1. DRONE: crowd buys ONE breather, not immunity ----
  {
    console.log('\n[drone crowd recalibration]');
    freshCombat('reviewdrone');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    addVillagers(3, [m]); // player + 3 = 4 live fighters
    Game.log = [];
    for (let i = 0; i < 24 && Game.tbfight && !Game.tbfight.over; i++) endTurn();
    const log = Game.log.join('\n');
    const crowdRecalcs = (log.match(/TOO MANY SUBJECTS/g) || []).length;
    const postBeamBreathers = (log.match(/RECALIBRATING METRICS/g) || []).length;
    ok(crowdRecalcs === 1, 'crowd triggers exactly ONE recalibration (breather), got ' + crowdRecalcs);
    ok(/SAMPLE SIZE INSUFFICIENT/.test(log), 'drone narrows scope after the breather ("REDUCING SCOPE")');
    ok((m.drRecalcs || 0) >= 1, 'adaptation persists: drRecalcs=' + (m.drRecalcs || 0) + ' (no reset -> no re-stall)');
    ok(postBeamBreathers >= 2, 'beam FIRES repeatedly with the crowd standing (' + postBeamBreathers + ' post-attack breathers — not immunity)');
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // ---- 2. STAG GAZE: freeze costs move, NOT the turn (acted-reset fix) ----
  {
    console.log('\n[stag gaze-freeze acted reset]');
    freshCombat('griefcounselor');
    // ensure it's the player's turn
    let guard = 0;
    while (!Game.tbIsPlayerTurn() && guard++ < 10) Game.tbAdvance();
    const p = P();
    p.stunned = 1; p.acted = true; p.moveLeft = 3; // acted=true: leftover from the ended turn, as in real play
    Game.tbBeginTurn();
    ok(p.stunned === 0, 'stun consumed (1 -> 0)');
    ok(p.moveLeft === 0, 'freeze zeroes movement');
    ok(p.acted === false, 'acted reset: the frozen player KEEPS their action (no whole-turn skip)');
    ok(Game.tbCurrent() && Game.tbCurrent().key === 'p', 'turn NOT auto-advanced past the player');
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // ---- 3. TOAD stunFull: whole turn lost (acted reset must not break this) ----
  // Note: tbBeginTurn's stunFull path calls tbAdvance(), which cycles back to
  // the player's NEXT turn (fresh acted=false) — so assert the consumption
  // signature (the say + flags), not the turn position.
  {
    console.log('\n[belltoad stunFull whole-turn loss]');
    freshCombat('choir');
    let guard = 0;
    while (!Game.tbIsPlayerTurn() && guard++ < 10) Game.tbAdvance();
    const p = P();
    Game.log = [];
    p.stunned = 1; p.stunFull = 1; p.acted = true; p.moveLeft = 0;
    Game.tbBeginTurn();
    const log = Game.log.join('\n');
    ok(/the turn slips past/.test(log), 'stunFull says the turn slips past');
    ok(p.stunned === 0 && !p.stunFull, 'stun consumed (stunned and stunFull cleared)');
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // ---- 4. STAG bulldoze: config + tbBulldozeCells shreds cover ----
  {
    console.log('\n[mirror_stag bulldoze at resolve]');
    freshCombat('griefcounselor');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    const cfg = Game.encConfig(m) || {};
    ok(cfg.bulldoze === true, 'stag resolve config has bulldoze:true');
    ok(cfg.commitCharge === true, 'stag charge is commitCharge (locked at declare)');
    // tbBulldozeCells: trees in the lane are destroyed, lane continues
    const det = flatGrid();
    det[4][3] = 'tree'; det[4][2] = 'tree'; det[4][5] = 'wall';
    Game.genDetail = () => det;
    Game.log = [];
    const cells = [{ cx: 2, cy: 4 }, { cx: 3, cy: 4 }, { cx: 4, cy: 4 }, { cx: 5, cy: 4 }];
    const out = Game.tbBulldozeCells(cells);
    ok(out.length === 4, 'charge continues through the wreckage (lane not shortened)');
    ok(det[4][3] !== 'tree' && det[4][2] !== 'tree', 'trees in the lane shredded at resolve');
    ok(/SMASHES/.test(Game.log.join('\n')), 'destruction narrated (SMASHES)');
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // ---- 5. HORN crowd deflate ----
  {
    console.log('\n[hype_horn crowd deflate]');
    freshCombat('motivationalspeaker');
    const hs = Game.tbfight.fighters.filter(x => x.kind === 'monster' && (x.mdef || {}).id === 'hype_horn');
    addVillagers(2, hs); // player + 2 = 3 noticed friendlies > crowdLimit 2
    Game.log = [];
    for (let i = 0; i < 4 && Game.tbfight && !Game.tbfight.over; i++) endTurn();
    const log = Game.log.join('\n');
    ok(/YOU'RE ALL WINNERS/.test(log), 'crowd makes the horn deflate ("YOU\'RE ALL WINNERS, I\'M JUST—")');
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // ---- 6. HUNT tool-gating ----
  {
    console.log('\n[hunt tool-gating]');
    const s = freshHunt();
    const def = Game.data.items.find(i => i.id === 'crude_bow');
    s.inventory.push({ itemId: 'crude_bow', name: def.name, units: 1 });
    s.equipped = { weapon: { itemId: 'crude_bow', name: def.name } };
    ok(Game.encMethodToolReady('snare') === false, 'snare NOT ready without wire');
    ok(Game.encMethodToolReady('bow') === true, 'bow ready with bow equipped');
    s.inventory.push({ itemId: 'snare_wire', name: 'Snare wire', units: 1 });
    ok(Game.encMethodToolReady('snare') === true, 'snare ready with wire in pack');
    ok(Game.encMethodToolName('snare') === 'snare wire', 'missing piece named honestly ("snare wire")');
    // the strike with the wrong method: "wrong tool", names better methods.
    // (The rabbit's methods are snare/chase and chase is always "ready" as a
    // method — so the rabbit gets the wrong-tool guidance, not the unprepared
    // long-shot. The unprepared message is for truly unequipped hunts.)
    const cfg2 = Game.encPreyCfg('cottontail_rabbit');
    s.animal = { id: 'cottontail_rabbit', mx: 6, my: 4, aware: 0.1, stamina: cfg2.stamina, pstate: 'graze', edgeTurns: 0, turns: 0 };
    s.inventory = s.inventory.filter(i => !/snare/i.test(i.itemId || ''));
    Game.log = [];
    let rr = Math.random; Math.random = () => 0.99; // don't care about hit/miss here
    Game.huntAnimal(); Math.random = rr;
    ok(/would work better/.test(Game.log.join('\n')), 'bow at a rabbit: "wrong tool — snare or chase would work better"');
    // the unprepared long-shot: raccoon is trap-only. Armed (bow) but no
    // trapping skill and no cage -> the tool check runs and names it.
    // (Unarmed hunts skip the tool check — hands are always improvising.)
    const s2 = freshHunt();
    const def2 = Game.data.items.find(i => i.id === 'crude_bow');
    s2.inventory.push({ itemId: 'crude_bow', name: def2.name, units: 1 });
    s2.equipped = { weapon: { itemId: 'crude_bow', name: def2.name } };
    const cfgR = Game.encPreyCfg('raccoon');
    s2.animal = { id: 'raccoon', mx: 6, my: 4, aware: 0.1, stamina: cfgR.stamina, pstate: 'graze', edgeTurns: 0, turns: 0 };
    Game.log = [];
    rr = Math.random; Math.random = () => 0.99;
    Game.huntAnimal(); Math.random = rr;
    const rl = Game.log.join('\n');
    ok(/don't have the right tool/.test(rl) && /trapping skill or a cage/.test(rl),
      'trap-only animal with no skill/cage: names "the trapping skill or a cage" (long shot)');
  }

  // ---- 7. KNOWLEDGE-GATED tracking ----
  {
    console.log('\n[knowledge-gated tracking]');
    let s = freshHunt();
    let cfg3 = Game.encPreyCfg('white_tailed_deer');
    s.animal = { id: 'white_tailed_deer', mx: 6, my: 4, aware: 0.1, stamina: cfg3.stamina, pstate: 'graze', edgeTurns: 0, turns: 0 };
    Game.trackKnown = () => false; Game.abilityLevel = () => 0;
    Game.log = [];
    Game.stalkAnimal();
    ok(/can't read the rest/.test(Game.log.join('\n')), 'unknown tracker: "disturbed earth... can\'t read the rest"');
    s = freshHunt();
    cfg3 = Game.encPreyCfg('white_tailed_deer');
    s.animal = { id: 'white_tailed_deer', mx: 6, my: 4, aware: 0.1, stamina: cfg3.stamina, pstate: 'graze', edgeTurns: 0, turns: 0 };
    Game.state.codex.animalEncounters = { white_tailed_deer: 3 };
    Game.trackKnown = () => true; Game.abilityLevel = () => 2;
    Game.log = [];
    Game.stalkAnimal();
    const l2 = Game.log.join('\n');
    ok(/prints/.test(l2) && /fresh|hours old/.test(l2), 'tracker L2: species prints + freshness read');
    delete Game.trackKnown; delete Game.abilityLevel;
  }

  // ---- 8. BUTCHERING kcal anchors ----
  // The full chase-to-winded loop is proven in the playtest (it works
  // end-to-end). Here: deterministic winded setup -> forced clean shot ->
  // carcass with the right kcal. Plus a stamina-drain check (the chase is real).
  {
    console.log('\n[butchering kcal anchors]');
    // stamina drains as it bolts: the chase is real, winded is earned
    let s = freshHunt();
    let cfg = Game.encPreyCfg('white_tailed_deer');
    ok(cfg.stamina === 3, 'deer stamina 3 (three bolts, then winded)');
    s.animal = { id: 'white_tailed_deer', mx: 6, my: 4, aware: 0.95, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0, turns: 0 };
    s.mx = 7; s.my = 4;
    Game.animalTurn();
    ok(s.animal && s.animal.pstate === 'bolt', 'jumpy deer bolts on the first turn');
    function windedKill(id) {
      const s2 = freshHunt();
      const def = Game.data.items.find(i => i.id === 'crude_bow');
      s2.inventory.push({ itemId: 'crude_bow', name: def.name, units: 1 });
      s2.equipped = { weapon: { itemId: 'crude_bow', name: def.name } };
      const c = Game.encPreyCfg(id);
      // winded by the chase (proven in the playtest); the shot is the assert
      s2.animal = { id, mx: 5, my: 4, aware: 1, stamina: 0, pstate: 'winded', edgeTurns: 0, turns: 9 };
      s2.mx = 3; s2.my = 4; // bow range, outside the bite
      const rr = Math.random; Math.random = () => 0.0; // the perfect shot
      Game.huntAnimal(); Math.random = rr;
      return (s2.inventory || []).find(i => i && i.foodState === 'carcass');
    }
    const deer = windedKill('white_tailed_deer');
    const deerData = (Game.data.animals || []).find(a => a.id === 'white_tailed_deer');
    ok(!!deer, 'winded deer kill produces a carcass');
    ok(deerData && deerData.calories === 20000, 'deer data anchor is 20000 kcal');
    // modifiers (e.g. Field Dressing x1.3) only increase yield — the anchor holds
    ok(deer && deer.hiddenKcal >= 20000 && deer.hiddenKcal <= 30000,
      'deer carcass sane (20000 base, modifiers up; got ' + (deer && deer.hiddenKcal) + ')');
    const rabbit = windedKill('cottontail_rabbit');
    ok(!!rabbit, 'winded rabbit kill produces a carcass');
    ok(rabbit && rabbit.hiddenKcal === 800, 'rabbit carcass ~800 kcal (one meal), got ' + (rabbit && rabbit.hiddenKcal));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
