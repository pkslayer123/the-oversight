// Social depth tests: pantry theft, conversation gating, detective work, NPC chatter.
// Usage: node scripts/test-social-depth.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster has NPCs', roster.length >= 3);
  const A = roster[0];
  if (Game.vpOf(A).personality) Game.vpOf(A).personality.temperament = 'warm';

  // === 1. PANTRY: take what you want, no mechanical limits ===
  v.pantry = [{ name: 'Test food', kcalEach: 500, units: 20 }];
  Game.takeFromPantryBulk({ 0: 10 }); // 5000 kcal — way over "fair share"
  ok('pantry take of 5000 kcal succeeds (no mechanical limit)', v.pantry[0].units === 10);
  ok('theftConfrontation exists', typeof Game.theftConfrontation === 'function');
  ok('fairShareNote exists and reports', (() => {
    const n = Game.fairShareNote();
    return n && n.perPerson === 2000 && typeof n.daysLeft === 'string';
  })());

  // === 2. CONVERSATION GATING: first convo offers limited topics ===
  const choices1 = Game.convoChoices(A);
  const topics1 = choices1.filter(c => c.id.indexOf('ask:') === 0).map(c => c.id);
  ok('first convo always offers village', topics1.includes('ask:village'));
  ok('first convo always offers plans', topics1.includes('ask:plans'));
  ok('first convo gates past (trust low)', !topics1.includes('ask:past'));
  ok('first convo gates goal (trust low)', !topics1.includes('ask:goal'));
  ok('first convo gates theorize (trust low)', !choices1.some(c => c.id === 'theorize'));
  // "watch them" not in first convo (no doubts yet, trust low)
  ok('first convo gates observe', !choices1.some(c => c.id === 'observe'));
  // high trust unlocks everything
  v.trust = v.trust || {};
  v.trust[A] = 50;
  const choices2 = Game.convoChoices(A);
  const topics2 = choices2.filter(c => c.id.indexOf('ask:') === 0).map(c => c.id);
  ok('high trust unlocks past', topics2.includes('ask:past'));
  ok('high trust unlocks goal', topics2.includes('ask:goal'));
  ok('high trust unlocks theorize', choices2.some(c => c.id === 'theorize'));
  v.trust[A] = 10; // reset

  // === 3. POOL SIZES: expanded ===
  const cg = Game.data.characterGen;
  ok('openers expanded (40+)', cg.convo.openers.length >= 40);
  ok('pastFollow expanded (36+)', cg.convo.pastFollow.length >= 36);
  ok('plansFollow expanded (36+)', cg.convo.plansFollow.length >= 36);
  ok('talkTemplates expanded (30+)', cg.talkTemplates.length >= 30);
  ok('questions expanded (28)', cg.convo.questions.length >= 28);
  ok('goal lines 8 per goal', cg.goals.every(g => g.lines.length >= 8));
  ok('goalFollow 10 per goal', Object.values(cg.convo.goalFollow).every(a => a.length >= 10));
  ok('theories 8 per intel/topic', Object.values(cg.theories).every(t => Object.values(t).every(a => a.length >= 8)));
  ok('exits 5 per temperament', Object.values(cg.convo.exits).every(a => a.length >= 5));
  ok('reopeners 10', cg.convo.reopeners.length >= 10);

  // === 4. DETECTIVE: liars slip in dialogue ===
  const vpA = Game.vpOf(A);
  vpA.lies = {
    occupation: { told: 'paramedic', truth: 'accountant', motive: 'hiding', field: 'occupation' },
  };
  // run convoAskTopic many times, count slips (14% base for 'hiding' motive)
  let slips = 0;
  const origRandom = Math.random;
  for (let i = 0; i < 50; i++) {
    Math.random = () => 0.05; // force slip path
    const line = Game.convoAskTopic(A, 'past');
    if (line && line.indexOf('catches themself') !== -1 || (line && line.indexOf("doesn't fit") !== -1)) slips++;
  }
  Math.random = origRandom;
  ok('bad liars slip in dialogue (forced)', slips > 0);
  // check doubts were recorded
  const doubts = Game.getDoubts(A);
  ok('slips create doubts', doubts && doubts.length > 0);

  // === 5. DETECTIVE: observePerson is callable from conversation ===
  ok('observePerson exists', typeof Game.observePerson === 'function');
  ok('npcGossipAbout exists', typeof Game.npcGossipAbout === 'function');
  // add a doubt, then check "watch them" appears
  Game.addDoubt(A, 'test', 'test doubt', ['test']);
  const choices3 = Game.convoChoices(A);
  ok('"watch them" appears with doubts', choices3.some(c => c.id === 'observe'));

  // === 6. NPC CHATTER: overheardDiscussion wired ===
  ok('overheardDiscussion exists', typeof Game.overheardDiscussion === 'function');

  // === 7. 5-day detective simulation: target 2-3 doubts ===
  // Simulate an active detective: talk to liars daily, observe, gossip
  let totalDoubts = 0;
  for (const npc of roster.slice(0, 4)) {
    const vp = Game.vpOf(npc);
    if (vp.personality) vp.personality.temperament = 'warm';
    vp.lies = {
      occupation: { told: 'doctor', truth: vp.formerOccupation || 'teacher', motive: 'hiding', field: 'occupation' },
    };
  }
  for (let day = 0; day < 5; day++) {
    for (const npc of roster.slice(0, 4)) {
      // ask about past (may trigger dialogue slip)
      try { Game.convoAskTopic(npc, 'past'); } catch (e) {}
      // observe (2 ticks, 25-50% base)
      try { Game.observePerson(npc); } catch (e) {}
      // gossip cross-reference
      try { Game.npcGossipAbout(roster[0], npc); } catch (e) {}
    }
    try { Game.endDay && Game.endDay(); } catch (e) {}
  }
  for (const npc of roster.slice(0, 4)) {
    totalDoubts += (Game.getDoubts(npc) || []).length;
  }
  console.log(`  (5-day sim produced ${totalDoubts} doubts across 4 NPCs)`);
  ok('5-day active detective gets 2+ doubts', totalDoubts >= 2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
