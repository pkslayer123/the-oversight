#!/usr/bin/env node
// ONE_PERSON_ARMY XP / SINGLE-COUNT PROOF (fixed-state).
//
// HISTORY: commit 9ef4d1e made activateAbility() grant XP toward leveling
// brawler abilities (fixing "combat never leveled, making one_person_army
// unreachable by fighting") — but it kept the direct
//   this.noteAbilityUse(id);
// call AND added
//   this.gainAbilityXP(id, 1);   // which itself calls noteAbilityUse(id)
// (game.js activateAbility, lines ~14323/14327; gainAbilityXP line ~14420).
// So ONE activation logged TWO ability-use events, and noteAbilityUse feeds
// checkSynergyDiscovery — every synergy attempt counter inflated 2x.
// Consequence: one_person_army (3 combined-attempt unlock via simultaneous
// legs) fired after 2 real combined activations, not 3. XP itself was honest.
//
// FIX (audio-game worker 2026-10-08, commit 00d2531): the direct
// noteAbilityUse call was removed from activateAbility; gainAbilityXP's
// internal logging is the single source. DATA-DRIVEN PATH (commit 6fdb7cb):
// useAbility() (abilityActions.js) replaced its standalone noteAbilityUse
// with gainAbilityXP — one activation = 1 use-log entry = 1 synergy
// attempt = 1 XP on BOTH paths.
//
// This test ENCODES THE FIXED BEHAVIOR — green means the counts are honest:
//   A. one activateAbility('war_cry') -> 1 noteAbilityUse call, 1 use-log
//      entry, 1 synergy attempt, 1 XP.
//   B. the REAL one_person_army synergy unlocks after exactly 3 real combined
//      activations ([unstoppable, rage, war_cry] legs at L3) — attempt 1 and
//      2 do NOT unlock, attempt 3 does.
//   C. the data-driven path: one useAbility('tracker','track') -> 1
//      noteAbilityUse call, 1 XP, and each call is one synergy attempt
//      (no double-count on that path either).
//
// Harness: mulberry32, SEED env override (default 20261008), full src/js
// module list in index.html order minus DOM-only files and drama.js, window
// stubbed for eval then deleted, Math.random seeded BEFORE eval.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${actual}, expected ${expected}`);
  if (!ok) fails.push(name);
}
// Hold id at the given level/xp, anywhere gainAbilityXP looks (background
// first, then System abilities — mirror its lookup order).
function holdAbility(s, id, level, xp) {
  const lists = ['backgroundAbilities', 'abilities'];
  for (const list of lists) {
    const e = (s[list] || []).find(a => a.id === id);
    if (e) { e.level = level; e.xp = (xp == null ? e.xp : xp); return e; }
  }
  const def = Game.data.abilities.find(a => a.id === id) || {};
  const entry = { id, name: def.name || id, desc: def.description || '', level, xp: xp == null ? 0 : xp };
  (s.abilities || (s.abilities = [])).push(entry);
  return entry;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // Count noteAbilityUse invocations for the whole run, calling through.
  const counts = {};
  const orig = Game.noteAbilityUse;
  Game.noteAbilityUse = function (id, ctx) { counts[id] = (counts[id] || 0) + 1; return orig.call(this, id, ctx); };
  const unlocked = (id) => (s.synergies || []).includes(id);

  // ---------- A. single activation = single count ----------
  holdAbility(s, 'war_cry', 1, 0);
  holdAbility(s, 'rage', 1, 0);
  // In-memory probe synergy (simultaneous war_cry+rage legs, unlock at 3).
  Game.data.synergies.push({
    id: 'test_doublecount_probe', name: 'Probe',
    requires: ['war_cry', 'rage'], minLevel: 1,
    discovery_method: { type: 'simultaneous', hint: 'probe' },
  });
  s.abilityUseLog = []; s.synergyAttempts = {}; s.synergies = [];

  // Leg 1: one honest rage use. No war_cry in the log yet -> no attempt.
  Game.noteAbilityUse('rage');
  check('A rage single use -> 1 log entry', s.abilityUseLog.length, 1);

  // THE activation: plain-id legacy path (what combat/UI calls).
  Game.activateAbility('war_cry');
  console.log(`\n--- A. one activateAbility('war_cry') ---`);
  check('A noteAbilityUse(war_cry) calls per activation', counts['war_cry'] || 0, 1);
  check('A abilityUseLog entries per activation', s.abilityUseLog.filter(u => u.id === 'war_cry').length, 1);
  check('A synergyAttempts[probe] after 1 activation', s.synergyAttempts['test_doublecount_probe'] || 0, 1);
  check('A xp granted per activation (honest, not doubled)', s.abilities.find(a => a.id === 'war_cry').xp, 1);

  // ---------- B. real one_person_army unlocks after 3 REAL combined activations ----------
  // one_person_army's [unstoppable, rage, war_cry] path (minLevel 3) treats
  // 'unstoppable' as a SYNERGY leg — it must be DISCOVERED first, not just
  // held as an ability (synergy-leg design: mastery travels with you). So:
  // stage 1: unlock the unstoppable synergy via its pure-ability path
  // ['rage','unbreakable'] (minLevel 2); stage 2: the real one_person_army
  // unlock via [unstoppable, rage, war_cry] at minLevel 3.
  for (const id of ['rage', 'unbreakable']) holdAbility(s, id, 2, 0);
  s.abilityUseLog = []; s.synergyAttempts = {}; s.synergies = [];

  console.log(`\n--- B1. unlock unstoppable via ['rage','unbreakable'] ---`);
  check('B1 precondition: unstoppable not unlocked', unlocked('unstoppable'), false);
  Game.noteAbilityUse('rage');           // leg 1 alone: no combined use yet
  check('B1 single leg use -> 0 attempts', s.synergyAttempts['unstoppable'] || 0, 0);
  Game.activateAbility('unbreakable');   // combined use 1 (rage + unbreakable)
  check('B1 attempts after 1st combined activation', s.synergyAttempts['unstoppable'] || 0, 1);
  check('B1 NOT unlocked after 1 combined activation', unlocked('unstoppable'), false);
  Game.activateAbility('rage');          // combined use 2
  check('B1 attempts after 2nd combined activation', s.synergyAttempts['unstoppable'] || 0, 2);
  check('B1 NOT unlocked after 2 combined activations', unlocked('unstoppable'), false);
  Game.activateAbility('unbreakable');   // combined use 3 -> unlock
  check('B1 attempts after 3rd combined activation', s.synergyAttempts['unstoppable'] || 0, 3);
  check('B1 unlocked after exactly 3 combined activations', unlocked('unstoppable'), true);

  console.log(`\n--- B2. one_person_army via ['unstoppable','rage','war_cry'] ---`);
  // SYNERGY-LEG INTERACTION (by design, see checkSynergyDiscovery "SYNERGY
  // LEGS"): a leg that names a DISCOVERED synergy counts as "brought to
  // bear" on every use of the other legs — mastery travels with you. So with
  // unstoppable mastered, each real rage/war_cry activation is one honest
  // attempt (1 activation = 1 attempt, never 2), and the 3-attempt unlock
  // fires after 3 real activations, not 2 (the old double-count fired at 2).
  for (const id of ['rage', 'war_cry']) holdAbility(s, id, 3, 0);
  s.abilityUseLog = []; s.synergyAttempts = {};
  // s.synergies keeps unstoppable (discovered) — mastery travels with you.
  const opaAttempts = () => s.synergyAttempts['one_person_army'] || 0;
  check('B2 precondition: one_person_army not unlocked', unlocked('one_person_army'), false);
  Game.activateAbility('rage');          // real activation 1 -> 1 attempt
  check('B2 attempts after 1st real activation', opaAttempts(), 1);
  check('B2 NOT unlocked after 1 real activation', unlocked('one_person_army'), false);
  Game.activateAbility('war_cry');       // real activation 2 -> 2 attempts
  check('B2 attempts after 2nd real activation', opaAttempts(), 2);
  check('B2 NOT unlocked after 2 real activations', unlocked('one_person_army'), false);
  Game.activateAbility('rage');          // real activation 3 -> unlock
  check('B2 attempts after 3rd real activation', opaAttempts(), 3);
  check('B2 unlocked after exactly 3 real activations', unlocked('one_person_army'), true);

  // ---------- C. data-driven useAbility path: single count ----------
  // (Full coverage lives in scripts/test-ability-xp-use-20261008.js; this is
  // the no-double-count regression pin on the shared counting machinery.)
  holdAbility(s, 'tracker', 1, 0);
  holdAbility(s, 'war_cry', 1, 0);
  holdAbility(s, 'rage', 1, 0);
  s.abilityUseLog = []; s.synergyAttempts = {}; s.synergies = [];
  Game.data.synergies.push({
    id: 'test_doublecount_probe2', name: 'Probe2',
    requires: ['tracker', 'war_cry'], minLevel: 1,
    discovery_method: { type: 'simultaneous', hint: 'probe' },
  });
  Game.noteAbilityUse('war_cry'); // partner leg in the log
  const trackerAb = () =>
    (s.backgroundAbilities || []).find(a => a.id === 'tracker') ||
    (s.abilities || []).find(a => a.id === 'tracker');

  const noteBefore = counts['tracker'] || 0;
  const xpBefore = trackerAb().xp;
  const attBefore = s.synergyAttempts['test_doublecount_probe2'] || 0;
  const r = Game.useAbility('tracker', 'track', null);
  console.log(`\n--- C. one useAbility('tracker','track') ---`);
  check('C useAbility returns truthy (impl wired)', !!r, true);
  check('C noteAbilityUse(tracker) calls per use', (counts['tracker'] || 0) - noteBefore, 1);
  check('C XP granted per use', trackerAb().xp - xpBefore, 1);
  check('C synergy attempts per use', (s.synergyAttempts['test_doublecount_probe2'] || 0) - attBefore, 1);

  Game.noteAbilityUse = orig; // restore

  console.log(`\nread: one real activation = 1 use-log entry = 1 synergy attempt = 1 XP, on both paths.`);
  console.log(`consequence: one_person_army (3-attempt unlock) needs 3 real combined activations, as designed.`);
  if (fails.length) { console.log(`\nFAIL (${fails.length}): ${fails.join('; ')}`); process.exit(1); }
  console.log(`\nOK — seed ${SEED}. Single-count XP on activateAbility + useAbility; one_person_army unlocks at 3.`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
