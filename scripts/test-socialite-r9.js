// BREAK-IT socialite r9 (2026-10-09): the trust/gift/apology economy.
// HOSTILE STANCE: a player who treats every social verb as a resource faucet.
// Standing canon: docs/CANON.md ("Trust != reputation"), "words only go so
// far" (talk trust caps at 40; above 40 comes from real acts — food, kept
// promises, fair deals, interpreter thanks).
//
// E1 — TRIVIAL-GIFT FARM: giveFood's live path (carexplore.js override) pays
//   FIXED trust per portion size (bite +4 / meal +10 / full +16, x1.5 private)
//   through trustGainProgressive + setTrust — the gift's kcal NEVER enters.
//   Claim: a 1-kcal crumb-bite pays like a 400-kcal steak-bite, and repeated
//   1-kcal bites farm trust with no per-gift minimum, no diminishing returns
//   beyond the global progressive curve, no daily cap.
// E2 — THEFT->APOLOGY LOOP: steal 10x (real gain), apologize via makeAmends
//   (words). Net trust >= 0 with net goods > 0?
// E3 — GROUP N x FARM: rallyVillage pays +3 to the whole roster through the
//   resolver (r5 fix: once per day-part, 40 words-cap). Verify the gate holds
//   and no other group-trust faucet exists.
// S1 — SOFTLOCK PROBE: gift/apology/bribe/promise edge paths must resolve or
//   refuse honestly (null + a said line), never strand or throw.
// H1 — HONESTY: bribe (deal/appeal) only after a live refusal (UI); gift UI
//   copy promises no trust numbers.
//
// Run: node scripts/test-socialite-r9.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\\\\\\\"]+\.js|src\/js\/engine\/[^\/\\\\\\\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

async function freshWorld() {
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  const S = Game.state, v = S.village, me = Game.villagerId;
  const npcs = (v.roster || []).filter(id => id !== me);
  return { S, v, me, npcs };
}
const trustOf = (v, vid) => { const t = (v.trust || {})[vid]; return t === undefined ? 10 : t; };

