#!/usr/bin/env node
// BREAK-IT: promise trust farming (social systems).
// Attack 1: promiseHelp writes +6 trust DIRECTLY, bypassing resolveConsequence
//   (no 40 talk cap, no progressive scaling, no mediation halving).
// Attack 2: checkPromises(kind) fulfills EVERY villager's matching promise on
//   ANY kind-matching action — one conversation end fulfills all 'belong'
//   promises village-wide (+15 each); one food handoff fulfills all 'feed'
//   promises (+15 each).
// Expected after fix: +6 routes through the resolver (talk-capped at 40,
// progressive), and fulfillment scopes to the villager involved in the action.
const H = require('./social-breakit-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}

(async () => {
  const Game = await H.newSocialGame();
  const npcs = Game.npcIds();
  const t = () => Game.state.village.trust || {};

  // ---- Attack 1: promise +6 bypasses the talk cap ----
  // Find a villager with a fulfillable goal; force trust to just under the cap.
  const vid = npcs.find(id => ['feed', 'belong', 'protect', 'heal', 'prove'].includes(Game.npcGoal(id))) || npcs[0];
  Game.state.village.trust = Game.state.village.trust || {};
  t()[vid] = 39;
  const before = t()[vid];
  const pr = Game.promiseHelp(vid);
  const after = t()[vid];
  console.log('promise goal for', vid.slice(0, 8), '=', Game.npcGoal(vid), '| trust', before, '->', after);
  check('promise +6 respects the 40 talk cap', after <= 40, `(was ${before}, now ${after})`);

  // ---- Attack 2a: one conversation end fulfills ALL belong promises ----
  // Force goals deterministically (npcGoal falls back to bgGoals).
  Game.state.village.bgGoals = Game.state.village.bgGoals || {};
  Game.state.village.bgGoals[npcs[0]] = 'belong';
  Game.state.village.bgGoals[npcs[1]] = 'belong';
  Game.state.village.bgGoals[npcs[2]] = 'feed';
  const belongers = [npcs[0], npcs[1]];
  console.log('villagers with belong goal:', belongers.length);
  for (const id of belongers) {
    Game.state.village.trust[id] = 10;
    Game.state.village.promises = Game.state.village.promises || {};
    Game.state.village.promises[id] = { goal: 'belong', day: Game.state.scholar.day, kept: false };
  }
  // end a conversation with someone ELSE (not a belonger)
  const other = npcs.find(id => !belongers.includes(id));
  Game.startConvo(other);
  Game.endConvo(other, 'natural');
  const keptElsewhere = belongers.filter(id => (Game.state.village.promises[id] || {}).kept === true);
  const gains = belongers.map(id => (t()[id] || 0) - 10);
  console.log('belong promises kept by someone-else convo:', keptElsewhere.length, '| trust gains:', gains.join(','));
  check("belong promises NOT fulfilled by another villager's conversation", keptElsewhere.length === 0,
    `(${keptElsewhere.length} wrongly kept)`);

  // ---- Attack 2b: one food handoff fulfills ALL feed promises ----
  const feeders = [npcs[2], npcs[3]];
  Game.state.village.bgGoals[npcs[3]] = 'feed';
  console.log('villagers with feed goal:', feeders.length);
  if (feeders.length >= 2) {
    for (const id of feeders) {
      Game.state.village.trust[id] = 10;
      Game.state.village.promises[id] = { goal: 'feed', day: Game.state.scholar.day, kept: false };
    }
    const recipient = feeders[0];
    Game.checkPromises('food', recipient); // handoff was TO recipient only
    const kept = feeders.map(id => !!(Game.state.village.promises[id] || {}).kept);
    console.log('feed kept flags after handoff to one:', kept.join(','));
    check("feed promise NOT fulfilled for non-recipients", kept[0] === true && kept.slice(1).every(k => !k),
      `(${kept.join(',')})`);
  } else {
    console.log('  SKIP feed cross-fulfillment (fewer than 2 feed-goal villagers this seed)');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e); process.exit(2); });
