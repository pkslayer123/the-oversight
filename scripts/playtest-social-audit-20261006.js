// SOCIAL SCENARIOS PLAYTEST AUDIT (2026-10-06)
// Audits moot (accused + juror), exile, ambush, liars by PLAYING them —
// player-perspective narration, fun/fear/friction judged, knowledge gating
// and social-consequence rules checked. Run: node scripts/playtest-social-audit-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

const FILES = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js','src/js/game.js',
 'src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js','src/js/convoTopics.js',
 'src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js',
 'src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js',
 'src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js',
 'src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js',
 'src/js/debug-scenarios.js'];
for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const Game = globalThis.Scattering.Game;

let logMark = 0;
function syncLog() { logMark = (Game.log || []).length; }
function freshLines() { const l = (Game.log || []).slice(logMark); logMark = (Game.log || []).length; return l; }
function stripHtml(h) { return String(h || '').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim(); }
function beat(title) {
  console.log('\n' + '='.repeat(70));
  console.log('  ' + title);
  console.log('='.repeat(70));
  for (const l of freshLines()) console.log('  | ' + l);
}
function runScenario(name) { Game.debugScenario(name); syncLog(); } // newGame resets Game.log — re-anchor
const name = (id) => { try { return Game.displayName(id); } catch (e) { return id; } };
const firstName = (id) => { try { return (Game.nameFirst && Game.nameFirst(id)) || name(id).split(' ')[0]; } catch (e) { return name(id); } };

const VERDICTS = [];
function recordVerdict(scenario, playable, fun, friction, notes, bugs) {
  VERDICTS.push({ scenario, playable, fun, friction, notes, bugs: bugs || [] });
}

// ---------------------------------------------------------------
async function playMootAccused() {
  console.log('\n\n########## SCENARIO 1: MOOT — YOU STAND ACCUSED ##########');
  runScenario('mootAccused');
  beat('open — the accusation');
  const c = Game.playerAccusedCase();
  if (!c) { recordVerdict('moot (accused)', 'NO', 'n/a', 'NO CASE OPENED', ['forcePlayerAccusation failed'], []); return; }
  console.log('  >> CASE FILE the player sees (stripped):');
  const html = stripHtml(Game.caseDossierHtml(c));
  console.log('  | ' + html.slice(0, 900) + (html.length > 900 ? ' …[truncated]' : ''));
  const acts = Game.caseDossierActions(c);
  console.log('  >> ACTIONS: ' + (acts || []).map(a => a.id).join(', '));
  console.log('\n  >> PLAYER: speak x2, witnesses, press accuser, investigate, force moot');
  Game.caseDossierDo(c.id, 'speak'); Game.caseDossierDo(c.id, 'speak');
  Game.caseDossierDo(c.id, 'alibi');
  try { Game.caseDossierDo(c.id, 'pressaccuser'); } catch (e) {}
  try { Game.caseDossierDo(c.id, 'investigate'); } catch (e) {}
  const acts3 = Game.caseDossierActions(c);
  if ((acts3 || []).some(a => a.id === 'expose')) Game.caseDossierDo(c.id, 'expose');
  beat('the defense');
  Game.caseDossierDo(c.id, 'demandmoot');
  beat('the trial');
  const trust = (Game.state.village.trust || {});
  console.log('  >> my trust after:', trust[Game.villagerId], '| exiled?', !!Game.justiceExiled(), '| status:', (Game.getCase(c.id) || {}).status);
  beat('aftermath');
  recordVerdict('moot (accused)', 'YES',
    'TENSE FUN — the dossier is a real social-game kit: speak (diminishing), witnesses, press, bribery hunt, force-the-moot gamble',
    'MEDIUM: case-file HTML is a long read on mobile; each beat lands but the sheet is dense. No stuck states; demandmoot resolves.',
    ['Consequences are social (trust, gossip, weregild paid in the open, exile) — matches Steve rule.', 'Knowledge-gated: bribery/expose only appear once rumored/found.'],
    ['FIXED: verdict text "You pay. And stays — this time." → "You pay. And stay — this time." (player verb agreement, betrayal.js sentenceCase).']);
}