(async () => {
  // ============ E1: trivial-gift farm ============
  {
    const { S, v, me, npcs } = await freshWorld();
    const A = npcs[0], B = npcs[1];
    v.trust[A] = 15; v.trust[B] = 15;
    // A holds 60 units of 1-kcal crumbs; B holds 60 units of 400-kcal steaks.
    S.scholar.inventory = [
      { name: 'Dandelion petal', kcalEach: 1, units: 60 },
      { name: 'Cooked steak', kcalEach: 400, units: 60 },
    ];
    // keep hunger low so the starving-bite sting never fires
    Game.npcNeeds(A).hunger = 10; Game.npcNeeds(B).hunger = 10;
    // neutralize disposition noise: force measured temperament-ish by reading
    // the applied delta of the FIRST gift on each target
    const tA0 = trustOf(v, A), tB0 = trustOf(v, B);
    Game.giveFood(A, 'bite'); // takes from FIRST edible stack = the 1-kcal petals
    const dCrumb = trustOf(v, A) - tA0;
    // now give B a bite from the steak stack: remove petals first
    S.scholar.inventory = S.scholar.inventory.filter(i => i.kcalEach !== 1);
    Game.giveFood(B, 'bite');
    const dSteak = trustOf(v, B) - tB0;
    console.log(`--- E1: first-bite applied trust: 1-kcal crumb=+${dCrumb}, 400-kcal steak=+${dSteak}`);
    check('E1a a 1-kcal bite does not pay like a 400-kcal bite', dSteak > dCrumb,
      `crumb +${dCrumb} vs steak +${dSteak}`);

    // the farm: 50 more 1-kcal bites on A, trace the climb
    S.scholar.inventory = [{ name: 'Dandelion petal', kcalEach: 1, units: 60 }];
    v.trust[A] = 15;
    Game.npcNeeds(A).hunger = 10;
    const ticks0 = S.scholar.dayTicks || 0;
    let gifts = 0;
    const trace = [];
    for (let i = 0; i < 50; i++) {
      const r = Game.giveFood(A, 'bite');
      if (!r) { trace.push(`gift ${i}: giveFood returned null`); break; }
      gifts++;
      if (i < 3 || (i + 1) % 10 === 0) trace.push(`gift ${i + 1}: trust=${trustOf(v, A)}`);
      if (trustOf(v, A) >= 90) { trace.push(`reached 90 at gift ${i + 1}`); break; }
    }
    console.log('--- E1: 1-kcal bite farm (trust starts at 15) ---');
    trace.forEach(t => console.log('  ' + t));
    const end = trustOf(v, A);
    const ticks = (S.scholar.dayTicks || 0) - ticks0;
    console.log(`  cost: ${gifts} units (1 kcal each) + ${ticks} ticks`);
    check('E1b 1-kcal bites cannot farm trust past 40 (words-in-food-disguise)', end <= 40,
      `15 -> ${end} over ${gifts} gifts`);
  }

  // ============ E2: theft -> apology loop ============
  {
    const { S, v, me, npcs } = await freshWorld();
    const C = npcs[2];
    v.trust[C] = 40;
    // make sure C has a pack worth stealing
    Game.packKcal(C);
    const kcal0 = S.scholar.kcal || 0;
    let unseen = 0, caught = 0, gainedUnits = 0;
    for (let i = 0; i < 10; i++) {
      // top up the pack so every steal has something to take
      if (Game.packKcal(C) < 100) { v.pack[C].kcal = 800; }
      const invBefore = (S.scholar.inventory || []).reduce((s, it) => s + (it.stolen ? (it.units || 0) : 0), 0);
      const r = Game.stealFrom(C);
      const invAfter = (S.scholar.inventory || []).reduce((s, it) => s + (it.stolen ? (it.units || 0) : 0), 0);
      if (r === 'unseen') { unseen++; gainedUnits += (invAfter - invBefore); }
      else if (r === 'caught') caught++;
    }
    // let the victim notice (advance a day-part) then apologize where possible
    Game.theftNoticeSweep && Game.theftNoticeSweep();
    const trustAfterSteals = trustOf(v, C);
    const rep = Game.repOf ? Game.repOf(C) : {};
    // makeAmends: only ONE per villager per day (contrition takes time).
    // try 10 in one sitting — only the first may land.
    let amends = 0, refused = 0;
    for (let i = 0; i < 10; i++) {
      const r = Game.makeAmends(C);
      if (r && r.ok) amends++;
      else refused++;
    }
    const trustEnd = trustOf(v, C);
    console.log(`--- E2: steal 10x -> apology: unseen=${unseen} caught=${caught} stolenUnits=${gainedUnits}`);
    console.log(`  trust 40 -> ${trustAfterSteals} after steals -> ${trustEnd} after ${amends} amends (${refused} refused same-day); rep=${JSON.stringify(rep)}`);
    check('E2a one amends per villager per day', amends === 1 && refused === 9,
      `amends=${amends} refused=${refused}`);
    check('E2b theft->apology no longer trust-neutral in one sitting',
      trustEnd < 40,
      `trust 40 -> ${trustEnd}`);
  }

  // ============ E3: group N x farm (rally) ============
  {
    const { S, v, me, npcs } = await freshWorld();
    const D = npcs[3];
    v.trust[D] = 10;
    // spam rally in the SAME day-part
    let ok = 0, nul = 0;
    for (let i = 0; i < 5; i++) { const r = Game.rallyVillage(); if (r && r.ok) ok++; else nul++; }
    const afterSpam = trustOf(v, D);
    console.log(`--- E3: rally spam same part: ok=${ok} refused=${nul} trust 10 -> ${afterSpam}`);
    check('E3a rally is once per day-part', ok === 1 && nul === 4, `ok=${ok}`);
    // rally across 12 day-parts (3 days): words must cap at 40.
    // PRECISION (r9): rallyVillage advances 2 ticks, which can cross a part
    // boundary and run real NPC life (companion travel +1 trust — a real act,
    // not words). So measure the RALLY's own applied trust, not the ambient
    // world: no rally may apply positive trust starting at/above 40, and the
    // rally's total contribution 10->40 is at most 30.
    const deltas = [];
    const origRC = Game.resolveConsequence.bind(Game);
    Game.resolveConsequence = function (vid, spec) {
      const b = trustOf(v, vid);
      const r = origRC(vid, spec);
      if (vid === D && spec.name === 'rally') deltas.push({ b, applied: r.trust });
      return r;
    };
    for (let d = 0; d < 12; d++) {
      S.scholar.day = 1 + Math.floor(d / 4);
      Game.dayPart = d % 4;
      Game.rallyVillage();
    }
    Game.resolveConsequence = origRC;
    const overCap = deltas.filter(x => x.b >= 40 && x.applied > 0);
    const total = deltas.reduce((s, x) => s + x.applied, 0);
    console.log(`  rally deltas: ${deltas.map(x => `${x.b}+${x.applied}`).join(' ')} (total +${total})`);
    check('E3b rally words cap at 40 (no N x group farm)',
      overCap.length === 0 && total <= 30,
      `overCap=${overCap.length} totalRallyTrust=+${total}`);
  }

  // ============ S1: softlock probe ============
  {
    const { S, v, me, npcs } = await freshWorld();
    const E = npcs[4];
    let threw = null;
    try {
      S.scholar.inventory = []; // no food at all
      const r1 = Game.giveFood(E, 'bite');
      check('S1a gift with no food refuses honestly', r1 === null, `returned ${JSON.stringify(r1)}`);
      const r2 = Game.giveFood('no-such-villager', 'meal');
      check('S1b gift to non-roster id refuses honestly', r2 === null, `returned ${JSON.stringify(r2)}`);
      const r3 = Game.makeAmends(E); // no grudge at fresh start
      check('S1c apology with no offense refuses honestly', r3 === null, `returned ${JSON.stringify(r3)}`);
      const r4 = Game.offerDeal(E, 'forage'); // no food to offer
      check('S1d deal with no food refuses honestly', r4 === null, `returned ${JSON.stringify(r4)}`);
      const r5 = Game.appealToGoal(E, 'forage'); // goal unknown at start
      check('S1e appeal with unknown goal refuses honestly', r5 === null, `returned ${JSON.stringify(r5)}`);
      // promise to a dead villager / double promise
      const r6 = Game.giveFood(E, 'bite');
      check('S1f gift still null with empty inventory', r6 === null, `returned ${JSON.stringify(r6)}`);
    } catch (e) { threw = e; }
    check('S1g no edge path throws', threw === null, threw ? threw.message : 'clean');
  }

  // ============ H1: honesty ============
  {
    const { S, v, me, npcs } = await freshWorld();
    // gift UI copy: must promise no trust numbers
    const opts = Game.giveFoodOptions();
    const copy = opts.map(o => o.label + ' ' + o.desc).join(' | ');
    const promisesNumbers = /trust \+\d|\+trust/i.test(copy);
    console.log('--- H1 gift UI copy: ' + copy.slice(0, 160) + '...');
    check('H1a gift UI promises no trust numbers', !promisesNumbers, promisesNumbers ? 'LEAK: ' + copy : 'clean');
    // engine: offerDeal pays +10 deed trust for 1 unit — the UI only offers it
    // after a live refusal (app.js refused branch). Verify the refused-branch
    // gating exists in the shipped UI source.
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    const refusedIdx = appSrc.indexOf('view.refused && view.refusedTask');
    const dealBtnIdx = appSrc.indexOf("data-refuse");
    check('H1b deal/appeal buttons live inside the refused branch only',
      refusedIdx !== -1 && dealBtnIdx > refusedIdx,
      `refusedBranch@${refusedIdx} dealBtn@${dealBtnIdx}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
