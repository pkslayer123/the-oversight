// TEST: social small-pool expansion (Steve 2026-10-06).
// Asserts every new variant fires under its trigger conditions, doesn't
// duplicate existing variants, and respects knowledge gates.
// Usage: node scripts/test-social-pool-expansion.js  (exit 0 = all green)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); process.exit(2); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };
const said = [];
Game.say = function (t) { said.push(String(t)); return t; };

(async () => {
  await Game.init();
  const rosterOf = () => (Game.state.village.roster || []).filter(id => id !== Game.villagerId);

  // ---- 1. Ambush openers: identity-conditioned variants fire ----
  Game.debugScenario('ambush');
  let roster = rosterOf();
  const leader = roster[0], acc = [roster[1], roster[2]];
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[leader] = 60; // close friend: unlocks the hurt lines
  const openers = new Set();
  for (let i = 0; i < 40; i++) {
    said.length = 0;
    Game.springAmbush({ id: 't' + i, leader, inviter: leader, accomplices: acc, target: Game.villagerId, tells: [], round: 0 });
    const op = said.find(l => l.startsWith('"'));
    if (op) openers.add(op);
  }
  ok(openers.size >= 6, `ambush openers: pool expanded (>=6 distinct, got ${openers.size})`);
  ok([...openers].some(l => l.includes("version of this where it isn't me")), 'ambush opener: close-friend hurt line fires');
  ok([...openers].some(l => l.includes("one of the good ones")), 'ambush opener: close-friend "good ones" line fires');
  ok([...openers].some(l => l.includes("can't carry you anymore")), 'ambush opener: new base line fires');
  ok([...openers].some(l => l.includes("You've had this coming")), 'ambush opener: original lines still present');
  // bold leader variant: eye-contact delivery
  const vp = Game.vpOf(leader) || {}; vp.personality = vp.personality || {};
  const realTemp = vp.personality.temperament; vp.personality.temperament = 'bold';
  let eyeContact = false;
  for (let i = 0; i < 12; i++) {
    said.length = 0;
    Game.springAmbush({ id: 'b' + i, leader, inviter: leader, accomplices: acc, target: Game.villagerId, tells: [], round: 0 });
    const op = said.find(l => l.startsWith('"'));
    if (op && op.includes('meets your eyes')) { eyeContact = true; break; }
  }
  vp.personality.temperament = realTemp;
  ok(eyeContact, 'ambush opener: bold leader holds eye contact');

  // ---- 2. Ambush tells: 8 tiers, perception-gated, no dupes ----
  const plot = { leader, inviter: leader, accomplices: acc, target: Game.villagerId };
  const realSP = Game.socialPerception;
  Game.socialPerception = () => 100;
  const all = Game.ambushTells(plot);
  Game.socialPerception = () => 10;
  const none = Game.ambushTells(plot);
  Game.socialPerception = () => 75;
  const mid = Game.ambushTells(plot);
  Game.socialPerception = realSP;
  ok(all.length === 8, `ambush tells: 8 at perception 100 (got ${all.length})`);
  ok(none.length === 0, 'ambush tells: 0 at perception 10 (gated)');
  ok(mid.length === 5, `ambush tells: 5 at perception 75 (got ${mid.length})`);
  ok(new Set(all).size === all.length, 'ambush tells: no duplicates');
  ok(all.some(t => t.includes('check-ins')), 'ambush tells: new 72-tier tell fires');
  ok(all.some(t => t.includes("didn't eat at the fire")), 'ambush tells: new 88-tier tell fires');
  ok(all.some(t => t.includes('went quiet, and so did everyone else')), 'ambush tells: new 95-tier tell fires (knowledge-safe, no name)');
  ok(!all.some(t => /30s's|40s's|hands's/.test(t)), 'ambush tells: no broken possessive on gated descriptions');

  // ---- 3. justiceConfront: identity-generated, knowledge-safe ----
  const seen = new Set();
  const runJustice = (label, crimes, trust, temp) => {
    Game.debugScenario('uprising');
    const v = Game.state.village;
    const c = v.roster[0];
    v.trust = v.trust || {}; v.trust[c] = trust;
    const cvp = Game.vpOf(c) || {}; cvp.personality = cvp.personality || {}; cvp.personality.temperament = temp;
    Game.justicePickConfronter = () => c;
    const j = Game.justiceState();
    j.crimes = crimes.map(t => ({ type: t, day: 1 }));
    j.stage = 1; j.confrontedBy = null; j.pendingConfront = false;
    for (let i = 0; i < 16; i++) { said.length = 0; Game.justiceConfront(); const l = said.find(x => x.startsWith('⚖')); if (l) seen.add(l); }
  };
  runJustice('murder close', ['murder'], 60, 'bold');
  runJustice('attack close cautious', ['attack'], 55, 'cautious');
  runJustice('theft close', ['theft'], 65, 'steady');
  runJustice('heat-only close withdrawn', [], 50, 'withdrawn');
  const lines = [...seen];
  ok(lines.length >= 8, `justice confrontations: >=8 distinct variants across crime/trust/temp (got ${lines.length})`);
  ok(lines.some(l => l.includes("Tell me it wasn't you")), 'justice: close-murder hurt line fires');
  ok(lines.some(l => l.includes("fire's low")), 'justice: cautious-attack quiet line fires');
  ok(lines.some(l => l.includes("make me a liar too")), 'justice: close-theft covered-for-you line fires');
  ok(lines.some(l => l.includes("as a friend, not the village")), 'justice: withdrawn heat-only line fires');
  ok(lines.some(l => l.includes("We know what you did")), 'justice: original murder line preserved');
  ok(lines.some(l => l.includes("Make it right, or leave")), 'justice: original theft line preserved');
  // knowledge gate: confrontation names only recorded crimes — never invents specifics
  Game.debugScenario('uprising');
  const v2 = Game.state.village, c2 = v2.roster[0];
  Game.justicePickConfronter = () => c2;
  const j2 = Game.justiceState(); j2.crimes = []; j2.stage = 1; j2.confrontedBy = null; j2.pendingConfront = false;
  said.length = 0; Game.justiceConfront();
  const heatLine = said.find(x => x.startsWith('⚖')) || '';
  ok(!/murder|killed|stole|theft|attack/i.test(heatLine), 'justice: heat-only confrontation invents no crime specifics');

  // ---- 4. truth.js pools: expanded, no dupes, knowledge-gated ----
  const pools = Game.truthLinePools;
  ok(pools.observeTellOrigin.length === 6, `observeTellOrigin: 6 (got ${pools.observeTellOrigin.length})`);
  ok(pools.motiveManipulation.length === 5, `motiveManipulation: 5 (got ${pools.motiveManipulation.length})`);
  ok(pools.motivePathological.length === 5, `motivePathological: 5 (got ${pools.motivePathological.length})`);
  for (const [name, pool] of Object.entries({ observeTellOrigin: pools.observeTellOrigin, motiveManipulation: pools.motiveManipulation, motivePathological: pools.motivePathological })) {
    ok(new Set(pool).size === pool.length, `${name}: no duplicates`);
  }
  // knowledge gate: origin-crack lines must never name the TRUE origin
  ok(!pools.observeTellOrigin.some(t => t.includes('{truth')), 'observeTellOrigin: never leaks the true origin (crack only)');
  ok(pools.observeTellOrigin.some(t => t.includes('the way a wound is where you')) , 'observeTellOrigin: new wound line present');
  ok(pools.motiveManipulation.some(t => t.includes("wasn't thinking about you at all")), 'motiveManipulation: new means-line present');
  ok(pools.motivePathological.some(t => t.includes('watching someone else talk')), 'motivePathological: new compulsion line present');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