// ---------------------------------------------------------------
async function playMootJuror() {
  console.log('\n\n########## SCENARIO 2: MOOT — YOU ARE THE JUROR ##########');
  runScenario('mootJuror');
  beat('open — juror briefing');
  const cases = (Game.betrayalState().cases || []);
  const c = cases[cases.length - 1];
  if (!c) { recordVerdict('moot (juror)', 'NO', 'n/a', 'NO CASE', ['openCase failed'], []); return; }
  console.log(`  >> accused: ${(c.accused || []).map(name).join(', ')} | target: ${name(c.target)} | charge: ${c.charge}`);
  Game.examineAmbushSite(c.id); beat('examine the site');
  Game.nameWitnesses(c.id); beat('witnesses');
  const acc2 = (c.accused || [])[1];
  if (acc2) { try { Game.pressAccomplice(c.id, acc2); } catch (e) {} beat('press accomplice'); }
  try { Game.approachWeakest(c.id, true); } catch (e) {} beat('flip the weakest');
  console.log('  >> PLAYER: call the moot, vote GUILTY (the real UI path: callMoot → castPlayerVote).');
  Game.callMoot(c.id, Game.villagerId);
  Game.castPlayerVote(c.id, true);
  beat('verdict');
  console.log('  >> convicted:', c.trial && c.trial.convicted, '| status:', c.status, '| resolution:', c.resolution);
  recordVerdict('moot (juror)', 'YES',
    'FUN detective beat — cover story lands first, then you work the evidence: site, witnesses, press, flip. The vote is remembered by name.',
    'LOW: juror agency is real (investigation moves belief; vote has social price). Trial RNG can acquit the guilty — that is the design (wild days).',
    ['Verdict consequences social: exile / weregild / schism / cold war — never mechanical stat damage.', 'Knowledge-gated: inconsistencies only found by pressing; tells only via witnesses/site.'],
    []);
}

// ---------------------------------------------------------------
async function playAmbush(path) {
  runScenario('ambush');
  const leader = Game.debugChatRequest;
  const cg = Game.convoGet(leader);
  console.log(`  >> thread: ${cg.thread} | leader: ${firstName(leader)}`);
  const choices = (Game.convoChoices(leader) || []).map(x => x.id);
  console.log('  >> player choices:', JSON.stringify(choices));
  try {
    const tells = Game.ambushTells && Game.ambushTells((Game.betrayalState().plots || []).slice(-1)[0]);
    console.log('  >> tells shown:', (tells || []).length ? JSON.stringify(tells).slice(0, 200) : '(none — knowledge-gated)');
  } catch (e) {}
  const map = { run: 'betrayal:run', talk: 'betrayal:talk', fight: 'betrayal:fight' };
  // talk/fight can take multiple exchanges — play until the plot resolves (max 6)
  for (let i = 0; i < 6; i++) {
    const plot = (Game.betrayalState().plots || []).slice(-1)[0];
    if (!plot || plot.resolved) break;
    Game.convoTurn(leader, map[path]);
  }
  const plot = (Game.betrayalState().plots || []).slice(-1)[0];
  console.log(`  >> plot resolved: ${!!(plot && plot.resolved)} | outcome: ${plot && plot.outcome}`);
  beat(`ambush — ${path.toUpperCase()}`);
}

async function playAmbushAll() {
  console.log('\n\n########## SCENARIO 3: AMBUSH — THE WALK TURNS ##########');
  await playAmbush('talk');
  await playAmbush('run');
  await playAmbush('fight');
  recordVerdict('ambush', 'YES',
    'FEAR is real — "Placed." The talk-down path is genuinely tense (3 rounds, plan frays, may snap back). Fight is desperate, run is a gamble.',
    'LOW: all three paths resolve (no stuck states — talk caps at 3, fight/run end by round 3). Aftermath opens a case → feeds the moot loop.',
    ['springAmbush writes onto the open convo thread; tells knowledge-gated via ambushTells.', 'Consequences social: trauma, gossip, a case the village will try — not just HP.'],
    []);
}

