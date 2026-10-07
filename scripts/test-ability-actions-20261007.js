#!/usr/bin/env node
// TEST: Ability Action Execution Engine (Steve 2026-10-07)
// Verifies Game.useAbility() dispatches data-driven actions,
// pays costs, validates context, and never runs silent.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Minimal harness: load abilities.json, stub Game, load abilityActions.js.
// Use HEAD's version if worktree is stale (check via git).
const { execSync } = require('child_process');
let abilitiesJson;
try {
  abilitiesJson = execSync('git show HEAD:src/data/abilities.json', { cwd: ROOT, encoding: 'utf8' });
} catch (e) {
  abilitiesJson = fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8');
}
const abilities = JSON.parse(abilitiesJson);
const absList = Array.isArray(abilities) ? abilities : abilities.abilities;

// Stub Game object with minimal interface.
let sayLog = [];
const Game = {
  data: { abilities: absList },
  state: {
    scholar: { kcal: 2000, health: 100, abilities: [], actionClock: 0, dayTicks: 0 },
    codex: {},
    village: {}
  },
  tbfight: null,
  dayPart: 1,
  say: function (msg) { sayLog.push(msg); },
  hasAbility: function (id) {
    return this.state.scholar.abilities.some(a => (a.id || a) === id);
  },
  abilityLevel: function (id) { return this.hasAbility(id) ? 1 : 0; },
  hasSynergy: function () { return false; },
  inCombat: function () { return !!(this.tbfight && !this.tbfight.over); },
  tbFighter: function () { return null; },
  tbPatternKnown: function () { return false; },
  tickAction: function (n) {
    this.state.scholar.actionClock += n;
    this.state.scholar.dayTicks += n;
  },
  spendCombatAction: function (kind) {
    const p = this.tbFighter('p');
    if (p) p.acted = true;
  },
  noteAbilityUse: function () {},
  maxHealth: function () { return 100; },
  _stanceHint: function () { return 'something violent'; },
  tbEnd: function () {}
};

// Set up Scattering global and load the module.
global.window = undefined;
const _g = { Scattering: { Game: Game } };
// Simulate the IIFE loading
const src = fs.readFileSync(path.join(ROOT, 'src/js/abilityActions.js'), 'utf8');
// Extract and eval in a context where _g is available
const fn = new Function('_g', 'global', 'window', src);
try {
  // The module uses (typeof window !== 'undefined' ? window : global)
  // We need to make it work in Node.
  const moduleSrc = src.replace(
    '})(typeof window !== \'undefined\' ? window : global);',
    '})(_g);'
  );
  const fn2 = new Function('_g', moduleSrc);
  fn2(_g);
} catch (e) {
  console.log('Module load error:', e.message);
  process.exit(1);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('Ability Action Execution Engine:');

// Give the scholar some abilities for testing.
Game.state.scholar.abilities = [
  { id: 'game_sense' },
  { id: 'patient_aim' },
  { id: 'stalk' },
  { id: 'trade_of_blows' }
];

// 1. useAbility exists
check('useAbility defined', typeof Game.useAbility === 'function');

// 2. abilityActionDef lookup
var def = Game.abilityActionDef('patient_aim', 'take_aim');
check('abilityActionDef finds action', def && def.action.id === 'take_aim', JSON.stringify(def));

// 3. Unknown action → false + say
sayLog = [];
var r = Game.useAbility('patient_aim', 'nonexistent', null);
check('unknown action returns false', r === false);
check('unknown action says something', sayLog.length > 0, 'sayLog empty');

// 4. Missing ability → false + say
sayLog = [];
r = Game.useAbility('pyrokinesis', 'coax_flame', null);
check('missing ability returns false', r === false);
check('missing ability says something', sayLog.length > 0);

// 5. Combat action out of combat → blocked with explanation
sayLog = [];
r = Game.useAbility('patient_aim', 'take_aim', null);
check('combat action blocked out of combat', r === false);
check('blocked with explanation', sayLog.length > 0 && /combat/i.test(sayLog[0]), sayLog[0]);

// 6. Explore action works out of combat (read_sign costs time_min: 15)
sayLog = [];
var clockBefore = Game.state.scholar.actionClock;
r = Game.useAbility('game_sense', 'read_sign', null);
check('explore action succeeds', r === true);
check('explore action narrates', sayLog.length > 0, 'silent!');
check('time cost paid', Game.state.scholar.actionClock > clockBefore, 'clock=' + Game.state.scholar.actionClock);

// 7. Combat action works in combat
Game.tbfight = { id: 'test-fight-1', over: false, fighters: [] };
sayLog = [];
r = Game.useAbility('patient_aim', 'take_aim', null);
check('combat action succeeds in combat', r === true);
check('combat action narrates', sayLog.length > 0);
check('aimBonus flag set', Game.state.scholar.aimBonus && Game.state.scholar.aimBonus.mult === 2.5, JSON.stringify(Game.state.scholar.aimBonus));

// 8. Cost validation: insufficient kcal blocks
Game.tbfight = null; // back out of combat
Game.state.scholar.kcal = 5; // very low
Game.state.scholar.abilities.push({ id: 'ambush' });
sayLog = [];
r = Game.useAbility('ambush', 'lay_wait', null); // costs 20 kcal
check('insufficient kcal blocks', r === false);
check('blocked with kcal explanation', sayLog.length > 0 && /kcal|energy/i.test(sayLog[0]), sayLog[0]);
Game.state.scholar.kcal = 2000; // restore

// 9. activatableAbilities is data-driven
var acts = Game.activatableAbilities();
check('activatableAbilities returns array', Array.isArray(acts));
var dataDriven = acts.filter(a => a.actionId); // data-driven have actionId
check('data-driven actions present', dataDriven.length > 0, 'found ' + dataDriven.length);
// In non-combat, should not include combat actions
var combatActs = acts.filter(a => a.context === 'combat');
check('no combat actions out of combat', combatActs.length === 0, 'found ' + combatActs.length);

// 10. In combat, combat actions appear
Game.tbfight = { id: 'test-fight-2', over: false, fighters: [] };
acts = Game.activatableAbilities();
var combatActsIn = acts.filter(a => a.context === 'combat' && a.actionId);
check('combat actions appear in combat', combatActsIn.length > 0, 'found ' + combatActsIn.length);
Game.tbfight = null;

// 11. All 28 HEAD actions have implementations or honest fallback
var allAbs = Game.data.abilities;
var missing = [];
var impls = _g.AbilityActionImpls || {};
for (var i = 0; i < allAbs.length; i++) {
  var ab = allAbs[i];
  if (!ab.actions) continue;
  for (var j = 0; j < ab.actions.length; j++) {
    var key = ab.id + '.' + ab.actions[j].id;
    if (typeof impls[key] !== 'function') {
      missing.push(key);
    }
  }
}
check('all actions have implementations', missing.length === 0, 'missing: ' + missing.join(', '));

// 12. useAbility never silent on success
Game.state.scholar.abilities.push({ id: 'tracker' });
sayLog = [];
r = Game.useAbility('tracker', 'track', null);
check('successful action narrates', sayLog.length > 0, 'SILENT — this is a bug');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
