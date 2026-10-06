// DEEP PLAY: social scenarios as a player. Captures full say logs,
// checks dialogue coherence (no repeats, no dev leaks, gating sane),
// checks choices diverge and consequences land in state.
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

let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }
function sayLines() { return sayLog.slice(); }

const DEV_RE = /TODO|FIXME|XXX|debug_|console\.log|\[object Object\]|undefined|null[ ,.]/i;
const NAN_RE = /\bNaN\b/;

function analyzeDialogue(tag) {
  const lines = sayLines();
  const issues = [];
  // repeated beats: identical lines repeated within one run
  const seen = {};
  for (const l of lines) {
    const key = l.slice(0, 120);
    seen[key] = (seen[key] || 0) + 1;
  }
  for (const [k, n] of Object.entries(seen)) {
    if (n > 1 && k.length > 40) issues.push(`REPEAT x${n}: "${k.slice(0, 100)}..."`);
  }
  // dev leaks
  for (const l of lines) {
    if (DEV_RE.test(l) || NAN_RE.test(l)) issues.push(`DEVLEAK: "${l.slice(0, 120)}"`);
  }
  // near-duplicate template beats: same first 60 chars more than twice
  const heads = {};
  for (const l of lines) heads[l.slice(0, 60)] = (heads[l.slice(0, 60)] || 0) + 1;
  for (const [k, n] of Object.entries(heads)) {
    if (n > 2 && k.length > 20) issues.push(`TEMPLATE-REPEAT x${n}: "${k}"`);
  }
  console.log(`\n--- ${tag}: ${lines.length} say lines, ${issues.length} coherence issues ---`);
  for (const i of issues.slice(0, 10)) console.log('  !! ' + i);
  return { lines, issues };
}

function snapshotSocial() {
  const v = Game.state.village;
  return {
    trust: JSON.stringify(v.trust || {}),
    grievances: JSON.stringify((v.betrayal && v.betrayal.grievances) || []),
    crimes: JSON.stringify((Game.justiceState().crimes || []).map(c => c.type + ':' + c.status)),
    scholarRep: Game.state.scholar.reputation,
    exiled: !!Game.state.scholar.exiled,
  };
}
function diffSnap(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const x = String(a[k]), y = String(b[k]);
    if (x !== y) out.push(`${k}: ${x.slice(0, 100)} -> ${y.slice(0, 100)}`);
  }
  return out;
}

