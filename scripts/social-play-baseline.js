// Social scenario playtest: play mootAccused, mootJuror, ambush, liars, exile
// like a player and check each reaches a completable, non-stuck state.
// Usage: node /tmp/oversight-social-playtest.js
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const notes = [];
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); if (note) notes.push(`${name}: ${note}`); }
}
function info(s) { console.log('  ' + s); }
// capture say-log per scenario
let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }

(async () => {
  await Game.init();

  // ============ 1. mootAccused ============
  console.log('\n=== mootAccused (you stand accused) ===');
  fresh('mootAccused');
  let cases = (Game.betrayalState().cases || []).filter(c => c.playerRole === 'accused' && (c.status === 'open' || c.status === 'dormant'));
  ok('accused-case-opened', cases.length > 0, 'no open accused case after scenario');
  const c = cases[0];
  if (c) {
    info(`charge: ${c.charge}, accuser: ${Game.displayName(c.accuser)}`);
    const acts = Game.caseDossierActions(c) || [];
    ok('dossier-acts-listed', acts.length >= 4, `only ${acts.length} acts`);
    info('acts: ' + acts.map(a => a.id).join(', '));
    // play defense like a player
    Game.defendSpeak(c.id);
    Game.defendPressAccuser(c.id);
    Game.investigateBribery(c.id);
    Game.nameWitnesses && null;
    // demand the moot tonight
    const before = c.status;
    try { Game.demandMoot(c.id); } catch (e) { info('demandMoot threw: ' + e.message); }
    info(`status after demandMoot: ${before} -> ${c.status}`);
    ok('moot-reaches-verdict', c.status !== 'open' && c.status !== 'dormant',
      `case stuck at status '${c.status}' after demanding moot — player left hanging`);
    if (c.verdict || c.trial) info(`verdict: ${JSON.stringify(c.verdict || c.trial && c.trial.votes && c.trial.votes.length + ' votes')}`);
  }

  // ============ 2. mootJuror ============
  console.log('\n=== mootJuror (you are the juror) ===');
  fresh('mootJuror');
  cases = (Game.betrayalState().cases || []).filter(c => c.playerRole === 'juror' && c.status === 'open');
  ok('juror-case-opened', cases.length > 0, 'no open juror case after scenario');
  const jc = cases[0];
  if (jc) {
    ok('juror-known-to-player', !!jc.knownToPlayer, 'case not known to player — prompt would be a lie');
    info(`accused: ${jc.accused.map(a => Game.displayName(a)).join(', ')}, target: ${Game.displayName(jc.target)}`);
    ok('cover-story-seeded', !!jc.coverStory, 'no cover story — pressing accomplices has nothing to find');
    // play detective: examine site, name witnesses, press accomplices
    Game.examineAmbushSite(jc.id);
    Game.nameWitnesses(jc.id);
    let found = 0;
    for (const a of jc.accused) { const r = Game.pressAccomplice(jc.id, a); if (r) found++; }
    info(`inconsistencies found via press: ${found}`);
    ok('press-finds-seams', (jc.inconsistencies || []).some(i => i.found), 'pressed all accused, found zero inconsistencies');
    // flip the weakest
    let flipped = false;
    for (let i = 0; i < 3 && !jc.flipped; i++) { try { if (Game.approachWeakest(jc.id, true)) flipped = true; } catch (e) {} }
    info(`weakest flipped: ${flipped}`);
    // call the moot, vote
    Game.callMoot(jc.id);
    info(`status after callMoot: ${jc.status}, awaitingPlayerVote=${!!(jc.trial && jc.trial.awaitingPlayerVote)}`);
    if (jc.trial && jc.trial.awaitingPlayerVote) {
      // player is a voter: cast the vote like tapping VOTE: NOT GUILTY
      const vr = Game.castPlayerVote(jc.id, false);
      info(`castPlayerVote -> ${vr ? 'counted' : 'NULL (vote lost!)'}`);
      ok('juror-vote-counted', !!vr, 'castPlayerVote returned null — the player\'s vote went nowhere');
    }
    info(`status after vote: ${jc.status}`);
    ok('juror-moot-reaches-verdict', jc.status !== 'open' && jc.status !== 'dormant',
      `juror case stuck at '${jc.status}'`);
    if (jc.trial) {
      const pv = (jc.trial.votes || []).find(v => v.vid === Game.villagerId);
      info(`player vote recorded: ${pv ? pv.vote : 'NO PLAYER VOTE'}`);
    }
  }

  // ============ 3. ambush ============
  console.log('\n=== ambush (the walk turns) ===');
  fresh('ambush');
  const plots = (Game.betrayalState().plots || []).filter(p => p.sprung && Game.isPlayer(p.target));
  ok('ambush-sprung', plots.length > 0, 'no sprung ambush plot targeting player');
  const plot = plots[0];
  if (plot) {
    const convo = Game.convoGet(plot.leader);
    ok('ambush-thread-open', convo && convo.thread === 'ambush', `thread=${convo && convo.thread}`);
    ok('chat-request-set', Game.debugChatRequest === plot.leader, 'debugChatRequest not set — UI would not open the thread');
    // play: TALK twice (stall), then RUN
    let res = Game.ambushExchange(plot, 'talk');
    info(`talk1: ${res.continue ? 'continues' : 'resolved'}`);
    res = Game.ambushExchange(plot, 'talk');
    info(`talk2: ${res.continue ? 'continues' : 'resolved'}`);
    let rounds = 0;
    while (res && res.continue && rounds < 6) { res = Game.ambushExchange(plot, 'run'); rounds++; }
    info(`aftermath after ${rounds} run rounds: plot.state=${plot.state}, resolved=${plot.resolved}, outcome=${plot.outcome}`);
    ok('ambush-resolves', !res || !res.continue, 'ambush thread never resolves — player stuck in loop');
    ok('ambush-plot-marked-resolved', plot.resolved === true, `plot.resolved=${plot.resolved} after aftermath — stale plot state`);
    ok('ambush-plot-state-cleared', plot.state !== 'confront', `plot.state still '${plot.state}' after aftermath — stale`);
    const ac = (Game.betrayalState().cases || []).find(x => x.plotId === plot.id);
    ok('ambush-aftermath-case', !!ac, 'no aftermath case opened — the walk turns into nothing');
    if (ac) info(`aftermath case: ${ac.charge}, status=${ac.status}`);
  }

  // ============ 4. liars ============
  console.log('\n=== liars (liar\'s den) ===');
  fresh('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId).slice(0, 5);
  const lied = roster.filter(rid => { const vp = Game.vpOf(rid); return vp.lies && vp.lies.occupation && vp.lies.occupation.told !== vp.lies.occupation.truth; });
  ok('five-liars-seeded', lied.length === 5, `only ${lied.length}/5 villagers lying`);
  // play: ask each about themselves (occupation claim), then gossip + observe
  let slips = 0, gossipHits = 0;
  for (const rid of lied) {
    // simulate asking about occupation: record a claim so gossip can contradict
    try { Game.startConvo(rid); } catch (e) {}
    // force a few conversation turns to give slips a chance
    for (let t = 0; t < 6; t++) {
      try {
        const before = (Game.getDoubts(rid, true) || []).length;
        // drive the slip path: observePerson is the watch verb
        if (Game.observePerson) Game.observePerson(rid);
        const after = (Game.getDoubts(rid, true) || []).length;
        if (after > before) slips++;
      } catch (e) {}
    }
    try { Game.endConvo && Game.endConvo(rid); } catch (e) {}
  }
  info(`slip-doubts recorded across 5 liars x 6 watches: ${slips}`);
  // gossip: ask a NON-liar about a liar
  const teller = Game.state.village.roster.find(id => id !== Game.villagerId && !lied.includes(id));
  if (teller) {
    for (const rid of lied.slice(0, 3)) {
      try { const g = Game.npcGossipAbout(teller, rid); if (g) gossipHits++; } catch (e) {}
    }
  }
  info(`gossip revealed truth about liars: ${gossipHits}/3`);
  ok('liars-catchable', slips > 0 || gossipHits > 0, 'no slip doubts and no gossip reveals — contradictions uncatchable');

  // ============ 5. exile ============
  console.log('\n=== exile (you walk) ===');
  fresh('exile');
  const s = Game.state.scholar;
  ok('exiled-flag', !!s.exiled, 'scholar.exiled not set');
  ok('justice-exiled', !!(Game.justiceState().exiled), 'justiceState.exiled not set');
  const ovs = Game.state.otherVillages || [];
  info(`other villages (petition targets): ${ovs.length}`);
  ok('petition-targets-exist', ovs.length > 0, 'no other villages — petition path is a dead end');
  if (ovs.length) {
    // play: petition the first village
    const card = Game.villageCard ? Game.villageCard(ovs[0].id) : null;
    const pActs = (card && card.actions || []).map(a => a.id);
    info(`village card actions: ${pActs.join(', ')}`);
    ok('petition-action-offered', pActs.includes('petition'), 'no petition action on village card');
    const pr = Game.petitionVillage(ovs[0].id, { giftKcal: 0 });
    info(`petition result: ${pr && (pr.accepted !== undefined ? 'accepted=' + pr.accepted : JSON.stringify(pr).slice(0, 120))}`);
  }
  // found-haven path
  try {
    const fh = Game.foundHaven();
    info(`foundHaven: ${JSON.stringify(fh).slice(0, 160)}`);
    ok('found-haven-works', !!fh, 'foundHaven returned nothing');
  } catch (e) { ok('found-haven-works', false, 'threw: ' + e.message); }
  // drift path — on a FRESH exile (founding a haven first would rightly end exile)
  fresh('exile');
  try {
    const d = Game.drift();
    info(`drift: ${JSON.stringify(d).slice(0, 160)}`);
    ok('drift-works', d === true && Game.state.scholar.drifting === true, 'drift did not engage on fresh exile');
    // driftTick: a day passes on the road
    try { Game.driftTick(); info('driftTick ran'); } catch (e) { info('driftTick threw: ' + e.message); }
  } catch (e) { ok('drift-works', false, 'threw: ' + e.message); }

  console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
  if (notes.length) { console.log('NOTES:'); notes.forEach(n => console.log(' - ' + n)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 8).join('\n')); process.exit(2); });
