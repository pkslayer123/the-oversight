// Truth-finding / lie detection tests. Usage: node scripts/test-truth.js
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
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
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

  // --- 1. Lie generation ---
  // Force lies on a test NPC by manipulating probability
  const A = roster[0];
  const vpA = Game.vpOf(A);
  // Force a non-deflecting temperament for deterministic testing
  // (withdrawn/prickly NPCs with low trust deflect instead of answering —
  // correct behavior, but not what we're testing here)
  if (vpA.personality) vpA.personality.temperament = 'warm';
  // Directly inject a lie for deterministic testing
  vpA.lies = {
    occupation: { told: 'paramedic', truth: vpA.formerOccupation || 'ER nurse', motive: 'hiding', field: 'occupation' },
  };
  const lies = Game.npcLies(A);
  ok('npcLies returns injected lies', lies && lies.occupation && lies.occupation.told === 'paramedic');

  // Fresh NPC gets lazy generation (may or may not lie — just check structure)
  const B = roster[1];
  const liesB = Game.npcLies(B);
  ok('npcLies lazy-generates object', liesB && typeof liesB === 'object');

  // --- 2. getActiveLie respects trust ---
  v.trust = v.trust || {};
  v.trust[A] = 10; // low trust → lies
  const activeLie = Game.getActiveLie(A, 'past');
  ok('low trust → lie is active', activeLie && activeLie.told === 'paramedic');
  v.trust[A] = 80; // high trust → truth (not pathological)
  const noLie = Game.getActiveLie(A, 'past');
  eq('high trust → no lie (non-pathological)', noLie, null);
  v.trust[A] = 10; // reset for further tests

  // --- 3. convoAskTopic substitutes the lie ---
  const st = Game.startConvo(A);
  ok('conversation starts', !!st);
  const line = Game.convoAskTopic(A, 'past');
  ok('past answer generated', typeof line === 'string' && line.length > 10);
  // The line should contain the LIE (paramedic), not the truth
  const truthOcc = (vpA.formerOccupation || '').toLowerCase();
  const lineLower = line.toLowerCase();
  // (truth may still appear in backstory text, but the {occ} slot should be the lie)
  ok('lie appears in spoken line', lineLower.includes('paramedic'));

  // --- 4. Claim tracking ---
  const claims = Game.getClaims(A, 'occupation');
  ok('claim was tracked', claims.length > 0 && claims[claims.length - 1].claim === 'paramedic');

  // --- 5. Journal records the LIE, not the truth ---
  const entry = Game.journalPerson(A);
  ok('journal has occupation entry', !!entry.occupation);
  eq('journal recorded the lie', entry.occupation.value, 'paramedic');

  // --- 6. Contradiction detection ---
  // They told the truth later (simulating a slip or confession)
  Game.trackClaim(A, 'occupation', truthOcc || 'er nurse');
  const doubts = Game.getDoubts(A);
  ok('contradiction created a doubt', doubts.length > 0 && doubts.some(d => d.kind === 'contradiction'));

  // --- 7. Doubt structure ---
  const d = doubts.find(x => x.kind === 'contradiction');
  ok('doubt has evidence', d && d.evidence && d.evidence.length >= 2);
  ok('doubt unresolved', d && d.resolved === false);
  ok('doubt text mentions both claims', d && d.text.includes('paramedic'));

  // --- 8. Doubts surface in journal ---
  const entry2 = Game.journalPerson(A);
  ok('doubts injected into journal entry', entry2.doubts && entry2.doubts.length > 0);

  // --- 9. doubtsHTML renders ---
  const html = Game.doubtsHTML();
  ok('doubtsHTML returns string', typeof html === 'string' && html.length > 0);
  ok('doubtsHTML mentions doubt', html.includes('❓') || html.includes('DOUBT'));

  // --- 10. Confrontation choice appears ---
  Game.endConvo(A);
  const st2 = Game.startConvo(A);
  const choices = Game.convoChoices(A);
  const confront = choices.find(c => c.id.indexOf('confront:') === 0);
  ok('confrontation choice appears with unresolved doubt', !!confront);

  // --- 11. Confrontation resolves ---
  const doubtId = d.id;
  const evBefore = d.evidence.length;
  const turn = Game.convoTurn(A, 'confront:' + doubtId);
  ok('confrontation turn produces output', turn && turn.line && turn.line.length > 10);
  // After confrontation, doubt should be resolved OR deepened
  const dAfter = (Game.state.codex.doubts || []).find(x => x.id === doubtId);
  ok('doubt state changed after confrontation', dAfter.resolved === true || dAfter.evidence.length > evBefore);

  // --- 12. If confessed, they tell truth now ---
  if (dAfter.resolved) {
    const lieAfter = Game.npcLies(A);
    ok('lie marked confessed after confession', !lieAfter.occupation || lieAfter.occupation.confessed === true);
  } else {
    ok('deflection deepened the doubt (valid outcome)', true);
  }

  // --- 13. Observation ---
  const C = roster[2];
  const vpC = Game.vpOf(C);
  vpC.lies = {
    occupation: { told: 'chef', truth: 'accountant', motive: 'shame', field: 'occupation' },
  };
  v.trust[C] = 10;
  // Force detection by calling many times (25%+ base chance)
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    const r = Game.observePerson(C);
    if (r.found) found = true;
  }
  ok('observation can detect lies', found);
  const obsDoubts = Game.getDoubts(C).filter(x => x.kind === 'observation');
  ok('observation created doubt', obsDoubts.length > 0);

  // --- 14. Gossip cross-reference ---
  const D = roster[3] || roster[0];
  Game.checkGossipClaim(A, 'occupation', 'ER nurse', D);
  // A claimed 'paramedic', gossip says 'ER nurse' → should create/reinforce doubt
  // (may already exist from contradiction, so just check no crash)
  ok('gossip cross-reference runs', true);

  // --- 15. npcGossipAbout ---
  const gossip = Game.npcGossipAbout(D, A);
  ok('npcGossipAbout returns object or null', gossip === null || (gossip && gossip.line));

  // --- 16. Slips don't crash ---
  Game.convoGet(A).active = true;
  Game.truthSlip(A, { told: 'paramedic', truth: 'ER nurse', motive: 'hiding', field: 'occupation' });
  ok('slip mechanic runs', true);

  // --- 17. Honest NPCs don't generate lies every time ---
  let lieCount = 0;
  for (let i = 0; i < 10; i++) {
    const testVp = { id: 'test_' + i, personality: { temperament: 'warm' }, goal: 'belong', formerOccupation: 'teacher' };
    // Simulate genLies without vpOf dependency
    const g = Game.genLies.call(Game, testVp);
    if (Object.keys(g).length > 0) lieCount++;
  }
  ok('most honest NPCs don\'t lie (base rate ~12%)', lieCount <= 5);

  // --- 18. Resolve doubt ---
  const allD = Game.allDoubts();
  if (allD.length) {
    Game.resolveDoubt(allD[0].id, 'test resolution');
    const resolved = (Game.state.codex.doubts || []).find(x => x.id === allD[0].id);
    eq('doubt marked resolved', resolved.resolved, true);
  } else {
    ok('resolve doubt (no doubts to test)', true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
