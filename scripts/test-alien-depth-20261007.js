// Proof test: Alien Players depth — commentary, wealth, progression, groups.
// Run: node /tmp/test-alien-depth.js
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + msg); }
}

// ---------- JSON checks ----------
const personas = JSON.parse(fs.readFileSync('/tmp/apd-new.json', 'utf8'));
const byId = {};
personas.forEach(p => byId[p.id] = p);

const COMBAT_PIDS = ['vex_marlowe','countess_sable','rax_dentist','pip_quindle','sarge','dr_fenwick','old_tam'];

// 1. Wealth tiers
ok(byId['vex_marlowe'].wealth === 'rich', 'vex rich');
ok(byId['countess_sable'].wealth === 'rich', 'sable rich');
ok(byId['rax_dentist'].wealth === 'rich', 'rax rich');
ok(byId['pip_quindle'].wealth === 'broke', 'pip broke');
ok(byId['wren'].wealth === 'broke', 'wren broke');
ok(byId['old_tam'].wealth === 'broke', 'tam broke');
ok(byId['sarge'].wealth === 'comfortable', 'sarge comfortable');
ok(byId['dr_fenwick'].wealth === 'comfortable', 'fenwick comfortable');

// 2. Combat commentary: 15+ lines, all 5 situations, per combat persona
const SITUATIONS = ['onHit','onHurt','onWinning','onLosing','unhinged'];
for (const pid of COMBAT_PIDS) {
  const cl = byId[pid].combatLines;
  ok(!!cl, pid + ' has combatLines');
  let total = 0;
  for (const s of SITUATIONS) {
    ok(cl[s] && cl[s].length >= 3, pid + '.' + s + ' has 3+ lines');
    total += (cl[s] || []).length;
    // No empty lines, no duplicates within a situation
    const seen = new Set();
    for (const line of (cl[s] || [])) {
      ok(line && line.length > 3, pid + '.' + s + ' line non-trivial');
      ok(!seen.has(line), pid + '.' + s + ' no dupes');
      seen.add(line);
    }
  }
  ok(total >= 15, pid + ' has 15+ total combat lines (got ' + total + ')');
}
// Wren doesn't fight — no combat lines needed
ok(!byId['wren'].combatLines, 'wren has no combatLines (non-combat)');

// ---------- JS method checks (stub harness) ----------
const jsCode = fs.readFileSync('/tmp/ap-new.js', 'utf8');

// Static: new methods exist
const METHODS = ['apCombatLine','apSayCombat','apCombatChatter','apWealthOf','apWealthStance',
  'apApplyWealthStance','apProgressRate','apProgressLevel','apProgressiveKit','apProgressiveTech',
  'apGroupEligible','apRollGroupEncounter','apGroupBanter','apStartGroupEncounter'];
for (const m of METHODS) {
  ok(jsCode.includes(m + ': function') || jsCode.includes(m+':function'), 'method ' + m + ' defined');
}
// Static: no piloted-monster code remains
ok(!jsCode.includes('apMaybeInhabit'), 'no apMaybeInhabit (monsters stay monsters)');
ok(!jsCode.includes('apPilotAffinity'), 'no apPilotAffinity');