(async () => {
  await Game.init();

  // ================= 1. MOOT ACCUSED: full defense play =================
  console.log('\n########## 1. MOOT ACCUSED ##########');
  fresh('mootAccused');
  let before = snapshotSocial();
  let after;
  let cases = (Game.betrayalState().cases || []).filter(c => c.playerRole === 'accused' && (c.status === 'open' || c.status === 'dormant'));
  const c = cases[0];
  console.log('charge:', c.charge, '| accuser shown as:', Game.displayName(c.accuser), '| knownAccusers:', JSON.stringify(c.knownAccusers || []));
  console.log('coverStory?', !!c.coverStory, '| fabricated?', !!c.fabricated, '| inconsistencies:', (c.inconsistencies || []).length);
  // play: ask involved villagers about the case, then use dossier actions
  const involved = Game.npcIds().filter(id => { try { return Game.caseInvolved(c.id ? c : null, id); } catch (e) { return false; } });
  // caseInvolved takes (cs, vid); cs = case
  let heardReveals = 0;
  for (const vid of Game.npcIds().slice(0, 6)) {
    try {
      const r = Game.askAboutCase(c.id, vid);
      if (r && r.reveal) { heardReveals++; console.log(`  heard[${r.reveal}] from ${Game.displayName(vid)}`); }
    } catch (e) {}
  }
  console.log('heard reveals:', heardReveals);
  try { Game.defendSpeak(c.id); } catch (e) { console.log('  defendSpeak threw', e.message); }
  try { Game.defendAlibi && Game.defendAlibi(c.id); } catch (e) {}
  try { Game.defendPressAccuser(c.id); } catch (e) { console.log('  defendPressAccuser threw', e.message); }
  try { Game.investigateBribery(c.id); } catch (e) { console.log('  investigateBribery threw', e.message); }
  console.log('belief now:', JSON.stringify(c.belief && Object.keys(c.belief).length), 'avgBelief:', Game.avgBelief ? Game.avgBelief(c).toFixed(1) : 'n/a');
  const d1 = analyzeDialogue('mootAccused-defense');
  const midStatus = c.status;
  try { Game.demandMoot(c.id); } catch (e) { console.log('  demandMoot threw', e.message); }
  console.log(`status: ${midStatus} -> ${c.status}, resolution: ${c.resolution}`);
  const d2 = analyzeDialogue('mootAccused-trial');
  console.log('say excerpt (trial):');
  d2.lines.slice(-8).forEach(l => console.log('   | ' + l.slice(0, 150)));
  const after1 = snapshotSocial();
  console.log('CONSEQUENCE DIFF:', diffSnap(before, after1).slice(0, 8));

  // ================= 2. MOOT JUROR =================
  console.log('\n########## 2. MOOT JUROR ##########');
  fresh('mootJuror');
  before = snapshotSocial();
  cases = (Game.betrayalState().cases || []).filter(x => x.playerRole === 'juror' && x.status === 'open');
  const jc = cases[0];
  console.log('accused:', jc.accused.map(a => Game.displayName(a)).join(','), '| knownToPlayer:', !!jc.knownToPlayer, '| coverStory:', !!jc.coverStory);
  Game.examineAmbushSite(jc.id);
  Game.nameWitnesses(jc.id);
  for (const a of jc.accused) Game.pressAccomplice(jc.id, a);
  try { Game.approachWeakest(jc.id, true); } catch (e) {}
  const d3 = analyzeDialogue('mootJuror-investigation');
  Game.callMoot(jc.id);
  const guiltyVoteSaved = jc.trial && jc.trial.awaitingPlayerVote;
  let voteTarget = null;
  if (guiltyVoteSaved) {
    // vote NOT GUILTY on principle; check the room remembers
    Game.castPlayerVote(jc.id, false);
    voteTarget = jc.accused[0];
  }
  console.log(`status: ${jc.status}, resolution: ${jc.resolution}, convicted: ${jc.trial && jc.trial.convicted}`);
  const d4 = analyzeDialogue('mootJuror-trial');
  after = snapshotSocial();
  console.log('CONSEQUENCE DIFF:', diffSnap(before, after).slice(0, 10));
  // does anyone remember the player's vote? check grievances/affinity shifts vs accused
  console.log('grievances now:', JSON.stringify((Game.betrayalState().grievances || []).slice(-4)));

  // ================= 3. AMBUSH: play all three stances =================
  for (const stance of ['fight', 'run']) {
    console.log(`\n########## 3. AMBUSH (${stance.toUpperCase()}) ##########`);
    fresh('ambush');
    before = snapshotSocial();
    const plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
    console.log('leader:', Game.displayName(plot.leader), '| motive:', plot.motive, '| crew:', (plot.crew || []).length);
    let res = Game.ambushExchange(plot, 'talk');
    let rounds = 0;
    while (res && res.continue && rounds < 8) { res = Game.ambushExchange(plot, stance); rounds++; }
    console.log(`outcome: ${plot.outcome}, resolved: ${plot.resolved}, state: ${plot.state}, rounds: ${rounds}`);
    const da = analyzeDialogue(`ambush-${stance}`);
    console.log('say excerpt:');
    da.lines.slice(0, 10).forEach(l => console.log('   | ' + l.slice(0, 160)));
    after = snapshotSocial();
    console.log('CONSEQUENCE DIFF:', diffSnap(before, after).slice(0, 8));
    const ac = (Game.betrayalState().cases || []).find(x => x.plotId === plot.id);
    console.log('aftermath case:', ac ? `${ac.charge} status=${ac.status}` : 'NONE');
  }

  // ================= 4. LIARS =================
  console.log('\n########## 4. LIARS ##########');
  fresh('liars');
  before = snapshotSocial();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId).slice(0, 5);
  for (const rid of roster) {
    const vp = Game.vpOf(rid);
    const lie = vp.lies && vp.lies.occupation;
    console.log(`liar ${Game.displayName(rid)}: claims "${lie && lie.told}" / truth "${lie && lie.truth}"`);
  }
  // play: watch each, then confront one with evidence
  for (const rid of roster) for (let t = 0; t < 6; t++) { try { Game.observePerson(rid); } catch (e) {} }
  const dl = analyzeDialogue('liars-observe');
  console.log('slip say excerpt:');
  dl.lines.slice(0, 8).forEach(l => console.log('   | ' + l.slice(0, 160)));
  // confront: is there a confront-liar verb with social consequences?
  const confrontFns = ['confrontLiar', 'confrontAboutLie', 'accuseLiar', 'callOutLie'].filter(f => typeof Game[f] === 'function');
  console.log('confront verbs available:', confrontFns.join(', ') || 'NONE');
  for (const f of confrontFns) {
    try { const r = Game[f](roster[0]); console.log(`  ${f} ->`, JSON.stringify(r).slice(0, 140)); } catch (e) { console.log(`  ${f} threw: ${e.message}`); }
  }
  const dl2 = analyzeDialogue('liars-confront');
  after = snapshotSocial();
  console.log('CONSEQUENCE DIFF:', diffSnap(before, after).slice(0, 8));

  // ================= 5. EXILE =================
  console.log('\n########## 5. EXILE ##########');
  fresh('exile');
  before = snapshotSocial();
  const ovs = Game.state.otherVillages || [];
  console.log('villages:', ovs.map(v => `${v.name || v.id} (heard:${v.heardAboutYou})`).join(' | '));
  const card = Game.villageCard(ovs[0].id);
  console.log('card actions:', (card.actions || []).map(a => `${a.id}:${a.giftKcal}`).join(', '));
  const pr = Game.petitionVillage(ovs[0].id, { giftKcal: 0 });
  console.log('petition(0) ->', JSON.stringify(pr).slice(0, 200));
  const d5 = analyzeDialogue('exile-petition');
  console.log('petition say excerpt:');
  d5.lines.slice(-6).forEach(l => console.log('   | ' + l.slice(0, 160)));
  after = snapshotSocial();
  console.log('CONSEQUENCE DIFF:', diffSnap(before, after).slice(0, 8));

  console.log('\n########## DONE ##########');
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 10).join('\n')); process.exit(2); });
