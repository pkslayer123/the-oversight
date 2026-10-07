#!/usr/bin/env node
// TEST: Status Effect Engine (Steve 2026-10-07)
// Verifies Game.applyStatus()/tickStatuses()/cureStatus() — the data-driven
// status framework. Covers: apply, resistance, immunity, stacking, duration,
// per-turn and per-dayPart ticks, expiry, cure, legacy bridges (stun fields,
// s.diseases/s.poisons), slow move mod, fear fizzle.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { execSync } = require('child_process');

function headFile(p) {
  try { return execSync(`git show HEAD:${p}`, { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
}
const seJson = JSON.parse(headFile('src/data/statusEffects.json'));
const statuses = seJson.statuses;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- 1. Data integrity ----
console.log('data:');
for (const id of ['poison', 'disease', 'bleed', 'stun', 'stun_full', 'fear', 'slow', 'burn']) {
  check(`definition exists: ${id}`, !!statuses[id]);
  const d = statuses[id] || {};
  check(`${id} has tick or effect`, !!(d.tick || d.effect || d.duration), 'needs tick/effect/duration');
}
check('poison bridges s.poisons', statuses.poison.bridge && statuses.poison.bridge.legacy === 'poisons');
check('disease bridges s.diseases', statuses.disease.bridge && statuses.disease.bridge.legacy === 'diseases');
check('stun bridges legacy stunned', statuses.stun.bridge && statuses.stun.bridge.legacyField === 'stunned');
check('stun_full bridges stunFull', statuses.stun_full.bridge && statuses.stun_full.bridge.legacyFullField === 'stunFull');
check('stun immuneIf elderCalm', statuses.stun.immuneIf === 'elderCalm');

// ---- 2. Engine behavior (stub Game) ----
console.log('engine:');
let sayLog = [];
const Game = {
  data: { statusEffects: seJson },
  state: { scholar: { health: 100, day: 5, kcal: 2000, diseases: [], poisons: [] } },
  say: function (msg) { sayLog.push(msg); },
  audioEvent: function () {},
  modTarget: function (name, dflt) { return this._mods && this._mods[name] != null ? this._mods[name] : dflt; },
  _mods: {},
  monsterDisplayName: function (id) { return id || 'monster'; },
  tbEndCheck: function () { return false; },
};
Game.state.scholar.statuses = undefined;

const _g = { Scattering: { Game: Game } };
const src = headFile('src/js/statusEffects.js');
// The module is an IIFE: (function (_g) {...})(typeof window !== 'undefined' ? window : global)
// Invoke it with our stub holder as `global`.
(function () {
  const vm = require('vm');
  const sandbox = { _gholder: _g, Math: Math, console: console };
  sandbox.window = undefined;
  const patched = src.replace(
    /\(typeof window !== 'undefined' \? window : global\);?\s*$/,
    '(_gholder);'
  );
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox);
})();
if (typeof Game.applyStatus !== 'function') {
  console.log('FAIL module did not attach to Game');
  process.exit(1);
}

sayLog = [];
// apply poison to scholar
let r = Game.applyStatus('scholar', 'poison', { name: 'bad mushroom', source: 'the stew' });
check('apply poison -> true', r === true);
check('scholar has poison', Game.hasStatus('scholar', 'poison'));
check('legacy s.poisons bridged', Game.state.scholar.poisons.length === 1 && Game.state.scholar.poisons[0].name === 'bad mushroom');
check('apply narrates', sayLog.length > 0 && /poisoned/i.test(sayLog.join(' ')));

// stacking
Game.applyStatus('scholar', 'poison', { name: 'bad mushroom' });
const pst = Game.state.scholar.statuses.find(s => s.id === 'poison');
check('poison stacks to 2', pst && pst.stacks === 2);
check('legacy not double-pushed on stack', Game.state.scholar.poisons.length === 1);

// dayPart tick: 3 hp per stack x2 = 6
const hpBefore = Game.state.scholar.health;
sayLog = [];
Game.tickStatuses('scholar', 'dayPart');
check('poison ticks 6 hp (2 stacks)', Game.state.scholar.health === hpBefore - 6, `hp ${hpBefore} -> ${Game.state.scholar.health}`);
check('dayPartsLeft decremented', pst.dayPartsLeft === 5);

// cure
sayLog = [];
const cured = Game.cureStatus('scholar', 'poison', 'purify');
check('cure returns true', cured === true);
check('poison gone from engine', !Game.hasStatus('scholar', 'poison'));
check('legacy s.poisons cleared', Game.state.scholar.poisons.length === 0);
check('cure narrates', sayLog.length > 0);

// disease + cure
Game.applyStatus('scholar', 'disease', { name: 'ague' });
check('disease applied', Game.hasStatus('scholar', 'disease'));
check('legacy s.diseases bridged', Game.state.scholar.diseases.length === 1);
Game.cureStatus('scholar', 'disease', 'herbal remedy');
check('disease cured + legacy cleared', !Game.hasStatus('scholar', 'disease') && Game.state.scholar.diseases.length === 0);

// resistance: iron_stomach-like 0 mod -> always resisted
Game._mods = { 'food.poison_chance': 0 };
sayLog = [];
r = Game.applyStatus('scholar', 'poison', { verbose: true });
check('resisted at 0 chance', r === false && !Game.hasStatus('scholar', 'poison'));
Game._mods = {};

// immunity: elderCalm monster immune to stun
const elder = { kind: 'monster', name: 'Elder', mdef: { id: 'x' }, elderCalm: true, hp: 50, alive: true };
sayLog = [];
r = Game.applyStatus(elder, 'stun', { turns: 1 });
check('elder immune to stun', r === false && (elder.stunned || 0) === 0);

// stun on normal monster: legacy field bridged
const gob = { kind: 'monster', name: 'gob', mdef: { id: 'gob' }, hp: 30, alive: true };
sayLog = [];
r = Game.applyStatus(gob, 'stun', { turns: 1, silent: true });
check('stun applied silently', r === true);
check('legacy stunned field set', gob.stunned === 1);
check('engine has stun', Game.hasStatus(gob, 'stun'));

// stun_full bridges both fields
const gob2 = { kind: 'monster', name: 'gob2', mdef: { id: 'gob' }, hp: 30, alive: true };
Game.applyStatus(gob2, 'stun_full', { turns: 1, silent: true });
check('stun_full sets stunned + stunFull', gob2.stunned === 1 && gob2.stunFull === 1);

// bleed tick on fighter
const bleeder = { kind: 'monster', name: 'bleeder', hp: 30, alive: true };
Game.applyStatus(bleeder, 'bleed', { silent: true });
const bhp = bleeder.hp;
sayLog = [];
Game.seTickFighter(bleeder);
check('bleed ticks 4 hp', bleeder.hp === bhp - 4, `hp ${bhp} -> ${bleeder.hp}`);
check('bleed narrates', sayLog.length > 0);

// bleed expiry after 3 turns
Game.seTickFighter(bleeder);
Game.seTickFighter(bleeder);
check('bleed expired after 3 turns', !Game.hasStatus(bleeder, 'bleed'));

// slow move mod
const slowpoke = { kind: 'player', name: 'You', hp: 100, alive: true, speed: 4 };
check('no slow -> mod 1', Game.seMoveMod(slowpoke) === 1);
Game.applyStatus(slowpoke, 'slow', { silent: true });
check('slow -> mod 0.5', Game.seMoveMod(slowpoke) === 0.5);
check('seSteps halves speed', Game.seSteps(slowpoke) === 2);

// fear fizzle: no fear -> false
const brave = { kind: 'monster', name: 'brave', hp: 20, alive: true };
check('no fear -> no fizzle', Game.seFizzle(brave) === false);

// unknown id -> false, no crash
check('unknown id -> false', Game.applyStatus('scholar', 'nope', {}) === false);

// cureStatus on missing -> false, no narration crash
sayLog = [];
check('cure missing -> false', Game.cureStatus('scholar', 'burn', 'x') === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
