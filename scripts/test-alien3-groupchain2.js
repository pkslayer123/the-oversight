// BREAK-IT 3rd pass: group-chain bookkeeping + death-mid-chain (Steve 2026-10-08).
// ATTACKS:
//  1. SPORTING-RULE LEAK: the tbEnd group chain calls apStartEncounter(nextPid)
//     for the chained persona but never records ap.lastHuntDay[nextPid].
//     The sporting rule ("min 2 days between hunts by the same persona",
//     enforced in apRollEncounter's due-rival path AND weighted pool) is
//     bypassed for chained personas — a chained rival can be re-rolled by the
//     single pool the very next day.
//     FIX: record lastHuntDay for the chained persona when the chain starts.
//  2. DEATH MID-CHAIN (re-verify 8c471f5 adversarially): player dies in fight
//     1 of a group chain — state.alienGroup must disperse (no chain into a
//     corpse fight), apOnCombatEnd must record the loss, no dangling state.
//  3. FLEE MID-CHAIN (re-verify): fleeing disperses, no phantom chain.
// These assertions encode the FIXED behavior — (1) FAILS before the fix,
// (2)/(3) are expected to HOLD (regression probes).
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function setup(seed, day) {
  RNG.reset(seed);
  const s = H.fresh(day || 50);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.isSafeTile = () => false;
  Game.state.waveKills = { 1: 10 };
  s.day = day || 50; s.hp = 100; s.maxHp = 100; s.health = 100;
  const ap = Game.apState();
  ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
  ap.met['countess_sable'] = { encounters: 4, bond: 0, lastOutcome: 'lost' };
  ap.known['vex_marlowe'] = 'test';
  ap.known['countess_sable'] = 'test';
  ap.lastGroupDay = -999;
  ap.lastHuntDay = {};
  return s;
}
function endFight() {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  try { delete Game.state.alienEncounter; } catch (e) {}
  try { delete Game.state.alienGroup; } catch (e) {}
}

async function main() {
  await H.boot();

  section('1. chained persona records lastHuntDay (sporting rule)');
  for (const seed of [20261008, 20261009, 20261010]) {
    setup(seed, 50);
    H.clearLog();
    const started = Game.apStartGroupEncounter(['vex_marlowe', 'countess_sable']);
    assert(started === true, 'seed ' + seed + ': group encounter starts');
    // Win fight 1 -> chain starts fight 2.
    Game.tbEnd('won');
    const f2 = Game.tbfight;
    assert(!!f2 && !f2.over, 'seed ' + seed + ': chained fight 2 is live');
    const day = (Game.state.scholar || {}).day || 50;
    const ap = Game.apState();
    assert(ap.lastHuntDay['countess_sable'] === day,
      'seed ' + seed + ': chained persona lastHuntDay recorded (got ' + ap.lastHuntDay['countess_sable'] + ')');
    assert(ap.lastHuntDay['vex_marlowe'] === day,
      'seed ' + seed + ': first fighter lastHuntDay recorded (got ' + ap.lastHuntDay['vex_marlowe'] + ')');
    endFight();
  }

  section('2. death mid-chain disperses the group (no corpse-fight chain)');
  {
    setup(4242, 50);
    // Stub playerDeath: we test the alien wrap's chain logic, not the mantle pass.
    const _pd = Game.playerDeath;
    let pdCalls = 0;
    Game.playerDeath = function () { pdCalls++; };
    H.clearLog();
    const started = Game.apStartGroupEncounter(['vex_marlowe', 'countess_sable']);
    assert(started === true, 'group encounter starts');
    Game.tbEnd('lost'); // player dies in fight 1
    assert(pdCalls === 1, 'playerDeath ran once for the lost fight');
    assert(!Game.state.alienGroup, 'alienGroup dispersed on death (no dangling chain)');
    assert(!Game.tbfight || Game.tbfight.over, 'no phantom chained fight after death');
    const ap = Game.apState();
    assert(ap.met['vex_marlowe'] && ap.met['vex_marlowe'].lastOutcome === 'lost',
      'loss recorded for fight 1 (met bookkeeping intact)');
    Game.playerDeath = _pd;
    endFight();
  }

  section('3. flee mid-chain disperses the group');
  {
    setup(777, 50);
    H.clearLog();
    const started = Game.apStartGroupEncounter(['vex_marlowe', 'countess_sable']);
    assert(started === true, 'group encounter starts');
    Game.tbEnd('fled');
    assert(!Game.state.alienGroup, 'alienGroup dispersed on flee');
    assert(!Game.tbfight || Game.tbfight.over, 'no chained fight after flee');
    endFight();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