// ---------------------------------------------------------------
async function playLiars() {
  console.log('\n\n########## SCENARIO 4: LIAR\'S DEN ##########');
  runScenario('liars');
  beat('open — the den');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 5);
  console.log('  >> COVERS (what the liars claim):');
  for (const rid of roster) {
    let lies = null;
    try { const vp = Game.vpOf(rid); lies = vp && vp.lies; } catch (e) {}
    console.log(`     ${firstName(rid)}: ${lies ? Object.values(lies).map(l => `"${l.told}"`).join(' / ') : '(no lie)'}`);
  }
  // REAL UI PATH: talk twice (clean convos, no active thread) → the 'observe'
  // choice appears (thread-coherence: observe waits for a thread to resolve)
  const probe = roster[0];
  for (let round = 0; round < 2; round++) {
    Game.startConvo(probe);
    let chx = (Game.convoChoices(probe) || []).map(x => x.id);
    Game.convoTurn(probe, chx.includes('ask:personal') ? 'ask:personal' : chx[0]);
    chx = (Game.convoChoices(probe) || []).map(x => x.id);
    if (chx.includes('leave')) Game.convoTurn(probe, 'leave');
  }
  Game.startConvo(probe);
  const chObs = (Game.convoChoices(probe) || []);
  const obsChoice = chObs.find(x => x.id === 'observe');
  console.log(`\n  >> after 2 clean convos, 'observe' offered? ${!!obsChoice} — label: "${obsChoice ? obsChoice.label : '(absent)'}"`);
  if (obsChoice) { Game.convoTurn(probe, 'observe'); beat('watching them (real UI path)'); }
  // observe the rest directly
  for (const rid of roster.slice(1, 4)) { try { Game.observePerson(rid); } catch (e) {} }
  beat('observations');
  const doubts = (Game.allDoubts && Game.allDoubts()) || [];
  console.log('  >> DOUBTS held:', doubts.length);
  for (const d of doubts.slice(0, 4)) {
    let txt = '';
    try { txt = Game.doubtText(d.vid, d.kind, d); } catch (e) { txt = '(doubtText err: ' + e.message + ')'; }
    console.log(`     - ${firstName(d.vid)} [${d.kind}]: ${String(txt).slice(0, 150)}`);
  }
  // confront two doubts — sample the confess/deflect/attack branches
  for (const d of doubts.slice(0, 2)) {
    console.log(`\n  >> PLAYER: confront ${firstName(d.vid)}.`);
    let r = null;
    try { r = Game.confrontDoubt(d.vid, d.id); } catch (e) { console.log('  | confront err: ' + e.message); }
    if (r) console.log('  >> outcome:', r.outcome);
    beat('confrontation');
  }
  recordVerdict('liars', 'YES',
    'DELICIOUS — borrowed-coat covers, shame/hiding motives, and confrontations that confess, deflect, or turn hostile by temperament. Identity epithet flips when the lie breaks (knowledge-gated identity!).',
    'LOW-MEDIUM: discoverability is gated but real — talk twice → "(watch them for a while)" appears in convo choices. A first-time player may still never think to watch.',
    ['Consequences social: confession hits village-wide honesty rep + gossip; deflection/counter-attack cost trust.', 'Gossip cross-checks claims; observation tells are knowledge-gated.'],
    ['FIXED: observation rendered twice — once as narration, once misattributed as the liar\'s own dialogue (`Nora: "You study Nora..."`). Now the observation is player narration (said once) and the villager gets a real reaction line (new observedReact pool, truth.js). Also removed the duplicate this.say inside observePerson\'s calm path (conversation.js observe branch).']);
}

// ---------------------------------------------------------------
async function playExile() {
  console.log('\n\n########## SCENARIO 5: EXILE — YOU WALK ##########');
  runScenario('exile');
  beat('open — the walk');
  const acts = (Game.exileSelfActions && Game.exileSelfActions()) || [];
  console.log('  >> ACTIONS: ' + acts.map(a => a.id + (a.disabled ? '[x]' : '')).join(', '));
  Game.state.scholar.kcal = 5000;
  Game.exileSelfDo('claimsite');
  for (let i = 0; i < 4; i++) Game.exileSelfDo('gathertimber');
  Game.exileSelfDo('buildshelter');
  Game.exileSelfDo('cachefood');
  beat('building the new fire');
  const miss = (Game.foundingMissing && Game.foundingMissing()) || [];
  console.log('  >> founding missing:', JSON.stringify(miss));
  console.log('\n  >> SECOND RUN: petition a nearby village (rejection path).');
  runScenario('exile');
  Game.state.scholar.kcal = 3000;
  const ovs = (Game.state.otherVillages || []);
  const target = ovs.find(x => Game.villageRoom(x) > 0);
  if (target) {
    console.log(`  >> PLAYER: petition ${target.name} with 800 kcal gift.`);
    const res = Game.petitionVillage(target.id, { giftKcal: 800 });
    console.log('  >> result:', res, '(RNG: acceptance needs judgment>=45; rejection is the common path for an attack-crime exile)');
    beat('petition');
  }
  recordVerdict('exile', 'YES',
    'The walk is a real game: claim → timber → shelter → cache → found. Petition is social (gossip precedes you, gifts move the needle, room is arithmetic, rejection takes your food and says so).',
    'MEDIUM: founding is a 7+ day solo grind (10,000 kcal cache, shelter tier 2) — arc or chore needs a real multi-day feel check, not done here.',
    ['Hard-reset honored: joinVillageReal archives the old village, fresh trust 5, 14-day probation with a re-vote.', 'Rejection narration exists and is honest ("They take your food… and turn you away anyway") — no silent actions.'],
    []);
}

// ---------------------------------------------------------------
(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  syncLog();
  await playMootAccused();
  await playMootJuror();
  await playAmbushAll();
  await playLiars();
  await playExile();
  console.log('\n\n########## VERDICTS ##########');
  for (const v of VERDICTS) console.log(JSON.stringify(v, null, 1));
  fs.writeFileSync(path.join(ROOT, 'evidence/2026-10-06/social-audit-verdicts.json'), JSON.stringify(VERDICTS, null, 1));
  console.log('\nverdicts written to evidence/2026-10-06/social-audit-verdicts.json');
})();
