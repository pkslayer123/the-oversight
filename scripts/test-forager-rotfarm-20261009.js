#!/usr/bin/env node
// BREAK-IT: forager r2 (2026-10-09, playtest loop, archetype: forager).
// Hostile pass over the preservation ladder's edges and the village rot economy.
//
//   E1. EXPLOIT: specialist master preserver PRINTS kcal. preserveFood's
//       self path is 0.95x known / 0.80x blind (a drying loss, sensible).
//       The specialist branch uses (0.95 + 0.02 * spec.skill) — skill caps at
//       3, so a master smokes at 1.01x: energy from nothing, repeatable on
//       every carcass that passes through their hands. Steve's canon
//       (PRESERVATION.md): "Energy is never created."
//   E2. ATTACK: the rot-farm winter. drawSpoiled lets the village eat
//       desperation rot at FULL kcal with a flat 50%/day severity-2 sickness
//       roll. A hostile forager could skip the whole preservation ladder:
//       overproduce, never preserve, let the village eat rot. Measure whether
//       the sickness cost is real (feared) or the clock is bypassable.
//   S1. SOFTLOCK: a player holding ONLY spoiled food — eat/cook/preserve/
//       gift/specialist must all refuse honestly with no stuck state, no kcal.
//   H1. HONESTY: smoke prep labels vs spoilDay stamps (self rough-job,
//       specialist), spoilClockShort countdown copy.
//
// Usage: node scripts/test-forager-rotfarm-20261009.js
//        BEFORE=1 node scripts/test-forager-rotfarm-20261009.js  (demonstrates E1)
//        SEED=7 node scripts/test-forager-rotfarm-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
const BEFORE = !!process.env.BEFORE;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; /* console.log('  ok   ' + name); */ }
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
function cleanMeat(kcalEach, units, spoilIn) {
  const s = Game.state.scholar;
  return {
    plantId: 'meat_white_tailed_deer', foodKind: 'meat', foodState: 'cleaned',
    edible: true, units, unit: 'portion', kcalEach, hiddenKcal: kcalEach * units * 2.5,
    spoilDay: s.day + spoilIn, name: 'Deer (cleaned)', kg: 0.8,
  };
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED} BEFORE=${BEFORE ? 1 : 0}`);

  // ============ E1. specialist master preserver prints kcal ============
  console.log('\n-- E1. specialist master smoke: no energy from nothing --');
  {
    const s = freshGame();
    const origSH = Game.specialistsHere;
    // real skill cap is 3 (specialistSkill: Math.min(3, ...)) — fisherman is preserver 3
    Game.specialistsHere = () => [{ id: 's1', name: 'S', skill: 3, occupation: 'fisherman' }];
    s.inventory.push(cleanMeat(500, 4, 2));
    const meatIdx = () => s.inventory.findIndex(i => i && /Deer/.test(i.name || ''));
    const before = 500 * 4;
    Game.askSpecialist('s1', meatIdx(), undefined, 'preserver');
    Game.specialistsHere = origSH;
    const it = s.inventory[meatIdx()];
    const after = (it.kcalEach || 0) * (it.units || 0);
    if (BEFORE) {
      ok('BEFORE: master smoke prints kcal (the bug)', after > before, `before=${before} after=${after}`);
    } else {
      ok('master smoke creates no kcal', after <= before, `before=${before} after=${after}`);
      ok('master wastes nothing (exactly 1.00x)', after === before, `after=${after}`);
      ok('still smoked (state changed)', it.foodState === 'preserved', it.foodState);
      ok('shelf stamp day+45 (skill 3)', it.spoilDay === s.day + 45, `spoilDay=${it.spoilDay} day=${s.day}`);
    }
    // skill 1 and 2 must also never print (regression on the cap)
    for (const sk of [1, 2]) {
      const s2 = freshGame();
      Game.specialistsHere = () => [{ id: 's1', name: 'S', skill: sk, occupation: 'chef' }];
      s2.inventory.push(cleanMeat(500, 4, 2));
      const mi2 = s2.inventory.findIndex(i => i && i.name === 'Deer (cleaned)');
      Game.askSpecialist('s1', mi2, undefined, 'preserver');
      Game.specialistsHere = origSH;
      const it2 = s2.inventory.find(i => i && /Deer/.test(i.name || ''));
      const a2 = (it2.kcalEach || 0) * (it2.units || 0);
      if (!BEFORE) ok(`skill ${sk}: no print`, a2 <= before, `after=${a2}`);
    }
  }

  // ============ E2. rot-farm winter ============
  console.log('\n-- E2. rot-farm winter: desperation economics --');
  function winterSim(rotted, days) {
    const s = freshGame();
    const v = Game.state.village;
    v.trust = v.trust || {}; for (const id of v.roster) v.trust[id] = 10;
    v.sick = {};
    const origProd = Game.villagerDayProduction;
    Game.villagerDayProduction = () => 0; // winter: nothing grows
    const startDay = 40;
    const eaters = v.roster.filter(id => id !== Game.villagerId).length;
    let eaten = 0, sickEpisodes = 0, rotAnnounced = 0;
    const healthTrace = [];
    for (let d = 0; d < days; d++) {
      const day = startDay + d;
      s.day = day; v.day = day;
      // the hostile strategy: the day's food arrives already-rotten (never preserved)
      v.pantry = v.pantry || [];
      v.pantry.push({
        name: 'Winter stores', kcalEach: 500, units: 60, spoilDay: rotted ? day : 99999,
        safe: true, foodKind: 'meat', foodState: 'preserved', kg: 0.2,
      });
      says.length = 0;
      Game.villageEats();
      Game.villageSicknessTick();
      eaten += v.lastEat || 0;
      for (const m of says) {
        if (/Nothing fresh left/.test(m)) rotAnnounced++;
        if (/now it's both/.test(m)) sickEpisodes++;
      }
      const ids = v.roster.filter(id => id !== Game.villagerId);
      const hs = ids.map(id => { const h = (v.health || {})[id]; return h === undefined ? 100 : h; });
      healthTrace.push((hs.reduce((a, b) => a + b, 0) / Math.max(1, hs.length)).toFixed(1));
      // dawn: the clock advances, rot is swept
      s.day = day + 1; v.day = day + 1;
      Game.sweepSpoiled();
    }
    Game.villagerDayProduction = origProd;
    const ids = v.roster.filter(id => id !== Game.villagerId);
    const healths = ids.map(id => { const h = (v.health || {})[id]; return h === undefined ? 100 : h; });
    const avgHealth = healths.reduce((a, b) => a + b, 0) / Math.max(1, healths.length);
    const dead = ids.filter(id => (Game.getPerson(id) || {}).dead).length;
    const sickNow = Object.keys(v.sick || {}).length;
    return { eaten, sickEpisodes, rotAnnounced, avgHealth, dead, sickNow, eaters, healthTrace };
  }
  {
    const DAYS = 12;
    const fresh = winterSim(false, DAYS);
    const rot = winterSim(true, DAYS);
    console.log(`  fresh winter: eaten=${Math.round(fresh.eaten)} avgHealth=${fresh.avgHealth.toFixed(1)} dead=${fresh.dead} sickEpisodes=${fresh.sickEpisodes}`);
    console.log(`  rot winter:   eaten=${Math.round(rot.eaten)} avgHealth=${rot.avgHealth.toFixed(1)} dead=${rot.dead} sickEpisodes=${rot.sickEpisodes} rotAnnounced=${rot.rotAnnounced} sickNow=${rot.sickNow}`);
    console.log(`  rot health trace: ${rot.healthTrace.join(' ')}`);
    console.log(`  fresh health trace: ${fresh.healthTrace.join(' ')}`);
    ok('fresh winter: village eats (~full need)', fresh.eaten > fresh.eaters * 1500 * DAYS * 0.8,
      `eaten=${Math.round(fresh.eaten)}`);
    ok('fresh winter: no sickness', fresh.sickEpisodes === 0, `episodes=${fresh.sickEpisodes}`);
    if (!BEFORE) {
      // The attack: rot must NOT be a free bypass of the preservation ladder.
      // (Sick villagers can't re-sicken while sick, so episodes run ~1.5-2/day
      // steady-state, not 50% of villager-days — the cost is the health drain.)
      ok('rot winter: desperation announced, never silent', rot.rotAnnounced > 0, `announced=${rot.rotAnnounced}`);
      ok('rot winter: sickness actually lands (feared, not cosmetic)', rot.sickEpisodes >= DAYS, `episodes=${rot.sickEpisodes}`);
      ok('rot winter: health craters vs fresh', rot.avgHealth < fresh.avgHealth - 15,
        `rot=${rot.avgHealth.toFixed(1)} fresh=${fresh.avgHealth.toFixed(1)}`);
      ok('rot winter: rot still feeds (desperation works — no starvation lie)', rot.eaten > rot.eaters * 1500 * DAYS * 0.8,
        `eaten=${Math.round(rot.eaten)}`);
    }
  }

  // ============ S1. softlock: player holding only rot ============
  console.log('\n-- S1. only-rot pack: every path refuses honestly --');
  {
    const s = freshGame();
    s.inventory.length = 0; // the scholar holds ONLY rot — no trail-mix escape hatch
    const rotIdx = () => s.inventory.findIndex(i => i && /Deer/.test(i.name || ''));
    s.inventory.push(cleanMeat(400, 2, -10)); // spoilDay 10 days ago: rot past any preservation_instinct bonus
    s.kcal = 100;
    const kcalBefore = s.kcal;
    let threw = null;
    try {
      Game.eatOne(rotIdx());                // refuse, rot stays
      ok('eatOne refuses rot (still in pack)', rotIdx() >= 0, 'rot gone?');
      Game.cookFood(rotIdx());              // rot dropped, nothing cooked
      s.inventory.push(cleanMeat(400, 2, -10));
      const origNF = Game.nearFire;
      Game.nearFire = () => true;
      Game.preserveFood(rotIdx());          // rot dropped, nothing smoked
      Game.nearFire = origNF;
      s.inventory.push(cleanMeat(400, 2, -10));
      const origSH = Game.specialistsHere;
      Game.specialistsHere = () => [{ id: 's1', name: 'S', skill: 3, occupation: 'fisherman' }];
      Game.askSpecialist('s1', rotIdx(), undefined, 'preserver'); // refuses rot
      Game.specialistsHere = origSH;
      s.inventory.push(cleanMeat(400, 2, -10));
      Game.giveFood(Game.state.village.roster.find(id => id !== Game.villagerId)); // no food to give
    } catch (e) { threw = e; }
    ok('no throw anywhere on the rot lifecycle', !threw, threw && threw.message);
    ok('no kcal granted from rot', s.kcal === kcalBefore, `kcal=${s.kcal} before=${kcalBefore}`);
    ok('giveFood honest with only rot', says.some(m => /no food to give/i.test(m)),
      says.slice(-3).join(' | '));
    ok('refusals narrated (not silent)', says.some(m => /went bad|won.t touch|beyond/i.test(m)),
      says.slice(-8).join(' | '));
  }

  // ============ H1. honesty: smoke labels vs stamps ============
  console.log('\n-- H1. smoke labels vs spoilDay stamps --');
  {
    // self rough-job smoke
    const s = freshGame();
    const origNF = Game.nearFire;
    Game.nearFire = () => true;
    const knewBefore = Game.knowsTechnique('preserve');
    s.inventory.push(cleanMeat(400, 2, 2));
    const hIdx = () => s.inventory.findIndex(i => i && i.name === 'Deer (cleaned)');
    if (!knewBefore) {
      Game.preserveFood(hIdx());
      const it = s.inventory.find(i => i && /Deer/.test(i.name || ''));
      ok('rough smoke: stamp day+15', it.spoilDay === s.day + 15, `spoilDay=${it.spoilDay}`);
      ok('rough smoke: prep says two weeks, not a month', /two weeks/i.test(it.prep || ''),
        it.prep);
    } else {
      ok('scholar already knows preserve (skip rough-job label check)', true);
    }
    Game.nearFire = origNF;
    // spoilClockShort copy
    const it2 = cleanMeat(400, 1, 1);
    ok('clock: spoils tomorrow at left=1', Game.spoilClockShort(it2) === '\u26A0 spoils tomorrow',
      JSON.stringify(Game.spoilClockShort(it2)));
    const it3 = cleanMeat(400, 1, 2);
    ok('clock: spoils in 2d at left=2', Game.spoilClockShort(it3) === 'spoils in 2d',
      JSON.stringify(Game.spoilClockShort(it3)));
    const it4 = cleanMeat(400, 1, 0);
    ok('clock: silent at left=0 (row flags spoiled)', Game.spoilClockShort(it4) === '',
      JSON.stringify(Game.spoilClockShort(it4)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
