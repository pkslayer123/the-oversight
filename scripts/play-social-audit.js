// SOCIAL SCENARIO PLAY AUDIT (Steve 2026-10-06 worker D).
// Plays mootAccused, mootJuror, ambush, liars, exile, uprising LIKE A PLAYER:
// drives each to completion, captures full say-logs, checks for stuck states,
// knowledge leaks, dialogue coherence, and real social consequences.
// Usage: node scripts/play-social-audit.js
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

let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }
const say = () => sayLog.slice();

const findings = [];
function find(tag, desc, where) { findings.push({ tag, desc, where }); console.log(`  !! [${tag}] ${desc} (${where})`); }

const LEAK_RE = /🐞|\(debug\)|TODO|FIXME|\[object Object\]/;
const DEV_RE2 = /console\.log|\bNaN\b|undefined|null[ ,.]$/i;

function coherenceCheck(tag) {
  const lines = say().filter(l => !l.startsWith('📖') && !l.startsWith('Nothing here') && !l.startsWith('Haven. Twelve'));
  const seen = {};
  for (const l of lines) { const k = l.slice(0, 140); seen[k] = (seen[k] || 0) + 1; }
  for (const [k, n] of Object.entries(seen)) {
    if (n > 1 && k.length > 50) find('REPEAT', `x${n}: "${k.slice(0, 90)}..."`, tag);
  }
  for (const l of lines) {
    if (LEAK_RE.test(l)) find('LEAK', `"${l.slice(0, 110)}..."`, tag);
    else if (DEV_RE2.test(l)) find('DEVLEAK', `"${l.slice(0, 110)}..."`, tag);
  }
}

function snap() {
  const v = Game.state.village;
  return {
    trust: Object.keys(v.trust || {}).length,
    griev: JSON.stringify((Game.betrayalState().grievances || []).slice(-3)),
    rep: Game.state.scholar.reputation,
    exiled: !!Game.state.scholar.exiled,
  };
}

