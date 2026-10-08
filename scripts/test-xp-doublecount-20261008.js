#!/usr/bin/env node
// ONE_PERSON_ARMY XP / DOUBLE-COUNT PROOF (fixed-state characterization).
//
// BUG (2026-10-07 23:55 note): commit 9ef4d1e made activateAbility() grant XP
// toward leveling brawler abilities (fixing "combat never leveled, making
// one_person_army unreachable by fighting") — but it kept the direct
//   this.noteAbilityUse(id);
// call AND added
//   this.gainAbilityXP(id, 1);   // which itself calls noteAbilityUse(id)
// (game.js activateAbility, lines ~14323/14327; gainAbilityXP line ~14420).
// So ONE activation logged TWO ability-use events. noteAbilityUse feeds
// checkSynergyDiscovery, so every synergy attempt counter inflated 2x.
//
// FIX (audio-game worker 2026-10-08, commit 00d2531): the direct
// noteAbilityUse call was removed; gainAbilityXP's internal logging is the
// single source. One activation = 1 use-log entry = 1 synergy attempt = 1 XP.
// This test now ENCODES THE FIXED BEHAVIOR — green means the counts are
// honest. (The pre-fix version of this file asserted 2/2/2 and is preserved
// in master history at eb995a2.)
//
// It also verifies the XP side stays HONEST: exactly 1 xp per activation.
//
// Usage: node scripts/test-xp-doublecount-20261008.js (SEED override)
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

  // Arrange: hold two one_person_army legs as System abilities at L1.
  for (const id of ['war_cry', 'rage']) {
    const def = Game.data.abilities.find(a => a.id === id) || {};
    (s.abilities || (s.abilities = [])).push({ id, name: def.name || id, desc: def.description || '', level: 1, xp: 0 });
  }
  // Inject a minimal probe synergy (in-memory; no data files touched):
  // simultaneous legs war_cry+rage, 3 combined attempts to unlock.
  Game.data.synergies.push({
    id: 'test_doublecount_probe', name: 'Probe',
    requires: ['war_cry', 'rage'], minLevel: 1,
    discovery_method: { type: 'simultaneous', hint: 'probe' },
  });

  s.abilityUseLog = []; s.synergyAttempts = {}; s.synergies = [];

  // Count noteAbilityUse invocations, calling through to the real thing.
  const counts = {};
  const orig = Game.noteAbilityUse;
  Game.noteAbilityUse = function (id, ctx) { counts[id] = (counts[id] || 0) + 1; return orig.call(this, id, ctx); };

  // Leg 1: one honest rage use. No war_cry in the log yet -> no attempt.
  Game.noteAbilityUse('rage');
  const logAfterRage = s.abilityUseLog.length;
  check('rage single use -> 1 log entry', logAfterRage, 1);

  // THE activation: plain-id legacy path (what combat/UI calls).
  const logBefore = s.abilityUseLog.length;
  Game.activateAbility('war_cry');
  const warCryLogAdded = s.abilityUseLog.filter(u => u.id === 'war_cry').length;

  console.log(`\n--- one activateAbility('war_cry') ---`);
  // FIXED expectations (single count per activation — the fix, commit 00d2531).
  check('noteAbilityUse(war_cry) calls per activation', counts['war_cry'] || 0, 1);
  check('abilityUseLog entries per activation', warCryLogAdded, 1);
  check("synergyAttempts['test_doublecount_probe'] after 1 activation", s.synergyAttempts['test_doublecount_probe'] || 0, 1);
  // XP honesty: only ONE xp granted (gainAbilityXP ran once).
  const ab = s.abilities.find(a => a.id === 'war_cry');
  check('xp granted per activation (honest, not doubled)', ab.xp, 1);

  Game.noteAbilityUse = orig; // restore

  console.log(`\nread: one real activation = 1 use-log entry = 1 synergy attempt.`);
  console.log(`consequence: one_person_army (3-attempt unlock) now needs 3 real combined activations, as designed.`);
  if (fails.length) { console.log(`\nFAIL (${fails.length}): ${fails.join('; ')}`); process.exit(1); }
  console.log(`\nOK — seed ${SEED}. Fixed: one noteAbilityUse per activateAbility; XP honest at +1.`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
