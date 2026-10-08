#!/usr/bin/env node
// USEABILITY XP PROOF (2026-10-08, Steve).
//
// BUG: Game.useAbility() (abilityActions.js) logged noteAbilityUse but never
// granted ability XP — and abilityActions.js OVERRIDES Game.activateAbility,
// routing composite ids ("tracker.track") to useAbility(). So data-driven
// ability actions NEVER leveled through use — the same reachability class as
// the one_person_army bug (audio-game worker, behaviorally proven;
// evidence/2026-10-08/audio-game-report.md).
//
// FIX: replaced the standalone `this.noteAbilityUse(abilityId)` in useAbility
// with `this.gainAbilityXP(abilityId, 1)`. gainAbilityXP ALREADY calls
// noteAbilityUse internally (game.js:14421), so replacing (not adding beside)
// keeps exactly 1 use-log entry = 1 synergy attempt = 1 XP per activation.
// Plain-id activateAbility path is untouched.
//
// Asserts: exactly 1 noteAbilityUse + exactly 1 XP per useAbility call,
// composite activateAbility routes through useAbility (levels both), plain-id
// activateAbility behavior unchanged, synergy-attempt counting stays single.
//
// Usage: node scripts/test-ability-xp-use-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // Arrange: tracker + war_cry + rage as System abilities at L1/xp0.
  // (rage is held so the simultaneous probe can progress — it also gives
  // the probe a partner leg.)
  // RNG-proofing: the generated scholar may already hold tracker (possibly at
  // max level, where XP is a no-op). Reset any pre-existing copy first —
  // gainAbilityXP checks backgroundAbilities before s.abilities, so reset both.
  for (const list of ['backgroundAbilities', 'abilities']) {
    const arr = s[list] || [];
    for (const a of arr) { if (a.id === 'tracker') { a.level = 1; a.xp = 0; } }
  }
  for (const id of ['war_cry', 'rage']) {
    const ab = (s.abilities || []).find(a => a.id === id);
    if (ab) { ab.level = 1; ab.xp = 0; continue; }
    const def = Game.data.abilities.find(a => a.id === id) || {};
    (s.abilities || (s.abilities = [])).push({ id, name: def.name || id, desc: def.description || '', level: 1, xp: 0 });
  }
  // Tracker might only exist as a background ability (seed-dependent).
  // Mirror gainAbilityXP's lookup order so we read the same object it writes.
  const trackerAb = () =>
    (s.backgroundAbilities || []).find(a => a.id === 'tracker') ||
    (s.abilities || []).find(a => a.id === 'tracker');
  // Guarantee tracker exists somewhere at L1/xp0.
  if (!trackerAb()) {
    const def = Game.data.abilities.find(a => a.id === 'tracker') || {};
    (s.abilities || (s.abilities = [])).push({ id: 'tracker', name: def.name || 'tracker', desc: '', level: 1, xp: 0 });
  }
  trackerAb().level = 1; trackerAb().xp = 0;
  // In-memory probe synergy: simultaneous tracker+rage legs.
  Game.data.synergies.push({
    id: 'test_useability_probe', name: 'Probe',
    requires: ['tracker', 'rage'], minLevel: 1,
    discovery_method: { type: 'simultaneous', hint: 'probe' },
  });
  s.abilityUseLog = []; s.synergyAttempts = {}; s.synergies = [];
  // Seed rage as the probe's partner leg.
  Game.noteAbilityUse('rage');

  const counts = {};
  const origNote = Game.noteAbilityUse;
  Game.noteAbilityUse = function (id, ctx) { counts[id] = (counts[id] || 0) + 1; return origNote.call(this, id, ctx); };

  console.log('\n--- one useAbility(tracker, track) ---');
  const r1 = Game.useAbility('tracker', 'track', null);
  check('useAbility returns truthy (impl wired)', !!r1, true);
  check('noteAbilityUse(tracker) calls per use', counts['tracker'] || 0, 1);
  check('abilityUseLog entries per use', s.abilityUseLog.filter(u => u.id === 'tracker').length, 1);
  check('XP granted per use (levels now happen)', trackerAb().xp, 1);

  console.log('\n--- composite activateAbility(tracker.track) ---');
  const before = { note: counts['tracker'] || 0, xp: trackerAb().xp };
  Game.activateAbility('tracker.track', null);
  check('composite routes to useAbility: exactly +1 noteAbilityUse', (counts['tracker'] || 0) - before.note, 1);
  check('composite levels: exactly +1 XP', trackerAb().xp - before.xp, 1);

  console.log('\n--- plain-id activateAbility path unchanged (war_cry) ---');
  const wcBefore = { note: counts['war_cry'] || 0 };
  Game.activateAbility('war_cry');
  const wcAb = s.abilities.find(a => a.id === 'war_cry');
  check('plain id: exactly 1 noteAbilityUse', (counts['war_cry'] || 0) - wcBefore.note, 1);
  check('plain id: exactly 1 XP', wcAb.xp, 1);

  console.log('\n--- synergy attempt count stays single per activation ---');
  // Probe requires tracker+war_cry; war_cry was used once above, so each
  // tracker use in the same day-part = one combined attempt. Fresh probe id
  // so the earlier tracker probe (test_useability_probe) doesn't unlock mid-test.
  Game.data.synergies.push({
    id: 'test_useability_probe2', name: 'Probe2',
    requires: ['tracker', 'war_cry'], minLevel: 1,
    discovery_method: { type: 'simultaneous', hint: 'probe' },
  });
  const attBefore = s.synergyAttempts['test_useability_probe2'] || 0;
  Game.useAbility('tracker', 'track', null);
  Game.useAbility('tracker', 'track', null);
  check('synergy attempts after 2 useAbility calls (one each)', (s.synergyAttempts['test_useability_probe2'] || 0) - attBefore, 2);

  Game.noteAbilityUse = origNote; // restore

  if (fails.length) { console.log(`\nFAIL (${fails.length}): ${fails.join('; ')}`); process.exit(1); }
  console.log(`\nOK — seed ${SEED}. One useAbility activation = 1 note + 1 XP; composite ids level; plain path unchanged.`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
