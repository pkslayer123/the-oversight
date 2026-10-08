// BREAK-IT: group encounter chain + apStartEncounter honesty (Steve 2026-10-08).
// ATTACKS:
//   1. apStartEncounter returns TRUE even when startAlienCombat refuses to
//      start the fight (returns null when a fight is already active). The
//      caller believes a fight started; state.alienEncounter is left pointing
//      at a phantom encounter, and apStartGroupEncounter re-arms
//      state.alienGroup around a fight that never began. The next tbEnd with
//      an alienPid then records a phantom met-encounter for a fight that
//      never happened (encounters++ without combat).
//   2. SOFTLOCK probe: win the first fight of a group encounter — the tbEnd
//      wrap must chain the next persona (a real second fight starts), not
//      silently drop the group or loop forever.
// FIX: apStartEncounter returns the honest result of startAlienCombat
//   (false when the fight couldn't start, with state cleaned up); the
//   fallback flavor path (no startAlienCombat defined) still returns true.
// These assertions encode the FIXED behavior — they FAIL before the fix.
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261008', 10);

function eligibleGame(seed, day) {
  RNG.reset(seed);
  const s = H.fresh(day || 50);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.isSafeTile = () => false;
  Game.state.waveKills = { 1: 10 };
  s.day = day || 50; s.hp = 100; s.maxHp = 100; s.health = 100;
  return s;
}
function endFight() {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  try { delete Game.state.alienEncounter; } catch (e) {}
  try { delete Game.state.alienGroup; } catch (e) {}
}

async function main() {
  await H.boot();

  section('apStartEncounter is honest when no fight can start');
  {
    eligibleGame(SEED, 50);
    Game.apState().known['sarge'] = 'test';
    // Occupy the engine with a live fight first.
    Game.apStartEncounter('sarge');
    const first = Game.tbfight;
    assert(!!first && !first.over, 'setup: first fight is live');
    H.clearLog();
    // Now try to start ANOTHER encounter while in combat.
    const r = Game.apStartEncounter('pip_quindle');
    assert(r === false, 'second apStartEncounter while inCombat returns false (not a lie)');
    assert(!Game.state.alienEncounter || Game.state.alienEncounter.pid === 'sarge',
      'no phantom alienEncounter for pip (state: ' + JSON.stringify(Game.state.alienEncounter && Game.state.alienEncounter.pid) + ')');
    assert(!Game.state.alienGroup, 'no stale alienGroup armed around a fight that never began');
    endFight();
  }

  section('group chain: winning fight 1 starts fight 2 (no softlock, no drop)');
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    eligibleGame(seed, 50);
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
    ap.met['countess_sable'] = { encounters: 4, bond: 0, lastOutcome: 'lost' };
    ap.known['vex_marlowe'] = 'test';
    ap.known['countess_sable'] = 'test';
    ap.lastGroupDay = -999;
    H.clearLog();
    const started = Game.apStartGroupEncounter(['vex_marlowe', 'countess_sable']);
    assert(started === true, 'seed ' + seed + ': group encounter starts');
    const f1 = Game.tbfight;
    assert(!!f1 && !f1.over, 'seed ' + seed + ': first fight is live');
    if (!f1) continue;
    const m1 = f1.fighters.find(x => x.kind === 'hostile' && x.alienPid);
    assert(m1 && m1.alienPid === 'vex_marlowe', 'seed ' + seed + ': first fighter is vex (' + (m1 && m1.alienPid) + ')');
    // WIN fight 1: drop the alien, end the fight as won.
    m1.hp = 0; m1.alive = false;
    H.clearLog();
    try { Game.tbEnd('won'); } catch (e) { console.log('  tbEnd threw: ' + e.message); }
    const said = H.sayText();
    assert(/next one steps out/i.test(said), 'seed ' + seed + ': chain narration fires ("the next one steps out")');
    const f2 = Game.tbfight;
    assert(!!f2 && !f2.over && f2 !== f1, 'seed ' + seed + ': a SECOND live fight replaced the first');
    if (f2 && !f2.over && f2 !== f1) {
      const m2 = f2.fighters.find(x => x.kind === 'hostile' && x.alienPid);
      assert(m2 && m2.alienPid === 'countess_sable', 'seed ' + seed + ': second fighter is sable (' + (m2 && m2.alienPid) + ')');
    }
    assert(Game.apState().met['vex_marlowe'].encounters === 4, 'seed ' + seed + ': vex met-record incremented exactly once (no phantom)');
    endFight();
  }

  section('group chain: fleeing disperses the group (no ambush on retreat)');
  {
    eligibleGame(SEED + 40, 50);
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0 };
    ap.met['sarge'] = { encounters: 3, bond: 0 };
    ap.known['vex_marlowe'] = 'test'; ap.known['sarge'] = 'test';
    ap.lastGroupDay = -999;
    Game.apStartGroupEncounter(['vex_marlowe', 'sarge']);
    const f1 = Game.tbfight;
    assert(!!f1 && !f1.over, 'setup: group fight 1 live');
    H.clearLog();
    try { Game.tbEnd('fled'); } catch (e) {}
    assert(!Game.state.alienGroup, 'fleeing disperses the group (alienGroup cleared)');
    assert(!Game.tbfight || Game.tbfight.over || Game.tbfight === f1, 'no second fight forced after a flee');
    endFight();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
