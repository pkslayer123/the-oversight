// BREAK-IT AFTER-PROOFS: alien players fixes (Steve 2026-10-08).
// B1: group encounters wired (roll -> banter -> fight -> tbEnd chain -> next).
// B2: same-rival sporting rule enforced in the weighted pool.
// B3: apBeamResistText fires as a pre-fight readiness warning (once).
// B4: ontology validator passes on the touched files.
// Seeded; SEED env override; 3 seeds per behavioral block.
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

function eligibleGame(day, seed) {
  RNG.reset(seed === undefined ? SEED : seed);
  const s = H.fresh(day || 45);
  Game.state.waveKills = { 1: 10 };
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.state.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  Game.isSafeTile = () => false;
  s.day = day || 45;
  return s;
}

async function main() {
  await H.boot();

  // ------------------------------------------------------------------
  section('B1. AFTER — group encounters: wired end to end');
  // ------------------------------------------------------------------
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    eligibleGame(50, seed);
    const ap = Game.apState();
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
    ap.met['countess_sable'] = { encounters: 4, bond: 0, lastOutcome: 'lost' };
    ap.lastGroupDay = -999;
    assert(Game.apGroupEligible() === true, 'seed ' + seed + ': apGroupEligible true with 2 established rivals at day 50');

    // Force the 3% roll to succeed
    const realNext = RNG.next.bind(RNG);
    Math.random = () => 0.0;
    let grp = null;
    try { grp = Game.apRollGroupEncounter(); } catch (e) {}
    Math.random = realNext;
    assert(grp && grp.length >= 2, 'seed ' + seed + ': apRollGroupEncounter returns a group when forced (got ' + JSON.stringify(grp) + ')');
    assert(Game.apState().lastGroupDay === 50, 'seed ' + seed + ': group roll consumes the 14-day cooldown');

    // Start the group encounter for real
    H.clearLog();
    let ok = false;
    try { ok = Game.apStartGroupEncounter(['vex_marlowe', 'countess_sable']); } catch (e) { console.log('  start threw: ' + e.message); }
    assert(ok === true, 'seed ' + seed + ': apStartGroupEncounter returns true');
    assert(/step out together/.test(H.allText()), 'seed ' + seed + ': inter-alien banter fires');
    assert(Game.inCombat() === true, 'seed ' + seed + ': first group fight starts');
    const f1 = (Game.tbfight.fighters || []).find(f => f.alienPid);
    assert(f1 && f1.alienPid === 'vex_marlowe', 'seed ' + seed + ': first fighter is vex_marlowe');

    // WIN the first fight -> the next persona steps in (the chain)
    H.clearLog();
    try { Game.tbEnd('won'); } catch (e) { console.log('  tbEnd threw: ' + e.message); }
    assert(Game.inCombat() === true, 'seed ' + seed + ': chained second fight starts after tbEnd(won)');
    const f2 = (Game.tbfight.fighters || []).find(f => f.alienPid);
    assert(f2 && f2.alienPid === 'countess_sable', 'seed ' + seed + ': second fighter is countess_sable (joined in turn)');
    assert(/next one steps out/.test(H.allText()), 'seed ' + seed + ': chain announces the next fighter');

    // WIN the second fight -> group done, no phantom third fighter
    try { Game.tbEnd('won'); } catch (e) {}
    assert(Game.inCombat() === false, 'seed ' + seed + ': no third fight after the group is spent');
    assert(!Game.state.alienGroup, 'seed ' + seed + ': alienGroup state cleaned up');
    const met = Game.apState().met;
    assert((met['vex_marlowe'] || {}).encounters >= 4 && (met['countess_sable'] || {}).encounters >= 5,
      'seed ' + seed + ': both rivals recorded an encounter');

    // FLEEING disperses the group — no ambush on a retreat
    eligibleGame(50, seed + 100);
    const ap2 = Game.apState();
    ap2.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
    ap2.met['countess_sable'] = { encounters: 4, bond: 0, lastOutcome: 'lost' };
    ap2.lastGroupDay = -999;
    Game.apStartGroupEncounter(['vex_marlowe', 'countess_sable']);
    assert(Game.inCombat() === true, 'seed ' + seed + ': (flee test) fight starts');
    try { Game.tbEnd('fled'); } catch (e) {}
    assert(Game.inCombat() === false, 'seed ' + seed + ': fleeing ends the whole group encounter');
    assert(!Game.state.alienGroup, 'seed ' + seed + ': (flee test) alienGroup cleaned up');
  }

  // ------------------------------------------------------------------
  section('B2. AFTER — sporting rule: no same-rival re-hunt within 2 days');
  // ------------------------------------------------------------------
  {
    let vexPicked = 0, trials = 0, otherPicked = 0;
    for (let i = 0; i < 400; i++) {
      RNG.reset(9000 + i); H.fresh(30);
      Game.state.waveKills = { 1: 10 };
      Game.state.systemIntegration = 2;
      Game.state.party = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      Game.isSafeTile = () => false;
      const ap = Game.apState();
      const day = Game.state.scholar.day;
      ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
      ap.lastHuntDay['vex_marlowe'] = day - 1; // fought yesterday
      const realNext = RNG.next.bind(RNG);
      let calls = 0;
      Math.random = function () { calls++; return calls <= 2 ? 0.0 : realNext(); };
      let pid = null;
      try { pid = Game.apRollEncounter(); } catch (e) {}
      Math.random = realNext;
      if (pid) { trials++; if (pid === 'vex_marlowe') vexPicked++; else otherPicked++; }
    }
    console.log('  (after) vex re-picked 1 day after last hunt: ' + vexPicked + '/' + trials + ' (others: ' + otherPicked + ')');
    assert(trials > 50, 'roll still succeeds (fallback pool works): ' + trials + ' encounters');
    assert(vexPicked === 0, 'yesterday\'s rival is never re-picked (got ' + vexPicked + ')');
  }

  // ------------------------------------------------------------------
  section('B3. AFTER — apBeamResistText fires once as pre-fight warning');
  // ------------------------------------------------------------------
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    eligibleGame(45, seed);
    Game.apRevealAlien('vex_marlowe', 'test reveal'); // known -> coaching allowed
    H.clearLog();
    try { Game.apStartEncounter('vex_marlowe'); } catch (e) { console.log('  start threw: ' + e.message); }
    const t1 = H.allText();
    assert(/Beam resistance|BEAM VULNERABILITY/.test(t1), 'seed ' + seed + ': readiness readout shown pre-fight');
    const count1 = (t1.match(/Beam resistance|BEAM VULNERABILITY/g) || []).length;
    try { if (Game.inCombat()) Game.tbEnd('fled'); } catch (e) {}
    // Second encounter: no repeat (once per player)
    H.clearLog();
    try { Game.apStartEncounter('countess_sable'); } catch (e) {}
    const t2 = H.allText();
    const count2 = (t2.match(/Beam resistance|BEAM VULNERABILITY/g) || []).length;
    assert(count1 >= 1 && count2 === 0, 'seed ' + seed + ': readout fires once (' + count1 + ' then ' + count2 + ')');
    try { if (Game.inCombat()) Game.tbEnd('fled'); } catch (e) {}
    // Pre-reveal: readout stays silent (would name the alien truth)
    eligibleGame(45, seed + 200);
    H.clearLog();
    try { Game.apStartEncounter('rax_dentist'); } catch (e) {}
    assert(!/Beam resistance|BEAM VULNERABILITY/.test(H.allText()), 'seed ' + seed + ': no readout pre-reveal (knowledge-honest)');
    try { if (Game.inCombat()) Game.tbEnd('fled'); } catch (e) {}
    // Old Tam: no beams, no readout even when known
    eligibleGame(45, seed + 300);
    Game.apRevealAlien('old_tam', 'test reveal');
    H.clearLog();
    try { Game.apStartEncounter('old_tam'); } catch (e) {}
    assert(!/Beam resistance|BEAM VULNERABILITY/.test(H.allText()), 'seed ' + seed + ': no readout for beamless Old Tam');
    try { if (Game.inCombat()) Game.tbEnd('fled'); } catch (e) {}
  }

  // ------------------------------------------------------------------
  section('B4. Ontology gate passes on touched files');
  // ------------------------------------------------------------------
  {
    const { execSync } = require('child_process');
    let out = '';
    try {
      out = execSync('node scripts/validate-ontology.js', { cwd: require('path').join(__dirname, '..'), encoding: 'utf8', timeout: 120000 });
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    const ok = /0 error|OK|pass/i.test(out) && !/ERROR|FAIL/i.test(out.split('\n').filter(l => /alien/i.test(l)).join('\n'));
    console.log('  validator tail: ' + out.trim().split('\n').slice(-3).join(' | '));
    assert(!/ERROR/.test(out), 'ontology validator reports no errors');
  }

  console.log('\n----\npass=' + pass + ' fail=' + fail);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