// Behavioral: build a minimal Game stub and eval the methods
const stubState = {
  systemArrived: true,
  scholar: { day: 50, hp: 80, maxHp: 100, mx: 4, my: 4 },
  village: { roster: ['v1','v2','v3'] },
  codex: {},
};
const Game = {
  state: stubState,
  data: { alienPlayers: personas },
  map: { px: 4, py: 4 },
  say: function(m) { this._said = this._said || []; this._said.push(m); },
  sysSay: function(m) {},
  displayName: function() { return 'TestVillager'; },
  unlockedWave: function() { return 2; },
  isSafeTile: function() { return false; },
  genDetail: function() { return []; },
  isNight: function() { return false; },
};
const sandbox = {
  window: { Scattering: { Game: Game } },
  global: {},
  console: console,
  Math: Math,
  JSON: JSON,
  Object: Object,
  Array: Array,
  Set: Set,
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(jsCode, sandbox);
const G = sandbox.window.Scattering.Game;

// Wealth stance behavior
function mkFighter(hp, maxHp) { return { hp: hp, maxHp: maxHp }; }
ok(G.apWealthStance('vex_marlowe', mkFighter(30, 100)) === 'enraged', 'rich enrages at low HP');
ok(G.apWealthStance('vex_marlowe', mkFighter(80, 100)) === 'normal', 'rich normal at high HP');
ok(G.apWealthStance('pip_quindle', mkFighter(30, 100)) === 'retreating', 'broke retreats at 30%');
ok(G.apWealthStance('pip_quindle', mkFighter(50, 100)) === 'cautious', 'broke cautious at 50%');
ok(G.apWealthStance('pip_quindle', mkFighter(90, 100)) === 'normal', 'broke normal at high HP');
ok(G.apWealthStance('sarge', mkFighter(15, 100)) === 'retreating', 'comfortable retreats at 15%');
ok(G.apWealthStance('sarge', mkFighter(40, 100)) === 'cautious', 'comfortable cautious at 40%');
ok(G.apWealthStance('sarge', mkFighter(80, 100)) === 'normal', 'comfortable normal at high HP');

// Wealth never retreats for rich (even at 1%)
ok(G.apWealthStance('countess_sable', mkFighter(1, 100)) === 'enraged', 'rich never retreats, enrages at 1%');

// Progression: rich faster than broke
// Simulate encounters
G.apState().met['vex_marlowe'] = { encounters: 5 };
G.apState().met['pip_quindle'] = { encounters: 5 };
const vexLevel = G.apProgressLevel('vex_marlowe');
const pipLevel = G.apProgressLevel('pip_quindle');
ok(vexLevel === 5, 'rich at 5 encounters = level 5 (got ' + vexLevel + ')');
ok(pipLevel === 2, 'broke at 5 encounters = level 2 (got ' + pipLevel + ')');
ok(vexLevel > pipLevel, 'rich progresses faster than broke');

// Progressive kit grows
G.apState().met['vex_marlowe'] = { encounters: 0 };
const kit0 = G.apProgressiveKit('vex_marlowe');
ok(kit0.length === 3, 'level 0 kit = 3 abilities (got ' + kit0.length + ')');
G.apState().met['vex_marlowe'] = { encounters: 5 };
const kit5 = G.apProgressiveKit('vex_marlowe');
ok(kit5.length === 6, 'level 5 kit = 6 abilities (got ' + kit5.length + ')');

// Progressive tech upgrades for rich
const tech0 = G.apProgressiveTech('vex_marlowe');
G.apState().met['vex_marlowe'] = { encounters: 0 };
const techBase = G.apProgressiveTech('vex_marlowe');
ok(techBase[0].name === 'Phase-net', 'base tech un-upgraded');
G.apState().met['vex_marlowe'] = { encounters: 5 };
const techUp = G.apProgressiveTech('vex_marlowe');
ok(techUp[0].name.includes('Mk.II'), 'rich tech upgrades to Mk.II (got ' + techUp[0].name + ')');

// Group encounter eligibility
G.apState().met = { 'vex_marlowe': { encounters: 3 }, 'countess_sable': { encounters: 2 } };
G.apState().lastGroupDay = -999;
ok(G.apGroupEligible() === true, 'group eligible with 2 rivals at day 50');
stubState.scholar.day = 20;
ok(G.apGroupEligible() === false, 'group NOT eligible before day 40');
stubState.scholar.day = 50;
G.apState().lastGroupDay = 45;
ok(G.apGroupEligible() === false, 'group NOT eligible within 14-day cooldown');
G.apState().lastGroupDay = -999;
G.apState().met = { 'vex_marlowe': { encounters: 3 } };
ok(G.apGroupEligible() === false, 'group NOT eligible with only 1 rival');

// Group banter produces output
G._said = [];
G.apState().known = { 'vex_marlowe': 'test', 'countess_sable': 'test' };
G.apGroupBanter(['vex_marlowe', 'countess_sable']);
ok(G._said.length >= 3, 'group banter says 3+ lines (got ' + G._said.length + ')');
ok(G._said.some(m => m.includes('Vex Marlowe') && m.includes('Sable')), 'vex+sable rivalry banter');

// Combat chatter respects knowledge gate
G._said = [];
G.apState().known = {};
const chattered = G.apCombatChatter('vex_marlowe', 'hit', mkFighter(80,100), 0.8);
ok(G._said.length === 0, 'no chatter when identity unknown (knowledge gate)');

// Combat line retrieval
G.apState().known = { 'vex_marlowe': 'test' };
const line = G.apCombatLine('vex_marlowe', 'onHit');
ok(!!line && line.length > 3, "combat line retrieved");
ok(G.apCombatLine('vex_marlowe', 'nonexistent') === null, 'bad situation returns null');
ok(G.apCombatLine('wren', 'onHit') === null, 'wren has no combat lines');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
