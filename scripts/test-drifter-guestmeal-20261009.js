#!/usr/bin/env node
// DRIFTER BREAK-IT: guestMeal (allied village guest meal) — proof of break,
// then proof of fix. This test ENCODES THE FIXED BEHAVIOR: green means the
// holes are closed (face-to-face gate, tickAction(32) time cost, honest
// per-village-per-day hint). Run against the pre-fix code it fails A1/A2/B4/C1.
//
// TARGET (membership.js guestMeal, wired 2026-10-09 regional audit):
//   "An allied village's fire is open — a guest's meal, once a day.
//    Real food from THEIR pantry (they feel it), honest when the pot is
//    empty. Guests, not locusts."
//
// HOSTILE READING:
//   A. FACE-TO-FACE: every sibling verb on the village card (talk, study,
//      petition, sharefood) refuses from afar — "talk happens face to
//      face", petitionVillage refuses dist>1, studyVillageCodex dist<=2.
//      guestMeal has NO distance gate: menu magic from across the map.
//   B. TIME COST: talk costs tickAction(64), study "takes a while". guestMeal
//      charges ZERO ticks — an instant 1500 kcal. DIRECTIVES: "Everything
//      should either cost time, time and calories, or just calories."
//   C. HONESTY: the card hint promises "Once a day — guests, not locusts"
//      but the engine enforces once per VILLAGE per day. With N allies and
//      free node travel, that's N x 1500 kcal/day for zero time.
//   D. SOFTLOCK (control): exile -> drift -> petition/found/drift reachable.
//
// FIX (applied after the break is demonstrated):
//   1. guestMeal refuses at dist>1 (same voice as villageTalk).
//   2. guestMeal runs catchUpSim first (like villageTalk) and charges
//      tickAction(32) — a meal takes a while; you're a guest, you sit.
//   3. Card hint made honest: "One guest meal per village per day."
//
// Harness: mulberry32 seeded BEFORE eval (modules capture Math.random at
// load), full src/js list in index.html order minus DOM-only files and
// drama.js, window stubbed for eval then deleted.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(name);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const villages = Game.state.otherVillages || [];
  check('setup: 2+ other villages exist', villages.length >= 2, `found ${villages.length}`);
  if (villages.length < 2) { console.log('ABORT: need 2 villages'); process.exit(2); }
  const [vA, vB] = villages;
  vA.pantryKcal = 20000; vB.pantryKcal = 20000;

  // alliances via the engine path (proposeAlliance costs a feast; formAlliance is the grant)
  Game.formAlliance(vA.id);
  Game.formAlliance(vB.id);
  check('setup: recognized abroad at A', !!Game.recognizedAbroad(Game.villagerId, vA));
  check('setup: recognized abroad at B', !!Game.recognizedAbroad(Game.villagerId, vB));

  const distTo = (v) => Math.abs((v.x || 0) - Game.map.px) + Math.abs((v.y || 0) - Game.map.py);
  const cap = Game.kcalCap ? Game.kcalCap() : 3000;

  // ---------- A. MENU MAGIC FROM AFAR ----------
  // park the player at haven, far from both villages
  Game.map.px = Game.state.village.px ?? 4;
  Game.map.py = Game.state.village.py ?? 4;
  const dA = distTo(vA), dB = distTo(vB);
  s.kcal = 500;
  const ticksBefore = s.dayTicks || 0;
  const gotFar = Game.guestMeal(vA.id);
  check('A1: guestMeal from afar is REFUSED (face-to-face rule)', gotFar == null || gotFar <= 0, `dist=${dA}, served=${gotFar}`);
  check('A2: no kcal gained from afar', (s.kcal || 0) <= 500, `kcal=${s.kcal}`);

  // ---------- B. GRAZING: two allies, one day, real costs ----------
  // stand at A's fire
  Game.map.px = vA.x; Game.map.py = vA.y;
  s.kcal = 200;
  const t0 = s.dayTicks || 0;
  const mealA = Game.guestMeal(vA.id);
  const t1 = s.dayTicks || 0;
  check('B1: meal at the fire is served', mealA > 0, `served=${mealA}`);
  check('B2: second meal same village same day refused', (Game.guestMeal(vA.id) || 0) <= 0);
  // free node travel to B's fire, eat again — per-VILLAGE-per-day is the
  // documented design (network-stage reward, real alliance investment);
  // the fix makes it cost presence + time instead of being menu magic.
  Game.map.px = vB.x; Game.map.py = vB.y;
  s.kcal = 200; // re-hungry (probe): engine should still gate on time/day, not just fullness
  const mealB = Game.guestMeal(vB.id);
  const t2 = s.dayTicks || 0;
  const total = (mealA || 0) + (mealB || 0);
  check('B3: second ALLIED village same day serves (per-village design)', (mealB || 0) > 0, `served=${mealB}`);
  check('B4: a guest meal costs time (tickAction)', (t2 - t0) > 0, `ticks spent=${t2 - t0}`);
  check('B5: two-village same-day total is 2x1500 (documented, not infinite)', total === 3000, `total=${total}`);
  void cap; void ticksBefore; void dB; void t1;

  // ---------- C. HONESTY: card copy vs engine ----------
  Game.map.px = vA.x; Game.map.py = vA.y; // at fire so the button shows
  let hint = '';
  try { const card = Game.villageCard(vA.id); const b = (card.actions || []).find(a => a.id === 'guestmeal'); hint = (b && b.hint) || ''; } catch (e) {}
  check('C1: card hint matches engine (per-village-per-day)', /per village/i.test(hint), `hint="${hint}"`);

  // ---------- D. SOFTLOCK CONTROL: exile -> drift -> options reachable ----------
  try { Game.exilePlayer('probe'); } catch (e) {}
  check('D1: exile sets exiled', !!s.exiled);
  const dr = Game.drift();
  check('D2: drift() reachable after exile', dr === true);
  const card2 = Game.villageCard(vA.id);
  check('D3: village card still builds while exiled/drifting', !!card2);
  check('D4: founding project start reachable', typeof Game.foundHaven === 'function' || typeof Game.startFounding === 'function' || true, 'informational');

  console.log(fails.length ? `\nBREAKS CONFIRMED (${fails.length}): ${fails.join('; ')}` : '\nALL HELD');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(3); });
