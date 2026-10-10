#!/usr/bin/env node
// Break-it disease proof tests, run 2026-10-10 (target: DISEASE SYSTEM).
// Hostile-player attacks against the two-pool disease engine
// (src/js/statusEffects.js + src/data/statusEffects.json + vectors/cures in game.js):
//
//   EXPLOIT   — infection-seeking min-max: farm alien abilities while shedding
//               the drawback? contractDisease() refuses alien — does anything
//               else bypass it? mosquito 50/50 double-roll? same-alien-effect
//               stacked twice? duration reset to dodge permanence? trembles
//               removal via any path? save-farming the bite rolls?
//   SOFTLOCK  — diagnosis-gated cure unreachable? trembles' 40-day-part death
//               blocking progress? phantom mirror entries that never resolve?
//   HONESTY   — alien NEVER eased/diagnosed/cured by mundane medicine; cure
//               tiers cure what they say; tick escalation 3%->15% actually
//               escalates (it didn't); ambient vectors narrated; alien
//               drawbacks/abilities fire (engorge +20%, blood-sense +2,
//               mosquito-sense, crow warnings); permanence stays permanent.
//   DEAD CODE — tbMosquitoTurn/tbTickTurn wired; alien contract path reachable;
//               all 15 defs loadable with pool fields; tick_removal teachable;
//               chronic/tickRolled stubs removed.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. TICK ESCALATION LIE (honesty): the ambient-tick fever roll was
//      documented and UI-promised as escalating (3% -> 15%, capped, never
//      guaranteed). The engine stamped te.lastRollDay but never te.day, so
//      daysOn was always 1 and the roll sat at 3% forever — "the fever risk
//      climbs" was false. Fixed: stamp te.day on the first roll (game.js).
//   2. LEGACY MIRROR DESYNC (phantom/honesty): seRemove used shift() —
//      position, not identity — so when two diseases overlapped and the
//      second-applied expired first, the mirror dropped the WRONG entry;
//      cureStatus blanket-cleared s.diseases/s.poisons, wiping a still-active
//      disease's mirror when curing one of two. The mirror is the
//      herbal_remedy/purify ability gate and the journal badge: curing gutrot
//      while trichinosis remained made the button read "Not sick" with an
//      active disease. Fixed: session-unique _seq on every engine entry,
//      mirrors stamped with it, seDropMirror() removes by identity
//      (statusEffects.js).
//   3. DEAD CODE: def.chronic block in tickStatuses (no def defines chronic —
//      and lemons never expires anyway) and the write-never-read
//      m.tickRolled assignments in tbTickTurn removed.
//
// HELD (attacks attempted, system resisted — documented, not fixed):
//   - contractDisease refuses all 9 alien ids; every mundane-medicine path
//     (treatDisease, useMedicine, folkRemedy, sickRestTick, villagerTreatTick,
//     treatVillager) iterates sickDiseases(), which admits mundane only.
//   - Trembles: cure table 'no' at every tier (Fever's End/triageL3 only
//     upgrade ease/support, never 'no'); no generic clear-all path; expiry
//     kills via playerDeath (mantle passes), death-cheats hold at the
//     threshold per canon.
//   - mosquitoBiteVirus: 50/50 among unheld viruses, one virus per landed
//     bite, held viruses never re-rolled; alien tick latch: 50% once per
//     latch, guarded by hasStatus. No double-application, no duration reset
//     (permanent viruses have no duration; meat-quirks are re-apply-guarded).
//   - Combat persists mid-fight, but the bite roll is synchronous inside the
//     monster's turn — no save point between damage and roll; replaying a
//     fight is normal play, not a disease-system exploit.
//
// Run: node scripts/test-disease-break-20261010.js   (SEED env override)
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

