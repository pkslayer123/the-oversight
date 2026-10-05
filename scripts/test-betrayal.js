// Betrayal, accusation, trial & exile tests. Usage: node scripts/test-betrayal.js
// Covers: payoff distribution, motive gating, tells (perception-gated),
// escape viability (aware vs oblivious), cover story vs accusation, credibility
// weighting, inconsistency detection, turning the weakest, all resolutions,
// trial RNG + bribery, NPC-NPC end-to-end symmetry, exile phase, strangers,
// reachable villages.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function band(name, v, lo, hi) {
  if (v >= lo && v <= hi) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${v.toFixed(3)}, want [${lo}, ${hi}]`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // quiet the chatter, freeze the clock for determinism of side effects
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  Game.tickAction = () => {};

  const v = Game.state.village;
  const npcs = () => v.roster.filter(id => id !== Game.villagerId);
  const [A, B, C, D] = npcs();

  // ---------- 1. payoff distribution ----------
  const counts = { small: 0, reward: 0, wild: 0 };
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const r = Game.resolveInvite(A, 'look');
    counts[r.outcome]++;
  }
  band('payoff small ~60%', counts.small / N, 0.52, 0.68);
  band('payoff reward ~30%', counts.reward / N, 0.22, 0.38);
  band('payoff wild ~10%', counts.wild / N, 0.04, 0.16);
  ok('payoff sums', counts.small + counts.reward + counts.wild === N);

  // ---------- 2. motive gating ----------
  Game.recordGrievance(A, B, 'theft', 60);
  const mAB = Game.motiveBetween(A, B);
  ok('motive with grievance >= 45', mAB.score >= 45);
  ok('motive has reasons', mAB.reasons.length > 0);
  const mBA = Game.motiveBetween(B, A);
  ok('reverse motive low', mBA.score < 45);

  // ---------- 3. tells are perception-gated ----------
  const mkPlot = (perception) => {
    const real = Game.socialPerception;
    Game.socialPerception = () => perception;
    const p = Game.armPlot(A, [B, C], Game.villagerId, { score: 60, reasons: ['grievance'] });
    Game.socialPerception = real;
    // clean up the pending invite so plots don't leak into later tests
    Game.inviteHistory(p.inviter).pending = null;
    return p;
  };
  const pBlind = mkPlot(0);
  const pSharp = mkPlot(100);
  ok('oblivious sees no tells', pBlind.tells.length === 0);
  ok('perceptive sees tells', pSharp.tells.length >= 3);
  // remove the armed plots (they'd interfere)
  v.betrayal.plots.length = 0;

  // ---------- 4. escape viability: aware ~always, oblivious ~sometimes ----------
  function runAmbush(perception) {
    const real = Game.socialPerception;
    Game.socialPerception = () => perception;
    const p = Game.armPlot(A, [B, C], Game.villagerId, { score: 60, reasons: ['grievance'] });
    Game.socialPerception = real;
    Game.inviteHistory(p.inviter).pending = null;
    Game.springAmbush(p);
    let guard = 0;
    while (!p.outcome && guard++ < 10) Game.ambushExchange(p, 'run');
    const outcome = p.outcome;
    // scrub: remove plot + case so tests don't accumulate
    v.betrayal.plots = v.betrayal.plots.filter(x => x !== p);
    v.betrayal.cases = v.betrayal.cases.filter(x => x.plotId !== p.id);
    Game.state.scholar.health = 100;
    return outcome;
  }
  const TN = 300;
  let awareEsc = 0, oblivEsc = 0;
  for (let i = 0; i < TN; i++) if (runAmbush(100) === 'escaped') awareEsc++;
  for (let i = 0; i < TN; i++) if (runAmbush(0) === 'escaped') oblivEsc++;
  band('aware escapes ~always', awareEsc / TN, 0.88, 1.0);
  band('oblivious escapes ~sometimes', oblivEsc / TN, 0.20, 0.85);
  ok('awareness helps', awareEsc > oblivEsc);

  // fight branch can also end it
  {
    const p = Game.armPlot(A, [B, C], Game.villagerId, { score: 60, reasons: ['grievance'] });
    Game.inviteHistory(p.inviter).pending = null;
    Game.springAmbush(p);
    let guard = 0;
    while (!p.outcome && guard++ < 10) Game.ambushExchange(p, 'fight');
    ok('fight can end ambush', p.outcome === 'fought_off' || p.outcome === 'escaped');
    v.betrayal.plots = v.betrayal.plots.filter(x => x !== p);
    v.betrayal.cases = v.betrayal.cases.filter(x => x.plotId !== p.id);
    Game.state.scholar.health = 100;
  }

  // ---------- 5. cover story vs accusation ----------
  const p5 = Game.armPlot(A, [B, C], Game.villagerId, { score: 60, reasons: ['grievance'] });
  Game.inviteHistory(p5.inviter).pending = null;
  Game.springAmbush(p5);
  // force an escape with wounds for evidence (set wounds directly)
  p5.woundsTaken = 8;
  const after = Game.ambushAftermath(p5, 'escaped');
  const c5 = Game.getCase(after.caseId);
  ok('case opened', !!c5);
  ok('cover story seeded', !!c5.coverStory);
  ok('their story landed first (belief > 0)', Game.avgBelief(c5) > 0);
  const beforeEv = Game.avgBelief(c5);
  Game.showWounds(c5.id);
  Game.examineAmbushSite(c5.id);
  Game.nameWitnesses(c5.id);
  Game.pressAccomplice(c5.id, B);
  ok('evidence moves belief', Game.avgBelief(c5) < beforeEv);

  // ---------- 6. credibility is relationship-weighted ----------
  v.groups = v.groups || [];
  v.groups.push({ id: 'test_friends', kind: 'test', members: [A, D] }); // D is A's friend
  const c6 = Game.openCase(p5, 'ambush');
  ok('friend of accused believes accused more', (c6.belief[D] || 0) > (c6.belief[C] || 0) || (c6.belief[D] || 0) > 0);
  v.betrayal.cases = v.betrayal.cases.filter(x => x !== c6);
  v.groups = v.groups.filter(g => g.id !== 'test_friends');

  // ---------- 7. inconsistency detection ----------
  ok('inconsistency found by pressing', c5.inconsistencies.some(i => i.found));

  // ---------- 8. turning the weakest ----------
  ok('weakest identified', !!c5.weakest && [B, C].includes(c5.weakest));
  let flips = 0;
  for (let i = 0; i < 30 && !c5.flipped; i++) if (Game.approachWeakest(c5.id, true)) flips++;
  ok('weakest can flip', !!c5.flipped);
  ok('flipped is the weakest', c5.flipped === c5.weakest);
  ok('flip craters belief', Game.avgBelief(c5) < -25);

  // ---------- 9. all resolutions reachable ----------
  const resPlot = { id: 'resplot', leader: A, accomplices: [B, C], target: D, weakest: B };
  v.betrayal.plots.push(resPlot);
  const mkCase = () => Game.openCase(resPlot, 'ambush');
  const pan0 = v.pantryKcal || 0;
  let rc = mkCase(); Game.resolveCase(rc.id, 'weregild');
  ok('weregild resolved', rc.status === 'resolved' && rc.resolution === 'weregild');
  ok('weregild pays pantry', (v.pantryKcal || 0) > pan0);
  rc = mkCase(); Game.resolveCase(rc.id, 'schism');
  ok('schism resolved', rc.resolution === 'schism');
  ok('schism splits groups', (v.groups || []).some(g => g.kind === 'feud'));
  rc = mkCase(); Game.resolveCase(rc.id, 'cold_war');
  ok('cold war resolved', rc.resolution === 'cold_war');
  const rosterBefore = v.roster.length;
  rc = mkCase(); Game.resolveCase(rc.id, 'exile');
  ok('exile resolved', rc.resolution === 'exile');
  ok('exile removes villagers', v.roster.length < rosterBefore);
  ok('exiled tracked', (v.exiles || []).length > 0);
  // player exile
  const pPlot = { id: 'pplot', leader: A, accomplices: [Game.villagerId], target: D, weakest: A };
  v.betrayal.plots.push(pPlot);
  rc = Game.openCase(pPlot, 'ambush');
  Game.resolveCase(rc.id, 'player_exile');
  ok('player can be exiled', Game.state.scholar.exiled === true);
  Game.state.scholar.exiled = false;
  try { Game.justiceState().exiled = false; } catch (e) {}

  // ---------- 10. trial RNG + bribery ----------
  const tPlot = { id: 'tplot', leader: A, accomplices: [B, C], target: D, weakest: B };
  // A, B, C may have been exiled above — use fresh NPCs
  const fresh = npcs();
  const [L1, L2, L3, T1] = fresh;
  const tPlot2 = { id: 'tplot2', leader: L1, accomplices: [L2, L3], target: T1, weakest: L2 };
  v.betrayal.plots.push(tPlot2);
  const trialOutcomes = [];
  for (let i = 0; i < 100; i++) {
    const cc = Game.openCase(tPlot2, 'ambush');
    for (const id of npcs()) if (!cc.accused.includes(id)) cc.belief[id] = -60; // strong case: belief negative = guilty
    const t = Game.callMoot(cc.id);
    if (t && t.awaitingPlayerVote) Game.castPlayerVote(cc.id, true);
    trialOutcomes.push(!!cc.trial.convicted);
    v.betrayal.cases = v.betrayal.cases.filter(x => x !== cc);
  }
  const convRate = trialOutcomes.filter(Boolean).length / trialOutcomes.length;
  band('strong case usually convicts', convRate, 0.5, 1.0);
  const weakOutcomes = [];
  for (let i = 0; i < 100; i++) {
    const cc = Game.openCase(tPlot2, 'ambush');
    for (const id of npcs()) if (!cc.accused.includes(id)) cc.belief[id] = 60; // weak case: belief positive = believes the accused
    const t = Game.callMoot(cc.id);
    if (t && t.awaitingPlayerVote) Game.castPlayerVote(cc.id, false);
    weakOutcomes.push(!!cc.trial.convicted);
    v.betrayal.cases = v.betrayal.cases.filter(x => x !== cc);
  }
  const weakRate = weakOutcomes.filter(Boolean).length / weakOutcomes.length;
  band('weak case usually acquits', weakRate, 0.0, 0.5);
  ok('trial RNG: a good case CAN lose', convRate < 1.0);
  ok('trial RNG: a weak case CAN win', weakRate > 0.0);
  // polarity pin: real evidence tools must HELP conviction, not hurt it.
  // (A shipped inversion once made strong evidence acquit. Never again.)
  // Runs on a FRESH game: trial blocks above leave the village fractured
  // (schisms, exiles, trauma), which confounds baseline belief.
  {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const vv = Game.state.village;
    const nn = () => vv.roster.filter(id => id !== Game.villagerId);
    const [Q1, Q2, Q3, QT] = nn();
    const qPlot = { id: 'qplot', leader: Q1, accomplices: [Q2, Q3], target: QT, weakest: Q2 };
    Game.betrayalState().plots.push(qPlot);
    const ev = [], noev = [];
    for (let i = 0; i < 60; i++) {
      const ce = Game.openCase(qPlot, 'ambush');
      Game.moveBelief(ce, -15, 'wounds'); Game.moveBelief(ce, -10, 'site');
      Game.moveBelief(ce, -16, 'witnesses'); Game.moveBelief(ce, -12, 'inconsistency');
      const te = Game.callMoot(ce.id);
      if (te && te.awaitingPlayerVote) Game.castPlayerVote(ce.id, true);
      ev.push(!!ce.trial.convicted);
      vv.betrayal.cases = vv.betrayal.cases.filter(x => x !== ce);
      const cn = Game.openCase(qPlot, 'ambush'); // cover story only, no evidence
      const tn = Game.callMoot(cn.id);
      if (tn && tn.awaitingPlayerVote) Game.castPlayerVote(cn.id, false); // honest: belief favors the accused
      noev.push(!!cn.trial.convicted);
      vv.betrayal.cases = vv.betrayal.cases.filter(x => x !== cn);
    }
    const evR = ev.filter(Boolean).length / ev.length, noR = noev.filter(Boolean).length / noev.length;
    ok(`evidence helps conviction (ev ${evR.toFixed(2)} > noev ${noR.toFixed(2)})`, evR > noR + 0.3);
  }
  // wild-day rate tuning pin (scripts/sim-trial-frequency.js): 0.10 default.
  {
    delete Game.WILD_DAY_RATE;
    ok('wildDayRate defaults to 0.10', Game.wildDayRate() === 0.10);
    Game.WILD_DAY_RATE = 0.25;
    ok('WILD_DAY_RATE override respected', Game.wildDayRate() === 0.25);
    delete Game.WILD_DAY_RATE;
    // counterfactual API: forced wild vs calm tally on the same case
    const qn = () => Game.state.village.roster.filter(id => id !== Game.villagerId);
    const [R1, R2, R3, RT] = qn();
    const rPlot = { id: 'rplot', leader: R1, accomplices: [R2, R3], target: RT, weakest: R2 };
    Game.betrayalState().plots.push(rPlot);
    const qc = Game.openCase(rPlot, 'ambush');
    const seedFn = (s) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const tw = Game.tallyVotes(qc, true, seedFn(42));
    const tc = Game.tallyVotes(qc, false, seedFn(42));
    ok('forced wild tally records wildDay', tw.wildDay === true);
    ok('forced calm tally records wildDay', tc.wildDay === false);
    ok('same seed, same attendance', tw.present.length === tc.present.length);
    Game.betrayalState().cases = Game.betrayalState().cases.filter(x => x !== qc);
  }
  // bribery
  const bc = Game.openCase(tPlot2, 'ambush');
  const voter = npcs().find(id => !bc.accused.includes(id));
  ok('bribe lands', Game.bribeVoter(bc.id, voter, L1, 1600) === true);
  ok('bribe recorded', bc.bribes.length === 1);
  let found = [];
  for (let i = 0; i < 10 && !found.length; i++) found = Game.investigateBribery(bc.id);
  bc.foundBribes = found;
  ok('bribery discoverable', found.length > 0);
  const bBel = Game.avgBelief(bc);
  Game.exposeBribery(bc.id, voter);
  ok('exposure swings belief', Game.avgBelief(bc) < bBel);
  v.betrayal.cases = v.betrayal.cases.filter(x => x !== bc);

  // ---------- 11. NPC-NPC end-to-end (no player as party) ----------
  const nn = npcs();
  const [NL, NA1, NA2, NT] = nn;
  const nPlot = Game.armPlot(NL, [NA1, NA2], NT, { score: 70, reasons: ['grievance'] });
  Game.inviteHistory(nPlot.inviter).pending = null;
  const simRes = Game.springAmbush(nPlot); // NPC target → sim path
  ok('NPC-NPC ambush sims', simRes && simRes.sim === true);
  const nc = Game.getCase(simRes.caseId);
  ok('NPC-NPC case opened', !!nc);
  ok('player is bystander', nc.playerRole === 'bystander');
  nc.playerHeardDay = Game.state.scholar.day;
  Game.caseDiscoveryTick();
  ok('player hears via gossip', nc.knownToPlayer === true);
  const mt = Game.callMoot(nc.id);
  if (mt && mt.awaitingPlayerVote) Game.castPlayerVote(nc.id, false);
  ok('NPC-NPC trial completes', nc.trial && typeof nc.trial.convicted === 'boolean');
  ok('NPC-NPC case reaches an end', ['resolved', 'acquitted'].includes(nc.status));

  // ---------- 12. exile phase ----------
  Game.exilePlayer('test');
  ok('exile flags scholar', Game.state.scholar.exiled === true);
  const near = (Game.state.otherVillages || []).filter(x => Math.abs(x.x - 3) + Math.abs(x.y - 3) <= 5);
  ok('a village is reachable', near.length > 0);
  const pet = Game.petitionVillage(near[0].id);
  ok('petition returns bool', typeof pet === 'boolean');
  Game.state.scholar.exiled = true; // petition may have succeeded; force for found test
  Game.foundHaven();
  ok('founding works', Game.state.scholar.foundedHaven === true && Game.state.scholar.exiled === false);

  // ---------- 13. strangers are earned ----------
  Game.state.scholar.day = 8;
  v.pantryKcal = 20000;
  v.visitors = [];
  let vis = null;
  for (let i = 0; i < 60 && !vis; i++) vis = Game.considerStrangers();
  ok('stranger arrives when notable', !!vis);
  if (vis) {
    Game.visitorInteract(vis.id, vis.type === 'trader' ? 'trade' : 'welcome');
    ok('visitor leaves after interaction', (v.visitors || []).length === 0);
  }
  // no strangers when obscure
  Game.state.scholar.day = 2;
  v.pantryKcal = 100;
  v.visitors = [];
  let vis2 = null;
  for (let i = 0; i < 30 && !vis2; i++) vis2 = Game.considerStrangers();
  ok('no strangers before notability', !vis2);

  // ---------- 14. conversation integration ----------
  const inv = npcs().find(id => Game.pendingInvite(id)) || npcs()[0];
  Game.inviteHistory(inv).pending = { defId: 'look', day: Game.state.scholar.day };
  const ch = Game.convoChoices(inv);
  ok('invite choice surfaces', ch.some(c => c.id === 'betrayal:accept'));
  Game.inviteHistory(inv).pending = null;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
