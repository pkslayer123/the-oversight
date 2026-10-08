#!/usr/bin/env node
// BREAK-IT: moot bribery honesty (social systems).
// Attack 1 (phantom attribution): simBriberyTick fabricates bribe entries with
//   by = the PLAYER's villagerId when the sim picks the victim's side and the
//   victim is the player. The player never paid, never chose — but
//   investigateBribery reports "YOU bought X", and exposing it punishes the
//   player (selfExposed: belief -30, trust -25) for a bribe they never made.
// Attack 2 (self-exposure swing): exposeBribery swings belief -30 whenever the
//   briber is the player (selfExposed), even when the player is the VICTIM —
//   where -30 (toward guilty) REWARDS the victim's case instead of punishing
//   the confession. Side-aware: accused-side briber exposed -> toward guilty
//   (-30); victim-side briber exposed -> toward acquit (+25, the case is tainted).
const H = require('./social-breakit-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}

function fakeCase(Game, accusedId, targetId) {
  const bs = Game.betrayalState();
  bs.cases = bs.cases || [];
  const c = {
    id: 'case_test', status: 'open', charge: 'theft',
    accused: [accusedId], accuser: targetId, target: targetId,
    belief: {}, evidence: [], bribes: [], exposedBribes: [],
    playerRole: 'bystander', knownToPlayer: true,
    trial: { present: [], votes: [], guilty: 0, awaitingPlayerVote: false },
  };
  for (const id of Game.npcIds()) c.belief[id] = 0;
  bs.cases.push(c);
  return c;
}

(async () => {
  const Game = await H.newSocialGame();
  const me = Game.villagerId;
  const npcs = Game.npcIds();
  const accused = npcs[0];

  // ---- Attack 1: phantom bribe attributed to the player ----
  const c = fakeCase(Game, accused, me); // player is the VICTIM
  let phantom = 0, trials = 0;
  for (let i = 0; i < 400 && !phantom; i++) {
    Game.simBriberyTick();
    trials++;
    for (const b of (c.bribes || [])) {
      if (b.by === me) { phantom++; }
    }
    if (phantom) break;
  }
  console.log('sim ticks:', trials, '| bribes with by=player (never paid):', phantom);
  check('sim never fabricates a player bribe', phantom === 0, `(${phantom} phantom bribes)`);
  // cleanup: remove the fake case's bribes so attack 2 starts clean
  c.bribes = [];

  // ---- Attack 2: victim-side self-exposure swing ----
  // Player (victim) consensually bribes a voter, then exposes their own bribe.
  // The fire should turn on the VICTIM's case (toward acquit, +belief), not
  // reward the confession with -30 toward guilty.
  const voter = npcs.find(id => id !== accused && id !== me);
  c.bribes.push({ voter, by: me, amount: 800, day: Game.state.scholar.day, trace: true });
  const before = Game.npcIds().reduce((s, id) => s + (c.belief[id] || 0), 0);
  Game.exposeBribery(c.id, voter);
  const after = Game.npcIds().reduce((s, id) => s + (c.belief[id] || 0), 0);
  console.log('belief sum before/after victim self-exposure:', before, '->', after);
  check('victim self-exposure taints the case (belief moves toward acquit)', after > before,
    `(${before} -> ${after})`);

  // ---- Control: accused-side self-exposure still punishes the accused ----
  const c2 = fakeCase(Game, me, npcs[1]); // player is the ACCUSED
  c2.id = 'case_test2';
  const voter2 = npcs.find(id => id !== me && id !== npcs[1]);
  c2.bribes.push({ voter: voter2, by: me, amount: 800, day: Game.state.scholar.day, trace: true });
  const b2 = Game.npcIds().reduce((s, id) => s + (c2.belief[id] || 0), 0);
  Game.exposeBribery(c2.id, voter2);
  const a2 = Game.npcIds().reduce((s, id) => s + (c2.belief[id] || 0), 0);
  console.log('belief sum before/after accused self-exposure:', b2, '->', a2);
  check('accused self-exposure fires on the accused (belief toward guilty)', a2 < b2,
    `(${b2} -> ${a2})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e); process.exit(2); });
