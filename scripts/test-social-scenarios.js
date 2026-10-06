// Social scenario regression tests. Usage: node scripts/test-social-scenarios.js
// Plays each Justice & Social debug scenario like a player and asserts it
// reaches a completable, non-stuck state (Steve's bar: a scenario that runs
// but leaves the player stuck is NOT done).
// Bug class covered: stale plot state after ambush resolution
// (ambushAftermath left plot.resolved=false, plot.state='confront').
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();

  // --- mootAccused: defense -> moot -> verdict, never stuck open ---
  Game.debugScenario('mootAccused');
  let c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'accused' && (x.status === 'open' || x.status === 'dormant'));
  ok('mootAccused: case opened', !!c);
  if (c) {
    const acts = (Game.caseDossierActions(c) || []).map(a => a.id);
    ok('mootAccused: dossier offers defense verbs', acts.includes('speak') && acts.includes('pressaccuser') && acts.includes('demandmoot') && acts.includes('flee'));
    Game.defendSpeak(c.id); Game.defendPressAccuser(c.id); Game.investigateBribery(c.id);
    Game.demandMoot(c.id);
    ok('mootAccused: moot resolves the case', c.status !== 'open' && c.status !== 'dormant');
  }

  // --- mootJuror: detective work -> moot -> vote -> verdict ---
  Game.debugScenario('mootJuror');
  c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror' && x.status === 'open');
  ok('mootJuror: case opened and known', !!c && !!c.knownToPlayer);
  if (c) {
    ok('mootJuror: cover story seeded', !!c.coverStory);
    Game.examineAmbushSite(c.id); Game.nameWitnesses(c.id);
    for (const a of c.accused) Game.pressAccomplice(c.id, a);
    ok('mootJuror: pressing finds inconsistencies', (c.inconsistencies || []).some(i => i.found));
    Game.callMoot(c.id);
    if (c.trial && c.trial.awaitingPlayerVote) {
      const vr = Game.castPlayerVote(c.id, false);
      ok('mootJuror: player vote counted', !!vr);
    }
    ok('mootJuror: moot reaches verdict', c.status !== 'open' && c.status !== 'dormant');
  }

  // --- ambush: RUN/TALK/FIGHT -> aftermath -> case, plot state cleaned ---
  Game.debugScenario('ambush');
  const plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  ok('ambush: sprung on the player', !!plot);
  if (plot) {
    const convo = Game.convoGet(plot.leader);
    ok('ambush: convo thread opened', !!convo && convo.thread === 'ambush');
    let res = Game.ambushExchange(plot, 'talk');
    ok('ambush: talk stalls', !!res && !!res.continue);
    let rounds = 0;
    res = Game.ambushExchange(plot, 'talk');
    while (res && res.continue && rounds < 6) { res = Game.ambushExchange(plot, 'run'); rounds++; }
    ok('ambush: exchange resolves', !res || !res.continue);
    ok('ambush: plot marked resolved', plot.resolved === true);
    ok('ambush: plot confrontation state cleared', plot.state !== 'confront');
    const ac = (Game.betrayalState().cases || []).find(x => x.plotId === plot.id);
    ok('ambush: aftermath case opened', !!ac);
  }

  // --- liars: contradictions are catchable via watch + gossip ---
  Game.debugScenario('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId).slice(0, 5);
  const lied = roster.filter(rid => { const vp = Game.vpOf(rid); return vp.lies && vp.lies.occupation && vp.lies.occupation.told !== vp.lies.occupation.truth; });
  ok('liars: five liars seeded', lied.length === 5);
  let slips = 0;
  for (const rid of lied) {
    const before = (Game.getDoubts(rid, true) || []).length;
    for (let t = 0; t < 6; t++) { try { if (Game.observePerson) Game.observePerson(rid); } catch (e) {} }
    if ((Game.getDoubts(rid, true) || []).length > before) slips++;
  }
  ok('liars: watching surfaces slip doubts', slips > 0);

  // --- exile: exiled -> petition / found / drift all viable ---
  Game.debugScenario('exile');
  const s = Game.state.scholar;
  ok('exile: exiled flags set', !!s.exiled && !!Game.justiceState().exiled);
  ok('exile: petition targets exist', (Game.state.otherVillages || []).length > 0);
  const fh = Game.foundHaven();
  ok('exile: found-haven works', !!fh && s.exiled === false);
  Game.debugScenario('exile'); // fresh exile for the drift path
  const d = Game.drift();
  ok('exile: drift works', d === true && Game.state.scholar.drifting === true);

  console.log(`\ntest-social-scenarios: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