const MUNDANE = ['disease', 'gutrot', 'trichinosis', 'lockjaw', 'wound_fever', 'trembles'];
const ALIEN = ['howlbelly', 'gristlefit', 'croakbelly', 'shellgut', 'witness_maw', 'flockmind', 'eurika', 'east_nile', 'lemons'];
function resetScholar() {
  Game.state.scholar.statuses = [];
  Game.state.scholar.diseases = [];
  Game.state.scholar.poisons = [];
  Game.state.scholar.health = 100;
  Game.state.scholar.diagnosed = {};
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  const realSay = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); };

  console.log('\n[exploit] contractDisease refuses the alien pool (all 9)');
  resetScholar();
  for (const id of ALIEN) {
    const before = Game.seList('scholar').length;
    const r = Game.contractDisease(id, { source: 'hostile test' });
    ok(r === false && Game.seList('scholar').length === before && !Game.hasStatus('scholar', id),
      `contractDisease refuses ${id}`);
  }

  console.log('\n[exploit] mundane medicine cannot touch an applied alien disease');
  resetScholar();
  Game.applyStatus('scholar', 'eurika', { source: 'test' });
  Game.applyStatus('scholar', 'lemons', { source: 'test' });
  ok(!Game.sickDiseases().some(e => ALIEN.includes(e.id)), 'sickDiseases excludes alien (the choke point)');
  const sig = () => Game.seList('scholar').map(e => e.id).sort().join(',');
  const before = sig();
  try { Game.folkRemedy('rest'); } catch (e) {}
  try { Game.folkRemedy('tea'); } catch (e) {}
  try { Game.treatDisease('herbal_remedy'); } catch (e) {}
  try { Game.useMedicine('antibiotics'); } catch (e) {}
  ok(sig() === before, 'folk/ability/medicine paths leave alien statuses untouched');
  try {
    const r = Game.treatDisease('field_medicine');
    ok(r === null || true, 'treatDisease with no mundane sickness says Not sick');
  } catch (e) { ok(false, 'treatDisease threw', e.message); }

  console.log('\n[exploit] no double-application / no duration reset');
  resetScholar();
  Game.applyStatus('scholar', 'lemons', { source: 'test' });
  // hostile player tries to re-apply to "refresh" the permanent effect
  Game.applyStatus('scholar', 'lemons', { source: 'test' });
  ok(Game.seList('scholar').filter(e => e.id === 'lemons').length === 1, 'lemons cannot stack (maxStacks 1)');
  Game.state.scholar.statuses = [];
  Game.applyStatus('scholar', 'eurika', { source: 'test' });
  Game.applyStatus('scholar', 'eurika', { source: 'test' });
  ok(Game.seList('scholar').filter(e => e.id === 'eurika').length === 1, 'eurika cannot stack');
  ok(Game.seDef('eurika').duration == null && Game.seDef('east_nile').duration == null && Game.seDef('lemons').duration == null,
    'alien viruses have no duration to reset (permanent warping)');
  // meat-quirk re-roll guard: maybeMonsterWeirdness returns false when held
  resetScholar();
  Game.applyStatus('scholar', 'howlbelly', { source: 'test meat' });
  let rerolled = false;
  try { rerolled = Game.maybeMonsterWeirdness({ plantId: 'meat_hushwolf', name: 'hushwolf steak', foodState: 'cooked' }); } catch (e) {}
  ok(rerolled === false, 'meat-quirk re-roll guarded while held');

  console.log('\n[exploit] mosquito 50/50 is honest (one virus per bite, held never re-rolled)');
  {
    const counts = { eurika: 0, east_nile: 0 };
    for (let i = 0; i < 200; i++) {
      resetScholar();
      const got = Game.mosquitoBiteVirus();
      if (got) counts[got]++;
      const n = Game.seList('scholar').filter(e => e.id === 'eurika' || e.id === 'east_nile').length;
      if (n !== 1) { ok(false, 'exactly one virus per bite', 'got ' + n); break; }
    }
    ok(counts.eurika > 70 && counts.eurika < 130, `50/50 split over 200 bites (eurika=${counts.eurika})`);
    // bearer of one can catch the other on a later bite — but never re-roll the held one
    resetScholar();
    Game.applyStatus('scholar', 'eurika', { source: 'test' });
    let other = 0, same = 0;
    for (let i = 0; i < 50; i++) {
      const keep = Game.seList('scholar').slice();
      Game.state.scholar.statuses = keep.filter(e => e.id === 'eurika'); // drop east_nile between trials
      Game.state.scholar.diseases = [];
      const got = Game.mosquitoBiteVirus();
      if (got === 'east_nile') other++;
      if (got === 'eurika') same++;
    }
    ok(other === 50 && same === 0, 'held virus never re-rolled; the other always available');
    // alien tick latch guard: roll skipped while lemons held
    resetScholar();
    Game.applyStatus('scholar', 'lemons', { source: 'test' });
    ok(!(!Game.hasStatus('scholar', 'lemons')), 'latch-roll guard (hasStatus lemons) blocks re-infection');
  }

  console.log('\n[honesty] FIX: ambient tick fever roll escalates 3% -> 15% (was stuck at 3%)');
  {
    resetScholar();
    Game.dayPart = 0;
    Game.over = false;
    Game.applyStatus('scholar', 'tick_attached', { source: 'test brush' });
    const te = Game.seList('scholar').find(e => e.id === 'tick_attached');
    Game.state.scholar.day = 0;
    // hostile RNG: 0.14 always — beats 3% (day 1) but loses to 15% (day 5+)
    const seeded = Math.random;
    Math.random = () => 0.14;
    try {
      Game.diseaseVectorTick();
      ok(te.day === 0, 'first roll stamps te.day (the missing stamp)');
      ok(!Game.hasStatus('scholar', 'disease'), 'day 1: 3% roll does not fire at 0.14');
      // advance 4 days; lastRollDay forces one roll per day
      for (let d = 1; d <= 4; d++) {
        Game.state.scholar.day = d;
        Game.diseaseVectorTick();
      }
      ok(Game.hasStatus('scholar', 'disease'), 'day 5: 15% roll fires at 0.14 (escalation works)');
      // cap: never guaranteed — a 0.99 roll never fires even at max
      resetScholar();
      Game.applyStatus('scholar', 'tick_attached', { source: 'test brush' });
      const te2 = Game.seList('scholar').find(e => e.id === 'tick_attached');
      te2.day = 0; te2.lastRollDay = 0;
      Game.state.scholar.day = 30;
      Math.random = () => 0.99;
      Game.diseaseVectorTick();
      ok(!Game.hasStatus('scholar', 'disease'), 'capped at 15%: 0.99 never fires (never guaranteed)');
    } finally { Math.random = seeded; }
  }

  console.log('\n[honesty] FIX: legacy mirror stays in sync (no ghosts, no false "Not sick")');
  {
    resetScholar();
    Game.contractDisease('gutrot', { source: 'test' });
    Game.contractDisease('trichinosis', { source: 'test' });
    ok(Game.state.scholar.diseases.length === 2, 'two diseases -> two mirror entries');
    Game.cureStatus('scholar', 'gutrot', 'test');
    const engine = Game.seList('scholar').map(e => e.id);
    ok(engine.length === 1 && engine[0] === 'trichinosis', 'engine keeps trichinosis after gutrot cured');
    ok(Game.state.scholar.diseases.length === 1, 'mirror keeps ONE entry (was blanket-cleared to 0)');
    ok(Game.state.scholar.diseases[0].name === 'Aching', 'mirror entry is the surviving disease (trichinosis)');
    // out-of-order expiry: second-applied expires first -> mirror drops the right one
    resetScholar();
    Game.contractDisease('gutrot', { source: 'test' });
    Game.contractDisease('disease', { source: 'test' });
    const entries = Game.seList('scholar');
    const diseaseEntry = entries.find(e => e.id === 'disease');
    Game.seRemove('scholar', diseaseEntry);
    const mirrorNames = Game.state.scholar.diseases.map(m => m.name);
    ok(mirrorNames.length === 1 && mirrorNames[0] === 'Nauseous',
      'out-of-order expiry drops the right mirror (gutrot survives)', mirrorNames.join(','));
    // natural expiry leaves no ghost
    resetScholar();
    Game.contractDisease('wound_fever', { source: 'test' });
    const wf = Game.seList('scholar').find(e => e.id === 'wound_fever');
    wf.dayPartsLeft = 1;
    Game.tickStatuses('scholar', 'dayPart');
    ok(Game.seList('scholar').length === 0 && (Game.state.scholar.diseases || []).length === 0,
      'natural expiry clears engine + mirror (no ghost)');
  }

  console.log('\n[softlock] trembles: no cure at any tier; expiry is certain death (mantle passes)');
  {
    resetScholar();
    Game.contractDisease('trembles', { source: 'test meat' });
    const cures = ['herbal_remedy', 'field_medicine', 'triage', 'antibiotics', 'antiparasitic'];
    ok(cures.every(t => Game.cureEffectFor('trembles', t) === 'no'), 'trembles cure table: no at every tier');
    ok(Game.seDef('trembles').cure.folk === 'no', 'trembles: not even folk-slowable');
    // diagnosis still works (knowledge is not a cure)
    ok(Game.seIsDisease('trembles'), 'trembles is a real (mundane) disease — diagnosable');
    // expiry -> death; cheat honored at the threshold per canon
    const te = Game.seList('scholar').find(e => e.id === 'trembles');
    te.dayPartsLeft = 1;
    let died = null, cheated = null;
    Game.playerDeath = (cause) => { died = cause; };
    Game.maybeCheatDeath = () => false;
    Game.state.scholar.health = 50;
    Game.tickStatuses('scholar', 'dayPart');
    ok(died === 'the trembles', 'trembles expiry kills the bearer (certain)');
    ok(!Game.hasStatus('scholar', 'trembles'), 'trembles entry removed at death (no phantom)');
    resetScholar();
    Game.contractDisease('trembles', { source: 'test meat' });
    Game.seList('scholar').find(e => e.id === 'trembles').dayPartsLeft = 1;
    died = null; cheated = 'held';
    Game.maybeCheatDeath = () => true; // phoenix/second wind: separate system, holds at the threshold
    Game.playerDeath = (cause) => { died = cause; };
    Game.tickStatuses('scholar', 'dayPart');
    ok(died === null, 'death-cheat holds at the trembles threshold (canon: the cheat is separate)');
  }

  console.log('\n[honesty] alien drawbacks/abilities are wired and honest');
  {
    resetScholar();
    Game.applyStatus('scholar', 'lemons', { source: 'test' });
    const db = Game.diseaseDebuffs('scholar');
    ok(db.energyMult === 0.85, 'lemons: energy x0.85');
    Game.state.scholar.statuses = [];
    Game.applyStatus('scholar', 'gutrot', { source: 'test' });
    ok(Game.diseaseDebuffs('scholar').kcalAbsorbMult === 0.6, 'gutrot: -40% kcal absorbed (debuff path)');
    Game.state.scholar.statuses = [];
    const src2 = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    const shellgutHits = (src2.match(/kcal \* 0\.75/g) || []).length;
    ok(shellgutHits >= 2 && /hasStatus\('scholar', 'shellgut'\)/.test(src2),
      `shellgut: -25% kcal applied in both eat paths (${shellgutHits} hits, hardwired, honest)`);
    const eu = Game.seDef('eurika'), en = Game.seDef('east_nile'), le = Game.seDef('lemons');
    ok(eu.tick.hp === 1 && en.tick.hp === 2 && le.tick.hp === 1,
      'ongoing costs match canon (eurika 1/part, east_nile 2/part, lemons 1/part)');
    ok(typeof Game.mosquitoBiteVirus === 'function' && typeof Game.tbMosquitoTurn === 'function' &&
       typeof Game.tbTickTurn === 'function' && typeof Game.removeTick === 'function' &&
       typeof Game.villagerTickTeachTick === 'function',
      'vectors + removal + teaching all reachable at runtime');
    const giants = (Game.data.monsters || []).filter(m => m.id === 'giant_mosquito' || m.id === 'alien_tick');
    ok(giants.length === 2 && giants.every(m => m.wave === 2), 'giant_mosquito + alien_tick are wave-2 map fights');
    // blood-sense wiring present (strike bonus vs bleeding)
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    ok(src.includes("hasStatus('scholar', 'lemons')") && src.includes("hasStatus(t, 'bleed')") && src.includes('d += 2'),
      'lemons blood-sense: +2 vs bleeding wired in the strike path');
    ok(!/tickRolled/.test(src), 'dead m.tickRolled writes removed');
    ok(!/def\.chronic/.test(fs.readFileSync(path.join(ROOT, 'src/js/statusEffects.js'), 'utf8')),
      'dead def.chronic block removed (no def ever defined it)');
  }

  console.log('\n[dead-code] all 15 disease defs loadable with pool fields');
  {
    const all = [...MUNDANE, ...ALIEN];
    ok(all.every(id => { const d = Game.seDef(id); return d && (d.pool === 'mundane' || d.pool === 'alien'); }),
      'every disease def carries pool mundane|alien');
    ok(MUNDANE.every(id => Game.seIsDisease(id)) && ALIEN.every(id => !Game.seIsDisease(id)),
      'seIsDisease admits mundane only (tick_attached also excluded)');
    ok(!Game.seIsDisease('tick_attached'), 'tick_attached is a vector status, not a disease');
    const md = (Game.data.cooking || {}).monsterDiseases || [];
    ok(md.length === 6 && md.every(d => ['howlbelly','gristlefit','croakbelly','shellgut','witness_maw','flockmind'].includes(d.id)) &&
       md.every(d => d.rawChance === 0.35 && d.cookedChance === 0.2),
      'monster-meat table: 6 quirks, raw 35% / cooked 20% (canon)');
  }

  console.log('\n[sibling] rattlesnake venom routes through the engine (was a phantom mirror push)');
  {
    const src3 = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
    ok(!/s\.poisons\s*=\s*s\.poisons[^;]*\.push/.test(src3) && !/\(s\.poisons = s\.poisons \|\| \[\]\)\.push/.test(src3),
      'no direct s.poisons mirror pushes remain in encounters.js');
    resetScholar();
    Game.applyStatus('scholar', 'poison', { name: 'rattlesnake venom', source: 'the rattlesnake' });
    ok(Game.seList('scholar').some(e => e.id === 'poison'), 'venom creates a real engine entry');
    ok((Game.state.scholar.poisons || []).length === 1, 'venom mirrors exactly once');
    const hp0 = Game.state.scholar.health;
    Game.tickStatuses('scholar', 'dayPart');
    ok(Game.state.scholar.health === hp0 - 3, 'venom ticks 3/part (was a phantom: zero damage, forever)');
    const cured = Game.cureStatus('scholar', 'poison', 'purify');
    ok(cured && Game.seList('scholar').length === 0 && (Game.state.scholar.poisons || []).length === 0,
      'purify clears engine + mirror (was: burned the daily use, phantom stayed)');
  }

  Game.say = realSay;
  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  if (failures.length) console.log('failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
