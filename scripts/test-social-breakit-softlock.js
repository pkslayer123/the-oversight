#!/usr/bin/env node
// BREAK-IT: social softlocks.
// Attack 1: probationTick when the probation village record is gone
//   (destroyed/abandoned). Old code: s.probation=null, but s.exiled=false,
//   s.joinedVillage=stale id, s.drifting=false -> drift() says "You have a
//   home", petition can't find it, no village card -> the player is nowhere.
//   Fixed: the road takes you back — exile state restored, drift/petition/
//   founding all reachable.
// Attack 2: moot with zero attendees (no present voters, player not voting).
//   Must resolve without crashing and narrate honestly — never hang on an
//   awaitingPlayerVote that can never be cast.
const H = require('./social-breakit-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}

(async () => {
  const Game = await H.newSocialGame();
  const me = Game.villagerId;
  const s = Game.state.scholar;

  // ---- Attack 1: probation village vanishes ----
  Game.state.otherVillages = Game.state.otherVillages || [];
  const ov = { id: 'ov_test', name: 'Testville', x: 3, y: 3, population: 8, trust: 5, day: 1 };
  Game.state.otherVillages.push(ov);
  Game.exilePlayer('test');
  Game.joinVillageReal('ov_test');
  // the village is destroyed while the player is on probation
  Game.state.otherVillages = Game.state.otherVillages.filter(x => x.id !== 'ov_test');
  s.probation.daysLeft = 1;
  Game.map.px = 3; Game.map.py = 3;
  Game.probationTick();
  const stuck = !s.exiled && !s.drifting && s.joinedVillage;
  console.log('after vanished-village probationTick: exiled=' + s.exiled, 'drifting=' + s.drifting,
    'joinedVillage=' + s.joinedVillage, 'probation=' + JSON.stringify(s.probation));
  check('no nowhere-state after village vanishes', !stuck,
    stuck ? '(exiled=false, drifting=false, joinedVillage=stale — NOWHERE)' : '');
  // the player must have a way forward: drift, petition, or found
  const canDrift = s.exiled && Game.drift() === true;
  check('drift reachable after village vanishes', canDrift, '');

  // ---- Attack 2: empty moot ----
  const bs = Game.betrayalState();
  bs.cases = bs.cases || [];
  const accused = Game.npcIds()[0];
  const c = {
    id: 'case_empty', status: 'open', charge: 'theft',
    accused: [accused], accuser: Game.npcIds()[1], target: Game.npcIds()[1],
    belief: {}, evidence: [], bribes: [], exposedBribes: [],
    playerRole: 'juror', knownToPlayer: true,
  };
  bs.cases.push(c);
  // rig: nobody shows up, player doesn't vote (playerConvened=false, force R>=0.9)
  const realRandom = Math.random;
  Math.random = () => 0.99; // present filter R()<0.88 -> empty; playerVoter R()<0.9 -> false
  let result = null, threw = null;
  try {
    result = Game.callMoot(c.id, Game.npcIds()[2]);
  } catch (e) { threw = e; }
  Math.random = realRandom;
  console.log('empty moot threw:', threw ? threw.message : 'no', '| result:', JSON.stringify(result));
  check('empty moot resolves without throwing', !threw, threw ? threw.message : '');
  check('empty moot acquits (no votes to convict)', result && result.acquitted === true,
    JSON.stringify(result));
  check('empty moot leaves no hanging player vote', !(c.trial && c.trial.awaitingPlayerVote), '');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e); process.exit(2); });
