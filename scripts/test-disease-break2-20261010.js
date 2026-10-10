#!/usr/bin/env node
// Break-it disease proof tests, run 2026-10-10 (target: DISEASE SYSTEM, round 2).
// Round 1 (commit 9b791347) closed: tick-escalation lie, legacy mirror desync,
// rattlesnake phantom mirror, dead chronic/tickRolled. Persistence r8
// (a985b247) closed the _seSeq save/load collision. Do NOT re-litigate those.
//
// Round-2 attacks (deeper layers):
//   EXPLOIT   — infection-seeking: can a hostile player shed the alien
//               drawbacks while keeping the buffs? permanence under a tick
//               storm; pool gates re-verified.
//   SOFTLOCK  — alien statuses: no legacy mirror, no phantom entries; no
//               cure-path UI that promises what the engine won't do.
//   HONESTY   — eurika-sense "ambushes announce themselves" vs the tent
//               breach (was: silent — the breach is an ambush and the old
//               code gave eurika carriers zero warning); shellgut "nothing
//               ingested can touch you" vs the suspect-food poison roll
//               (was: the 20%/-5 roll still bit); villager meal-sim parity.
//   DEAD CODE — vector functions + monster defs reachable.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. EURIKA-SENSE TENT-BREACH GAP (honesty): wandererTentBreach handled
//      eyes_in_back (flap-catch, no ambush) but had no eurika branch — a
//      eurika carrier asleep in a tent got the full silent breach (tent
//      wrecked, -5 health, monster inside) while the def promises
//      "ambushes announce themselves first". Fixed: eurika branch mirroring
//      eyes_in_back — out the other side before it gets inside (game.js).
//   2. SHELLGUT UNSAFE-FOOD LIE (honesty): the def promises "immune to
//      ingested poison and food-borne disease" / "nothing ingested can touch
//      you", and diseaseRisk/parasiteRisk/poisonRisk were all gated — but
//      the suspect-food roll (safe===false, 20%/-5 health, food.poison_chance)
//      was NOT. A shellgut carrier eating dubious food still took the hit.
//      Fixed: gate the unsafe roll on shellgut in eat() and eatOne().
//   3. SIBLING SWEEP — villagerFoodPoisoning: a villager carrying shellgut
//      (via villagerMonsterWeirdness) could still be sickened by the RAW /
//      UNSAFE / POISON meal-sim branches. Same bug class, same promise.
//      Fixed: armored villagers skip those three branches. SPOILED
//      deliberately NOT gated — "the rot always collects" is an explicit
//      design statement (desperation), and rot is not poison/disease.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - Alien permanence: eurika/east_nile/lemons have no duration; 200
//     dayPart ticks leave them held, ticks still bite (1/2/1 HP per part).
//     No cure/ease path reaches them (all iterate sickDiseases(), mundane
//     only); respawn is a new body (explicit "no old afflictions"); death
//     cheats don't wipe statuses.
//   - Torch/re-latch lemons farm: each latch is a new 50% roll and a torch
//     releases before feeding — a seeker can roll ~50%/turn at ~8 HP/latch.
//     Real costs (wave-2 fight, latch damage, torch in hand); min-max is
//     welcome per canon. Not a break.
//   - East Nile crow warnings fire only for the map wanderer — the tent
//     breach is the SAME wanderer already announced. Directional danger
//     sense holds; no second warning needed.
//   - eatOne/eat bulk never double-apply lemons engorge (separate paths).
//
// Run: node scripts/test-disease-break2-20261010.js   (SEED env override)
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

