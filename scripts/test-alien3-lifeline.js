// BREAK-IT 3rd pass: benevolent lifeline paths (Steve 2026-10-08).
// The lifeline promise: "a bonded ally may save you from death."
// ATTACKS:
//  1. VERDICT-PATH LIFELINE (honesty/exploit): _contestVerdict calls
//     apContestInterference(ac) WITHOUT {forPlayer:true}. The lifeline block
//     only checks `playerIn` (player in ac.participants) — TRUE for the
//     player's own contest reaching VERDICT. So the lifeline fires when the
//     player is NOT dying: it consumes the 7-day cooldown, announces "the
//     killing blow misses" with no killing blow, and returns deathSave=true,
//     which _contestVerdict honors for VILLAGERS — converting a real played
//     death into 'lost' via a hidden 40% roll ("contests are PLAYED, not
//     RNG"). Design (ontology lifeline_player_only): the lifeline fires only
//     at the player's own death roll.
//     FIX: gate the lifeline block on forPlayer; remove the now-dead
//     villager-deathSave branch in _contestVerdict.
//  2. ARENA GAP (honesty): the lifeline guards ONLY the phase-engine death
//     path (contestChoose dmg -> apContestInterference(ac,{forPlayer:true})).
//     Arena deaths (Blood pit/gauntlet/siege) go tbEnd('lost') -> playerDeath
//     with NO lifeline check — the bonded ally's promise never fires in the
//     arena, the deadliest contest path.
//     FIX: check the lifeline in tbEnd's 'lost' branch when an arena contest
//     is active, before playerDeath.
//  3. FARMING BOUNDS (expected to HOLD): 7-day cooldown, bond>=2 with a
//     benevolent persona, 40% — no infinite death-farming.
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

function setup(day) {
  RNG.reset(20261008);
  const s = H.fresh(day || 50);
  Game.state.systemArrived = true;
  Game.state.waveKills = { 1: 10 };
  Game.isSafeTile = () => false;
  s.day = day || 50; s.hp = 100; s.maxHp = 100; s.health = 100;
  return s;
}
function bondTam(bond) {
  const ap = Game.apState();
  ap.met['old_tam'] = { encounters: 3, bond: bond, lastOutcome: 'won', lastDay: 40 };
  ap.lastLifelineDay = -999;
  return ap;
}

async function main() {
  await H.boot();

  section('1. verdict-path lifeline must never fire (no forPlayer)');
  {
    // The player's own contest reaching VERDICT: 'player' is in participants.
    let fired = 0, consumed = 0;
    for (let seed = 0; seed < 200; seed++) {
      setup(50);
      const ap = bondTam(2);
      const vil = (Game.state.village.roster || [])[0];
      const ac = { contestId: 'pit', participant: 'player', participants: ['player', vil] };
      RNG.reset((seed * 2654435761) >>> 0 || 1);
      H.clearLog();
      const r = Game.apContestInterference(ac) || {}; // verdict-style: NO forPlayer
      if (r.deathSave) fired++;
      if (ap.lastLifelineDay !== -999) consumed++;
    }
    assert(fired === 0, 'verdict-style call (no forPlayer) never returns deathSave (fired ' + fired + '/200)');
    assert(consumed === 0, 'verdict-style call never consumes the 7-day lifeline cooldown (consumed ' + consumed + '/200)');
  }

  section('2. arena deaths are guarded by the lifeline');
  {
    // Fake an arena fight loss: tbfight exists, arenaContest active.
    let saved = 0, died = 0;
    for (let seed = 0; seed < 60; seed++) {
      setup(50);
      const ap = bondTam(2);
      const s = Game.state.scholar;
      Game.state.arenaContest = { contestId: 'pit', waves: ['beast_x'], waveIdx: 0 };
      Game.state.activeContest = { contestId: 'pit', participant: 'player', participants: ['player'] };
      Game.tbfight = { id: 'arena1', fighters: [], over: false, turnIdx: 0, round: 1 };
      const fallenBefore = (Game.state.village.fallen || []).length;
      RNG.reset((seed * 40503 + 7) >>> 0 || 1);
      H.clearLog();
      try { Game.tbEnd('lost'); } catch (e) {}
      const fallenAfter = (Game.state.village.fallen || []).length;
      if (fallenAfter > fallenBefore || Game.state.over) died++;
      else saved++;
      // cleanup for next iteration
      try { Game.state.arenaContest = null; } catch (e) {}
      try { Game.state.activeContest = null; } catch (e) {}
    }
    assert(saved > 0, 'lifeline fired at least once across 60 arena deaths (saved ' + saved + '/60)');
    assert(died > 0, 'lifeline is not guaranteed (died ' + died + '/60 — 40% design holds)');
  }

  section('3. lifeline farming bounds hold');
  {
    // 3a. bond < 2 never fires, even with forPlayer:true
    let fired = 0;
    for (let seed = 0; seed < 100; seed++) {
      setup(50);
      bondTam(1);
      const ac = { contestId: 'pit', participant: 'player', participants: ['player'] };
      RNG.reset((seed * 2654435761 + 97) >>> 0 || 1);
      const r = Game.apContestInterference(ac, { forPlayer: true }) || {};
      if (r.deathSave) fired++;
    }
    assert(fired === 0, 'bond 1 never fires the lifeline (fired ' + fired + '/100)');
    // 3b. 7-day cooldown: a save today blocks a save tomorrow
    let fired2 = 0;
    for (let seed = 0; seed < 100; seed++) {
      setup(50);
      const ap = bondTam(2);
      ap.lastLifelineDay = 50; // saved today
      const ac = { contestId: 'pit', participant: 'player', participants: ['player'] };
      RNG.reset((seed * 2654435761 + 97) >>> 0 || 1);
      const r = Game.apContestInterference(ac, { forPlayer: true }) || {};
      if (r.deathSave) fired2++;
    }
    assert(fired2 === 0, 'lifeline on cooldown never re-fires same day (fired ' + fired2 + '/100)');
    // 3c. the forPlayer path CAN fire (the promise is real, not dead)
    let fired3 = 0;
    for (let seed = 0; seed < 200; seed++) {
      setup(50);
      bondTam(5);
      const ac = { contestId: 'pit', participant: 'player', participants: ['player'] };
      RNG.reset((seed * 2654435761 + 97) >>> 0 || 1);
      const r = Game.apContestInterference(ac, { forPlayer: true }) || {};
      if (r.deathSave) { fired3++; break; }
    }
    assert(fired3 > 0, 'forPlayer lifeline fires when bond/cooldown/RNG align (promise is live)');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
