#!/usr/bin/env node
// BREAK-IT: bribe price honesty.
// The bribe choice labels its price ("(800 kcal of food)"), but payBribe
// spends whole pack units — a single 1000-kcal item offered against an
// 800-kcal price spends the whole 1000. The label said 800; the fiction said
// "Done. Quiet. Expensive." with no actual named. The player is silently
// overcharged. Fixed: payBribe returns the actual; the fiction names it.
const H = require('./social-breakit-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}

(async () => {
  const Game = await H.newSocialGame();
  const me = Game.villagerId;
  const npcs = Game.npcIds();

  // one chunky finished-food item in the pack
  Game.state.scholar.inventory = [{ name: 'smoked haunch', kcalEach: 1000, units: 1, finished: true }];
  // isFinishedFood gate: make sure our item counts
  const packBefore = Game.playerPackKcal();
  console.log('pack kcal before:', packBefore);

  // fake open case, player as juror
  const bs = Game.betrayalState();
  bs.cases = bs.cases || [];
  const accused = npcs[0];
  const c = {
    id: 'case_bribe', status: 'open', charge: 'theft',
    accused: [accused], accuser: npcs[1], target: npcs[1],
    belief: {}, evidence: [], bribes: [], exposedBribes: [],
    playerRole: 'juror', knownToPlayer: true,
  };
  bs.cases.push(c);
  // find a bribable steady voter (price 800)
  const voter = npcs.find(id => id !== accused && Game.caseBribable(c, id) && Game.caseBribePrice(c, id) === 800);
  console.log('voter:', voter ? voter.slice(0, 12) : 'NONE', 'price:', voter ? Game.caseBribePrice(c, voter) : 'n/a');
  if (!voter) { console.log('  SKIP (no steady voter this seed)'); process.exit(0); }
  const price = Game.caseBribePrice(c, voter);

  const pantryBefore = (Game.state.village.pantry || []).reduce((s, it) => s + (it.kcalEach || 0) * (it.units || 0), 0);
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };
  // go through the real choice dispatcher, like the UI does
  const res = Game.betrayalTurn(voter, 'betrayal:bribe:' + c.id + ':' + voter);
  Game.say = origSay;
  const resText = JSON.stringify(res) + ' ' + said.join(' ');
  const packAfter = Game.playerPackKcal();
  const pantryAfter = (Game.state.village.pantry || []).reduce((s, it) => s + (it.kcalEach || 0) * (it.units || 0), 0);
  const actual = (packBefore - packAfter) + (pantryBefore - pantryAfter);
  const spent = Game.payBribe.length ? null : null; // payBribe return checked via resText
  console.log('bribe result:', resText.slice(0, 120), '| label price:', price, '| actual charged:', actual);
  check('bribe charges exactly the labeled price (or names the actual)',
    actual === price || resText.includes(String(actual)),
    `(labeled ${price}, charged ${actual})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e); process.exit(2); });