const ALIEN = ['howlbelly', 'gristlefit', 'croakbelly', 'shellgut', 'witness_maw', 'flockmind', 'eurika', 'east_nile', 'lemons'];
function resetScholar() {
  Game.state.scholar.statuses = [];
  Game.state.scholar.diseases = [];
  Game.state.scholar.poisons = [];
  Game.state.scholar.health = 100;
  Game.state.scholar.diagnosed = {};
  Game.state.scholar.kcal = 0;
  Game.state.scholar.inventory = [];
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  const realSay = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); };
  const clearSaid = () => { said.length = 0; };

  console.log('\n[honesty] FIX: eurika-sense warns at the tent flap (was: silent breach)');
  {
    // control: no eurika, big monster -> the full breach (tent wrecked, -5 hp)
    resetScholar(); clearSaid();
    Game.state.scholar.insideTent = { tx: 0, ty: 0, cx: 4, cy: 4 };
    Game.state.scholar.tentSmoke = 0;
    Game.state.scholar.health = 100;
    Game.pendingEncounter = false; Game.pendingMonsterId = null;
    Game.wandererTentBreach('bulldozer'); // size>=2: the tent-wrecker
    const breached = said.join('\n');
    ok(/EXPLODES/.test(breached), 'control: big-monster breach still wrecks the tent without eurika');
    ok(Game.state.scholar.health === 95, 'control: breach costs 5 health without eurika');
    ok(Game.pendingEncounter === true && Game.pendingMonsterId === 'bulldozer', 'control: encounter still pending after breach');
    // FIXED: eurika carrier gets the flap-catch, not the breach
    resetScholar(); clearSaid();
    Game.applyStatus('scholar', 'eurika', { source: 'test' });
    Game.state.scholar.insideTent = { tx: 0, ty: 0, cx: 4, cy: 4 };
    Game.state.scholar.tentSmoke = 0;
    Game.state.scholar.health = 100;
    Game.pendingEncounter = false; Game.pendingMonsterId = null;
    Game.wandererTentBreach('bulldozer');
    const sensed = said.join('\n');
    ok(/eurika-sense: no ambush/.test(sensed), 'eurika: sense line fires at the tent flap');
    ok(!/EXPLODES/.test(sensed), 'eurika: no tent wreck (the promise: ambushes announce themselves)');
    ok(Game.state.scholar.health === 100, 'eurika: no breach damage');
    ok(Game.pendingEncounter === true && Game.pendingMonsterId === 'bulldozer', 'eurika: still a real fight, on your feet');
    ok(Game.state.scholar.insideTent === null, 'eurika: out of the tent before it gets inside');
    // small monster, eurika: same treatment (no silent in-tent fight)
    resetScholar(); clearSaid();
    Game.applyStatus('scholar', 'eurika', { source: 'test' });
    Game.state.scholar.insideTent = { tx: 0, ty: 0, cx: 4, cy: 4 };
    Game.pendingEncounter = false; Game.pendingInTent = false;
    Game.wandererTentBreach('belltoad');
    ok(/eurika-sense: no ambush/.test(said.join('\n')) && Game.pendingInTent !== true,
      'eurika: small-monster flap-catch too (never a silent in-tent fight)');
  }

  console.log('\n[honesty] FIX: shellgut armored gut covers suspect food (was: unsafe roll bit anyway)');
  {
    const dubious = () => ({ name: 'dubious haunch', kcalEach: 200, units: 1, safe: false, plantId: 'blackberry', spoilDay: 999, diseaseRisk: null, parasiteRisk: null, poisonRisk: null });
    const seeded = Math.random;
    Math.random = () => 0.05; // below the 20% suspect-food poison roll: it WILL fire if ungated
    try {
      // control: no shellgut -> the roll bites
      resetScholar();
      Game.state.scholar.inventory = [dubious()];
      Game.eatOne(0);
      ok(Game.state.scholar.health === 95, 'control: suspect food still bites without shellgut (-5)');
      // FIXED: shellgut -> immune, food still eaten
      resetScholar();
      Game.applyStatus('scholar', 'shellgut', { source: 'test' });
      Game.state.scholar.inventory = [dubious()];
      const k0 = Game.state.scholar.kcal;
      Game.eatOne(0);
      ok(Game.state.scholar.health === 100, 'shellgut: suspect-food poison roll cannot touch you');
      ok(Game.state.scholar.kcal > k0, 'shellgut: the meal still feeds (immunity, not refusal)');
      // both eat paths carry the gate (code-level: the bulk path can't be
      // isolated behaviorally without a full pantry, so assert the gate)
      const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
      ok(/if \(it\.safe === false && !shellgut\)/.test(src), 'eat() bulk path gates unsafe roll on shellgut');
      ok(/if \(it\.safe === false && !shellgut1\)/.test(src), 'eatOne() path gates unsafe roll on shellgut');
    } finally { Math.random = seeded; }
  }

  console.log('\n[sibling] villager shellgut: meal-sim honors the armored gut');
  {
    const v = Game.state.village;
    v.sick = {};
    const roster = (v.roster || []).filter(id => id !== Game.villagerId);
    ok(roster.length > 0, 'harness: village roster has treatable villagers');
    const vid = roster[0];
    const person = Game.getPerson(vid);
    const seeded = Math.random;
    Math.random = () => 0.05; // every roll fires if ungated
    try {
      // control: unarmored villager sickens on an unsafe meal
      delete v.sick[vid];
      const cases0 = Game.villagerFoodPoisoning(v, vid, { unsafe: true });
      ok(cases0 === 1 && v.sick[vid], 'control: unarmored villager sickens on suspect meal');
      // FIXED: shellgut villager shrugs raw/unsafe/poison
      delete v.sick[vid];
      Game.applyStatus(person, 'shellgut', { source: 'test', silent: true });
      const cases1 = Game.villagerFoodPoisoning(v, vid, { unsafe: true });
      const cases2 = Game.villagerFoodPoisoning(v, vid, { raw: [{ p: 1 }] });
      const cases3 = Game.villagerFoodPoisoning(v, vid, { poison: [{ p: 1 }] });
      ok(cases1 === 0 && cases2 === 0 && cases3 === 0 && !v.sick[vid],
        'shellgut villager: raw/unsafe/poison meal branches all slide off');
      // rot still collects (explicit design: desperation)
      const cases4 = Game.villagerFoodPoisoning(v, vid, { spoiled: true });
      ok(cases4 === 1 && v.sick[vid] && /spoiled/.test(v.sick[vid].name),
        'rot still collects on an armored gut (desperation is desperation)');
      delete v.sick[vid];
      Game.cureStatus(person, 'shellgut', 'test');
    } finally { Math.random = seeded; }
  }

  console.log('\n[exploit] alien permanence under a tick storm (no duration to reset, no backdoor)');
  {
    resetScholar();
    Game.applyStatus('scholar', 'eurika', { source: 'test' });
    Game.applyStatus('scholar', 'east_nile', { source: 'test' });
    Game.applyStatus('scholar', 'lemons', { source: 'test' });
    Game.state.scholar.health = 100000; // survive the storm; the point is presence, not death
    for (let i = 0; i < 200; i++) Game.tickStatuses('scholar', 'dayPart');
    ok(Game.hasStatus('scholar', 'eurika') && Game.hasStatus('scholar', 'east_nile') && Game.hasStatus('scholar', 'lemons'),
      '200 dayParts: all three alien viruses still held (permanent warping)');
    ok(Game.state.scholar.health < 100000, 'the ongoing costs are real (ticks bit through the storm)');
    // pool gates re-verified (round-1 regression)
    resetScholar();
    let refused = 0;
    for (const id of ALIEN) if (Game.contractDisease(id, { source: 'hostile' }) === false) refused++;
    ok(refused === ALIEN.length, 'contractDisease still refuses all 9 alien ids');
    Game.applyStatus('scholar', 'eurika', { source: 'test' });
    ok(!Game.sickDiseases().some(e => ALIEN.includes(e.id)), 'sickDiseases still excludes alien');
    const sig = Game.seList('scholar').map(e => e.id).join(',');
    try { Game.folkRemedy('rest'); } catch (e) {}
    try { Game.treatDisease('herbal_remedy'); } catch (e) {}
    ok(Game.seList('scholar').map(e => e.id).join(',') === sig, 'folk/ability paths still leave alien statuses untouched');
  }

  console.log('\n[softlock] alien statuses leave no legacy mirror (no phantom entries)');
  {
    resetScholar();
    Game.applyStatus('scholar', 'howlbelly', { source: 'test' });
    Game.applyStatus('scholar', 'witness_maw', { source: 'test' });
    ok((Game.state.scholar.diseases || []).length === 0, 'alien quirks write no s.diseases mirror (nothing to ghost)');
    // TWO-POOLS LAW (break-it disease 2026-10-10): the generic cure path is
    // not a back door — cureStatus refuses alien biology. Targeted removal
    // of one quirk goes through the engine removal path (seRemove, as used
    // by natural expiry), which must drop only the named entry.
    const refused = Game.cureStatus('scholar', 'howlbelly', 'test');
    ok(refused === false && Game.hasStatus('scholar', 'howlbelly') && Game.hasStatus('scholar', 'witness_maw'),
      'cureStatus refuses alien quirks (both stay)');
    const entry = (Game.seList('scholar') || []).find(e => e.id === 'howlbelly');
    Game.seRemove('scholar', entry);
    ok(!Game.hasStatus('scholar', 'howlbelly') && Game.hasStatus('scholar', 'witness_maw'),
      'targeted removal drops only the named quirk');
  }

  console.log('\n[dead-code] vectors + defs reachable at runtime');
  {
    ok(typeof Game.mosquitoBiteVirus === 'function' && typeof Game.tbMosquitoTurn === 'function' &&
       typeof Game.tbTickTurn === 'function' && typeof Game.removeTick === 'function' &&
       typeof Game.wandererTentBreach === 'function' && typeof Game.villagerFoodPoisoning === 'function',
      'all disease vector/removal/meal functions reachable');
    const giants = (Game.data.monsters || []).filter(m => m.id === 'giant_mosquito' || m.id === 'alien_tick');
    ok(giants.length === 2, 'giant_mosquito + alien_tick defs present');
    const md = (Game.data.cooking || {}).monsterDiseases || [];
    const mids = new Set((Game.data.monsters || []).map(m => m.id));
    ok(md.length === 6 && md.every(d => (d.monsters || []).every(mid => mids.has(mid))),
      'meat-quirk table maps to real monster ids only');
  }

  Game.say = realSay;
  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  if (failures.length) console.log('failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
