#!/usr/bin/env node
// TEST: 8 dead brawler actions fixed (Steve 2026-10-07)
// Verifies each of the 8 mechanically-dead brawler actions now has a real
// engine effect, plus the game.js hooks and data entries that back them.
// Reads the FIXED files from /tmp (pre-commit); the commit will contain
// exactly these bytes via the private-index route.

const fs = require('fs');
const vm = require('vm');

const AA_SRC = fs.readFileSync('/tmp/aa-fixed.js', 'utf8');
const GAME_SRC = fs.readFileSync('/tmp/game-fixed.js', 'utf8');
const AB = JSON.parse(fs.readFileSync('/tmp/ab-fixed.json', 'utf8'));
const SY = JSON.parse(fs.readFileSync('/tmp/sy-fixed.json', 'utf8'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// deterministic RNG
let seed = 7;
function srand(s) { seed = s; }
const realRandom = Math.random;
Math.random = function () {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

// ---- stub Game ----
let sayLog = [];
const applyCalls = [], cureCalls = [];
function makeGame() {
  sayLog = []; applyCalls.length = 0; cureCalls.length = 0;
  const scholar = {
    health: 100, kcal: 2000,
    fightDamageTaken: 0,
  };
  const G = {
    state: {
      scholar: scholar,
      village: { trust: {}, roster: ['v1', 'v2'] },
    },
    data: { abilities: AB },
    say: function (m) { sayLog.push(m); },
    audioEvent: function () {},
    modTarget: function (n, d) { return d; },
    hasAbility: function () { return true; },
    inCombat: function () { return !!(this.tbfight && !this.tbfight.over); },
    tbFighter: function (key) {
      if (!this.tbfight) return null;
      return this.tbfight.fighters.find(f => f.key === key) || null;
    },
    tbEndCheck: function () { return false; },
    encSubject: function (m) { return m.name || 'it'; },
    tbPatternKnown: function () { return false; },
    _stanceHint: function () { return 'it favors its left'; },
    // status engine stubs (record calls)
    applyStatus: function (t, id, opts) {
      applyCalls.push({ t: t, id: id, opts: opts });
      if (id === 'stun') t.stunned = Math.max(t.stunned || 0, (opts && opts.turns) || 1);
      return true;
    },
    cureStatus: function (t, id, src) {
      cureCalls.push({ t: t, id: id, src: src });
      return true;
    },
    tbfight: null,
    villagerId: 'player1',
  };
  return G;
}

// load abilityActions.js into the stub
function loadImpls(G) {
  const sandbox = {
    console: console, Math: Math,
    global: null, window: undefined,
  };
  sandbox.global = sandbox;
  // the IIFE reads typeof window !== 'undefined' ? window : global
  // with window undefined it uses `global` — give it our sandbox global
  // carrying Scattering.
  sandbox.Scattering = { Game: G };
  vm.createContext(sandbox);
  vm.runInContext(AA_SRC, sandbox, { filename: 'abilityActions.js' });
  return sandbox.AbilityActionImpls;
}


// extract one impl's source: from its key to the next top-level impl key
function implBody(key, nextKey) {
  const a = AA_SRC.indexOf("'" + key + "'");
  let b = AA_SRC.indexOf("'", a + key.length + 2);
  // find next impl key marker
  let end = AA_SRC.length;
  if (nextKey) {
    const n = AA_SRC.indexOf("'" + nextKey + "'", a + 10);
    if (n !== -1) end = n;
  }
  return AA_SRC.slice(a, end);
}

// ---- data checks ----
console.log('data:');
const abById = {};
AB.forEach(a => { abById[a.id] = a; });
function hasAction(abId, actId) {
  const a = abById[abId];
  return !!(a && (a.actions || []).some(x => x.id === actId));
}
const expected = [
  ['trade_of_blows', 'settle_debt'], ['trade_of_blows', 'open_trade'],
  ['unbreakable', 'brace'], ['unbreakable', 'shake_off'],
  ['war_cry', 'bellow'], ['fear_aura', 'loom'],
  ['brawler_instinct', 'read_fight'], ['intimidating_presence', 'stare_down'],
  ['iron_stomach', 'push_through'],
];
expected.forEach(([ab, act]) => check(`data: ${ab}.${act}`, hasAction(ab, act)));
['trade_of_blows', 'unbreakable', 'war_cry', 'haymaker', 'brawler_instinct', 'intimidating_presence']
  .forEach(id => check(`data: ability ${id} present`, !!abById[id]));
const syList = Array.isArray(SY) ? SY : SY.synergies;
const syIds = new Set(syList.filter(s => s && s.id).map(s => s.id));
['unstoppable', 'fear_itself', 'one_person_army']
  .forEach(id => check(`data: synergy ${id} present`, syIds.has(id)));
// brawler_instinct modifier no longer references dead combat.initiative
const biMods = JSON.stringify((abById['brawler_instinct'] || {}).modifiers || []);
check('data: brawler_instinct modifier not combat.initiative', !biMods.includes('combat.initiative'), biMods);

// ---- behavior checks ----
console.log('behavior:');

// 1. settle_debt fires when fightDamageTaken was written
{
  const G = makeGame();
  const impls = loadImpls(G);
  G.state.scholar.fightDamageTaken = 30; // as tbDamage now writes
  const r = impls['trade_of_blows.settle_debt'](G, null);
  check('1 settle_debt: fires with damage taken', r === true);
  check('1 settle_debt: bonus = 50% of 30 = 15', G.state.scholar.settleDebtBonus === 15,
    'got ' + G.state.scholar.settleDebtBonus);
  check('1 settle_debt: narrates', sayLog.some(m => /cash in|Settle the Debt/i.test(m)));
  const r2 = impls['trade_of_blows.settle_debt'](G, null);
  check('1 settle_debt: once per fight', r2 === false);
}

// 2. brace: _applyAbilityDefenseMods reduces
{
  const G = makeGame();
  const impls = loadImpls(G);
  impls['unbreakable.brace'](G, null);
  check('2 brace: sets braceActive', !!G.state.scholar.braceActive);
  const reduced = G._applyAbilityDefenseMods(100, 'test');
  check('2 brace: 100 -> 40 (60% reduction)', reduced === 40, 'got ' + reduced);
  check('2 brace: flag consumed', !G.state.scholar.braceActive);
  check('2 brace: narrates reduction', sayLog.some(m => /BRACE/i.test(m)));
}

// 3. bellow: uses applyStatus (stun), beasts may flee
{
  const G = makeGame();
  const impls = loadImpls(G);
  srand(1);
  const m1 = { kind: 'monster', alive: true, name: 'grub', mdef: { id: 'grub', aggression: 'territorial' }, stunned: 0 };
  const m2 = { kind: 'monster', alive: true, name: 'skit', mdef: { id: 'skit', aggression: 'skittish' }, stunned: 0 };
  G.tbfight = { fighters: [m1, m2], over: false };
  // force courage-check failures: run until we see applications
  let sawStun = false, sawFlee = false;
  for (let i = 0; i < 40 && !(sawStun && sawFlee); i++) {
    m1.stunned = 0; m1.fled = false; m2.stunned = 0; m2.fled = false;
    applyCalls.length = 0;
    impls['war_cry.bellow'](G, null);
    if (applyCalls.some(c => c.id === 'stun')) sawStun = true;
    if (m1.fled || m2.fled) sawFlee = true;
  }
  check('3 bellow: applies stun via applyStatus', sawStun);
  check('3 bellow: no m.stunTurns writes',
    !/m\.stunTurns\s*=/.test(implBody('war_cry.bellow', 'war_cry.challenge')));
  check('3 bellow: skittish beast can flee', sawFlee);
  check('3 bellow: narrates', sayLog.some(m => /BELLOW/i.test(m)));
}

// 4. shake_off: cures via cureStatus
{
  const G = makeGame();
  const impls = loadImpls(G);
  const pf = { key: 'p', kind: 'player', stunned: 2, stunFull: 1 };
  G.tbfight = { fighters: [pf], over: false };
  const r = impls['unbreakable.shake_off'](G, null);
  check('4 shake_off: returns true', r === true);
  const ids = cureCalls.map(c => c.id);
  check('4 shake_off: cures stun', ids.includes('stun'));
  check('4 shake_off: cures stun_full', ids.includes('stun_full'));
  check('4 shake_off: cures slow', ids.includes('slow'));
  check('4 shake_off: cures bleed', ids.includes('bleed'));
  check('4 shake_off: no s.stun/s.slow/s.bleed writes',
    !/s\.(stun|slow|bleed)\s*=\s*0/.test(implBody('unbreakable.shake_off', 'war_cry.bellow')));
  check('4 shake_off: narrates honestly', sayLog.some(m => /Shake It Off/i.test(m)));
}

// 5. loom: sets loomHesitate, trust -5 on witnesses
{
  const G = makeGame();
  const impls = loadImpls(G);
  const m = { kind: 'monster', alive: true, name: 'grub' };
  const w = { kind: 'villager', alive: true, villagerId: 'v1', name: 'Ash' };
  G.tbfight = { fighters: [m, w], over: false };
  G.state.village.trust = { v1: 40 };
  const r = impls['fear_aura.loom'](G, null);
  check('5 loom: returns true', r === true);
  check('5 loom: monster hesitates', m.loomHesitate === true);
  check('5 loom: witness trust 40 -> 35', G.state.village.trust.v1 === 35,
    'got ' + G.state.village.trust.v1);
  check('5 loom: no s.loomActive', !G.state.scholar.loomActive);
  check('5 loom: narrates', sayLog.some(mm => /Loom/i.test(mm)));
}

// 6. read_fight: +2 speed, orderDirty
{
  const G = makeGame();
  const impls = loadImpls(G);
  const pf = { key: 'p', kind: 'player', speed: 3 };
  G.tbfight = { fighters: [pf], over: false, orderDirty: false };
  const r = impls['brawler_instinct.read_fight'](G, 'p');
  check('6 read_fight: returns true', r === true);
  check('6 read_fight: speed 3 -> 5', pf.speed === 5, 'got ' + pf.speed);
  check('6 read_fight: orderDirty set', G.tbfight.orderDirty === true);
  check('6 read_fight: no initiativeBonus', !G.state.scholar.fightRead || !G.state.scholar.fightRead.initiativeBonus);
  check('6 read_fight: text says speed not initiative',
    sayLog.some(mm => /\+2 speed/i.test(mm)) && !sayLog.some(mm => /initiative/i.test(mm)));
  // out-of-combat: banks fightRead
  const G2 = makeGame();
  const impls2 = loadImpls(G2);
  impls2['brawler_instinct.read_fight'](G2, null);
  check('6 read_fight: banks speedBonus out of combat',
    G2.state.scholar.fightRead && G2.state.scholar.fightRead.speedBonus === 2);
}

// 7. stare_down: fled on success
{
  const G = makeGame();
  const impls = loadImpls(G);
  let sawFled = false, sawHeld = false;
  for (let i = 0; i < 30 && !(sawFled && sawHeld); i++) {
    srand(i * 13 + 5);
    const m = { key: 'm1', kind: 'monster', alive: true, name: 'grub', mdef: { id: 'grub' } };
    G.tbfight = { fighters: [m], over: false };
    impls['intimidating_presence.stare_down'](G, 'm1');
    if (m.fled) sawFled = true; else sawHeld = true;
  }
  check('7 stare_down: can make monster flee', sawFled);
  check('7 stare_down: can hold (honest fail)', sawHeld);
  check('7 stare_down: no m.disengaging writes',
    !/m\.disengaging\s*=/.test(implBody('intimidating_presence.stare_down', 'intimidating_presence.end_it_before')));
}

// 8. push_through: expedition clock
{
  const G = makeGame();
  const impls = loadImpls(G);
  const r = impls['iron_stomach.push_through'](G, null);
  check('8 push_through: returns true', r === true);
  check('8 push_through: sets pushThroughParts=1', G.state.scholar.pushThroughParts === 1);
  check('8 push_through: no Date.now',
    !/Date\.now\(\)/.test(implBody('iron_stomach.push_through', 'trade_of_blows.open_trade').replace(/\/\/.*/g, '')));
  check('8 push_through: narrates day part', sayLog.some(m => /next part of the day/i.test(m)));
}

// ---- game.js hook checks ----
console.log('engine hooks:');
check('hook: tbDamage writes fightDamageTaken',
  /fightDamageTaken.*\+ final/.test(GAME_SRC) || /fightDamageTaken\] = \(.*\+ final/.test(GAME_SRC));
check('hook: tbDamage calls _applyAbilityDefenseMods', /_applyAbilityDefenseMods\(final/.test(GAME_SRC));
check('hook: startCombat resets fightDamageTaken', /s\.fightDamageTaken = 0/.test(GAME_SRC));
check('hook: tbAdvance re-sorts on orderDirty', /orderDirty/.test(GAME_SRC) && /turnOrder\(f\.fighters\)/.test(GAME_SRC));
check('hook: tbMonsterTurn consumes loomHesitate', /m\.loomHesitate/.test(GAME_SRC));
check('hook: playerSpeed consumes combat.player_speed', /combat\.player_speed/.test(GAME_SRC));
check('hook: advancePart decrements pushThroughParts', /pushThroughParts--/.test(GAME_SRC));
check('hook: poison rolls check pushThroughParts', (GAME_SRC.match(/pushThroughParts \|\| 0\) > 0/g) || []).length >= 2);

Math.random = realRandom;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