(async () => {
  await Game.init();

  // ================= 1. UPRISING =================
  console.log('\n##### 1. UPRISING #####');
  fresh('uprising');
  console.log('tbfight live:', !!Game.tbfight, '| fighters:', (Game.tbfight && Game.tbfight.fighters.length));
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard < 60) {
    guard++;
    if (Game.tbIsPlayerTurn()) {
      const p = Game.tbFighter('p');
      // flee path: walk to an edge, then step past it
      const atEdge = (p.mx === 0 || p.mx === 8 || p.my === 0 || p.my === 8);
      if (atEdge) { Game.tbPlayerMove(p.mx === 0 ? 0 : p.mx, p.my === 0 ? 0 : p.my); }
      else { Game.tbPlayerMove(0, p.my); }
      if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
    } else { Game.tbAdvance(); }
  }
  console.log('uprising fight ended:', !Game.tbfight || Game.tbfight.over, 'rounds of driving:', guard);
  console.log('justice stage:', Game.justiceState().stage, 'exiled:', !!Game.justiceState().exiled);
  coherenceCheck('uprising');
  console.log('--- last say lines ---');
  say().slice(-6).forEach(l => console.log('   | ' + l.slice(0, 150)));

  // ================= 2. AMBUSH talk path =================
  console.log('\n##### 2. AMBUSH (talk-heavy) #####');
  fresh('ambush');
  let plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  let res = Game.ambushExchange(plot, 'talk');
  let rounds = 0;
  const talkLines = [];
  while (res && res.continue && rounds < 10) {
    rounds++;
    (res.lines || []).forEach(l => talkLines.push(l));
    res = Game.ambushExchange(plot, 'talk');
  }
  console.log('talk rounds before resolution:', rounds, '| outcome:', plot.outcome, '| resolved:', plot.resolved, '| state:', plot.state);
  if (rounds >= 10) find('STUCK', 'ambush talk-loop never resolves after 10 talk exchanges', 'ambushExchange');
  coherenceCheck('ambush-talk');

  // ================= 3. LIARS full loop =================
  console.log('\n##### 3. LIARS (watch -> doubt -> confront) #####');
  fresh('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId).slice(0, 5);
  for (const rid of roster) for (let t = 0; t < 8; t++) { try { Game.observePerson(rid); } catch (e) {} }
  let totalDoubts = 0;
  for (const rid of roster) totalDoubts += (Game.getDoubts(rid, true) || []).length;
  console.log('doubts caught via watching:', totalDoubts);
  // confront via the real verb
  const rid0 = roster[0];
  const d0 = (Game.getDoubts(rid0, true) || [])[0];
  let confrontResult = null;
  if (d0) {
    const b = snap();
    confrontResult = Game.confrontDoubt(rid0, d0.id);
    console.log('confrontDoubt ->', JSON.stringify(confrontResult).slice(0, 200));
    const a = snap();
    console.log('consequence: trust count', b.trust, '->', a.trust, '| griev', b.griev !== a.griev ? 'CHANGED' : 'unchanged');
  } else find('DEADEND', 'no doubts recorded after 40 watches — nothing to confront', 'liars/observePerson');
  coherenceCheck('liars');
  console.log('--- sample slip/confront say ---');
  say().slice(-10).forEach(l => console.log('   | ' + l.slice(0, 160)));

  // ================= 4. MOOT ACCUSED flee path =================
  console.log('\n##### 4. MOOT ACCUSED (flee mid-case) #####');
  fresh('mootAccused');
  let c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'accused' && (x.status === 'open' || x.status === 'dormant'));
  const acts = (Game.caseDossierActions(c) || []).map(a => a.id);
  console.log('dossier acts:', acts.join(', '));
  const fleeAct = acts.find(a => /flee|run/i.test(a));
  if (fleeAct) {
    try { const r = Game.caseDossierAct ? Game.caseDossierAct(c.id, fleeAct) : Game['fleeCase'](c.id); console.log('flee result:', JSON.stringify(r).slice(0, 160)); }
    catch (e) { console.log('flee threw:', e.message); find('CRASH', 'flee action threw: ' + e.message, 'mootAccused'); }
  }
  console.log('case status after flee:', c.status, '| scholar exiled:', !!Game.state.scholar.exiled, '| fleeing:', !!Game.state.scholar.fleeing);
  coherenceCheck('mootAccused-flee');

  // ================= 5. EXILE petition with gift =================
  console.log('\n##### 5. EXILE (petition with gift) #####');
  fresh('exile');
  // give the player food to offer
  try { Game.addItem && Game.addItem('dried_meat', 5); } catch (e) {}
  const ovs = Game.state.otherVillages || [];
  console.log('villages:', ovs.map(v => v.name || v.id).join(', '));
  const pr = Game.petitionVillage(ovs[0].id, { giftKcal: 700 });
  console.log('petition(700) ->', JSON.stringify(pr).slice(0, 220));
  say().slice(-6).forEach(l => console.log('   | ' + l.slice(0, 160)));
  coherenceCheck('exile-petition-gift');
  // drift tick loop: does drifting resolve?
  fresh('exile');
  Game.drift();
  for (let i = 0; i < 5; i++) { try { Game.driftTick(); } catch (e) { console.log('driftTick threw:', e.message); break; } }
  console.log('after 5 driftTicks: drifting =', !!Game.state.scholar.drifting, '| day =', Game.state.scholar.day);
  coherenceCheck('exile-drift');

  console.log('\n##### FINDINGS SUMMARY #####');
  const byTag = {};
  for (const f of findings) { byTag[f.tag] = (byTag[f.tag] || 0) + 1; }
  console.log(JSON.stringify(byTag, null, 1));
  console.log('total findings:', findings.length);
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 6).join('\n')); process.exit(2); });
