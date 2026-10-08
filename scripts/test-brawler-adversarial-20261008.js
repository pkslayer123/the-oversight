#!/usr/bin/env node
// PROOF TEST: brawler adversarial loop 2026-10-08 (rotation idx 4).
// Three breaks found by hostile play, three fixes. Each section asserts the
// FIXED behavior. Before-fix behavior was verified empirically in the attack
// run (seed 4242):
//   1. second_wind.refuse_death: 35 zero-cost taps in one combat turn took
//      L1->L3 (XP granted before impl dispatch; impl refuses as "automatic").
//      AFTER: 40 taps -> still L1 xp=0; button unavailable ("Automatic —
//      triggers on its own."); automatic trigger (maybeCheatDeath) untouched.
//   2. applyRep trust resurrection: terrorizing a victim to 0 trust, then the
//      snap (startBetrayalCombat -> observe -> applyRep) bounced trust 0->9
//      via `(t[vid] || 10)`. AFTER: trust stays 0.
//   3. tbPlayerStrike on fled monster: returned true, dealt damage — a free
//      risk-free parting hit (fled fighters take no turns), and a kill would
//      contradict tbEndCheck's 'routed' ("no meat, no trophy").
//      AFTER: refused with "No striking at backs."
// Usage: node scripts/test-brawler-adversarial-20261008.js (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '4242', 10);
Math.random = mulberry32(SEED); // BEFORE eval: modules capture Math.random at load
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync('grep -o "src/js/[a-zA-Z0-9_./-]*\\.js" index.html', { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const clearSays = () => says.splice(0);
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
const abState = (id) => { const a = (Game.state.scholar.abilities || []).find(x => x.id === id); return a ? { level: a.level, xp: a.xp || 0 } : null; };
async function freshGame() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  clearSays();
}
const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);

(async () => {
  // ---- 1. REFUSE_DEATH XP FARM IS DEAD ----
  await freshGame();
  grant('second_wind', 1);
  Game.startCombat('hushwolf');
  check('1.0 fight started', !!Game.tbfight && !Game.tbfight.over);
  const refuseBtn = (Game.activatableAbilities() || []).find(a => a.actionId === 'refuse_death');
  check('1.1 Refuse button is NOT offered as available (automatic)', !!refuseBtn && refuseBtn.available === false,
    'available=' + (refuseBtn && refuseBtn.available) + ' why=' + (refuseBtn && refuseBtn.why));
  for (let i = 0; i < 40; i++) Game.useAbility('second_wind', 'refuse_death', null);
  const sw = abState('second_wind');
  check('1.2 40 refused taps grant ZERO xp (still L1)', sw && sw.level === 1 && sw.xp === 0,
    'second_wind=' + JSON.stringify(sw));
  const p = Game.tbFighter('p');
  check('1.3 no turn consumed by refused taps', p && p.acted === false);
  // the automatic trigger still works: force near-death and check the cheat fires
  const s = Game.state.scholar;
  s.secondWindDay = -1; // reset daily gate if present
  let cheatFired = false;
  try {
    s.health = 0;
    cheatFired = Game.maybeCheatDeath();
  } catch (e) { cheatFired = 'err:' + e.message; }
  check('1.4 automatic cheat-death path unaffected', cheatFired === true, 'maybeCheatDeath=' + cheatFired);
  if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled');

  // ---- 2. APPLYREP NO LONGER RESURRECTS 0 TRUST ----
  await freshGame();
  const v = Game.state.village;
  const victim = others().find(id => { try { return ['cautious', 'withdrawn'].includes(Game.npcTemper(id)); } catch (e) { return false; } }) || others()[0];
  v.trust = v.trust || {};
  for (let i = 0; i < 3; i++) {
    if (!v.roster.includes(victim)) break;
    Game.intimidate(victim);
    if (Game.tbfight) break; // snap started a fight
  }
  const trustAfterSnap = (v.trust || {})[victim];
  check('2.1 snap does not resurrect 0 trust (stays 0)', trustAfterSnap === 0, 'trust=' + trustAfterSnap);
  if (Game.tbfight) Game.tbEnd('fled');
  // direct applyRep probe: 0 trust + NEGATIVE rep drift stays 0 (the
  // resurrection case: before the fix, `(t[vid] || 10)` reset 0 to the 10
  // baseline first, so even a hostile drift bounced trust upward)
  v.trust[victim] = 0;
  Game.applyRep(victim, { honest: -10 }, 1);
  check('2.2a applyRep negative drift on 0 trust stays 0 (no resurrection)', (v.trust || {})[victim] === 0,
    'trust=' + (v.trust || {})[victim]);
  // positive drift genuinely rehabilitates from the true 0 — intended:
  // reputation can rebuild trust, it just starts from where trust really is
  v.trust[victim] = 0;
  Game.applyRep(victim, { brave: 10 }, 1);
  check('2.2b applyRep positive drift rehabilitates from true 0 (0->6, not 10->16)', (v.trust || {})[victim] === 6,
    'trust=' + (v.trust || {})[victim]);
  // unset trust still defaults to 10 baseline behavior
  delete v.trust[victim];
  Game.applyRep(victim, { brave: 10 }, 1);
  const tUnset = (v.trust || {})[victim];
  check('2.3 unset trust still drifts from the 10 baseline', tUnset > 10, 'trust=' + tUnset);

  // ---- 3. NO STRIKING AT BACKS ----
  await freshGame();
  Game.startCombat('hushwolf');
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive);
  const hpBefore = m.hp;
  m.fled = true;
  clearSays();
  const r = Game.tbPlayerStrike(m.key);
  check('3.1 striking a fled monster is refused', r === false, 'returned ' + r);
  check('3.2 refusal is narrated honestly (no silent no-op)', says.join(' ').includes('No striking at backs'),
    says.slice(-1).join(' ').slice(0, 120));
  check('3.3 fled monster took no damage', m.hp === hpBefore, `hp ${hpBefore} -> ${m.hp}`);
  // the fight still resolves: ALL foes fled -> 'routed', no softlock
  for (const x of Game.tbfight.fighters) if (x.kind === 'monster' && x.alive) x.fled = true;
  Game.tbEndCheck();
  check('3.4 all-fled fight ends (routed), no stuck fight', !Game.tbfight || Game.tbfight.over);

  // ---- 4. REGRESSION: genuine attempts still earn XP ----
  await freshGame();
  grant('unbreakable', 1);
  Game.startCombat('hushwolf');
  const u0 = abState('unbreakable');
  Game.useAbility('unbreakable', 'shake_off', null); // real use: clears statuses, costs 50 kcal
  const u1 = abState('unbreakable');
  check('4.1 successful shake_off still grants XP', u1 && u1.xp === (u0.xp + 1), JSON.stringify(u0) + ' -> ' + JSON.stringify(u1));
  Game.useAbility('unbreakable', 'shake_off', null); // 2nd: impl-gated, refused
  const u2 = abState('unbreakable');
  check('4.2 refused 2nd shake_off grants no XP', u2 && u2.xp === u1.xp, JSON.stringify(u1) + ' -> ' + JSON.stringify(u2));
  if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled');

  console.log(`\n==== PROOF seed=${SEED}: pass=${pass} fail=${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF ERROR:', e && e.stack || e); process.exit(2); });
